import { AITaskType, AITaskOptions, AIResponse } from "../types/ai";
import { AIProvider } from "../types/provider";
import { createAIError } from "../utils/errorUtils";

export abstract class BaseTask<TPayload = any, TResult = any> {
  public abstract taskType: AITaskType;

  /**
   * Selects candidate providers sorted by preference / execution mode
   */
  public selectCandidateProviders(
    providers: AIProvider[],
    options?: AITaskOptions,
    payload?: TPayload
  ): AIProvider[] {
    const mode = options?.executionMode || "auto";
    const preferredId = options?.preferredProvider?.toLowerCase();

    const candidates = providers.filter((p) => {
      if (p.supportsTask ? !p.supportsTask(this.taskType) : !p.supportedTasks?.includes(this.taskType)) return false;
      if (payload && typeof p.isAvailable === "function") {
        try {
          const avail = p.isAvailable(this.taskType, payload);
          if (avail === false) return false;
        } catch {
          return false;
        }
      }
      return true;
    });

    if (preferredId) {
      candidates.sort((a, b) => (a.id.toLowerCase() === preferredId ? -1 : b.id.toLowerCase() === preferredId ? 1 : 0));
    } else if (mode === "local") {
      candidates.sort((a, b) => (a.type === "local" ? -1 : b.type === "local" ? 1 : 0));
    } else if (mode === "remote" || mode === "cloud") {
      candidates.sort((a, b) => (a.type === "remote" ? -1 : b.type === "remote" ? 1 : 0));
    } else if (mode === "auto") {
      // In auto mode, prioritize fast local neural models for low latency and zero external dependency
      candidates.sort((a, b) => (a.type === "local" ? -1 : b.type === "local" ? 1 : 0));
    }

    return candidates;
  }

  /**
   * Selects best available provider based on executionMode and availability
   */
  public selectProvider(
    providers: AIProvider[],
    options?: AITaskOptions,
    payload?: TPayload
  ): AIProvider | null {
    const candidates = this.selectCandidateProviders(providers, options, payload);
    for (const p of candidates) {
      if (typeof p.isAvailable === "function") {
        if (p.isAvailable(this.taskType, payload)) return p;
      } else {
        return p;
      }
    }
    return candidates[0] || null;
  }

  /**
   * Executes task with automatic provider fallback
   */
  public async executeWithFallback(
    payload: TPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const candidates = this.selectCandidateProviders(providers, options, payload);
    if (candidates.length === 0) {
      return {
        success: false,
        error: createAIError("NO_PROVIDER", `No provider registered supporting task "${this.taskType}"`),
      };
    }

    let lastError: any = null;

    for (const provider of candidates) {
      try {
        const available = await provider.isAvailable(this.taskType, payload);
        if (available) {
          console.log(`[BaseTask] Executing task "${this.taskType}" via provider "${provider.name}" (${provider.id})...`);
          const response = await provider.execute<TPayload, TResult>(this.taskType, payload, options);
          if (response.success && response.data) {
            return response;
          }
          lastError = response.error;
          console.warn(`[BaseTask] Provider "${provider.id}" failed for task "${this.taskType}". Trying next candidate...`, response.error);
        }
      } catch (err) {
        lastError = err;
        console.warn(`[BaseTask] Provider "${provider.id}" threw exception for task "${this.taskType}":`, err);
      }
    }

    return {
      success: false,
      error: lastError || createAIError("ALL_PROVIDERS_FAILED", `All available providers failed for task "${this.taskType}"`),
    };
  }

  public abstract execute(
    payload: TPayload,
    providers: AIProvider[],
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>>;
}
