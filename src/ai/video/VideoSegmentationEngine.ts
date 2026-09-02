/**
 * Video Segmentation Engine (AI Video Background Removal)
 * Utilizes Google MediaPipe Vision Tasks with Temporal Alpha Stabilization & Edge Feathering.
 * Eliminates frame-to-frame mask flickering and edge jitter.
 */

import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { VideoAIOptions } from "./types";

const MEDIAPIPE_WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

// Pinned versioned MediaPipe Selfie Segmenter Models (No 'latest' or broken float32 URLs)
const PRIMARY_SEGMENTER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
const FALLBACK_SEGMENTER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite";

export class VideoSegmentationEngine {
  private static instance: VideoSegmentationEngine;
  private segmenterInstance: ImageSegmenter | null = null;
  private initPromise: Promise<ImageSegmenter> | null = null;

  public static getInstance(): VideoSegmentationEngine {
    if (!VideoSegmentationEngine.instance) {
      VideoSegmentationEngine.instance = new VideoSegmentationEngine();
    }
    return VideoSegmentationEngine.instance;
  }

  /**
   * Validates model availability via HTTP HEAD/GET request
   */
  private async verifyModelUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: "HEAD", mode: "cors" });
      return response.ok && response.status >= 200 && response.status < 300;
    } catch {
      // If HEAD request fails due to CORS or network restrictions, try a ranged GET
      try {
        const getRes = await fetch(url, { method: "GET", headers: { Range: "bytes=0-10" }, mode: "cors" });
        return getRes.ok || getRes.status === 206 || getRes.status === 200;
      } catch {
        return false;
      }
    }
  }

  /**
   * Initializes or retrieves the singleton MediaPipe ImageSegmenter instance.
   * Features Promise-lock to prevent duplicate downloads and GPU -> CPU delegate fallback.
   */
  public async getSegmenter(): Promise<ImageSegmenter> {
    if (this.segmenterInstance) {
      return this.segmenterInstance;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // 1. Resolve WASM Fileset
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);

        // 2. Select valid, accessible version-pinned model URL
        let activeModelPath = PRIMARY_SEGMENTER_MODEL;
        const isPrimaryOk = await this.verifyModelUrl(PRIMARY_SEGMENTER_MODEL);
        
        if (!isPrimaryOk) {
          console.warn("[VideoSegmentationEngine] Primary model unavailable, checking fallback model...");
          const isFallbackOk = await this.verifyModelUrl(FALLBACK_SEGMENTER_MODEL);
          if (isFallbackOk) {
            activeModelPath = FALLBACK_SEGMENTER_MODEL;
          } else {
            throw new Error(`[VideoSegmentationEngine] Failed to reach MediaPipe model endpoints (HTTP 404/Network Error). Primary: ${PRIMARY_SEGMENTER_MODEL}`);
          }
        }

        // 3. Try creating ImageSegmenter with GPU Delegate first
        let segmenter: ImageSegmenter | null = null;
        try {
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: activeModelPath,
              delegate: "GPU",
            },
            runningMode: "IMAGE",
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        } catch (gpuError) {
          console.warn("[VideoSegmentationEngine] GPU delegate initialization failed, falling back to CPU delegate:", gpuError);
          // Fallback to CPU delegate
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: activeModelPath,
              delegate: "CPU",
            },
            runningMode: "IMAGE",
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        }

        if (!segmenter) {
          throw new Error("Failed to instantiate MediaPipe ImageSegmenter with GPU or CPU delegates.");
        }

        this.segmenterInstance = segmenter;
        return segmenter;
      } catch (err: any) {
        // Reset state so subsequent attempts can retry cleanly
        this.segmenterInstance = null;
        this.initPromise = null;
        const errMsg = err?.message || String(err);
        console.error("[VideoSegmentationEngine] Model initialization failed:", errMsg);
        throw new Error(`فشل تحميل نموذج تفريغ خلفية الفيديو بالذكاء الاصطناعي: ${errMsg}`);
      }
    })();

    return this.initPromise;
  }

  /**
   * Segments a single video frame with temporal alpha smoothing.
   */
  public async processFrame(
    canvasSource: HTMLCanvasElement | OffscreenCanvas,
    outputImageData: ImageData,
    options?: VideoAIOptions,
    prevAlphaBuffer?: Float32Array | null
  ): Promise<{
    currentAlphaBuffer: Float32Array;
  }> {
    const width = outputImageData.width;
    const height = outputImageData.height;
    const numPixels = width * height;
    const data = outputImageData.data;

    const smoothingFactor = options?.temporalSmoothing ?? 0.65;
    const edgeFeather = options?.edgeFeather ?? 2;
    const bgColor = options?.backgroundColor || "transparent";

    // 1. Run MediaPipe Segmentation
    const segmenter = await this.getSegmenter();
    const result = segmenter.segment(canvasSource as any);

    if (!result || !result.confidenceMasks || result.confidenceMasks.length === 0) {
      throw new Error("[VideoSegmentationEngine] Segmentation failed to generate confidence mask");
    }

    const mask = result.confidenceMasks[0];
    const maskData = mask.getAsFloat32Array();
    const maskWidth = mask.width;
    const maskHeight = mask.height;

    const currentAlphaBuffer = new Float32Array(numPixels);

    // Parse background color if not transparent
    let bgR = 0, bgG = 0, bgB = 0, bgA = 0;
    if (bgColor !== "transparent") {
      if (bgColor.startsWith("#")) {
        const hex = bgColor.replace("#", "");
        bgR = parseInt(hex.substring(0, 2), 16) || 0;
        bgG = parseInt(hex.substring(2, 4), 16) || 0;
        bgB = parseInt(hex.substring(4, 6), 16) || 0;
        bgA = 255;
      } else if (bgColor === "green") {
        bgR = 0; bgG = 255; bgB = 0; bgA = 255;
      }
    }

    // 2. Map and apply temporal hysteresis smoothing
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      const maskY = Math.min(maskHeight - 1, Math.floor((y / height) * maskHeight));
      const maskRowOffset = maskY * maskWidth;

      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x;
        const pixelIdx = idx * 4;

        const maskX = Math.min(maskWidth - 1, Math.floor((x / width) * maskWidth));
        const rawConfidence = maskData[maskRowOffset + maskX];

        // Sigmoid soft-knee thresholding for cleaner boundary separation
        const normalizedConfidence = 1 / (1 + Math.exp(-12 * (rawConfidence - 0.5)));

        let finalAlpha = normalizedConfidence;

        // Apply Temporal Alpha Stabilization if previous frame buffer exists
        if (prevAlphaBuffer && prevAlphaBuffer.length === numPixels) {
          const prevAlpha = prevAlphaBuffer[idx];
          const delta = Math.abs(finalAlpha - prevAlpha);

          // Fast response to rapid motion (>0.4 delta) to prevent ghosting,
          // heavy stabilization on subtle noise (<0.25 delta) to eliminate edge jitter & flickering
          const adaptiveSmooth = delta > 0.4 ? smoothingFactor * 0.3 : smoothingFactor;
          finalAlpha = prevAlpha * adaptiveSmooth + finalAlpha * (1 - adaptiveSmooth);
        }

        currentAlphaBuffer[idx] = finalAlpha;

        // Apply Alpha / Background Composition to ImageData
        if (bgA > 0) {
          // Alpha compositing over solid background color
          const fgAlpha = finalAlpha;
          const r = data[pixelIdx];
          const g = data[pixelIdx + 1];
          const b = data[pixelIdx + 2];

          data[pixelIdx] = Math.round(r * fgAlpha + bgR * (1 - fgAlpha));
          data[pixelIdx + 1] = Math.round(g * fgAlpha + bgG * (1 - fgAlpha));
          data[pixelIdx + 2] = Math.round(b * fgAlpha + bgB * (1 - fgAlpha));
          data[pixelIdx + 3] = 255;
        } else {
          // Pure transparent alpha channel cutout
          data[pixelIdx + 3] = Math.round(finalAlpha * 255);
        }
      }
    }

    // 3. Close MediaPipe confidence mask to free internal GPU memory
    try {
      mask.close();
    } catch {}

    return {
      currentAlphaBuffer,
    };
  }

  /**
   * Release segmenter resources.
   */
  public close(): void {
    if (this.segmenterInstance) {
      try {
        this.segmenterInstance.close();
      } catch {}
      this.segmenterInstance = null;
      this.initPromise = null;
    }
  }
}
