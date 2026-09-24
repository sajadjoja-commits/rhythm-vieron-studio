import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
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
import { blobToBase64Optimized } from "../NativeService";

interface NativeVireonAIPlugin {
  getAICapabilities(): Promise<{
    nativeAI: boolean;
    arm64: boolean;
    nnapi: boolean;
    gpuAcceleration: boolean;
    xnnpack: boolean;
    availableMemoryMB: number;
    totalMemoryMB?: number;
    performanceTier: "low" | "medium" | "high" | "flagship";
    backends: string[];
  }>;
  getAIModelStatus(options: { modelId: string }): Promise<{ status: string; available: boolean }>;
  removeBackground(options: {
    filePath?: string;
    imageUri?: string;
    imageBase64?: string;
    refineEdges?: boolean;
    edgeFeather?: number;
    operationId?: string;
  }): Promise<{
    success: boolean;
    outputUri: string;
    filePath: string;
    width: number;
    height: number;
    processingTime: number;
    engine: string;
    error?: { code: string; message: string };
  }>;
  detectFaces(options: {
    filePath?: string;
    imageUri?: string;
    operationId?: string;
  }): Promise<{
    success: boolean;
    facesCount: number;
    faces: Array<{
      box: { x: number; y: number; width: number; height: number };
      confidence: number;
      landmarks?: Array<{ x: number; y: number }>;
    }>;
    processingTime: number;
    engine: string;
  }>;
  cancelAI(options: { operationId: string }): Promise<{ cancelled: boolean }>;
}

export function getVireonAIPlugin(): NativeVireonAIPlugin | null {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    try {
      return registerPlugin<NativeVireonAIPlugin>("VireonAI");
    } catch {
      return null;
    }
  }
  return null;
}

export class AndroidNativeAIProvider implements IAIProvider {
  public readonly id = "android-native-ai";
  public readonly name = "Android Native AI Provider (ML Kit & whisper.cpp)";
  public readonly platform = "android" as const;

  private plugin: NativeVireonAIPlugin | null;

  constructor() {
    this.plugin = getVireonAIPlugin();
  }

  private getPlugin(): NativeVireonAIPlugin | null {
    if (!this.plugin) {
      this.plugin = getVireonAIPlugin();
    }
    return this.plugin;
  }

