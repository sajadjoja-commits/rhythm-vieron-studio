/**
 * 100% Offline, Local Speech Recognition Web Worker
 * Strictly executes bundled local ONNX models without remote calls or external fallbacks.
 * 
 * - Zero external network calls (env.allowRemoteModels = false)
 * - Zero remote fallbacks (no Hugging Face, no mirror, no mock data)
 * - Bundled ONNX runtime execution
 * - Clean user messages (no library or vendor names exposed)
 */

import { pipeline, env } from "@xenova/transformers";

// 1. Strict offline environment configuration
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = true;

// Direct WASM binaries strictly to local app assets
const origin =
  typeof self !== "undefined" && self.location && self.location.origin && self.location.origin !== "null"
    ? self.location.origin
    : "";

env.backends.onnx.wasm.wasmPaths = origin ? `${origin}/wasm/ort/` : "/wasm/ort/";

// Configure threads based on device concurrency (safe limit 1-2 for mobile/browser stability)
const hardwareThreads = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(2, Math.floor(hardwareThreads / 2) || 1));

env.localModelPath = "/models/";

// Cached pipeline singleton to avoid reloading weights for subsequent requests
let cachedTranscriber: any = null;
let cachedModelId = "";

export interface WhisperWorkerRequest {
  id: string;
  audioData: Float32Array;
  language?: string;
  preferredModel?: string;
}

export interface WhisperWorkerProgress {
  type: "progress";
  id: string;
  phase: "loading-model" | "transcribing" | "post-processing";
  progress: number;
  message: string;
}

export interface WhisperWorkerComplete {
  type: "complete";
  id: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{ word: string; start: number; end: number }>;
  }>;
  modelUsed: string;
  isLocal: boolean;
}

export interface WhisperWorkerError {
  type: "error";
  id: string;
  error: string;
  code?: "model_missing" | "model_invalid" | "inference_failed" | "no_audio";
  technicalDetails?: string;
}

export type WhisperWorkerResponse =
  | WhisperWorkerProgress
  | WhisperWorkerComplete
  | WhisperWorkerError;

/**
 * Verify that a local model folder exists and contains valid config JSON.
 */
async function verifyLocalModelDir(modelDir: string): Promise<{ valid: boolean; basePath: string; error?: string }> {
  const candidateBases = [
    "/models/",
    origin ? `${origin}/models/` : "",
    "models/",
  ].filter(Boolean);

  for (const base of candidateBases) {
    try {
      const configUrl = `${base}${modelDir}/config.json`;
      const res = await fetch(configUrl, { method: "GET", cache: "no-store" });
      const contentType = (res.headers.get("content-type") || "").toLowerCase();

      // Guard against SPA fallback serving index.html
      if (res.ok && !contentType.includes("text/html")) {
        const text = await res.text();
        if (text.trim().startsWith("{")) {
          const json = JSON.parse(text);
          if (json && (json.model_type || json._name_or_path || json.architectures)) {
            return { valid: true, basePath: base.startsWith("http") ? "/models/" : base };
          }
        }
      }
    } catch (err: any) {
      // Continue checking next candidate base path
    }
  }

  return { valid: false, basePath: "/models/", error: `Local model '${modelDir}' not found on device.` };
}

/**
 * Initialize or retrieve the local pipeline instance without any remote download.
 */
