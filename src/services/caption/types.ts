/**
 * Unified Caption Transcription Types
 * Decouples the UI from underlying Web WASM or Android Native implementations.
 */

export interface CaptionSegment {
  id?: string;
  start: number;
  end: number;
  text: string;
  rawText?: string;
  confidence?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

// Backward compatibility alias
export type TranscribedSegment = CaptionSegment;

export type CaptionProgressPhase =
  | "preparing-audio"
  | "loading-model"
  | "transcribing"
  | "post-processing";

export interface CaptionProgress {
  phase: CaptionProgressPhase;
  progress: number;
  message: string;
}

export interface CaptionTranscriptionOptions {
  language?: string;
  startTime?: number;
  endTime?: number;
  modelId?: string;
  preferredModel?: string;
  signal?: AbortSignal;
  onProgress?: (progress: CaptionProgress) => void;
}

export type CaptionPlatform = "web" | "android" | "ios" | "unknown";

export interface CaptionTranscriptionProvider {
  readonly id: string;
  readonly name: string;
  readonly platform: CaptionPlatform;

  /**
   * Check if this provider is supported and available in the current environment
   */
  isAvailable(): Promise<boolean> | boolean;

  /**
   * Transcribe an audio/video source into timestamped caption segments
   */
  transcribe(
    source: File | Blob | Float32Array | string,
    options?: CaptionTranscriptionOptions
  ): Promise<CaptionSegment[]>;
}
