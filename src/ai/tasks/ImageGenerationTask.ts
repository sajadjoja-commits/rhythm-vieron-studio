import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, ImageGenerationPayload, ImageGenerationResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";
import { hasArabicCharacters, optimizePrompt } from "../utils/promptOptimizer";

export class ImageGenerationTask extends BaseTask<ImageGenerationPayload, ImageGenerationResult> {
  public taskType: AITaskType = "image-generation";

  public async execute(
    payload: ImageGenerationPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<ImageGenerationResult>> {
    let effectivePayload = payload;

    // If prompt contains Arabic characters, translate to English and apply quality enhancers
    if (payload.prompt && hasArabicCharacters(payload.prompt)) {
      try {
        const optimized = await optimizePrompt(payload.prompt, payload.style);
        effectivePayload = {
          ...payload,
          prompt: optimized.finalPrompt,
          rawPrompt: payload.rawPrompt || payload.prompt,
        };
      } catch (err) {
        console.warn("[ImageGenerationTask] Auto-optimization fallback failed:", err);
      }
    }

    return this.executeWithFallback(effectivePayload, providers, options);
  }
}

