import * as ort from "onnxruntime-web";
import { ONNXModelLoader } from "./ONNXModelLoader";
import { RMBG2_MANIFEST, RMBG2ModelManifest } from "./manifests/rmbg2.manifest";
import { AIProgressManager } from "../runtime/AIProgressManager";
import { AIOutputVerifier } from "../utils/AIOutputVerifier";

export type RMBGEngineStatus =
  | "idle"
  | "checking_cache"
  | "downloading"
  | "verifying"
  | "ready"
  | "error";

export interface RMBGExecutionResult {
  outputImageBase64OrUrl: string;
  mimeType: "image/png";
  width: number;
  height: number;
  appliedEngine: string;
  executionTimeMs: number;
  providerUsed: string;
  performanceMetrics: {
    downloadTimeMs: number;
    modelLoadTimeMs: number;
    inferenceTimeMs: number;
    totalTimeMs: number;
    ramUsageEstimateMB: number;
    fromCache: boolean;
    executionProvider: string;
  };
  qualityMetrics: {
    originalWidth: number;
    originalHeight: number;
    isLocalExecution: boolean;
    hasAlphaChannel: boolean;
    transparentPixelCount: number;
    executionProvider: string;
  };
}

export class RMBG2ModelEngine {
  private static instance: RMBG2ModelEngine;
  private loader: ONNXModelLoader;
  private currentStatus: RMBGEngineStatus = "idle";
  private lastErrorMessage: string | null = null;

  private constructor() {
    this.loader = ONNXModelLoader.getInstance();
  }

  public static getInstance(): RMBG2ModelEngine {
    if (!RMBG2ModelEngine.instance) {
      RMBG2ModelEngine.instance = new RMBG2ModelEngine();
    }
    return RMBG2ModelEngine.instance;
  }

  public getStatus(): { status: RMBGEngineStatus; errorMessage: string | null } {
    return { status: this.currentStatus, errorMessage: this.lastErrorMessage };
  }

