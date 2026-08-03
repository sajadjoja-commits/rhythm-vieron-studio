import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, EnhanceMediaPayload, EnhanceMediaResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class EnhanceMediaTask extends BaseTask<EnhanceMediaPayload, EnhanceMediaResult> {
  public taskType: AITaskType = "enhance-media";

  public async execute(
    payload: EnhanceMediaPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<EnhanceMediaResult>> {
    const provider = this.selectProvider(providers, options);
    if (!provider) {
      return {
        success: false,
        error: createAIError("NO_PROVIDER", "No provider available for media enhancement"),
      };
    }

    return provider.execute<EnhanceMediaPayload, EnhanceMediaResult>(this.taskType, payload, options);
  }
}
