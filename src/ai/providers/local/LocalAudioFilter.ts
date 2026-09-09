import { LocalProvider } from "../LocalProvider";
import { LocalModelLoader } from "./LocalModelLoader";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";
import { aiPlugins } from "../../plugins";
import { AudioEnhancementPlugin } from "../../plugins/AudioEnhancementPlugin";
import { PayloadValidator } from "../../utils/PayloadValidator";

export class LocalAudioFilter extends LocalProvider {
  public id = "local-audio-filter";
  public name = "Local Audio DSP & DeepFilterNet Filter";
  public supportedTasks: AITaskType[] = ["noise-reduction", "vocal-isolation", "music-removal", "enhance-media"];

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
      if (mediaType && mediaType !== "audio") return false;
    }
    return true;
  }

  public async loadModel(): Promise<boolean> {
    try {
      await this.modelLoader.getOrLoadModel(this.id, async () => {
        return { type: "local-dsp", ready: true };
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
          error: createAIError("LOCAL_MODEL_FAILED", "Failed to initialize local audio model", this.id),
        };
      }
    }

    const plugin = aiPlugins.getPlugin<AudioEnhancementPlugin>("plugin-audio-enhancement");
    if (!plugin) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("PLUGIN_NOT_FOUND", "AudioEnhancementPlugin is not registered", this.id),
      };
    }

    const action =
      taskType === "noise-reduction"
        ? "denoise"
        : taskType === "vocal-isolation" || taskType === "music-removal"
        ? "separate"
        : "audio-enhance-composite";

    const audioPayload = typeof payload === "string" ? { audioBase64OrUrl: payload } : payload;
    const res = await plugin.execute(action, audioPayload, {
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

