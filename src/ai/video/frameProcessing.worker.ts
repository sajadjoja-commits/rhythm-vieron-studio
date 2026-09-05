/**
 * Dedicated Web Worker for CPU-heavy Video Frame Digital Signal Processing (DSP):
 * 1. Adaptive CLAHE (Contrast Limited Adaptive Histogram Equalization)
 * 2. Spatial Bilateral Denoising / Edge-Preserving Blur
 * 3. Unsharp Masking & Detail Refinement
 * 4. Dynamic Vibrance & Gray-World Auto White Balancing
 * 5. Temporal Alpha Smoothing & Transparency Cutout
 * 6. Mathematical Frame Delta & Alpha Verification
 * 
 * Executes off the Main Thread with zero-copy ArrayBuffer transfer.
 */

export interface WorkerEnhancePayload {
  type: "ENHANCE_FRAME";
  id: string;
  width: number;
  height: number;
  dataBuffer: ArrayBuffer;
  options?: {
    claheClipLimit?: number;
    denoiseIntensity?: number;
    sharpnessIntensity?: number;
    colorVibrance?: number;
  };
  prevLuminanceBuffer?: ArrayBuffer | null;
  sampleOriginalBuffer?: ArrayBuffer | null;
}

export interface WorkerSegmentationPayload {
  type: "SEGMENTATION_COMPOSITION";
  id: string;
  width: number;
  height: number;
  dataBuffer: ArrayBuffer;
  maskBuffer: ArrayBuffer;
  maskWidth: number;
  maskHeight: number;
  options?: {
    temporalSmoothing?: number;
    edgeFeather?: number;
    backgroundColor?: string;
    frameIndex?: number;
  };
  prevAlphaBuffer?: ArrayBuffer | null;
  sampleOriginalBuffer?: ArrayBuffer | null;
}

export interface WorkerMetricsPayload {
  type: "CALCULATE_METRICS";
  id: string;
  originalBuffer: ArrayBuffer;
  processedBuffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface WorkerPingPayload {
  type: "PING";
  id?: string;
}

export type WorkerMessageIn =
  | WorkerEnhancePayload
  | WorkerSegmentationPayload
  | WorkerMetricsPayload
  | WorkerPingPayload;

// ---------------------------------------------------------------------------
// DSP ALGORITHMS
// ---------------------------------------------------------------------------

function processEnhancement(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  options: WorkerEnhancePayload["options"] = {},
  prevLuminance: Float32Array | null,
  sampleOriginal: Uint8ClampedArray | null
) {
  const numPixels = width * height;
  const clipLimit = options?.claheClipLimit ?? 2.0;
  const denoiseAmount = options?.denoiseIntensity ?? 0.6;
  const sharpness = options?.sharpnessIntensity ?? 0.5;
  const vibrance = options?.colorVibrance ?? 0.35;

  const currentLuminance = new Float32Array(numPixels);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    sumR += r;
    sumG += g;
    sumB += b;
    currentLuminance[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Gray-World Auto White Balance
  const avgR = sumR / numPixels;
  const avgG = sumG / numPixels;
  const avgB = sumB / numPixels;
  const avgGray = (avgR + avgG + avgB) / 3;

  const scaleR = avgR > 10 ? 1 + 0.4 * (avgGray / avgR - 1) : 1;
  const scaleG = avgG > 10 ? 1 + 0.4 * (avgGray / avgG - 1) : 1;
  const scaleB = avgB > 10 ? 1 + 0.4 * (avgGray / avgB - 1) : 1;

  // Adaptive CLAHE 8x8 Grid
  const tilesX = 8;
  const tilesY = 8;
  const tileW = Math.max(1, Math.floor(width / tilesX));
  const tileH = Math.max(1, Math.floor(height / tilesY));

  const cdfs = new Float32Array(tilesX * tilesY * 256);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startX = tx * tileW;
      const startY = ty * tileH;
      const endX = tx === tilesX - 1 ? width : startX + tileW;
      const endY = ty === tilesY - 1 ? height : startY + tileH;
      const tilePixelCount = (endX - startX) * (endY - startY);

      const hist = new Int32Array(256);
      for (let y = startY; y < endY; y++) {
        const rowOffset = y * width;
        for (let x = startX; x < endX; x++) {
          const lum = Math.min(255, Math.max(0, Math.round(currentLuminance[rowOffset + x])));
          hist[lum]++;
        }
      }

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

      const cdfOffset = (ty * tilesX + tx) * 256;
      let accum = 0;
      for (let b = 0; b < 256; b++) {
        accum += hist[b];
        cdfs[cdfOffset + b] = (accum / tilePixelCount) * 255;
      }
    }
  }

