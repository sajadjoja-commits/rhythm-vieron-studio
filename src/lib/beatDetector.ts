// Advanced Web Audio Rhythm & Beat Intelligence Engine for Vireon AI Studio
import { analyze, guess } from "web-audio-beat-detector";

export type MusicSectionType = "calm" | "verse" | "buildup" | "drop";

export interface BeatPoint {
  time: number;          // Exact audio timestamp in seconds
  strength: number;      // 0 to 1 normalized onset strength
  isDownbeat: boolean;   // First beat of measure (Bar 1)
  isStrong: boolean;     // Downbeat (beat 1) or secondary accent (beat 3)
  section: MusicSectionType;
  energy: number;        // 0 to 1 local RMS/spectral energy
}

export interface MusicSection {
  type: MusicSectionType;
  start: number;
  end: number;
  avgEnergy: number;
  peakEnergy: number;
}

export interface BeatAnalysisResult {
  bpm: number;
  offset: number;
  beatTimes: number[];    // Exact beat timestamps in seconds (compatible with legacy consumers)
  downbeats: number[];    // Bar downbeats (beat 1 of measure)
  strongBeats: number[];  // High-impact accent beats
  peaks: number[];        // Peak intensity timestamps
  beats: BeatPoint[];     // Full rich beat model
  energyCurve: Array<{ time: number; energy: number }>;
  sections: MusicSection[];
  duration: number;
}

// In-memory cache for decoded AudioBuffers to prevent expensive re-decoding
const audioBufferCache = new Map<string, AudioBuffer>();

async function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function getDecodedAudioBuffer(audioUrl: string): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(audioUrl)) {
    return audioBufferCache.get(audioUrl)!;
  }
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    
    const AudioContextClass = typeof window !== "undefined"
      ? ((window as any).AudioContext || (window as any).webkitAudioContext)
      : null;
    if (!AudioContextClass) return null;
    
    const audioCtx = new AudioContextClass();
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      if (audioBufferCache.size >= 6) {
        const firstKey = audioBufferCache.keys().next().value;
        if (firstKey) audioBufferCache.delete(firstKey);
      }
      audioBufferCache.set(audioUrl, audioBuffer);
      return audioBuffer;
    } finally {
      await audioCtx.close().catch(() => {});
    }
  } catch (err) {
    console.warn("[BeatDetector] Failed to decode audio buffer:", err);
    return null;
  }
}

/**
 * High-precision Multi-Band Spectral & Energy Analysis
 * Detects BPM, downbeats, strong accents, continuous energy curves, and musical sections.
 */
