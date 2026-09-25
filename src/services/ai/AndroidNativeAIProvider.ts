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
    platform?: "android" | "web";
    arm64: boolean;
    nnapi?: boolean;
    gpuAcceleration?: boolean;
    xnnpack?: boolean;
    availableMemoryMB: number;
    totalMemoryMB?: number;
    memory?: { availableMB: number; totalMB: number };
    runtimes?: {
      whisperCpp: boolean;
      mlkitSubjectSegmentation: boolean;
      mlkitFaceDetection: boolean;
      mediapipe: boolean;
      onnx: boolean;
    };
    accelerators?: {
      nnapiApiAvailable: boolean;
      gpuUsable: boolean;
      xnnpackUsable: boolean;
    };
    performanceTier: "low" | "medium" | "high" | "flagship" | "unknown";
    backends: string[];
  }>;
  getAIModelStatus(options: { modelId: string }): Promise<{
    status: string;
    available: boolean;
    framework?: string;
  }>;
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
      confidence?: number;
      trackingId?: number;
      headEulerAngleX?: number;
      headEulerAngleY?: number;
      headEulerAngleZ?: number;
      smilingProbability?: number;
      leftEyeOpenProbability?: number;
      rightEyeOpenProbability?: number;
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
  public readonly name = "Android Native AI Provider (Google ML Kit & whisper.cpp)";
  public readonly platform = "android" as const;

  private plugin: NativeVireonAIPlugin | null = null;

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
        platform: "android",
        arm64: true,
        memory: { availableMB: 2048, totalMB: 4096 },
        runtimes: {
          whisperCpp: true,
          mlkitSubjectSegmentation: true,
          mlkitFaceDetection: true,
          mediapipe: false,
          onnx: false,
        },
        accelerators: {
          nnapiApiAvailable: true,
          gpuUsable: false,
          xnnpackUsable: false,
        },
        availableMemoryMB: 2048,
        totalMemoryMB: 4096,
        nnapi: true,
        gpuAcceleration: false,
        xnnpack: false,
        performanceTier: "high",
        backends: ["mlkit_subject_segmentation", "mlkit_face_detection", "whisper_cpp"],
        activeProvider: "android-native",
      };
    }

    try {
      const caps = await plug.getAICapabilities();
      const availMB = caps.memory?.availableMB ?? caps.availableMemoryMB ?? 2048;
      const totalMB = caps.memory?.totalMB ?? caps.totalMemoryMB ?? 4096;
      const hasNnapi = caps.accelerators?.nnapiApiAvailable ?? caps.nnapi ?? false;

      return {
        nativeAI: true,
        platform: "android",
        arm64: caps.arm64 ?? true,
        memory: {
          availableMB: availMB,
          totalMB: totalMB,
        },
        runtimes: caps.runtimes || {
          whisperCpp: true,
          mlkitSubjectSegmentation: true,
          mlkitFaceDetection: true,
          mediapipe: false,
          onnx: false,
        },
        accelerators: caps.accelerators || {
          nnapiApiAvailable: hasNnapi,
          gpuUsable: false,
          xnnpackUsable: false,
        },
        performanceTier: caps.performanceTier || "medium",
        backends: caps.backends || ["mlkit_subject_segmentation", "mlkit_face_detection", "whisper_cpp"],
        activeProvider: "android-native",
        availableMemoryMB: availMB,
        totalMemoryMB: totalMB,
        nnapi: hasNnapi,
        gpuAcceleration: false,
        xnnpack: false,
      };
    } catch {
      return {
        nativeAI: true,
        platform: "android",
        arm64: true,
        memory: { availableMB: 2048, totalMB: 4096 },
        runtimes: {
          whisperCpp: true,
          mlkitSubjectSegmentation: true,
          mlkitFaceDetection: true,
          mediapipe: false,
          onnx: false,
        },
        accelerators: {
          nnapiApiAvailable: true,
          gpuUsable: false,
          xnnpackUsable: false,
        },
        availableMemoryMB: 2048,
        totalMemoryMB: 4096,
        nnapi: true,
        gpuAcceleration: false,
        xnnpack: false,
        performanceTier: "high",
        backends: ["mlkit_subject_segmentation", "mlkit_face_detection", "whisper_cpp"],
        activeProvider: "android-native",
      };
    }
  }

  public async getModelStatus(modelId: string): Promise<AIModelStatus> {
    const plug = this.getPlugin();
    if (plug) {
      try {
        const res = await plug.getAIModelStatus({ modelId });
        return (res.status as AIModelStatus) || (res.available ? "AVAILABLE" : "NOT_DOWNLOADED");
      } catch {
        if (modelId.includes("mlkit") || modelId.includes("segment")) return "AVAILABLE";
        return "NOT_DOWNLOADED";
      }
    }
    return modelId.includes("mlkit") ? "AVAILABLE" : "NOT_DOWNLOADED";
  }

  private async resolveNativeInputPath(
    input: string | Blob | File,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<{ filePath?: string; imageUri?: string; tempFileName?: string }> {
    if (typeof input === "string") {
      if (input.startsWith("file://") || input.startsWith("/")) {
        return { filePath: input };
      }
      if (input.startsWith("content://")) {
        return { imageUri: input };
      }
      if (input.startsWith("data:")) {
        onProgress?.(0.2, "Preparing input image for native processing...");
        const commaIdx = input.indexOf(",");
        const base64 = commaIdx >= 0 ? input.substring(commaIdx + 1) : input;
        const ext = input.includes("image/png") ? "png" : "jpg";
        const tempFileName = `vieron_ai_input_${Date.now()}.${ext}`;
        const writeResult = await Filesystem.writeFile({
          path: tempFileName,
          data: base64,
          directory: Directory.Cache,
        });
        return { filePath: writeResult.uri, tempFileName };
      }
    }

    // Native low-copy file handle check from MediaPicker
    if (typeof input === "object" && input !== null) {
      const nativePath = (input as any).nativePath;
      const nativeUri = (input as any).nativeUri;
      if (nativePath) return { filePath: nativePath };
      if (nativeUri) return { imageUri: nativeUri };
    }

    // Convert memory Blob to cache file via Filesystem only as fallback
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

    return { filePath: writeResult.uri, tempFileName };
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
      if (resolved.tempFileName) {
        Filesystem.deleteFile({ path: resolved.tempFileName, directory: Directory.Cache }).catch(() => {});
      }
      throw new AIError("AI_CANCELLED", "Operation cancelled after preparation");
    }

    options?.onProgress?.(0.4, "Executing on-device Google ML Kit segmentation...");

    const plug = this.getPlugin();
    const targetPlugin: any = plug || registerPlugin<any>("AIImageProcessor");

    try {
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

      const webviewUrl =
        typeof Capacitor.convertFileSrc === "function" && (resp.filePath || resp.outputUri)
          ? Capacitor.convertFileSrc(resp.filePath || resp.outputUri)
          : resp.outputUri || resp.filePath || "";

      return {
        success: true,
        outputUri: resp.outputUri,
        filePath: resp.filePath,
        outputDataUrl: webviewUrl,
        imageDataUrl: webviewUrl,
        width: resp.width,
        height: resp.height,
        processingTimeMs: resp.processingTime || Date.now() - startTime,
        engine: resp.engine || "Google ML Kit Subject Segmentation (Android Native)",
        accelerator: "NNAPI / Native CPU",
      };
    } catch (err: any) {
      if (err instanceof AIError) throw err;
      const message = err?.message || String(err);
      if (message.includes("AI_CANCELLED") || options?.signal?.aborted) {
        throw new AIError("AI_CANCELLED", "Operation cancelled by user", err);
      }
      if (message.includes("AI_OUT_OF_MEMORY")) {
        throw new AIError("AI_OUT_OF_MEMORY", "Device ran out of memory during segmentation", err);
      }
      throw new AIError("AI_INFERENCE_FAILED", `Native background removal failed: ${message}`, err);
    } finally {
      if (resolved.tempFileName) {
        Filesystem.deleteFile({ path: resolved.tempFileName, directory: Directory.Cache }).catch(() => {});
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
    const opId = `ai_face_${Date.now()}`;

    if (options?.signal?.aborted) {
      throw new AIError("AI_CANCELLED", "Face detection cancelled before execution");
    }

    const resolved = await this.resolveNativeInputPath(imageInput);

    const plug = this.getPlugin();
    if (plug && typeof plug.detectFaces === "function") {
      try {
        const resp = await plug.detectFaces({
          filePath: resolved.filePath,
          imageUri: resolved.imageUri,
          operationId: opId,
        });

        return {
          success: resp.success,
          facesCount: resp.facesCount || (resp.faces ? resp.faces.length : 0),
          faces: resp.faces || [],
          processingTimeMs: resp.processingTime || Date.now() - startTime,
          engine: resp.engine || "Google ML Kit Face Detection (Android Native)",
        };
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("AI_CANCELLED") || options?.signal?.aborted) {
          throw new AIError("AI_CANCELLED", "Face detection cancelled", err);
        }
        if (msg.includes("AI_RUNTIME_UNAVAILABLE")) {
          throw new AIError("AI_RUNTIME_UNAVAILABLE", "ML Kit Face Detection is unavailable", err);
        }
        throw new AIError("AI_INFERENCE_FAILED", `Native face detection error: ${msg}`, err);
      } finally {
        if (resolved.tempFileName) {
          Filesystem.deleteFile({ path: resolved.tempFileName, directory: Directory.Cache }).catch(() => {});
        }
      }
    }

    if (resolved.tempFileName) {
      Filesystem.deleteFile({ path: resolved.tempFileName, directory: Directory.Cache }).catch(() => {});
    }

    throw new AIError("AI_RUNTIME_UNAVAILABLE", "Native face detection API not available in current APK");
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
    const plug = this.getPlugin();
    if (plug) {
      try {
        const res = await plug.cancelAI({ operationId });
        return res.cancelled;
      } catch {
        return false;
      }
    }
    return false;
  }
}
