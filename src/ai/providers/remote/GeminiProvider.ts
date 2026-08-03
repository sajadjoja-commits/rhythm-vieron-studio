import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";

export class GeminiProvider extends RemoteProvider {
  public id = "gemini";
  public name = "Google Gemini AI";
  public supportedTasks: AITaskType[] = [
    "translation",
    "image-generation",
    "background-removal",
    "enhance-media",
    "custom",
  ];

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(taskType: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    if (!this.supportsTask(taskType)) return false;
    const key = this.keyManager.getKey("gemini");
    return Boolean(key && key.trim().length > 0);
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();

    if (!this.checkNetwork()) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("NETWORK_OFFLINE", "Gemini provider requires internet connection", this.id),
      };
    }

    // Extensible Gemini tasks provider handler
    return {
      success: false,
      providerUsed: this.id,
      error: createAIError(
        "GEMINI_STUB",
        `Gemini task ${taskType} provider is registered and ready for API key setup`,
        this.id
      ),
    };
  }
}
