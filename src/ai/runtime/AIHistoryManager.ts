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

  private maxResultDataItems = 25;
  private maxResultDataBytes = 16 * 1024 * 1024; // 16 MB in-memory cap for resultData

  constructor(maxItems: number = 200) {
    this.maxHistoryItems = maxItems;
    this.loadFromStorage();
  }

  private estimateTextBytes(val: any, seen: WeakSet<object> = new WeakSet()): number {
    if (val === null || val === undefined) return 0;
    const t = typeof val;
    if (t === "string") return val.length;
    if (t !== "object") return 0;
    if (seen.has(val)) return 0;
    seen.add(val);
    let sum = 0;
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) sum += this.estimateTextBytes(val[i], seen);
    } else {
      const keys = Object.keys(val);
      for (let i = 0; i < keys.length; i++) sum += this.estimateTextBytes(val[keys[i]], seen);
    }
    seen.delete(val);
    return sum;
  }

  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.history = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      this.history = [];
    }
  }

  private static readonly MAX_PERSIST_RESULT_TEXT_BYTES = 256 * 1024; // 256 KB
  private static readonly MAX_PERSIST_TOTAL_BYTES = 1024 * 1024; // 1 MB

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const candidates = this.history.slice(0, 50).map((h) => {
        if (h.resultData !== undefined) {
          const rdTextBytes = this.estimateTextBytes(h.resultData);
          if (rdTextBytes > AIHistoryManager.MAX_PERSIST_RESULT_TEXT_BYTES) {
            return { ...h, resultData: undefined };
          }
        }
        return h;
      });

      // Keep newest items (at start of array) and drop oldest items if total exceeds 1MB
      const kept: AIHistoryRecord[] = [];
      let runningBytes = 2; // "[]"
      for (let i = 0; i < candidates.length; i++) {
        const serializedItem = JSON.stringify(candidates[i]);
        const addedBytes = serializedItem.length + (kept.length > 0 ? 1 : 0);
        if (runningBytes + addedBytes > AIHistoryManager.MAX_PERSIST_TOTAL_BYTES) {
          break;
        }
        kept.push(candidates[i]);
        runningBytes += addedBytes;
      }

      localStorage.setItem(this.storageKey, JSON.stringify(kept));
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
        this.history.length = this.maxHistoryItems;
      }
      // Prevent unbounded memory growth from large media resultData objects
      let accumulatedBytes = 0;
      for (let i = 0; i < this.history.length; i++) {
        const rd = this.history[i].resultData;
        if (rd === undefined) continue;
        if (i >= this.maxResultDataItems) {
          this.history[i] = { ...this.history[i], resultData: undefined };
          continue;
        }
        const itemBytes = this.estimateTextBytes(rd);
        if (itemBytes > this.maxResultDataBytes * 0.5 || accumulatedBytes + itemBytes > this.maxResultDataBytes) {
          this.history[i] = { ...this.history[i], resultData: undefined };
        } else {
          accumulatedBytes += itemBytes;
        }
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
        return this.recordJob("enhance-media", "unknown", 0, `hash_${Date.now()}`, false);
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
        success: Boolean(params?.success),
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
    const providerUsed = item.providerUsed || item.appliedProvider || item.appliedModel || "unknown";
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
