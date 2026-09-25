import { describe, it, expect, beforeEach, vi } from "vitest";
import { BackgroundJobService } from "../BackgroundJobService";

describe("Phase 9: Native Background Job Service", () => {
  let jobService: BackgroundJobService;

  beforeEach(() => {
    jobService = BackgroundJobService.getInstance();
    vi.clearAllMocks();
  });

  it("starts a background job and transitions status to running", async () => {
    const job = await jobService.startJob({
      title: "Exporting 4K Video",
      taskType: "export",
      initialStage: "Preparing frames...",
    });

    expect(job.id).toBeDefined();
    expect(job.title).toBe("Exporting 4K Video");
    expect(job.status).toBe("running");
    expect(job.progress).toBe(0);
    expect(job.stageMessage).toBe("Preparing frames...");
  });

  it("updates progress and stage message", async () => {
    const job = await jobService.startJob({
      title: "Downloading Model",
      taskType: "model_download",
    });

    const updated = await jobService.updateProgress(job.id, 45, "Downloading chunk 2/5...");
    expect(updated).toBe(true);

    const active = jobService.getActiveJobs().find((j) => j.id === job.id);
    expect(active?.progress).toBe(45);
    expect(active?.stageMessage).toBe("Downloading chunk 2/5...");
  });

  it("completes a background job successfully", async () => {
    const job = await jobService.startJob({
      title: "Generating Proxy Video",
      taskType: "proxy",
    });

    const finished = await jobService.finishJob(job.id, true);
    expect(finished?.status).toBe("completed");
    expect(finished?.progress).toBe(100);
    expect(finished?.completedAt).toBeDefined();

    // Should no longer be in active jobs
    expect(jobService.getActiveJobs().some((j) => j.id === job.id)).toBe(false);
  });

  it("cancels a background job on demand", async () => {
    const job = await jobService.startJob({
      title: "AI Batch Processing",
      taskType: "ai_batch",
    });

    const cancelled = await jobService.cancelJob(job.id);
    expect(cancelled).toBe(true);

    const all = jobService.getAllJobs().find((j) => j.id === job.id);
    expect(all?.status).toBe("cancelled");
  });

  it("notifies progress listeners when job state changes", async () => {
    const listener = vi.fn();
    const unsubscribe = jobService.subscribe(listener);

    const job = await jobService.startJob({
      title: "Rendering Subtitles",
      taskType: "general",
    });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: job.id, status: "running" }));

    await jobService.updateProgress(job.id, 80, "Rendering frames...");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: job.id, progress: 80 }));

    unsubscribe();
  });
});
