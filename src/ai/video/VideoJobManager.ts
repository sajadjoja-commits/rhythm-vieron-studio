/**
 * VideoJobManager
 * Master Singleton Runtime Manager for Local Video AI Jobs.
 * 
 * Guarantees:
 * - Complete decoupling of Video AI Job lifecycle from React UI Component lifecycles.
 * - Jobs survive UI navigation (AI Studio -> Home -> Projects -> Editor -> Templates).
 * - Live real progress streaming (frame count, FPS, ETA, percentage, stages).
 * - Real user-initiated cancellation with deep resource cleanup.
 * - Safe output storage and persistence across route changes.
 * - Isolated non-breaking History recording.
 */

import {
  VideoAITaskType,
  VideoAIStage,
  VideoAIOptions,
  VideoAIResult,
  VideoProgressEvent,
} from "./types";
import { VideoProcessingEngine } from "./VideoProcessingEngine";
import { AIHistoryManager } from "../runtime/AIHistoryManager";

export interface VideoJobRecord {
  id: string;
  taskType: VideoAITaskType;
  toolId?: string;
  actionName?: string;
  targetClipId?: string;
  targetMediaId?: string;
  status: VideoAIStage;
  progress: number; // 0 - 100
  stageMessage: string;
  currentFrame: number;
  totalFrames: number;
  sourceFps: number;
  processingFps: number;
  fps: number;
  elapsedMs: number;
  etaSeconds: number;
  inputMediaUrl: string;
  inputMediaName?: string;
  outputUrl?: string;
  outputBlob?: Blob;
  result?: VideoAIResult;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export class VideoJobManager {
  private static instance: VideoJobManager;

  private get engine(): VideoProcessingEngine {
    return VideoProcessingEngine.getInstance();
  }
  private jobs = new Map<string, VideoJobRecord>();
  private activeJobId: string | null = null;
  private activeAbortControllers = new Map<string, AbortController>();

  private activeListeners = new Set<(activeJob: VideoJobRecord | null) => void>();
  private jobListeners = new Map<string, Set<(job: VideoJobRecord) => void>>();
  private allJobsListeners = new Set<(jobs: VideoJobRecord[]) => void>();
  private completionListeners = new Set<(job: VideoJobRecord) => void>();

  public static getInstance(): VideoJobManager {
    if (!VideoJobManager.instance) {
      VideoJobManager.instance = new VideoJobManager();
    }
    return VideoJobManager.instance;
  }

  private constructor() {
    console.log("[VideoJobManager] Global Video Job Manager initialized.");
  }

  public subscribeCompleted(listener: (job: VideoJobRecord) => void): () => void {
    this.completionListeners.add(listener);
    return () => {
      this.completionListeners.delete(listener);
    };
  }

  // --------------------------------------------------------------------------
  // JOB CREATION & EXECUTION
  // --------------------------------------------------------------------------

  public async startJob(params: {
    taskType: VideoAITaskType;
    videoInput: string | Blob | File;
    options?: VideoAIOptions;
    toolId?: string;
    actionName?: string;
    targetClipId?: string;
    targetMediaId?: string;
    inputMediaUrl: string;
    inputMediaName?: string;
  }): Promise<VideoAIResult> {
    const {
      taskType,
      videoInput,
      options,
      toolId,
      actionName,
      targetClipId,
      targetMediaId,
      inputMediaUrl,
      inputMediaName,
    } = params;

    const jobId = options?.jobId || `video_job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const abortController = new AbortController();
    this.activeAbortControllers.set(jobId, abortController);

    // Initial Job Record
    const jobRecord: VideoJobRecord = {
      id: jobId,
      taskType,
      toolId,
      actionName,
      targetClipId,
      targetMediaId,
      status: "QUEUED",
      progress: 0,
      stageMessage: "جاري جدولة مهمة الفيديو بالذكاء الاصطناعي...",
      currentFrame: 0,
      totalFrames: 0,
      sourceFps: 0,
      processingFps: 0,
      fps: 0,
      elapsedMs: 0,
      etaSeconds: 0,
      inputMediaUrl,
      inputMediaName,
      startedAt: Date.now(),
    };

    this.jobs.set(jobId, jobRecord);
    this.activeJobId = jobId;
    this.notifyJobChange(jobRecord);
    this.notifyActiveChange();

    console.log(`[VideoJobManager] Starting video job ${jobId} (${taskType})`);

    const executionPromise = (async (): Promise<VideoAIResult> => {
      try {
        const result = taskType === "remove-video-background"
          ? await this.engine.removeVideoBackground(videoInput, {
              ...options,
              jobId,
              abortSignal: abortController.signal,
              onProgress: (p) => this.handleEngineProgress(jobId, p, options?.onProgress),
            })
          : await this.engine.enhanceVideo(videoInput, {
              ...options,
              jobId,
              abortSignal: abortController.signal,
              onProgress: (p) => this.handleEngineProgress(jobId, p, options?.onProgress),
            });

        // Update Job Record on Success
        jobRecord.status = "COMPLETED";
        jobRecord.progress = 100;
        jobRecord.stageMessage = "اكتملت معالجة الفيديو بنجاح!";
        jobRecord.outputUrl = result.outputUrl;
        jobRecord.outputBlob = result.blob;
        jobRecord.result = result;
        jobRecord.completedAt = Date.now();
        jobRecord.elapsedMs = Date.now() - jobRecord.startedAt;

        this.notifyJobChange(jobRecord);
        this.notifyCompletion(jobRecord);
        if (this.activeJobId === jobId) {
          this.activeJobId = null;
          this.notifyActiveChange();
        }

        // Safe History Recording
        try {
          AIHistoryManager.getInstance().recordJob(
            taskType === "remove-video-background" ? "background-removal" : "enhance-media",
            result.appliedEngine || "VideoProcessingEngine",
            result.executionTimeMs || jobRecord.elapsedMs,
            `hash_${jobId}`,
            true,
            actionName || taskType,
            "Video AI Completed",
            result
          );
        } catch (histErr) {
          console.warn("[VideoJobManager] Non-fatal history record warning:", histErr);
        }

        console.log(`[VideoJobManager] Video job ${jobId} COMPLETED successfully in ${jobRecord.elapsedMs}ms`);
        return result;
      } catch (err: any) {
        if (abortController.signal.aborted || err?.message?.includes("إلغاء") || err?.message?.includes("cancel")) {
          jobRecord.status = "CANCELLED";
          jobRecord.stageMessage = "تم إلغاء معالجة الفيديو.";
          console.log(`[VideoJobManager] Video job ${jobId} was CANCELLED.`);
        } else {
          jobRecord.status = "FAILED";
          jobRecord.error = err?.message || String(err);
          jobRecord.stageMessage = `فشلت المعالجة: ${jobRecord.error}`;
          console.error(`[VideoJobManager] Video job ${jobId} FAILED:`, err);
        }

        jobRecord.completedAt = Date.now();
        jobRecord.elapsedMs = Date.now() - jobRecord.startedAt;

        this.notifyJobChange(jobRecord);
        if (this.activeJobId === jobId) {
          this.activeJobId = null;
          this.notifyActiveChange();
        }

        throw err;
      } finally {
        this.activeAbortControllers.delete(jobId);
      }
    })();

    return executionPromise;
  }

  // --------------------------------------------------------------------------
  // PROGRESS HANDLER
  // --------------------------------------------------------------------------

  private handleEngineProgress(
    jobId: string,
    p: VideoProgressEvent,
    externalCallback?: (event: VideoProgressEvent) => void
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = p.stage;
    job.progress = Math.min(100, Math.max(0, p.percentage));
    job.currentFrame = p.currentFrame;
    job.totalFrames = p.totalFrames;
    job.sourceFps = p.sourceFps || p.fps;
    job.processingFps = p.processingFps || 0;
    job.fps = p.sourceFps || p.fps;
    job.elapsedMs = p.elapsedMs;
    job.etaSeconds = p.etaSeconds;
    job.stageMessage = p.message;

    this.notifyJobChange(job);
    if (this.activeJobId === jobId) {
      this.notifyActiveChange();
    }

    if (externalCallback) {
      try {
        externalCallback(p);
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // CANCELLATION & CLEANUP
  // --------------------------------------------------------------------------

  public cancelJob(jobId: string): void {
    console.log(`[VideoJobManager] Explicit cancel requested for job: ${jobId}`);
    
    // 1. Abort local controller
    const controller = this.activeAbortControllers.get(jobId);
    if (controller) {
      try { controller.abort(); } catch {}
      this.activeAbortControllers.delete(jobId);
    }

    // 2. Delegate to engine
    try {
      this.engine.cancelJob(jobId);
    } catch {}

    // 3. Update job state
    const job = this.jobs.get(jobId);
    if (job && job.status !== "COMPLETED") {
      job.status = "CANCELLED";
      job.stageMessage = "تم إلغاء العملية بواسطة المستخدم.";
      job.completedAt = Date.now();
      this.notifyJobChange(job);
    }

    if (this.activeJobId === jobId) {
      this.activeJobId = null;
      this.notifyActiveChange();
    }
  }

  public cancelActiveJob(): void {
    if (this.activeJobId) {
      this.cancelJob(this.activeJobId);
    }
  }

  public clearJob(jobId: string): void {
    this.jobs.delete(jobId);
    this.jobListeners.delete(jobId);
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
      this.notifyActiveChange();
    }
    this.notifyAllJobsChange();
  }

  public clearCompleted(): void {
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
        this.jobs.delete(id);
      }
    }
    this.notifyAllJobsChange();
  }

  // --------------------------------------------------------------------------
  // STATE ACCESSORS
  // --------------------------------------------------------------------------

  public getActiveJob(): VideoJobRecord | null {
    if (!this.activeJobId) return null;
    const job = this.jobs.get(this.activeJobId);
    if (!job || job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
      return null;
    }
    return job;
  }

  public getJob(jobId: string): VideoJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  public getLatestJob(): VideoJobRecord | undefined {
    const list = Array.from(this.jobs.values());
    return list[list.length - 1];
  }

  public getLatestCompletedJob(): VideoJobRecord | undefined {
    const list = Array.from(this.jobs.values());
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].status === "COMPLETED" && list[i].result) {
        return list[i];
      }
    }
    return undefined;
  }

  public getAllJobs(): VideoJobRecord[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  // --------------------------------------------------------------------------
  // SUBSCRIPTION SYSTEM
  // --------------------------------------------------------------------------

  public subscribeActive(listener: (activeJob: VideoJobRecord | null) => void): () => void {
    this.activeListeners.add(listener);
    // Push current value immediately
    listener(this.getActiveJob());
    return () => {
      this.activeListeners.delete(listener);
    };
  }

  public subscribeJob(jobId: string, listener: (job: VideoJobRecord) => void): () => void {
    if (!this.jobListeners.has(jobId)) {
      this.jobListeners.set(jobId, new Set());
    }
    this.jobListeners.get(jobId)!.add(listener);
    const current = this.jobs.get(jobId);
    if (current) {
      listener(current);
    }
    return () => {
      const set = this.jobListeners.get(jobId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.jobListeners.delete(jobId);
      }
    };
  }

  public subscribeAll(listener: (jobs: VideoJobRecord[]) => void): () => void {
    this.allJobsListeners.add(listener);
    listener(this.getAllJobs());
    return () => {
      this.allJobsListeners.delete(listener);
    };
  }

  private notifyJobChange(job: VideoJobRecord): void {
    const set = this.jobListeners.get(job.id);
    if (set) {
      set.forEach((fn) => {
        try { fn(job); } catch {}
      });
    }
    this.notifyAllJobsChange();
  }

  private notifyActiveChange(): void {
    const active = this.getActiveJob();
    this.activeListeners.forEach((fn) => {
      try { fn(active); } catch {}
    });
  }

  private notifyAllJobsChange(): void {
    const list = this.getAllJobs();
    this.allJobsListeners.forEach((fn) => {
      try { fn(list); } catch {}
    });
  }

  private notifyCompletion(job: VideoJobRecord): void {
    this.completionListeners.forEach((fn) => {
      try { fn(job); } catch (e) {
        console.error("[VideoJobManager] Error in completion listener:", e);
      }
    });
  }
}
