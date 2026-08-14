import { AICapability, AIJobOptions } from "../runtime/types";
import { AIResponse } from "../types/ai";

export interface AIPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: AICapability[];

  initialize(): Promise<void>;
  execute<TPayload = any, TResult = any>(
    actionName: string,
    payload: TPayload,
    options?: AIJobOptions
  ): Promise<AIResponse<TResult>>;
  releaseResources?(): Promise<void> | void;
}

// ---------------- Video Enhancement & Processing Types ----------------

export type VideoActionType =
  | "video-upscale"
  | "video-denoise"
  | "video-bg-removal"
  | "video-stabilize"
  | "frame-interpolation"
  | "video-object-remove"
  | "auto-color-enhance"
  | "composite-video-enhance";

export type VideoUpscaleEngine = "Real-ESRGAN-Video" | "Gemini-VideoSuperRes";
export type VideoInterpolationEngine = "RIFE-v4.6" | "Motion-Flow";
export type VideoMattingEngine = "RobustVideoMatting" | "MODNet-Video" | "Gemini-VideoMatting";
export type VideoDenoiseEngine = "FastDVDnet" | "NAFNet-Video" | "Canvas-SpatialDenoise";
export type VideoInpaintEngine = "LaMa-Video" | "ProPainter";

export interface AIVideoPayload {
  videoBase64OrUrl: string;
  mimeType?: string;
  action?: VideoActionType;
  upscaleFactor?: 2 | 4;
  targetFps?: 30 | 60 | 120;
  denoiseIntensity?: number; // 0.0 to 1.0
  stabilizeIntensity?: number; // 0.0 to 1.0
  maskBase64OrUrl?: string; // For object removal
  preserveAudio?: boolean;
  preferredEngine?: string;
}

export interface AIVideoResult {
  outputVideoBase64OrUrl: string;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  processingType: VideoActionType;
  appliedEngine: string;
  executionTimeMs: number;
  qualityMetrics?: {
    originalWidth?: number;
    originalHeight?: number;
    originalFps?: number;
    totalFramesProcessed?: number;
    isLocalExecution?: boolean;
  };
  error?: string;
}

// ---------------- Image Enhancement & AI Image Processing Types ----------------

export type ImageActionType =
  | "remove-background"
  | "upscale"
  | "face-enhance"
  | "object-remove"
  | "denoise"
  | "composite-enhance";

export type ImageBgEngine = "RMBG-2.0" | "Bria-RMBG" | "Gemini-Vision";
export type ImageUpscaleEngine = "Real-ESRGAN" | "Gemini-SuperRes";
export type ImageFaceEngine = "GFPGAN-v1.4" | "Gemini-FaceRestore";
export type ImageInpaintEngine = "LaMa-Inpaint" | "Gemini-Inpaint";
export type ImageDenoiseEngine = "SCUNet" | "NAFNet" | "Canvas-DSP";

export interface AIImagePayload {
  imageBase64OrUrl: string;
  mimeType?: string;
  action?: ImageActionType;
  upscaleFactor?: 2 | 4;
  maskBase64OrUrl?: string; // For object removal / inpainting
  denoiseIntensity?: number; // 0.0 to 1.0
  enhanceFaceLevel?: number; // 0.0 to 1.0
  preferredEngine?: string;
}

export interface AIImageResult {
  outputImageBase64OrUrl: string;
  mimeType: string;
  width: number;
  height: number;
  processingType: ImageActionType;
  appliedEngine: string;
  executionTimeMs: number;
  qualityMetrics?: {
    scaleFactor?: number;
    originalWidth?: number;
    originalHeight?: number;
    isLocalExecution?: boolean;
    psnrEstimateDb?: number;
  };
}


export type DenoiseEngine = "DeepFilterNet" | "StandardDSP";
export type SeparationEngine = "Demucs-v4" | "StandardDemucs";

export type SeparationMode =
  | "none"
  | "remove-music"
  | "remove-speech"
  | "extract-vocals"
  | "extract-instrumental"
  | "multi-stem";

export interface AudioEnhancementPayload {
  audioBase64OrUrl: string;
  mimeType?: string;
  denoise?: boolean;
  denoiseEngine?: DenoiseEngine;
  denoiseIntensity?: number; // 0.0 to 1.0
  separationMode?: SeparationMode;
  separationEngine?: SeparationEngine;
  targetSampleRate?: number;
}

export interface AudioStems {
  vocals?: string;
  instrumental?: string;
  drums?: string;
  bass?: string;
  other?: string;
}

export interface AudioEnhancementResult {
  enhancedAudioUrlOrBase64: string;
  mimeType: string;
  stems?: AudioStems;
  appliedDenoiseEngine?: string;
  appliedSeparationEngine?: string;
  metrics?: {
    noiseReductionDb?: number;
    processingTimeMs?: number;
    isLocalExecution?: boolean;
  };
}
