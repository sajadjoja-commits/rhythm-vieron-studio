import { AIManager } from "../AIManager";
import { AICapabilityRegistry } from "./AICapabilityRegistry";
import { AIResourceManager } from "./AIResourceManager";
import { AIProgressManager } from "./AIProgressManager";
import { AIHistoryManager } from "./AIHistoryManager";
import { AIDownloadManager } from "./AIDownloadManager";
import { AIJobQueue } from "./AIJobQueue";
import { AIJobOptions, AIJobProgress, AIHistoryRecord, DeviceResourceProfile } from "./types";
import { AITaskType, AIResponse } from "../types/ai";
import { AIWorkflowEngine } from "../workflow/AIWorkflowEngine";
import { WorkflowDefinition, WorkflowRunOptions, AIWorkflowEngineResponse } from "../workflow/types";
import { AIDebugLogger } from "../utils/AIDebugLogger";

export class AIRuntime {
  private static instance: AIRuntime;

  public get aiManager(): AIManager {
    return AIManager.getInstance();
  }

  public capabilityRegistry: AICapabilityRegistry;
  public resourceManager: AIResourceManager;
  public progressManager: AIProgressManager;
  public historyManager: AIHistoryManager;
  public downloadManager: AIDownloadManager;
  public jobQueue: AIJobQueue;
  public workflowEngine: AIWorkflowEngine;

  private constructor() {
    this.capabilityRegistry = AICapabilityRegistry.getInstance();
    this.resourceManager = AIResourceManager.getInstance();
    this.progressManager = AIProgressManager.getInstance();
    this.historyManager = AIHistoryManager.getInstance();
    this.downloadManager = new AIDownloadManager();

    this.jobQueue = new AIJobQueue(this.progressManager, this.resourceManager);
    this.workflowEngine = new AIWorkflowEngine();
  }

  public static getInstance(): AIRuntime {
    if (!AIRuntime.instance) {
      AIRuntime.instance = new AIRuntime();
    }
    return AIRuntime.instance;
  }

