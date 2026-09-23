import {
  MediaProvider,
  MediaMetadata,
  PreparedMediaFile,
  ExportMediaConfig,
  ExportMediaResult,
  MediaProgressCallback,
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
   * Extract video/audio/image metadata natively
   */
  public async getMetadata(source: string | File | Blob): Promise<MediaMetadata> {
    return this.getProvider().getMetadata(source);
  }

  /**
   * Prepare media input for downstream native or web operations
   */
  public async prepareInput(source: string | File | Blob): Promise<PreparedMediaFile> {
    return this.getProvider().prepareInput(source);
  }

  /**
   * Export or trim media without unnecessary memory duplication
   */
  public async exportMedia(
    config: ExportMediaConfig,
    onProgress?: MediaProgressCallback,
    signal?: AbortSignal
  ): Promise<ExportMediaResult> {
    return this.getProvider().exportMedia(config, onProgress, signal);
  }

  /**
   * Safely release cached media resources
   */
  public async releaseResource(pathOrUri: string): Promise<boolean> {
    return this.getProvider().releaseResource(pathOrUri);
  }
}

export const mediaService = MediaService.getInstance();
