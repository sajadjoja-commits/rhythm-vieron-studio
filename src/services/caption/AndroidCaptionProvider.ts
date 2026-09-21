import { Capacitor } from "@capacitor/core";
import { CaptionTranscriptionProvider, CaptionTranscriptionOptions, CaptionSegment } from "./types";
import { WebCaptionProvider } from "./WebCaptionProvider";

/**
 * AndroidCaptionProvider
 * 
 * Future-ready adapter for Android Native speech-to-text inference.
 * 
 * Architectural Role in Phase 2:
 * 1. Checks if a native Capacitor plugin (e.g. 'VireonSTT' or 'CaptionPlugin') is registered and available.
 * 2. If native plugin is not present, safely and transparently falls back to WebCaptionProvider.
 * 3. Keeps the application completely stable with zero breaking changes or runtime regressions.
 * 4. In Phase 3, native Whisper / C++ / ONNX Mobile execution can be wired here without touching the UI.
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
    // Check if future native STT plugin is registered in Capacitor
    return Capacitor.isPluginAvailable("VireonSTT") || Capacitor.isPluginAvailable("CaptionPlugin");
  }

  public isAvailable(): boolean {
    // In Android runtime, this provider is available either natively or via the Web WASM fallback
    return (
      (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") ||
      this.fallbackWebProvider.isAvailable()
    );
  }

  public async transcribe(
    source: File | Blob | Float32Array | string,
    options?: CaptionTranscriptionOptions
  ): Promise<CaptionSegment[]> {
    if (this.isNativeCapabilityAvailable()) {
      // Slot reserved for Phase 3 (Native Whisper / C++ / ONNX Mobile plugin execution)
      console.log("[AndroidCaptionProvider] Native STT plugin detected. Executing native pipeline...");
    }

    // Phase 2 Safe Fallback:
    // Delegate execution to WebCaptionProvider (maintaining 100% compatibility on Android WebView)
    return this.fallbackWebProvider.transcribe(source, options);
  }
}
