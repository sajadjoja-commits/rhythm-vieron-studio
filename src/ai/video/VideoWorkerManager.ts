/**
 * Video Worker Manager
 * Robust Hybrid Processing Architecture:
 * 
 * Main Thread:
 * - HTMLVideoElement frame seeking and decoding (requires DOM APIs)
 * - MediaPipe WASM Neural Segmentation inference (uses GPU/WASM context)
 * - WebCodecs / MediaRecorder hardware-accelerated video multiplexing
 * 
 * Dedicated Worker (Off-Main-Thread):
 * - Adaptive CLAHE Dynamic Range Equalization
 * - Spatial Bilateral Denoising / Filtering & Unsharp Masking
 * - Temporal Alpha Hysteresis Smoothing & Alpha Channel Compositing
 * - Mathematical Frame Difference & Alpha Metrics Calculation
 * 
 * Features zero-copy ArrayBuffer transfers, worker lifecycle management,
 * timeout supervision, cancellation, and graceful local fallback if Workers are blocked.
 */

import { VideoAITaskType, VideoAIOptions, VideoAIResult } from "./types";
import { VideoJobManager, VideoJobRecord } from "./VideoJobManager";
import { VideoEnhancementEngine, FrameComparisonMetrics } from "./VideoEnhancementEngine";

export interface WorkerEnhancementResult {
  data: Uint8ClampedArray;
  currentLuminance: Float32Array;
  metrics?: FrameComparisonMetrics | null;
}

export interface WorkerSegmentationResult {
  data: Uint8ClampedArray;
  currentAlpha: Float32Array;
  stats?: {
    alphaMean: number;
    foregroundPercentage: number;
    transparentPercentage: number;
    metrics?: FrameComparisonMetrics | null;
  };
}

const SIGMOID_LUT = new Float32Array(1001);
for (let i = 0; i <= 1000; i++) {
  SIGMOID_LUT[i] = 1 / (1 + Math.exp(-12 * (i / 1000 - 0.5)));
}