  const enhancedLuminance = new Float32Array(numPixels);

  // Bilinear interpolation
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const normY = (y - tileH / 2) / tileH;
    const ty1 = Math.max(0, Math.min(tilesY - 1, Math.floor(normY)));
    const ty2 = Math.min(tilesY - 1, ty1 + 1);
    const wy = Math.max(0, Math.min(1, normY - ty1));

    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const lum = Math.min(255, Math.max(0, Math.round(currentLuminance[idx])));

      const normX = (x - tileW / 2) / tileW;
      const tx1 = Math.max(0, Math.min(tilesX - 1, Math.floor(normX)));
      const tx2 = Math.min(tilesX - 1, tx1 + 1);
      const wx = Math.max(0, Math.min(1, normX - tx1));

      const cdf11 = cdfs[(ty1 * tilesX + tx1) * 256 + lum];
      const cdf21 = cdfs[(ty1 * tilesX + tx2) * 256 + lum];
      const cdf12 = cdfs[(ty2 * tilesX + tx1) * 256 + lum];
      const cdf22 = cdfs[(ty2 * tilesX + tx2) * 256 + lum];

      const top = cdf11 * (1 - wx) + cdf21 * wx;
      const bottom = cdf12 * (1 - wx) + cdf22 * wx;
      let claheLum = top * (1 - wy) + bottom * wy;

      // Temporal stabilization
      if (prevLuminance && prevLuminance.length === numPixels) {
        claheLum = prevLuminance[idx] * 0.25 + claheLum * 0.75;
      }

      enhancedLuminance[idx] = claheLum;
    }
  }

  // Bilateral Denoising & Spatial Unsharp Mask
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const pixelIdx = idx * 4;

      const centerLum = enhancedLuminance[idx];
      let sumWeight = 0;
      let sumVal = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const nRow = ny * width;

        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const nIdx = nRow + nx;
          const nLum = enhancedLuminance[nIdx];
          const spatialDist = dx * dx + dy * dy;
          const rangeDist = (centerLum - nLum) * (centerLum - nLum);

          const w = Math.exp(-spatialDist / 2 - rangeDist / 400);
          sumWeight += w;
          sumVal += nLum * w;
        }
      }

      const smoothedLum = sumWeight > 0 ? sumVal / sumWeight : centerLum;
      const denoisedLum = centerLum * (1 - denoiseAmount) + smoothedLum * denoiseAmount;
      const highFreq = centerLum - smoothedLum;
      const sharpLum = Math.min(255, Math.max(0, denoisedLum + highFreq * sharpness * 1.5));

      const origLum = Math.max(0.1, currentLuminance[idx]);
      const gain = sharpLum / origLum;

      let r = data[pixelIdx] * scaleR * gain;
      let g = data[pixelIdx + 1] * scaleG * gain;
      let b = data[pixelIdx + 2] * scaleB * gain;

      // Vibrance boost
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

      if (sat < 0.7) {
        const boost = (1 - sat) * vibrance * 0.4;
        const avg = (r + g + b) / 3;
        r = r + (r - avg) * boost;
        g = g + (g - avg) * boost;
        b = b + (b - avg) * boost;
      }

      data[pixelIdx] = Math.min(255, Math.max(0, Math.round(r)));
      data[pixelIdx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      data[pixelIdx + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }

  let metrics = null;
  if (sampleOriginal) {
    metrics = calculateMetrics(sampleOriginal, data, numPixels);
  }

  return { currentLuminance, metrics };
}

