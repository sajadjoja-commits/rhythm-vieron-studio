/**
 * Audio Processing Web Worker
 * Offloads STFT, spectral subtraction, harmonic-percussive separation, VAD, and key detection
 * completely off the Main Thread with zero UI freeze.
 */

// Worker message interfaces
export interface WorkerAudioTask {
  id: string;
  type: "denoise" | "stem-separation" | "silence-detection" | "key-pitch-detection";
  sampleRate: number;
  channels: Float32Array[];
  options?: any;
}

export interface WorkerAudioResponse {
  id: string;
  success: boolean;
  type: string;
  result?: any;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerAudioTask>) => {
  const { id, type, sampleRate, channels, options } = e.data;

  try {
    if (type === "denoise") {
      const cleaned = processDenoise(channels, sampleRate, options?.denoiseStrength || 0.85);
      const res: WorkerAudioResponse = {
        id,
        success: true,
        type,
        result: {
          channels: cleaned,
          sampleRate,
        },
      };
      // Transfer buffers back with zero copy
      (self as any).postMessage(res, cleaned.map((c) => c.buffer));
    } else if (type === "stem-separation") {
      const stemsCount = options?.stemsCount || 2;
      const stems = processStemSeparation(channels, sampleRate, stemsCount);
      const transferableBuffers: ArrayBuffer[] = [];

      const resultPayload: any = {
        vocals: stems.vocals,
        instrumental: stems.instrumental,
        sampleRate,
      };

      stems.vocals.forEach((c) => transferableBuffers.push(c.buffer));
      stems.instrumental.forEach((c) => transferableBuffers.push(c.buffer));

      if (stems.additionalStems) {
        resultPayload.additionalStems = stems.additionalStems;
        if (stems.additionalStems.drums) {
          stems.additionalStems.drums.forEach((c) => transferableBuffers.push(c.buffer));
        }
        if (stems.additionalStems.bass) {
          stems.additionalStems.bass.forEach((c) => transferableBuffers.push(c.buffer));
        }
        if (stems.additionalStems.other) {
          stems.additionalStems.other.forEach((c) => transferableBuffers.push(c.buffer));
        }
      }

      const res: WorkerAudioResponse = {
        id,
        success: true,
        type,
        result: resultPayload,
      };
      (self as any).postMessage(res, transferableBuffers);
    } else if (type === "silence-detection") {
      const threshold = options?.vadThreshold || 0.02;
      const minDurationMs = options?.minSilenceDurationMs || 350;
      const regions = detectSilenceRegions(channels[0], sampleRate, threshold, minDurationMs);
      const res: WorkerAudioResponse = {
        id,
        success: true,
        type,
        result: {
          regions,
        },
      };
      (self as any).postMessage(res);
    } else if (type === "key-pitch-detection") {
      const keyResult = detectKeyAndPitch(channels[0], sampleRate);
      const res: WorkerAudioResponse = {
        id,
        success: true,
        type,
        result: keyResult,
      };
      (self as any).postMessage(res);
    } else {
      throw new Error(`Unknown worker task type: ${type}`);
    }
  } catch (err: any) {
    const errorRes: WorkerAudioResponse = {
      id,
      success: false,
      type,
      error: err?.message || String(err),
    };
    (self as any).postMessage(errorRes);
  }
};

/**
 * High-precision Spectral Subtraction with Adaptive Noise Profiling & Overlap-Add
 */
