/**
 * ImageProcessingResourceManager
 * Comprehensive resource evaluation, memory safety analysis, and tile optimization
 * for local neural image processing (Real-ESRGAN 2X/4X, MediaPipe, etc.).
 * 
 * Prevents browser memory spikes, GPU context loss, and UI freezes on mobile/web.
 */

import { DeviceTier, ImageCapabilityProfile } from "./types";
import { ImageCapabilityDetector } from "./ImageCapabilityDetector";

export interface MemoryAssessment {
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  scaleFactor: 2 | 4 | 1;
  inputPixels: number;
  outputPixels: number;
  
  // Memory estimations in Megabytes (MB)
  tensorMemoryMB: number;
  canvasMemoryMB: number;
  outputMemoryMB: number;
  estimatedPeakMemoryMB: number;
  
  // Device environment
  deviceTier: DeviceTier;
  availableRamMB: number;
  isAndroid: boolean;
  isWebView: boolean;
  maxSafeCanvasDimension: number;
  maxSafeOutputPixels: number;
  
  // Safety verdict
  isSafe: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresTiling: boolean;
  recommendedTileSize: number;
  recommendedOverlap: number;
  estimatedTileCount: number;
  
  // User-facing recommendations & warnings
  warnings: string[];
  recommendations: {
    suggestDownscale: boolean;
    recommendedInputWidth?: number;
    recommendedInputHeight?: number;
    suggest2XInsteadOf4X: boolean;
    suggestTiledProcessing: boolean;
    reasonAr: string;
    reasonEn: string;
  };
}

export class ImageProcessingResourceManager {
  private static instance: ImageProcessingResourceManager;
  private capabilityDetector = ImageCapabilityDetector.getInstance();

  private constructor() {}

  public static getInstance(): ImageProcessingResourceManager {
    if (!ImageProcessingResourceManager.instance) {
      ImageProcessingResourceManager.instance = new ImageProcessingResourceManager();
    }
    return ImageProcessingResourceManager.instance;
  }

