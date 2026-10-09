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
  beatsPerBar?: number;
  gridConfidence?: number;
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

function normalizeOctaveBpm(rawBpm: number): number {
  let b = rawBpm;
  if (!Number.isFinite(b) || b <= 0) return 120;
  while (b < 60) b *= 2;
  while (b > 200) b /= 2;
  return b;
}

function estimateFallbackBpmFromOnsets(onsets: Float32Array, windowSec: number): number {
  const maxFrames = Math.min(onsets.length, Math.floor(60 / windowSec));
  if (maxFrames < 120) return 120;

  const minLag = Math.max(1, Math.round(60 / (200 * windowSec)));
  const maxLag = Math.min(maxFrames - 1, Math.round(60 / (60 * windowSec)));
  if (minLag >= maxLag) return 120;

  let bestLag = Math.round(60 / (120 * windowSec));
  let bestScore = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const count = maxFrames - lag;
    for (let i = 0; i < count; i++) {
      const a = onsets[i];
      if (a > 0) {
        sum += a * (onsets[i + lag] + 0.5 * (onsets[i + lag - 1] || 0) + 0.5 * (onsets[i + lag + 1] || 0));
      }
    }
    const candBpm = 60 / (lag * windowSec);
    // Gentle perceptual prior around 120 BPM to disambiguate octave harmonics (e.g. 60 vs 120 BPM)
    const octavePrior = 1 - 0.08 * Math.pow(Math.log2(candBpm / 120), 2);
    const score = (sum / Math.max(1, count)) * octavePrior;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Parabolic interpolation around bestLag for fractional BPM precision
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const evalLag = (l: number) => {
      let s = 0;
      const c = maxFrames - l;
      for (let i = 0; i < c; i++) {
        if (onsets[i] > 0) s += onsets[i] * onsets[i + l];
      }
      return s / Math.max(1, c);
    };
    const yPrev = evalLag(bestLag - 1);
    const yCurr = evalLag(bestLag);
    const yNext = evalLag(bestLag + 1);
    const denom = yPrev - 2 * yCurr + yNext;
    if (Math.abs(denom) > 1e-9 && yCurr >= yPrev && yCurr >= yNext) {
      const delta = (0.5 * (yPrev - yNext)) / denom;
      if (Math.abs(delta) <= 0.5) {
        refinedLag = bestLag + delta;
      }
    }
  }

  return normalizeOctaveBpm(60 / (refinedLag * windowSec));
}

function medianOf5(a: number, b: number, c: number, d: number, e: number): number {
  const arr = [a, b, c, d, e];
  arr.sort((x, y) => x - y);
  return arr[2];
}

/**
 * Analyzes an already-decoded AudioBuffer for high-precision fractional BPM,
 * phase-aligned beats, meter (3/4 vs 4/4), energy curve, and musical sections.
 */
