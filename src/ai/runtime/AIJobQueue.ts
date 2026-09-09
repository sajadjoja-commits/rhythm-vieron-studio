import { AIJobRecord, AIJobOptions, AIJobProgress, JobPriority, JobStatus } from "./types";
import { AITaskType, AIResponse } from "../types/ai";
import { AIProgressManager } from "./AIProgressManager";
import { AIResourceManager } from "./AIResourceManager";

export class AIJobQueue {
  private queue: AIJobRecord[] = [];
  private activeJobs: Map<string, AIJobRecord> = new Map();
  private isPaused: boolean = false;

  private progressManager: AIProgressManager;
  private resourceManager: AIResourceManager;
  private maxConcurrent: number;

  constructor(progressManager: AIProgressManager, resourceManager: AIResourceManager) {
    this.progressManager = progressManager;
    this.resourceManager = resourceManager;
    this.maxConcurrent = this.resourceManager.getMaxConcurrentJobs();
  }

  public enqueue<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    executor: (job: AIJobRecord<TPayload, TResult>) => Promise<AIResponse<TResult>>,
    options?: AIJobOptions
  ): { jobId: string; promise: Promise<AIResponse<TResult>> } {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const abortController = new AbortController();
    const priority: JobPriority = options?.priority || "normal";

    const initialProgress = this.progressManager.createProgress(jobId, "Queued in AI Job Queue");

    let resolvePromise: (value: AIResponse<TResult>) => void;
    const promise = new Promise<AIResponse<TResult>>((resolve) => {
      resolvePromise = resolve;
    });

    const jobRecord: AIJobRecord<TPayload, TResult> = {
      id: jobId,
      taskType,
      status: "queued",
      priority,
      payload,
      progress: initialProgress,
      createdAt: Date.now(),
      abortController,
    };

    // Attach custom options callback if passed
    if (options?.onProgress) {
      this.progressManager.subscribe(jobId, options.onProgress);
    }

    // Insert according to priority (urgent > high > normal > low)
    this.insertByPriority(jobRecord, executor, resolvePromise!);

    // Trigger process queue
    setTimeout(() => this.processNext(), 0);

    return { jobId, promise };
  }

  private insertByPriority(
    jobRecord: AIJobRecord,
    executor: (...args: any[]) => any,
    resolveFn: (res: AIResponse) => void
  ): void {
    const item = { jobRecord, executor, resolveFn };
    (jobRecord as any)._internal = item;

    const priorityRank: Record<JobPriority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (priorityRank[jobRecord.priority] > priorityRank[this.queue[i].priority]) {
        this.queue.splice(i, 0, jobRecord);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(jobRecord);
    }
  }

  private async processNext(): Promise<void> {
    if (this.isPaused) return;
    if (this.activeJobs.size >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;

    const jobRecord = this.queue.shift();
    if (!jobRecord) return;

    const internal = (jobRecord as any)._internal;
    if (!internal) return;

    this.activeJobs.set(jobRecord.id, jobRecord);
    jobRecord.status = "processing";
    jobRecord.startedAt = Date.now();

    this.progressManager.updateProgress(jobRecord.id, 10, "Started AI Execution", "processing");

    try {
      const response: AIResponse = await internal.executor(jobRecord);

      jobRecord.completedAt = Date.now();
      if (response.success) {
        jobRecord.status = "completed";
        jobRecord.result = response.data;
        this.progressManager.updateProgress(jobRecord.id, 100, "Completed Successfully", "completed");
      } else {
        jobRecord.status = "failed";
        jobRecord.error = response.error;
        this.progressManager.updateProgress(
          jobRecord.id,
          100,
          "Failed",
          "failed",
          0,
          response.error
        );
      }

      internal.resolveFn(response);
    } catch (err: any) {
      jobRecord.status = "failed";
      jobRecord.completedAt = Date.now();
      const errorObj = {
        code: "EXECUTION_EXCEPTION",
        message: err?.message || "Unhandled exception during task execution",
      };
      jobRecord.error = errorObj;
      this.progressManager.updateProgress(jobRecord.id, 100, "Error", "failed", 0, errorObj);

      internal.resolveFn({
        success: false,
        error: errorObj,
      });
    } finally {
      this.activeJobs.delete(jobRecord.id);
      setTimeout(() => this.processNext(), 0);
    }
  }

  public cancelJob(jobId: string, reason: string = "User cancelled job"): boolean {
    // 1. Check if in active jobs
    const active = this.activeJobs.get(jobId);
    if (active) {
      active.status = "cancelled";
      active.abortController.abort(reason);
      this.progressManager.updateProgress(jobId, 100, "Cancelled", "cancelled");
      this.activeJobs.delete(jobId);
      setTimeout(() => this.processNext(), 0);
      return true;
    }

    // 2. Check if in pending queue
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx !== -1) {
      const [queued] = this.queue.splice(idx, 1);
      queued.status = "cancelled";
      const internal = (queued as any)._internal;
      if (internal) {
        internal.resolveFn({
          success: false,
          error: { code: "CANCELLED", message: reason },
        });
      }
      this.progressManager.updateProgress(jobId, 100, "Cancelled", "cancelled");
      return true;
    }

    return false;
  }

  public pauseQueue(): void {
    this.isPaused = true;
  }

  public resumeQueue(): void {
    this.isPaused = false;
    this.processNext();
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeJobs.size;
  }
}
