import { AIProvider, ProviderType } from "../types/provider";
import { AITaskType, AITaskOptions, AIResponse } from "../types/ai";

export abstract class BaseProvider implements AIProvider {
  public abstract id: string;
  public abstract name: string;
  public abstract type: ProviderType;
  public abstract supportedTasks: AITaskType[];

  public abstract isAvailable(taskType: AITaskType, payload?: any): Promise<boolean> | boolean;

  public abstract execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>>;

  public supportsTask(taskType: AITaskType): boolean {
    return this.supportedTasks.includes(taskType);
  }
}
