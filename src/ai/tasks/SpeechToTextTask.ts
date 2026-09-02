import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, SpeechToTextPayload, SpeechToTextResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class SpeechToTextTask extends BaseTask<SpeechToTextPayload, SpeechToTextResult> {
  public taskType: AITaskType = "speech-to-text";

  public async execute(
    payload: SpeechToTextPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<SpeechToTextResult>> {
    if (!payload || !payload.audioBase64) {
      return {
        success: false,
        error: createAIError("INVALID_PAYLOAD", "audioBase64 string is required for speech-to-text"),
      };
    }

    const availableProviders = providers.filter((p) => p.supportsTask(this.taskType));

    // Try providers in priority order (e.g. Groq -> SupabaseEdge -> Local)
    for (const provider of availableProviders) {
      const isReady = await provider.isAvailable(this.taskType);
      if (isReady) {
        console.log(`[AIManager] Executing task "${this.taskType}" via provider "${provider.name}" (${provider.id})...`);
        const response = await provider.execute<SpeechToTextPayload, SpeechToTextResult>(this.taskType, payload, options);
        if (response.success && response.data) {
          return response;
        }
        console.warn(`[AIManager] Provider "${provider.id}" failed for "${this.taskType}". Trying fallback provider...`, response.error);
      }
    }

    return {
      success: false,
      error: createAIError(
        "NO_PROVIDER_AVAILABLE",
        "All speech recognition providers failed or are unavailable. Please verify network or API keys."
      ),
    };
  }
}
