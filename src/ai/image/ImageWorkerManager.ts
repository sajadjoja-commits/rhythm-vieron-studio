/**
 * ImageWorkerManager
 * Dispatches Image AI tasks to dedicated Web Worker or falls back gracefully to main-thread execution.
 */

import {
  ImageAITaskType,
  ImageAIOptions,
  ImageAIResult,
  ImageWorkerRequest,
  ImageWorkerResponse,
  ImageCapabilityProfile,
} from "./types";
import { ImageCapabilityDetector } from "./ImageCapabilityDetector";
import { ImageInferenceEngine } from "./ImageInferenceEngine";

export class ImageWorkerManager {
  private static instance: ImageWorkerManager;
  private worker: Worker | null = null;
  private pendingRequests: Map<
    string,
    {
      taskType: ImageAITaskType;
      imageDataUrl: string;
      maskDataUrl?: string;
      options?: ImageAIOptions;
      resolve: (res: ImageAIResult) => void;
      reject: (err: any) => void;
      onProgress?: (prog: any) => void;
    }
  > = new Map();
  private isWorkerSupported = false;

  private constructor() {
    // Workers with DOM/MediaPipe dependencies execute directly via ImageInferenceEngine
    this.isWorkerSupported = false;
  }

  public static getInstance(): ImageWorkerManager {
    if (!ImageWorkerManager.instance) {
      ImageWorkerManager.instance = new ImageWorkerManager();
    }
    return ImageWorkerManager.instance;
  }

  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      this.isWorkerSupported = false;
      return;
    }

    try {
      // Use Vite's native worker import syntax
      this.worker = new Worker(
        new URL("./workers/imageAi.worker.ts", import.meta.url),
        { type: "module" }
      );

    this.worker.onmessage = (e: MessageEvent<ImageWorkerResponse>) => {
        const data = e.data;
        if (!data || !data.id) return;

        const pending = this.pendingRequests.get(data.id);
        if (!pending) return;

        if (data.type === "progress" && data.progress) {
          pending.onProgress?.(data.progress);
        } else if (data.type === "result" && data.result) {
          this.pendingRequests.delete(data.id);
          pending.resolve(data.result);
        } else if (data.type === "error") {
          this.pendingRequests.delete(data.id);
          console.warn("[ImageWorkerManager] Worker failed, falling back to direct execution:", data.error);
          this.executeDirect(pending.taskType, pending.imageDataUrl, pending.maskDataUrl, pending.options)
            .then(pending.resolve)
            .catch((err) => pending.reject(new Error(data.error || err?.message || "Execution failed")));
        }
      };

      this.worker.onerror = (err) => {
        console.warn("[ImageWorkerManager] Worker encountered error:", err);
      };
    } catch (e) {
      console.warn("[ImageWorkerManager] Failed to initialize worker, fallback to main thread:", e);
      this.isWorkerSupported = false;
      this.worker = null;
    }
  }

  /**
   * Execute Image AI task via Worker or Direct Main Thread fallback
   */
  public async execute(
    taskType: ImageAITaskType,
    imageDataUrl: string,
    maskDataUrl?: string,
    options?: ImageAIOptions
  ): Promise<ImageAIResult> {
    const detector = ImageCapabilityDetector.getInstance();
    const capability = await detector.detect();

    // MediaPipe tasks (remove-background, face-enhance) require DOM context for FilesetResolver.
    // If worker disabled, unsupported, or MediaPipe task, execute directly on main thread:
    if (
      !this.isWorkerSupported ||
      !this.worker ||
      options?.preferWorker === false ||
      taskType === "remove-background" ||
      taskType === "face-enhance"
    ) {
      return this.executeDirect(taskType, imageDataUrl, maskDataUrl, options);
    }

    const reqId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const request: ImageWorkerRequest = {
      id: reqId,
      taskType,
      imageDataUrl,
      maskDataUrl,
      options: {
        scaleFactor: options?.scaleFactor,
        quality: options?.quality,
        format: options?.format,
        edgeRefinement: options?.edgeRefinement,
        featherRadius: options?.featherRadius,
        enhanceFaceLevel: options?.enhanceFaceLevel,
        denoiseIntensity: options?.denoiseIntensity,
        contrastBoost: options?.contrastBoost,
        detailSharpen: options?.detailSharpen,
      },
      capability,
    };

    return new Promise<ImageAIResult>((resolve, reject) => {
      this.pendingRequests.set(reqId, {
        taskType,
        imageDataUrl,
        maskDataUrl,
        options,
        resolve,
        reject,
        onProgress: options?.onProgress,
      });

      try {
        this.worker!.postMessage(request);
      } catch (postErr) {
        // Fallback to direct execution on serialization error
        this.pendingRequests.delete(reqId);
        console.warn("[ImageWorkerManager] postMessage failed, falling back to direct:", postErr);
        this.executeDirect(taskType, imageDataUrl, maskDataUrl, options)
          .then(resolve)
          .catch(reject);
      }
    });
  }

  private async executeDirect(
    taskType: ImageAITaskType,
    imageDataUrl: string,
    maskDataUrl?: string,
    options?: ImageAIOptions
  ): Promise<ImageAIResult> {
    const engine = ImageInferenceEngine.getInstance();
    switch (taskType) {
      case "remove-background":
        return engine.removeBackground(imageDataUrl, options);
      case "upscale":
        return engine.enhanceImage(imageDataUrl, { ...options, scaleFactor: options?.scaleFactor || 2 });
      case "face-enhance":
        return engine.enhanceFace(imageDataUrl, options);
      case "enhance":
        return engine.enhanceImage(imageDataUrl, options);
      case "object-remove":
        return engine.removeObject(imageDataUrl, maskDataUrl || "", options);
      default:
        throw new Error(`[ImageWorkerManager] Unsupported task type: ${taskType}`);
    }
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}
