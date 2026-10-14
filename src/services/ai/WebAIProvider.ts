import { IAIProvider } from "./AIProvider";
import {
  AICapabilities,
  ImageSegmentationOptions,
  ImageSegmentationResult,
  FaceDetectionResult,
  AudioTranscriptionOptions,
  AudioTranscriptionResult,
  AIModelStatus,
  AIError,
} from "./types";
import { ImageInferenceEngine } from "@/ai/image/ImageInferenceEngine";
import { ImageCapabilityDetector } from "@/ai/image/ImageCapabilityDetector";
import { ImageWorkerManager } from "@/ai/image/ImageWorkerManager";
import { WebCaptionProvider } from "@/services/caption/WebCaptionProvider";

export class WebAIProvider implements IAIProvider {
  public readonly id = "web-ai-provider";
  public readonly name = "Web AI Provider (Google MediaPipe Vision & Transformers.js)";
  public readonly platform = "web" as const;

  private imageEngine: ImageInferenceEngine;
  private workerManager: ImageWorkerManager;
  private capabilityDetector: ImageCapabilityDetector;
  private captionProvider: WebCaptionProvider;
  private activeOperations: Map<string, AbortController> = new Map();

  constructor() {
    this.imageEngine = ImageInferenceEngine.getInstance();
    this.workerManager = ImageWorkerManager.getInstance();
    this.capabilityDetector = ImageCapabilityDetector.getInstance();
    this.captionProvider = new WebCaptionProvider();
  }