export async function analyzeAudioTrack(
  audioUrl: string,
  options?: { signal?: AbortSignal; onProgress?: (pct: number) => void }
): Promise<BeatAnalysisResult | null> {
  try {
    if (options?.signal?.aborted) throw new Error("Analysis aborted");
    options?.onProgress?.(10);
    await yieldToMainThread();

    const audioBuffer = await getDecodedAudioBuffer(audioUrl);
    if (!audioBuffer) return null;
    if (options?.signal?.aborted) throw new Error("Analysis aborted");

    options?.onProgress?.(30);
    await yieldToMainThread();

    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    const channelData = audioBuffer.getChannelData(0);

    // 1. Initial BPM & Offset Estimation
    let bpm = 120;
    let offset = 0;

    try {
      const guessed = await guess(audioBuffer);
      if (guessed && guessed.bpm > 45 && guessed.bpm < 220) {
        bpm = Math.round(guessed.bpm);
        offset = Math.max(0, guessed.offset || 0);
      } else {
        const analyzedBpm = await analyze(audioBuffer);
        if (analyzedBpm > 45 && analyzedBpm < 220) {
          bpm = Math.round(analyzedBpm);
        }
      }
    } catch (e) {
      console.warn("[BeatDetector] Guess fallback to heuristic tempo:", e);
    }

    if (options?.signal?.aborted) throw new Error("Analysis aborted");
    options?.onProgress?.(50);
    await yieldToMainThread();

    // 2. Sub-band & Transient Spectral Flux Computation
    // 20ms window size for crisp transient resolution
    const windowSec = 0.02;
    const windowSize = Math.max(64, Math.floor(sampleRate * windowSec));
    const totalWindows = Math.floor(channelData.length / windowSize);

    const rmsEnergies = new Float32Array(totalWindows);
    const bassEnergies = new Float32Array(totalWindows);
    const onsets = new Float32Array(totalWindows);

    let maxRms = 0.0001;
    let prevBass = 0;
    let prevRms = 0;

    // Fast simple low-pass filter accumulator for bass (approx cutoff ~180Hz)
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * 180);
    const alpha = dt / (rc + dt);

    let lpSample = 0;

    for (let i = 0; i < totalWindows; i++) {
      if (options?.signal?.aborted) throw new Error("Analysis aborted");
      const start = i * windowSize;
      let sumSq = 0;
      let bassSumSq = 0;

      // Stride for fast processing
      const step = Math.max(1, Math.floor(windowSize / 128));
      let count = 0;

      for (let j = 0; j < windowSize; j += step) {
        const s = channelData[start + j];
        sumSq += s * s;

        // One-pole low-pass filter
        lpSample += alpha * (s - lpSample);
        bassSumSq += lpSample * lpSample;
        count++;
      }

      const rms = Math.sqrt(sumSq / (count || 1));
      const bassRms = Math.sqrt(bassSumSq / (count || 1));

      rmsEnergies[i] = rms;
      bassEnergies[i] = bassRms;
      if (rms > maxRms) maxRms = rms;

      // Positive spectral flux / onset surge
      const diffBass = Math.max(0, bassRms - prevBass);
      const diffRms = Math.max(0, rms - prevRms);
      onsets[i] = diffBass * 2.2 + diffRms * 1.0;

      prevBass = bassRms;
      prevRms = rms;

      if (i % 2500 === 0) {
        await yieldToMainThread();
      }
    }

    if (options?.signal?.aborted) throw new Error("Analysis aborted");
    options?.onProgress?.(70);
    await yieldToMainThread();

    // 3. Smooth Energy Curve (0.5s moving average window)
    const smoothRadius = Math.max(1, Math.floor(0.25 / windowSec));
    const energyCurve: Array<{ time: number; energy: number }> = [];
    const curveStep = Math.max(1, Math.floor(0.1 / windowSec)); // 100ms interval for curve

    for (let i = 0; i < totalWindows; i += curveStep) {
      let sum = 0;
      let count = 0;
      for (let w = Math.max(0, i - smoothRadius); w <= Math.min(totalWindows - 1, i + smoothRadius); w++) {
        sum += rmsEnergies[w];
        count++;
      }
      const normE = Math.min(1, (sum / (count || 1)) / (maxRms || 1));
      energyCurve.push({
        time: Number((i * windowSec).toFixed(3)),
        energy: Number(normE.toFixed(3)),
      });
    }

    // 4. Detect Musical Sections (Calm, Verse, Buildup, Drop)
    const sections: MusicSection[] = [];
    const secWindowSize = Math.max(1, Math.floor(1.5 / 0.1)); // 1.5s step in energy curve
    let curSecType: MusicSectionType = "verse";
    let curSecStart = 0;
    let curSecEnergySum = 0;
    let curSecCount = 0;
    let curSecPeak = 0;

    for (let c = 0; c < energyCurve.length; c++) {
      const pt = energyCurve[c];
      curSecEnergySum += pt.energy;
      curSecCount++;
      if (pt.energy > curSecPeak) curSecPeak = pt.energy;

      // Calculate short-term trend / derivative over 2 seconds
      const prevPt = energyCurve[Math.max(0, c - 20)];
      const slope = prevPt ? (pt.energy - prevPt.energy) / Math.max(0.1, pt.time - prevPt.time) : 0;

      let determinedType: MusicSectionType = "verse";
      if (pt.energy < 0.28) {
        determinedType = "calm";
      } else if (slope > 0.18 && pt.energy < 0.85) {
        determinedType = "buildup";
      } else if (pt.energy >= 0.72) {
        determinedType = "drop";
      } else {
        determinedType = "verse";
      }

      if (c === 0) {
        curSecType = determinedType;
      } else if (determinedType !== curSecType && c - Math.floor(curSecStart / 0.1) >= secWindowSize) {
        // Section boundary
        sections.push({
          type: curSecType,
          start: Number(curSecStart.toFixed(2)),
          end: Number(pt.time.toFixed(2)),
          avgEnergy: Number((curSecEnergySum / curSecCount).toFixed(2)),
          peakEnergy: Number(curSecPeak.toFixed(2)),
        });
        curSecType = determinedType;
        curSecStart = pt.time;
        curSecEnergySum = 0;
        curSecCount = 0;
        curSecPeak = 0;
      }
    }

    // Close final section
    sections.push({
      type: curSecType,
      start: Number(curSecStart.toFixed(2)),
      end: Number(duration.toFixed(2)),
      avgEnergy: Number((curSecEnergySum / (curSecCount || 1)).toFixed(2)),
      peakEnergy: Number(curSecPeak.toFixed(2)),
    });

    // 5. Phase-aligned Downbeat & Strong Beat Tracking
    const beatIntervalSec = 60 / bpm;

    // Detect optimal phase offset within [0, beatIntervalSec]
    let bestPhaseOffset = offset % beatIntervalSec;
    let maxPhaseScore = -1;
    const testSteps = 16;
    for (let s = 0; s < testSteps; s++) {
      const testOff = (s / testSteps) * beatIntervalSec;
      let score = 0;
      for (let t = testOff; t < duration; t += beatIntervalSec) {
        const wIdx = Math.floor(t / windowSec);
        if (wIdx >= 0 && wIdx < totalWindows) {
          score += onsets[wIdx];
        }
      }
      if (score > maxPhaseScore) {
        maxPhaseScore = score;
        bestPhaseOffset = testOff;
      }
    }

    // Determine downbeat (Bar 1) phase in 4/4 meter (0, 1, 2, or 3)
    let bestDownbeatPhase = 0;
    let maxBassScore = -1;
    for (let m = 0; m < 4; m++) {
      let bScore = 0;
      let bIdx = 0;
      for (let t = bestPhaseOffset; t < duration; t += beatIntervalSec) {
        if (bIdx % 4 === m) {
          const wIdx = Math.floor(t / windowSec);
          if (wIdx >= 0 && wIdx < totalWindows) {
            bScore += bassEnergies[wIdx];
          }
        }
        bIdx++;
      }
      if (bScore > maxBassScore) {
        maxBassScore = bScore;
        bestDownbeatPhase = m;
      }
    }

    // 6. Construct Detailed Beat Points
    const beatTimes: number[] = [];
    const downbeats: number[] = [];
    const strongBeats: number[] = [];
    const peaks: number[] = [];
    const fullBeats: BeatPoint[] = [];

    let beatCounter = 0;
    for (let t = bestPhaseOffset; t < duration; t += beatIntervalSec) {
      const timeRound = Number(t.toFixed(3));
      beatTimes.push(timeRound);

      const wIdx = Math.floor(t / windowSec);
      const localOnset = wIdx < totalWindows ? onsets[wIdx] : 0;
      const localRms = wIdx < totalWindows ? rmsEnergies[wIdx] : 0;
      const normLocalEnergy = Math.min(1, localRms / (maxRms || 1));

      const isDownbeat = beatCounter % 4 === bestDownbeatPhase;
      const isStrong = isDownbeat || (beatCounter % 4 === (bestDownbeatPhase + 2) % 4) || localOnset > 0.6;

      if (isDownbeat) downbeats.push(timeRound);
      if (isStrong) strongBeats.push(timeRound);

      // Section at timestamp
      const sec = sections.find((s) => t >= s.start && t <= s.end) || sections[0];

      fullBeats.push({
        time: timeRound,
        strength: Number(Math.min(1, localOnset * 1.5).toFixed(3)),
        isDownbeat,
        isStrong,
        section: sec ? sec.type : "verse",
        energy: Number(normLocalEnergy.toFixed(3)),
      });

      beatCounter++;
    }

    // Peak detection for abrupt major hits
    for (let i = 2; i < totalWindows - 2; i++) {
      const e = rmsEnergies[i];
      const prev = rmsEnergies[i - 1];
      const next = rmsEnergies[i + 1];
      const avgLocal = (rmsEnergies[i - 2] + rmsEnergies[i - 1] + rmsEnergies[i + 1] + rmsEnergies[i + 2]) / 4;

      if (e > prev && e > next && e > avgLocal * 1.35 && e > maxRms * 0.3) {
        peaks.push(Number((i * windowSec).toFixed(3)));
      }
    }

    options?.onProgress?.(100);

    return {
      bpm,
      offset: Number(bestPhaseOffset.toFixed(3)),
      beatTimes,
      downbeats,
      strongBeats,
      peaks: peaks.length > 0 ? peaks : beatTimes,
      beats: fullBeats,
      energyCurve,
      sections,
      duration,
    };
  } catch (err: any) {
    if (err?.message === "Analysis aborted") {
      throw err;
    }
    console.warn("[BeatDetector] Failed to analyze audio track:", err);
    return null;
  }
}

