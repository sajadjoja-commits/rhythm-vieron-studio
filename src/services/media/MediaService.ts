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
import { AndroidMediaProvider } from "./AndroidMediaProvider";

/**
 * MediaService Orchestrator
 * 
 * Central orchestrator for all heavy media operations in Vireon.
 * Automatically resolves the optimal platform provider (AndroidMediaProvider vs WebMediaProvider).
 * Enforces zero-binary overhead across the Capacitor bridge.
 */
export class MediaService {
  private static instance: MediaService;

  private readonly webProvider: WebMediaProvider;
  private readonly androidProvider: AndroidMediaProvider;

  private constructor() {
    this.webProvider = new WebMediaProvider();
    this.androidProvider = new AndroidMediaProvider();
  }

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  /**
   * Resolve the active media provider based on current device and capabilities
   */
  public getProvider(): MediaProvider {
    if (this.androidProvider.isAvailable()) {
      return this.androidProvider;
    }
    return this.webProvider;
  }

  /**
   * Resolve provider specifically for a media source:
   * - Android + nativeUri/path -> AndroidMediaProvider
   * - Android + pure in-memory Blob -> WebMediaProvider fallback (prevents binary serialization)
   * - Web -> WebMediaProvider
   */
  public getProviderForSource(source: string | File | Blob): MediaProvider {
    if (this.androidProvider.isAvailable()) {
      if (typeof source === "string") {
        if (
          source.startsWith("content://") ||
          source.startsWith("file://") ||
          source.startsWith("/") ||
          source.includes("/_capacitor_file_/")
        ) {
          return this.androidProvider;
        }
      } else if (source && typeof source === "object") {
        if ((source as any).nativePath || (source as any).nativeUri) {
          return this.androidProvider;
        }
      }
      // Pure in-memory Blob without native handle: use web provider fallback
      return this.webProvider;
    }
    return this.webProvider;
  }

  /**
   * Extract video/audio/image metadata natively
   */
  public async getMetadata(source: string | File | Blob): Promise<MediaMetadata> {
    return this.getProviderForSource(source).getMetadata(source);
  }

  /**
   * Prepare media input for downstream native or web operations
   */
  public async prepareInput(source: string | File | Blob): Promise<PreparedMediaFile> {
    return this.getProviderForSource(source).prepareInput(source);
  }

  /**
   * Export or trim media without unnecessary memory duplication
   */
  public async exportMedia(
    config: ExportMediaConfig,
    onProgress?: MediaProgressCallback,
    signal?: AbortSignal
  ): Promise<ExportMediaResult> {
    if (this.androidProvider.isAvailable() && config.inputUri) {
      return this.androidProvider.exportMedia(config, onProgress, signal);
    }
    return this.webProvider.exportMedia(config, onProgress, signal);
  }

  /**
   * Safely release cached media resources
   */
  public async releaseResource(pathOrUri: string): Promise<boolean> {
    return this.getProvider().releaseResource(pathOrUri);
  }

  /**
   * Fast thumbnail generation for timeline scrubbing and media pickers
   */
  public async generateThumbnail(
    source: string | File | Blob,
    options?: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    return this.getProviderForSource(source).generateThumbnail(source, options);
  }

  /**
   * Fast audio waveform generation
   */
  public async generateWaveform(
    source: string | File | Blob,
    options?: WaveformOptions
  ): Promise<WaveformResult> {
    return this.getProviderForSource(source).generateWaveform(source, options);
  }

  /**
   * Fast native or web editing proxy generation
   */
  public async generateProxy(
    source: string | File | Blob,
    options?: ProxyOptions
  ): Promise<ProxyResult> {
    return this.getProviderForSource(source).generateProxy(source, options);
  }

  /**
   * Retrieve storage diagnostics
   */
  public async getStorageDiagnostics(): Promise<StorageDiagnostics> {
    if (this.androidProvider.isAvailable()) {
      return this.androidProvider.getStorageDiagnostics();
    }
    return this.webProvider.getStorageDiagnostics();
  }

  /**
   * Clean cache directory targets
   */
  public async cleanStorageCache(target = "all_cache"): Promise<StorageCleanupResult> {
    if (this.androidProvider.isAvailable()) {
      return this.androidProvider.cleanStorageCache(target);
    }
    return this.webProvider.cleanStorageCache(target);
  }

  /**
   * Project cache operations
   */
  public async manageProjectCache(
    projectId: string,
    action: "getInfo" | "clear" | "delete" = "getInfo"
  ): Promise<ProjectCacheInfo> {
    if (this.androidProvider.isAvailable()) {
      return this.androidProvider.manageProjectCache(projectId, action);
    }
    return this.webProvider.manageProjectCache(projectId, action);
  }
}

export const mediaService = MediaService.getInstance();
