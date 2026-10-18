import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  MediaProvider,
  MediaMetadata,
  PreparedMediaFile,
  ExportMediaConfig,
  ExportMediaResult,
  MediaProgressCallback,
  ThumbnailOptions,
  ThumbnailResult,
  WaveformOptions,
  WaveformResult,
  ProxyOptions,
  ProxyResult,
  StorageDiagnostics,
  StorageCleanupResult,
  ProjectCacheInfo,
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
  generateThumbnail(options: {
    uri: string;
    timestampSeconds?: number;
    width?: number;
    height?: number;
    quality?: number;
    operationId?: string;
  }): Promise<{
    success: boolean;
    filePath: string;
    webPath: string;
    width: number;
    height: number;
    timestampSeconds: number;
    fromCache: boolean;
  }>;
  generateWaveform(options: {
    uri: string;
    samplesCount?: number;
    operationId?: string;
  }): Promise<{
    success: boolean;
    peaks: number[];
    duration: number;
    sampleRate: number;
    channels: number;
    fromCache: boolean;
  }>;
  generateProxyVideo(options: {
    inputUri: string;
    targetHeight?: number;
    projectId?: string;
    operationId?: string;
  }): Promise<{
    success: boolean;
    originalPath: string;
    proxyPath: string;
    proxyWebPath: string;
    height: number;
    size: number;
    fromCache: boolean;
  }>;
  getStorageDiagnostics(): Promise<{
    success: boolean;
    freeStorageBytes: number;
    totalStorageBytes: number;
    appCacheBytes: number;
    thumbnailCacheBytes: number;
    proxyCacheBytes: number;
    projectCacheBytes: number;
    modelStorageBytes: number;
    tempStorageBytes: number;
  }>;
  cleanStorageCache(options: { target?: string }): Promise<{
    success: boolean;
    freedBytes: number;
  }>;
  manageProjectCache(options: {
    projectId: string;
    action?: string;
  }): Promise<{
    success: boolean;
    projectId: string;
    path?: string;
    sizeBytes?: number;
    fileCount?: number;
    freedBytes?: number;
  }>;
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
      generateThumbnail: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      generateWaveform: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      generateProxyVideo: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      getStorageDiagnostics: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      cleanStorageCache: async () => {
        throw new Error("VireonMedia plugin not available");
      },
      manageProjectCache: async () => {
        throw new Error("VireonMedia plugin not available");
      },
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
   * Fast native thumbnail generation directly from video/image using MediaMetadataRetriever
   */
  public async generateThumbnail(
    source: string | File | Blob,
    options?: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    if (!this.isAvailable()) {
      return this.fallbackWebProvider.generateThumbnail(source, options);
    }

    try {
      const uri = this.resolveNativeUri(source);
      if (!uri) {
        return this.fallbackWebProvider.generateThumbnail(source, options);
      }

      const plugin = getVireonMediaPlugin();
      const res = await plugin.generateThumbnail({
        uri,
        timestampSeconds: options?.timestampSeconds ?? 0,
        width: options?.width ?? 320,
        height: options?.height ?? 180,
        quality: options?.quality ?? 85,
        operationId: options?.operationId,
      });

      if (res && res.success) {
        return {
          success: true,
          filePath: res.filePath,
          webPath: res.webPath || Capacitor.convertFileSrc(res.filePath),
          width: res.width,
          height: res.height,
          timestampSeconds: res.timestampSeconds,
          fromCache: Boolean(res.fromCache),
        };
      }
      return this.fallbackWebProvider.generateThumbnail(source, options);
    } catch (err) {
      console.warn("[AndroidMediaProvider] Native thumbnail failed, falling back to Web:", err);
      return this.fallbackWebProvider.generateThumbnail(source, options);
    }
  }

  /**
   * Fast native waveform generation using MediaExtractor and amplitude downsampling
   */
  public async generateWaveform(
    source: string | File | Blob,
    options?: WaveformOptions
  ): Promise<WaveformResult> {
    if (!this.isAvailable()) {
      return this.fallbackWebProvider.generateWaveform(source, options);
    }

    try {
      const uri = this.resolveNativeUri(source);
      if (!uri) {
        return this.fallbackWebProvider.generateWaveform(source, options);
      }

      const plugin = getVireonMediaPlugin();
      const res = await plugin.generateWaveform({
        uri,
        samplesCount: options?.samplesCount ?? 100,
        operationId: options?.operationId,
      });

      if (res && res.success) {
        return {
          success: true,
          peaks: Array.isArray(res.peaks) ? res.peaks : [],
          duration: res.duration || 0,
          sampleRate: res.sampleRate || 44100,
          channels: res.channels || 2,
          fromCache: Boolean(res.fromCache),
        };
      }
      return this.fallbackWebProvider.generateWaveform(source, options);
    } catch (err) {
      console.warn("[AndroidMediaProvider] Native waveform generation failed, falling back to Web:", err);
      return this.fallbackWebProvider.generateWaveform(source, options);
    }
  }

  /**
   * Native editing proxy video generation
   */
  public async generateProxy(
    source: string | File | Blob,
    options?: ProxyOptions
  ): Promise<ProxyResult> {
    if (!this.isAvailable()) {
      return this.fallbackWebProvider.generateProxy(source, options);
    }

    try {
      const uri = this.resolveNativeUri(source);
      if (!uri) {
        return this.fallbackWebProvider.generateProxy(source, options);
      }

      const plugin = getVireonMediaPlugin();
      const operationId = options?.operationId || `proxy_${Date.now()}`;

      // Abort support
      const abortListener = () => {
        plugin.cancelMediaOperation({ operationId }).catch(() => {});
      };
      options?.signal?.addEventListener("abort", abortListener, { once: true });

      const res = await plugin.generateProxyVideo({
        inputUri: uri,
        targetHeight: options?.targetHeight ?? 540,
        projectId: options?.projectId ?? "default",
        operationId,
      });

      options?.signal?.removeEventListener("abort", abortListener);

      if (res && res.success) {
        return {
          success: true,
          originalPath: res.originalPath,
          proxyPath: res.proxyPath,
          proxyWebPath: res.proxyWebPath || Capacitor.convertFileSrc(res.proxyPath),
          height: res.height,
          size: res.size,
          fromCache: Boolean(res.fromCache),
        };
      }
      return this.fallbackWebProvider.generateProxy(source, options);
    } catch (err) {
      console.warn("[AndroidMediaProvider] Native proxy generation failed, falling back to Web:", err);
      return this.fallbackWebProvider.generateProxy(source, options);
    }
  }

  /**
   * Diagnostic statistics for app cache, thumbnails, proxies, and models
   */
  public async getStorageDiagnostics(): Promise<StorageDiagnostics> {
    if (!this.isAvailable()) {
      return (
        this.fallbackWebProvider.getStorageDiagnostics?.() ?? {
          success: true,
          freeStorageBytes: 10 * 1024 * 1024 * 1024,
          totalStorageBytes: 64 * 1024 * 1024 * 1024,
          appCacheBytes: 0,
          thumbnailCacheBytes: 0,
          proxyCacheBytes: 0,
          projectCacheBytes: 0,
          modelStorageBytes: 0,
          tempStorageBytes: 0,
        }
      );
    }

    try {
      const plugin = getVireonMediaPlugin();
      const diag = await plugin.getStorageDiagnostics();
      return {
        success: Boolean(diag?.success),
        freeStorageBytes: diag?.freeStorageBytes ?? 0,
        totalStorageBytes: diag?.totalStorageBytes ?? 0,
        appCacheBytes: diag?.appCacheBytes ?? 0,
        thumbnailCacheBytes: diag?.thumbnailCacheBytes ?? 0,
        proxyCacheBytes: diag?.proxyCacheBytes ?? 0,
        projectCacheBytes: diag?.projectCacheBytes ?? 0,
        modelStorageBytes: diag?.modelStorageBytes ?? 0,
        tempStorageBytes: diag?.tempStorageBytes ?? 0,
      };
    } catch (err) {
      console.warn("[AndroidMediaProvider] getStorageDiagnostics failed:", err);
      return {
        success: false,
        freeStorageBytes: 0,
        totalStorageBytes: 0,
        appCacheBytes: 0,
        thumbnailCacheBytes: 0,
        proxyCacheBytes: 0,
        projectCacheBytes: 0,
        modelStorageBytes: 0,
        tempStorageBytes: 0,
      };
    }
  }

  /**
   * Clean cache directory targets
   */
  public async cleanStorageCache(target = "all_cache"): Promise<StorageCleanupResult> {
    if (!this.isAvailable()) {
      return (
        this.fallbackWebProvider.cleanStorageCache?.(target) ?? {
          success: true,
          freedBytes: 0,
          target,
        }
      );
    }

    try {
      const plugin = getVireonMediaPlugin();
      const res = await plugin.cleanStorageCache({ target });
      return {
        success: Boolean(res?.success),
        freedBytes: res?.freedBytes ?? 0,
        target,
      };
    } catch (err) {
      console.warn("[AndroidMediaProvider] cleanStorageCache failed:", err);
      return {
        success: false,
        freedBytes: 0,
        target,
      };
    }
  }

  /**
   * Project cache operations
   */
  public async manageProjectCache(
    projectId: string,
    action: "getInfo" | "clear" | "delete" = "getInfo"
  ): Promise<ProjectCacheInfo> {
    if (!this.isAvailable()) {
      return (
        this.fallbackWebProvider.manageProjectCache?.(projectId, action) ?? {
          success: true,
          projectId,
        }
      );
    }

    try {
      const plugin = getVireonMediaPlugin();
      const res = await plugin.manageProjectCache({ projectId, action });
      return {
        success: Boolean(res?.success),
        projectId,
        path: res?.path,
        sizeBytes: res?.sizeBytes,
        fileCount: res?.fileCount,
        freedBytes: res?.freedBytes,
      };
    } catch (err) {
      console.warn("[AndroidMediaProvider] manageProjectCache failed:", err);
      return {
        success: false,
        projectId,
      };
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
