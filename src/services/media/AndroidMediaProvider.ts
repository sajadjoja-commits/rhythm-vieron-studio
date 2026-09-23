import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  MediaProvider,
  MediaMetadata,
  PreparedMediaFile,
  ExportMediaConfig,
  ExportMediaResult,
  MediaProgressCallback,
} from "./types";
import { WebMediaProvider } from "./WebMediaProvider";

export interface NativeMediaPlugin {
  getMediaMetadata(options: { uri: string }): Promise<{
    success: boolean;
    width: number;
    height: number;
    duration: number;
    rotation?: number;
    mimeType: string;
    fileSize: number;
    bitrate?: number;
    hasAudio?: boolean;
  }>;
  prepareMediaInput(options: { uri: string }): Promise<{
    success: boolean;
    path: string;
    webPath: string;
    name: string;
    mimeType: string;
    size: number;
  }>;
  copyMediaToAppStorage(options: { uri: string; destFileName?: string }): Promise<{
    success: boolean;
    path: string;
    webPath: string;
    size: number;
  }>;
  exportMediaNatively(options: {
    inputUri: string;
    outputFileName?: string;
    startTime?: number;
    endTime?: number;
    saveToGallery?: boolean;
    operationId?: string;
  }): Promise<{
    success: boolean;
    path: string;
    uri: string;
    size: number;
    savedToGallery: boolean;
  }>;
  cancelMediaOperation(options: { operationId: string }): Promise<{ cancelled: boolean }>;
  releaseMediaResource(options: { path: string }): Promise<{ success: boolean }>;
  saveVideoToGallery(options: { path: string }): Promise<{ success: boolean; message?: string }>;
  saveImageToGallery(options: { path: string }): Promise<{ success: boolean; message?: string }>;
  saveAudioToMusic(options: { path: string }): Promise<{ success: boolean; message?: string }>;
}

export function getVireonMediaPlugin(): NativeMediaPlugin {
  try {
    return registerPlugin<NativeMediaPlugin>("VireonMedia");
  } catch {
    return {
      getMediaMetadata: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      prepareMediaInput: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      copyMediaToAppStorage: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      exportMediaNatively: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      cancelMediaOperation: async () => ({ cancelled: false }),
      releaseMediaResource: async () => ({ success: false }),
      saveVideoToGallery: async () => ({ success: false }),
      saveImageToGallery: async () => ({ success: false }),
      saveAudioToMusic: async () => ({ success: false }),
    };
  }
}

/**
 * AndroidMediaProvider
 * 
 * High-performance native Android media provider.
 * Interacts with Android's MediaMetadataRetriever, MediaExtractor, MediaMuxer, and MediaStore.
 * Never passes large video binaries or Base64 over the bridge; uses URIs, File Descriptors, and native paths.
 * Transparently falls back to WebMediaProvider when running on Web or if a native operation fails.
 */
export class AndroidMediaProvider implements MediaProvider {
  public readonly id = "android-media-provider";
  public readonly platform = "android" as const;

  private readonly fallbackWebProvider: WebMediaProvider;

  constructor() {
    this.fallbackWebProvider = new WebMediaProvider();
  }

