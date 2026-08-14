import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, EnhanceMediaPayload, EnhanceMediaResult } from "../types/ai";
import { AIProvider } from "../types/provider";

export class ImageUpscaleTask extends BaseTask<EnhanceMediaPayload, EnhanceMediaResult> {
  public taskType: AITaskType = "image-upscale";

  public async execute(
    payload: EnhanceMediaPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<EnhanceMediaResult>> {
    return this.executeWithFallback(payload, providers, options);
  }
}