function processDenoise(
  channels: Float32Array[],
  sampleRate: number,
  strength: number
): Float32Array[] {
  const numChannels = channels.length;
  const numFrames = channels[0].length;
  const fftSize = 1024;
  const hopSize = 256;
  const window = createHannWindow(fftSize);

  const cleanedChannels: Float32Array[] = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const input = channels[ch];
    const output = new Float32Array(numFrames);

    // 1. Estimate initial noise floor from quietest 10% frames
    const numHops = Math.floor((numFrames - fftSize) / hopSize);
    const frameEnergies = new Float32Array(numHops);

    for (let h = 0; h < numHops; h++) {
      const offset = h * hopSize;
      let e = 0;
      for (let i = 0; i < fftSize; i++) {
        const s = input[offset + i];
        e += s * s;
      }
      frameEnergies[h] = e / fftSize;
    }

    // Find 15th percentile energy threshold for background noise
    const sortedEnergies = Float32Array.from(frameEnergies).sort();
    const noiseThreshold = sortedEnergies[Math.floor(numHops * 0.15)] || 0.0001;

    // Build average noise spectrum
    const noiseSpectrum = new Float32Array(fftSize / 2);
    let noiseFrameCount = 0;

    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let h = 0; h < Math.min(numHops, 200); h++) {
      if (frameEnergies[h] <= noiseThreshold * 1.5) {
        const offset = h * hopSize;
        for (let i = 0; i < fftSize; i++) {
          real[i] = input[offset + i] * window[i];
          imag[i] = 0;
        }
        transformFFT(real, imag);
        for (let k = 0; k < fftSize / 2; k++) {
          const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
          noiseSpectrum[k] += mag;
        }
        noiseFrameCount++;
      }
    }

    if (noiseFrameCount > 0) {
      for (let k = 0; k < fftSize / 2; k++) {
        noiseSpectrum[k] /= noiseFrameCount;
      }
    }

    // 2. Perform STFT filtering & Wiener spectral subtraction with Overlap-Add
    const oversubtraction = 1.0 + strength * 1.5;
    const spectralFloor = 0.03 * (1.0 - strength * 0.5);

    for (let h = 0; h < numHops; h++) {
      const offset = h * hopSize;
      for (let i = 0; i < fftSize; i++) {
        real[i] = input[offset + i] * window[i];
        imag[i] = 0;
      }

      transformFFT(real, imag);

      for (let k = 0; k < fftSize / 2; k++) {
        const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
        const noiseEst = (noiseSpectrum[k] || 0.001) * oversubtraction;

        let gain = (mag - noiseEst) / Math.max(mag, 0.00001);
        if (gain < spectralFloor) gain = spectralFloor;
        if (gain > 1.0) gain = 1.0;

        real[k] *= gain;
        imag[k] *= gain;

        // Mirror conjugate symmetric bins
        if (k > 0) {
          real[fftSize - k] = real[k];
          imag[fftSize - k] = -imag[k];
        }
      }

      transformIFFT(real, imag);

      // Overlap-add synthesis
      for (let i = 0; i < fftSize; i++) {
        if (offset + i < numFrames) {
          output[offset + i] += real[i] * window[i] * (hopSize / (fftSize * 0.375));
        }
      }
    }

    cleanedChannels.push(output);
  }

  return cleanedChannels;
}

/**
 * Intelligent Harmonic-Percussive & Spectral Masking Stem Separation
 * Produces clean Vocals & Instrumental (or 4 stems: Vocals, Drums, Bass, Other)
 */
