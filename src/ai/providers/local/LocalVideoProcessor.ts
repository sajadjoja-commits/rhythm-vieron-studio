import { LocalProvider } from "../LocalProvider";
import { LocalModelLoader } from "./LocalModelLoader";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";
import { aiPlugins } from "../../plugins";
import { VideoEnhancementPlugin } from "../../plugins/VideoEnhancementPlugin";
import { PayloadValidator } from "../../utils/PayloadValidator";

export class LocalVideoProcessor extends LocalProvider {
  public id = "local-video-processor";
  public name = "Local AI Video Processor (MediaPipe Segmentation, Multi-scale CLAHE, Bilateral Denoise)";
  public supportedTasks: AITaskType[] = [
    "enhance-media",
    "background-removal",
    "noise-reduction",
  ];

  private modelLoader: LocalModelLoader;

  constructor(modelLoader: LocalModelLoader) {
    super();
    this.modelLoader = modelLoader;
    this.modelLoader.registerModel(this.id, this.name);
  }

  public isAvailable(taskType: AITaskType, payload?: any): boolean {
    if (!this.supportsTask(taskType)) return false;
    if (payload) {
      const mediaType = PayloadValidator.detectMediaType(payload);
      if (mediaType && mediaType !== "video") return false;
    }
    return true;
  }

  public async loadModel(): Promise<boolean> {
    try {
      await this.modelLoader.getOrLoadModel(this.id, async () => {
        return { type: "local-video-pipeline", ready: true };
      });
      this.isModelLoaded = true;
      return true;
    } catch {
      this.isModelLoaded = false;
      return false;
    }
  }

  public async unloadModel(): Promise<void> {
    await this.modelLoader.unloadModel(this.id);
    this.isModelLoaded = false;
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();

    if (!this.isModelLoaded) {
      const loaded = await this.loadModel();
      if (!loaded) {
        return {
          success: false,
          providerUsed: this.id,
          error: createAIError("LOCAL_MODEL_FAILED", "Failed to initialize local video processor", this.id),
        };
      }
    }

    const plugin = aiPlugins.getPlugin<VideoEnhancementPlugin>("plugin-video-enhancement");
    if (!plugin) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("PLUGIN_NOT_FOUND", "VideoEnhancementPlugin is not registered", this.id),
      };
    }

    const vidPayload = typeof payload === "string" ? { videoBase64OrUrl: payload } : payload;
    const action =
      taskType === "background-removal"
        ? "video-bg-removal"
        : taskType === "noise-reduction"
        ? "video-denoise"
        : (vidPayload as any)?.action || "composite-video-enhance";

    const res = await plugin.execute(action, vidPayload, {
      ...options,
      executionMode: "local",
    });

    return {
      success: res.success,
      data: res.data as unknown as TResult,
      providerUsed: this.id,
      executionTimeMs: Date.now() - startTime,
      error: res.error,
    };
  }
}
