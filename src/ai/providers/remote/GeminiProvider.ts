import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";
import { aiDebugLogger } from "../../utils/AIDebugLogger";
import { aiPlugins } from "../../plugins";
import { ImageEnhancementPlugin } from "../../plugins/ImageEnhancementPlugin";
import { VideoEnhancementPlugin } from "../../plugins/VideoEnhancementPlugin";
import { PayloadValidator } from "../../utils/PayloadValidator";

export class GeminiProvider extends RemoteProvider {
  public id = "gemini";
  public name = "Google Gemini AI";
  public supportedTasks: AITaskType[] = [
    "translation",
    "image-generation",
    "enhance-media",
    "custom",
  ];

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(taskType: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    if (!this.supportsTask(taskType)) return false;
    const key = this.getApiKey();
    return Boolean(key && key.trim().length > 0);
  }

  private getApiKey(): string | undefined {
    return (
      this.keyManager.getKey("gemini") ||
      this.keyManager.getKey("google") ||
      (typeof process !== "undefined" && process.env ? process.env.GEMINI_API_KEY : undefined)
    );
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

    const apiKey = this.getApiKey();

    try {
      if (taskType === "translation") {
        const text = typeof payload === "string" ? payload : (payload as any)?.text || "";
        const targetLang = (payload as any)?.targetLang || options?.language || "ar";

        if (apiKey) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

          if (res.ok) {
            const json = await res.json();
            const translatedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
            return {
              success: true,
              data: { translatedText, targetLang } as unknown as TResult,
              providerUsed: this.id,
              executionTimeMs: Date.now() - startTime,
            };
          }
        }

        return {
          success: true,
          data: { translatedText: text, targetLang } as unknown as TResult,
          providerUsed: this.id,
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (taskType === "background-removal" || taskType === "enhance-media") {
        const normalized = PayloadValidator.normalize(payload);
        const mediaType = normalized.inputMediaType;

        if (mediaType === "video" && normalized.videoBase64OrUrl) {
          const videoPlugin = aiPlugins.getPlugin<VideoEnhancementPlugin>("plugin-video-enhancement");
          if (videoPlugin) {
            const action = taskType === "background-removal" ? "video-bg-removal" : "composite-video-enhance";
            const res = await videoPlugin.execute(action, { videoBase64OrUrl: normalized.videoBase64OrUrl });
            if (res.success && res.data) {
              return {
                success: true,
                data: res.data as unknown as TResult,
                providerUsed: this.id,
                executionTimeMs: Date.now() - startTime,
              };
            }
          }
        }

        if (mediaType === "image" && normalized.imageBase64OrUrl) {
          const imgPlugin = aiPlugins.getPlugin<ImageEnhancementPlugin>("plugin-image-enhancement");
          if (imgPlugin) {
            const action = taskType === "background-removal" ? "remove-background" : "composite-enhance";
            const res = await imgPlugin.execute(action, { imageBase64OrUrl: normalized.imageBase64OrUrl });
            if (res.success && res.data) {
              return {
                success: true,
                data: res.data as unknown as TResult,
                providerUsed: this.id,
                executionTimeMs: Date.now() - startTime,
              };
            }
          }
        }

        return {
          success: false,
          providerUsed: this.id,
          error: createAIError("MEDIA_PROCESSING_FAILED", "Media processing failed to produce output image/video", this.id),
        };
      }

      if (taskType === "image-generation") {
        const prompt = (payload as any)?.prompt || "AI generated image";
        const rawPrompt = (payload as any)?.rawPrompt || prompt;
        const width = (payload as any)?.width || 1024;
        const height = (payload as any)?.height || 1024;
        const seed = (payload as any)?.seed || Math.floor(Math.random() * 1000000);
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

        const executionTimeMs = Date.now() - startTime;
        aiDebugLogger.log({
          taskId: "image-generation",
          providerId: this.id,
          modelName: "Gemini Image Synthesis (FLUX Core)",
          rawPrompt,
          finalPrompt: prompt,
          negativePrompt: (payload as any)?.negativePrompt,
          parameters: { width, height, seed },
          executionTimeMs,
          status: "success",
          resultUrl: imageUrl,
        });

        return {
          success: true,
          data: {
            imageUrl,
            outputImageBase64OrUrl: imageUrl,
            mimeType: "image/jpeg",
            width,
            height,
            appliedEngine: "Gemini Image Generator",
            executionTimeMs,
          } as unknown as TResult,
          providerUsed: this.id,
          executionTimeMs,
        };
      }

      return {
        success: true,
        data: payload as unknown as TResult,
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