async function getLocalTranscriber(
  id: string,
  preferredModel?: string
): Promise<{ transcriber: any; modelId: string }> {
  if (cachedTranscriber) {
    return { transcriber: cachedTranscriber, modelId: cachedModelId };
  }

  const postProgress = (pct: number, msg: string) => {
    self.postMessage({
      type: "progress",
      id,
      phase: "loading-model",
      progress: pct,
      message: msg,
    } as WhisperWorkerProgress);
  };

  postProgress(10, "جارٍ تجهيز محرك التعرف على الكلام المحلي...");

  // Candidates for local model bundled inside the application
  const candidateModels = Array.from(
    new Set([preferredModel, "whisper-tiny", "Xenova/whisper-tiny", "whisper-base"])
  ).filter(Boolean) as string[];

  let loadedTranscriber: any = null;
  let activeModelId = "";
  let lastFailureReason = "";

  for (const modelCandidate of candidateModels) {
    const check = await verifyLocalModelDir(modelCandidate);
    if (!check.valid) {
      lastFailureReason = check.error || `Model ${modelCandidate} directory missing`;
      continue;
    }

    try {
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = check.basePath;

      postProgress(25, "جارٍ تحميل النموذج من الذاكرة المحلية...");

      const transcriber = await pipeline("automatic-speech-recognition", modelCandidate, {
        quantized: true,
        progress_callback: (info: any) => {
          if (info.status === "progress" && info.total) {
            const pct = Math.min(95, Math.round(25 + (info.loaded / info.total) * 60));
            postProgress(pct, `جارٍ تجهيز ملفات النموذج: ${pct}%`);
          }
        },
      });

      loadedTranscriber = transcriber;
      activeModelId = modelCandidate;
      break;
    } catch (err: any) {
      console.warn(`[SpeechWorker] Failed to initialize local model '${modelCandidate}':`, err);
      lastFailureReason = err?.message || String(err);
    }
  }

  if (!loadedTranscriber) {
    const error = new Error("Caption model is not available on this device.");
    (error as any).code = "model_missing";
    (error as any).technicalDetails = lastFailureReason || "No valid local speech model found in /models/";
    throw error;
  }

  cachedTranscriber = loadedTranscriber;
  cachedModelId = activeModelId;
  return { transcriber: cachedTranscriber, modelId: cachedModelId };
}

self.onmessage = async (e: MessageEvent<WhisperWorkerRequest>) => {
  const req = e.data;
  if (!req || !req.id) return;

  const { id, audioData, language, preferredModel } = req;

  try {
    if (!audioData || audioData.length === 0) {
      self.postMessage({
        type: "error",
        id,
        error: "No speech detected in media",
        code: "no_audio",
        technicalDetails: "Audio sample buffer was empty or zero length",
      } as WhisperWorkerError);
      return;
    }

    // 1. Initialize local speech recognition model strictly from local storage
    const { transcriber, modelId } = await getLocalTranscriber(id, preferredModel);

    // 2. Report transcribing phase
    self.postMessage({
      type: "progress",
      id,
      phase: "transcribing",
      progress: 40,
      message: "جارٍ استخراج وتفريغ الكلام بدقة...",
    } as WhisperWorkerProgress);

    const langCode =
      !language || language === "auto"
        ? undefined
        : language === "arabic"
        ? "ar"
        : language;

    // 3. Execute local model inference with timestamps
    const output = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: langCode,
      task: "transcribe",
      return_timestamps: true,
    });

    self.postMessage({
      type: "progress",
      id,
      phase: "post-processing",
      progress: 92,
      message: "تنسيق النصوص وضبط التوقيتات...",
    } as WhisperWorkerProgress);

    // 4. Extract structured segment results
    const segments: Array<{
      start: number;
      end: number;
      text: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }> = [];

    if (output && Array.isArray(output.chunks) && output.chunks.length > 0) {
      for (const c of output.chunks) {
        const start = Array.isArray(c.timestamp) ? Number(c.timestamp[0]) || 0 : 0;
        const end = Array.isArray(c.timestamp)
          ? Number(c.timestamp[1]) || start + 2
          : start + 2;
        const rawText = String(c.text || "").trim();

        if (rawText.length > 0) {
          segments.push({
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            text: rawText,
          });
        }
      }
    } else if (output && typeof output.text === "string" && output.text.trim()) {
      const audioDuration = Math.round((audioData.length / 16000) * 100) / 100;
      segments.push({
        start: 0,
        end: Math.max(0.5, audioDuration),
        text: output.text.trim(),
      });
    }

    self.postMessage({
      type: "complete",
      id,
      segments,
      modelUsed: modelId,
      isLocal: true,
    } as WhisperWorkerComplete);
  } catch (err: any) {
    console.error("[SpeechWorker] Inference failure:", err);

    const isModelMissing =
      err?.code === "model_missing" ||
      (err?.message && err.message.includes("Caption model is not available on this device")) ||
      (err?.message && err.message.includes("env.allowRemoteModels=false"));

    const userErrorMessage = isModelMissing
      ? "Caption model is not available on this device."
      : "فشلت عملية استخراج وتفريغ الكلام محلياً.";

    self.postMessage({
      type: "error",
      id,
      error: userErrorMessage,
      code: isModelMissing ? "model_missing" : "inference_failed",
      technicalDetails: err?.technicalDetails || err?.message || String(err),
    } as WhisperWorkerError);
  }
};
