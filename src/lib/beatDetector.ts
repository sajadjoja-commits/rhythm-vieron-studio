// Web Audio & Beat Detector Engine for Vireon AI Studio
import { analyze, guess } from "web-audio-beat-detector";

export interface BeatAnalysisResult {
  bpm: number;
  offset: number;
  beatTimes: number[]; // Exact beat timestamps in seconds
  peaks: number[];     // Peak intensity timestamps
}

// In-memory cache for decoded AudioBuffers to avoid re-decoding heavy files
const audioBufferCache = new Map<string, AudioBuffer>();

async function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function getDecodedAudioBuffer(audioUrl: string): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(audioUrl)) {
    return audioBufferCache.get(audioUrl)!;
  }
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    
    const audioCtx = new AudioContextClass();
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioBufferCache.set(audioUrl, audioBuffer);
      return audioBuffer;
    } finally {
      await audioCtx.close().catch(() => {});
    }
  } catch (err) {
    console.warn("Failed to decode audio buffer:", err);
    return null;
  }
}

/**
 * Decodes audio from a URL or Blob and runs beat & peak analysis (non-blocking)
 */
export async function analyzeAudioTrack(audioUrl: string): Promise<BeatAnalysisResult | null> {
  try {
    await yieldToMainThread();
    const audioBuffer = await getDecodedAudioBuffer(audioUrl);
    if (!audioBuffer) return null;
    await yieldToMainThread();

    let bpm = 120;
    let offset = 0;

    try {
      const guessed = await guess(audioBuffer);
      if (guessed && guessed.bpm > 40 && guessed.bpm < 220) {
        bpm = Math.round(guessed.bpm);
        offset = guessed.offset || 0;
      } else {
        const analyzedBpm = await analyze(audioBuffer);
        if (analyzedBpm > 40 && analyzedBpm < 220) {
          bpm = Math.round(analyzedBpm);
        }
      }
    } catch (e) {
      console.warn("web-audio-beat-detector estimate fallback to peak detection:", e);
    }

    await yieldToMainThread();

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    const windowSize = Math.floor(sampleRate * 0.05);
    const totalWindows = Math.floor(channelData.length / windowSize);
    const energies: number[] = new Array(totalWindows);

    let maxEnergy = 0.0001;
    for (let i = 0; i < totalWindows; i++) {
      let sum = 0;
      const start = i * windowSize;
      for (let j = 0; j < windowSize; j++) {
        const val = channelData[start + j];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / windowSize);
      energies[i] = rms;
      if (rms > maxEnergy) maxEnergy = rms;

      if (i % 2000 === 0) {
        await yieldToMainThread();
      }
    }

    const beatTimes: number[] = [];
    const peaks: number[] = [];
    const windowSec = 0.05;

    const beatIntervalSec = 60 / bpm;
    for (let t = offset; t < duration; t += beatIntervalSec) {
      beatTimes.push(Number(t.toFixed(3)));
    }

    for (let i = 2; i < totalWindows - 2; i++) {
      const e = energies[i];
      const prev = energies[i - 1];
      const next = energies[i + 1];
      const avgLocal = (energies[i - 2] + energies[i - 1] + energies[i + 1] + energies[i + 2]) / 4;

      if (e > prev && e > next && e > avgLocal * 1.3 && e > maxEnergy * 0.25) {
        const peakTime = i * windowSec;
        peaks.push(Number(peakTime.toFixed(3)));
      }

      if (i % 2000 === 0) {
        await yieldToMainThread();
      }
    }

    return {
      bpm,
      offset,
      beatTimes,
      peaks: peaks.length > 0 ? peaks : beatTimes,
    };
  } catch (err) {
    console.warn("Failed to analyze audio beats:", err);
    return null;
  }
}

/**
 * Calculates audio RMS energy for a specific segment time range [startTime, endTime]
 */
export async function calculateSegmentAudioEnergy(audioUrl: string, startTime: number, endTime: number): Promise<number> {
  try {
    const audioBuffer = await getDecodedAudioBuffer(audioUrl);
    if (!audioBuffer) return 0.5;

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const endSample = Math.min(channelData.length, Math.floor(endTime * sampleRate));

    if (endSample <= startSample) return 0.5;

    let sum = 0;
    const step = Math.max(1, Math.floor((endSample - startSample) / 500));
    let count = 0;

    for (let i = startSample; i < endSample; i += step) {
      const val = channelData[i];
      sum += val * val;
      count++;
    }

    const rms = Math.sqrt(sum / (count || 1));
    return Math.min(1, rms * 5);
  } catch {
    return 0.5;
  }
}
