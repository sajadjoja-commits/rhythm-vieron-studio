/**
 * Local Whisper Transcription Web Worker using Transformers.js
 * Runs offline-capable Whisper automatic speech recognition with timestamps.
 * 
 * - Android-native path: Loads bundled whisper-base from /models/whisper-base/ (offline, no network)
 * - Web/PWA path: Falls back to fetching Xenova/whisper-tiny with mirror fallback and local CacheStorage
 */

import { pipeline, env } from "@xenova/transformers";

// Configure Transformers.js environment for local & offline execution
env.allowLocalModels = true;
env.allowRemoteModels = false;

// Direct WASM binaries to local app assets to prevent unpkg/external CDN failures
if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
  env.backends.onnx.wasm.wasmPaths = `${location.origin}/wasm/ort/`;
} else {
  env.backends.onnx.wasm.wasmPaths = "/wasm/ort/";
}
env.backends.onnx.wasm.numThreads = 1;

env.localModelPath = "/models/";

// Cached pipeline singleton to avoid repeated model loading
let cachedTranscriber: any = null;
let cachedModelId = "";

export interface WhisperWorkerRequest {
  id: string;
  audioData: Float32Array;
  language?: string;
  isAndroidNative?: boolean;
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
  }>;
  modelUsed: string;
  isLocal: boolean;
}

export interface WhisperWorkerError {
  type: "error";
  id: string;
  error: string;
}

export type WhisperWorkerResponse =
  | WhisperWorkerProgress
  | WhisperWorkerComplete
  | WhisperWorkerError;

/**
 * Check if a local model exists and determine its base path
 */
async function checkLocalModelExists(modelDir: string): Promise<{ exists: boolean; localPath: string }> {
  const origin = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "";
  const candidateBases = [
    "/models/",
    origin ? `${origin}/models/` : "",
    "models/",
    "/assets/models/",
  ].filter(Boolean);

  for (const base of candidateBases) {
    try {
      const url = `${base}${modelDir}/config.json`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      // If server returned index.html or not ok, it is NOT a valid model JSON
      if (res.ok && !contentType.includes("text/html")) {
        const text = await res.text();
        if (text.trim().startsWith("{")) {
          const json = JSON.parse(text);
          if (json && (json.model_type || json._name_or_path || json.architectures)) {
            return { exists: true, localPath: base.startsWith("http") ? "/models/" : base };
          }
        }
      }
    } catch {
      // Continue to next candidate path
    }
  }
  return { exists: false, localPath: "/models/" };
}

/**
 * Initialize or retrieve the Whisper pipeline instance
 */
