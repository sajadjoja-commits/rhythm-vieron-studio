// Lightweight BPM + beat detection using Web Audio API & chunked signal analysis.
// Runs asynchronously with event loop yielding to prevent UI freezes.

import { analyze, guess } from "web-audio-beat-detector";

export interface BeatInfo {
  bpm: number;
  beats: number[];
  duration: number;
}

export type BeatProgressCallback = (progress: number) => void;

async function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function decodeFile(file: File): Promise<AudioBuffer> {
  const ab = await file.arrayBuffer();
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf: AudioBuffer = await ctx.decodeAudioData(ab.slice(0));
    return buf;
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function analyzeBeats(
  file: File,
  params?: { threshold?: number; mode?: "grid" | "raw" },
  onProgress?: BeatProgressCallback
): Promise<BeatInfo> {
  onProgress?.(10);
  await yieldToMainThread();
  const buffer = await decodeFile(file);
  onProgress?.(30);
  await yieldToMainThread();
  return analyzeBufferWithWebAudioBeatDetector(buffer, params, onProgress);
}

/** Analyze beats from an audio URL (e.g. built-in tracks or blob URLs). */
export async function analyzeBeatsFromUrl(
  url: string,
  params?: { threshold?: number; mode?: "grid" | "raw" },
  onProgress?: BeatProgressCallback
): Promise<BeatInfo> {
  onProgress?.(10);
  await yieldToMainThread();
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  onProgress?.(25);
  await yieldToMainThread();

  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(ab.slice(0));
  } finally {
    await ctx.close().catch(() => {});
  }
  onProgress?.(40);
  await yieldToMainThread();

  return analyzeBufferWithWebAudioBeatDetector(buffer, params, onProgress);
}

export async function analyzeBufferWithWebAudioBeatDetector(
  buffer: AudioBuffer,
  params?: { threshold?: number; mode?: "grid" | "raw" },
  onProgress?: BeatProgressCallback
): Promise<BeatInfo> {
  let detectedBpm: number | null = null;
  let startOffset = 0;

  try {
    const guessed = await guess(buffer);
    if (guessed && guessed.bpm > 40 && guessed.bpm < 220) {
      detectedBpm = Math.round(guessed.bpm);
      startOffset = guessed.offset || 0;
    } else {
      const analyzedBpm = await analyze(buffer);
      if (analyzedBpm > 40 && analyzedBpm < 220) {
        detectedBpm = Math.round(analyzedBpm);
      }
    }
  } catch {
    // fallback to signal analysis
  }

  onProgress?.(55);
  await yieldToMainThread();

  const baseResult = await analyzeBufferAsync(buffer, params, (p) => {
    onProgress?.(55 + Math.round(p * 40));
  });

  if (detectedBpm) {
    baseResult.bpm = detectedBpm;
    if (params?.mode !== "raw") {
      const beatInterval = 60 / detectedBpm;
      const beats: number[] = [];
      for (let t = startOffset; t < buffer.duration; t += beatInterval) {
        beats.push(Number(t.toFixed(3)));
      }
      baseResult.beats = beats;
    }
  }

  onProgress?.(100);
  return baseResult;
}

export function analyzeBuffer(
  buffer: AudioBuffer,
  params?: { threshold?: number; mode?: "grid" | "raw" }
): BeatInfo {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  const frame = Math.floor(sr * 0.01);
  const energies: number[] = [];
  for (let i = 0; i < ch0.length; i += frame) {
    let sum = 0;
    const end = Math.min(i + frame, ch0.length);
    for (let j = i; j < end; j++) {
      const a = ch0[j];
      const b = ch1 ? ch1[j] : a;
      const v = (a + b) * 0.5;
      sum += v * v;
    }
    energies.push(sum / Math.max(1, end - i));
  }

  const onsets: number[] = [];
  const win = 43;
  let energyMultiplier = 1.6;
  let derivMultiplier = 0.3;
  const sens = params?.threshold ?? 3;
  if (sens === 1) { energyMultiplier = 1.15; derivMultiplier = 0.12; }
  else if (sens === 2) { energyMultiplier = 1.35; derivMultiplier = 0.2; }
  else if (sens === 3) { energyMultiplier = 1.6;  derivMultiplier = 0.3; }
  else if (sens === 4) { energyMultiplier = 1.95; derivMultiplier = 0.45; }
  else if (sens === 5) { energyMultiplier = 2.4;  derivMultiplier = 0.6; }

  for (let i = 1; i < energies.length; i++) {
    const start = Math.max(0, i - win);
    let avg = 0;
    for (let j = start; j < i; j++) avg += energies[j];
    avg /= Math.max(1, i - start);
    if (energies[i] > avg * energyMultiplier && energies[i] - energies[i - 1] > avg * derivMultiplier) {
      const tSec = (i * frame) / sr;
      if (!onsets.length || tSec - onsets[onsets.length - 1] > 0.18) onsets.push(tSec);
    }
  }

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1]);
  const histogram = new Map<number, number>();
  for (const iv of intervals) {
    if (iv < 0.25 || iv > 1.2) continue;
    const bpm = Math.round(60 / iv);
    histogram.set(bpm, (histogram.get(bpm) || 0) + 1);
  }
  let bestBpm = 120, bestCount = 0;
  histogram.forEach((c, bpm) => { if (c > bestCount) { bestCount = c; bestBpm = bpm; } });
  while (bestBpm < 70) bestBpm *= 2;
  while (bestBpm > 180) bestBpm /= 2;
  bestBpm = Math.round(bestBpm);

  let finalBeats: number[] = [];
  if (params?.mode === "raw") {
    finalBeats = onsets;
  } else {
    const beatInterval = 60 / bestBpm;
    const startBeat = onsets[0] ?? 0;
    for (let t = startBeat; t < buffer.duration; t += beatInterval) {
      finalBeats.push(t);
    }
  }

  return { bpm: bestBpm, beats: finalBeats, duration: buffer.duration };
}

