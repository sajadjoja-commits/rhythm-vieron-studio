import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, ImageGenerationPayload, ImageGenerationResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class ImageGenerationTask extends BaseTask<ImageGenerationPayload, ImageGenerationResult> {
  public taskType: AITaskType = "image-generation";

  public async execute(
    payload: ImageGenerationPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<ImageGenerationResult>> {
    return this.executeWithFallback(payload, providers, options);
  }
}