  /**
   * Assess safety and calculate optimal processing profile before inference starts
   */
  public async assessImageSafety(
    inputWidth: number,
    inputHeight: number,
    scaleFactor: 2 | 4 = 2,
    customCapability?: ImageCapabilityProfile
  ): Promise<MemoryAssessment> {
    const capability = customCapability || (await this.capabilityDetector.detect());
    const isAndroid = capability.isAndroid;
    const isWebView = capability.isWebView;
    const deviceTier = capability.deviceTier;
    const availableRamMB = capability.estimatedRamMB;

    const inputPixels = inputWidth * inputHeight;
    const outputWidth = inputWidth * scaleFactor;
    const outputHeight = inputHeight * scaleFactor;
    const outputPixels = outputWidth * outputHeight;

    // Determine platform-safe canvas limits
    // Mobile WebViews and low-tier devices usually crash if a canvas exceeds 4096px in either dimension
    let maxSafeCanvasDimension = 8192;
    let maxSafeOutputPixels = 36_000_000; // 36 Megapixels (e.g. 6000x6000)

    if (isWebView || isAndroid || deviceTier === "LOW") {
      maxSafeCanvasDimension = 4096;
      maxSafeOutputPixels = 16_000_000; // 16 Megapixels (e.g. 4000x4000)
    } else if (deviceTier === "MEDIUM") {
      maxSafeCanvasDimension = 6144;
      maxSafeOutputPixels = 24_000_000; // 24 Megapixels
    } else if (deviceTier === "ULTRA") {
      maxSafeCanvasDimension = 12288;
      maxSafeOutputPixels = 64_000_000;
    }

    // Dynamic tile size calculation based on device tier and scale factor
    let recommendedTileSize = 256;
    let recommendedOverlap = 16;

    if (deviceTier === "LOW" || isWebView) {
      recommendedTileSize = 128;
      recommendedOverlap = 12;
    } else if (deviceTier === "MEDIUM") {
      recommendedTileSize = 256;
      recommendedOverlap = 16;
    } else if (deviceTier === "HIGH" || deviceTier === "ULTRA") {
      recommendedTileSize = capability.hasWebGPU ? 512 : 256;
      recommendedOverlap = 24;
    }

    // Calculate tile count
    const tilesX = Math.ceil(inputWidth / (recommendedTileSize - recommendedOverlap));
    const tilesY = Math.ceil(inputHeight / (recommendedTileSize - recommendedOverlap));
    const estimatedTileCount = Math.max(1, tilesX * tilesY);

    // Calculate memory footprint:
    // 1. Single tile tensor memory:
    // Input tile Float32 CHW: 1 * 3 * tileH * tileW * 4 bytes
    // Output tile Float32 CHW: 1 * 3 * (tileH*4) * (tileW*4) * 4 bytes
    const inputTensorBytes = 3 * recommendedTileSize * recommendedTileSize * 4;
    const outputTensorBytes = 3 * (recommendedTileSize * 4) * (recommendedTileSize * 4) * 4;
    const tensorMemoryMB = Math.round((inputTensorBytes + outputTensorBytes) / (1024 * 1024) * 10) / 10;

    // 2. Canvas memory: RGBA Uint8ClampedArray is 4 bytes per pixel
    const inputCanvasMB = Math.round((inputPixels * 4) / (1024 * 1024) * 10) / 10;
    const outputCanvasMB = Math.round((outputPixels * 4) / (1024 * 1024) * 10) / 10;
    const canvasMemoryMB = inputCanvasMB + outputCanvasMB;

    // 3. Output memory (Blob / DataURL / Bitmap buffer)
    const outputMemoryMB = Math.round(outputCanvasMB * 1.5 * 10) / 10;

    // 4. Estimated peak working memory (includes ONNX runtime runtime overhead ~50MB + tile tensors + canvases)
    const onnxOverheadMB = 55;
    const estimatedPeakMemoryMB = Math.round(tensorMemoryMB + canvasMemoryMB + outputMemoryMB + onnxOverheadMB);

    // Determine risk level & safety
    const warnings: string[] = [];
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    let isSafe = true;
    let suggestDownscale = false;
    let suggest2XInsteadOf4X = false;
    let recommendedInputWidth: number | undefined;
    let recommendedInputHeight: number | undefined;
    let reasonAr = "";
    let reasonEn = "";

    const exceedsMaxDimension = outputWidth > maxSafeCanvasDimension || outputHeight > maxSafeCanvasDimension;
    const exceedsMaxPixels = outputPixels > maxSafeOutputPixels;
    const exceedsRamThreshold = estimatedPeakMemoryMB > availableRamMB * 0.45; // safe RAM budget <= 45%

    if (exceedsMaxDimension || exceedsMaxPixels || exceedsRamThreshold) {
      if (scaleFactor === 4) {
        // Test if 2X would be safe
        const outW2 = inputWidth * 2;
        const outH2 = inputHeight * 2;
        const outPixels2 = outW2 * outH2;
        if (outW2 <= maxSafeCanvasDimension && outH2 <= maxSafeCanvasDimension && outPixels2 <= maxSafeOutputPixels) {
          riskLevel = "high";
          suggest2XInsteadOf4X = true;
          isSafe = false;
          reasonAr = `دقة 4X ستنتج صورة (${outputWidth}×${outputHeight}) تفوق قدرة ذاكرة الجهاز المتاحة. يُنصح باستخدام 2X.`;
          reasonEn = `4X upscale produces (${outputWidth}x${outputHeight}) which exceeds safe memory. We recommend 2X upscale.`;
          warnings.push(reasonEn);
        } else {
          riskLevel = "critical";
          suggestDownscale = true;
          isSafe = false;
          const downscaleRatio = Math.min(
            (maxSafeCanvasDimension / 4) / inputWidth,
            (maxSafeCanvasDimension / 4) / inputHeight,
            Math.sqrt((maxSafeOutputPixels / 16) / inputPixels)
          );
          recommendedInputWidth = Math.floor(inputWidth * downscaleRatio);
          recommendedInputHeight = Math.floor(inputHeight * downscaleRatio);
          reasonAr = `أبعاد الصورة كبيرة جداً لهذا الجهاز (${inputWidth}×${inputHeight}). يُنصح بتصغير أبعاد الإدخال أولاً.`;
          reasonEn = `Image resolution is too large for this device (${inputWidth}x${inputHeight}). Input downscaling is recommended.`;
          warnings.push(reasonEn);
        }
      } else {
        // Scale factor is 2
        riskLevel = "high";
        suggestDownscale = true;
        isSafe = false;
        const downscaleRatio = Math.min(
          (maxSafeCanvasDimension / 2) / inputWidth,
          (maxSafeCanvasDimension / 2) / inputHeight,
          Math.sqrt((maxSafeOutputPixels / 4) / inputPixels)
        );
        recommendedInputWidth = Math.floor(inputWidth * downscaleRatio);
        recommendedInputHeight = Math.floor(inputHeight * downscaleRatio);
        reasonAr = `أبعاد الإخراج المقدرة (${outputWidth}×${outputHeight}) تتجاوز سعة الذاكرة الآمنة للجهاز.`;
        reasonEn = `Estimated output resolution (${outputWidth}x${outputHeight}) exceeds safe device memory budget.`;
        warnings.push(reasonEn);
      }
    } else if (estimatedPeakMemoryMB > availableRamMB * 0.25 || inputPixels > 2_000_000) {
      riskLevel = "medium";
      warnings.push("High-resolution image: Tiled neural streaming will be active to maintain UI fluidity.");
    }

    const requiresTiling = inputWidth > recommendedTileSize || inputHeight > recommendedTileSize;

    return {
      inputWidth,
      inputHeight,
      outputWidth,
      outputHeight,
      scaleFactor,
      inputPixels,
      outputPixels,
      tensorMemoryMB,
      canvasMemoryMB,
      outputMemoryMB,
      estimatedPeakMemoryMB,
      deviceTier,
      availableRamMB,
      isAndroid,
      isWebView,
      maxSafeCanvasDimension,
      maxSafeOutputPixels,
      isSafe,
      riskLevel,
      requiresTiling,
      recommendedTileSize,
      recommendedOverlap,
      estimatedTileCount,
      warnings,
      recommendations: {
        suggestDownscale,
        recommendedInputWidth,
        recommendedInputHeight,
        suggest2XInsteadOf4X,
        suggestTiledProcessing: requiresTiling,
        reasonAr,
        reasonEn,
      },
    };
  }

  /**
   * Helper to downscale a large input image to safe maximum bounds
   */
  public async createSafeScaledImage(
    srcImage: HTMLImageElement,
    targetWidth: number,
    targetHeight: number
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[ImageProcessingResourceManager] Canvas 2D context unavailable");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcImage, 0, 0, targetWidth, targetHeight);
    return canvas;
  }
}

export const imageResourceManager = ImageProcessingResourceManager.getInstance();
