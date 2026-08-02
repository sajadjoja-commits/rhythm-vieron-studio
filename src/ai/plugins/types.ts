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
}

// ---------------- Audio Enhancement & Demucs Types ----------------

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
