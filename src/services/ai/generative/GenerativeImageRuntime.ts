/**
 * Phase 10.1: Generative Image Runtime Abstraction
 * 
 * Strict Enforcement:
 * - NO fake outpainting, stretching, mirroring, or edge repetition.
 * - Throws GENERATIVE_EXPAND_NOT_AVAILABLE.
 * - Architecture cleanly prepared for Phase 11 Real Generative Outpainting.
 */

import { GenerativeImageRuntime, CanvasExpansion, GenerativeExpandOptions, GeneratedImageResult } from "./types";
import { AIError } from "../types";

export class UnimplementedGenerativeRuntime implements GenerativeImageRuntime {
  public readonly id = "generative-outpainting-runtime";
  public readonly name = "Generative Image Outpainting Runtime";

  public async isAvailable(): Promise<boolean> {
    return false;
  }

  public async loadModel(modelId: string): Promise<void> {
    throw new AIError(
      "AI_UNSUPPORTED_OPERATION",
      `GENERATIVE_EXPAND_NOT_AVAILABLE: Model ${modelId} cannot be loaded. Phase 11 is required for real generative outpainting models.`
    );
  }

  public async expandImage(
    image: string | Blob | File | HTMLImageElement | HTMLCanvasElement,
    canvas: CanvasExpansion,
    mask?: string | Blob | ImageData,
    options?: GenerativeExpandOptions
  ): Promise<GeneratedImageResult> {
    throw new AIError(
      "AI_UNSUPPORTED_OPERATION",
      "GENERATIVE_EXPAND_NOT_AVAILABLE: Vieron Studio strictly forbids fake algorithmic outpainting (stretching, mirroring, or edge repetition). Real localized generative outpainting will be introduced in Phase 11."
    );
  }

  public async unloadModel(): Promise<void> {
    // No-op
  }
}

export const generativeImageRuntime: GenerativeImageRuntime = new UnimplementedGenerativeRuntime();