  /**
   * Execute real neural RMBG-2.0 background removal ONNX pipeline
   */
  public async removeBackground(
    imageBase64OrUrl: string,
    signal?: AbortSignal
  ): Promise<RMBGExecutionResult> {
    const startTime = Date.now();
    const progressManager = AIProgressManager.getInstance();
    const taskId = `rmbg2_${Date.now()}`;

    if (signal?.aborted) {
      throw new Error("[RMBG2ModelEngine] Task aborted before starting");
    }

    this.currentStatus = "checking_cache";
    progressManager.createProgress(taskId, "Checking local RMBG-2.0 model cache...");
    progressManager.updateProgress(taskId, 0.05, "Checking local RMBG-2.0 model cache...");

    // Stage 1 to 4: Load & Verify ONNX Session
    const loadStart = Date.now();
    let session: ort.InferenceSession;
    let providerUsed = "wasm";
    let fromCache = false;

    try {
      this.currentStatus = "downloading";
      const res = await this.loader.loadModel(
        {
          id: RMBG2_MANIFEST.modelId,
          name: RMBG2_MANIFEST.modelName,
          version: RMBG2_MANIFEST.version,
          sizeBytes: RMBG2_MANIFEST.expectedSizeBytes,
          expectedSha256: RMBG2_MANIFEST.expectedSha256,
          urls: RMBG2_MANIFEST.urls,
          inputShape: RMBG2_MANIFEST.inputShape,
          outputShape: RMBG2_MANIFEST.outputShape,
        },
        signal
      );
      session = res.session;
      providerUsed = res.providerUsed;
      fromCache = res.fromCache;
      this.currentStatus = "ready";
      this.lastErrorMessage = null;
    } catch (err: any) {
      this.currentStatus = "error";
      this.lastErrorMessage = err?.message || String(err);
      console.error("[RMBG2ModelEngine] Failed to load RMBG-2.0 ONNX model:", err);
      throw new Error(`RMBG-2.0 ONNX model is unavailable: ${this.lastErrorMessage}`);
    }

    const modelLoadTimeMs = Date.now() - loadStart;

    if (signal?.aborted) {
      throw new Error("[RMBG2ModelEngine] Task aborted after model loading");
    }

    // Stage 5: Preprocessing image (1024x1024 NCHW ImageNet normalized)
    progressManager.updateProgress(
      taskId,
      0.75,
      `Preprocessing image tensors [1, 3, 1024, 1024] (${providerUsed.toUpperCase()})...`
    );

    const img = await this.loadImage(imageBase64OrUrl);
    const origW = img.width;
    const origH = img.height;
    const targetDim = 1024;

    const { floatArray, canvas: prepCanvas } = this.preprocessImage(
      img,
      targetDim,
      RMBG2_MANIFEST.mean,
      RMBG2_MANIFEST.std
    );

    // Stage 6: Executing RMBG-2.0 AI inference
    progressManager.updateProgress(
      taskId,
      0.82,
      `Executing RMBG-2.0 AI Inference on ${providerUsed.toUpperCase()}...`
    );

    let inputTensor: ort.Tensor | null = null;
    let outputTensor: ort.Tensor | null = null;
    let inferenceTimeMs = 0;

    const inferStart = Date.now();
    try {
      const inputName = session.inputNames[0] || RMBG2_MANIFEST.inputName;
      inputTensor = new ort.Tensor("float32", floatArray, [1, 3, targetDim, targetDim]);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[inputName] = inputTensor;

      const outputMap = await session.run(feeds);
      const outputName = session.outputNames[0] || Object.keys(outputMap)[0] || RMBG2_MANIFEST.outputName;
      outputTensor = outputMap[outputName];
      inferenceTimeMs = Date.now() - inferStart;

      if (!outputTensor || !outputTensor.data) {
        throw new Error("RMBG-2.0 ONNX model inference produced empty or invalid output tensor.");
      }

      // Stage 7: Applying alpha mask & generating transparent PNG
      progressManager.updateProgress(
        taskId,
        0.92,
        "Extracting neural alpha mask & rendering high-quality transparent PNG..."
      );

      const rawMaskData = outputTensor.data as Float32Array;
      const { transparentPngUrl, transparentPixelCount, hasAlpha } = this.compositeAlphaMask(
        img,
        rawMaskData,
        targetDim
      );

      progressManager.updateProgress(taskId, 0.98, "Verifying output alpha mask integrity...");

      // Output Automated Verification
      const verification = AIOutputVerifier.verify(
        "background-removal",
        { imageBase64OrUrl, inputMediaType: "image" },
        { outputImageBase64OrUrl: transparentPngUrl },
        "image"
      );

      if (!verification.passed || !hasAlpha || transparentPixelCount === 0) {
        throw new Error(
          `RMBG-2.0 inference produced invalid output mask: ${
            verification.reason || "No transparent pixels generated by model."
          }`
        );
      }

      const totalTimeMs = Date.now() - startTime;
      progressManager.updateProgress(taskId, 1.0, "RMBG-2.0 background removal completed successfully!");

      return {
        outputImageBase64OrUrl: transparentPngUrl,
        mimeType: "image/png",
        width: origW,
        height: origH,
        appliedEngine: `BRIA RMBG-2.0 Neural Model (${providerUsed.toUpperCase()} ${fromCache ? "Cached" : "Fresh"})`,
        executionTimeMs: totalTimeMs,
        providerUsed: `rmbg2-onnx-${providerUsed}`,
        performanceMetrics: {
          downloadTimeMs: fromCache ? 0 : modelLoadTimeMs,
          modelLoadTimeMs,
          inferenceTimeMs,
          totalTimeMs,
          ramUsageEstimateMB: Math.round((floatArray.byteLength + rawMaskData.byteLength) / (1024 * 1024)),
          fromCache,
          executionProvider: providerUsed,
        },
        qualityMetrics: {
          originalWidth: origW,
          originalHeight: origH,
          isLocalExecution: true,
          hasAlphaChannel: hasAlpha,
          transparentPixelCount,
          executionProvider: providerUsed,
        },
      };
    } catch (err: any) {
      console.error("[RMBG2ModelEngine] RMBG-2.0 Inference Execution Failure:", err);
      throw new Error(`RMBG-2.0 execution failed: ${err?.message || String(err)}`);
    } finally {
      // Memory Disposal: Release tensors & clean offscreen canvas
      if (inputTensor && typeof (inputTensor as any).dispose === "function") {
        try { (inputTensor as any).dispose(); } catch {}
      }
      if (outputTensor && typeof (outputTensor as any).dispose === "function") {
        try { (outputTensor as any).dispose(); } catch {}
      }
      if (prepCanvas) {
        prepCanvas.width = 0;
        prepCanvas.height = 0;
      }
    }
  }