/** Non-blocking chunked version of analyzeBuffer */
export async function analyzeBufferAsync(
  buffer: AudioBuffer,
  params?: { threshold?: number; mode?: "grid" | "raw" },
  onProgress?: BeatProgressCallback
): Promise<BeatInfo> {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  const frame = Math.floor(sr * 0.01);
  const energies: number[] = [];
  const chunkSize = 20000 * frame;

  for (let i = 0; i < ch0.length; i += frame) {
    let sum = 0;
    const end = Math.min(i + frame, ch0.length);
    for (let j = i; j < end; j++) {
      const a = ch0[j];
      const b = ch1 ? ch1[j] : a;
      const v = (a + b) * 0.5;
      sum += v * v;
    }
    energies.push(sum / Math.max(1, end - i));

    if (i % chunkSize === 0) {
      onProgress?.((i / ch0.length) * 0.6);
      await yieldToMainThread();
    }
  }

  const onsets: number[] = [];
  const win = 43;
  let energyMultiplier = 1.6;
  let derivMultiplier = 0.3;
  const sens = params?.threshold ?? 3;
  if (sens === 1) { energyMultiplier = 1.15; derivMultiplier = 0.12; }
  else if (sens === 2) { energyMultiplier = 1.35; derivMultiplier = 0.2; }
  else if (sens === 3) { energyMultiplier = 1.6;  derivMultiplier = 0.3; }
  else if (sens === 4) { energyMultiplier = 1.95; derivMultiplier = 0.45; }
  else if (sens === 5) { energyMultiplier = 2.4;  derivMultiplier = 0.6; }

  for (let i = 1; i < energies.length; i++) {
    const start = Math.max(0, i - win);
    let avg = 0;
    for (let j = start; j < i; j++) avg += energies[j];
    avg /= Math.max(1, i - start);
    if (energies[i] > avg * energyMultiplier && energies[i] - energies[i - 1] > avg * derivMultiplier) {
      const tSec = (i * frame) / sr;
      if (!onsets.length || tSec - onsets[onsets.length - 1] > 0.18) onsets.push(tSec);
    }
    if (i % 10000 === 0) {
      onProgress?.(0.6 + (i / energies.length) * 0.3);
      await yieldToMainThread();
    }
  }

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1]);
  const histogram = new Map<number, number>();
  for (const iv of intervals) {
    if (iv < 0.25 || iv > 1.2) continue;
    const bpm = Math.round(60 / iv);
    histogram.set(bpm, (histogram.get(bpm) || 0) + 1);
  }
  let bestBpm = 120, bestCount = 0;
  histogram.forEach((c, bpm) => { if (c > bestCount) { bestCount = c; bestBpm = bpm; } });
  while (bestBpm < 70) bestBpm *= 2;
  while (bestBpm > 180) bestBpm /= 2;
  bestBpm = Math.round(bestBpm);

  let finalBeats: number[] = [];
  if (params?.mode === "raw") {
    finalBeats = onsets;
  } else {
    const beatInterval = 60 / bestBpm;
    const startBeat = onsets[0] ?? 0;
    for (let t = startBeat; t < buffer.duration; t += beatInterval) {
      finalBeats.push(t);
    }
  }

  onProgress?.(1.0);
  return { bpm: bestBpm, beats: finalBeats, duration: buffer.duration };
}

let _ac: AudioContext | null = null;
export const getAudioContext = () => {
  if (!_ac) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    _ac = new Ctx();
  }
  return _ac!;
};
