/**
 * Phase 9: Native Background Job Service
 * 
 * Coordinates persistent, interrupt-resistant tasks across the app:
 * - High-resolution export operations
 * - Proxy video rendering
 * - Local AI model pack downloads
 * - Video frame batch analysis
 * 
 * On Android:
 * - Connects to VireonBackgroundJob plugin
 * - Keeps CPU awake via Partial WakeLock
 * - Updates Android notification shade with ongoing progress
 * 
 * On Web:
 * - Maintains in-memory job registry and event bus
 * - Prevents unintended tab closure during active jobs
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeBackgroundJobPlugin {
  startBackgroundJob(options: {
    jobId: string;
    title: string;
    taskType: string;
  }): Promise<{ success: boolean; jobId: string; status: string }>;
  updateBackgroundJob(options: {
    jobId: string;
    progress: number;
    stageMessage?: string;
  }): Promise<{ success: boolean; jobId: string; isCancelled: boolean }>;
  finishBackgroundJob(options: {
    jobId: string;
  }): Promise<{ success: boolean; jobId: string }>;
  cancelBackgroundJob(options: {
    jobId: string;
  }): Promise<{ success: boolean; jobId: string; cancelled: boolean }>;
  getActiveJobs(): Promise<{
    success: boolean;
    jobs: Array<{
      jobId: string;
      title: string;
      taskType: string;
      progress: number;
      stageMessage: string;
      isCancelled: boolean;
    }>;
    count: number;
  }>;
}

export function getVireonBackgroundJobPlugin(): NativeBackgroundJobPlugin {
  try {
    return registerPlugin<NativeBackgroundJobPlugin>("VireonBackgroundJob");
  } catch {
    return {
      startBackgroundJob: async () => ({ success: false, jobId: "", status: "unsupported" }),
      updateBackgroundJob: async () => ({ success: false, jobId: "", isCancelled: false }),
      finishBackgroundJob: async () => ({ success: false, jobId: "" }),
      cancelBackgroundJob: async () => ({ success: false, jobId: "", cancelled: false }),
      getActiveJobs: async () => ({ success: true, jobs: [], count: 0 }),
    };
  }
}

export interface BackgroundJob {
  id: string;
  title: string;
  taskType: "export" | "proxy" | "model_download" | "ai_batch" | "general";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number; // 0 - 100
  stageMessage: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export type JobProgressListener = (job: BackgroundJob) => void;

export class BackgroundJobService {
  private static instance: BackgroundJobService;
  private readonly jobs: Map<string, BackgroundJob> = new Map();
  private readonly listeners: Set<JobProgressListener> = new Set();
  private readonly completionListeners: Map<string, Array<(job: BackgroundJob) => void>> = new Map();

  private constructor() {
    this.setupWindowUnloadWarning();
  }

  public static getInstance(): BackgroundJobService {
    if (!BackgroundJobService.instance) {
      BackgroundJobService.instance = new BackgroundJobService();
    }
    return BackgroundJobService.instance;
  }

  public isNative(): boolean {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("VireonBackgroundJob")
    );
  }

  /**
   * Starts or registers a new background job
   */
  public async startJob(options: {
    jobId?: string;
    title: string;
    taskType?: BackgroundJob["taskType"];
    initialStage?: string;
  }): Promise<BackgroundJob> {
    const id = options.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: BackgroundJob = {
      id,
      title: options.title,
      taskType: options.taskType || "general",
      status: "running",
      progress: 0,
      stageMessage: options.initialStage || "Starting task...",
      startedAt: Date.now(),
    };

    this.jobs.set(id, job);
    this.notifyListeners(job);

    if (this.isNative()) {
      try {
        const plugin = getVireonBackgroundJobPlugin();
        await plugin.startBackgroundJob({
          jobId: id,
          title: job.title,
          taskType: job.taskType,
        });
      } catch (err) {
        console.warn("[BackgroundJobService] Native startBackgroundJob failed:", err);
      }
    }

    return job;
  }

  /**
   * Updates progress and stage for an active job
   */
  public async updateProgress(
    jobId: string,
    progress: number,
    stageMessage?: string
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") return false;

    job.progress = Math.max(0, Math.min(100, Math.round(progress)));
    if (stageMessage) job.stageMessage = stageMessage;

    this.notifyListeners(job);

    if (this.isNative()) {
      try {
        const plugin = getVireonBackgroundJobPlugin();
        const res = await plugin.updateBackgroundJob({
          jobId,
          progress: job.progress,
          stageMessage: job.stageMessage,
        });
        if (res?.isCancelled) {
          job.status = "cancelled";
          this.notifyListeners(job);
          return false;
        }
      } catch (err) {
        console.warn("[BackgroundJobService] Native updateBackgroundJob failed:", err);
      }
    }

    return true;
  }

  /**
   * Completes a background job
   */
  public async finishJob(
    jobId: string,
    success = true,
    error?: string
  ): Promise<BackgroundJob | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    job.status = success ? "completed" : "failed";
    job.progress = success ? 100 : job.progress;
    job.completedAt = Date.now();
    if (error) job.error = error;

    this.notifyListeners(job);

    const waiters = this.completionListeners.get(jobId);
    if (waiters) {
      waiters.forEach((cb) => cb(job));
      this.completionListeners.delete(jobId);
    }

    if (this.isNative()) {
      try {
        const plugin = getVireonBackgroundJobPlugin();
        await plugin.finishBackgroundJob({ jobId });
      } catch (err) {
        console.warn("[BackgroundJobService] Native finishBackgroundJob failed:", err);
      }
    }

    return job;
  }

  /**
   * Cancels a running background job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "cancelled";
    job.completedAt = Date.now();
    this.notifyListeners(job);

    if (this.isNative()) {
      try {
        const plugin = getVireonBackgroundJobPlugin();
        await plugin.cancelBackgroundJob({ jobId });
      } catch (err) {
        console.warn("[BackgroundJobService] Native cancelBackgroundJob failed:", err);
      }
    }

    return true;
  }

  /**
   * Get all tracked jobs
   */
  public getAllJobs(): BackgroundJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get active/running jobs
   */
  public getActiveJobs(): BackgroundJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === "running");
  }

  /**
   * Subscribe to progress updates for all jobs
   */
  public subscribe(listener: JobProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Wait for a specific job to complete or fail
   */
  public waitForJob(jobId: string): Promise<BackgroundJob> {
    const existing = this.jobs.get(jobId);
    if (existing && (existing.status === "completed" || existing.status === "failed" || existing.status === "cancelled")) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
      const current = this.completionListeners.get(jobId) || [];
      current.push(resolve);
      this.completionListeners.set(jobId, current);
    });
  }

  private notifyListeners(job: BackgroundJob): void {
    this.listeners.forEach((listener) => {
      try {
        listener({ ...job });
      } catch {}
    });
  }

  private setupWindowUnloadWarning(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", (e) => {
        if (this.getActiveJobs().length > 0) {
          e.preventDefault();
          e.returnValue = "Processing operations are still running in the background. Are you sure you want to leave?";
          return e.returnValue;
        }
      });
    }
  }
}

export const backgroundJobService = BackgroundJobService.getInstance();
