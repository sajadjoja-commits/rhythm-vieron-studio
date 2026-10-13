/**
 * Video Enhancement Engine
 * Authentic, high-performance frame processing pipeline:
 * 1. Multi-scale Adaptive CLAHE (Luminance Dynamic Range Equalization)
 * 2. Spatial-Temporal Bilateral Filtering & Denoising (Edge-preserving noise removal via LUT)
 * 3. Thresholded Unsharp Masking (High-frequency micro-detail refinement)
 * 4. Dynamic Vibrance & Gray-World Auto Color Balancing with Temporal EMA
 * 
 * Uses the shared enhancementDsp pipeline to guarantee 100% parity between
 * dedicated Web Worker and main-thread fallback without code duplication.
 */

import { VideoAIOptions } from "./types";
import { EnhancementDspState, processEnhanceFrameShared } from "./enhancementDsp";

export interface FrameComparisonMetrics {
  meanOriginalRGB: [number, number, number];
  meanProcessedRGB: [number, number, number];
  luminanceOriginal: number;
  luminanceProcessed: number;
  contrastOriginal: number;
  contrastProcessed: number;
  meanPixelDifference: number;
  changedPixelPercentage: number;
  isMeaningfullyDifferent: boolean;
}

export class VideoEnhancementEngine {
  private static instance: VideoEnhancementEngine;
  private dspState = new EnhancementDspState();

  public static getInstance(): VideoEnhancementEngine {
    if (!VideoEnhancementEngine.instance) {
      VideoEnhancementEngine.instance = new VideoEnhancementEngine();
    }
    return VideoEnhancementEngine.instance;
  }

  public resetState(): void {
    this.dspState.reset();
  }

  /**
   * Applies the complete multi-pass enhancement chain to a frame's ImageData.
   */
  public processFrame(
    imageData: ImageData,
    options?: VideoAIOptions,
    _prevLuminanceBuffer?: Float32Array | null
  ): {
    currentLuminance: Float32Array;
  } {
    const res = processEnhanceFrameShared(
      imageData.width,
      imageData.height,
      imageData.data,
      options || {},
      this.dspState,
      null
    );

    return {
      currentLuminance: res.currentLuminance,
    };
  }

  /**
   * Calculates pixel difference metrics between an original frame and processed frame.
   * Proves that frames are actually changed and quantifies luminance, contrast, and RGB delta.
   */
  public calculateFrameMetrics(
    originalData: Uint8ClampedArray,
    processedData: Uint8ClampedArray
  ): FrameComparisonMetrics {
    const totalPixels = Math.floor(originalData.length / 4);
    if (totalPixels === 0 || originalData.length !== processedData.length) {
      return {
        meanOriginalRGB: [0, 0, 0],
        meanProcessedRGB: [0, 0, 0],
        luminanceOriginal: 0,
        luminanceProcessed: 0,
        contrastOriginal: 0,
        contrastProcessed: 0,
        meanPixelDifference: 0,
        changedPixelPercentage: 0,
        isMeaningfullyDifferent: false,
      };
    }

    let origR = 0, origG = 0, origB = 0;
    let procR = 0, procG = 0, procB = 0;
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

      const r1 = processedData[idx];
      const g1 = processedData[idx + 1];
      const b1 = processedData[idx + 2];

      origR += r0; origG += g0; origB += b0;
      procR += r1; procG += g1; procB += b1;

      const deltaR = Math.abs(r1 - r0);
      const deltaG = Math.abs(g1 - g0);
      const deltaB = Math.abs(b1 - b0);
      const pixelDiff = (deltaR + deltaG + deltaB) / 3;

      totalDelta += pixelDiff;
      if (pixelDiff > 2.0) {
        changedPixels++;
      }

      const lum0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      const lum1 = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
      sumLumOrig += lum0;
      sumLumProc += lum1;
      sumSqLumOrig += lum0 * lum0;
      sumSqLumProc += lum1 * lum1;
    }

    const meanPixelDifference = totalDelta / totalPixels;
    const changedPixelPercentage = (changedPixels / totalPixels) * 100;
    const luminanceOriginal = sumLumOrig / totalPixels;
    const luminanceProcessed = sumLumProc / totalPixels;

    const varianceOriginal = Math.max(0, (sumSqLumOrig / totalPixels) - (luminanceOriginal * luminanceOriginal));
    const varianceProcessed = Math.max(0, (sumSqLumProc / totalPixels) - (luminanceProcessed * luminanceProcessed));
    const contrastOriginal = Math.sqrt(varianceOriginal);
    const contrastProcessed = Math.sqrt(varianceProcessed);

    const isMeaningfullyDifferent = meanPixelDifference >= 0.15 && changedPixelPercentage >= 0.35;

    return {
      meanOriginalRGB: [origR / totalPixels, origG / totalPixels, origB / totalPixels],
      meanProcessedRGB: [procR / totalPixels, procG / totalPixels, procB / totalPixels],
      luminanceOriginal,
      luminanceProcessed,
      contrastOriginal,
      contrastProcessed,
      meanPixelDifference,
      changedPixelPercentage,
      isMeaningfullyDifferent,
    };
  }
}
