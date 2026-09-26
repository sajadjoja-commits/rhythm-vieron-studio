/**
 * Phase 10: Model Manifest System Types
 * 
 * Separates the official Model Catalogue (immutable specifications & metadata)
 * from the Installed Model State (device-local installation, verified hash, path).
 */

export type ModelTask = "upscale" | "stt" | "segmentation" | "vision" | "audio";
export type ModelFormat = "onnx" | "ggml" | "tflite" | "native";
export type ModelRuntimeType = "onnx" | "whisper.cpp" | "mlkit" | "webgl";
export type ModelPlatform = "android" | "web" | "all";
export type ModelAccelerator = "NNAPI" | "GPU" | "CPU" | "WebGPU" | "WASM";

export type ModelPackStatus =
  | "missing"
  | "downloading"
  | "verifying"
  | "installed"
  | "corrupt"
  | "incompatible"
  | "failed"
  | "cancelled"
  | "unverified";

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
}

export interface ModelVerificationResult {
  isValid: boolean;
  expectedSha256: string;
  computedSha256: string;
  error?: string;
  errorCode?: "MODEL_CHECKSUM_MISMATCH" | "MODEL_NOT_FOUND" | "CORRUPT_MODEL";
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