/**
 * Accurately maps beat timestamps to timeline coordinates with audio offset and timebase quantization
 * completely prevents audio-video drift across variable sample rates and timeline edits.
 */
export function mapBeatsToTimeline(
  beatResult: BeatAnalysisResult,
  trackStart: number,
  trackOffset: number,
  trackDuration: number,
  fps: number = 30
): {
  beatsOnTimeline: number[];
  downbeatsOnTimeline: number[];
  strongBeatsOnTimeline: number[];
  sectionsOnTimeline: MusicSection[];
} {
  const frameDuration = 1 / Math.max(1, fps);
  const quantize = (t: number) => Math.round(t / frameDuration) * frameDuration;

  const minAudioTime = trackOffset;
  const maxAudioTime = trackOffset + trackDuration;

  const beatsOnTimeline: number[] = [];
  const downbeatsOnTimeline: number[] = [];
  const strongBeatsOnTimeline: number[] = [];

  for (const b of beatResult.beats) {
    if (b.time >= minAudioTime - 0.01 && b.time <= maxAudioTime + 0.01) {
      const timelineTime = quantize(trackStart + (b.time - trackOffset));
      if (timelineTime >= 0) {
        beatsOnTimeline.push(Number(timelineTime.toFixed(3)));
        if (b.isDownbeat) downbeatsOnTimeline.push(Number(timelineTime.toFixed(3)));
        if (b.isStrong) strongBeatsOnTimeline.push(Number(timelineTime.toFixed(3)));
      }
    }
  }

  const sectionsOnTimeline: MusicSection[] = beatResult.sections
    .filter((s) => s.end >= minAudioTime && s.start <= maxAudioTime)
    .map((s) => {
      const clampedStart = Math.max(minAudioTime, s.start);
      const clampedEnd = Math.min(maxAudioTime, s.end);
      return {
        ...s,
        start: Number(quantize(trackStart + (clampedStart - trackOffset)).toFixed(3)),
        end: Number(quantize(trackStart + (clampedEnd - trackOffset)).toFixed(3)),
      };
    });

  return {
    beatsOnTimeline,
    downbeatsOnTimeline,
    strongBeatsOnTimeline,
    sectionsOnTimeline,
  };
}