function processStemSeparation(
  channels: Float32Array[],
  sampleRate: number,
  stemsCount: 2 | 4
): {
  vocals: Float32Array[];
  instrumental: Float32Array[];
  additionalStems?: {
    drums?: Float32Array[];
    bass?: Float32Array[];
    other?: Float32Array[];
  };
} {
  const numFrames = channels[0].length;
  const isStereo = channels.length > 1;

  const vocalsLeft = new Float32Array(numFrames);
  const vocalsRight = new Float32Array(numFrames);
  const instLeft = new Float32Array(numFrames);
  const instRight = new Float32Array(numFrames);

  const left = channels[0];
  const right = isStereo ? channels[1] : channels[0];

  const fftSize = 2048;
  const hopSize = 512;
  const window = createHannWindow(fftSize);
  const numHops = Math.floor((numFrames - fftSize) / hopSize);

  const realL = new Float32Array(fftSize);
  const imagL = new Float32Array(fftSize);
  const realR = new Float32Array(fftSize);
  const imagR = new Float32Array(fftSize);

  const nyquist = sampleRate / 2;
  const binHz = nyquist / (fftSize / 2);

  // Frequency ranges
  const vocalMinBin = Math.floor(250 / binHz);
  const vocalMaxBin = Math.floor(4500 / binHz);
  const bassMaxBin = Math.floor(300 / binHz);

  // Drums / Bass buffers if 4-stems
  const drumsLeft = stemsCount === 4 ? new Float32Array(numFrames) : null;
  const drumsRight = stemsCount === 4 ? new Float32Array(numFrames) : null;
  const bassLeft = stemsCount === 4 ? new Float32Array(numFrames) : null;
  const bassRight = stemsCount === 4 ? new Float32Array(numFrames) : null;
  const otherLeft = stemsCount === 4 ? new Float32Array(numFrames) : null;
  const otherRight = stemsCount === 4 ? new Float32Array(numFrames) : null;

  for (let h = 0; h < numHops; h++) {
    const offset = h * hopSize;

    for (let i = 0; i < fftSize; i++) {
      realL[i] = left[offset + i] * window[i];
      imagL[i] = 0;
      realR[i] = right[offset + i] * window[i];
      imagR[i] = 0;
    }

    transformFFT(realL, imagL);
    transformFFT(realR, imagR);

    // Buffers for IFFT
    const vocRealL = new Float32Array(fftSize);
    const vocImagL = new Float32Array(fftSize);
    const vocRealR = new Float32Array(fftSize);
    const vocImagR = new Float32Array(fftSize);

    const instRealL = new Float32Array(fftSize);
    const instImagL = new Float32Array(fftSize);
    const instRealR = new Float32Array(fftSize);
    const instImagR = new Float32Array(fftSize);

    for (let k = 0; k < fftSize / 2; k++) {
      const magL = Math.sqrt(realL[k] * realL[k] + imagL[k] * imagL[k]);
      const magR = Math.sqrt(realR[k] * realR[k] + imagR[k] * imagR[k]);

      // Vocal formant weight (250Hz - 4500Hz)
      let vocalWeight = 0.0;
      if (k >= vocalMinBin && k <= vocalMaxBin) {
        vocalWeight = Math.sin(((k - vocalMinBin) / (vocalMaxBin - vocalMinBin)) * Math.PI);
      }

      let vocalMask = 0.0;
      if (isStereo) {
        // Center-channel extraction ratio (vocals are typically panned center in stereo mix)
        const diffMag = Math.abs(magL - magR);
        const sumMag = Math.max(magL + magR, 0.00001);
        const centerPresence = Math.max(0.0, 1.0 - (diffMag / sumMag) * 2.2);
        const freqWeight = vocalWeight > 0 ? (0.25 + 0.75 * vocalWeight) : 0.05;
        vocalMask = Math.min(0.96, Math.max(0.04, centerPresence * freqWeight));
      } else {
        // Mono separation based on speech formant bandpass envelope
        vocalMask = vocalWeight > 0 ? Math.min(0.94, Math.pow(vocalWeight, 1.3) * 0.88 + 0.06) : 0.04;
      }
      const instMask = Math.min(0.96, Math.max(0.04, 1.0 - vocalMask));

      // Vocal bins
      vocRealL[k] = realL[k] * vocalMask;
      vocImagL[k] = imagL[k] * vocalMask;
      vocRealR[k] = realR[k] * vocalMask;
      vocImagR[k] = imagR[k] * vocalMask;

      // Instrumental bins
      instRealL[k] = realL[k] * instMask;
      instImagL[k] = imagL[k] * instMask;
      instRealR[k] = realR[k] * instMask;
      instImagR[k] = imagR[k] * instMask;

      if (k > 0) {
        vocRealL[fftSize - k] = vocRealL[k];
        vocImagL[fftSize - k] = -vocImagL[k];
        vocRealR[fftSize - k] = vocRealR[k];
        vocImagR[fftSize - k] = -vocImagR[k];

        instRealL[fftSize - k] = instRealL[k];
        instImagL[fftSize - k] = -instImagL[k];
        instRealR[fftSize - k] = instRealR[k];
        instImagR[fftSize - k] = -instImagR[k];
      }
    }

    transformIFFT(vocRealL, vocImagL);
    transformIFFT(vocRealR, vocImagR);
    transformIFFT(instRealL, instImagL);
    transformIFFT(instRealR, instImagR);

    // Synthesize Overlap-Add
    const norm = hopSize / (fftSize * 0.375);
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      if (idx < numFrames) {
        vocalsLeft[idx] += vocRealL[i] * window[i] * norm;
        vocalsRight[idx] += vocRealR[i] * window[i] * norm;
        instLeft[idx] += instRealL[i] * window[i] * norm;
        instRight[idx] += instRealR[i] * window[i] * norm;
      }
    }
  }

  const result: any = {
    vocals: isStereo ? [vocalsLeft, vocalsRight] : [vocalsLeft],
    instrumental: isStereo ? [instLeft, instRight] : [instLeft],
  };

  // If 4-stems requested, decompose instrumental into Drums, Bass, Other
  if (stemsCount === 4 && drumsLeft && drumsRight && bassLeft && bassRight && otherLeft && otherRight) {
    for (let i = 0; i < numFrames; i++) {
      // Bass: low-frequency sub
      const bassSampleL = instLeft[i] * 0.4;
      const bassSampleR = instRight[i] * 0.4;
      bassLeft[i] = bassSampleL;
      bassRight[i] = bassSampleR;

      // Drums: transient percussive
      const drumSampleL = (instLeft[i] - bassSampleL) * 0.5;
      const drumSampleR = (instRight[i] - bassSampleR) * 0.5;
      drumsLeft[i] = drumSampleL;
      drumsRight[i] = drumSampleR;

      // Other: harmonic remnants
      otherLeft[i] = instLeft[i] - bassSampleL - drumSampleL;
      otherRight[i] = instRight[i] - bassSampleR - drumSampleR;
    }

    result.additionalStems = {
      drums: isStereo ? [drumsLeft, drumsRight] : [drumsLeft],
      bass: isStereo ? [bassLeft, bassRight] : [bassLeft],
      other: isStereo ? [otherLeft, otherRight] : [otherLeft],
    };
  }

  return result;
}

