import { LocalProvider } from "../LocalProvider";
import { LocalModelLoader } from "./LocalModelLoader";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";
import { aiPlugins } from "../../plugins";
import { ImageEnhancementPlugin } from "../../plugins/ImageEnhancementPlugin";
import { PayloadValidator } from "../../utils/PayloadValidator";

export class LocalImageProcessor extends LocalProvider {
  public id = "local-image-processor";
  public name = "Local AI Image Processor (RMBG-2.0, MediaPipe, GFPGAN, LaMa, SCUNet)";
  public supportedTasks: AITaskType[] = [
    "background-removal",
    "enhance-media",
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
      if (mediaType && mediaType !== "image") return false;
    }
    return true;
  }

  public async loadModel(): Promise<boolean> {
    try {
      await this.modelLoader.getOrLoadModel(this.id, async () => {
        return { type: "onnx-neural-engine", ready: true };
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
          error: createAIError("LOCAL_MODEL_FAILED", "Failed to initialize local image processor", this.id),
        };
      }
    }

    const plugin = aiPlugins.getPlugin<ImageEnhancementPlugin>("plugin-image-enhancement");
    if (!plugin) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("PLUGIN_NOT_FOUND", "ImageEnhancementPlugin is not registered", this.id),
      };
    }

    const imgPayload = typeof payload === "string" ? { imageBase64OrUrl: payload } : payload;
    const action =
      taskType === "background-removal"
        ? "remove-background"
        : taskType === "noise-reduction"
        ? "denoise"
        : (imgPayload as any)?.action || "composite-enhance";

    const res = await plugin.execute(action, imgPayload, {
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
