/**
 * Robust, Unified Audio Extraction & Conditioning Engine for Local Speech-to-Text
 * - Extracts audio from Video, Audio, Media items, and Timeline Clips with trim & speed
 * - Accurately resamples to 16,000 Hz Mono Float32Array using Web Audio OfflineAudioContext
 * - Performs DC offset removal, RMS silence detection, and peak normalization
 * - Tracks exact timeline offset so captions align with video timeline coordinates
 */

import { detectSilenceGaps, SilenceGap } from "./vadUtils";

export interface ExtractedAudioResult {
  hasAudio: boolean;
  reason?: "ok" | "no_source" | "silence" | "decode_error";
  audioData: Float32Array;
  duration: number; // in seconds
  sampleRate: number; // strictly 16000
  timelineStartSec: number; // offset to add to caption timestamps
  timelineEndSec: number;
  silenceGaps: SilenceGap[];
  rms: number;
  peak: number;
}

/**
 * Normalizes Float32 audio samples:
 * - Removes DC bias offset
 * - Computes true RMS energy
 * - Peak normalizes to 0.95 ceiling for optimal Whisper attention
 */
export function conditionAudioData(
  samples: Float32Array,
  sampleRate: number = 16000
): {
  conditioned: Float32Array;
  rms: number;
  peak: number;
  isSilent: boolean;
} {
  const len = samples.length;
  if (len === 0) {
    return { conditioned: samples, rms: 0, peak: 0, isSilent: true };
  }

  // 1. Calculate mean (DC offset) and peak
  let sum = 0;
  let sumSq = 0;
  let maxAbs = 0;

  for (let i = 0; i < len; i++) {
    const val = samples[i];
    sum += val;
    sumSq += val * val;
    const abs = Math.abs(val);
    if (abs > maxAbs) maxAbs = abs;
  }

  const mean = sum / len;
  const rms = Math.sqrt(sumSq / len);

  // If signal is effectively dead silence (RMS < 0.0008 or peak < 0.001)
  if (rms < 0.0008 && maxAbs < 0.001) {
    return { conditioned: samples, rms, peak: maxAbs, isSilent: true };
  }

  // 2. Remove DC bias and scale peak to 0.95
  const targetPeak = 0.95;
  const scale = maxAbs > 0.001 ? Math.min(10, targetPeak / maxAbs) : 1;

  const conditioned = new Float32Array(len);
  let newSumSq = 0;
  let newPeak = 0;

  for (let i = 0; i < len; i++) {
    // Remove DC offset, scale, and clamp strictly to [-1, 1]
    let s = (samples[i] - mean) * scale;
    if (s > 1.0) s = 1.0;
    else if (s < -1.0) s = -1.0;
    conditioned[i] = s;
    newSumSq += s * s;
    const abs = Math.abs(s);
    if (abs > newPeak) newPeak = abs;
  }

  const finalRms = Math.sqrt(newSumSq / len);

  return {
    conditioned,
    rms: finalRms,
    peak: newPeak,
    isSilent: false,
  };
}

/**
 * Resample any AudioBuffer to 16,000 Hz mono using OfflineAudioContext.
 */