export async function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  options?: { signal?: AbortSignal; onProgress?: (pct: number) => void }
): Promise<BeatAnalysisResult> {
  if (options?.signal?.aborted) throw new Error("Analysis aborted");

  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration || audioBuffer.getChannelData(0).length / sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  // 1. Sub-band & Transient Spectral Flux Computation with 10ms window (no sample stride)
  const targetWindowSec = 0.01;
  const windowSize = Math.max(32, Math.floor(sampleRate * targetWindowSec));
  const windowSec = windowSize / sampleRate;
  const totalWindows = Math.max(1, Math.floor(channelData.length / windowSize));

  const rmsEnergies = new Float32Array(totalWindows);
  const bassEnergies = new Float32Array(totalWindows);
  const rawOnsets = new Float32Array(totalWindows);
  const onsets = new Float32Array(totalWindows);

  let maxRms = 0.0001;
  let prevBassSqrt = 0;
  let prevHighSqrt = 0;
  let prevRms = 0;

  // One-pole low-pass filter for bass (~180Hz) applied to every sample
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * 180);
  const alpha = dt / (rc + dt);

  let lpSample = 0;
  let prevSample = channelData.length > 0 ? channelData[0] : 0;
  const invWindowSize = 1 / windowSize;

  for (let i = 0; i < totalWindows; i++) {
    if (options?.signal?.aborted) throw new Error("Analysis aborted");
    const start = i * windowSize;
    const end = start + windowSize;
    let sumSq = 0;
    let bassSumSq = 0;
    let highSumSq = 0;

    for (let idx = start; idx < end; idx++) {
      const s = channelData[idx];
      sumSq += s * s;

      lpSample += alpha * (s - lpSample);
      bassSumSq += lpSample * lpSample;

      const highDiff = s - prevSample;
      prevSample = s;
      highSumSq += highDiff * highDiff;
    }

    const rms = Math.sqrt(sumSq * invWindowSize);
    const bassSqrt = Math.sqrt(bassSumSq * invWindowSize);
    const highSqrt = Math.sqrt(highSumSq * invWindowSize);

    rmsEnergies[i] = rms;
    bassEnergies[i] = bassSqrt;
    if (rms > maxRms) maxRms = rms;

    // Positive flux: sqrt(bassEnergy)*2 + sqrt(highEnergy)*1.2 + RMS*0.8
    const fluxBass = Math.max(0, bassSqrt - prevBassSqrt);
    const fluxHigh = Math.max(0, highSqrt - prevHighSqrt);
    const fluxRms = Math.max(0, rms - prevRms);
    rawOnsets[i] = fluxBass * 2.0 + fluxHigh * 1.2 + fluxRms * 0.8;

    prevBassSqrt = bassSqrt;
    prevHighSqrt = highSqrt;
    prevRms = rms;

    if (i > 0 && i % 5000 === 0) {
      await yieldToMainThread();
    }
  }

  // Subtract local mean (0.5s window) and normalize by 95th percentile
  const onsetPrefix = new Float64Array(totalWindows + 1);
  for (let i = 0; i < totalWindows; i++) {
    onsetPrefix[i + 1] = onsetPrefix[i] + rawOnsets[i];
  }
  const halfMeanWin = Math.max(1, Math.round(0.25 / windowSec));
  for (let i = 0; i < totalWindows; i++) {
    const w0 = Math.max(0, i - halfMeanWin);
    const w1 = Math.min(totalWindows - 1, i + halfMeanWin);
    const localMean = (onsetPrefix[w1 + 1] - onsetPrefix[w0]) / (w1 - w0 + 1);
    onsets[i] = Math.max(0, rawOnsets[i] - localMean);
  }

  const sortedOnsets = Float32Array.from(onsets).sort();
  let onsetP95 = sortedOnsets[Math.min(totalWindows - 1, Math.floor(totalWindows * 0.95))] || 0;
  if (onsetP95 <= 1e-6) {
    // Sparse onset track (e.g. click track where <5% of 10ms windows are active)
    let firstActive = 0;
    while (firstActive < totalWindows && sortedOnsets[firstActive] <= 1e-6) {
      firstActive++;
    }
    const activeCount = totalWindows - firstActive;
    if (activeCount > 0) {
      onsetP95 = sortedOnsets[firstActive + Math.min(activeCount - 1, Math.floor(activeCount * 0.95))];
    }
  }
  const invOnsetP95 = onsetP95 > 1e-6 ? 1 / onsetP95 : 1;
  for (let i = 0; i < totalWindows; i++) {
    onsets[i] = onsets[i] * invOnsetP95;
  }

  if (options?.signal?.aborted) throw new Error("Analysis aborted");
  options?.onProgress?.(50);
  await yieldToMainThread();

  // 2. Initial Fractional BPM Estimation (no rounding, octave-normalized to [60, 200])
  let baseBpm = 0;
  try {
    const guessed = await guess(audioBuffer);
    if (guessed && Number.isFinite(guessed.bpm) && guessed.bpm > 0) {
      baseBpm = normalizeOctaveBpm(guessed.bpm);
    } else {
      const analyzedBpm = await analyze(audioBuffer);
      if (Number.isFinite(analyzedBpm) && analyzedBpm > 0) {
        baseBpm = normalizeOctaveBpm(analyzedBpm);
      }
    }
  } catch {
    // Fallback to onset autocorrelation when OfflineAudioContext / guess is unavailable
  }

  if (baseBpm <= 0) {
    baseBpm = estimateFallbackBpmFromOnsets(onsets, windowSec);
  }

  // 3. Fractional BPM Grid Search: 81 BPM candidates (±2% in 0.05% steps) × 32 phases
  // Score = sum of max onset within ±20ms around each grid beat
  const radius20ms = Math.max(1, Math.round(0.02 / windowSec));
  const maxOnset20ms = new Float32Array(totalWindows);
  const maxOnset20msIdx = new Int32Array(totalWindows);
  for (let i = 0; i < totalWindows; i++) {
    const w0 = Math.max(0, i - radius20ms);
    const w1 = Math.min(totalWindows - 1, i + radius20ms);
    let m = 0;
    let mIdx = i;
    for (let w = w0; w <= w1; w++) {
      if (onsets[w] > m) {
        m = onsets[w];
        mIdx = w;
      }
    }
    maxOnset20ms[i] = m;
    maxOnset20msIdx[i] = mIdx;
  }

  let bestBpm = baseBpm;
  let bestPhaseOffset = 0;
  let bestGridScore = -1;
  const invWindowSec = 1 / windowSec;
  const phaseSteps = 32;

  for (let k = -40; k <= 40; k++) {
    const candBpm = baseBpm * (1 + k * 0.0005);
    const candInterval = 60 / candBpm;

    for (let p = 0; p < phaseSteps; p++) {
      const phaseOff = (p / phaseSteps) * candInterval;
      let score = 0;
      for (let t = phaseOff; t < duration; t += candInterval) {
        const wIdx = Math.round(t * invWindowSec);
        if (wIdx >= 0 && wIdx < totalWindows) {
          const peakVal = maxOnset20ms[wIdx];
          if (peakVal > 0) {
            const peakTime = maxOnset20msIdx[wIdx] * windowSec;
            const distNorm = Math.min(1, Math.abs(t - peakTime) / 0.02);
            score += peakVal * (1 - 1e-3 * distNorm);
          }
        }
      }
      if (score > bestGridScore) {
        bestGridScore = score;
        bestBpm = candBpm;
        bestPhaseOffset = phaseOff;
      }
    }
  }

  if (options?.signal?.aborted) throw new Error("Analysis aborted");
  options?.onProgress?.(70);
  await yieldToMainThread();

  // 4. Beat Alignment: search strongest onset within ±50ms, 5-beat median filter, clamp ±40ms,
  //    apply correction to grid, and re-estimate BPM & phase via weighted least squares
  const radius50ms = Math.max(1, Math.round(0.05 / windowSec));
  const strongOnsetThreshold = 0.12;

  const findStrongestOnsetNear = (targetTime: number): { time: number; strength: number; offset: number } => {
    const centerW = Math.round(targetTime * invWindowSec);
    const w0 = Math.max(0, centerW - radius50ms);
    const w1 = Math.min(totalWindows - 1, centerW + radius50ms);

    let bestW = Math.min(totalWindows - 1, Math.max(0, centerW));
    let maxVal = -1;
    for (let w = w0; w <= w1; w++) {
      if (onsets[w] > maxVal) {
        maxVal = onsets[w];
        bestW = w;
      }
    }

    if (maxVal <= 0) {
      return { time: targetTime, strength: 0, offset: 0 };
    }

    // Sub-window parabolic interpolation around bestW
    let subW = bestW;
    if (bestW > 0 && bestW < totalWindows - 1) {
      const y0 = onsets[bestW - 1];
      const y1 = onsets[bestW];
      const y2 = onsets[bestW + 1];
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > 1e-9 && y1 >= y0 && y1 >= y2) {
        const delta = (0.5 * (y0 - y2)) / denom;
        if (Math.abs(delta) <= 0.5) {
          subW = bestW + delta;
        }
      }
    }

    const onsetTime = subW * windowSec;
    return {
      time: onsetTime,
      strength: maxVal,
      offset: onsetTime - targetTime,
    };
  };

  // Build grid & measure per-beat offsets within ±50ms
  const baseInterval = 60 / bestBpm;
  const gridTimes: number[] = [];
  const rawOffsets: number[] = [];
  const onsetWeights: number[] = [];
  let matchedStrongBeats = 0;

  for (let t = bestPhaseOffset; t < duration; t += baseInterval) {
    gridTimes.push(t);
    const hit = findStrongestOnsetNear(t);

    if (hit.strength >= strongOnsetThreshold) {
      matchedStrongBeats++;
      rawOffsets.push(hit.offset);
      onsetWeights.push(hit.strength);
    } else {
      rawOffsets.push(0);
      onsetWeights.push(0.01);
    }
  }

  const numBeats = gridTimes.length;
  const alignedBeats = new Array<number>(numBeats);

  for (let i = 0; i < numBeats; i++) {
    const o0 = rawOffsets[Math.max(0, i - 2)];
    const o1 = rawOffsets[Math.max(0, i - 1)];
    const o2 = rawOffsets[i];
    const o3 = rawOffsets[Math.min(numBeats - 1, i + 1)];
    const o4 = rawOffsets[Math.min(numBeats - 1, i + 2)];
    const med = medianOf5(o0, o1, o2, o3, o4);
    const clampedOffset = Math.max(-0.04, Math.min(0.04, med));
    alignedBeats[i] = Math.max(0, Math.min(duration, gridTimes[i] + clampedOffset));
  }

  // Weighted Least Squares (weight = onset strength) to re-estimate fractional BPM and phase
  let finalBpm = bestBpm;
  let finalOffset = bestPhaseOffset;

  if (numBeats >= 2) {
    let sumW = 0;
    let sumWX = 0;
    let sumWY = 0;
    for (let i = 0; i < numBeats; i++) {
      const w = Math.max(0.01, onsetWeights[i]);
      sumW += w;
      sumWX += w * i;
      sumWY += w * alignedBeats[i];
    }
    const meanX = sumWX / sumW;
    const meanY = sumWY / sumW;

    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < numBeats; i++) {
      const w = Math.max(0.01, onsetWeights[i]);
      const dx = i - meanX;
      const dy = alignedBeats[i] - meanY;
      sxx += w * dx * dx;
      sxy += w * dx * dy;
    }

    if (sxx > 1e-9) {
      const wlsInterval = sxy / sxx;
      if (wlsInterval > 0.25 && wlsInterval < 1.2) {
        finalBpm = 60 / wlsInterval;
        const rawIntercept = meanY - wlsInterval * meanX;
        finalOffset = ((rawIntercept % wlsInterval) + wlsInterval) % wlsInterval;
      }
    }
  }

  const gridConfidence = numBeats > 0 ? Number((matchedStrongBeats / numBeats).toFixed(3)) : 0;

  // 5. Meter Detection: compare grouping by 3 vs 4 (first beat of group vs remaining beats)
  // Choose 3 only if it outperforms 4 by >= 20%, otherwise 4.
  const sortedBass = Float32Array.from(bassEnergies).sort();
  let bassP95 = sortedBass[Math.min(totalWindows - 1, Math.floor(totalWindows * 0.95))] || 0;
  if (bassP95 <= 1e-6) {
    let firstActiveBass = 0;
    while (firstActiveBass < totalWindows && sortedBass[firstActiveBass] <= 1e-6) {
      firstActiveBass++;
    }
    const activeBassCount = totalWindows - firstActiveBass;
    if (activeBassCount > 0) {
      bassP95 = sortedBass[firstActiveBass + Math.min(activeBassCount - 1, Math.floor(activeBassCount * 0.95))];
    }
  }
  bassP95 = Math.max(0.0001, bassP95);

  const beatAccentScores = new Float32Array(numBeats);
  for (let i = 0; i < numBeats; i++) {
    const wIdx = Math.min(totalWindows - 1, Math.max(0, Math.round(alignedBeats[i] * invWindowSec)));
    const w0 = Math.max(0, wIdx - 1);
    const w1 = Math.min(totalWindows - 1, wIdx + 1);
    let maxB = 0;
    let maxO = 0;
    for (let w = w0; w <= w1; w++) {
      const nb = bassEnergies[w] / bassP95;
      if (nb > maxB) maxB = nb;
      if (onsets[w] > maxO) maxO = onsets[w];
    }
    beatAccentScores[i] = maxB + maxO;
  }

  const evaluateMeter = (meter: 3 | 4): { bestPhase: number; contrastRatio: number } => {
    let bestPhase = 0;
    let bestRatio = 0;
    for (let phase = 0; phase < meter; phase++) {
      let firstSum = 0;
      let firstCount = 0;
      let restSum = 0;
      let restCount = 0;
      for (let i = 0; i < numBeats; i++) {
        if (i % meter === phase) {
          firstSum += beatAccentScores[i];
          firstCount++;
        } else {
          restSum += beatAccentScores[i];
          restCount++;
        }
      }
      const firstAvg = firstCount > 0 ? firstSum / firstCount : 0;
      const restAvg = restCount > 0 ? restSum / restCount : 0.0001;
      // Excess of first beat over remaining beats
      const excessRatio = Math.max(0, (firstAvg - restAvg) / Math.max(0.0001, restAvg));
      if (excessRatio > bestRatio) {
        bestRatio = excessRatio;
        bestPhase = phase;
      }
    }
    return { bestPhase, contrastRatio: bestRatio };
  };

  const meter3 = evaluateMeter(3);
  const meter4 = evaluateMeter(4);

  const beatsPerBar =
    meter3.contrastRatio > 0.05 && meter3.contrastRatio >= meter4.contrastRatio * 1.2
      ? 3
      : 4;
  const bestDownbeatPhase = beatsPerBar === 3 ? meter3.bestPhase : meter4.bestPhase;

  // 6. Smooth Energy Curve (normalized by 95th percentile of RMS) & Section Classification (p30 / p75)
  const sortedRms = Float32Array.from(rmsEnergies).sort();
  const rmsP95 = Math.max(
    0.0001,
    sortedRms[Math.min(totalWindows - 1, Math.floor(totalWindows * 0.95))] || maxRms
  );

  const rmsPrefix = new Float64Array(totalWindows + 1);
  for (let i = 0; i < totalWindows; i++) {
    rmsPrefix[i + 1] = rmsPrefix[i] + rmsEnergies[i];
  }

  const smoothRadius = Math.max(1, Math.floor(0.25 / windowSec));
  const energyCurve: Array<{ time: number; energy: number }> = [];
  const rawNormalizedCurve: number[] = [];
  const curveStep = Math.max(1, Math.floor(0.1 / windowSec)); // 100ms interval for curve

  for (let i = 0; i < totalWindows; i += curveStep) {
    const w0 = Math.max(0, i - smoothRadius);
    const w1 = Math.min(totalWindows - 1, i + smoothRadius);
    const avgRms = (rmsPrefix[w1 + 1] - rmsPrefix[w0]) / (w1 - w0 + 1);
    const unclippedNorm = avgRms / rmsP95;
    const normE = Math.min(1, unclippedNorm);
    rawNormalizedCurve.push(unclippedNorm);
    energyCurve.push({
      time: Number((i * windowSec).toFixed(3)),
      energy: Number(normE.toFixed(3)),
    });
  }

  const sortedCurve = [...rawNormalizedCurve].sort((a, b) => a - b);
  const p30 = sortedCurve.length > 0
    ? sortedCurve[Math.min(sortedCurve.length - 1, Math.floor(sortedCurve.length * 0.30))]
    : 0.28;
  const p75 = sortedCurve.length > 0
    ? sortedCurve[Math.min(sortedCurve.length - 1, Math.floor(sortedCurve.length * 0.75))]
    : 0.72;
  const hasDynamicVariation = p75 - p30 >= 0.02;

  const sections: MusicSection[] = [];
  const secWindowSize = Math.max(1, Math.floor(1.5 / 0.1)); // 1.5s minimum section length
  let curSecType: MusicSectionType = "verse";
  let curSecStart = 0;
  let curSecEnergySum = 0;
  let curSecCount = 0;
  let curSecPeak = 0;

  for (let c = 0; c < energyCurve.length; c++) {
    const pt = energyCurve[c];
    const rawVal = rawNormalizedCurve[c];
    curSecEnergySum += pt.energy;
    curSecCount++;
    if (pt.energy > curSecPeak) curSecPeak = pt.energy;

    // Short-term trend / derivative over 2 seconds
    const prevPt = energyCurve[Math.max(0, c - 20)];
    const slope = prevPt ? (pt.energy - prevPt.energy) / Math.max(0.1, pt.time - prevPt.time) : 0;

    let determinedType: MusicSectionType = "verse";
    if (hasDynamicVariation && rawVal < p30) {
      determinedType = "calm";
    } else if (slope > 0.18 && pt.energy < 0.85) {
      determinedType = "buildup";
    } else if (hasDynamicVariation && rawVal >= p75) {
      determinedType = "drop";
    } else {
      determinedType = "verse";
    }

    if (c === 0) {
      curSecType = determinedType;
    } else if (determinedType !== curSecType && c - Math.floor(curSecStart / 0.1) >= secWindowSize) {
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

  sections.push({
    type: curSecType,
    start: Number(curSecStart.toFixed(2)),
    end: Number(duration.toFixed(2)),
    avgEnergy: Number((curSecEnergySum / (curSecCount || 1)).toFixed(2)),
    peakEnergy: Number(curSecPeak.toFixed(2)),
  });

  // 7. Construct Detailed Beat Points from Final Aligned Beats
  const beatTimes: number[] = [];
  const downbeats: number[] = [];
  const strongBeats: number[] = [];
  const peaks: number[] = [];
  const fullBeats: BeatPoint[] = [];

  for (let beatCounter = 0; beatCounter < numBeats; beatCounter++) {
    const t = alignedBeats[beatCounter];
    const timeRound = Number(t.toFixed(3));
    beatTimes.push(timeRound);

    const wIdx = Math.min(totalWindows - 1, Math.max(0, Math.round(t * invWindowSec)));
    const localOnset = Math.min(1, maxOnset20ms[wIdx]);
    const localRms = rmsEnergies[wIdx];
    const normLocalEnergy = Math.min(1, localRms / rmsP95);

    const isDownbeat = beatCounter % beatsPerBar === bestDownbeatPhase;
    const isStrong =
      isDownbeat ||
      (beatsPerBar === 4 && beatCounter % 4 === (bestDownbeatPhase + 2) % 4) ||
      localOnset > 0.6;

    if (isDownbeat) downbeats.push(timeRound);
    if (isStrong) strongBeats.push(timeRound);

    const sec = sections.find((s) => t >= s.start && t <= s.end) || sections[0];

    fullBeats.push({
      time: timeRound,
      strength: Number(Math.min(1, localOnset).toFixed(3)),
      isDownbeat,
      isStrong,
      section: sec ? sec.type : "verse",
      energy: Number(normLocalEnergy.toFixed(3)),
    });
  }

  // Peak detection for abrupt major hits
  for (let i = 2; i < totalWindows - 2; i++) {
    const e = rmsEnergies[i];
    const prev = rmsEnergies[i - 1];
    const next = rmsEnergies[i + 1];
    const avgLocal = (rmsEnergies[i - 2] + rmsEnergies[i - 1] + rmsEnergies[i + 1] + rmsEnergies[i + 2]) / 4;

    if (e > prev && e > next && e > avgLocal * 1.35 && e > rmsP95 * 0.3) {
      peaks.push(Number((i * windowSec).toFixed(3)));
    }
  }

  options?.onProgress?.(100);

  return {
    bpm: Number(finalBpm.toFixed(4)),
    offset: Number(finalOffset.toFixed(4)),
    beatTimes,
    downbeats,
    strongBeats,
    peaks: peaks.length > 0 ? peaks : beatTimes,
    beats: fullBeats,
    energyCurve,
    sections,
    duration,
    beatsPerBar,
    gridConfidence,
  };
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

    return await analyzeAudioBuffer(audioBuffer, options);
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
