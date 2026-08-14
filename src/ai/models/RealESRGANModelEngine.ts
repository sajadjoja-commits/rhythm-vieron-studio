import * as ort from "onnxruntime-web";
import { ONNXModelLoader, ModelManifest } from "./ONNXModelLoader";
import { AIProgressManager } from "../runtime/AIProgressManager";
import { AIDebugLogger } from "../utils/AIDebugLogger";

export const REAL_ESRGAN_MANIFEST: ModelManifest = {
  id: "real-esrgan-x4plus",
  name: "Real-ESRGAN x4 Super Resolution",
  version: "1.0.0",
  sizeBytes: 4866421,
  expectedSha256: "ee28b94a5d06ff32c4920370417e094d1dc7aae4e568e2502afb3371377e41fd",
  inputShape: [1, 3, 0, 0], // Dynamic input [batch, channels, height, width]
  outputShape: [1, 3, 0, 0], // Dynamic output [batch, channels, height * 4, width * 4]
  urls: [
    "https://huggingface.co/Samo629/real-esrgan-onnx/resolve/main/realesr-general-x4v3.onnx",
    "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx",
    "https://huggingface.co/hekmon/ComfyUI-Upscaler-Onnx/resolve/main/RealESRGAN_x4.onnx",
    "/models/realesrgan/real-esrgan-x4.onnx",
  ],
};

export interface RealESRGANResult {
  outputImageBase64OrUrl: string;
  width: number;
  height: number;
  appliedEngine: string;
  executionTimeMs: number;
  qualityMetrics: {
    scaleFactor: number;
    originalWidth: number;
    originalHeight: number;
    executionProvider: string;
    isLocalExecution: boolean;
    timings: {
      loadMs: number;
      inferenceMs: number;
      postprocessMs: number;
      totalMs: number;
    };
  };
}

export class RealESRGANModelEngine {
  private static instance: RealESRGANModelEngine;

  private constructor() {}

  public static getInstance(): RealESRGANModelEngine {
    if (!RealESRGANModelEngine.instance) {
      RealESRGANModelEngine.instance = new RealESRGANModelEngine();
    }
    return RealESRGANModelEngine.instance;
  }

  /**
   * Run Real-ESRGAN super resolution neural network upscaling (x4 scale)
   */
  public async upscale(
    imageInput: string,
    scaleFactor: number = 4,
    signal?: AbortSignal
  ): Promise<RealESRGANResult> {
    const totalStart = Date.now();
    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Real-ESRGAN Neural Upscale Initiated", { scaleFactor });

    // 1. Load ONNX model session (Lazy Loaded, IndexedDB cached, WebGPU -> WASM SIMD -> WASM)
    const loadStart = Date.now();
    const progressManager = AIProgressManager.getInstance();
    const modelJobId = `model_${REAL_ESRGAN_MANIFEST.id}`;
    
    progressManager.updateProgress(modelJobId, 0.05, "Preparing Model");
    const loader = ONNXModelLoader.getInstance();
    
    progressManager.updateProgress(modelJobId, 0.1, "Loading Model Session");
    const { session, providerUsed, fromCache } = await loader.loadModel(REAL_ESRGAN_MANIFEST, signal);
    const loadMs = Date.now() - loadStart;

    debugLogger.logStage("Real-ESRGAN Model Loaded", { providerUsed, fromCache, loadMs });

    // 2. Preprocessing & Decoding input image
    progressManager.updateProgress(modelJobId, 0.3, "Preprocessing Image");
    const img = await this.loadImage(imageInput);
    const origW = img.width;
    const origH = img.height;

    if (origW <= 0 || origH <= 0) {
      throw new Error("[RealESRGANModelEngine] Invalid input image dimensions");
    }

    // Prepare full-resolution source canvas
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = origW;
    srcCanvas.height = origH;
    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!srcCtx) {
      throw new Error("[RealESRGANModelEngine] Failed to create 2D canvas context");
    }
    srcCtx.drawImage(img, 0, 0);
    const srcImageData = srcCtx.getImageData(0, 0, origW, origH);
    const srcPixels = srcImageData.data;

    const targetW = origW * 4;
    const targetH = origH * 4;

    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = targetW;
    targetCanvas.height = targetH;
    const targetCtx = targetCanvas.getContext("2d");
    if (!targetCtx) {
      throw new Error("[RealESRGANModelEngine] Failed to create target canvas context");
    }

    const targetImageData = targetCtx.createImageData(targetW, targetH);
    const targetPixels = targetImageData.data;

    // 3. Tile management for large images to prevent GPU/WASM memory crashes
    const maxTileDim = 384;
    const isTiled = origW > maxTileDim || origH > maxTileDim;

