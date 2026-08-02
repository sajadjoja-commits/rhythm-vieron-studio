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
    const provider = this.selectProvider(providers, options);
    if (!provider) {
      return {
        success: false,
        error: createAIError("NO_PROVIDER", "No provider available for background removal"),
      };
    }

    return provider.execute<BackgroundRemovalPayload, BackgroundRemovalResult>(this.taskType, payload, options);
  }
}
