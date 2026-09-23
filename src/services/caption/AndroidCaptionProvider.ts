import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import {
  CaptionTranscriptionProvider,
  CaptionTranscriptionOptions,
  CaptionSegment,
} from "./types";
import { WebCaptionProvider } from "./WebCaptionProvider";
import { processRawSegments } from "../../lib/captionTextProcessor";

export interface NativeSTTPlugin {
  isAvailable(options?: { modelId?: string }): Promise<{
    available: boolean;
    hasLibrary?: boolean;
    hasModel?: boolean;
    modelId?: string;
    modelPath?: string;
    engine?: string;
    reason?: string;
    modelInfo?: any;
  }>;
  getModels(): Promise<{ models: any[]; defaultModelId?: string }>;
  getModelInfo(options: { modelId: string }): Promise<{ model: any | null }>;
  isModelAvailable(options?: { modelId?: string }): Promise<{ available: boolean; modelId?: string; status?: string }>;
  releaseModel(): Promise<{ released: boolean }>;
  transcribe(options: {
    audioPath: string;
    language?: string;
    startTime?: number;
    endTime?: number;
    modelId?: string;
    modelPath?: string;
  }): Promise<{
    success: boolean;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      confidence?: number;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
  }>;
  cancel(): Promise<{ cancelled: boolean }>;
}

/**
 * Get or register the VireonSTT Capacitor plugin
 */
export function getVireonSTTPlugin(): NativeSTTPlugin {
  try {
    return registerPlugin<NativeSTTPlugin>("VireonSTT");
  } catch {
    return {
      isAvailable: async () => ({ available: false, reason: "Plugin registration unavailable" }),
      getModels: async () => ({ models: [], defaultModelId: "whisper-tiny" }),
      getModelInfo: async () => ({ model: null }),
      isModelAvailable: async () => ({ available: false, status: "not_found" }),
      releaseModel: async () => ({ released: false }),
      transcribe: async () => {
        throw { code: "NATIVE_STT_UNAVAILABLE", message: "VireonSTT plugin is not available" };
      },
      cancel: async () => ({ cancelled: false }),
    };
  }
}

export const VireonSTT: NativeSTTPlugin = getVireonSTTPlugin();

/**
 * AndroidCaptionProvider
 * 
 * Production-ready Android Native Caption Provider:
 * 1. Checks if running on Android and native VireonSTT plugin is registered.
 * 2. Directly passes audio path or URI to VireonSTT to eliminate JS bridge buffer overhead.
 * 3. Safely maps timestamps and preserves Arabic text normalization & formatting.
 * 4. Transparently falls back to WebCaptionProvider (WASM/ONNX) if native model/library is missing or fails.
 */
export class AndroidCaptionProvider implements CaptionTranscriptionProvider {
  public readonly id = "android-native-stt";
  public readonly name = "Android Native Caption Provider";
  public readonly platform = "android" as const;

  private fallbackWebProvider: WebCaptionProvider;

  constructor() {
    this.fallbackWebProvider = new WebCaptionProvider();
  }