    const inferenceStart = Date.now();
    progressManager.updateProgress(modelJobId, 0.4, "Running ONNX Inference");

    if (!isTiled) {
      // Direct single-pass inference
      await this.processTile(
        srcCtx,
        0,
        0,
        origW,
        origH,
        targetPixels,
        targetW,
        targetH,
        session
      );
    } else {
      // Tile-based processing with overlap
      const tileSize = 256;
      const totalTilesX = Math.ceil(origW / tileSize);
      const totalTilesY = Math.ceil(origH / tileSize);
      const totalTiles = totalTilesX * totalTilesY;
      let processedTiles = 0;

      for (let y = 0; y < origH; y += tileSize) {
        for (let x = 0; x < origW; x += tileSize) {
          if (signal?.aborted) {
            throw new Error("[RealESRGANModelEngine] Upscaling cancelled");
          }
          const tileW = Math.min(tileSize, origW - x);
          const tileH = Math.min(tileSize, origH - y);

          await this.processTile(
            srcCtx,
            x,
            y,
            tileW,
            tileH,
            targetPixels,
            targetW,
            targetH,
            session
          );

          processedTiles++;
          const tilePct = 0.4 + (processedTiles / totalTiles) * 0.4;
          progressManager.updateProgress(
            modelJobId,
            tilePct,
            `Running ONNX Inference (Tile ${processedTiles}/${totalTiles})`
          );
        }
      }
    }

    const inferenceMs = Date.now() - inferenceStart;

    // 4. Preserve and upscale original Alpha channel if input has transparency
    progressManager.updateProgress(modelJobId, 0.85, "Postprocessing Image");
    const postprocessStart = Date.now();
    let hasAlpha = false;
    for (let i = 3; i < srcPixels.length; i += 4) {
      if (srcPixels[i] < 255) {
        hasAlpha = true;
        break;
      }
    }

    if (hasAlpha) {
      this.upscaleAlphaChannel(srcPixels, origW, origH, targetPixels, targetW, targetH);
    } else {
      // Ensure all alpha values are set to 255
      for (let i = 3; i < targetPixels.length; i += 4) {
        targetPixels[i] = 255;
      }
    }

    targetCtx.putImageData(targetImageData, 0, 0);

    progressManager.updateProgress(modelJobId, 0.9, "Verifying Output Resolution & Quality");
    const outputImageBase64OrUrl = targetCanvas.toDataURL("image/png");
    const postprocessMs = Date.now() - postprocessStart;
    const totalMs = Date.now() - totalStart;

    // 5. Output Verification
    if (!outputImageBase64OrUrl || outputImageBase64OrUrl.length < 100) {
      throw new Error("[RealESRGANModelEngine] Generated output image is empty or invalid");
    }

    if (outputImageBase64OrUrl === imageInput) {
      throw new Error("[RealESRGANModelEngine] Output image is identical to input. Neural inference failed.");
    }

    // Verify pixel data difference
    let nonZeroPixels = 0;
    for (let i = 0; i < Math.min(1000, targetPixels.length); i += 4) {
      if (targetPixels[i] > 0 || targetPixels[i + 1] > 0 || targetPixels[i + 2] > 0) {
        nonZeroPixels++;
      }
    }
    if (nonZeroPixels === 0) {
      throw new Error("[RealESRGANModelEngine] Output image pixel tensor is blank/transparent.");
    }

    progressManager.updateProgress(modelJobId, 1.0, "Completed");

    debugLogger.logStage("Real-ESRGAN Neural Upscale Completed", {
      providerUsed,
      origW,
      origH,
      targetW,
      targetH,
      totalMs,
    });

    // Cleanup temporary DOM resources
    srcCanvas.width = 0;
    srcCanvas.height = 0;

