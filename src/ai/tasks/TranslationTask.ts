import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, TranslationPayload, TranslationResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class TranslationTask extends BaseTask<TranslationPayload, TranslationResult> {
  public taskType: AITaskType = "translation";

  public async execute(
    payload: TranslationPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<TranslationResult>> {
    const provider = this.selectProvider(providers, options);
    if (!provider) {
      return {
        success: false,
        error: createAIError("NO_PROVIDER", "No provider available for translation"),
      };
    }

    return provider.execute<TranslationPayload, TranslationResult>(this.taskType, payload, options);
  }
}
