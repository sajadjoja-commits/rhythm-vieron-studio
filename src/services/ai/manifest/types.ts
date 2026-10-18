/**
 * Phase 10.1: Model Manifest System Types (Reality Audited)
 * 
 * Strict integrity:
 * - Separates real pretrained neural models from algorithmic/classical filters.
 * - Separates official Model Catalogue from device Installed Model State.
 */

export type ModelTask = "upscale" | "stt" | "segmentation" | "vision" | "audio" | "generative_expand";
export type ModelFormat = "onnx" | "ggml" | "tflite" | "native" | "algorithmic";
export type ModelRuntimeType = "onnx" | "whisper.cpp" | "mlkit" | "webgl" | "algorithmic" | "none";
export type ModelPlatform = "android" | "web" | "all";
export type ModelAccelerator = "NNAPI" | "GPU" | "CPU" | "WebGPU" | "WASM" | "NONE";

export type ModelPackStatus =
  | "missing"
  | "downloading"
  | "verifying"
  | "installed"
  | "corrupt"
  | "incompatible"
  | "failed"
  | "cancelled"
  | "unverified"
  | "algorithmic"
  | "not_available";

export interface ModelManifest {
  id: string;
  name: string;
  version: string;
  format: ModelFormat;
  task: ModelTask;
  sizeBytes: number;
  sha256: string; // Real verified SHA-256, or empty string "" if unverified
  downloadUrl: string;
  license: string;
  sourceUrl: string;
  runtime: ModelRuntimeType;
  minRamMB: number;
  recommendedRamMB: number;
  supportedPlatforms: ModelPlatform[];
  accelerators: ModelAccelerator[];
  offlineDefault: boolean;
  description: string;
  // Reality Audit Attributes
  isPretrainedAIModel: boolean;
  engineType: "neural_weights" | "native_framework" | "algorithmic_filter" | "none";
}

export interface InstalledModel {
  id: string;
  version: string;
  path: string;
  installedAt: number;
  verifiedAt?: number;
  sha256: string;
  sizeBytes: number;
  status: ModelPackStatus;
  localUri?: string;
  metadata?: Record<string, any>;
  isPretrainedAIModel: boolean;
  realInference: boolean;
}

export interface ModelVerificationResult {
  isValid: boolean;
  expectedSha256: string;
  computedSha256: string;
  error?: string;
  errorCode?: "MODEL_CHECKSUM_MISMATCH" | "MODEL_NOT_FOUND" | "CORRUPT_MODEL" | "NON_NEURAL_ALGORITHMIC";
}

export interface ModelDownloadProgress {
  modelId: string;
  status: ModelPackStatus;
  receivedBytes: number;
  totalBytes: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  stage: "downloading" | "verifying" | "installed" | "failed";
}