export class VideoWorkerManager {
  private static instance: VideoWorkerManager;
  private get jobManager(): VideoJobManager {
    return VideoJobManager.getInstance();
  }
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (val: any) => void;
      reject: (err: any) => void;
      timer: any;
    }
  >();
  private workerAvailable = false;
  private isInitializing = false;

  public static getInstance(): VideoWorkerManager {
    if (!VideoWorkerManager.instance) {
      VideoWorkerManager.instance = new VideoWorkerManager();
    }
    return VideoWorkerManager.instance;
  }

  constructor() {
    this.initWorker();
  }

  /**
   * Initializes the Dedicated Web Worker.
   * Gracefully degrades to local fallback if Worker creation fails in strict iframe sandboxes.
   */
  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      this.workerAvailable = false;
      return;
    }

    if (this.worker || this.isInitializing) return;
    this.isInitializing = true;

    try {
      this.worker = new Worker(
        new URL("./frameProcessing.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg || !msg.id) return;

        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.id);

          if (msg.type === "SUCCESS") {
            pending.resolve(msg);
          } else {
            pending.reject(new Error(msg.error || "Worker processing failed"));
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn("[VideoWorkerManager] Dedicated Worker encountered error, using local pipeline:", err);
        this.workerAvailable = false;
      };

      this.workerAvailable = true;
      console.log("[VideoWorkerManager] Dedicated Web Worker successfully spawned for background video DSP.");
    } catch (workerErr) {
      console.warn("[VideoWorkerManager] Unable to instantiate Dedicated Worker (sandbox/CORS constraint). Falling back to direct thread processing:", workerErr);
      this.workerAvailable = false;
      this.worker = null;
    } finally {
      this.isInitializing = false;
    }
  }

  private toTransferableBuffer(view: ArrayBufferView): ArrayBuffer {
    if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
      return view.buffer as ArrayBuffer;
    }
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  private composeSegmentationLocally(
    width: number,
    height: number,
    imageData: ImageData,
    maskData: Float32Array,
    maskWidth: number,
    maskHeight: number,
    options?: VideoAIOptions & { frameIndex?: number },
    prevAlpha?: Float32Array | null,
    sampleOriginal?: Uint8ClampedArray | null
  ): WorkerSegmentationResult {
    const smoothingFactor = options?.temporalSmoothing ?? 0.65;
    const bgColor = options?.backgroundColor || "transparent";
    const numPixels = width * height;
    const data = imageData.data;
    const hasValidPrevAlpha = Boolean(prevAlpha && prevAlpha.length === numPixels);
    const currentAlpha = hasValidPrevAlpha ? prevAlpha! : new Float32Array(numPixels);

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

        if (hasValidPrevAlpha) {
          const pA = prevAlpha![idx];
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
          data[pixelIdx] = Math.round(data[pixelIdx] * fgAlpha + bgR * (1 - fgAlpha));
          data[pixelIdx + 1] = Math.round(data[pixelIdx + 1] * fgAlpha + bgG * (1 - fgAlpha));
          data[pixelIdx + 2] = Math.round(data[pixelIdx + 2] * fgAlpha + bgB * (1 - fgAlpha));
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
    const metrics =
      sampleOriginal && sampleOriginal.length === data.length
        ? VideoEnhancementEngine.getInstance().calculateFrameMetrics(sampleOriginal, data)
        : null;

    return {
      data,
      currentAlpha,
      stats: {
        alphaMean,
        foregroundPercentage,
        transparentPercentage,
        metrics,
      },
    };
  }

  /**
   * Offloads CPU-intensive frame enhancement (CLAHE + Bilateral Filter + Unsharp Mask) to Worker.
   */
  public async processEnhanceFrame(
    width: number,
    height: number,
    imageData: ImageData,
    options?: VideoAIOptions,
    prevLuminance?: Float32Array | null,
    sampleOriginal?: Uint8ClampedArray | null
  ): Promise<WorkerEnhancementResult> {
    if (!this.workerAvailable || !this.worker) {
      // Local fallback
      const origCopy = sampleOriginal ? new Uint8ClampedArray(sampleOriginal) : null;
      const res = VideoEnhancementEngine.getInstance().processFrame(imageData, options, prevLuminance);
      const metrics = origCopy
        ? VideoEnhancementEngine.getInstance().calculateFrameMetrics(origCopy, imageData.data)
        : null;
      return {
        data: imageData.data,
        currentLuminance: res.currentLuminance,
        metrics,
      };
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const dataBuffer = this.toTransferableBuffer(imageData.data);
    const prevLumBuffer = prevLuminance && prevLuminance.byteLength > 0 ? this.toTransferableBuffer(prevLuminance) : null;
    const sampleOrigBuffer = sampleOriginal && sampleOriginal.byteLength > 0 ? this.toTransferableBuffer(sampleOriginal) : null;

    const transferables: Transferable[] = [dataBuffer];
    if (prevLumBuffer && prevLumBuffer !== dataBuffer) transferables.push(prevLumBuffer);
    if (sampleOrigBuffer && !transferables.includes(sampleOrigBuffer)) transferables.push(sampleOrigBuffer);

    return new Promise<WorkerEnhancementResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.workerAvailable = false;
        try {
          this.worker?.terminate();
        } catch {}
        this.worker = null;

        console.warn(`[VideoWorkerManager] Worker request ${id} timed out.`);
        if (imageData.data.byteLength > 0) {
          const validPrevLum = prevLuminance && prevLuminance.byteLength > 0 ? prevLuminance : null;
          const res = VideoEnhancementEngine.getInstance().processFrame(imageData, options, validPrevLum);
          resolve({
            data: imageData.data,
            currentLuminance: res.currentLuminance,
          });
        } else {
          reject(new Error(`Enhance worker request ${id} timed out`));
        }
      }, 5000);

      this.pendingRequests.set(id, {
        timer,
        resolve: (msg: any) => {
          const processedData = new Uint8ClampedArray(msg.dataBuffer);
          const currentLuminance = new Float32Array(msg.currentLuminanceBuffer);
          resolve({
            data: processedData,
            currentLuminance,
            metrics: msg.metrics,
          });
        },
        reject,
      });

      this.worker!.postMessage(
        {
          type: "ENHANCE_FRAME",
          id,
          width,
          height,
          dataBuffer,
          options: {
            claheClipLimit: options?.claheClipLimit,
            denoiseIntensity: options?.denoiseIntensity,
            sharpnessIntensity: options?.sharpnessIntensity,
            colorVibrance: options?.colorVibrance,
          },
          prevLuminanceBuffer: prevLumBuffer,
          sampleOriginalBuffer: sampleOrigBuffer,
        },
        transferables
      );
    });
  }

  /**
   * Offloads video background removal composition & temporal alpha smoothing to Worker.
   */
  public async processSegmentationComposition(
    width: number,
    height: number,
    imageData: ImageData,
    maskData: Float32Array,
    maskWidth: number,
    maskHeight: number,
    options?: VideoAIOptions & { frameIndex?: number },
    prevAlpha?: Float32Array | null,
    sampleOriginal?: Uint8ClampedArray | null
  ): Promise<WorkerSegmentationResult> {
    if (!this.workerAvailable || !this.worker) {
      return this.composeSegmentationLocally(
        width,
        height,
        imageData,
        maskData,
        maskWidth,
        maskHeight,
        options,
        prevAlpha,
        sampleOriginal
      );
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const dataBuffer = this.toTransferableBuffer(imageData.data);
    const maskBuffer = this.toTransferableBuffer(maskData);
    const prevAlphaBuffer = prevAlpha && prevAlpha.byteLength > 0 ? this.toTransferableBuffer(prevAlpha) : null;
    const sampleOrigBuffer = sampleOriginal && sampleOriginal.byteLength > 0 ? this.toTransferableBuffer(sampleOriginal) : null;

    const transferables: Transferable[] = [dataBuffer];
    if (maskBuffer !== dataBuffer) transferables.push(maskBuffer);
    if (prevAlphaBuffer && !transferables.includes(prevAlphaBuffer)) transferables.push(prevAlphaBuffer);
    if (sampleOrigBuffer && !transferables.includes(sampleOrigBuffer)) transferables.push(sampleOrigBuffer);

    return new Promise<WorkerSegmentationResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.workerAvailable = false;
        try {
          this.worker?.terminate();
        } catch {}
        this.worker = null;

        console.warn(`[VideoWorkerManager] Segmentation worker request ${id} timed out.`);
        if (imageData.data.byteLength > 0 && maskData.byteLength > 0) {
          const validPrevAlpha = prevAlpha && prevAlpha.byteLength > 0 ? prevAlpha : null;
          const validSampleOrig = sampleOriginal && sampleOriginal.byteLength > 0 ? sampleOriginal : null;
          resolve(
            this.composeSegmentationLocally(
              width,
              height,
              imageData,
              maskData,
              maskWidth,
              maskHeight,
              options,
              validPrevAlpha,
              validSampleOrig
            )
          );
        } else {
          reject(new Error(`Segmentation worker request ${id} timed out`));
        }
      }, 5000);

      this.pendingRequests.set(id, {
        timer,
        resolve: (msg: any) => {
          const processedData = new Uint8ClampedArray(msg.dataBuffer);
          const currentAlpha = new Float32Array(msg.currentAlphaBuffer);
          resolve({
            data: processedData,
            currentAlpha,
            stats: msg.stats,
          });
        },
        reject,
      });

      this.worker!.postMessage(
        {
          type: "SEGMENTATION_COMPOSITION",
          id,
          width,
          height,
          dataBuffer,
          maskBuffer,
          maskWidth,
          maskHeight,
          options: {
            temporalSmoothing: options?.temporalSmoothing,
            edgeFeather: options?.edgeFeather,
            backgroundColor: options?.backgroundColor,
            frameIndex: options?.frameIndex,
          },
          prevAlphaBuffer,
          sampleOriginalBuffer: sampleOrigBuffer,
        },
        transferables
      );
    });
  }

  // --------------------------------------------------------------------------
  // HIGH-LEVEL JOB ORCHESTRATION
  // --------------------------------------------------------------------------

  public async runVideoTask(
    taskType: VideoAITaskType,
    videoInput: string | Blob | File,
    options?: VideoAIOptions
  ): Promise<VideoAIResult> {
    const inputMediaUrl = typeof videoInput === "string" ? videoInput : "uploaded_video";
    return this.jobManager.startJob({
      taskType,
      videoInput,
      options,
      inputMediaUrl,
    });
  }

  public cancelJob(jobId: string): void {
    // Clear all pending worker requests for this job
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error("Video task cancelled by user."));
      this.pendingRequests.delete(id);
    }
    this.jobManager.cancelJob(jobId);
  }

  public getActiveJob(): VideoJobRecord | null {
    return this.jobManager.getActiveJob();
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerAvailable = false;
    }
    this.pendingRequests.clear();
  }
}
