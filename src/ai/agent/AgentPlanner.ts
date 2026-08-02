import { ILLMPlanner, AgentRequest, ExecutionPlan, ExecutionStep } from "./types";
import { AICapabilityRegistry } from "../runtime/AICapabilityRegistry";
import { AIPluginRegistry } from "../plugins";
import { PREBUILT_WORKFLOWS } from "./PrebuiltWorkflows";
import { AITaskType } from "../types/ai";

export class DefaultAgentPlanner implements ILLMPlanner {
  public name = "RuleAndCapabilityPlanner";

  public async generatePlan(
    request: AgentRequest,
    capabilityRegistry: AICapabilityRegistry,
    pluginRegistry: AIPluginRegistry
  ): Promise<ExecutionPlan> {
    const prompt = (request.userPrompt || "").toLowerCase();
    const intent = (request.intent || "").toLowerCase();

    // 1. Direct match by template key or prompt keywords
    let matchedTemplateKey = "";

    if (intent && PREBUILT_WORKFLOWS[intent]) {
      matchedTemplateKey = intent;
    } else if (prompt.includes("product") || prompt.includes("منتج") || prompt.includes("صورة منتج")) {
      matchedTemplateKey = "product-photo-enhancer";
    } else if (prompt.includes("podcast") || prompt.includes("بودكاست") || prompt.includes("صوت بودكاست")) {
      matchedTemplateKey = "podcast-cleaner";
    } else if (prompt.includes("video") || prompt.includes("فيديو") || prompt.includes("فيديو قصير") || prompt.includes("60fps")) {
      matchedTemplateKey = "short-video-enhancer";
    } else if ((prompt.includes("background") || prompt.includes("خلفية")) && (prompt.includes("upscale") || prompt.includes("جودة"))) {
      matchedTemplateKey = "bg-remove-upscale";
    } else if (prompt.includes("caption") || prompt.includes("كابشن") || prompt.includes("تفريغ")) {
      matchedTemplateKey = "auto-captioning";
    }

    if (matchedTemplateKey && PREBUILT_WORKFLOWS[matchedTemplateKey]) {
      const template = PREBUILT_WORKFLOWS[matchedTemplateKey];
      
      // Verify all required steps against CapabilityRegistry
      const validatedSteps: ExecutionStep[] = template.steps.map((step) => {
        const capability = capabilityRegistry.findByTask(step.taskType)[0] || 
                           capabilityRegistry.findBestForTask(step.taskType);

        return {
          ...step,
          executionMode: capability?.executionMode || "auto",
        };
      });

      return {
        planId: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        intentName: template.intentId,
        description: template.descEn,
        userPrompt: request.userPrompt,
        steps: validatedSteps,
        estimatedDurationMs: template.estimatedDurationMs,
        createdAt: Date.now(),
      };
    }

    // 2. Dynamic Capability Discovery Plan Generation via AICapabilityRegistry
    return this.generateDynamicPlanFromCapabilities(request, capabilityRegistry, pluginRegistry);
  }

  /**
   * Generates a dynamic execution plan by discovering capabilities in AICapabilityRegistry
   */
  private generateDynamicPlanFromCapabilities(
    request: AgentRequest,
    capabilityRegistry: AICapabilityRegistry,
    pluginRegistry: AIPluginRegistry
  ): ExecutionPlan {
    const mediaType = request.mediaType || "image";
    const prompt = (request.userPrompt || "").toLowerCase();

    // Query AICapabilityRegistry to find available capabilities matching domain/task
    const allCapabilities = capabilityRegistry.list();
    const domainCapabilities = allCapabilities.filter((c) => c.domain === mediaType || c.domain === "text");

    const steps: ExecutionStep[] = [];
    let previousStepId: string | undefined = undefined;

    // Determine target tasks based on prompt & registry capabilities
    const desiredTaskTypes: AITaskType[] = [];

    if (prompt.includes("bg") || prompt.includes("background") || prompt.includes("خلفية") || prompt.includes("remove")) {
      desiredTaskTypes.push("background-removal");
    }
    if (prompt.includes("denoise") || prompt.includes("noise") || prompt.includes("نويز") || prompt.includes("تنقية")) {
      desiredTaskTypes.push("noise-reduction");
    }
    if (prompt.includes("vocal") || prompt.includes("music") || prompt.includes("عزل")) {
      desiredTaskTypes.push("vocal-isolation");
    }
    if (prompt.includes("upscale") || prompt.includes("enhance") || prompt.includes("4k") || prompt.includes("تحسين")) {
      desiredTaskTypes.push("enhance-media");
    }

    // Default fallback task if no specific keyword detected
    if (desiredTaskTypes.length === 0) {
      if (mediaType === "image") desiredTaskTypes.push("background-removal", "enhance-media");
      else if (mediaType === "video") desiredTaskTypes.push("noise-reduction", "enhance-media");
      else if (mediaType === "audio") desiredTaskTypes.push("noise-reduction", "vocal-isolation");
      else desiredTaskTypes.push("enhance-media");
    }

    // Map discovered task types to execution steps using registry
    desiredTaskTypes.forEach((taskType, index) => {
      const capability = capabilityRegistry.findBestForTask(taskType) || domainCapabilities.find((c) => c.taskType === taskType);
      if (!capability) return;

      // Find matching plugin from pluginRegistry
      const registeredPlugins = pluginRegistry.listPlugins();
      const matchingPlugin = registeredPlugins.find((p) =>
        p.capabilities.some((cap) => cap.taskType === taskType)
      ) || registeredPlugins[0];

      const stepId = `step_${index + 1}_${taskType}`;
      const actionName = taskType === "background-removal" 
        ? (mediaType === "video" ? "video-bg-removal" : "remove-background")
        : taskType === "noise-reduction" 
        ? (mediaType === "video" ? "video-denoise" : "denoise")
        : taskType === "vocal-isolation" 
        ? "separate"
        : (mediaType === "video" ? "video-upscale" : "upscale");

      steps.push({
        id: stepId,
        name: `Dynamic ${capability.name} (${taskType})`,
        taskType,
        pluginId: matchingPlugin ? matchingPlugin.id : `plugin-${mediaType}-enhancement`,
        actionName,
        dependsOn: previousStepId ? [previousStepId] : undefined,
        inputPipeFromStepId: previousStepId,
        executionMode: capability.executionMode,
        outputField: mediaType === "image" ? "outputImageBase64OrUrl" : mediaType === "video" ? "outputVideoBase64OrUrl" : "enhancedAudioUrlOrBase64",
      });

      previousStepId = stepId;
    });

    return {
      planId: `dyn_plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      intentName: "custom-workflow",
      description: `Discovered & constructed multi-step workflow via AICapabilityRegistry for ${mediaType}`,
      userPrompt: request.userPrompt,
      steps,
      estimatedDurationMs: steps.length * 2500,
      createdAt: Date.now(),
    };
  }
}