  /**
   * Preprocess HTMLImageElement to [1, 3, 1024, 1024] Float32Array (ImageNet normalized CHW layout)
   */
  private preprocessImage(
    img: HTMLImageElement,
    targetDim: number,
    mean: [number, number, number],
    std: [number, number, number]
  ): { floatArray: Float32Array; canvas: HTMLCanvasElement } {
    const canvas = document.createElement("canvas");
    canvas.width = targetDim;
    canvas.height = targetDim;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to create 2D canvas context for tensor preprocessing.");
    }

    ctx.drawImage(img, 0, 0, targetDim, targetDim);
    const imgData = ctx.getImageData(0, 0, targetDim, targetDim);
    const rgba = imgData.data;

    // Planar CHW layout: [1, 3, 1024, 1024]
    const floatArray = new Float32Array(3 * targetDim * targetDim);
    const channelSize = targetDim * targetDim;

    for (let i = 0; i < channelSize; i++) {
      const r = rgba[i * 4] / 255.0;
      const g = rgba[i * 4 + 1] / 255.0;
      const b = rgba[i * 4 + 2] / 255.0;

      floatArray[i] = (r - mean[0]) / std[0];
      floatArray[channelSize + i] = (g - mean[1]) / std[1];
      floatArray[2 * channelSize + i] = (b - mean[2]) / std[2];
    }

    return { floatArray, canvas };
  }

  /**
   * Composite original image RGB with predicted neural mask probabilities
   */
  private compositeAlphaMask(
    img: HTMLImageElement,
    maskData: Float32Array,
    maskDim: number
  ): { transparentPngUrl: string; transparentPixelCount: number; hasAlpha: boolean } {
    const origW = img.width;
    const origH = img.height;

    // Detect if model output is raw logits vs pre-sigmoid probabilities
    let minVal = Infinity;
    let maxVal = -Infinity;
    const sampleStep = Math.max(1, Math.floor(maskData.length / 1000));
    for (let i = 0; i < maskData.length; i += sampleStep) {
      const v = maskData[i];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    const isLogits = minVal < -0.01 || maxVal > 1.01;

    // Render on full-res destination canvas
    const canvas = document.createElement("canvas");
    canvas.width = origW;
    canvas.height = origH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create 2D canvas context for alpha mask composition.");
    }

    ctx.drawImage(img, 0, 0, origW, origH);
    const imgData = ctx.getImageData(0, 0, origW, origH);
    const pixels = imgData.data;

    let transparentPixelCount = 0;

    // Bilinear sampling scale ratios from 1024x1024 mask to original dimensions
    const scaleX = maskDim / origW;
    const scaleY = maskDim / origH;

    for (let y = 0; y < origH; y++) {
      const gy = (y + 0.5) * scaleY - 0.5;
      const gyi = Math.floor(gy);
      const fy = gy - gyi;
      const y0 = Math.max(0, Math.min(maskDim - 1, gyi));
      const y1 = Math.max(0, Math.min(maskDim - 1, gyi + 1));

      for (let x = 0; x < origW; x++) {
        const gx = (x + 0.5) * scaleX - 0.5;
        const gxi = Math.floor(gx);
        const fx = gx - gxi;
        const x0 = Math.max(0, Math.min(maskDim - 1, gxi));
        const x1 = Math.max(0, Math.min(maskDim - 1, gxi + 1));

        const v00 = maskData[y0 * maskDim + x0];
        const v10 = maskData[y0 * maskDim + x1];
        const v01 = maskData[y1 * maskDim + x0];
        const v11 = maskData[y1 * maskDim + x1];

        let rawVal = (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 + (1 - fx) * fy * v01 + fx * fy * v11;

        if (isLogits) {
          rawVal = 1 / (1 + Math.exp(-rawVal));
        }

        const alphaProb = Math.max(0, Math.min(1, rawVal));
        const alphaByte = Math.round(alphaProb * 255);

        const pixelIdx = (y * origW + x) * 4;
        pixels[pixelIdx + 3] = alphaByte;

        if (alphaByte < 240) {
          transparentPixelCount++;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const transparentPngUrl = canvas.toDataURL("image/png");
    const hasAlpha = transparentPixelCount > 0;

    return { transparentPngUrl, transparentPixelCount, hasAlpha };
  }

  private loadImage(src: string | Blob | File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      let objectUrl: string | null = null;
      if (typeof Blob !== "undefined" && src instanceof Blob) {
        objectUrl = URL.createObjectURL(src);
        img.src = objectUrl;
      } else {
        img.src = src as string;
      }
      img.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = (e) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error(`Failed to load image for RMBG processing: ${String(e)}`));
      };
    });
  }
}
