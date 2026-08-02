import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, AudioIsolationPayload, AudioIsolationResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class AudioIsolationTask extends BaseTask<AudioIsolationPayload, AudioIsolationResult> {
  public taskType: AITaskType = "vocal-isolation";

  public async execute(
    payload: AudioIsolationPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<AudioIsolationResult>> {
    const candidateTasks: AITaskType[] = [
      payload.mode === "remove-noise"
        ? "noise-reduction"
        : payload.mode === "remove-music"
        ? "music-removal"
        : "vocal-isolation",
    ];

    for (const tType of candidateTasks) {
      const match = providers.find((p) => p.supportsTask(tType));
      if (match) {
        return match.execute<AudioIsolationPayload, AudioIsolationResult>(tType, payload, options);
      }
    }

    return {
      success: false,
      error: createAIError("NO_PROVIDER", "No provider available for audio isolation / noise reduction"),
    };
  }
}
