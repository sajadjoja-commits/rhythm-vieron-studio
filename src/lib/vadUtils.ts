/**
 * Voice Activity Detection (VAD) & Silence Gap Alignment Utility
 * Analyzes audio sample amplitudes to detect natural speech pauses and aligns Whisper caption segment boundaries.
 */

export interface SilenceGap {
  start: number; // Start of silence (in seconds)
  end: number;   // End of silence / resume of voice (in seconds)
  mid: number;   // Midpoint of silence (in seconds)
  duration: number;
}

/**
 * Detect silence gaps in 16kHz Float32 audio data using Web Audio amplitude RMS analysis.
 */
export function detectSilenceGaps(
  float32Data: Float32Array,
  sampleRate = 16000,
  silenceThreshold = 0.012,
  minSilenceDurationSec = 0.12
): SilenceGap[] {
  if (!float32Data || float32Data.length === 0) return [];

  const frameSize = Math.round(sampleRate * 0.02); // 20ms frame
  const frameStep = Math.round(sampleRate * 0.01); // 10ms step
  const totalSamples = float32Data.length;

  let inSilence = false;
  let silenceStartSec = 0;
  const rawGaps: SilenceGap[] = [];

  for (let offset = 0; offset + frameSize <= totalSamples; offset += frameStep) {
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const sample = float32Data[offset + i];
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    const currentTimeSec = offset / sampleRate;

    if (rms < silenceThreshold) {
      if (!inSilence) {
        inSilence = true;
        silenceStartSec = currentTimeSec;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        const silenceEndSec = currentTimeSec;
        const duration = silenceEndSec - silenceStartSec;
        if (duration >= minSilenceDurationSec) {
          rawGaps.push({
            start: Math.round(silenceStartSec * 100) / 100,
            end: Math.round(silenceEndSec * 100) / 100,
            mid: Math.round(((silenceStartSec + silenceEndSec) / 2) * 100) / 100,
            duration: Math.round(duration * 100) / 100,
          });
        }
      }
    }
  }

  // Handle trailing silence
  if (inSilence) {
    const silenceEndSec = totalSamples / sampleRate;
    const duration = silenceEndSec - silenceStartSec;
    if (duration >= minSilenceDurationSec) {
      rawGaps.push({
        start: Math.round(silenceStartSec * 100) / 100,
        end: Math.round(silenceEndSec * 100) / 100,
        mid: Math.round(((silenceStartSec + silenceEndSec) / 2) * 100) / 100,
        duration: Math.round(duration * 100) / 100,
      });
    }
  }

  // Merge gaps that are extremely close to each other (< 40ms separation)
  const mergedGaps: SilenceGap[] = [];
  for (const gap of rawGaps) {
    if (mergedGaps.length === 0) {
      mergedGaps.push({ ...gap });
    } else {
      const prev = mergedGaps[mergedGaps.length - 1];
      if (gap.start - prev.end <= 0.04) {
        prev.end = gap.end;
        prev.mid = Math.round(((prev.start + prev.end) / 2) * 100) / 100;
        prev.duration = Math.round((prev.end - prev.start) * 100) / 100;
      } else {
        mergedGaps.push({ ...gap });
      }
    }
  }

  return mergedGaps;
}

/**
 * Align caption segment start and end times to the nearest detected VAD silence gaps.
 */
export function alignCaptionsToSilenceGaps<T extends { start: number; end: number; text: string }>(
  captions: T[],
  silenceGaps: SilenceGap[],
  audioDuration = 0,
  maxWindowSec = 0.65
): T[] {
  if (!captions || captions.length === 0) return [];
  if (!silenceGaps || silenceGaps.length === 0) return captions;

  const aligned = captions.map((cap) => {
    let newStart = cap.start;
    let newEnd = cap.end;

    // Find best matching silence gap for caption start
    let bestStartGap: SilenceGap | null = null;
    let minStartDist = maxWindowSec + 0.01;

    for (const gap of silenceGaps) {
      // For start of caption, look near gap.end (where speech resumes) or gap.mid
      const dist = Math.abs(cap.start - gap.end);
      if (dist < minStartDist) {
        minStartDist = dist;
        bestStartGap = gap;
      }
    }

    if (bestStartGap && minStartDist <= maxWindowSec) {
      // Snap to gap end (speech resume) if close
      newStart = bestStartGap.end;
    }

    // Find best matching silence gap for caption end
    let bestEndGap: SilenceGap | null = null;
    let minEndDist = maxWindowSec + 0.01;

    for (const gap of silenceGaps) {
      // For end of caption, look near gap.start (where speech pauses) or gap.mid
      const dist = Math.abs(cap.end - gap.start);
      if (dist < minEndDist) {
        minEndDist = dist;
        bestEndGap = gap;
      }
    }

    if (bestEndGap && minEndDist <= maxWindowSec) {
      // Snap to gap start (speech pause) if close
      newEnd = bestEndGap.start;
    }

    // Ensure start < end
    if (newEnd <= newStart) {
      newEnd = Math.max(cap.end, newStart + 0.4);
    }

    return {
      ...cap,
      start: Math.round(newStart * 100) / 100,
      end: Math.round(newEnd * 100) / 100,
    };
  });

  // Resolve overlaps between consecutive captions
  for (let i = 0; i < aligned.length; i++) {
    if (i > 0) {
      const prev = aligned[i - 1];
      const current = aligned[i];
      if (current.start < prev.end) {
        const midPoint = Math.round(((prev.end + current.start) / 2) * 100) / 100;
        prev.end = midPoint;
        current.start = midPoint;
      }
    }

    // Min duration safeguard (0.35s)
    if (aligned[i].end - aligned[i].start < 0.35) {
      aligned[i].end = Math.round((aligned[i].start + 0.35) * 100) / 100;
    }

    if (audioDuration > 0 && aligned[i].end > audioDuration) {
      aligned[i].end = Math.round(audioDuration * 100) / 100;
    }
  }

  return aligned;
}
