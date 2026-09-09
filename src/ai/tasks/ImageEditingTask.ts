import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, ImageGenerationPayload, ImageGenerationResult } from "../types/ai";
import { AIProvider } from "../types/provider";

export class ImageEditingTask extends BaseTask<ImageGenerationPayload, ImageGenerationResult> {
  public taskType: AITaskType = "image-editing";

  public async execute(
    payload: ImageGenerationPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<ImageGenerationResult>> {
    return this.executeWithFallback(payload, providers, options);
  }
}