  public async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return false;
    }
    return (
      Capacitor.isPluginAvailable("VireonAI") ||
      Capacitor.isPluginAvailable("AIImageProcessor")
    );
  }

  public async getCapabilities(): Promise<AICapabilities> {
    const plug = this.getPlugin();
    if (!plug) {
      return {
        nativeAI: true,
        arm64: true,
        nnapi: true,
        gpuAcceleration: false,
        xnnpack: true,
        availableMemoryMB: 2048,
        performanceTier: "medium",
        backends: ["mlkit_subject_segmentation", "whisper_cpp"],
        activeProvider: "android-native",
      };
    }

    try {
      const caps = await plug.getAICapabilities();
      return {
        ...caps,
        activeProvider: "android-native",
      };
    } catch (e) {
      return {
        nativeAI: true,
        arm64: true,
        nnapi: true,
        gpuAcceleration: false,
        xnnpack: true,
        availableMemoryMB: 2048,
        performanceTier: "high",
        backends: ["mlkit_subject_segmentation", "whisper_cpp"],
        activeProvider: "android-native",
      };
    }
  }

  public async getModelStatus(modelId: string): Promise<AIModelStatus> {
    if (this.plugin) {
      try {
        const res = await this.plugin.getAIModelStatus({ modelId });
        return (res.status as AIModelStatus) || (res.available ? "AVAILABLE" : "NOT_DOWNLOADED");
      } catch {
        // Fallback for models known to be dynamically on-device
        if (modelId.includes("mlkit")) return "AVAILABLE";
        return "NOT_DOWNLOADED";
      }
    }
    return modelId.includes("mlkit") ? "AVAILABLE" : "NOT_DOWNLOADED";
  }

  private async resolveNativeInputPath(
    input: string | Blob | File,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<{ filePath?: string; imageUri?: string }> {
    if (typeof input === "string") {
      if (input.startsWith("file://") || input.startsWith("/")) {
        return { filePath: input };
      }
      if (input.startsWith("content://")) {
        return { imageUri: input };
      }
    }

    // Zero-RAM file handle check from MediaPicker
    if (typeof input === "object" && input !== null) {
      const nativePath = (input as any).nativePath;
      const nativeUri = (input as any).nativeUri;
      if (nativePath) return { filePath: nativePath };
      if (nativeUri) return { imageUri: nativeUri };
    }

    // Convert memory Blob to cache file via Filesystem
    onProgress?.(0.2, "Writing input to Android cache storage...");
    let blob: Blob;
    if (input instanceof Blob) {
      blob = input;
    } else if (typeof input === "string" && input.startsWith("blob:")) {
      const resp = await fetch(input);
      blob = await resp.blob();
    } else {
      throw new AIError("AI_UNSUPPORTED_OPERATION", "Cannot resolve native input path for media");
    }

    const tempFileName = `vieron_ai_input_${Date.now()}.png`;
    const base64 = await blobToBase64Optimized(blob);
    const writeResult = await Filesystem.writeFile({
      path: tempFileName,
      data: base64,
      directory: Directory.Cache,
    });

    return { filePath: writeResult.uri };
  }

  public async removeBackground(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult> {
    const startTime = Date.now();
    const opId = `ai_rembg_${Date.now()}`;

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Operation was cancelled before execution");
    }

    options?.onProgress?.(0.1, "Preparing image for Android Native AI...");

    const resolved = await this.resolveNativeInputPath(imageInput, options?.onProgress);

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Operation cancelled after preparation");
    }

    options?.onProgress?.(0.4, "Executing on-device Google ML Kit segmentation...");

    // Try primary VireonAI plugin or fallback to AIImageProcessor
    try {
      const targetPlugin: any = this.plugin || registerPlugin<any>("AIImageProcessor");
      const resp = await targetPlugin.removeBackground({
        filePath: resolved.filePath,
        imageUri: resolved.imageUri,
        refineEdges: options?.refineEdges ?? true,
        edgeFeather: options?.edgeFeather ?? 2,
        operationId: opId,
      });

      if (!resp || !resp.success) {
        throw new AIError(
          (resp?.error?.code as any) || "AI_INFERENCE_FAILED",
          resp?.error?.message || "Native subject segmentation failed"
        );
      }

      options?.onProgress?.(1.0, "Completed on-device segmentation");

      return {
        success: true,
        outputUri: resp.outputUri,
        filePath: resp.filePath,
        width: resp.width,
        height: resp.height,
        processingTimeMs: resp.processingTime || Date.now() - startTime,
        engine: resp.engine || "Google ML Kit (Android Native)",
        accelerator: "NNAPI / GPU",
      };
    } catch (err: any) {
      if (err instanceof AIError) throw err;
      throw new AIError("AI_INFERENCE_FAILED", `Native background removal failed: ${err?.message || err}`, err);
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
    const opId = `ai_face_${Date.now()}`;

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Face detection cancelled before execution");
    }

    const resolved = await this.resolveNativeInputPath(imageInput);

    if (this.plugin && typeof this.plugin.detectFaces === "function") {
      try {
        const resp = await this.plugin.detectFaces({
          filePath: resolved.filePath,
          imageUri: resolved.imageUri,
          operationId: opId,
        });

        return {
          success: resp.success,
          facesCount: resp.facesCount || (resp.faces ? resp.faces.length : 0),
          faces: resp.faces || [],
          processingTimeMs: resp.processingTime || Date.now() - startTime,
          engine: resp.engine || "Google ML Kit Face Detection",
        };
      } catch (err: any) {
        throw new AIError("AI_INFERENCE_FAILED", `Native face detection error: ${err.message}`, err);
      }
    }

    throw new AIError("AI_UNSUPPORTED_OPERATION", "Native face detection API not available in current APK");
  }

  public async transcribe(
    audioInput: string | Blob | File,
    options?: AudioTranscriptionOptions
  ): Promise<AudioTranscriptionResult> {
    const startTime = Date.now();
    let audioPath = "";

    if (typeof audioInput === "string") {
      audioPath = audioInput;
    } else if (typeof audioInput === "object" && (audioInput as any).nativePath) {
      audioPath = (audioInput as any).nativePath;
    } else {
      const resolved = await this.resolveNativeInputPath(audioInput);
      audioPath = resolved.filePath || resolved.imageUri || "";
    }

    try {
      const VireonSTT = registerPlugin<any>("VireonSTT");
      const resp = await VireonSTT.transcribe({
        audioPath,
        language: options?.language,
        modelId: options?.modelId,
      });

      if (!resp || !resp.success) {
        throw new AIError("AI_INFERENCE_FAILED", "Native whisper inference failed");
      }

      const fullText = (resp.segments || []).map((s: any) => s.text).join(" ").trim();
      return {
        success: true,
        text: fullText,
        segments: resp.segments || [],
        duration: resp.duration || 0,
        processingTimeMs: Date.now() - startTime,
        engine: "whisper.cpp (Native C++)",
      };
    } catch (err: any) {
      if (err instanceof AIError) throw err;
      throw new AIError("AI_INFERENCE_FAILED", `Native STT failed: ${err.message || err}`, err);
    }
  }

  public async cancel(operationId: string): Promise<boolean> {
    if (this.plugin) {
      try {
        const res = await this.plugin.cancelAI({ operationId });
        return res.cancelled;
      } catch {
        return false;
      }
    }
    return false;
  }
}