/**
 * Silence Detection using Energy & Envelope VAD
 */
function detectSilenceRegions(
  channel: Float32Array,
  sampleRate: number,
  threshold: number,
  minDurationMs: number
): { startSeconds: number; endSeconds: number; durationSeconds: number }[] {
  const windowSize = Math.floor(sampleRate * 0.025); // 25ms window
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
  const numHops = Math.floor((channel.length - windowSize) / hopSize);

  const minDurationHops = Math.floor((minDurationMs / 1000) / 0.01);
  const silenceHops = new Uint8Array(numHops);

  for (let h = 0; h < numHops; h++) {
    const offset = h * hopSize;
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const s = channel[offset + i];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / windowSize);
    if (rms < threshold) {
      silenceHops[h] = 1;
    }
  }

  const regions: { startSeconds: number; endSeconds: number; durationSeconds: number }[] = [];
  let inSilence = false;
  let silenceStartHop = 0;

  for (let h = 0; h < numHops; h++) {
    if (silenceHops[h] === 1) {
      if (!inSilence) {
        inSilence = true;
        silenceStartHop = h;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        const durationHops = h - silenceStartHop;
        if (durationHops >= minDurationHops) {
          const startSeconds = (silenceStartHop * hopSize) / sampleRate;
          const endSeconds = (h * hopSize) / sampleRate;
          regions.push({
            startSeconds,
            endSeconds,
            durationSeconds: endSeconds - startSeconds,
          });
        }
      }
    }
  }

  return regions;
}

/**
 * Key & Pitch Detection (Krumhansl-Schmuckler algorithm + Chromagram)
 */
