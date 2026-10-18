/**
 * Dedicated Web Worker for CPU-heavy Video Frame Digital Signal Processing (DSP):
 * 1. Adaptive CLAHE (Contrast Limited Adaptive Histogram Equalization)
 * 2. Spatial Bilateral Denoising / Edge-Preserving Blur
 * 3. Unsharp Masking & Detail Refinement
 * 4. Dynamic Vibrance & Gray-World Auto White Balancing with Temporal EMA
 * 5. Temporal Alpha Smoothing & Transparency Cutout
 * 6. Mathematical Frame Delta & Alpha Verification
 * 
 * Executes off the Main Thread with zero-copy ArrayBuffer transfer.
 * Shares the core enhancementDsp pipeline with VideoEnhancementEngine.
 */

import {
  processEnhanceFrameShared,
  EnhancementDspState,
  SIGMOID_LUT,
} from "./enhancementDsp";

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

// Persistent worker state across video frames
const enhanceDspState = new EnhancementDspState();

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

  // Reuse transferred prevAlpha buffer in-place when dimensions match to avoid ~4-8MB allocation per frame
  const currentAlpha =
    prevAlpha && prevAlpha.length === numPixels
      ? prevAlpha
      : new Float32Array(numPixels);

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

  const isDirectResolution = maskWidth === width && maskHeight === height;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const v = (y / height) * (maskHeight - 1);
    const y0 = Math.floor(v);
    const y1 = Math.min(maskHeight - 1, y0 + 1);
    const dy = v - y0;
    const y0Offset = y0 * maskWidth;
    const y1Offset = y1 * maskWidth;

    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const pixelIdx = idx * 4;

      let rawConfidence: number;
      if (isDirectResolution) {
        rawConfidence = maskData[rowOffset + x];
      } else {
        const u = (x / width) * (maskWidth - 1);
        const x0 = Math.floor(u);
        const x1 = Math.min(maskWidth - 1, x0 + 1);
        const dx = u - x0;

        const top = maskData[y0Offset + x0] * (1 - dx) + maskData[y0Offset + x1] * dx;
        const bot = maskData[y1Offset + x0] * (1 - dx) + maskData[y1Offset + x1] * dx;
        rawConfidence = top * (1 - dy) + bot * dy;
      }

      if (isNaN(rawConfidence) || !isFinite(rawConfidence)) {
        rawConfidence = 0;
      }
      rawConfidence = Math.max(0, Math.min(1, rawConfidence));

      const lutIdx = Math.round(rawConfidence * 1000);
      const normalizedConfidence = SIGMOID_LUT[lutIdx];
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
    meanOriginalRGB: [0, 0, 0] as [number, number, number],
    meanProcessedRGB: [0, 0, 0] as [number, number, number],
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
      const sampleOrig = msg.sampleOriginalBuffer ? new Uint8ClampedArray(msg.sampleOriginalBuffer) : null;

      const { currentLuminance, metrics } = processEnhanceFrameShared(
        msg.width,
        msg.height,
        data,
        msg.options || {},
        enhanceDspState,
        sampleOrig
      );

      const transferList: Transferable[] = [data.buffer, currentLuminance.buffer];

      (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
        {
          type: "SUCCESS",
          id: msg.id,
          dataBuffer: data.buffer,
          currentLuminanceBuffer: currentLuminance.buffer,
          metrics,
        },
        transferList
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

      (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
        {
          type: "SUCCESS",
          id: msg.id,
          dataBuffer: data.buffer,
          currentAlphaBuffer: currentAlpha.buffer,
          stats,
        },
        transferList
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
