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
    const audioBase64 =
      payload?.audioBase64 ||
      (payload as any)?.audioBase64OrUrl ||
      (payload as any)?.mediaUrlOrBase64 ||
      "";

    if (!payload || typeof audioBase64 !== "string" || !audioBase64.trim()) {
      return {
        success: false,
        error: createAIError("INVALID_PAYLOAD", "audioBase64 string is required for speech-to-text"),
      };
    }

    const normalizedPayload: SpeechToTextPayload = {
      ...payload,
      audioBase64: audioBase64.trim(),
    };

    return this.executeWithFallback(normalizedPayload, providers, options);
  }
}
