import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";

export class GeminiProvider extends RemoteProvider {
  public id = "gemini";
  public name = "Google Gemini AI";
  public supportedTasks: AITaskType[] = ["translation"];

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(taskType: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    if (!this.supportsTask(taskType)) return false;
    return Boolean(this.getApiKey());
  }

  private getApiKey(): string | undefined {
    const key =
      this.keyManager.getKey("gemini") ||
      this.keyManager.getKey("google") ||
      (typeof process !== "undefined" && process.env ? process.env.GEMINI_API_KEY : undefined);
    return key && key.trim().length > 0 ? key.trim() : undefined;
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "PROVIDER_NOT_CONFIGURED",
          "Gemini API key is not configured in KeyManager",
          this.id
        ),
      };
    }

    if (!this.checkNetwork()) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("NETWORK_OFFLINE", "Gemini provider requires internet connection", this.id),
      };
    }

    if (taskType !== "translation") {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("TASK_NOT_SUPPORTED", `Task ${taskType} is not supported by GeminiProvider`, this.id),
      };
    }

    try {
      const text = typeof payload === "string" ? payload : (payload as any)?.text || "";
      const targetLang = (payload as any)?.targetLang || options?.language || "ar";

      if (!text || !String(text).trim()) {
        return {
          success: false,
          providerUsed: this.id,
          error: createAIError("INVALID_PAYLOAD", "Text is required for translation", this.id),
        };
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Translate the following text to ${targetLang}. Return ONLY the translation, without explanation or quotes:\n\n${text}`,
                  },
                ],
              },
            ],
          }),
          signal: options?.signal,
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          providerUsed: this.id,
          error: createAIError(
            "GEMINI_API_ERROR",
            `Gemini API returned HTTP ${res.status}: ${errText || res.statusText}`,
            this.id
          ),
        };
      }

      const json = await res.json();
      const translatedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!translatedText) {
        return {
          success: false,
          providerUsed: this.id,
          error: createAIError("GEMINI_EMPTY_RESPONSE", "Gemini returned an empty translation response", this.id),
        };
      }

      return {
        success: true,
        data: { translatedText, targetLang } as unknown as TResult,
        providerUsed: this.id,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("GEMINI_EXECUTION_ERROR", err?.message || "Gemini execution failed", this.id, err),
      };
    }
  }
}

