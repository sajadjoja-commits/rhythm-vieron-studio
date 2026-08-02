/**
 * Core types for AI Manager system
 */

export type AITaskType =
  | "speech-to-text"
  | "background-removal"
  | "enhance-media"
  | "noise-reduction"
  | "vocal-isolation"
  | "music-removal"
  | "image-generation"
  | "translation"
  | "custom";

export type ExecutionMode = "auto" | "remote" | "local";

export interface AIError {
  code: string;
  message: string;
  isOffline?: boolean;
  provider?: string;
  details?: any;
}

export interface AIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: AIError;
  providerUsed?: string;
  executionTimeMs?: number;
  cached?: boolean;
}

export interface AITaskOptions {
  executionMode?: ExecutionMode;
  preferredProvider?: string;
  enableCache?: boolean;
  cacheTTLMs?: number; // Cache time-to-live in ms (default 24h)
  timeoutMs?: number;
  language?: string;
  signal?: AbortSignal;
}

// ---------------- Task Payloads & Results ----------------

// 1. Speech-to-text (Transcription)
export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface SpeechToTextPayload {
  audioBase64: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
}

export interface SpeechToTextResult {
  captions: CaptionSegment[];
  rawText?: string;
  languageDetected?: string;
}

// 2. Background Removal (Image/Video)
export interface BackgroundRemovalPayload {
  mediaUrlOrBase64: string;
  isVideo?: boolean;
  quality?: "fast" | "accurate";
}

export interface BackgroundRemovalResult {
  outputUrlOrBase64: string;
  maskUrlOrBase64?: string;
}

// 3. Audio Isolation / Noise Reduction / Music Removal
export interface AudioIsolationPayload {
  audioBase64OrUrl: string;
  mode: "remove-noise" | "isolate-vocals" | "remove-music";
  intensity?: number; // 0 to 1
}

export interface AudioIsolationResult {
  processedAudioUrlOrBase64: string;
  isolatedVocalUrlOrBase64?: string;
  isolatedInstrumentalUrlOrBase64?: string;
}

// 4. Media Enhancement (Super-resolution, Upscaling)
export interface EnhanceMediaPayload {
  mediaUrlOrBase64: string;
  isVideo?: boolean;
  scaleFactor?: 2 | 4;
}

export interface EnhanceMediaResult {
  enhancedUrlOrBase64: string;
}

// 5. Image Generation
export interface ImageGenerationPayload {
  prompt: string;
  aspectRatio?: string;
  negativePrompt?: string;
  style?: string;
}

export interface ImageGenerationResult {
  imageUrl: string;
  mimeType?: string;
}

// 6. Translation
export interface TranslationPayload {
  text: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
}
