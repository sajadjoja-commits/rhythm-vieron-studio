/**
 * Local Whisper Transcription Engine
 * Runs completely client-side / on-device via Transformers.js and WebAssembly.
 * 
 * - Zero dependency on cloud APIs or Groq keys
 * - Android Native: loads local bundled whisper-base from assets
 * - Web/PWA: loads Xenova/whisper-tiny with mirror fallback and browser CacheStorage
 */

import { Capacitor } from "@capacitor/core";
import { correctArabicText } from "@/lib/arabicSpellCheck";
import type {
  WhisperWorkerRequest,
  WhisperWorkerResponse,
} from "./whisper-worker";

export interface TranscribedSegment {
  start: number;
  end: number;
  text: string;
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
  onProgress?: (progress: LocalTranscribeProgress) => void;
}

let workerInstance: Worker | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: (segments: TranscribedSegment[]) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: LocalTranscribeProgress) => void;
    language?: string;
    startTimeOffset: number;
  }
>();

/**
 * Extract 16kHz mono Float32Array from a media File or Blob
 */
export async function extractAudioSamples16k(
  file: File | Blob,
  startTime?: number,
  endTime?: number
): Promise<{ audioData: Float32Array; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
  });
  ctx.close?.();

  const totalDuration = audioBuffer.duration;
  const startSec = Math.max(0, startTime ?? 0);
  const endSec = Math.min(totalDuration, endTime ?? totalDuration);
  const segmentDuration = Math.max(0.1, endSec - startSec);

  const targetSampleRate = 16000;
  const length = Math.ceil(segmentDuration * targetSampleRate);

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  const offline = new OfflineCtx(1, length, targetSampleRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0, startSec, segmentDuration);

  const rendered: AudioBuffer = await offline.startRendering();
  const channelData = rendered.getChannelData(0);

  // Return a copy Float32Array safe for Transferable posting
  const audioData = new Float32Array(channelData);

  return { audioData, duration: segmentDuration };
}

/**
 * Get or initialize the persistent Whisper Web Worker
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

        let finalSegments: TranscribedSegment[] = data.segments.map((s) => ({
          start: Math.round((s.start + req.startTimeOffset) * 100) / 100,
          end: Math.round((s.end + req.startTimeOffset) * 100) / 100,
          text: s.text.trim(),
        }));

        // Apply Arabic grammatical, diacritical, and spelling corrections
        const isArabic =
          !req.language ||
          req.language === "auto" ||
          req.language === "ar" ||
          req.language === "arabic";

        if (isArabic) {
          finalSegments = finalSegments.map((seg) => ({
            ...seg,
            text: correctArabicText(seg.text),
          }));
        }

        req.resolve(finalSegments);
      } else if (data.type === "error") {
        pendingRequests.delete(data.id);
        req.reject(new Error(data.error || "Local Whisper transcription error"));
      }
    };

    workerInstance.onerror = (err) => {
      console.error("[LocalTranscribe] Worker error event:", err);
      // Fail all pending
      for (const [id, req] of pendingRequests.entries()) {
        pendingRequests.delete(id);
        req.reject(new Error("Whisper worker encountered an unexpected execution error."));
      }
      workerInstance?.terminate();
      workerInstance = null;
    };
  }

  return workerInstance;
}

/**
 * Transcribe speech locally using Whisper AI (Float32Array, File, or Blob)
 */
export async function transcribeLocally(
  source: File | Blob | Float32Array,
  options: LocalTranscribeOptions = {}
): Promise<TranscribedSegment[]> {
  const isAndroidNative =
    Capacitor.isNativePlatform() || Capacitor.getPlatform() === "android";

  options.onProgress?.({
    phase: "preparing-audio",
    progress: 5,
    message: isAndroidNative
      ? "تجهيز مقطع الصوت محلياً (بدون إنترنت)..."
      : "تجهيز مقطع الصوت للتعرف المحلي...",
  });

  let audioData: Float32Array;
  const startTimeOffset = options.startTime || 0;

  if (source instanceof Float32Array) {
    audioData = source;
  } else {
    const extracted = await extractAudioSamples16k(
      source,
      options.startTime,
      options.endTime
    );
    audioData = extracted.audioData;
  }

  const id = `transcribe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const worker = getWorker();

  return new Promise<TranscribedSegment[]>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve,
      reject,
      onProgress: options.onProgress,
      language: options.language,
      startTimeOffset,
    });

    const request: WhisperWorkerRequest = {
      id,
      audioData,
      language: options.language,
      isAndroidNative,
      preferredModel: options.preferredModel,
    };

    // Transfer Float32Array buffer to avoid memory duplication
    worker.postMessage(request, [audioData.buffer]);
  });
}
