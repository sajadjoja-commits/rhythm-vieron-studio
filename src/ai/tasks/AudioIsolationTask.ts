import { BaseTask } from "./BaseTask";
import { AITaskType, AITaskOptions, AIResponse, AudioIsolationPayload, AudioIsolationResult } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export class AudioIsolationTask extends BaseTask<AudioIsolationPayload, AudioIsolationResult> {
  public taskType: AITaskType;
  private readonly defaultTaskType: AITaskType;

  constructor(defaultTaskType: AITaskType = "vocal-isolation") {
    super();
    this.defaultTaskType = defaultTaskType;
    this.taskType = defaultTaskType;
  }

  public async execute(
    payload: AudioIsolationPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<AudioIsolationResult>> {
    const activeTaskType: AITaskType =
      payload?.mode === "remove-noise"
        ? "noise-reduction"
        : payload?.mode === "remove-music"
        ? "music-removal"
        : payload?.mode === "isolate-vocals"
        ? "vocal-isolation"
        : this.defaultTaskType;

    this.taskType = activeTaskType;

    const mode = options?.executionMode;
    const eligibleProviders =
      mode === "remote" || mode === "cloud"
        ? providers.filter((p) => p.type === "remote")
        : mode === "local"
        ? providers.filter((p) => p.type === "local")
        : providers;

    if (eligibleProviders.length === 0) {
      return {
        success: false,
        error: createAIError(
          "NO_PROVIDER",
          `No ${mode || "eligible"} provider registered supporting audio task "${activeTaskType}"`
        ),
      };
    }

    return this.executeWithFallback(payload, eligibleProviders, options);
  }
}