/**
 * Calculates audio RMS energy for a batch of segment time ranges in a single decoded pass
 */
export async function calculateSegmentAudioEnergiesBatch(
  audioUrl: string,
  segments: Array<{ in: number; out: number }>
): Promise<number[]> {
  try {
    const audioBuffer = await getDecodedAudioBuffer(audioUrl);
    if (!audioBuffer) return segments.map(() => 0.5);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    return segments.map((seg) => {
      const startSample = Math.max(0, Math.floor(seg.in * sampleRate));
      const endSample = Math.min(channelData.length, Math.floor(seg.out * sampleRate));

      if (endSample <= startSample) return 0.5;

      let sum = 0;
      const step = Math.max(1, Math.floor((endSample - startSample) / 250));
      let count = 0;

      for (let i = startSample; i < endSample; i += step) {
        const val = channelData[i];
        sum += val * val;
        count++;
      }

      const rms = Math.sqrt(sum / (count || 1));
      return Math.min(1, rms * 5);
    });
  } catch {
    return segments.map(() => 0.5);
  }
}

/**
 * Calculates audio RMS energy for a specific segment time range [startTime, endTime]
 */
export async function calculateSegmentAudioEnergy(
  audioUrl: string,
  startTime: number,
  endTime: number
): Promise<number> {
  try {
    const res = await calculateSegmentAudioEnergiesBatch(audioUrl, [{ in: startTime, out: endTime }]);
    return res[0] ?? 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Frees in-memory cached AudioBuffers to reclaim memory
 */
export function clearAudioBufferCache(): void {
  audioBufferCache.clear();
}
