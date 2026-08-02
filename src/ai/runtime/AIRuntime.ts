import { aiManager, AIManager } from "../AIManager";
import { AICapabilityRegistry } from "./AICapabilityRegistry";
import { AIResourceManager } from "./AIResourceManager";
import { AIProgressManager } from "./AIProgressManager";
import { AIHistoryManager } from "./AIHistoryManager";
import { AIDownloadManager } from "./AIDownloadManager";
import { AIJobQueue } from "./AIJobQueue";
import { AIJobOptions, AIJobProgress, AIHistoryRecord, DeviceResourceProfile } from "./types";
import { AITaskType, AIResponse } from "../types/ai";

export class AIRuntime {
  private static instance: AIRuntime;

  public aiManager: AIManager;
  public capabilityRegistry: AICapabilityRegistry;
  public resourceManager: AIResourceManager;
  public progressManager: AIProgressManager;
  public historyManager: AIHistoryManager;
  public downloadManager: AIDownloadManager;
  public jobQueue: AIJobQueue;

  private constructor() {
    this.aiManager = aiManager;
    this.capabilityRegistry = new AICapabilityRegistry();
    this.resourceManager = new AIResourceManager();
    this.progressManager = new AIProgressManager();
    this.historyManager = new AIHistoryManager();
    this.downloadManager = new AIDownloadManager();

    this.jobQueue = new AIJobQueue(this.progressManager, this.resourceManager);
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
    // 1. Check history for cached input reuse if allowed
    const enableCache = options?.enableCache ?? true;
    const inputHash = this.aiManager.cache.generateHash(taskType, payload);

    if (enableCache) {
      const historyMatch = this.historyManager.findMatch(taskType, inputHash);
      if (historyMatch && historyMatch.resultData) {
        console.log(`[AIRuntime] Reusing historical result for task "${taskType}"`);
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
          preferredProvider: options?.preferredProviderId,
          enableCache: options?.enableCache,
          signal: jobRecord.abortController.signal,
        });

        return res;
      },
      options
    );

    const response = await promise;

    // 4. Log to History Manager
    if (response.success && response.data) {
      this.historyManager.recordJob(
        taskType,
        response.providerUsed || "unknown",
        Date.now() - startTime,
        inputHash,
        true,
        typeof payload === "string" ? payload.slice(0, 100) : taskType,
        "Success",
        response.data
      );
    }

    return response;
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
}

export const aiRuntime = AIRuntime.getInstance();
