import { AITaskType, AITaskOptions, AIResponse } from "../types/ai";
import { AIProvider } from "../types/provider";

export abstract class BaseTask<TPayload = any, TResult = any> {
  public abstract taskType: AITaskType;

  /**
   * Selects best available provider based on executionMode and availability
   */
  public selectProvider(
    providers: AIProvider[],
    options?: AITaskOptions
  ): AIProvider | null {
    const mode = options?.executionMode || "auto";
    const preferredId = options?.preferredProvider?.toLowerCase();

    // 1. If preferred provider specified and supports task and is available
    if (preferredId) {
      const match = providers.find((p) => p.id.toLowerCase() === preferredId && p.supportsTask(this.taskType));
      if (match) return match;
    }

    // 2. Filter by mode
    let candidates = providers.filter((p) => p.supportsTask(this.taskType));

    if (mode === "remote" || mode === "cloud") {
      candidates = candidates.filter((p) => p.type === "remote");
    } else if (mode === "local") {
      candidates = candidates.filter((p) => p.type === "local");
    }

    // Return first available provider
    for (const p of candidates) {
      if (typeof p.isAvailable === "function") {
        const available = p.isAvailable(this.taskType);
        if (typeof available === "boolean" && available) return p;
      } else {
        return p;
      }
    }

    // Fallback: return any candidate if available
    return candidates[0] || null;
  }

  public abstract execute(
    payload: TPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>>;
}
