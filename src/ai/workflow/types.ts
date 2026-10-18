import { AIJobOptions } from "../runtime/types";
import { AIResponse } from "../types/ai";

export type WorkflowStepStatus = "pending" | "running" | "completed" | "failed" | "paused" | "skipped";
export type WorkflowRunStatus = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type WorkflowType = "image" | "video" | "audio" | "custom";

export interface WorkflowStepConfig {
  id: string;
  name: string;
  pluginId: string;
  actionName: string;
  params?: Record<string, any>;
  inputMapper?: (prevResult: any, initialInput: any) => any;
  outputMapper?: (stepResult: any) => any;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  type: WorkflowType;
  description: string;
  steps: WorkflowStepConfig[];
}

export interface WorkflowStepState {
  stepId: string;
  stepName: string;
  status: WorkflowStepStatus;
  executionTimeMs?: number;
  output?: any;
  error?: string;
}

export interface WorkflowRunProgress {
  workflowId: string;
  workflowName: string;
  runId: string;
  status: WorkflowRunStatus;
  currentStepIndex: number;
  totalSteps: number;
  currentStepName: string;
  stepStates: Record<string, WorkflowStepState>;
  stepOutputs: Record<string, any>;
  finalResult?: any;
  error?: string;
}

export interface WorkflowRunOptions extends AIJobOptions {
  runId?: string;
  startStepIndex?: number;
  initialInput?: any;
}

export interface AIWorkflowEngineResponse<T = any> extends AIResponse<T> {
  workflowRunId?: string;
  stepsSummary?: Array<{
    stepId: string;
    stepName: string;
    success: boolean;
    timeMs?: number;
  }>;
}