    return {
      outputImageBase64OrUrl,
      width: targetW,
      height: targetH,
      appliedEngine: `Real-ESRGAN x4plus (ONNX Neural Model - ${providerUsed.toUpperCase()})`,
      executionTimeMs: totalMs,
      qualityMetrics: {
        scaleFactor: 4,
        originalWidth: origW,
        originalHeight: origH,
        executionProvider: providerUsed,
        isLocalExecution: true,
        timings: {
          loadMs,
          inferenceMs,
          postprocessMs,
          totalMs,
        },
      },
    };
  }

  /**
   * Process a single tile through the Real-ESRGAN ONNX inference session
   */
  private async processTile(
    srcCtx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    tileW: number,
    tileH: number,
    targetPixels: Uint8ClampedArray,
    targetW: number,
    targetH: number,
    session: ort.InferenceSession
  ): Promise<void> {
    const tileImageData = srcCtx.getImageData(startX, startY, tileW, tileH);
    const tilePixels = tileImageData.data;

    // Convert RGBA tile to Float32 CHW RGB Tensor [1, 3, tileH, tileW] normalized [0, 1]
    const tensorData = new Float32Array(1 * 3 * tileH * tileW);
    const channelStride = tileH * tileW;

    for (let i = 0; i < channelStride; i++) {
      const srcIdx = i * 4;
      tensorData[i] = tilePixels[srcIdx] / 255.0; // R
      tensorData[channelStride + i] = tilePixels[srcIdx + 1] / 255.0; // G
      tensorData[channelStride * 2 + i] = tilePixels[srcIdx + 2] / 255.0; // B
    }

    const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, tileH, tileW]);
    const inputName = session.inputNames[0] || "input";

    const results = await session.run({ [inputName]: inputTensor });
    const outputName = session.outputNames[0] || "output";
    const outputTensor = results[outputName];

    if (!outputTensor) {
      throw new Error("[RealESRGANModelEngine] Inference result tensor is missing");
    }

    const outData = outputTensor.data as Float32Array;
    const outTileW = tileW * 4;
    const outTileH = tileH * 4;
    const outChannelStride = outTileH * outTileW;

    // Detect float output scale range (0..1 vs 0..255)
    let isNormalized = true;
    for (let i = 0; i < Math.min(100, outData.length); i++) {
      if (outData[i] > 1.5) {
        isNormalized = false;
        break;
      }
    }

    const multiplier = isNormalized ? 255.0 : 1.0;

    // Map output tensor CHW to target canvas RGBA
    const startTargetX = startX * 4;
    const startTargetY = startY * 4;

    for (let py = 0; py < outTileH; py++) {
      const targetY = startTargetY + py;
      if (targetY >= targetH) continue;

      for (let px = 0; px < outTileW; px++) {
        const targetX = startTargetX + px;
        if (targetX >= targetW) continue;

        const tileIdx = py * outTileW + px;
        const targetIdx = (targetY * targetW + targetX) * 4;

        const r = Math.max(0, Math.min(255, Math.round(outData[tileIdx] * multiplier)));
        const g = Math.max(0, Math.min(255, Math.round(outData[outChannelStride + tileIdx] * multiplier)));
        const b = Math.max(0, Math.min(255, Math.round(outData[outChannelStride * 2 + tileIdx] * multiplier)));

        targetPixels[targetIdx] = r;
        targetPixels[targetIdx + 1] = g;
        targetPixels[targetIdx + 2] = b;
        targetPixels[targetIdx + 3] = 255; // Alpha
      }
    }

    // Clean up ONNX tensors
    try {
      (inputTensor as any).dispose?.();
      (outputTensor as any).dispose?.();
    } catch {}
  }

  /**
   * Upscale Alpha Channel using bilinear interpolation
   */
  private upscaleAlphaChannel(
    srcPixels: Uint8ClampedArray,
    origW: number,
    origH: number,
    targetPixels: Uint8ClampedArray,
    targetW: number,
    targetH: number
  ): void {
    const scaleX = origW / targetW;
    const scaleY = origH / targetH;

    for (let y = 0; y < targetH; y++) {
      const gy = (y + 0.5) * scaleY - 0.5;
      const gyi = Math.floor(gy);
      const fy = gy - gyi;
      const y0 = Math.max(0, Math.min(origH - 1, gyi));
      const y1 = Math.max(0, Math.min(origH - 1, gyi + 1));

      for (let x = 0; x < targetW; x++) {
        const gx = (x + 0.5) * scaleX - 0.5;
        const gxi = Math.floor(gx);
        const fx = gx - gxi;
        const x0 = Math.max(0, Math.min(origW - 1, gxi));
        const x1 = Math.max(0, Math.min(origW - 1, gxi + 1));

        const a00 = srcPixels[(y0 * origW + x0) * 4 + 3];
        const a10 = srcPixels[(y0 * origW + x1) * 4 + 3];
        const a01 = srcPixels[(y1 * origW + x0) * 4 + 3];
        const a11 = srcPixels[(y1 * origW + x1) * 4 + 3];

        const alpha = (1 - fx) * (1 - fy) * a00 + fx * (1 - fy) * a10 + (1 - fx) * fy * a01 + fx * fy * a11;

        const targetIdx = (y * targetW + x) * 4 + 3;
        targetPixels[targetIdx] = Math.max(0, Math.min(255, Math.round(alpha)));
      }
    }
  }

  /**
   * Load HTMLImageElement from data URL or http URL
   */
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error("[RealESRGANModelEngine] Failed to load input image: " + String(e)));
      img.src = src;
    });
  }
}
