/**
 * Phase 7: Unified Native AI Engine & Performance Types
 */

export type AIPerformanceTier = "low" | "medium" | "high" | "flagship";

export type AIModelTier = "TIER_1_ESSENTIAL" | "TIER_2_OPTIONAL" | "TIER_3_EXPERIMENTAL";

export type AIModelStatus =
  | "NOT_DOWNLOADED"
  | "DOWNLOADING"
  | "AVAILABLE"
  | "LOADED"
  | "CORRUPTED"
  | "FAILED";

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
  arm64: boolean;
  nnapi: boolean;
  gpuAcceleration: boolean;
  xnnpack: boolean;
  availableMemoryMB: number;
  totalMemoryMB?: number;
  performanceTier: AIPerformanceTier;
  backends: string[];
  activeProvider: "android-native" | "web-worker" | "web-fallback";
}

export interface AIModelSpec {
  id: string;
  name: string;
  version: string;
  tier: AIModelTier;
  framework: "whisper.cpp" | "mlkit" | "mediapipe" | "onnx" | "tflite" | "dsp";
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
  status: "MEASURED" | "NOT_MEASURED" | "BLOCKED";
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

export interface FaceDetectionResult {
  success: boolean;
  facesCount: number;
  faces: Array<{
    box: { x: number; y: number; width: number; height: number };
    confidence: number;
    landmarks?: Array<{ x: number; y: number }>;
  }>;
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