  /**
   * Determine if Native Android STT capability is available on this device
   */
  public isNativeCapabilityAvailable(): boolean {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return false;
    }
    return (
      Capacitor.isPluginAvailable("VireonSTT") ||
      Capacitor.isPluginAvailable("CaptionPlugin")
    );
  }

  /**
   * Check if native engine is completely available (plugin registered + model ready)
   */
  public async checkNativeReady(): Promise<boolean> {
    if (!this.isNativeCapabilityAvailable()) {
      return false;
    }
    try {
      const plugin = getVireonSTTPlugin();
      const res = await plugin.isAvailable();
      return Boolean(res && res.available);
    } catch {
      return false;
    }
  }

  public isAvailable(): boolean {
    return (
      (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") ||
      this.fallbackWebProvider.isAvailable()
    );
  }

  /**
   * Resolve audio source to a native file path or URI suitable for VireonSTT
   */
  private async resolveNativeAudioPath(
    source: File | Blob | Float32Array | string
  ): Promise<{ path: string; isTemp: boolean }> {
    if (typeof source === "string") {
      // Local Android path or Content URI
      if (
        source.startsWith("/") ||
        source.startsWith("file://") ||
        source.startsWith("content://") ||
        source.startsWith("capacitor://")
      ) {
        return { path: source, isTemp: false };
      }

      // If source is a remote or blob URL, fetch and save to native cache
      if (source.startsWith("http://") || source.startsWith("https://") || source.startsWith("blob:")) {
        const res = await fetch(source);
        const blob = await res.blob();
        return this.writeTempAudioBlobToCache(blob);
      }

      return { path: source, isTemp: false };
    }

    if (source instanceof Blob) {
      return this.writeTempAudioBlobToCache(source);
    }

    // Float32Array cannot be directly resolved to native path without encoding
    throw new Error("Raw Float32Array not directly supported in native path mode");
  }

  /**
   * Write an audio Blob into the Android native cache directory
   */
  private async writeTempAudioBlobToCache(blob: Blob): Promise<{ path: string; isTemp: boolean }> {
    const tempFileName = `vireon_stt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`;
    const reader = new FileReader();

    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(",");
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const base64Data = await base64Promise;
    const writeResult = await Filesystem.writeFile({
      path: tempFileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    return { path: writeResult.uri, isTemp: true };
  }

  /**
   * Perform speech-to-text transcription:
   * Try native VireonSTT first -> if any error or missing model -> fallback to Web/WASM
   */
  public async transcribe(
    source: File | Blob | Float32Array | string,
    options?: CaptionTranscriptionOptions
  ): Promise<CaptionSegment[]> {
    // 1. Check if running on Android and native capability is available
    if (!this.isNativeCapabilityAvailable()) {
      return this.fallbackWebProvider.transcribe(source, options);
    }

    // 2. Abort check
    if (options?.signal?.aborted) {
      throw new Error("Transcription was cancelled");
    }

    let tempAudioPath: string | null = null;

    try {
      options?.onProgress?.({
        phase: "preparing-audio",
        progress: 15,
        message: "جاري تجهيز الصوت للتعرف المحلي الفائق...",
      });

      // 3. Resolve native path
      const { path: audioPath, isTemp } = await this.resolveNativeAudioPath(source);
      if (isTemp) {
        tempAudioPath = audioPath;
      }

      if (options?.signal?.aborted) {
        throw new Error("Transcription was cancelled");
      }

      const plugin = getVireonSTTPlugin();

      // 4. Wire native cancellation listener
      const abortListener = () => {
        plugin.cancel().catch((err) =>
          console.warn("[AndroidCaptionProvider] Native cancel warning:", err)
        );
      };
      options?.signal?.addEventListener("abort", abortListener, { once: true });

      options?.onProgress?.({
        phase: "transcribing",
        progress: 45,
        message: "جاري تفريغ الصوت عبر محرك Whisper الأصلي...",
      });

      // 5. Execute native transcription
      const nativeResponse = await plugin.transcribe({
        audioPath,
        language: options?.language,
        startTime: options?.startTime,
        endTime: options?.endTime,
        modelId: options?.modelId || options?.preferredModel,
        modelPath: options?.preferredModel,
      });

      options?.signal?.removeEventListener("abort", abortListener);

      if (!nativeResponse || !nativeResponse.success || !Array.isArray(nativeResponse.segments)) {
        throw new Error("Native STT returned invalid response structure");
      }

      options?.onProgress?.({
        phase: "post-processing",
        progress: 90,
        message: "معالجة ومحاذاة النصوص واللغة العربية...",
      });

      // 6. Post-process segments (Arabic punctuation, spacing, chunking)
      const rawSegments = nativeResponse.segments.map((s, idx) => ({
        id: `native-${idx}-${Date.now()}`,
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text || "").trim(),
        rawText: String(s.text || "").trim(),
        confidence: s.confidence ?? 0.95,
      }));

      const processed = processRawSegments(rawSegments, {
        language: options?.language,
        silenceGaps: [],
      });

      return processed.map((p) => ({
        id: p.id,
        start: p.start,
        end: p.end,
        text: p.text,
        rawText: p.rawText,
        confidence: p.confidence,
      }));
    } catch (nativeError: any) {
      const errorCode = nativeError?.code || nativeError?.message || "UNKNOWN_NATIVE_ERROR";
      console.warn(
        `[AndroidCaptionProvider] Native STT could not complete (${errorCode}). Transparently falling back to Web/WASM Whisper engine...`,
        nativeError
      );

      // Safe fallback to WebCaptionProvider (never crash CaptionPanel)
      return this.fallbackWebProvider.transcribe(source, options);
    } finally {
      // Clean up temporary cache file if created
      if (tempAudioPath) {
        try {
          const fileName = tempAudioPath.split("/").pop();
          if (fileName) {
            await Filesystem.deleteFile({
              path: fileName,
              directory: Directory.Cache,
            });
          }
        } catch {
          // Ignore cache deletion errors
        }
      }
    }
  }
}