async function getTranscriber(
  id: string,
  isAndroidNative = false,
  preferredModel?: string
): Promise<{ transcriber: any; modelId: string; isLocal: boolean }> {
  if (cachedTranscriber) {
    return { transcriber: cachedTranscriber, modelId: cachedModelId, isLocal: true };
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

  // 1. Try bundled local model paths first (whisper-base, whisper-tiny, Xenova/whisper-tiny)
  const candidateModels = Array.from(new Set([
    preferredModel,
    "whisper-base",
    "whisper-tiny",
    "Xenova/whisper-tiny",
  ])).filter(Boolean) as string[];

  for (const modelCandidate of candidateModels) {
    const localCheck = await checkLocalModelExists(modelCandidate);

    if (localCheck.exists) {
      postProgress(15, "تحميل نموذج Whisper المحلي المرفق (بدون إنترنت)...");

      try {
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        env.localModelPath = localCheck.localPath;

        const transcriber = await pipeline("automatic-speech-recognition", modelCandidate, {
          progress_callback: (info: any) => {
            if (info.status === "progress" && info.total) {
              const pct = Math.min(95, Math.round((info.loaded / info.total) * 100));
              postProgress(pct, `تحميل النموذج المدمج (${modelCandidate}): ${pct}%`);
            }
          },
        });

        cachedTranscriber = transcriber;
        cachedModelId = modelCandidate;
        return { transcriber, modelId: modelCandidate, isLocal: true };
      } catch (localErr) {
        console.warn(`[WhisperWorker] Failed to load local ${modelCandidate}, trying next candidate:`, localErr);
      }
    }
  }

  // 2. Fallback to remote if local was not found or failed
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = "https://huggingface.co/";
  env.remotePathTemplate = "{model}/resolve/{revision}/";

  const targetModel = preferredModel || "Xenova/whisper-tiny";
  postProgress(20, "جارٍ تجهيز نموذج Whisper الذكي...");

  try {
    const transcriber = await pipeline("automatic-speech-recognition", targetModel, {
      progress_callback: (info: any) => {
        if (info.status === "progress" && info.total) {
          const pct = Math.min(95, Math.round((info.loaded / info.total) * 100));
          postProgress(pct, `تجهيز نموذج Whisper: ${pct}%`);
        }
      },
    });

    cachedTranscriber = transcriber;
    cachedModelId = targetModel;
    return { transcriber, modelId: targetModel, isLocal: false };
  } catch (hfErr) {
    console.warn("[WhisperWorker] Primary Hugging Face host failed, trying mirror fallback...", hfErr);
    // Mirror fallback
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.remoteHost = "https://hf-mirror.com/";
    postProgress(25, "الاتصال بمرآة نموذج Whisper البديلة...");

    const transcriber = await pipeline("automatic-speech-recognition", targetModel, {
      progress_callback: (info: any) => {
        if (info.status === "progress" && info.total) {
          const pct = Math.min(95, Math.round((info.loaded / info.total) * 100));
          postProgress(pct, `تنزيل النموذج عبر المرآة: ${pct}%`);
        }
      },
    });

    cachedTranscriber = transcriber;
    cachedModelId = targetModel;
    return { transcriber, modelId: targetModel, isLocal: false };
  }
}

self.onmessage = async (e: MessageEvent<WhisperWorkerRequest>) => {
  const req = e.data;
  if (!req || !req.id) return;

  const { id, audioData, language, isAndroidNative, preferredModel } = req;

  try {
    if (!audioData || audioData.length === 0) {
      throw new Error("No audio data provided to transcription worker");
    }

    // 1. Initialize speech recognition pipeline
    const { transcriber, modelId, isLocal } = await getTranscriber(
      id,
      Boolean(isAndroidNative),
      preferredModel
    );

    // 2. Report transcribing phase
    self.postMessage({
      type: "progress",
      id,
      phase: "transcribing",
      progress: 35,
      message: "جارٍ استخراج وتفريغ الكلام محلياً...",
    } as WhisperWorkerProgress);

    const langCode =
      !language || language === "auto"
        ? undefined
        : language === "arabic"
        ? "ar"
        : language;

    // 3. Execute automatic speech recognition with chunking & timestamps
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
      message: "معالجة النصوص وضبط التوقيتات...",
    } as WhisperWorkerProgress);

    // 4. Format chunks into structured segments
    let segments: Array<{ start: number; end: number; text: string }> = [];

    if (output && Array.isArray(output.chunks) && output.chunks.length > 0) {
      segments = output.chunks
        .map((c: any) => {
          const start = Array.isArray(c.timestamp) ? Number(c.timestamp[0]) || 0 : 0;
          const end = Array.isArray(c.timestamp)
            ? Number(c.timestamp[1]) || start + 2
            : start + 2;
          return {
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            text: String(c.text || "").trim(),
          };
        })
        .filter((s: any) => s.text.length > 0);
    } else if (output && typeof output.text === "string" && output.text.trim()) {
      const audioDuration = Math.round((audioData.length / 16000) * 100) / 100;
      segments = [
        {
          start: 0,
          end: Math.max(0.5, audioDuration),
          text: output.text.trim(),
        },
      ];
    }

    self.postMessage({
      type: "complete",
      id,
      segments,
      modelUsed: modelId,
      isLocal,
    } as WhisperWorkerComplete);
  } catch (err: any) {
    console.error("[WhisperWorker] Transcription error:", err);
    self.postMessage({
      type: "error",
      id,
      error: err?.message || "فشلت عملية استخراج الكلام المحلية عبر Whisper",
    } as WhisperWorkerError);
  }
};