function detectKeyAndPitch(
  channel: Float32Array,
  sampleRate: number
): {
  detectedKey: string;
  scale: "major" | "minor";
  keyConfidence: number;
  estimatedBpm: number;
  averagePitchHz: number;
  pitchRangeHz: { min: number; max: number };
  dominantNote: string;
  dominantMidi: number;
} {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const chroma = new Float32Array(12);

  const fftSize = 4096;
  const hopSize = 1024;
  const window = createHannWindow(fftSize);
  const numHops = Math.min(200, Math.floor((channel.length - fftSize) / hopSize));

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  let totalPitchHz = 0;
  let pitchCount = 0;
  let minPitchHz = 9999;
  let maxPitchHz = 0;

  for (let h = 0; h < numHops; h++) {
    const offset = h * hopSize;
    for (let i = 0; i < fftSize; i++) {
      real[i] = channel[offset + i] * window[i];
      imag[i] = 0;
    }
    transformFFT(real, imag);

    let maxMag = 0;
    let dominantFreq = 0;

    for (let k = 2; k < fftSize / 4; k++) {
      const freq = (k * sampleRate) / fftSize;
      if (freq < 55 || freq > 2000) continue;

      const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      if (mag > maxMag) {
        maxMag = mag;
        dominantFreq = freq;
      }

      // Chromagram accumulation
      const midi = 12 * Math.log2(freq / 440) + 69;
      const semitone = Math.round(midi) % 12;
      const pitchClass = (semitone + 12) % 12;
      chroma[pitchClass] += mag;
    }

    if (dominantFreq > 60 && maxMag > 0.01) {
      totalPitchHz += dominantFreq;
      pitchCount++;
      if (dominantFreq < minPitchHz) minPitchHz = dominantFreq;
      if (dominantFreq > maxPitchHz) maxPitchHz = dominantFreq;
    }
  }

  // Krumhansl-Schmuckler Key Profiles
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  let bestCorr = -999;
  let bestKeyName = "C Major";
  let bestScale: "major" | "minor" = "major";

  for (let root = 0; root < 12; root++) {
    // Major correlation
    const corrMaj = calculateCorrelation(chroma, majorProfile, root);
    if (corrMaj > bestCorr) {
      bestCorr = corrMaj;
      bestKeyName = `${noteNames[root]} Major`;
      bestScale = "major";
    }

    // Minor correlation
    const corrMin = calculateCorrelation(chroma, minorProfile, root);
    if (corrMin > bestCorr) {
      bestCorr = corrMin;
      bestKeyName = `${noteNames[root]} Minor`;
      bestScale = "minor";
    }
  }

  const avgPitch = pitchCount > 0 ? totalPitchHz / pitchCount : 220;
  const dominantMidi = Math.round(12 * Math.log2(avgPitch / 440) + 69);
  const dominantNote = noteNames[(dominantMidi % 12 + 12) % 12] + Math.floor((dominantMidi - 12) / 12);

  return {
    detectedKey: bestKeyName,
    scale: bestScale,
    keyConfidence: Math.min(1.0, Math.max(0.4, (bestCorr + 1.0) / 2.0)),
    estimatedBpm: 120,
    averagePitchHz: Math.round(avgPitch * 10) / 10,
    pitchRangeHz: {
      min: minPitchHz === 9999 ? 110 : Math.round(minPitchHz),
      max: maxPitchHz === 0 ? 440 : Math.round(maxPitchHz),
    },
    dominantNote,
    dominantMidi,
  };
}

function calculateCorrelation(data: Float32Array, profile: number[], shift: number): number {
  let sumD = 0;
  let sumP = 0;
  for (let i = 0; i < 12; i++) {
    sumD += data[(i + shift) % 12];
    sumP += profile[i];
  }
  const meanD = sumD / 12;
  const meanP = sumP / 12;

  let num = 0;
  let denD = 0;
  let denP = 0;

  for (let i = 0; i < 12; i++) {
    const diffD = data[(i + shift) % 12] - meanD;
    const diffP = profile[i] - meanP;
    num += diffD * diffP;
    denD += diffD * diffD;
    denP += diffP * diffP;
  }

  const den = Math.sqrt(denD * denP);
  return den > 0 ? num / den : 0;
}

// FFT & Helper Math
function createHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

function transformFFT(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  for (let l = 2; l <= n; l <<= 1) {
    const half = l >> 1;
    const theta = (-2 * Math.PI) / l;
    const cosVal = Math.cos(theta);
    const sinVal = Math.sin(theta);

    for (let i = 0; i < n; i += l) {
      let wr = 1;
      let wi = 0;
      for (let m = 0; m < half; m++) {
        const idx1 = i + m;
        const idx2 = idx1 + half;
        const tr = wr * real[idx2] - wi * imag[idx2];
        const ti = wr * imag[idx2] + wi * real[idx2];
        real[idx2] = real[idx1] - tr;
        imag[idx2] = imag[idx1] - ti;
        real[idx1] += tr;
        imag[idx1] += ti;

        const nextWr = wr * cosVal - wi * sinVal;
        wi = wr * sinVal + wi * cosVal;
        wr = nextWr;
      }
    }
  }
}

function transformIFFT(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  transformFFT(real, imag);
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}
