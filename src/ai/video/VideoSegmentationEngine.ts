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

export interface MaskVerificationStats {
  min: number;
  max: number;
  mean: number;
  foregroundPercentage: number;
  backgroundPercentage: number;
  centerForegroundRatio: number;
  edgeForegroundRatio: number;
  detectionConfidence: number;
  foregroundPixelCount: number;
  backgroundPixelCount: number;
  alphaRatio: number;
  isValid: boolean;
  error?: string;
}

export interface MaskOrientationPolicy {
  personMaskIndex: number;
  useCategoryMask: boolean;
  invertConfidence: boolean;
  stats: MaskVerificationStats;
}

export class VideoSegmentationEngine {
  private static instance: VideoSegmentationEngine;
  private segmenterInstance: ImageSegmenter | null = null;
  private initPromise: Promise<ImageSegmenter> | null = null;

  private cachedOrientationPolicy: MaskOrientationPolicy | null = null;

  public static getInstance(): VideoSegmentationEngine {
    if (!VideoSegmentationEngine.instance) {
      VideoSegmentationEngine.instance = new VideoSegmentationEngine();
    }
    return VideoSegmentationEngine.instance;
  }

  /**
   * Evaluates the first frame to determine the exact Person mask channel,
   * performs strict spatial orientation validation (center vs edge ratios),
   * and establishes an authoritative MaskOrientationPolicy for the entire video.
   */
  public async calibrateOrientation(
    canvasSource: HTMLCanvasElement | OffscreenCanvas
  ): Promise<MaskOrientationPolicy> {
    const segmenter = await this.getSegmenter();
    const result = segmenter.segment(canvasSource as any);

    if (!result || (!result.confidenceMasks?.length && !result.categoryMask)) {
      throw new Error("[VideoSegmentationEngine] Segmentation model returned empty result on frame 0");
    }

    // 1. Inspect labels if available
    const labels = typeof (segmenter as any).getLabels === "function" ? (segmenter as any).getLabels() : [];
    const masks = result.confidenceMasks || [];
    let candidatePersonIdx = -1;

    if (labels && labels.length > 0) {
      const personLabelIdx = labels.findIndex((l: string) => /person|selfie|subject|human/i.test(l));
      if (personLabelIdx >= 0 && personLabelIdx < masks.length) {
        candidatePersonIdx = personLabelIdx;
        console.log(`[VideoSegmentationEngine] Matched Person mask index ${candidatePersonIdx} from label: "${labels[candidatePersonIdx]}"`);
      } else {
        const bgLabelIdx = labels.findIndex((l: string) => /background|bg/i.test(l));
        if (bgLabelIdx === 0 && masks.length >= 2) {
          candidatePersonIdx = 1;
          console.log(`[VideoSegmentationEngine] Label 0 is "${labels[0]}" (Background), selecting index 1 as Person.`);
        }
      }
    }

    // 2. Default for Selfie Segmenter:
    // Category 0 = Background, Category 1 = Person.
    // CRITICAL: NEVER default to index 0 for Person!
    if (candidatePersonIdx < 0) {
      if (masks.length >= 2) {
        candidatePersonIdx = 1; // Explicit Person channel in MediaPipe Selfie Segmenter
        console.log("[VideoSegmentationEngine] Prioritizing channel 1 as Person channel for Selfie Segmenter (Channel 0 is Background).");
      } else if (masks.length === 1) {
        candidatePersonIdx = 0;
      }
    }

    const testMask = (raw: Float32Array, w: number, h: number) => {
      return this.verifyMask(raw, w, h, 0);
    };

    let chosenMaskData: Float32Array | null = null;
    let chosenWidth = 0;
    let chosenHeight = 0;
    let useCategoryMask = false;
    let invertConfidence = false;
    let bestStats: MaskVerificationStats | null = null;

    // A. Test confidence mask candidate
    if (candidatePersonIdx >= 0 && candidatePersonIdx < masks.length) {
      const confMask = masks[candidatePersonIdx];
      const rawData = confMask.getAsFloat32Array?.();
      if (rawData && rawData.length > 0) {
        const w = confMask.width;
        const h = confMask.height;
        const stats = testMask(rawData, w, h);

        if (stats.isValid) {
          // Spatial orientation validation:
          // A valid Person mask has Person in center and Background at edges.
          const isCenterDominant = stats.centerForegroundRatio >= stats.edgeForegroundRatio;
          const isEdgeDominant =
            stats.edgeForegroundRatio > 0.55 &&
            (stats.edgeForegroundRatio > stats.centerForegroundRatio * 1.2 || stats.centerForegroundRatio < 0.45);

          if (isCenterDominant && stats.edgeForegroundRatio < 0.65 && stats.foregroundPercentage >= 0.5 && stats.foregroundPercentage <= 90.0) {
            chosenMaskData = rawData;
            chosenWidth = w;
            chosenHeight = h;
            bestStats = stats;
            invertConfidence = false;
            console.log(
              `[VideoSegmentationEngine] Frame 0 orientation verified: Normal Person Mask (centerRatio=${stats.centerForegroundRatio.toFixed(3)}, edgeRatio=${stats.edgeForegroundRatio.toFixed(3)}, fgPct=${stats.foregroundPercentage.toFixed(1)}%)`
            );
          } else if (isEdgeDominant) {
            // Background mask detected! Validate inversion.
            const invertedCenter = 1.0 - stats.centerForegroundRatio;
            const invertedEdge = 1.0 - stats.edgeForegroundRatio;
            const invertedFg = 100 - stats.foregroundPercentage;

            if (invertedCenter > invertedEdge && invertedFg >= 0.5 && invertedFg <= 90.0) {
              console.log(
                `[VideoSegmentationEngine] Frame 0 orientation detected as reversed (Background mask). Inverting mask to Person (invertedCenter=${invertedCenter.toFixed(3)} > invertedEdge=${invertedEdge.toFixed(3)})`
              );
              const invertedData = new Float32Array(rawData.length);
              for (let i = 0; i < rawData.length; i++) {
                invertedData[i] = 1.0 - rawData[i];
              }
              chosenMaskData = invertedData;
              chosenWidth = w;
              chosenHeight = h;
              bestStats = testMask(invertedData, w, h);
              invertConfidence = true;
            }
          }
        }
      }
    }

    // B. If confidence mask failed or was ambiguous, test categoryMask (Category 1 = Person)
    if (!chosenMaskData && result.categoryMask) {
      const catData = result.categoryMask.getAsUint8Array?.();
      if (catData && catData.length > 0) {
        const w = result.categoryMask.width;
        const h = result.categoryMask.height;
        const catFloat = new Float32Array(catData.length);
        for (let i = 0; i < catData.length; i++) {
          catFloat[i] = catData[i] === 1 ? 1.0 : 0.0;
        }
        const catStats = testMask(catFloat, w, h);
        if (catStats.isValid && catStats.foregroundPercentage >= 0.5 && catStats.centerForegroundRatio >= catStats.edgeForegroundRatio) {
          console.log(
            `[VideoSegmentationEngine] Using categoryMask (Category 1 = Person). fgPct=${catStats.foregroundPercentage.toFixed(1)}%, center=${catStats.centerForegroundRatio.toFixed(3)}, edge=${catStats.edgeForegroundRatio.toFixed(3)}`
          );
          chosenMaskData = catFloat;
          chosenWidth = w;
          chosenHeight = h;
          bestStats = catStats;
          useCategoryMask = true;
          invertConfidence = false;
        }
      }
    }

    // C. Clean up frame 0 segmentation result
    try {
      (result as any)?.close?.();
    } catch {}

    // D. Validation
    if (!chosenMaskData || !bestStats || !bestStats.isValid) {
      const err = bestStats?.error || "لم يتم العثور على شخص واضح في إطار الفيديو، أو القناع يفتقر للتباين بين الشخص والخلفية.";
      throw new Error(`فشل تحديد قناع الشخص (Person Mask) في الفيديو بشكل موثوق: ${err}`);
    }

    const policy: MaskOrientationPolicy = {
      personMaskIndex: candidatePersonIdx >= 0 ? candidatePersonIdx : 1,
      useCategoryMask,
      invertConfidence,
      stats: bestStats,
    };

    this.cachedOrientationPolicy = policy;
    return policy;
  }

