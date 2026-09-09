/**
 * ImageAIEngine
 * The Central Coordinator for All Local Image AI Tools.
 * Unified architecture: Capability Detection, Model Management, Preprocessing,
 * Neural Inference, Postprocessing, Memory Safety, and Output Verification.
 */

import {
  ImageAITaskType,
  ImageAIOptions,
  ImageAIResult,
  ImageCapabilityProfile,
  FaceDetectionResult,
} from "./types";
import { ImageCapabilityDetector } from "./ImageCapabilityDetector";
import { ImageModelManager, OFFICIAL_MODEL_MANIFESTS } from "./ImageModelManager";
import { ImageInferenceEngine } from "./ImageInferenceEngine";
import { ImageWorkerManager } from "./ImageWorkerManager";
import { ImageMemoryManager } from "./ImageMemoryManager";
import { isAndroidNativeAI, removeBackgroundAndroidNative } from "@/services/AIImageProcessorNative";

export class ImageAIEngine {
  private static instance: ImageAIEngine;
  private capabilityDetector: ImageCapabilityDetector;
  private modelManager: ImageModelManager;
  private inferenceEngine: ImageInferenceEngine;
  private workerManager: ImageWorkerManager;
  private memoryManager: ImageMemoryManager;

  private constructor() {
    this.capabilityDetector = ImageCapabilityDetector.getInstance();
    this.modelManager = ImageModelManager.getInstance();
    this.inferenceEngine = ImageInferenceEngine.getInstance();
    this.workerManager = ImageWorkerManager.getInstance();
    this.memoryManager = ImageMemoryManager.getInstance();
  }

  public static getInstance(): ImageAIEngine {
    if (!ImageAIEngine.instance) {
      ImageAIEngine.instance = new ImageAIEngine();
    }
    return ImageAIEngine.instance;
  }

  /**
   * Get device hardware capability profile (RAM, WebGPU, WASM SIMD, Threads, Tier)
   */
  public async getCapabilities(forceRefresh = false): Promise<ImageCapabilityProfile> {
    return this.capabilityDetector.detect(forceRefresh);
  }

  /**
   * 1. AI Background Removal
   * - On Android: Google ML Kit Subject Segmentation (High-Performance On-Device Native AI)
   * - On Web: Google MediaPipe Vision Task Segmenter + Edge Matting
   */
  public async removeBackground(
    imageInput: string | Blob | File,
    options?: ImageAIOptions
  ): Promise<ImageAIResult> {
    // 1. Android Native Execution Route (Zero WASM/WebGPU, True Google ML Kit Subject Segmentation)
    if (isAndroidNativeAI()) {
      return await removeBackgroundAndroidNative(imageInput, options);
    }

    // 2. Web Runtime Execution Route
    let inputUrl = "";
    let isTempUrl = false;

    if (typeof imageInput === "string") {
      inputUrl = imageInput;
    } else {
      inputUrl = this.memoryManager.createTrackedUrl(imageInput);
      isTempUrl = true;
    }

    try {
      return await this.workerManager.execute(
        "remove-background",
        inputUrl,
        undefined,
        options
      );
    } finally {
      if (isTempUrl) {
        this.memoryManager.revokeUrl(inputUrl);
      }
    }
  }

  /**
   * 2. AI Face Restoration & Enhancement (Google MediaPipe BlazeFace + High-Frequency Restore)
   */
  public async enhanceFace(
    imageInput: string | Blob | File,
    options?: ImageAIOptions
  ): Promise<ImageAIResult> {
    let inputUrl = "";
    let isTempUrl = false;

    if (typeof imageInput === "string") {
      inputUrl = imageInput;
    } else {
      inputUrl = this.memoryManager.createTrackedUrl(imageInput);
      isTempUrl = true;
    }

    try {
      return await this.workerManager.execute(
        "face-enhance",
        inputUrl,
        undefined,
        options
      );
    } finally {
      if (isTempUrl) {
        this.memoryManager.revokeUrl(inputUrl);
      }
    }
  }

  /**
   * 4. AI Image Denoise, Dynamic Range & Detail Enhancement
   */
  public async enhanceImage(
    imageInput: string | Blob | File,
    options?: ImageAIOptions
  ): Promise<ImageAIResult> {
    let inputUrl = "";
    let isTempUrl = false;

    if (typeof imageInput === "string") {
      inputUrl = imageInput;
    } else {
      inputUrl = this.memoryManager.createTrackedUrl(imageInput);
      isTempUrl = true;
    }

    try {
      return await this.workerManager.execute(
        "enhance",
        inputUrl,
        undefined,
        options
      );
    } finally {
      if (isTempUrl) {
        this.memoryManager.revokeUrl(inputUrl);
      }
    }
  }

  /**
   * 5. AI Object Removal (Inpainting on user brush mask)
   */
  public async removeObject(
    imageInput: string | Blob | File,
    maskInput: string | Blob | File,
    options?: ImageAIOptions
  ): Promise<ImageAIResult> {
    let inputUrl = "";
    let maskUrl = "";
    let isTempInput = false;
    let isTempMask = false;

    if (typeof imageInput === "string") {
      inputUrl = imageInput;
    } else {
      inputUrl = this.memoryManager.createTrackedUrl(imageInput);
      isTempInput = true;
    }

    if (typeof maskInput === "string") {
      maskUrl = maskInput;
    } else {
      maskUrl = this.memoryManager.createTrackedUrl(maskInput);
      isTempMask = true;
    }

    try {
      return await this.workerManager.execute(
        "object-remove",
        inputUrl,
        maskUrl,
        options
      );
    } finally {
      if (isTempInput) this.memoryManager.revokeUrl(inputUrl);
      if (isTempMask) this.memoryManager.revokeUrl(maskUrl);
    }
  }

  /**
   * Detect faces in image
   */
  public async detectFaces(imageInput: string | Blob | File): Promise<FaceDetectionResult> {
    return this.inferenceEngine.detectFaces(imageInput);
  }

  /**
   * Preload AI model weights for a specific task
   */
  public async preloadModel(
    taskType: ImageAITaskType,
    onProgress?: (prog: any) => void
  ): Promise<void> {
    switch (taskType) {
      case "remove-background":
        await this.modelManager.getModelBinary(
          OFFICIAL_MODEL_MANIFESTS["mediapipe-selfie-segmenter"],
          onProgress
        );
        break;
      case "face-enhance":
        await this.modelManager.getModelBinary(
          OFFICIAL_MODEL_MANIFESTS["mediapipe-face-detector"],
          onProgress
        );
        break;
    }
  }

  /**
   * Clear persistent local model cache and free memory
   */
  public async clearCache(): Promise<void> {
    await this.modelManager.clearAll();
    this.memoryManager.purgeAll();
  }

  /**
   * Dispose engine and terminate active background workers
   */
  public dispose(): void {
    this.workerManager.terminate();
    this.memoryManager.purgeAll();
  }
}

export const imageAIEngine = ImageAIEngine.getInstance();
