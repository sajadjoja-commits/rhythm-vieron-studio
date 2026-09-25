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
import { WebCaptionProvider } from "@/services/caption/WebCaptionProvider";

export class WebAIProvider implements IAIProvider {
  public readonly id = "web-ai-provider";
  public readonly name = "Web AI Provider (Google MediaPipe Vision & Transformers.js)";
  public readonly platform = "web" as const;

  private imageEngine: ImageInferenceEngine;
  private capabilityDetector: ImageCapabilityDetector;
  private captionProvider: WebCaptionProvider;

  constructor() {
    this.imageEngine = ImageInferenceEngine.getInstance();
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
      memoryGB = webCaps.deviceMemoryGB;
      tier = webCaps.tier;
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
      return "AVAILABLE";
    }
    if (modelId.includes("whisper")) {
      return "AVAILABLE";
    }
    return "NOT_SUPPORTED";
  }

  public async removeBackground(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult> {
    const startTime = Date.now();

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Background removal cancelled before execution");
    }

    try {
      const res = await this.imageEngine.removeBackground(imageInput, {
        edgeRefinement: options?.refineEdges,
        featherRadius: options?.edgeFeather,
        onProgress: (p) => {
          options?.onProgress?.(p.progress, p.message || p.stage);
        },
      });

      return {
        success: res.success,
        outputDataUrl: res.imageDataUrl,
        imageDataUrl: res.imageDataUrl,
        maskDataUrl: res.maskDataUrl,
        width: res.width,
        height: res.height,
        processingTimeMs: res.processingTime || Date.now() - startTime,
        engine: "Google MediaPipe Vision (WASM / SIMD)",
        accelerator: "WASM SIMD",
      };
    } catch (err: any) {
      if (options?.signal?.aborted) {
        throw new AIError("AI_CANCELLED", "Background removal operation was aborted");
      }
      throw new AIError("AI_INFERENCE_FAILED", `Web background removal error: ${err.message}`, err);
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
        success: res.success,
        facesCount: res.facesCount,
        faces: res.faces.map((f) => ({
          box: {
            x: f.boundingBox.x,
            y: f.boundingBox.y,
            width: f.boundingBox.width,
            height: f.boundingBox.height,
          },
          confidence: f.confidence,
          landmarks: f.landmarks,
        })),
        processingTimeMs: res.processingTime || Date.now() - startTime,
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
      const res = await this.captionProvider.transcribe({
        audio: audioInput,
        language: options?.language,
        onProgress: options?.onProgress,
      });

      return {
        success: true,
        text: res.text,
        segments: res.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          confidence: s.confidence,
        })),
        duration: res.duration,
        processingTimeMs: Date.now() - startTime,
        engine: "Transformers.js / ONNX Web (WASM)",
      };
    } catch (err: any) {
      throw new AIError("AI_INFERENCE_FAILED", `Web STT error: ${err.message}`, err);
    }
  }

  public async cancel(_operationId: string): Promise<boolean> {
    return true;
  }
}