function processSegmentationComposition(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  maskData: Float32Array,
  maskWidth: number,
  maskHeight: number,
  options: WorkerSegmentationPayload["options"] = {},
  prevAlpha: Float32Array | null,
  sampleOriginal: Uint8ClampedArray | null
) {
  const numPixels = width * height;
  const smoothingFactor = options?.temporalSmoothing ?? 0.65;
  const bgColor = options?.backgroundColor || "transparent";

  const currentAlpha = new Float32Array(numPixels);

  let bgR = 0, bgG = 0, bgB = 0, bgA = 0;
  const bgLower = bgColor.toLowerCase().trim();
  if (bgLower !== "transparent") {
    if (bgLower.startsWith("#")) {
      const hex = bgLower.replace("#", "");
      bgR = parseInt(hex.substring(0, 2), 16) || 0;
      bgG = parseInt(hex.substring(2, 4), 16) || 0;
      bgB = parseInt(hex.substring(4, 6), 16) || 0;
      bgA = 255;
    } else if (bgLower === "green") {
      bgR = 0; bgG = 255; bgB = 0; bgA = 255;
    } else if (bgLower === "white") {
      bgR = 255; bgG = 255; bgB = 255; bgA = 255;
    } else if (bgLower === "black") {
      bgR = 0; bgG = 0; bgB = 0; bgA = 255;
    }
  }

  let alphaSum = 0;
  let fgCount = 0;
  let transCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const maskY = Math.min(maskHeight - 1, Math.floor((y / height) * maskHeight));
    const maskRowOffset = maskY * maskWidth;

    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const pixelIdx = idx * 4;

      const maskX = Math.min(maskWidth - 1, Math.floor((x / width) * maskWidth));
      const rawConfidence = maskData[maskRowOffset + maskX];

      const normalizedConfidence = 1 / (1 + Math.exp(-12 * (rawConfidence - 0.5)));
      let finalAlpha = normalizedConfidence;

      if (prevAlpha && prevAlpha.length === numPixels) {
        const pA = prevAlpha[idx];
        const delta = Math.abs(finalAlpha - pA);
        const adaptiveSmooth = delta > 0.4 ? smoothingFactor * 0.3 : smoothingFactor;
        finalAlpha = pA * adaptiveSmooth + finalAlpha * (1 - adaptiveSmooth);
      }

      currentAlpha[idx] = finalAlpha;
      alphaSum += finalAlpha;
      if (finalAlpha >= 0.5) fgCount++;
      if (finalAlpha <= 0.1) transCount++;

      if (bgA > 0) {
        const fgAlpha = finalAlpha;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];
        data[pixelIdx] = Math.round(r * fgAlpha + bgR * (1 - fgAlpha));
        data[pixelIdx + 1] = Math.round(g * fgAlpha + bgG * (1 - fgAlpha));
        data[pixelIdx + 2] = Math.round(b * fgAlpha + bgB * (1 - fgAlpha));
        data[pixelIdx + 3] = 255;
      } else {
        const fgAlpha = finalAlpha;
        data[pixelIdx] = Math.round(data[pixelIdx] * fgAlpha);
        data[pixelIdx + 1] = Math.round(data[pixelIdx + 1] * fgAlpha);
        data[pixelIdx + 2] = Math.round(data[pixelIdx + 2] * fgAlpha);
        data[pixelIdx + 3] = Math.round(fgAlpha * 255);
      }
    }
  }

  const alphaMean = (alphaSum / numPixels) * 255;
  const foregroundPercentage = (fgCount / numPixels) * 100;
  const transparentPercentage = (transCount / numPixels) * 100;

  let metrics = null;
  if (sampleOriginal) {
    metrics = calculateMetrics(sampleOriginal, data, numPixels);
  }

  return {
    currentAlpha,
    stats: {
      alphaMean,
      foregroundPercentage,
      transparentPercentage,
      metrics,
    },
  };
}

