/**
 * ImageOutputVerifier
 * Production verification of Local Image AI outputs.
 * Verifies valid image data, dimensions, alpha transparency channels,
 * pixel variance, and non-corrupted results.
 */

import { ImageAITaskType, ImageAIResult } from "./types";
import { ImageMemoryManager } from "./ImageMemoryManager";

export interface VerificationResult {
  passed: boolean;
  reason?: string;
  metrics: {
    width: number;
    height: number;
    hasAlpha: boolean;
    transparentPixelRatio: number;
    averageBrightness: number;
    pixelVariance: number;
  };
}

export class ImageOutputVerifier {
  private static instance: ImageOutputVerifier;
  private memoryManager = ImageMemoryManager.getInstance();

  private constructor() {}

  public static getInstance(): ImageOutputVerifier {
    if (!ImageOutputVerifier.instance) {
      ImageOutputVerifier.instance = new ImageOutputVerifier();
    }
    return ImageOutputVerifier.instance;
  }

  /**
   * Verify the produced AI result against expected invariants
   */
  public async verify(
    taskType: ImageAITaskType,
    result: ImageAIResult,
    inputImageData?: ImageData
  ): Promise<VerificationResult> {
    if (!result.outputDataUrl || result.outputDataUrl.length < 100) {
      return {
        passed: false,
        reason: "Output data URL is empty or corrupted",
        metrics: {
          width: 0,
          height: 0,
          hasAlpha: false,
          transparentPixelRatio: 0,
          averageBrightness: 0,
          pixelVariance: 0,
        },
      };
    }

    if (result.width <= 0 || result.height <= 0) {
      return {
        passed: false,
        reason: `Invalid output dimensions: ${result.width}x${result.height}`,
        metrics: {
          width: result.width,
          height: result.height,
          hasAlpha: false,
          transparentPixelRatio: 0,
          averageBrightness: 0,
          pixelVariance: 0,
        },
      };
    }

    // Inspect actual output pixels
    const { imageData, hasAlpha, transparentPixelRatio, averageBrightness, pixelVariance } =
      await this.inspectOutput(result.outputDataUrl, result.width, result.height);

    const metrics = {
      width: result.width,
      height: result.height,
      hasAlpha,
      transparentPixelRatio,
      averageBrightness,
      pixelVariance,
    };

    // Specific invariant checks by task type
    switch (taskType) {
      case "remove-background": {
        // Must contain transparent pixels, but not be 100% transparent or 100% opaque
        if (transparentPixelRatio <= 0.001) {
          return {
            passed: false,
            reason: "Background removal produced 0% transparency (failed to cut background)",
            metrics,
          };
        }
        if (transparentPixelRatio >= 0.999) {
          return {
            passed: false,
            reason: "Background removal erased 100% of the image (subject lost)",
            metrics,
          };
        }
        break;
      }

      case "upscale": {
        const expectedScale = result.metrics.scaleFactor || 2;
        if (
          result.width < result.originalWidth * (expectedScale * 0.95) ||
          result.height < result.originalHeight * (expectedScale * 0.95)
        ) {
          return {
            passed: false,
            reason: `Upscale dimension mismatch. Expected ~${expectedScale}x scale (${result.originalWidth * expectedScale}x${result.originalHeight * expectedScale}), received ${result.width}x${result.height}`,
            metrics,
          };
        }
        break;
      }

      case "enhance":
      case "face-enhance":
      case "object-remove": {
        if (pixelVariance < 0.0001 && averageBrightness < 0.001) {
          return {
            passed: false,
            reason: "Output image appears to be completely blank or corrupted",
            metrics,
          };
        }
        break;
      }
    }

    return {
      passed: true,
      metrics,
    };
  }

  private async inspectOutput(
    dataUrl: string,
    width: number,
    height: number
  ): Promise<{
    imageData: ImageData;
    hasAlpha: boolean;
    transparentPixelRatio: number;
    averageBrightness: number;
    pixelVariance: number;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = this.memoryManager.createCanvas(width, height);
          const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;

          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          this.memoryManager.disposeCanvas(canvas);

          const data = imageData.data;
          const total = width * height;
          let transparentCount = 0;
          let totalBrightness = 0;

          // Sample every 4th pixel for high speed performance
          const step = Math.max(1, Math.floor(total / 10000));
          let sampledCount = 0;
          let sumSquares = 0;

          for (let i = 0; i < total; i += step) {
            const idx = i * 4;
            const a = data[idx + 3];
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            if (a < 250) {
              transparentCount++;
            }

            const brightness = (r + g + b) / (3 * 255);
            totalBrightness += brightness;
            sumSquares += brightness * brightness;
            sampledCount++;
          }

          const meanBrightness = totalBrightness / Math.max(1, sampledCount);
          const variance = Math.max(
            0,
            sumSquares / Math.max(1, sampledCount) - meanBrightness * meanBrightness
          );

          resolve({
            imageData,
            hasAlpha: transparentCount > 0,
            transparentPixelRatio: transparentCount / Math.max(1, sampledCount),
            averageBrightness: meanBrightness,
            pixelVariance: variance,
          });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e) => reject(new Error(`Failed to decode output image: ${e}`));
      img.src = dataUrl;
    });
  }
}
