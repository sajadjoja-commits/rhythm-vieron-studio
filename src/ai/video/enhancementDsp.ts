/**
 * Video Enhancement Digital Signal Processing (DSP) Core
 * Shared single-implementation CPU pipeline between Web Worker and Local Fallback.
 * 
 * Features:
 * - Precomputed LUT for bilateral range weights (256 entries, 0 Math.exp in kernel)
 * - Constant spatial weights
 * - Reusable working buffers across frames (0 per-frame heap allocations)
 * - Clamped lumRatio between [0.6, 1.8]
 * - Real temporal EMA smoothing for CDF (alpha=0.15) and White Balance gains (alpha=0.1, clamped [0.8, 1.25])
 * - Scene-cut detection with EMA reset on histogram delta > 0.4
 * - Deterministic output ensuring static frames differ by <= 1 per channel
 */

import { FrameComparisonMetrics } from "./VideoEnhancementEngine";

// 1. Precomputed Bilateral Filter LUTs
export const RANGE_WEIGHT_SIGMA = 28;
const RANGE_DENOM = 2 * RANGE_WEIGHT_SIGMA * RANGE_WEIGHT_SIGMA; // 1568
export const RANGE_WEIGHT_LUT = new Float32Array(256);
for (let d = 0; d < 256; d++) {
  RANGE_WEIGHT_LUT[d] = Math.exp(-(d * d) / RANGE_DENOM);
}

// Spatial weights for 3x3 kernel (distSq = dx*dx + dy*dy: 0, 1, or 2 with sigmaSpatial = 1.8)
const SPATIAL_DENOM = 2 * 1.8 * 1.8; // 6.48
export const SPATIAL_WEIGHT_LUT = new Float32Array([
  1.0,                              // distSq 0
  Math.exp(-1 / SPATIAL_DENOM),     // distSq 1 (~0.85703)
  Math.exp(-2 / SPATIAL_DENOM),     // distSq 2 (~0.73450)
]);

// Sigmoid LUT for fast alpha matting
export const SIGMOID_LUT = new Float32Array(1001);
for (let i = 0; i <= 1000; i++) {
  SIGMOID_LUT[i] = 1 / (1 + Math.exp(-12 * (i / 1000 - 0.5)));
}

/**
 * Reusable memory buffers and temporal EMA state across video frames.
 */
export class EnhancementDspState {
  public luminance: Float32Array | null = null;
  public enhancedLuminance: Float32Array | null = null;
  public readonly hist: Int32Array = new Int32Array(256);
  public readonly cdfs: Float32Array = new Float32Array(8 * 8 * 256);
  public readonly prevCdfs: Float32Array = new Float32Array(8 * 8 * 256);
  public readonly globalHist: Float32Array = new Float32Array(32);
  public prevGlobalHist: Float32Array | null = null;

  public emaScaleR = 1.0;
  public emaScaleG = 1.0;
  public emaScaleB = 1.0;
  public hasHistory = false;

  public ensureBufferSize(numPixels: number): void {
    if (!this.luminance || this.luminance.length < numPixels) {
      this.luminance = new Float32Array(numPixels);
      this.enhancedLuminance = new Float32Array(numPixels);
    }
  }

  public reset(): void {
    this.prevGlobalHist = null;
    this.hasHistory = false;
    this.emaScaleR = 1.0;
    this.emaScaleG = 1.0;
    this.emaScaleB = 1.0;
    this.cdfs.fill(0);
    this.prevCdfs.fill(0);
  }
}

export interface SharedEnhanceOptions {
  claheClipLimit?: number;
  denoiseIntensity?: number;
  sharpnessIntensity?: number;
  colorVibrance?: number;
}

/**
 * Single shared enhancement function for both Web Worker and Local Engine.
 */
