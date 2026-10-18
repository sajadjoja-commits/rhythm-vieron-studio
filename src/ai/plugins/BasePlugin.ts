import { AIPlugin } from "./types";
import { AICapability, AIJobOptions } from "../runtime/types";
import { AIResponse } from "../types/ai";
import { createAIError, formatAIException } from "../utils/errorUtils";

export abstract class BasePlugin implements AIPlugin {
  public abstract id: string;
  public abstract name: string;
  public abstract version: string;
  public abstract description: string;
  public abstract capabilities: AICapability[];

  public isInitialized: boolean = false;

  public async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  public abstract execute<TPayload = any, TResult = any>(
    actionName: string,
    payload: TPayload,
    options?: AIJobOptions
  ): Promise<AIResponse<TResult>>;

  public async releaseResources(): Promise<void> {
    // Base cleanup implementation
  }

  protected createError(code: string, message: string, details?: any) {
    return createAIError(code, message, this.id, details);
  }

  protected formatException(err: any) {
    return formatAIException(err, this.id);
  }
}