  public async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined";
  }

  public async getCapabilities(): Promise<AICapabilities> {
    let hasWebGPU = false;
    let memoryGB = 4;
    let tier = "medium";

    try {
      const webCaps = await this.capabilityDetector.detect();
      hasWebGPU = webCaps.hasWebGPU;
      memoryGB = webCaps.estimatedRamMB / 1024;
      tier = webCaps.deviceTier;
    } catch {
      // Safe fallback if WebGL/Canvas context is mock or in headless environment
    }

    const availMB = memoryGB * 1024;

    return {
      nativeAI: false,
      platform: "web",
      arm64: false,
      memory: {
        availableMB: availMB,
        totalMB: availMB * 2,
      },
      runtimes: {
        whisperCpp: false,
        mlkitSubjectSegmentation: false,
        mlkitFaceDetection: false,
        mediapipe: true,
        onnx: true,
      },
      accelerators: {
        nnapiApiAvailable: false,
        gpuUsable: hasWebGPU,
        xnnpackUsable: false,
      },
      availableMemoryMB: availMB,
      totalMemoryMB: availMB * 2,
      nnapi: false,
      gpuAcceleration: hasWebGPU,
      xnnpack: false,
      performanceTier: tier as any,
      backends: [
        "mediapipe_vision_wasm",
        hasWebGPU ? "webgpu" : "wasm_simd",
        "web_audio_dsp",
      ],
      activeProvider: "web-worker",
    };
  }

  public async getModelStatus(modelId: string): Promise<AIModelStatus> {
    if (modelId.includes("mediapipe") || modelId.includes("selfie") || modelId.includes("face")) {
      return "AVAILABLE";
    }
    if (modelId === "rmbg-2.0") {
      // RMBG-2.0 is a 176MB ONNX model that is not bundled by default on Web; requires download
      return "NOT_DOWNLOADED";
    }
    if (modelId.includes("whisper-tiny")) {
      return "AVAILABLE";
    }
    if (modelId.includes("whisper")) {
      return "NOT_DOWNLOADED";
    }
    return "NOT_SUPPORTED";
  }

  public async removeBackground(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult> {
    const startTime = Date.now();
    const opId = options?.operationId || `web_rembg_${Date.now()}`;

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Background removal cancelled before execution");
    }

    const abortController = new AbortController();
    this.activeOperations.set(opId, abortController);

    // Link external signal to internal controller
    const onExternalAbort = () => {
      abortController.abort();
    };
    if (options?.signal) {
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let inputDataUrl = "";
    if (typeof imageInput === "string") {
      inputDataUrl = imageInput;
    } else if (imageInput instanceof Blob) {
      inputDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageInput);
      });
    }

    try {
      if (abortController.signal.aborted || options?.signal?.aborted) {
        throw new AIError("AI_CANCELLED", "Operation was aborted");
      }

      const abortPromise = new Promise<never>((_, reject) => {
        const triggerAbort = () => {
          reject(new AIError("AI_CANCELLED", "Background removal operation was aborted"));
        };
        if (abortController.signal.aborted || options?.signal?.aborted) {
          triggerAbort();
        } else {
          abortController.signal.addEventListener("abort", triggerAbort, { once: true });
          options?.signal?.addEventListener("abort", triggerAbort, { once: true });
        }
      });

      const execPromise = this.workerManager.execute(
        "remove-background",
        inputDataUrl,
        undefined,
        {
          edgeRefinement: options?.refineEdges,
          featherRadius: options?.edgeFeather,
          signal: abortController.signal,
          onProgress: (p) => {
            options?.onProgress?.(p.progress, p.message || p.stage);
          },
        }
      );

      const res = await Promise.race([execPromise, abortPromise]);

      if (abortController.signal.aborted) {
        throw new AIError("AI_CANCELLED", "Operation was aborted");
      }

      return {
        success: res.success,
        outputDataUrl: res.outputDataUrl,
        width: res.width,
        height: res.height,
        processingTimeMs: res.executionTimeMs || Date.now() - startTime,
        engine: "Google MediaPipe Vision (WASM / SIMD)",
        accelerator: "WASM SIMD",
      };
    } catch (err: any) {
      if (abortController.signal.aborted || options?.signal?.aborted) {
        throw new AIError("AI_CANCELLED", "Background removal operation was aborted");
      }
      throw new AIError("AI_INFERENCE_FAILED", `Web background removal error: ${err.message}`, err);
    } finally {
      this.activeOperations.delete(opId);
      if (options?.signal) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  public async segmentImage(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult> {
    return this.removeBackground(imageInput, options);
  }

  public async detectFaces(
    imageInput: string | Blob | File,
    options?: { signal?: AbortSignal }
  ): Promise<FaceDetectionResult> {
    const startTime = Date.now();

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Face detection cancelled before execution");
    }

    try {
      const res = await this.imageEngine.detectFaces(imageInput);
      return {
        success: true,
        facesCount: res.facesFound,
        faces: res.boxes.map((b) => ({
          box: {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
          },
          confidence: b.confidence,
          landmarks: b.landmarks,
        })),
        processingTimeMs: Date.now() - startTime,
        engine: "Google MediaPipe BlazeFace (WASM)",
      };
    } catch (err: any) {
      if (options?.signal?.aborted) {
        throw new AIError("AI_CANCELLED", "Face detection operation was aborted");
      }
      throw new AIError("AI_INFERENCE_FAILED", `Web face detection error: ${err.message}`, err);
    }
  }

  public async transcribe(
    audioInput: string | Blob | File,
    options?: AudioTranscriptionOptions
  ): Promise<AudioTranscriptionResult> {
    const startTime = Date.now();

    try {
      const segments = await this.captionProvider.transcribe(audioInput, {
        language: options?.language,
        onProgress: options?.onProgress
          ? (p) => options.onProgress!(p.progress)
          : undefined,
      });

      return {
        success: true,
        text: segments.map((s) => s.text).join(" ").trim(),
        segments: segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          confidence: s.confidence,
        })),
        duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
        processingTimeMs: Date.now() - startTime,
        engine: "Transformers.js / ONNX Web (WASM)",
      };
    } catch (err: any) {
      throw new AIError("AI_INFERENCE_FAILED", `Web STT error: ${err.message}`, err);
    }
  }

  public async cancel(operationId: string): Promise<boolean> {
    const controller = this.activeOperations.get(operationId);
    if (controller) {
      controller.abort();
      this.activeOperations.delete(operationId);
      return true;
    }
    // If no matching ID, check if only one active operation exists and abort it
    if (this.activeOperations.size === 1) {
      const single = this.activeOperations.values().next().value;
      single?.abort();
      this.activeOperations.clear();
      return true;
    }
    return false;
  }
}
