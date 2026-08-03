import { AIHistoryRecord } from "./types";
import { AITaskType } from "../types/ai";

export class AIHistoryManager {
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
  }

  /**
   * Compatibility wrapper for legacy addHistoryItem calls
   */
  public addHistoryItem(item: {
    id?: string;
    taskType: AITaskType;
    providerUsed?: string;
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
    const providerUsed = item.providerUsed || "flux";
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