function calculateMetrics(
  originalData: Uint8ClampedArray,
  processedData: Uint8ClampedArray,
  totalPixels: number
) {
  let totalDelta = 0;
  let changedPixels = 0;
  let sumLumOrig = 0;
  let sumLumProc = 0;
  let sumSqLumOrig = 0;
  let sumSqLumProc = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r0 = originalData[idx];
    const g0 = originalData[idx + 1];
    const b0 = originalData[idx + 2];
    const a0 = originalData[idx + 3];

    const r1 = processedData[idx];
    const g1 = processedData[idx + 1];
    const b1 = processedData[idx + 2];
    const a1 = processedData[idx + 3];

    const pixelDiff = (Math.abs(r1 - r0) + Math.abs(g1 - g0) + Math.abs(b1 - b0) + Math.abs(a1 - a0)) / 4;
    totalDelta += pixelDiff;
    if (pixelDiff >= 1.0) changedPixels++;

    const lum0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    const lum1 = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
    sumLumOrig += lum0;
    sumLumProc += lum1;
    sumSqLumOrig += lum0 * lum0;
    sumSqLumProc += lum1 * lum1;
  }

  const luminanceOriginal = sumLumOrig / totalPixels;
  const luminanceProcessed = sumLumProc / totalPixels;
  const contrastOriginal = Math.sqrt(Math.max(0, sumSqLumOrig / totalPixels - luminanceOriginal * luminanceOriginal));
  const contrastProcessed = Math.sqrt(Math.max(0, sumSqLumProc / totalPixels - luminanceProcessed * luminanceProcessed));

  const meanPixelDifference = totalDelta / totalPixels;
  const changedPixelPercentage = (changedPixels / totalPixels) * 100;
  const isMeaningfullyDifferent = meanPixelDifference >= 0.2 || changedPixelPercentage >= 0.5;

  return {
    meanPixelDifference,
    changedPixelPercentage,
    luminanceOriginal,
    luminanceProcessed,
    contrastOriginal,
    contrastProcessed,
    isMeaningfullyDifferent,
  };
}

// ---------------------------------------------------------------------------
// MESSAGE LISTENER
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<WorkerMessageIn>) => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === "PING") {
    self.postMessage({ type: "PONG", id: msg.id });
    return;
  }

  try {
    if (msg.type === "ENHANCE_FRAME") {
      const data = new Uint8ClampedArray(msg.dataBuffer);
      const prevLum = msg.prevLuminanceBuffer ? new Float32Array(msg.prevLuminanceBuffer) : null;
      const sampleOrig = msg.sampleOriginalBuffer ? new Uint8ClampedArray(msg.sampleOriginalBuffer) : null;

      const { currentLuminance, metrics } = processEnhancement(
        msg.width,
        msg.height,
        data,
        msg.options,
        prevLum,
        sampleOrig
      );

      const transferList: Transferable[] = [data.buffer, currentLuminance.buffer];

      self.postMessage(
        {
          type: "SUCCESS",
          id: msg.id,
          dataBuffer: data.buffer,
          currentLuminanceBuffer: currentLuminance.buffer,
          metrics,
        },
        transferList as any
      );
    } else if (msg.type === "SEGMENTATION_COMPOSITION") {
      const data = new Uint8ClampedArray(msg.dataBuffer);
      const mask = new Float32Array(msg.maskBuffer);
      const prevAlpha = msg.prevAlphaBuffer ? new Float32Array(msg.prevAlphaBuffer) : null;
      const sampleOrig = msg.sampleOriginalBuffer ? new Uint8ClampedArray(msg.sampleOriginalBuffer) : null;

      const { currentAlpha, stats } = processSegmentationComposition(
        msg.width,
        msg.height,
        data,
        mask,
        msg.maskWidth,
        msg.maskHeight,
        msg.options,
        prevAlpha,
        sampleOrig
      );

      const transferList: Transferable[] = [data.buffer, currentAlpha.buffer];

      self.postMessage(
        {
          type: "SUCCESS",
          id: msg.id,
          dataBuffer: data.buffer,
          currentAlphaBuffer: currentAlpha.buffer,
          stats,
        },
        transferList as any
      );
    } else if (msg.type === "CALCULATE_METRICS") {
      const orig = new Uint8ClampedArray(msg.originalBuffer);
      const proc = new Uint8ClampedArray(msg.processedBuffer);
      const metrics = calculateMetrics(orig, proc, msg.width * msg.height);

      self.postMessage({
        type: "SUCCESS",
        id: msg.id,
        metrics,
      });
    }
  } catch (err: any) {
    self.postMessage({
      type: "ERROR",
      id: (msg as any).id,
      error: err?.message || String(err),
    });
  }
};
