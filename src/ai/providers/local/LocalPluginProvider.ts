import { AIProvider, ProviderType } from "../provider";
import { AITaskType, AITaskOptions, AIResponse } from "../../types/ai";
import { aiPlugins } from "../../plugins";
import { createAIError } from "../../utils/errorUtils";

export class LocalPluginProvider implements AIProvider {
  public id = "local-plugin-provider";
  public name = "Local AI Plugins (WASM/WebGL)";
  public type: ProviderType = "local";

  public supportedTasks: AITaskType[] = [
    "background-removal",
    "enhance-media",
    "noise-reduction",
    "vocal-isolation",
    "music-removal"
  ];

  public async isAvailable(taskType: AITaskType): Promise<boolean> {
    // Basic check for browser capabilities
    if (typeof window === "undefined") return false;
    return true;
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const pluginId = this.mapTaskToPlugin(taskType);
    if (!pluginId) {
      return {
        success: false,
        error: createAIError("UNSUPPORTED_TASK", `No plugin available for task ${taskType}`),
      };
    }

    const plugin = aiPlugins.getPlugin(pluginId);
    if (!plugin) {
      return {
        success: false,
        error: createAIError("PLUGIN_NOT_FOUND", `Plugin ${pluginId} is not registered`),
      };
    }

    // Map AITaskType to Plugin Action
    const actionName = this.mapTaskToAction(taskType, payload);

    return plugin.execute(actionName, payload, options);
  }

  private mapTaskToPlugin(taskType: AITaskType): string | null {
    switch (taskType) {
      case "background-removal":
      case "enhance-media":
      case "noise-reduction":
        // Image or Video?
        return "plugin-image-enhancement"; // Defaulting for now, will refine
      case "vocal-isolation":
      case "music-removal":
        return "plugin-audio-enhancement";
      default:
        return null;
    }
  }

  private mapTaskToAction(taskType: AITaskType, payload: any): string {
    switch (taskType) {
      case "background-removal":
        return "remove-background";
      case "enhance-media":
        return "upscale";
      case "noise-reduction":
        return "denoise";
      case "vocal-isolation":
        return "separate";
      default:
        return taskType;
    }
  }
}