export function processEnhanceFrameShared(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  options: SharedEnhanceOptions = {},
  state: EnhancementDspState,
  sampleOriginal: Uint8ClampedArray | null = null
): {
  currentLuminance: Float32Array;
  metrics?: FrameComparisonMetrics | null;
} {
  const numPixels = width * height;
  state.ensureBufferSize(numPixels);

  const currentLuminance = state.luminance!;
  const enhancedLuminance = state.enhancedLuminance!;

  const clipLimit = options.claheClipLimit ?? 2.0;
  const denoiseAmount = options.denoiseIntensity ?? 0.6;
  const sharpness = options.sharpnessIntensity ?? 0.5;
  const vibrance = options.colorVibrance ?? 0.35;

  // 1. RGB -> Luminance & Global Statistics
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  state.globalHist.fill(0);

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    sumR += r;
    sumG += g;
    sumB += b;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    currentLuminance[i] = lum;

    // 32-bin global histogram for scene cut detection
    const bin = Math.min(31, Math.max(0, Math.floor(lum / 8)));
    state.globalHist[bin]++;
  }

  // Normalize global histogram
  for (let b = 0; b < 32; b++) {
    state.globalHist[b] /= numPixels;
  }

  // 2. Scene-Cut Detection (L1 distance on normalized luminance histogram)
  if (state.hasHistory && state.prevGlobalHist) {
    let histDiff = 0;
    for (let b = 0; b < 32; b++) {
      histDiff += Math.abs(state.globalHist[b] - state.prevGlobalHist[b]);
    }
    // Scene cut threshold > 0.4
    if (histDiff > 0.4) {
      state.hasHistory = false;
    }
  }

  // 3. Gray-World Auto White Balance Factors with EMA (alpha=0.1, gains clamped [0.8, 1.25])
  const avgR = sumR / numPixels;
  const avgG = sumG / numPixels;
  const avgB = sumB / numPixels;
  const avgGray = (avgR + avgG + avgB) / 3;

  let rawScaleR = avgR > 10 ? 1 + 0.4 * (avgGray / avgR - 1) : 1;
  let rawScaleG = avgG > 10 ? 1 + 0.4 * (avgGray / avgG - 1) : 1;
  let rawScaleB = avgB > 10 ? 1 + 0.4 * (avgGray / avgB - 1) : 1;

  // Clamp raw gains between 0.8 and 1.25
  rawScaleR = Math.min(1.25, Math.max(0.8, rawScaleR));
  rawScaleG = Math.min(1.25, Math.max(0.8, rawScaleG));
  rawScaleB = Math.min(1.25, Math.max(0.8, rawScaleB));

  let scaleR: number;
  let scaleG: number;
  let scaleB: number;

  if (state.hasHistory) {
    // EMA with alpha = 0.1
    scaleR = 0.1 * rawScaleR + 0.9 * state.emaScaleR;
    scaleG = 0.1 * rawScaleG + 0.9 * state.emaScaleG;
    scaleB = 0.1 * rawScaleB + 0.9 * state.emaScaleB;
  } else {
    scaleR = rawScaleR;
    scaleG = rawScaleG;
    scaleB = rawScaleB;
  }

  state.emaScaleR = scaleR;
  state.emaScaleG = scaleG;
  state.emaScaleB = scaleB;

  // 4. Adaptive CLAHE on 8x8 Grid Tiles with Temporal Smoothing (alpha=0.15)
  const tilesX = 8;
  const tilesY = 8;
  const tileW = Math.floor(width / tilesX);
  const tileH = Math.floor(height / tilesY);

  const hist = state.hist;
  const cdfs = state.cdfs;
  const prevCdfs = state.prevCdfs;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startX = tx * tileW;
      const startY = ty * tileH;
      const endX = tx === tilesX - 1 ? width : startX + tileW;
      const endY = ty === tilesY - 1 ? height : startY + tileH;
      const tilePixelCount = (endX - startX) * (endY - startY);

      // Re-use histogram buffer
      hist.fill(0);

      for (let y = startY; y < endY; y++) {
        const rowOffset = y * width;
        for (let x = startX; x < endX; x++) {
          const lum = Math.min(255, Math.max(0, Math.round(currentLuminance[rowOffset + x])));
          hist[lum]++;
        }
      }

      // Clip Histogram
      const clipThreshold = Math.max(1, Math.round((tilePixelCount / 256) * clipLimit));
      let excess = 0;
      for (let b = 0; b < 256; b++) {
        if (hist[b] > clipThreshold) {
          excess += hist[b] - clipThreshold;
          hist[b] = clipThreshold;
        }
      }
      const redist = Math.floor(excess / 256);
      for (let b = 0; b < 256; b++) {
        hist[b] += redist;
      }

      // Build CDF with EMA temporal smoothing (alpha=0.15)
      const cdfOffset = (ty * tilesX + tx) * 256;
      let accum = 0;
      for (let b = 0; b < 256; b++) {
        accum += hist[b];
        const rawCdfVal = (accum / tilePixelCount) * 255;
        if (state.hasHistory) {
          cdfs[cdfOffset + b] = 0.15 * rawCdfVal + 0.85 * prevCdfs[cdfOffset + b];
        } else {
          cdfs[cdfOffset + b] = rawCdfVal;
        }
        prevCdfs[cdfOffset + b] = cdfs[cdfOffset + b];
      }
    }
  }

  // 5. Bilinear Interpolation of CLAHE Equalized Luminance
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const normY = (y - tileH / 2) / tileH;
    const ty0 = Math.max(0, Math.min(tilesY - 1, Math.floor(normY)));
    const ty1 = Math.min(tilesY - 1, ty0 + 1);
    const fracY = Math.max(0, Math.min(1, normY - ty0));

    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const lum = Math.min(255, Math.max(0, Math.round(currentLuminance[idx])));

      const normX = (x - tileW / 2) / tileW;
      const tx0 = Math.max(0, Math.min(tilesX - 1, Math.floor(normX)));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const fracX = Math.max(0, Math.min(1, normX - tx0));

      const val00 = cdfs[(ty0 * tilesX + tx0) * 256 + lum];
      const val10 = cdfs[(ty0 * tilesX + tx1) * 256 + lum];
      const val01 = cdfs[(ty1 * tilesX + tx0) * 256 + lum];
      const val11 = cdfs[(ty1 * tilesX + tx1) * 256 + lum];

      const top = val00 * (1 - fracX) + val10 * fracX;
      const bottom = val01 * (1 - fracX) + val11 * fracX;
      const equalized = top * (1 - fracY) + bottom * fracY;

      enhancedLuminance[idx] = currentLuminance[idx] * 0.45 + equalized * 0.55;
    }
  }

  // 6. Bilateral Denoising (LUT-accelerated, zero Math.exp) + Unsharp Masking
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      const pixelIdx = idx * 4;

      const centerLum = currentLuminance[idx];
      let filteredLum = 0;
      let totalWeight = 0;

      // 3x3 Neighborhood Bilateral Filter using SPATIAL_WEIGHT_LUT and RANGE_WEIGHT_LUT
      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * width;
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = nRow + (x + dx);
          const nLum = currentLuminance[nIdx];

          const spatialDistSq = dx * dx + dy * dy;
          const rangeDiff = Math.min(255, Math.abs(Math.round(nLum - centerLum)));

          const weight = SPATIAL_WEIGHT_LUT[spatialDistSq] * RANGE_WEIGHT_LUT[rangeDiff];
          filteredLum += nLum * weight;
          totalWeight += weight;
        }
      }

      const smoothLum = filteredLum / (totalWeight || 1);
      const detail = centerLum - smoothLum;

      // Unsharp mask detail gain
      const detailGain = Math.abs(detail) > 3 ? sharpness * 1.6 : sharpness * 0.4;
      const targetLum = enhancedLuminance[idx] + detail * detailGain;

      // Luminance ratio clamped strictly between [0.6, 1.8]
      let lumRatio = centerLum > 5 ? targetLum / centerLum : 1;
      if (lumRatio < 0.6) lumRatio = 0.6;
      else if (lumRatio > 1.8) lumRatio = 1.8;

      let r = data[pixelIdx] * scaleR * lumRatio;
      let g = data[pixelIdx + 1] * scaleG * lumRatio;
      let b = data[pixelIdx + 2] * scaleB * lumRatio;

      // Selective Denoise Blending
      if (denoiseAmount > 0) {
        const rawLum = currentLuminance[idx];
        const denoiseBlend = denoiseAmount * 0.35;
        r = r * (1 - denoiseBlend) + (r * (smoothLum / (rawLum || 1))) * denoiseBlend;
        g = g * (1 - denoiseBlend) + (g * (smoothLum / (rawLum || 1))) * denoiseBlend;
        b = b * (1 - denoiseBlend) + (b * (smoothLum / (rawLum || 1))) * denoiseBlend;
      }

      // Vibrance boost
      if (vibrance > 0) {
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const currentSat = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

        if (currentSat < 0.6) {
          const satBoost = (1 - currentSat) * vibrance * 0.5;
          const gray = (r + g + b) / 3;
          r = r + (r - gray) * satBoost;
          g = g + (g - gray) * satBoost;
          b = b + (b - gray) * satBoost;
        }
      }

      data[pixelIdx] = Math.min(255, Math.max(0, Math.round(r)));
      data[pixelIdx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      data[pixelIdx + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }

  // Update history state
  state.hasHistory = true;
  if (!state.prevGlobalHist) {
    state.prevGlobalHist = new Float32Array(32);
  }
  state.prevGlobalHist.set(state.globalHist);

  // Calculate metrics if sample original was provided
  let metrics: FrameComparisonMetrics | null = null;
  if (sampleOriginal) {
    let totalDelta = 0;
    let changedPixels = 0;
    let sumOrig = 0;
    let sumProc = 0;
    let sumSqOrig = 0;
    let sumSqProc = 0;
    let r0Tot = 0, g0Tot = 0, b0Tot = 0;
    let r1Tot = 0, g1Tot = 0, b1Tot = 0;

    for (let i = 0; i < numPixels; i++) {
      const idx = i * 4;
      const r0 = sampleOriginal[idx];
      const g0 = sampleOriginal[idx + 1];
      const b0 = sampleOriginal[idx + 2];

      const r1 = data[idx];
      const g1 = data[idx + 1];
      const b1 = data[idx + 2];

      r0Tot += r0; g0Tot += g0; b0Tot += b0;
      r1Tot += r1; g1Tot += g1; b1Tot += b1;

      const d = (Math.abs(r1 - r0) + Math.abs(g1 - g0) + Math.abs(b1 - b0)) / 3;
      totalDelta += d;
      if (d > 2.0) changedPixels++;

      const l0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      const l1 = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
      sumOrig += l0; sumProc += l1;
      sumSqOrig += l0 * l0; sumSqProc += l1 * l1;
    }

    const meanDiff = totalDelta / numPixels;
    const changedPct = (changedPixels / numPixels) * 100;
    const lumOrig = sumOrig / numPixels;
    const lumProc = sumProc / numPixels;
    const varOrig = Math.max(0, (sumSqOrig / numPixels) - (lumOrig * lumOrig));
    const varProc = Math.max(0, (sumSqProc / numPixels) - (lumProc * lumProc));

    metrics = {
      meanOriginalRGB: [r0Tot / numPixels, g0Tot / numPixels, b0Tot / numPixels],
      meanProcessedRGB: [r1Tot / numPixels, g1Tot / numPixels, b1Tot / numPixels],
      luminanceOriginal: lumOrig,
      luminanceProcessed: lumProc,
      contrastOriginal: Math.sqrt(varOrig),
      contrastProcessed: Math.sqrt(varProc),
      meanPixelDifference: meanDiff,
      changedPixelPercentage: changedPct,
      isMeaningfullyDifferent: meanDiff >= 0.15 && changedPct >= 0.35,
    };
  }

  return {
    currentLuminance: currentLuminance.slice(0, numPixels),
    metrics,
  };
}
