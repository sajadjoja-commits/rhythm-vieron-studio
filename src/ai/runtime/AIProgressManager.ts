import { AIJobProgress, JobStatus } from "./types";
import { AIError } from "../types/ai";

export class AIProgressManager {
  private static instance: AIProgressManager;

  public static getInstance(): AIProgressManager {
    if (!AIProgressManager.instance) {
      AIProgressManager.instance = new AIProgressManager();
    }
    return AIProgressManager.instance;
  }

  private progressStore: Map<string, AIJobProgress> = new Map();
  private listeners: Map<string, Set<(progress: AIJobProgress) => void>> = new Map();
  private globalListeners: Set<(progress: AIJobProgress) => void> = new Set();

  public createProgress(jobId: string, initialStage: string = "Queued"): AIJobProgress {
    const progress: AIJobProgress = {
      jobId,
      percentage: 0,
      currentStage: initialStage,
      status: "queued",
    };
    this.progressStore.set(jobId, progress);
    this.notify(jobId);
    return progress;
  }

  public updateProgress(
    jobId: string,
    percentage: number,
    currentStage?: string,
    status?: JobStatus,
    estimatedTimeRemainingMs?: number,
    error?: AIError
  ): void {
    let existing = this.progressStore.get(jobId);
    if (!existing) {
      existing = this.createProgress(jobId, currentStage || "Processing");
    }

    // Support both 0..1 scale (e.g. 0.1) and 0..100 scale (e.g. 10)
    const normalizedPct = (percentage > 0 && percentage <= 1.0) ? percentage * 100 : percentage;
    existing.percentage = Math.max(0, Math.min(100, Math.round(normalizedPct)));
    if (currentStage) existing.currentStage = currentStage;
    if (status) existing.status = status;
    if (estimatedTimeRemainingMs !== undefined) existing.estimatedTimeRemainingMs = estimatedTimeRemainingMs;
    if (error) existing.error = error;

    this.notify(jobId);
  }

  public getProgress(jobId: string): AIJobProgress | undefined {
    return this.progressStore.get(jobId);
  }

  public subscribe(jobId: string, callback: (progress: AIJobProgress) => void): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(callback);

    // Initial sync call
    const current = this.progressStore.get(jobId);
    if (current) callback(current);

    return () => {
      const set = this.listeners.get(jobId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(jobId);
      }
    };
  }

  public subscribeGlobal(callback: (progress: AIJobProgress) => void): () => void {
    this.globalListeners.add(callback);
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  private notify(jobId: string): void {
    const current = this.progressStore.get(jobId);
    if (!current) return;

    const callbacks = this.listeners.get(jobId);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb({ ...current });
        } catch {
          // Ignore subscriber errors
        }
      });
    }

    this.globalListeners.forEach((cb) => {
      try {
        cb({ ...current });
      } catch {
        // Ignore subscriber errors
      }
    });
  }

  public removeProgress(jobId: string): void {
    this.progressStore.delete(jobId);
    this.listeners.delete(jobId);
  }
}
