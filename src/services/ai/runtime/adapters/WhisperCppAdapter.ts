/**
 * Phase 10: Whisper.cpp Runtime Adapter
 * 
 * Provides real speech-to-text inference:
 * - Native whisper.cpp via NativeWhisperModelManager on Android
 * - Web/WASM Transformers.js / WebCaptionProvider on Web
 */

import { Capacitor } from "@capacitor/core";
import { AIModelRuntime, ModelMemoryUsage, ModelCapabilities } from "../AIModelRuntime";
import { NativeWhisperModelManager } from "@/services/caption/WhisperModelManager";
import { WebCaptionProvider } from "@/services/caption/WebCaptionProvider";
import { getVireonSTTPlugin } from "@/services/caption/AndroidCaptionProvider";

export interface WhisperInferenceInput {
  audioInput: string | Blob | File;
  modelId?: string;
  language?: string;
  signal?: AbortSignal;
}

export interface WhisperInferenceOutput {
  text: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  language: string;
  executionTimeMs: number;
  engine: string;
}

export class WhisperCppAdapter implements AIModelRuntime<WhisperInferenceInput, WhisperInferenceOutput> {
  public readonly id: string;
  public readonly name: string;

  private loaded = false;
  private isCancelled = false;
  private webCaptionProvider = new WebCaptionProvider();

  constructor(id = "whisper-cpp-adapter", name = "Whisper Speech-to-Text Adapter") {
    this.id = id;
    this.name = name;
  }

  public async load(modelPath?: string): Promise<void> {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const whisperMgr = NativeWhisperModelManager.getInstance();
      const info = await whisperMgr.getModelInfo("whisper-tiny");
      if (info && info.storagePath) {
        this.loaded = true;
        return;
      }
    }
    this.loaded = true;
  }

  public async unload(): Promise<void> {
    this.loaded = false;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public async infer(input: WhisperInferenceInput): Promise<WhisperInferenceOutput> {
    if (this.isCancelled || input.signal?.aborted) {
      this.isCancelled = false;
      throw new Error(`[WhisperCppAdapter] Speech recognition cancelled`);
    }

    const start = Date.now();

    // 1. Android Native STT via real JNI whisper.cpp plugin
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      try {
        const plugin = getVireonSTTPlugin();
        const avail = await plugin.isAvailable({ modelId: input.modelId });
        if (avail?.available && typeof input.audioInput === "string") {
          const res = await plugin.transcribe({
            audioPath: input.audioInput,
            language: input.language || "auto",
            modelId: input.modelId || "whisper-tiny",
          });
          if (res?.success && Array.isArray(res.segments)) {
            const fullText = res.segments.map((s) => s.text).join(" ").trim();
            return {
              text: fullText,
              segments: res.segments,
              language: input.language || "auto",
              executionTimeMs: Date.now() - start,
              engine: "whisper.cpp (Android ARM64 Native JNI)",
            };
          }
        }
      } catch (nativeErr) {
        console.warn("[WhisperCppAdapter] Native STT fallback:", nativeErr);
      }
    }

    // 2. Web STT via WebCaptionProvider
    const webResult = await this.webCaptionProvider.transcribe(input.audioInput as any, {
      language: input.language,
      signal: input.signal,
    });

    return {
      text: webResult.text,
      segments: webResult.segments,
      language: webResult.language || "en",
      executionTimeMs: webResult.executionTimeMs || (Date.now() - start),
      engine: webResult.engine || "Transformers.js / Whisper Web WASM",
    };
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  public getMemoryUsage(): ModelMemoryUsage {
    return {
      heapMB: Capacitor.isNativePlatform() ? 15 : 85,
      residentMB: Capacitor.isNativePlatform() ? 75 : 120,
    };
  }

  public getCapabilities(): ModelCapabilities {
    const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
    return {
      framework: isNative ? "whisper.cpp GGML" : "Transformers.js Web WASM",
      accelerator: isNative ? "ARM Neon / CPU" : "WASM / WebGPU",
      precision: "FP16 / INT8",
      supportedInputTypes: ["audio/wav", "audio/mp3", "Blob", "File", "PCM"],
    };
  }
}
