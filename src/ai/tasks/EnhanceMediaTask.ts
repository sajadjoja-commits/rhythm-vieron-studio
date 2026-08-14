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
    return this.executeWithFallback(payload, providers, options);
  }
}
