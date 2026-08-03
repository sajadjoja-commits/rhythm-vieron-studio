import { LocalProvider } from "../LocalProvider";
import { LocalModelLoader } from "./LocalModelLoader";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";

export class LocalAudioFilter extends LocalProvider {
  public id = "local-audio-filter";
  public name = "Local Audio DSP & VAD Filter";
  public supportedTasks: AITaskType[] = ["noise-reduction", "vocal-isolation", "music-removal"];

  private modelLoader: LocalModelLoader;

  constructor(modelLoader: LocalModelLoader) {
    super();
    this.modelLoader = modelLoader;
    this.modelLoader.registerModel(this.id, this.name);
  }

  public isAvailable(taskType: AITaskType): boolean {
    return this.supportsTask(taskType);
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

    // Local processing stub/executor
    return {
      success: true,
      data: payload as unknown as TResult,
      providerUsed: this.id,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