export async function resampleAudioBufferTo16kMono(
  sourceBuffer: AudioBuffer,
  startOffsetSec: number = 0,
  durationSec?: number
): Promise<Float32Array> {
  const targetSampleRate = 16000;
  const numChannels = sourceBuffer.numberOfChannels;
  const sourceRate = sourceBuffer.sampleRate;

  // Determine slice range in seconds
  const bufferDuration = sourceBuffer.duration;
  const startSec = Math.max(0, Math.min(startOffsetSec, bufferDuration));
  const maxAvailableDuration = Math.max(0, bufferDuration - startSec);
  const actualDurationSec =
    durationSec !== undefined && durationSec > 0
      ? Math.min(durationSec, maxAvailableDuration)
      : maxAvailableDuration;

  if (actualDurationSec <= 0.05) {
    return new Float32Array(0);
  }

  const targetLengthSamples = Math.ceil(actualDurationSec * targetSampleRate);

  // Use OfflineAudioContext for browser-accelerated high-fidelity sinc resampling
  const OfflineCtxClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtxClass) {
    throw new Error("OfflineAudioContext is not supported in this browser environment");
  }

  const offlineCtx = new OfflineCtxClass(1, targetLengthSamples, targetSampleRate);

  // Mix down multi-channel audio to mono and play into offline context
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = sourceBuffer;

  // Connect through a channel merger/gain for clean downmixing
  if (numChannels > 1) {
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = 1 / numChannels;
    sourceNode.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
  } else {
    sourceNode.connect(offlineCtx.destination);
  }

  sourceNode.start(0, startSec, actualDurationSec);

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}

/**
 * Decodes raw ArrayBuffer or Blob into an AudioBuffer using Web Audio.
 */
export async function decodeAudioDataSafe(
  audioBytes: ArrayBuffer
): Promise<AudioBuffer> {
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtxClass) {
    throw new Error("AudioContext is not supported in this browser environment");
  }

  const tempCtx = new AudioCtxClass();
  try {
    // Note: decodeAudioData detaches the input ArrayBuffer in some browsers, so we slice a clone
    const bufferCopy = audioBytes.slice(0);
    const audioBuffer = await tempCtx.decodeAudioData(bufferCopy);
    return audioBuffer;
  } finally {
    try {
      await tempCtx.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Extract 16kHz mono Float32 audio directly from an HTML Media Element or URL
 */
export async function extractAudioFromUrlOrBlob(
  input: Blob | string | ArrayBuffer,
  timeRange?: { startSec?: number; durationSec?: number }
): Promise<ExtractedAudioResult> {
  let arrayBuffer: ArrayBuffer;

  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else if (input instanceof Blob) {
    arrayBuffer = await input.arrayBuffer();
  } else if (typeof input === "string") {
    // Fetch URL
    const res = await fetch(input);
    if (!res.ok) {
      return {
        hasAudio: false,
        reason: "no_source",
        audioData: new Float32Array(0),
        duration: 0,
        sampleRate: 16000,
        timelineStartSec: 0,
        timelineEndSec: 0,
        silenceGaps: [],
        rms: 0,
        peak: 0,
      };
    }
    arrayBuffer = await res.arrayBuffer();
  } else {
    return {
      hasAudio: false,
      reason: "no_source",
      audioData: new Float32Array(0),
      duration: 0,
      sampleRate: 16000,
      timelineStartSec: 0,
      timelineEndSec: 0,
      silenceGaps: [],
      rms: 0,
      peak: 0,
    };
  }

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudioDataSafe(arrayBuffer);
  } catch (err) {
    console.warn("[CaptionAudioEngine] Audio decode failed:", err);
    return {
      hasAudio: false,
      reason: "decode_error",
      audioData: new Float32Array(0),
      duration: 0,
      sampleRate: 16000,
      timelineStartSec: 0,
      timelineEndSec: 0,
      silenceGaps: [],
      rms: 0,
      peak: 0,
    };
  }

  const startSec = timeRange?.startSec ?? 0;
  const durSec = timeRange?.durationSec ?? audioBuffer.duration - startSec;

  const raw16k = await resampleAudioBufferTo16kMono(audioBuffer, startSec, durSec);
  const { conditioned, rms, peak, isSilent } = conditionAudioData(raw16k, 16000);

  const duration = conditioned.length / 16000;
  const gaps = detectSilenceGaps(conditioned, 16000);

  return {
    hasAudio: !isSilent && duration > 0.1,
    reason: isSilent ? "silence" : "ok",
    audioData: conditioned,
    duration,
    sampleRate: 16000,
    timelineStartSec: startSec,
    timelineEndSec: startSec + duration,
    silenceGaps: gaps,
    rms,
    peak,
  };
}
