import { AIHistoryRecord } from "./types";
import { AITaskType } from "../types/ai";

export class AIHistoryManager {
  private static instance: AIHistoryManager;

  public static getInstance(): AIHistoryManager {
    if (!AIHistoryManager.instance) {
      AIHistoryManager.instance = new AIHistoryManager();
    }
    return AIHistoryManager.instance;
  }

  private history: AIHistoryRecord[] = [];
  private maxHistoryItems: number;
  private storageKey = "ai_runtime_history";

  constructor(maxItems: number = 200) {
    this.maxHistoryItems = maxItems;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        this.history = JSON.parse(raw);
      }
    } catch {
      this.history = [];
    }
  }

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    try {
      // Keep lightweight version in localStorage
      const slice = this.history.slice(0, 50).map((h) => ({
        ...h,
        resultData: undefined, // Omit heavy data blobs from localStorage
      }));
      localStorage.setItem(this.storageKey, JSON.stringify(slice));
    } catch {
      // Ignore
    }
  }

  public recordJob(
    taskType: AITaskType,
    providerUsed: string,
    durationMs: number,
    inputHash: string,
    success: boolean,
    payloadSummary?: string,
    resultSummary?: string,
    resultData?: any
  ): AIHistoryRecord {
    try {
      const item: AIHistoryRecord = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        taskType,
        providerUsed,
        timestamp: Date.now(),
        durationMs,
        inputHash,
        success,
        payloadSummary,
        resultSummary,
        resultData,
      };

      this.history.unshift(item);
      if (this.history.length > this.maxHistoryItems) {
        this.history.pop();
      }
      this.persist();
      return item;
    } catch (err) {
      console.warn("[AIHistoryManager] Non-fatal error in recordJob:", err);
      return {
        id: `fallback_${Date.now()}`,
        taskType,
        providerUsed,
        timestamp: Date.now(),
        durationMs,
        inputHash,
        success,
        payloadSummary,
        resultSummary,
        resultData,
      };
    }
  }

  /**
   * Safe universal record method to prevent "record is not a function" errors
   */
  public record(params: any): AIHistoryRecord {
    try {
      if (!params || typeof params !== "object") {
        return this.recordJob("enhance-media", "unknown", 0, `hash_${Date.now()}`, true);
      }
      return this.addHistoryItem(params);
    } catch (err) {
      console.warn("[AIHistoryManager] Non-fatal error in record:", err);
      return {
        id: `fallback_${Date.now()}`,
        taskType: params?.taskType || "enhance-media",
        providerUsed: params?.appliedProvider || "unknown",
        timestamp: Date.now(),
        durationMs: params?.executionTimeMs || 0,
        inputHash: params?.inputHash || `hash_${Date.now()}`,
        success: true,
        resultData: params?.resultData,
      };
    }
  }

  /**
   * Compatibility wrapper for legacy addHistoryItem calls
   */
  public addHistoryItem(item: {
    id?: string;
    taskType: AITaskType;
    providerUsed?: string;
    appliedProvider?: string;
    appliedModel?: string;
    durationMs?: number;
    executionTimeMs?: number;
    inputHash?: string;
    inputSummary?: string;
    payloadSummary?: string;
    resultSummary?: string;
    resultData?: any;
    outputMediaUrl?: string;
    success?: boolean;
  }): AIHistoryRecord {
    const taskType = item.taskType;
    const providerUsed = item.providerUsed || item.appliedProvider || item.appliedModel || "flux";
    const durationMs = item.durationMs ?? item.executionTimeMs ?? 0;
    const inputHash = item.inputHash || item.inputSummary || `hash_${Date.now()}`;
    const success = item.success !== undefined ? item.success : true;
    const payloadSummary = item.payloadSummary || item.inputSummary;
    const resultSummary = item.resultSummary;
    const resultData = item.resultData || (item.outputMediaUrl ? { outputImageBase64OrUrl: item.outputMediaUrl } : undefined);

    return this.recordJob(
      taskType,
      providerUsed,
      durationMs,
      inputHash,
      success,
      payloadSummary,
      resultSummary,
      resultData
    );
  }

  /**
   * Look up previously executed result for matching task and inputHash
   */
  public findMatch(taskType: AITaskType, inputHash: string): AIHistoryRecord | undefined {
    return this.history.find(
      (h) => h.taskType === taskType && h.inputHash === inputHash && h.success && h.resultData !== undefined
    );
  }

  public getHistory(limit: number = 50): AIHistoryRecord[] {
    return this.history.slice(0, limit);
  }

  public clear(): void {
    this.history = [];
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {
        // Ignore
      }
    }
  }
}
