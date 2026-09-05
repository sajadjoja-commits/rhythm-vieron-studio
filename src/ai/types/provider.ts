import { AITaskType, AITaskOptions, AIResponse } from "./ai";

export type ProviderType = "remote" | "local" | "hybrid";

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  supportedTasks: AITaskType[];
  
  /**
   * Checks if provider is configured and available (e.g., API key present, or local model ready for payload's mediaType)
   */
  isAvailable(taskType: AITaskType, payload?: any): Promise<boolean> | boolean;

  /**
   * Executes a given AI task
   */
  execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>>;
}
