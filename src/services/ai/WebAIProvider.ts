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
  public readonly name = "Web AI Provider (MediaPipe Vision & WASM/WebGPU)";
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
    const webCaps = await this.capabilityDetector.detect();

    return {
      nativeAI: false,
      arm64: false,
      nnapi: false,
      gpuAcceleration: webCaps.hasWebGPU,
      xnnpack: false,
      availableMemoryMB: webCaps.deviceMemoryGB * 1024,
      performanceTier: webCaps.tier as any,
      backends: [
        "mediapipe_vision_wasm",
        webCaps.hasWebGPU ? "webgpu" : "wasm_simd",
        "web_audio_dsp",
      ],
      activeProvider: "web-worker",
    };
  }

  public async getModelStatus(modelId: string): Promise<AIModelStatus> {
    // MediaPipe models load on-demand or from cache
    if (modelId.includes("mediapipe") || modelId.includes("selfie")) {
      return "AVAILABLE";
    }
    return "AVAILABLE";
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
    // Handled via AbortSignal or worker termination
    return true;
  }
}
