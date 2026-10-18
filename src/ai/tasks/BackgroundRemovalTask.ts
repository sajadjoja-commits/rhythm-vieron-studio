import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, BackgroundRemovalPayload, BackgroundRemovalResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class BackgroundRemovalTask extends BaseTask<BackgroundRemovalPayload, BackgroundRemovalResult> {
  public taskType: AITaskType = "background-removal";

  public async execute(
    payload: BackgroundRemovalPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<BackgroundRemovalResult>> {
    return this.executeWithFallback(payload, providers, options);
  }
}
