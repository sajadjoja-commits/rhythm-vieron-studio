/**
 * Phase 10: ML Kit Runtime Adapter
 * 
 * Provides runtime execution for Google ML Kit Subject Segmentation
 * and Face Detection:
 * - Direct native zero-copy execution via VireonAIPlugin on Android
 * - Transparent MediaPipe vision fallback on Web
 */

import { Capacitor } from "@capacitor/core";
import { AIModelRuntime, ModelMemoryUsage, ModelCapabilities } from "../AIModelRuntime";
import { getVireonAIPlugin } from "../../AndroidNativeAIProvider";
import { ImageInferenceEngine } from "@/ai/image/ImageInferenceEngine";

export interface MLKitInferenceInput {
  task: "segmentation" | "face_detection";
  imageInput: string | Blob | File;
  filePath?: string;
  imageUri?: string;
  refineEdges?: boolean;
}

export interface MLKitInferenceOutput {
  success: boolean;
  engine: string;
  processingTimeMs: number;
  data: any;
}

export class MLKitAdapter implements AIModelRuntime<MLKitInferenceInput, MLKitInferenceOutput> {
  public readonly id: string;
  public readonly name: string;

  private loaded = false;
  private isCancelled = false;

  constructor(id = "mlkit-adapter", name = "Google ML Kit Vision Adapter") {
    this.id = id;
    this.name = name;
  }

  public async load(): Promise<void> {
    // Dynamic Play Services or Web runtime preparation
    this.loaded = true;
  }

  public async unload(): Promise<void> {
    this.loaded = false;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public async infer(input: MLKitInferenceInput): Promise<MLKitInferenceOutput> {
    if (this.isCancelled) {
      this.isCancelled = false;
      throw new Error(`[MLKitAdapter] Execution cancelled for ${this.id}`);
    }

    const start = Date.now();

    // 1. Android Native execution via VireonAIPlugin
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const plugin = getVireonAIPlugin();
      if (plugin) {
        if (input.task === "segmentation") {
          const res = await plugin.removeBackground({
            filePath: input.filePath,
            imageUri: input.imageUri,
            refineEdges: input.refineEdges ?? true,
          });
          return {
            success: res.success,
            engine: res.engine || "Google ML Kit Subject Segmentation (Android Native)",
            processingTimeMs: res.processingTime || (Date.now() - start),
            data: res,
          };
        } else if (input.task === "face_detection") {
          const res = await plugin.detectFaces({
            filePath: input.filePath,
            imageUri: input.imageUri,
          });
          return {
            success: res.success,
            engine: res.engine || "Google ML Kit Face Detection (Android Native)",
            processingTimeMs: res.processingTime || (Date.now() - start),
            data: res,
          };
        }
      }
    }

    // 2. Web MediaPipe vision fallback
    const webEngine = ImageInferenceEngine.getInstance();
    if (input.task === "segmentation") {
      const res = await webEngine.removeBackground(input.imageInput);
      return {
        success: res.success,
        engine: res.engineName || "Google MediaPipe Vision Web Segmenter",
        processingTimeMs: res.executionTimeMs || (Date.now() - start),
        data: res,
      };
    } else {
      const res = await webEngine.detectFaces(input.imageInput);
      return {
        success: res.success,
        engine: res.engineName || "Google MediaPipe BlazeFace Web Detector",
        processingTimeMs: res.executionTimeMs || (Date.now() - start),
        data: res,
      };
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const plugin = getVireonAIPlugin();
      plugin?.cancelAI({ operationId: "all" }).catch(() => {});
    }
  }

  public getMemoryUsage(): ModelMemoryUsage {
    return {
      heapMB: Capacitor.isNativePlatform() ? 4 : 25,
      residentMB: Capacitor.isNativePlatform() ? 12 : 35,
    };
  }

  public getCapabilities(): ModelCapabilities {
    const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
    return {
      framework: isNative ? "Google ML Kit (Dynamic Modules)" : "Google MediaPipe Vision",
      accelerator: isNative ? "NNAPI / GPU" : "WASM / WebGL",
      precision: "INT8 / FP16",
      supportedInputTypes: ["filePath", "imageUri", "Blob", "File"],
    };
  }
}
