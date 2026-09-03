import { AITaskType, ExecutionMode, AIError } from "../types/ai";

export type MediaDomain = "audio" | "video" | "image" | "text" | "multimodal";

export type JobStatus =
  | "idle"
  | "queued"
  | "downloading-model"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type JobPriority = "low" | "normal" | "high" | "urgent";

export interface AICapability {
  id: string;
  name: string;
  taskType: AITaskType;
  domain: MediaDomain;
  executionMode: ExecutionMode;
  providerId: string;
  supportedInputFormats: string[];
  supportedOutputFormats: string[];
  requiresWebGPU?: boolean;
  requiresWASM?: boolean;
  estimatedVRAMMB?: number;
  estimatedRAMMB?: number;
  webSupported: boolean;
  androidSupported: boolean;
  description?: string;
}

export interface AIJobProgress {
  jobId: string;
  taskId?: string;
  percentage: number;
  currentStage: string;
  estimatedTimeRemainingMs?: number;
  status: JobStatus;
  error?: AIError;
}

export interface AIJobOptions {
  priority?: JobPriority;
  jobId?: string;
  signal?: AbortSignal;
  abortSignal?: AbortSignal;
  executionMode?: ExecutionMode;
  preferredProviderId?: string;
  enableCache?: boolean;
  timeoutMs?: number;
  onProgress?: (progress: AIJobProgress) => void;
}

export interface AIJobRecord<TPayload = any, TResult = any> {
  id: string;
  taskType: AITaskType;
  capabilityId?: string;
  status: JobStatus;
  priority: JobPriority;
  payload: TPayload;
  result?: TResult;
  error?: AIError;
  progress: AIJobProgress;
  providerUsed?: string;
  executionMode?: ExecutionMode;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  abortController: AbortController;
}

export interface AIHistoryRecord {
  id: string;
  taskType: AITaskType;
  providerUsed: string;
  timestamp: number;
  durationMs: number;
  inputHash: string;
  payloadSummary?: string;
  resultSummary?: string;
  resultData?: any;
  success: boolean;
}

export interface ModelDownloadInfo {
  modelId: string;
  name: string;
  url?: string;
  sizeBytes?: number;
  downloadedBytes?: number;
  percentage?: number;
  status: "idle" | "downloading" | "verified" | "error";
  error?: string;
}

export interface DeviceResourceProfile {
  hasWebGPU: boolean;
  hasWebGL: boolean;
  hasWASM: boolean;
  deviceMemoryGB?: number;
  availableRAMMB?: number;
  hardwareConcurrency: number;
  isAndroid: boolean;
  isIOS: boolean;
  recommendedMode: ExecutionMode;
}
