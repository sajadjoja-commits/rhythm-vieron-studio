import {
  AgentRequest,
  AgentWorkflowResult,
  AgentStepResult,
  ExecutionPlan,
  ExecutionStep,
  ILLMPlanner,
  PrebuiltWorkflowTemplate,
} from "./types";
import { DefaultAgentPlanner } from "./AgentPlanner";
import { PREBUILT_WORKFLOWS } from "./PrebuiltWorkflows";
import { aiRuntime, AIRuntime } from "../runtime/AIRuntime";
import { aiPlugins, AIPluginRegistry } from "../plugins";
import { AIResponse } from "../types/ai";

export class AIAgent {
  private static instance: AIAgent;

  private runtime: AIRuntime;
  private pluginRegistry: AIPluginRegistry;
  private planner: ILLMPlanner;

  private constructor() {
    this.runtime = aiRuntime;
    this.pluginRegistry = aiPlugins;
    this.planner = new DefaultAgentPlanner();
  }

  public static getInstance(): AIAgent {
    if (!AIAgent.instance) {
      AIAgent.instance = new AIAgent();
    }
    return AIAgent.instance;
  }

  /**
   * Set or swap the underlying LLM/Reasoning planner (e.g., Groq, Gemini, OpenAI, or Custom)
   */
  public setPlanner(planner: ILLMPlanner): void {
    console.log(`[AIAgent] Swapping planner engine to: ${planner.name}`);
    this.planner = planner;
  }

  /**
   * Step 1: Generate an Execution Plan before execution
   */
  public async plan(request: AgentRequest): Promise<ExecutionPlan> {
    const executionPlan = await this.planner.generatePlan(
      request,
      this.runtime.capabilityRegistry,
      this.pluginRegistry
    );

    console.log(`[AIAgent] Generated Execution Plan (${executionPlan.planId}) with ${executionPlan.steps.length} steps`);
    return executionPlan;
  }

  /**
   * Step 2: Execute an Execution Plan step-by-step or in parallel DAG batches
   */
  public async executePlan(
    plan: ExecutionPlan,
    initialInputMedia?: string,
    options?: any
  ): Promise<AgentWorkflowResult> {
    const startTime = Date.now();
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const stepResults: Record<string, AgentStepResult> = {};
    const stepOutputs: Record<string, string> = {}; // stepId -> output media URL / Base64

    // Top-level workflow progress registration via AIProgressManager
    this.runtime.progressManager.createProgress(workflowId, `Starting Workflow: ${plan.intentName}`);
    this.runtime.progressManager.updateProgress(workflowId, 5, "Initializing Execution Graph", "processing");

    let currentMedia = initialInputMedia || "";
    let overallSuccess = true;
    let errorMessage: string | undefined;

    try {
      // Build step resolution tracker
      const completedSteps = new Set<string>();
      const remainingSteps = [...plan.steps];

      while (remainingSteps.length > 0) {
        // Find all steps whose dependencies (dependsOn) have all completed successfully
        const executableSteps = remainingSteps.filter((step) => {
          if (!step.dependsOn || step.dependsOn.length === 0) return true;
          return step.dependsOn.every((depId) => completedSteps.has(depId));
        });

        if (executableSteps.length === 0) {
          throw new Error(`Circular or unresolvable dependency in execution plan steps: ${remainingSteps.map((s) => s.id).join(", ")}`);
        }

        // Execute batch (in parallel if multiple executable steps exist)
        const batchResults = await Promise.all(
          executableSteps.map((step) =>
            this.executeSingleStep(step, workflowId, currentMedia, stepOutputs, options)
          )
        );

        // Process batch step results
        for (let i = 0; i < executableSteps.length; i++) {
          const step = executableSteps[i];
          const result = batchResults[i];

          stepResults[step.id] = result;
          completedSteps.add(step.id);

          // Remove completed step from remainingSteps
          const idx = remainingSteps.findIndex((s) => s.id === step.id);
          if (idx !== -1) remainingSteps.splice(idx, 1);

          if (result.success && result.outputMediaUrlOrBase64) {
            stepOutputs[step.id] = result.outputMediaUrlOrBase64;
            currentMedia = result.outputMediaUrlOrBase64;
          } else if (!result.success) {
            overallSuccess = false;
            errorMessage = result.error || `Step ${step.id} failed`;
          }
        }

        if (!overallSuccess) {
          console.warn(`[AIAgent] Workflow ${workflowId} stopped early due to step failure: ${errorMessage}`);
          break;
        }

        // Update overall workflow progress
        const completedPct = Math.round((completedSteps.size / plan.steps.length) * 90) + 5;
        this.runtime.progressManager.updateProgress(
          workflowId,
          completedPct,
          `Completed ${completedSteps.size}/${plan.steps.length} steps`,
          "processing"
        );
      }

      const totalTimeMs = Date.now() - startTime;

      if (overallSuccess) {
        this.runtime.progressManager.updateProgress(workflowId, 100, "Workflow Completed Successfully", "completed");
      } else {
        this.runtime.progressManager.updateProgress(
          workflowId,
          100,
          "Workflow Failed",
          "failed",
          0,
          { code: "WORKFLOW_FAILED", message: errorMessage }
        );
      }

      return {
        workflowId,
        plan,
        success: overallSuccess,
        finalOutput: stepResults,
        finalMediaUrlOrBase64: currentMedia,
        stepResults,
        totalExecutionTimeMs: totalTimeMs,
        error: errorMessage,
      };
    } catch (err: any) {
      console.error(`[AIAgent] Exception executing plan ${plan.planId}:`, err);
      const totalTimeMs = Date.now() - startTime;
      const errorStr = err?.message || "Unknown execution exception";

      this.runtime.progressManager.updateProgress(
        workflowId,
        100,
        "Execution Exception",
        "failed",
        0,
        { code: "EXECUTION_EXCEPTION", message: errorStr }
      );

      return {
        workflowId,
        plan,
        success: false,
        stepResults,
        totalExecutionTimeMs: totalTimeMs,
        error: errorStr,
      };
    }
  }

