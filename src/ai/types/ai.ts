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
  | "image-upscale"
  | "image-editing"
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

// 5. Image Generation (FLUX.1 & AI Image Generators)
export type FluxMode = "text-to-image" | "image-to-image" | "inpainting" | "outpainting";
export type FluxOutputFormat = "jpeg" | "png" | "webp";
export type FluxModel = "flux-pro-1.1" | "flux-dev" | "flux-pro" | "flux-pro-1.1-ultra" | "flux-pro-1.0-fill" | "flux-schnell";

export interface ImageGenerationPayload {
  prompt: string;
  rawPrompt?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  imageSize?: { width: number; height: number } | string;
  aspectRatio?: string; // e.g. "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"
  seed?: number;
  guidance?: number; // guidance_scale (e.g. 1.5 - 10)
  steps?: number; // num_inference_steps (e.g. 1 - 50)
  safetyMode?: number | string; // safety_tolerance (0-6)
  outputFormat?: FluxOutputFormat;
  mode?: FluxMode;
  image?: string; // base64 or URL for img2img / inpaint
  mask?: string; // base64 or URL for inpaint / outpaint
  promptUpsampling?: boolean;
  raw?: boolean; // Raw photo mode for FLUX 1.1 Pro
  model?: FluxModel;
  style?: string;
}

export interface FluxTaskPayload extends ImageGenerationPayload {}

export interface ImageGenerationResult {
  imageUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
  seed?: number;
  requestId?: string;
  providerUsed?: string;
  executionTimeMs?: number;
  metadata?: Record<string, any>;
}

export interface FluxImageResult extends ImageGenerationResult {
  outputImageBase64OrUrl: string;
  mimeType: string;
  width: number;
  height: number;
  processingType: string;
  appliedEngine: string;
  executionTimeMs: number;
  status?: string;
  qualityMetrics?: {
    isLocalExecution?: boolean;
    seed?: number;
  };
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
