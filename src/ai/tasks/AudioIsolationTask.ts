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
    const activeTaskType: AITaskType =
      payload.mode === "remove-noise"
        ? "noise-reduction"
        : payload.mode === "remove-music"
        ? "music-removal"
        : "vocal-isolation";

    this.taskType = activeTaskType;
    return this.executeWithFallback(payload, providers, options);
  }
}