  /**
   * Executes a single step with caching, job queueing, and history recording
   */
  private async executeSingleStep(
    step: ExecutionStep,
    workflowId: string,
    defaultMedia: string,
    stepOutputs: Record<string, string>,
    options?: any
  ): Promise<AgentStepResult> {
    const stepStartTime = Date.now();

    // Determine input media for this step (piped from predecessor or default)
    let stepInputMedia = defaultMedia;
    if (step.inputPipeFromStepId && stepOutputs[step.inputPipeFromStepId]) {
      stepInputMedia = stepOutputs[step.inputPipeFromStepId];
    }

    // Build payload
    const payload: Record<string, any> = {
      ...(step.payloadTemplate || {}),
      action: step.actionName,
    };

    if (step.taskType === "background-removal" || step.taskType === "enhance-media" || step.taskType === "noise-reduction") {
      if (step.pluginId === "plugin-video-enhancement") {
        payload.videoBase64OrUrl = stepInputMedia;
      } else if (step.pluginId === "plugin-audio-enhancement") {
        payload.audioBase64OrUrl = stepInputMedia;
      } else {
        payload.imageBase64OrUrl = stepInputMedia;
      }
    } else if (step.taskType === "vocal-isolation" || step.taskType === "speech-to-text") {
      payload.audioBase64OrUrl = stepInputMedia;
    } else {
      payload.mediaUrlOrBase64 = stepInputMedia;
    }

    // 1. Check AICache & HistoryManager for step result reuse
    const enableCache = options?.enableCache ?? true;
    const cacheKey = this.runtime.aiManager.cache.generateHash(step.taskType, payload);

    if (enableCache) {
      const cachedData = this.runtime.aiManager.cache.get<any>(cacheKey);
      if (cachedData) {
        console.log(`[AIAgent] AICache Hit for step "${step.name}" (${step.id})`);

        // Record history entry for cache hit
        this.runtime.historyManager.recordJob(
          step.taskType,
          "AICache",
          0,
          cacheKey,
          true,
          step.name,
          "Success (Cached)",
          cachedData
        );

        const outputUrl = this.extractOutputMedia(cachedData, step.outputField);

        return {
          stepId: step.id,
          taskType: step.taskType,
          pluginId: step.pluginId,
          actionName: step.actionName,
          success: true,
          cached: true,
          resultData: cachedData,
          outputMediaUrlOrBase64: outputUrl,
          executionTimeMs: 0,
        };
      }
    }

    // 2. Execute via Plugin or AIRuntime Job Queue
    try {
      const plugin = this.pluginRegistry.getPlugin(step.pluginId);
      let stepResponse: AIResponse;

      if (plugin) {
        // Execute through registered AIPlugin
        stepResponse = await plugin.execute(step.actionName, payload, {
          executionMode: step.executionMode || options?.executionMode,
          priority: options?.priority || "high",
        });
      } else {
        // Fallback execution via AIRuntime task endpoint
        stepResponse = await this.runtime.runTask(step.taskType, payload, {
          executionMode: step.executionMode || options?.executionMode,
          priority: options?.priority || "high",
        });
      }

      const executionTime = Date.now() - stepStartTime;

      if (stepResponse.success && stepResponse.data) {
        // Store in AICache for future re-use
        if (enableCache) {
          this.runtime.aiManager.cache.set(
            cacheKey,
            step.taskType,
            stepResponse.data,
            24 * 60 * 60 * 1000,
            stepResponse.providerUsed
          );
        }

        // Record step in AIHistoryManager
        this.runtime.historyManager.recordJob(
          step.taskType,
          stepResponse.providerUsed || step.pluginId,
          executionTime,
          cacheKey,
          true,
          step.name,
          "Success",
          stepResponse.data
        );

        const outputUrl = this.extractOutputMedia(stepResponse.data, step.outputField);

        return {
          stepId: step.id,
          taskType: step.taskType,
          pluginId: step.pluginId,
          actionName: step.actionName,
          success: true,
          cached: false,
          resultData: stepResponse.data,
          outputMediaUrlOrBase64: outputUrl,
          executionTimeMs: executionTime,
        };
      } else {
        const errorMsg = stepResponse.error?.message || `Execution of ${step.name} failed`;

        // Record failure in AIHistoryManager
        this.runtime.historyManager.recordJob(
          step.taskType,
          step.pluginId,
          executionTime,
          cacheKey,
          false,
          step.name,
          "Failed",
          null
        );

        return {
          stepId: step.id,
          taskType: step.taskType,
          pluginId: step.pluginId,
          actionName: step.actionName,
          success: false,
          error: errorMsg,
          executionTimeMs: executionTime,
        };
      }
    } catch (err: any) {
      const executionTime = Date.now() - stepStartTime;
      const errorMsg = err?.message || "Step execution exception";

      return {
        stepId: step.id,
        taskType: step.taskType,
        pluginId: step.pluginId,
        actionName: step.actionName,
        success: false,
        error: errorMsg,
        executionTimeMs: executionTime,
      };
    }
  }

  /**
   * Helper to extract output media URL or Base64 from result object
   */
  private extractOutputMedia(data: any, outputField?: string): string | undefined {
    if (!data) return undefined;
    if (typeof data === "string") return data;
    if (outputField && data[outputField]) return data[outputField];

    return (
      data.outputImageBase64OrUrl ||
      data.outputVideoBase64OrUrl ||
      data.enhancedAudioUrlOrBase64 ||
      data.url ||
      data.base64
    );
  }

  /**
   * Full Convenience Method: Plan + Execute Workflow
   */
  public async run(request: AgentRequest): Promise<AgentWorkflowResult> {
    console.log(`[AIAgent] Running request for intent: ${request.intent || "custom"} | Prompt: "${request.userPrompt || ""}"`);
    const plan = await this.plan(request);
    return this.executePlan(plan, request.inputMediaUrlOrBase64, request.options);
  }

  /**
   * Returns all available prebuilt workflows templates
   */
  public getPrebuiltWorkflows(): Record<string, PrebuiltWorkflowTemplate> {
    return PREBUILT_WORKFLOWS;
  }
}

export const aiAgent = AIAgent.getInstance();
