import { AndroidNativeAIProvider } from "./AndroidNativeAIProvider";
import { WebAIProvider } from "./WebAIProvider";
import {
  AICapabilities,
  ImageSegmentationOptions,
  ImageSegmentationResult,
  FaceDetectionResult,
  AudioTranscriptionOptions,
  AudioTranscriptionResult,
  AIModelSpec,
  AIModelStatus,
  AIBenchmarkResult,
  AIError,
} from "./types";
import { benchmarkRegistry } from "./benchmark";
import { imageUpscalerService, UpscaleOptions, UpscaleResult } from "./ImageUpscalerService";

export class AIService {
  private static instance: AIService | null = null;

  private nativeProvider: AndroidNativeAIProvider;
  private webProvider: WebAIProvider;
  private cachedCapabilities: AICapabilities | null = null;

  private modelCatalog: Map<string, AIModelSpec> = new Map();

  private constructor() {
    this.nativeProvider = new AndroidNativeAIProvider();
    this.webProvider = new WebAIProvider();
    this.registerOfficialModels();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private registerOfficialModels(): void {
    // TIER 1: Essential (Small, core functionality, bundled or 0-byte dynamic Play Services models)
    this.modelCatalog.set("mlkit-subject-segmenter", {
      id: "mlkit-subject-segmenter",
      name: "Google ML Kit Subject Segmentation",
      version: "16.0.0",
      tier: "TIER_1_ESSENTIAL",
      framework: "mlkit",
      sizeBytes: 0, // Dynamically loaded by Google Play Services (0MB APK size impact)
      quantized: true,
      quantizationType: "INT8",
      description: "Hardware-accelerated on-device neural subject segmentation",
    });

    this.modelCatalog.set("mlkit-face-detector", {
      id: "mlkit-face-detector",
      name: "Google ML Kit Face Detection",
      version: "17.1.0",
      tier: "TIER_1_ESSENTIAL",
      framework: "mlkit",
      sizeBytes: 0, // Dynamically loaded by Google Play Services (0MB APK size impact)
      quantized: true,
      quantizationType: "INT8",
      description: "Real-time on-device facial bounding box and orientation tracking",
    });

    this.modelCatalog.set("whisper-tiny-ggml", {
      id: "whisper-tiny-ggml",
      name: "Whisper Tiny (whisper.cpp GGML)",
      version: "1.0.0",
      tier: "TIER_1_ESSENTIAL",
      framework: "whisper.cpp",
      sizeBytes: 77700000, // ~75MB
      quantized: true,
      quantizationType: "FP16",
      checksum: "ggml-tiny-v1",
      localPath: "models/whisper-tiny.bin",
      description: "Fast offline speech-to-text inference with native whisper.cpp",
    });

    this.modelCatalog.set("mediapipe-selfie-segmenter", {
      id: "mediapipe-selfie-segmenter",
      name: "MediaPipe Selfie Segmenter",
      version: "0.10.35",
      tier: "TIER_1_ESSENTIAL",
      framework: "mediapipe",
      sizeBytes: 256000, // ~250KB
      quantized: true,
      quantizationType: "FP16",
      localPath: "/models/mediapipe/selfie_segmenter.tflite",
      description: "Ultra-compact web/mobile portrait segmenter",
    });

    this.modelCatalog.set("vieron-upscaler-2x", {
      id: "vieron-upscaler-2x",
      name: "Vieron Neural Image Upscaler (2x Super-Resolution)",
      version: "1.0.0",
      tier: "TIER_1_ESSENTIAL",
      framework: "onnx",
      sizeBytes: 154624,
      quantized: true,
      quantizationType: "FP32",
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      localPath: "/models/vieron-upscaler-2x.onnx",
      description: "Real on-device 2x super-resolution upscaler with high-frequency sub-pixel edge restoration",
    });

    // TIER 2: Optional (Large, downloaded on-demand and cached in app storage)
    this.modelCatalog.set("whisper-base-ggml", {
      id: "whisper-base-ggml",
      name: "Whisper Base (whisper.cpp GGML)",
      version: "1.0.0",
      tier: "TIER_2_OPTIONAL",
      framework: "whisper.cpp",
      sizeBytes: 147900000, // ~142MB
      quantized: true,
      quantizationType: "FP16",
      description: "High-accuracy offline speech-to-text inference",
    });

    this.modelCatalog.set("rmbg-2.0", {
      id: "rmbg-2.0",
      name: "Bria RMBG-2.0 Neural Background Removal",
      version: "2.0.0",
      tier: "TIER_2_OPTIONAL",
      framework: "onnx",
      sizeBytes: 176200000, // ~176MB
      quantized: true,
      quantizationType: "INT8",
      remoteUrls: [
        "https://huggingface.co/kn4666/bria-rmbg-2.0-web/resolve/main/onnx/model_quantized.onnx",
      ],
      description: "Full resolution alpha matting with edge refinement",
    });

    // TIER 3: Experimental / Remote Cloud
    this.modelCatalog.set("whisper-large-v3-remote", {
      id: "whisper-large-v3-remote",
      name: "Whisper Large v3 (Cloud Accelerated)",
      version: "3.0.0",
      tier: "TIER_3_EXPERIMENTAL",
      framework: "whisper.cpp",
      sizeBytes: 0,
      quantized: false,
      description: "Remote cloud speech recognition for complex multilingual media",
    });
  }

  public getModelCatalog(): AIModelSpec[] {
    return Array.from(this.modelCatalog.values());
  }

  public async getModelStatus(modelId: string): Promise<AIModelStatus> {
    const isNative = await this.nativeProvider.isAvailable();
    if (isNative) {
      return this.nativeProvider.getModelStatus(modelId);
    }
    return this.webProvider.getModelStatus(modelId);
  }

  public async getCapabilities(forceRefresh = false): Promise<AICapabilities> {
    if (this.cachedCapabilities && !forceRefresh) {
      return this.cachedCapabilities;
    }

    const isNative = await this.nativeProvider.isAvailable();
    if (isNative) {
      this.cachedCapabilities = await this.nativeProvider.getCapabilities();
    } else {
      this.cachedCapabilities = await this.webProvider.getCapabilities();
    }
    return this.cachedCapabilities;
  }

  public async removeBackground(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult> {
    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Operation was cancelled before execution");
    }

    const isNative = await this.nativeProvider.isAvailable();

    if (isNative) {
      try {
        return await this.nativeProvider.removeBackground(imageInput, options);
      } catch (nativeErr: any) {
        if (options?.signal?.aborted || nativeErr?.code === "AI_CANCELLED") {
          throw nativeErr;
        }
        console.warn("[AIService] Native segmentation failed, transparently falling back to Web:", nativeErr);
      }
    }

    return this.webProvider.removeBackground(imageInput, options);
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
    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Face detection cancelled before execution");
    }

    const isNative = await this.nativeProvider.isAvailable();

    if (isNative) {
      try {
        return await this.nativeProvider.detectFaces(imageInput, options);
      } catch (nativeErr: any) {
        if (options?.signal?.aborted || nativeErr?.code === "AI_CANCELLED") {
          throw nativeErr;
        }
        console.warn("[AIService] Native face detection failed/unavailable, falling back to Web:", nativeErr);
      }
    }

    return this.webProvider.detectFaces(imageInput, options);
  }

  public async transcribe(
    audioInput: string | Blob | File,
    options?: AudioTranscriptionOptions
  ): Promise<AudioTranscriptionResult> {
    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Transcription was cancelled before execution");
    }

    const isNative = await this.nativeProvider.isAvailable();

    if (isNative) {
      try {
        return await this.nativeProvider.transcribe(audioInput, options);
      } catch (nativeErr: any) {
        if (options?.signal?.aborted || nativeErr?.code === "AI_CANCELLED") {
          throw nativeErr;
        }
        console.warn("[AIService] Native STT failed, falling back to Web:", nativeErr);
      }
    }

    return this.webProvider.transcribe(audioInput, options);
  }

  public async upscaleImage(
    imageInput: string | Blob | File | HTMLImageElement | HTMLCanvasElement | ImageData,
    options?: UpscaleOptions
  ): Promise<UpscaleResult> {
    return imageUpscalerService.upscaleImage(imageInput, options);
  }

  public getBenchmarks(): AIBenchmarkResult[] {
    return benchmarkRegistry.getAll();
  }
}

export const aiService = AIService.getInstance();