  public isAvailable(): boolean {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("VireonMedia")
    );
  }

  /**
   * Extract video/audio/image metadata natively without buffering video into RAM.
   */
  public async getMetadata(source: string | File | Blob): Promise<MediaMetadata> {
    if (!this.isAvailable()) {
      return this.fallbackWebProvider.getMetadata(source);
    }

    try {
      const uri = this.resolveNativeUri(source);
      if (!uri) {
        return this.fallbackWebProvider.getMetadata(source);
      }

      const plugin = getVireonMediaPlugin();
      const meta = await plugin.getMediaMetadata({ uri });

      if (meta && meta.success) {
        return {
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          rotation: meta.rotation || 0,
          mimeType: meta.mimeType,
          fileSize: meta.fileSize,
          bitrate: meta.bitrate,
          hasAudio: meta.hasAudio,
        };
      }
      return this.fallbackWebProvider.getMetadata(source);
    } catch (err) {
      console.warn("[AndroidMediaProvider] Native metadata extraction failed, falling back to Web:", err);
      return this.fallbackWebProvider.getMetadata(source);
    }
  }

  /**
   * Prepare media input for native processing.
   * If source is content://, streams to app storage via native buffer.
   * If source is already a local path, returns it without copying.
   */
  public async prepareInput(source: string | File | Blob): Promise<PreparedMediaFile> {
    if (!this.isAvailable()) {
      return this.fallbackWebProvider.prepareInput(source);
    }

    try {
      const uri = this.resolveNativeUri(source);
      if (!uri) {
        return this.fallbackWebProvider.prepareInput(source);
      }

      const plugin = getVireonMediaPlugin();
      const result = await plugin.prepareMediaInput({ uri });

      if (result && result.success) {
        return {
          path: result.path,
          webPath: result.webPath || Capacitor.convertFileSrc(result.path),
          name: result.name,
          mimeType: result.mimeType,
          size: result.size,
        };
      }
      return this.fallbackWebProvider.prepareInput(source);
    } catch (err) {
      console.warn("[AndroidMediaProvider] Native prepareInput failed, falling back to Web:", err);
      return this.fallbackWebProvider.prepareInput(source);
    }
  }

  /**
   * Export or trim media natively without transmitting any binary over JavaScript bridge.
   * React provides configuration (inputUri, trimming, output name); Android performs the operation and saves to MediaStore.
   */
  public async exportMedia(
    config: ExportMediaConfig,
    onProgress?: MediaProgressCallback,
    signal?: AbortSignal
  ): Promise<ExportMediaResult> {
    if (!this.isAvailable() || (!config.inputUri && config.blob)) {
      return this.fallbackWebProvider.exportMedia(config, onProgress, signal);
    }

    if (signal?.aborted) {
      throw new Error("Export was cancelled before start");
    }

    const plugin = getVireonMediaPlugin();
    const operationId = config.operationId || `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Abort listener for native cancellation
    const abortListener = () => {
      plugin.cancelMediaOperation({ operationId }).catch((e) => {
        console.warn("[AndroidMediaProvider] Failed to send cancel to native media operation:", e);
      });
    };
    signal?.addEventListener("abort", abortListener, { once: true });

    try {
      onProgress?.({
        phase: "processing",
        progress: 0.1,
        message: "Starting native media processing on Android...",
      });

      const res = await plugin.exportMediaNatively({
        inputUri: config.inputUri!,
        outputFileName: config.outputFileName,
        startTime: config.startTime,
        endTime: config.endTime,
        saveToGallery: config.saveToGallery !== false,
        operationId,
      });

      signal?.removeEventListener("abort", abortListener);

      if (!res || !res.success) {
        throw new Error("Native export operation returned unsuccessful status");
      }

      onProgress?.({
        phase: "completed",
        progress: 1.0,
        message: "Native export complete!",
      });

      return {
        success: true,
        path: res.path,
        uri: res.uri,
        size: res.size,
        savedToGallery: res.savedToGallery,
      };
    } catch (err: any) {
      signal?.removeEventListener("abort", abortListener);
      console.warn("[AndroidMediaProvider] Native export failed, attempting Web fallback:", err);
      if (config.blob) {
        return this.fallbackWebProvider.exportMedia(config, onProgress, signal);
      }
      throw err;
    }
  }

  /**
   * Safely release/delete temporary media file on device storage
   */
  public async releaseResource(pathOrUri: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return this.fallbackWebProvider.releaseResource(pathOrUri);
    }

    try {
      const plugin = getVireonMediaPlugin();
      const res = await plugin.releaseMediaResource({ path: pathOrUri });
      return Boolean(res?.success);
    } catch {
      return false;
    }
  }

  /**
   * Helper to extract a usable native URI or path from various source types
   */
  private resolveNativeUri(source: string | File | Blob): string | null {
    if (typeof source === "string") {
      if (source.startsWith("content://") || source.startsWith("file://") || source.startsWith("/")) {
        return source;
      }
      if (source.includes("/_capacitor_file_/")) {
        return decodeURIComponent(source.split("/_capacitor_file_")[1]);
      }
      return source;
    }

    if (source && typeof source === "object") {
      const nativePath = (source as any).nativePath || (source as any).nativeUri;
      if (nativePath) return nativePath;
    }

    return null;
  }
}
