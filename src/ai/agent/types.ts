import { AITaskType, AIResponse } from "../types/ai";
import { JobPriority } from "../runtime/types";
import { AICapabilityRegistry } from "../runtime/AICapabilityRegistry";
import { AIPluginRegistry } from "../plugins";

export type AgentIntentType =
  | "product-photo-enhancer"
  | "podcast-cleaner"
  | "short-video-enhancer"
  | "bg-remove-upscale"
  | "bg-remove-enhance"
  | "auto-captioning"
  | "custom-workflow"
  | "unknown";

export interface AgentRequestOptions {
  preferLocal?: boolean;
  enableCache?: boolean;
  priority?: JobPriority;
  upscaleFactor?: 2 | 4;
  denoiseIntensity?: number;
  targetFps?: 30 | 60 | 120;
  targetLanguage?: string;
  executionMode?: "local" | "remote" | "auto" | "cloud";
  [key: string]: any;
}

export interface AgentRequest {
  userPrompt?: string;
  intent?: AgentIntentType | string;
  inputMediaUrlOrBase64?: string;
  mediaType?: "image" | "video" | "audio" | "text";
  options?: AgentRequestOptions;
}

export interface ExecutionStep {
  id: string;
  name: string;
  taskType: AITaskType;
  pluginId: string;
  actionName: string;
  dependsOn?: string[]; // IDs of predecessor steps that must finish first
  payloadTemplate?: Record<string, any>;
  executionMode?: "local" | "remote" | "auto" | "cloud";
  outputField?: string; // Property name in result containing the media output
  inputPipeFromStepId?: string; // Step ID from which to pipe media output
}

export interface ExecutionPlan {
  planId: string;
  intentName: string;
  description: string;
  userPrompt?: string;
  steps: ExecutionStep[];
  estimatedDurationMs: number;
  createdAt: number;
}

export interface AgentStepResult {
  stepId: string;
  taskType: AITaskType;
  pluginId: string;
  actionName: string;
  success: boolean;
  cached?: boolean;
  resultData?: any;
  outputMediaUrlOrBase64?: string;
  error?: string;
  executionTimeMs: number;
}

export interface AgentWorkflowResult {
  workflowId: string;
  plan: ExecutionPlan;
  success: boolean;
  finalOutput?: any;
  finalMediaUrlOrBase64?: string;
  stepResults: Record<string, AgentStepResult>;
  totalExecutionTimeMs: number;
  error?: string;
}

export interface PrebuiltWorkflowTemplate {
  intentId: AgentIntentType;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  mediaType: "image" | "video" | "audio";
  steps: ExecutionStep[];
  estimatedDurationMs: number;
}

export interface ILLMPlanner {
  name: string;
  generatePlan(
    request: AgentRequest,
    capabilityRegistry: AICapabilityRegistry,
    pluginRegistry: AIPluginRegistry
  ): Promise<ExecutionPlan>;
}