  /**
   * Main Unified Execution Endpoint for AI Runtime
   */
  public async runTask<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AIJobOptions
  ): Promise<AIResponse<TResult>> {
    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Tool Selected", { taskType, options });

    try {
      // 1. Check history for cached input reuse if allowed
      const enableCache = options?.enableCache ?? true;
      const inputHash = this.aiManager.cache.generateHash(taskType, payload);

      if (enableCache) {
        const historyMatch = this.historyManager.findMatch(taskType, inputHash);
        if (historyMatch && historyMatch.resultData) {
          console.log(`[AIRuntime] Reusing historical result for task "${taskType}"`);
          debugLogger.logStage("Cache Saved / Hit", { taskType, inputHash });
          return {
            success: true,
            data: historyMatch.resultData as TResult,
            cached: true,
            providerUsed: historyMatch.providerUsed,
            executionTimeMs: 0,
          };
        }
      }

      // 2. Resource check & capability validation
      const bestCapability = this.capabilityRegistry.findBestForTask(
        taskType,
        options?.executionMode === "local",
        this.resourceManager.getProfile().isAndroid
      );

      if (bestCapability) {
        debugLogger.logStage("Capability Selected", { capabilityId: bestCapability.id, providerId: bestCapability.providerId });
        const check = this.resourceManager.canRunCapability(bestCapability);
        if (!check.allowed) {
          console.warn(`[AIRuntime] Resource check warning for ${bestCapability.id}: ${check.reason}`);
        }
      }

      // 3. Enqueue job into priority AIJobQueue
      const startTime = Date.now();
      const { jobId, promise } = this.jobQueue.enqueue<TPayload, TResult>(
        taskType,
        payload,
        async (jobRecord) => {
          // Execute via core AIManager
          this.progressManager.updateProgress(jobId, 40, "Running AI Provider", "processing");

          const res = await this.aiManager.execute<TPayload, TResult>(taskType, payload, {
            executionMode: options?.executionMode,
            preferredProvider: options?.preferredProviderId || (options as any)?.preferredProvider,
            enableCache: options?.enableCache,
            signal: jobRecord.abortController.signal,
          });

          return res;
        },
        options
      );

      const response = await promise;

      // 4. Log to History Manager safely
      const executionTimeMs = Date.now() - startTime;
      try {
        if (response.success && response.data) {
          this.historyManager.recordJob(
            taskType,
            response.providerUsed || "unknown",
            executionTimeMs,
            inputHash,
            true,
            typeof payload === "string" ? payload.slice(0, 100) : taskType,
            "Success",
            response.data
          );
          debugLogger.logStage("History Saved", { taskType, providerUsed: response.providerUsed, status: "Success" });
        } else {
          this.historyManager.recordJob(
            taskType,
            response.providerUsed || "unknown",
            executionTimeMs,
            inputHash,
            false,
            typeof payload === "string" ? payload.slice(0, 100) : taskType,
            response.error?.message || "Execution Failed",
            undefined
          );
          debugLogger.logStage("History Saved", { taskType, providerUsed: response.providerUsed, status: "Failed", error: response.error });
        }
      } catch (histErr) {
        console.warn("[AIRuntime] Non-fatal history logging error:", histErr);
      }

      return response;
    } catch (err: any) {
      debugLogger.logError("AIRuntime Task Exception", err, { taskType, payload });
      const inputHash = this.aiManager.cache.generateHash(taskType, payload);
      this.historyManager.recordJob(
        taskType,
        "runtime-error",
        0,
        inputHash,
        false,
        typeof payload === "string" ? payload.slice(0, 100) : taskType,
        err?.message || "Runtime Exception",
        undefined
      );
      return {
        success: false,
        error: {
          code: "RUNTIME_ERROR",
          message: err?.message || "An unexpected error occurred in AIRuntime",
          details: err?.stack,
        },
      };
    }
  }

  // ---------------- Utility Methods ----------------

  public subscribeProgress(jobId: string, callback: (progress: AIJobProgress) => void): () => void {
    return this.progressManager.subscribe(jobId, callback);
  }

  public cancelTask(jobId: string, reason?: string): boolean {
    return this.jobQueue.cancelJob(jobId, reason);
  }

  public getDeviceProfile(): DeviceResourceProfile {
    return this.resourceManager.getProfile();
  }

  public getHistory(limit: number = 50): AIHistoryRecord[] {
    return this.historyManager.getHistory(limit);
  }

  // ---------------- Workflow Engine Methods ----------------

  public getWorkflowEngine(): AIWorkflowEngine {
    return this.workflowEngine;
  }

  public async runWorkflow<TPayload = any, TResult = any>(
    workflowIdOrDef: string | WorkflowDefinition,
    input: TPayload,
    options?: WorkflowRunOptions
  ): Promise<AIWorkflowEngineResponse<TResult>> {
    return this.workflowEngine.executeWorkflow<TPayload, TResult>(workflowIdOrDef, input, options);
  }

  public pauseWorkflow(runId: string): boolean {
    return this.workflowEngine.pauseWorkflow(runId);
  }

  public async resumeWorkflow<TResult = any>(runId: string): Promise<AIWorkflowEngineResponse<TResult>> {
    return this.workflowEngine.resumeWorkflow<TResult>(runId);
  }

  public async retryWorkflowStep<TResult = any>(
    runId: string,
    stepIndex?: number
  ): Promise<AIWorkflowEngineResponse<TResult>> {
    return this.workflowEngine.retryStep<TResult>(runId, stepIndex);
  }
}

let _aiRuntimeProxyInstance: AIRuntime | null = null;
export const aiRuntime: AIRuntime = new Proxy({} as AIRuntime, {
  get(_target, prop, receiver) {
    if (!_aiRuntimeProxyInstance) {
      _aiRuntimeProxyInstance = AIRuntime.getInstance();
    }
    const val = Reflect.get(_aiRuntimeProxyInstance, prop, receiver);
    return typeof val === "function" ? val.bind(_aiRuntimeProxyInstance) : val;
  },
});