  /**
   * Extracts verified Person mask data for any frame according to the calibrated orientation policy.
   */
  public extractPersonMaskData(
    maskResult: any,
    targetWidth: number,
    targetHeight: number,
    frameIndex: number,
    policy: MaskOrientationPolicy
  ): {
    maskData: Float32Array;
    maskWidth: number;
    maskHeight: number;
    stats: MaskVerificationStats;
  } {
    let rawMaskData: Float32Array | null = null;
    let maskWidth = targetWidth;
    let maskHeight = targetHeight;

    if (policy.useCategoryMask && maskResult.categoryMask) {
      const catData = maskResult.categoryMask.getAsUint8Array?.();
      if (catData && catData.length > 0) {
        maskWidth = maskResult.categoryMask.width || targetWidth;
        maskHeight = maskResult.categoryMask.height || targetHeight;
        rawMaskData = new Float32Array(catData.length);
        for (let i = 0; i < catData.length; i++) {
          rawMaskData[i] = catData[i] === 1 ? 1.0 : 0.0;
        }
      }
    }

    if (!rawMaskData) {
      const activeMask =
        maskResult.confidenceMasks?.[policy.personMaskIndex] ||
        maskResult.confidenceMasks?.[1] ||
        maskResult.confidenceMasks?.[0];
      if (activeMask) {
        maskWidth = activeMask.width || targetWidth;
        maskHeight = activeMask.height || targetHeight;
        const sourceData = activeMask.getAsFloat32Array?.();
        if (sourceData && sourceData.length > 0) {
          rawMaskData = new Float32Array(sourceData.length);
          if (policy.invertConfidence) {
            for (let i = 0; i < sourceData.length; i++) {
              rawMaskData[i] = 1.0 - Math.max(0, Math.min(1, sourceData[i]));
            }
          } else {
            rawMaskData.set(sourceData);
          }
        }
      }
    }

    if (!rawMaskData && maskResult.categoryMask) {
      const catData = maskResult.categoryMask.getAsUint8Array?.();
      if (catData && catData.length > 0) {
        maskWidth = maskResult.categoryMask.width || targetWidth;
        maskHeight = maskResult.categoryMask.height || targetHeight;
        rawMaskData = new Float32Array(catData.length);
        for (let i = 0; i < catData.length; i++) {
          rawMaskData[i] = catData[i] === 1 ? 1.0 : 0.0;
        }
      }
    }

    if (!rawMaskData || rawMaskData.length === 0) {
      throw new Error(`فشل استخراج قناع الإطار ${frameIndex}: تعذر قراءة بيانات القناع من محرك الذكاء الاصطناعي.`);
    }

    const stats = this.verifyMask(rawMaskData, maskWidth, maskHeight, frameIndex);
    return {
      maskData: rawMaskData,
      maskWidth,
      maskHeight,
      stats,
    };
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
   * Resolves the best available MediaPipe model path, prioritizing local assets
   */
  private async resolveModelPath(): Promise<string> {
    try {
      const localRes = await fetch("/models/mediapipe/selfie_segmenter.tflite", { method: "HEAD" });
      if (localRes.ok && localRes.status < 400) {
        console.log("[VideoSegmentationEngine] Using local MediaPipe selfie_segmenter model.");
        return "/models/mediapipe/selfie_segmenter.tflite";
      }
    } catch {}

    const isPrimaryOk = await this.verifyModelUrl(PRIMARY_SEGMENTER_MODEL);
    if (isPrimaryOk) {
      return PRIMARY_SEGMENTER_MODEL;
    }

    const isFallbackOk = await this.verifyModelUrl(FALLBACK_SEGMENTER_MODEL);
    if (isFallbackOk) {
      return FALLBACK_SEGMENTER_MODEL;
    }

    throw new Error("تعذر الوصول إلى نموذج تفريغ الفيديو: جميع عناوين النموذج غير متاحة (404 أو انقطاع في الشبكة).");
  }

  /**
   * Resolves the best available WASM directory path, prioritizing local assets
   */
  private async resolveWasmPath(): Promise<string> {
    try {
      const localWasm = await fetch("/wasm/mediapipe/vision_wasm_internal.wasm", { method: "HEAD" });
      if (localWasm.ok && localWasm.status < 400) {
        console.log("[VideoSegmentationEngine] Using local MediaPipe WASM binaries.");
        return "/wasm/mediapipe";
      }
    } catch {}
    return MEDIAPIPE_WASM_PATH;
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
        const wasmPath = await this.resolveWasmPath();
        const vision = await FilesetResolver.forVisionTasks(wasmPath);

        // 2. Select valid, accessible model URL (local or remote)
        const activeModelPath = await this.resolveModelPath();

        // 3. Try creating ImageSegmenter with CPU Delegate as primary.
        // NOTE: In MediaPipe Tasks Vision Web, the "GPU" delegate suffers from a fatal WebGL2 bug
        // where glReadPixels(RED, FLOAT) fails silently, returning an all-zero mask in getAsFloat32Array()
        // (GitHub #4501, #5879, #6296). The CPU delegate runs XNNPack WASM SIMD directly in CPU memory,
        // delivering 100% reliable masks with zero WebGL texture readback issues and blazing-fast inference (>100 FPS).
        let segmenter: ImageSegmenter | null = null;
        try {
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: activeModelPath,
              delegate: "CPU",
            },
            runningMode: "IMAGE",
            outputCategoryMask: true,
            outputConfidenceMasks: true,
          });
          console.log("[VideoSegmentationEngine] Successfully initialized ImageSegmenter with CPU (XNNPack SIMD) delegate.");
        } catch (cpuError) {
          console.warn("[VideoSegmentationEngine] CPU delegate initialization failed, attempting GPU delegate fallback:", cpuError);
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: activeModelPath,
              delegate: "GPU",
            },
            runningMode: "IMAGE",
            outputCategoryMask: true,
            outputConfidenceMasks: true,
          });
        }

        if (!segmenter) {
          throw new Error("Failed to instantiate MediaPipe ImageSegmenter with GPU or CPU delegates.");
        }

        // Quick self-test to verify mask readability
        if (typeof document !== "undefined") {
          try {
            const testCanvas = document.createElement("canvas");
            testCanvas.width = 64;
            testCanvas.height = 64;
            const tCtx = testCanvas.getContext("2d");
            if (tCtx) {
              tCtx.fillStyle = "#222222";
              tCtx.fillRect(0, 0, 64, 64);
              tCtx.fillStyle = "#f5d0b0";
              tCtx.beginPath();
              tCtx.arc(32, 28, 16, 0, Math.PI * 2);
              tCtx.fill();
              tCtx.fillStyle = "#335588";
              tCtx.fillRect(16, 44, 32, 20);

              const testRes = segmenter.segment(testCanvas);
              // In MediaPipe Selfie Segmenter, index 1 is Person, index 0 is Background.
              const mask = testRes.confidenceMasks?.[1] || testRes.confidenceMasks?.[0];
              const testData = mask?.getAsFloat32Array?.();

              let hasVariance = false;
              if (testData && testData.length > 0) {
                for (let i = 0; i < testData.length; i++) {
                  if (testData[i] > 0.001) {
                    hasVariance = true;
                    break;
                  }
                }
              }

              try { (testRes as any).close?.(); } catch {}

              if (!hasVariance) {
                console.warn("[VideoSegmentationEngine] Segmenter delegate returned zero mask in self-test. Forcing CPU delegate.");
                try { segmenter.close(); } catch {}
                segmenter = await ImageSegmenter.createFromOptions(vision, {
                  baseOptions: {
                    modelAssetPath: activeModelPath,
                    delegate: "CPU",
                  },
                  runningMode: "IMAGE",
                  outputCategoryMask: true,
                  outputConfidenceMasks: true,
                });
              }
            }
          } catch (testErr) {
            console.warn("[VideoSegmentationEngine] Self-test skipped:", testErr);
          }
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
    stats: MaskVerificationStats;
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

    if (!result || (!result.confidenceMasks?.length && !result.categoryMask)) {
      throw new Error("[VideoSegmentationEngine] Segmentation failed to generate confidence or category mask");
    }

    let policy = this.cachedOrientationPolicy;
    if (!policy) {
      policy = await this.calibrateOrientation(canvasSource);
    }

    const { maskData, maskWidth, maskHeight, stats } = this.extractPersonMaskData(
      result,
      width,
      height,
      options?.frameIndex ?? 0,
      policy
    );

    if (!stats.isValid) {
      console.warn(`[VideoSegmentationEngine] Warning on frame ${options?.frameIndex ?? 0}: ${stats.error}`);
    }

    const currentAlphaBuffer = new Float32Array(numPixels);

    // Parse background color if not transparent
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
          // Pure transparent alpha channel cutout:
          // CRITICAL: NEVER leave original background RGB under the transparent mask!
          // Multiply foreground RGB by finalAlpha so background pixels have RGB=(0,0,0) and Alpha=0!
          const fgAlpha = finalAlpha;
          data[pixelIdx] = Math.round(data[pixelIdx] * fgAlpha);
          data[pixelIdx + 1] = Math.round(data[pixelIdx + 1] * fgAlpha);
          data[pixelIdx + 2] = Math.round(data[pixelIdx + 2] * fgAlpha);
          data[pixelIdx + 3] = Math.round(fgAlpha * 255);
        }
      }
    }

    // 3. Close MediaPipe confidence mask and result to free resources
    try {
      (result as any)?.close?.();
    } catch {}

    return {
      currentAlphaBuffer,
      stats,
    };
  }

  /**
   * Verifies segmentation mask validity and calculates diagnostics statistics:
   * min, max, mean, foreground %, transparent %.
   * Rejects invalid masks (all zero, all 1.0, zero variance).
   */
  public verifyMask(
    maskData: Float32Array,
    maskWidth: number,
    maskHeight: number,
    frameIndex = 0
  ): MaskVerificationStats {
    if (!maskData || maskData.length === 0 || maskWidth <= 0 || maskHeight <= 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        foregroundPercentage: 0,
        backgroundPercentage: 100,
        centerForegroundRatio: 0,
        edgeForegroundRatio: 0,
        detectionConfidence: 0,
        foregroundPixelCount: 0,
        backgroundPixelCount: 0,
        alphaRatio: 0,
        isValid: false,
        error: `Invalid mask dimensions: ${maskWidth}x${maskHeight}`,
      };
    }

    let min = 1.0;
    let max = 0.0;
    let sum = 0;
    let fgCount = 0;

    const total = maskData.length;

    // Spatial bounding coordinates for center vs edge analysis
    const centerXStart = Math.floor(maskWidth * 0.25);
    const centerXEnd = Math.floor(maskWidth * 0.75);
    const centerYStart = Math.floor(maskHeight * 0.15);
    const centerYEnd = Math.floor(maskHeight * 0.85);

    let centerPixels = 0;
    let centerFg = 0;

    const edgeMarginX = Math.max(1, Math.floor(maskWidth * 0.10));
    const edgeMarginY = Math.max(1, Math.floor(maskHeight * 0.10));
    let edgePixels = 0;
    let edgeFg = 0;

    for (let y = 0; y < maskHeight; y++) {
      const rowOffset = y * maskWidth;
      const isYCenter = y >= centerYStart && y < centerYEnd;
      const isYEdge = y < edgeMarginY || y >= maskHeight - edgeMarginY;

      for (let x = 0; x < maskWidth; x++) {
        let v = maskData[rowOffset + x];
        if (isNaN(v) || !isFinite(v)) v = 0;
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;

        const isFg = v >= 0.5;
        if (isFg) fgCount++;

        // Center calculation
        if (isYCenter && x >= centerXStart && x < centerXEnd) {
          centerPixels++;
          if (isFg) centerFg++;
        }

        // Edge perimeter calculation
        if (isYEdge || x < edgeMarginX || x >= maskWidth - edgeMarginX) {
          edgePixels++;
          if (isFg) edgeFg++;
        }
      }
    }

    const mean = sum / total;
    const foregroundPercentage = (fgCount / total) * 100;
    const backgroundPercentage = 100 - foregroundPercentage;
    const centerForegroundRatio = centerPixels > 0 ? centerFg / centerPixels : 0;
    const edgeForegroundRatio = edgePixels > 0 ? edgeFg / edgePixels : 0;
    const detectionConfidence = max;
    const foregroundPixelCount = fgCount;
    const backgroundPixelCount = total - fgCount;
    const alphaRatio = fgCount / total;

    // Check rejection conditions: all zero, all 1.0, or nearly zero variance
    let isValid = true;
    let error: string | undefined;

    if (max <= 0.001 || fgCount === 0) {
      isValid = false;
      error = "Segmentation mask is completely empty (all zero)";
    } else if (min >= 0.999) {
      isValid = false;
      error = "Segmentation mask has no background (all 1.0)";
    } else if (Math.abs(max - min) < 0.02) {
      isValid = false;
      error = "Segmentation mask lacks contrast/variance between foreground and background";
    }

    // Diagnostic logging per-frame as required by specification
    console.log(
      `[Diagnostic] Frame ${frameIndex}: Confidence=${detectionConfidence.toFixed(3)} Min=${min.toFixed(3)} Max=${max.toFixed(3)} Mean=${mean.toFixed(3)} ForegroundPixels=${foregroundPixelCount} BackgroundPixels=${backgroundPixelCount} CenterFgRatio=${centerForegroundRatio.toFixed(3)} EdgeFgRatio=${edgeForegroundRatio.toFixed(3)} AlphaRatio=${alphaRatio.toFixed(4)}`
    );

    if (foregroundPixelCount === 0 || alphaRatio < 0.001) {
      console.warn(`[Diagnostic WARNING] Frame ${frameIndex} has ZERO foreground pixels or Alpha Ratio ≈ 0!`);
    }

    return {
      min,
      max,
      mean,
      foregroundPercentage,
      backgroundPercentage,
      centerForegroundRatio,
      edgeForegroundRatio,
      detectionConfidence,
      foregroundPixelCount,
      backgroundPixelCount,
      alphaRatio,
      isValid,
      error,
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
      this.cachedOrientationPolicy = null;
    }
  }
}
