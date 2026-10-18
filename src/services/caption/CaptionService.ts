import { Capacitor } from "@capacitor/core";
import {
  CaptionTranscriptionProvider,
  CaptionTranscriptionOptions,
  CaptionSegment,
  CaptionPlatform,
} from "./types";
import { WebCaptionProvider } from "./WebCaptionProvider";
import { AndroidCaptionProvider } from "./AndroidCaptionProvider";

/**
 * CaptionService
 * 
 * Central orchestration service for speech-to-text caption generation.
 * Decouples UI components (like CaptionPanel) from platform-specific execution engines.
 */
export class CaptionService {
  private static instance: CaptionService;
  private currentProvider: CaptionTranscriptionProvider;
  private webProvider: WebCaptionProvider;
  private androidProvider: AndroidCaptionProvider;

  private constructor() {
    this.webProvider = new WebCaptionProvider();
    this.androidProvider = new AndroidCaptionProvider();
    this.currentProvider = this.resolveProvider();
  }

  public static getInstance(): CaptionService {
    if (!CaptionService.instance) {
      CaptionService.instance = new CaptionService();
    }
    return CaptionService.instance;
  }

  /**
   * Detect current platform
   */
  public getPlatform(): CaptionPlatform {
    if (Capacitor.isNativePlatform()) {
      const p = Capacitor.getPlatform();
      if (p === "android") return "android";
      if (p === "ios") return "ios";
    }
    return "web";
  }

  /**
   * Resolve the active provider based on runtime environment
   */
  public resolveProvider(): CaptionTranscriptionProvider {
    const platform = this.getPlatform();

    if (platform === "android") {
      return this.androidProvider;
    }

    return this.webProvider;
  }

  /**
   * Get the active provider
   */
  public getProvider(): CaptionTranscriptionProvider {
    return this.currentProvider;
  }

  /**
   * Transcribe audio/video source using the active platform provider
   */
  public async transcribe(
    source: File | Blob | Float32Array | string,
    options?: CaptionTranscriptionOptions
  ): Promise<CaptionSegment[]> {
    const provider = this.getProvider();
    return provider.transcribe(source, options);
  }
}

export const captionService = CaptionService.getInstance();
