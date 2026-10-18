// Lightweight waveform peak extraction for the audio timeline.
// Uses Native Waveform Engine on Android and Web Audio API fallback on Web.

import { waveformService } from "@/services/media/WaveformService";
import { getAudioContext } from "@/lib/audioAnalysis";

const cache = new Map<string, number[]>();

export async function getWaveformPeaks(url: string, buckets = 240): Promise<number[]> {
  const key = `${url}#${buckets}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const result = await waveformService.getWaveform(url, { samplesCount: buckets });
    if (result && result.success && Array.isArray(result.peaks) && result.peaks.length > 0) {
      cache.set(key, result.peaks);
      return result.peaks;
    }
  } catch (err) {
    console.warn("[waveform] WaveformService error, using web fallback:", err);
  }

  // Web Audio fallback
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const ctx = getAudioContext();
    const audioBuf = await ctx.decodeAudioData(arr.slice(0));
    const ch = audioBuf.getChannelData(0);
    const block = Math.floor(ch.length / buckets) || 1;
    const peaks: number[] = [];
    let max = 0.0001;
    for (let i = 0; i < buckets; i++) {
      let sum = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) {
        const v = ch[start + j] || 0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / block);
      peaks.push(rms);
      if (rms > max) max = rms;
    }
    const norm = peaks.map((p) => Math.min(1, Math.max(0.02, p / max)));
    cache.set(key, norm);
    return norm;
  } catch {
    const fallbackPeaks = new Array(buckets).fill(0.05);
    cache.set(key, fallbackPeaks);
    return fallbackPeaks;
  }
}

