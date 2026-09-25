/**
 * Phase 7.1: Unified Native AI Engine & Performance Types
 */

export type AIPerformanceTier = "low" | "medium" | "high" | "flagship" | "unknown";

export type AIModelTier = "TIER_1_ESSENTIAL" | "TIER_2_OPTIONAL" | "TIER_3_EXPERIMENTAL";

export type AIModelStatus =
  | "NOT_DOWNLOADED"
  | "DOWNLOADING"
  | "AVAILABLE"
  | "LOADED"
  | "CORRUPTED"
  | "FAILED"
  | "NOT_SUPPORTED";

export type AIErrorCode =
  | "AI_MODEL_NOT_FOUND"
  | "AI_MODEL_INVALID"
  | "AI_RUNTIME_UNAVAILABLE"
  | "AI_ACCELERATOR_UNAVAILABLE"
  | "AI_OUT_OF_MEMORY"
  | "AI_INFERENCE_FAILED"
  | "AI_CANCELLED"
  | "AI_UNSUPPORTED_OPERATION";

export class AIError extends Error {
  public readonly code: AIErrorCode;
  public readonly details?: any;

  constructor(code: AIErrorCode, message: string, details?: any) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.details = details;
  }
}

export interface AICapabilities {
  nativeAI: boolean;
  platform: "android" | "web";
  arm64: boolean;

  memory: {
    availableMB: number;
    totalMB: number;
  };

  runtimes: {
    whisperCpp: boolean;
    mlkitSubjectSegmentation: boolean;
    mlkitFaceDetection: boolean;
    mediapipe: boolean;
    onnx: boolean;
  };

  accelerators: {
    nnapiApiAvailable: boolean;
    gpuUsable: boolean;
    xnnpackUsable: boolean;
  };

  performanceTier: AIPerformanceTier;
  backends: string[];
  activeProvider: "android-native" | "web-worker" | "web-fallback";

  // Flat backward-compatibility fields
  availableMemoryMB: number;
  totalMemoryMB?: number;
  nnapi?: boolean;
  gpuAcceleration?: boolean;
  xnnpack?: boolean;
}

export interface AIModelSpec {
  id: string;
  name: string;
  version: string;
  tier: AIModelTier;
  framework: "whisper.cpp" | "mlkit" | "mediapipe" | "onnx" | "tflite" | "dsp" | "unknown";
  sizeBytes: number;
  quantized: boolean;
  quantizationType?: "INT8" | "FP16" | "FP32";
  checksum?: string;
  localPath?: string;
  remoteUrls?: string[];
  description?: string;
}

export interface AIBenchmarkResult {
  feature: string;
  runtime: string;
  coldStartMs: number;
  warmStartMs: number;
  inferenceMs: number;
  preprocessMs: number;
  postprocessMs: number;
  peakMemoryMB: number;
  modelSizeMB: number;
  runtimeSizeMB: number;
  status: "MEASURED" | "NOT_MEASURED" | "FAILED";
}

export interface ImageSegmentationOptions {
  refineEdges?: boolean;
  edgeFeather?: number;
  threshold?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
}

export interface ImageSegmentationResult {
  success: boolean;
  outputUri?: string;
  filePath?: string;
  maskDataUrl?: string;
  imageDataUrl?: string;
  width: number;
  height: number;
  processingTimeMs: number;
  engine: string;
  accelerator?: string;
}

export interface FaceItem {
  box: { x: number; y: number; width: number; height: number };
  confidence?: number;
  trackingId?: number;
  headEulerAngleX?: number;
  headEulerAngleY?: number;
  headEulerAngleZ?: number;
  smilingProbability?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  landmarks?: Array<{ x: number; y: number }>;
}

export interface FaceDetectionResult {
  success: boolean;
  facesCount: number;
  faces: FaceItem[];
  processingTimeMs: number;
  engine: string;
}

export interface AudioTranscriptionOptions {
  language?: string;
  modelId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface AudioTranscriptionResult {
  success: boolean;
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    confidence?: number;
  }>;
  duration: number;
  processingTimeMs: number;
  engine: string;
}
