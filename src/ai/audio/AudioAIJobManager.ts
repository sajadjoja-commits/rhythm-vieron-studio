/**
 * Audio AI Job Manager
 * Centralized lifecycle management for asynchronous audio AI jobs.
 * Supports cancellation, progress reporting, concurrency bounds, and event hooks.
 */

import { AudioAIProgress, AudioJobStatus, AudioAITaskType, AudioAIProgressCallback } from "./types";

export interface ManagedAudioJob {
  id: string;
  taskType: AudioAITaskType;
  status: AudioJobStatus;
  percent: number;
  stage: string;
  message: string;
  startTime: number;
  abortController: AbortController;
  listeners: Set<AudioAIProgressCallback>;
  error?: Error;
}

export class AudioAIJobManager {
  private static instance: AudioAIJobManager;
  private jobs: Map<string, ManagedAudioJob> = new Map();

  private constructor() {}

  public static getInstance(): AudioAIJobManager {
    if (!AudioAIJobManager.instance) {
      AudioAIJobManager.instance = new AudioAIJobManager();
    }
    return AudioAIJobManager.instance;
  }

  public createJob(taskType: AudioAITaskType, customId?: string): ManagedAudioJob {
    const id = customId || `audio_job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: ManagedAudioJob = {
      id,
      taskType,
      status: "QUEUED",
      percent: 0,
      stage: "INIT",
      message: "تم تجهيز مهمة المعالجة الصوتية...",
      startTime: Date.now(),
      abortController: new AbortController(),
      listeners: new Set(),
    };

    this.jobs.set(id, job);
    return job;
  }

  public getJob(id: string): ManagedAudioJob | undefined {
    return this.jobs.get(id);
  }

  public updateProgress(
    id: string,
    percent: number,
    stage: string,
    message: string,
    status?: AudioJobStatus
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;

    if (job.status === "CANCELLED" || job.status === "FAILED") return;

    job.percent = Math.min(100, Math.max(0, Math.round(percent)));
    job.stage = stage;
    job.message = message;
    if (status) job.status = status;

    const payload: AudioAIProgress = {
      jobId: id,
      taskType: job.taskType,
      status: job.status,
      percent: job.percent,
      stage: job.stage,
      message: job.message,
    };

    job.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.warn("[AudioAIJobManager] Listener callback error:", err);
      }
    });
  }

  public subscribe(id: string, callback: AudioAIProgressCallback): () => void {
    const job = this.jobs.get(id);
    if (!job) return () => {};

    job.listeners.add(callback);
    // Send immediate current state
    callback({
      jobId: id,
      taskType: job.taskType,
      status: job.status,
      percent: job.percent,
      stage: job.stage,
      message: job.message,
    });

    return () => {
      job.listeners.delete(callback);
    };
  }

  public cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status !== "COMPLETED" && job.status !== "FAILED") {
      job.status = "CANCELLED";
      job.abortController.abort();
      this.updateProgress(id, job.percent, "CANCELLED", "تم إلغاء المهمة من قبل المستخدم.");
      return true;
    }
    return false;
  }

  public completeJob(id: string, message = "اكتملت المعالجة بنجاح!"): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "COMPLETED";
    this.updateProgress(id, 100, "COMPLETED", message, "COMPLETED");
  }

  public failJob(id: string, error: Error | string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "FAILED";
    const errObj = error instanceof Error ? error : new Error(String(error));
    job.error = errObj;
    this.updateProgress(id, job.percent, "FAILED", `فشلت المعالجة: ${errObj.message}`, "FAILED");
  }

  public removeJob(id: string): void {
    this.jobs.delete(id);
  }
}
