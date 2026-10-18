import { CaptionTranscriptionProvider, CaptionTranscriptionOptions, CaptionSegment } from "./types";
import { transcribeLocally } from "@/lib/localTranscribe";

/**
 * WebCaptionProvider
 * 
 * Default web transcription provider using in-browser WebAssembly (WASM)
 * and Web Worker (@xenova/transformers / Whisper ONNX runtime).
 * 
 * 100% preserves existing timing, caching, Arabic normalization, and model execution.
 */
export class WebCaptionProvider implements CaptionTranscriptionProvider {
  public readonly id = "web-wasm-whisper";
  public readonly name = "Web WASM Whisper Provider";
  public readonly platform = "web" as const;

  /**
   * Available in browser/WebView environments
   */
  public isAvailable(): boolean {
    return typeof window !== "undefined";
  }

  /**
   * Delegates directly to existing transcribeLocally without altering any parameters or pipeline behavior
   */
  public async transcribe(
    source: File | Blob | Float32Array | string,
    options?: CaptionTranscriptionOptions
  ): Promise<CaptionSegment[]> {
    return transcribeLocally(source, {
      language: options?.language,
      startTime: options?.startTime,
      endTime: options?.endTime,
      preferredModel: options?.preferredModel,
      signal: options?.signal,
      onProgress: options?.onProgress,
    });
  }
}
