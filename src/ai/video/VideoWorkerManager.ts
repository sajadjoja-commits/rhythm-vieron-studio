/**
 * Video Worker Manager
 * Manages background video processing jobs, tracking active job states, progress and cancellation.
 */

import { VideoAITaskType, VideoAIOptions, VideoAIResult } from "./types";
import { VideoJobManager, VideoJobRecord } from "./VideoJobManager";

export class VideoWorkerManager {
  private static instance: VideoWorkerManager;
  private jobManager = VideoJobManager.getInstance();

  public static getInstance(): VideoWorkerManager {
    if (!VideoWorkerManager.instance) {
      VideoWorkerManager.instance = new VideoWorkerManager();
    }
    return VideoWorkerManager.instance;
  }

  public async runVideoTask(
    taskType: VideoAITaskType,
    videoInput: string | Blob | File,
    options?: VideoAIOptions
  ): Promise<VideoAIResult> {
    const inputMediaUrl = typeof videoInput === "string" ? videoInput : "uploaded_video";
    return this.jobManager.startJob({
      taskType,
      videoInput,
      options,
      inputMediaUrl,
    });
  }

  public cancelJob(jobId: string): void {
    this.jobManager.cancelJob(jobId);
  }

  public getActiveJob(): VideoJobRecord | null {
    return this.jobManager.getActiveJob();
  }
}
