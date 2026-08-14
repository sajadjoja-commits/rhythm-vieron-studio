/**
 * Image AI Engine Types & Interfaces
 * Production-Grade Local Image AI Architecture
 */

export type ImageAITaskType =
  | "remove-background"
  | "upscale"
  | "enhance"
  | "face-enhance"
  | "object-remove";

export type DeviceTier = "LOW" | "MEDIUM" | "HIGH" | "ULTRA";

export type ExecutionProvider = "webgpu" | "webgl" | "wasm" | "cpu";

export type ImageAIProgressStage =
  | "preparing"
  | "checking_cache"
  | "downloading_model"
  | "loading_model"
  | "initializing"
  | "preprocessing"
  | "inference"
  | "postprocessing"
  | "encoding"
  | "verifying"
  | "completed"
  | "failed";

export interface ImageAIProgressEvent {
  taskId: string;
  taskType: ImageAITaskType;
  stage: ImageAIProgressStage;
  progress: number; // 0.0 to 1.0
  message: string;
  stageTimeMs?: number;
  totalTimeMs?: number;
  downloadBytes?: number;
  totalBytes?: number;
  speedMBps?: number;
  etaSeconds?: number;
}

export interface ImageCapabilityProfile {
  deviceTier: DeviceTier;
  estimatedRamMB: number;
  cpuCores: number;
  hasWebGPU: boolean;
  hasWebGL: boolean;
  hasWebGL2: boolean;
  hasWasmSIMD: boolean;
  hasWasmThreads: boolean;
  isAndroid: boolean;
  isWebView: boolean;
  browserName: string;
  maxDimension: number;
  optimalTileSize: number;
  preferredProvider: ExecutionProvider;
  supportedProviders: ExecutionProvider[];
  concurrencyLimit: number;
  supportsWorkers: boolean;
}

export interface ModelManifest {
  id: string;
  name: string;
  task: ImageAITaskType;
  version: string;
  sizeBytes: number;
  sha256?: string;
  urls: string[];
  localPath?: string;
  inputShape?: number[];
  outputShape?: number[];
  mean?: number[];
  std?: number[];
  framework: "mediapipe" | "onnx" | "tflite" | "native";
  minTier: DeviceTier;
}

export interface FaceDetectionBox {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  width: number; // Normalized 0-1
  height: number; // Normalized 0-1
  confidence: number;
  landmarks?: Array<{ x: number; y: number; z?: number }>;
}

export interface FaceDetectionResult {
  facesFound: number;
  boxes: FaceDetectionBox[];
  imageWidth: number;
  imageHeight: number;
}

export interface ImageAIOptions {
  scaleFactor?: 2 | 4;
  quality?: number; // 0.1 to 1.0 (default 0.95)
  format?: "image/png" | "image/jpeg" | "image/webp";
  edgeRefinement?: boolean;
  featherRadius?: number;
  enhanceFaceLevel?: number; // 0.0 to 1.0
  denoiseIntensity?: number; // 0.0 to 1.0
  contrastBoost?: number; // 0.0 to 1.0
  detailSharpen?: number; // 0.0 to 1.0
  signal?: AbortSignal;
  onProgress?: (progress: ImageAIProgressEvent) => void;
  preferWorker?: boolean;
  forceProvider?: ExecutionProvider;
  maskDataUrl?: string;
  brushRadius?: number;
}

export interface ImageAIResult {
  success: boolean;
  outputDataUrl: string;
  outputBlob?: Blob;
  mimeType: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  taskType: ImageAITaskType;
  engineName: string;
  executionProvider: ExecutionProvider;
  executionTimeMs: number;
  timings: {
    modelLoadMs: number;
    preprocessMs: number;
    inferenceMs: number;
    postprocessMs: number;
    totalMs: number;
  };
  metrics: {
    deviceTier: DeviceTier;
    isLocal: boolean;
    hasAlphaChannel: boolean;
    transparentPixels?: number;
    scaleFactor?: number;
    facesDetected?: number;
    tilesProcessed?: number;
  };
  error?: string;
}

export interface ImageWorkerRequest {
  id: string;
  taskType: ImageAITaskType;
  imageDataUrl: string;
  maskDataUrl?: string;
  options?: ImageAIOptions;
  capability?: ImageCapabilityProfile;
}

export interface ImageWorkerResponse {
  id: string;
  type: "progress" | "result" | "error";
  progress?: ImageAIProgressEvent;
  result?: ImageAIResult;
  error?: string;
}
