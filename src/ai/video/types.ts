/**
 * Video AI Architecture - Global Type Definitions
 */

export type VideoAITaskType =
  | "enhance-video"
  | "remove-video-background"
  | "video-denoise";

export type VideoAIStage =
  | "QUEUED"
  | "PREPARING"
  | "LOADING"
  | "DECODING"
  | "PROCESSING"
  | "ENCODING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ResourceSafetyTier = "SAFE" | "WARNING" | "HIGH_RISK" | "UNSUPPORTED";

export interface VideoResourceAssessment {
  tier: ResourceSafetyTier;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  frameCount: number;
  estimatedRAMMB: number;
  deviceMemoryGB: number;
  estimatedProcessingSeconds: number;
  recommendation: string;
  recommendedResolution?: { width: number; height: number; name: string };
}

export interface VideoProgressEvent {
  jobId: string;
  taskType: VideoAITaskType;
  stage: VideoAIStage;
  percentage: number; // 0 - 100
  currentFrame: number;
  totalFrames: number;
  fps: number;
  elapsedMs: number;
  etaSeconds: number;
  message: string;
}

export interface VideoAIOptions {
  jobId?: string;
  maxResolution?: "original" | "1080p" | "720p" | "480p";
  targetFps?: number;
  outputFormat?: "mp4" | "webm";
  preserveAudio?: boolean;
  onProgress?: (event: VideoProgressEvent) => void;
  abortSignal?: AbortSignal;
  isAborted?: () => boolean;

  // Enhancement specific
  claheClipLimit?: number; // 1.0 - 4.0 (Default: 2.0)
  denoiseIntensity?: number; // 0.0 - 1.0 (Default: 0.6)
  sharpnessIntensity?: number; // 0.0 - 1.0 (Default: 0.5)
  colorVibrance?: number; // 0.0 - 1.0 (Default: 0.35)

  // Background removal specific
  temporalSmoothing?: number; // 0.0 - 1.0 (Default: 0.65)
  edgeFeather?: number; // 0 - 5 px (Default: 2)
  backgroundColor?: string; // "transparent" or hex color / backdrop
  returnMaskOnly?: boolean;
}

export interface VideoAIResult {
  outputUrl: string;
  blob?: Blob;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  frameCount: number;
  sizeMB: number;
  executionTimeMs: number;
  taskType: VideoAITaskType;
  appliedEngine: string;
  verified: boolean;
}

export interface VideoCapabilityProfile {
  hasWebCodecs: boolean;
  hasVideoEncoder: boolean;
  hasVideoDecoder: boolean;
  hasOffscreenCanvas: boolean;
  hasWebGL2: boolean;
  hasWebGPU: boolean;
  hasWASM: boolean;
  hasSIMD: boolean;
  deviceMemoryGB: number;
  hardwareConcurrency: number;
  isAndroid: boolean;
  isIOS: boolean;
  recommendedEncoder: "webcodecs" | "ffmpeg-wasm" | "media-recorder";
  recommendedMaxResolution: { width: number; height: number; name: string };
}
