/**
 * Local Speech-to-Text Transcription Engine
 * 100% Offline, on-device execution using bundled local ONNX models.
 * 
 * - Zero external API keys or cloud calls
 * - Zero remote downloads (Hugging Face / mirrors strictly disabled)
 * - Safe fingerprint caching with IndexedDB
 * - Non-destructive Arabic processing and boundary alignment
 * - Accurate timeline offset mapping
 */

import { conditionAudioData, extractAudioFromUrlOrBlob } from "@/lib/captionAudioEngine";
import { processRawSegments, ProcessedCaptionSegment } from "@/lib/captionTextProcessor";
import {
  computeAudioFingerprint,
  getCachedTranscript,
  setCachedTranscript,
} from "@/lib/captionCache";
import type {
  WhisperWorkerRequest,
  WhisperWorkerResponse,
} from "./whisper-worker";

export interface TranscribedSegment {
  id?: string;
  start: number;
  end: number;
  text: string;
  rawText?: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface LocalTranscribeProgress {
  phase: "preparing-audio" | "loading-model" | "transcribing" | "post-processing";
  progress: number;
  message: string;
}

export interface LocalTranscribeOptions {
  language?: string;
  startTime?: number;
  endTime?: number;
  preferredModel?: string;
  signal?: AbortSignal;
  onProgress?: (progress: LocalTranscribeProgress) => void;
}

export interface TranscriptionDiagnostics {
  modelId: string;
  durationSec: number;
  rms: number;
  peak: number;
  cached: boolean;
  totalTimeMs: number;
}

let workerInstance: Worker | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: (segments: TranscribedSegment[]) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: LocalTranscribeProgress) => void;
    startTimeOffset: number;
    audioDuration: number;
    audioData: Float32Array;
    fingerprint: string;
    language?: string;
    preferredModel?: string;
  }
>();

/**
 * Get or initialize the persistent Web Worker
 */
function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("./whisper-worker.ts", import.meta.url),
      { type: "module" }
    );

    workerInstance.onmessage = (e: MessageEvent<WhisperWorkerResponse>) => {
      const data = e.data;
      if (!data || !data.id) return;

      const req = pendingRequests.get(data.id);
      if (!req) return;

      if (data.type === "progress") {
        req.onProgress?.({
          phase: data.phase,
          progress: data.progress,
          message: data.message,
        });
      } else if (data.type === "complete") {
        pendingRequests.delete(data.id);

        // Apply safe, non-destructive text post-processing and boundary alignment
        const processed = processRawSegments(
          data.segments,
          [],
          req.startTimeOffset
        );

        const finalSegments: TranscribedSegment[] = processed.map((p) => ({
          id: p.id,
          start: p.start,
          end: p.end,
          text: p.text,
          rawText: p.rawText,
        }));

        // Cache the successful transcript securely with multi-dimensional fingerprint
        setCachedTranscript({
          fingerprint: req.fingerprint,
          timestamp: Date.now(),
          audioDuration: req.audioDuration,
          language: req.language,
          modelId: data.modelUsed,
          segments: finalSegments.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
            rawText: s.rawText,
          })),
        });

        req.resolve(finalSegments);
      } else if (data.type === "error") {
        pendingRequests.delete(data.id);
        const err = new Error(data.error || "فشلت عملية استخراج وتفريغ الكلام محلياً");
        (err as any).code = data.code;
        (err as any).technicalDetails = data.technicalDetails;
        req.reject(err);
      }
    };

    workerInstance.onerror = (err) => {
      console.error("[LocalTranscribe] Web Worker encountered fatal error:", err);
      for (const [, req] of pendingRequests.entries()) {
        req.reject(new Error("Caption model is not available on this device."));
      }
      pendingRequests.clear();
      workerInstance?.terminate();
      workerInstance = null;
    };
  }

  return workerInstance;
}

/**
 * Transcribe speech locally using on-device Speech-to-Text
 */
export async function transcribeLocally(
  source: File | Blob | Float32Array | string,
  options: LocalTranscribeOptions = {}
): Promise<TranscribedSegment[]> {
  // Check abort signal
  if (options.signal?.aborted) {
    throw new Error("Transcription was cancelled");
  }

  options.onProgress?.({
    phase: "preparing-audio",
    progress: 10,
    message: "تجهيز مقطع الصوت للتعرف على الكلام...",
  });

  let audioData: Float32Array;
  let audioDuration = 0;
  const startTimeOffset = options.startTime || 0;

  if (source instanceof Float32Array) {
    const { conditioned, rms, isSilent } = conditionAudioData(source, 16000);
    if (isSilent || conditioned.length === 0) {
      return [];
    }
    audioData = conditioned;
    audioDuration = audioData.length / 16000;
  } else {
    const result = await extractAudioFromUrlOrBlob(source, {
      startSec: options.startTime,
      durationSec:
        options.endTime !== undefined && options.startTime !== undefined
          ? Math.max(0.1, options.endTime - options.startTime)
          : undefined,
    });

    if (!result.hasAudio || result.audioData.length === 0) {
      if (result.reason === "no_source") {
        throw new Error("No audio source was found for captions.");
      }
      return [];
    }

    audioData = result.audioData;
    audioDuration = result.duration;
  }

  // 1. Verify Cache
  const fingerprint = computeAudioFingerprint(audioData, audioDuration, {
    startTime: options.startTime,
    endTime: options.endTime,
    language: options.language,
    modelId: options.preferredModel || "local-whisper-tiny",
  });

  const cached = await getCachedTranscript(fingerprint);
  if (cached && cached.length > 0) {
    options.onProgress?.({
      phase: "post-processing",
      progress: 100,
      message: "تم استرجاع الكابشن من الذاكرة المحلية بنجاح",
    });
    return cached.map((c) => ({
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      start: c.start,
      end: c.end,
      text: c.text,
      rawText: c.rawText,
    }));
  }

  // 2. Dispatch to Local Web Worker
  const id = `transcribe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const worker = getWorker();

  return new Promise<TranscribedSegment[]>((resolve, reject) => {
    // Handle cancellation
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        pendingRequests.delete(id);
        reject(new Error("Transcription was cancelled"));
      });
    }

    pendingRequests.set(id, {
      resolve,
      reject,
      onProgress: options.onProgress,
      startTimeOffset,
      audioDuration,
      audioData,
      fingerprint,
      language: options.language,
      preferredModel: options.preferredModel,
    });

    const request: WhisperWorkerRequest = {
      id,
      audioData,
      language: options.language,
      preferredModel: options.preferredModel,
    };

    // Transfer Float32Array buffer to avoid cloning memory
    worker.postMessage(request, [audioData.buffer]);
  });
}
