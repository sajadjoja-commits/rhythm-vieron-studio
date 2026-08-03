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
    const provider = this.selectProvider(providers, options);
    if (!provider) {
      return {
        success: false,
        error: createAIError("NO_PROVIDER", "No provider available for image generation"),
      };
    }

    return provider.execute<ImageGenerationPayload, ImageGenerationResult>(this.taskType, payload, options);
  }
}
