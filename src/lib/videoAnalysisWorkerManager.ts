// Video Analysis Worker Manager with zero-copy buffer transfer and main-thread fallback
import type { FrameBufferData, WorkerSegmentResult } from "./workers/videoAnalysis.worker";

interface PendingRequest {
  resolve: (results: WorkerSegmentResult[]) => void;
  reject: (err: Error) => void;
}

export class VideoAnalysisWorkerManager {
  private static instance: VideoAnalysisWorkerManager | null = null;
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private isSupported = false;

  private constructor() {
    this.initWorker();
  }

  public static getInstance(): VideoAnalysisWorkerManager {
    if (!VideoAnalysisWorkerManager.instance) {
      VideoAnalysisWorkerManager.instance = new VideoAnalysisWorkerManager();
    }
    return VideoAnalysisWorkerManager.instance;
  }

  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      this.isSupported = false;
      return;
    }

    try {
      this.worker = new Worker(
        new URL("./workers/videoAnalysis.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, results, error } = e.data || {};
        if (!id) return;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        this.pendingRequests.delete(id);

        if (type === "ANALYZE_FRAMES_SUCCESS" && results) {
          pending.resolve(results);
        } else {
          pending.reject(new Error(error || "Worker analysis failed"));
        }
      };

      this.worker.onerror = (err) => {
        console.warn("[VideoAnalysisWorkerManager] Worker encountered error:", err);
      };

      this.isSupported = true;
    } catch (e) {
      console.warn("[VideoAnalysisWorkerManager] Failed to init worker, using fast inline fallback:", e);
      this.isSupported = false;
    }
  }

  /**
   * Analyzes an array of video frame buffers in background Web Worker
   * Zero-copy transfer using ArrayBuffer transferables
   */
  public async analyzeFrames(
    frames: FrameBufferData[],
    segments: Array<{ in: number; out: number }>
  ): Promise<WorkerSegmentResult[]> {
    if (this.isSupported && this.worker) {
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const transferList = frames.map((f) => f.buffer).filter(Boolean);

      return new Promise<WorkerSegmentResult[]>((resolve, reject) => {
        const timeoutMs = Math.min(30000, 8000 + 400 * frames.length);
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error("Worker analysis timed out"));
        }, timeoutMs);

        this.pendingRequests.set(id, {
          resolve: (res) => {
            clearTimeout(timeout);
            resolve(res);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });

        try {
          this.worker!.postMessage(
            {
              type: "ANALYZE_FRAMES",
              id,
              payload: { frames, segments },
            },
            transferList
          );
        } catch (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          try {
            resolve(this.fallbackInlineAnalysis(frames, segments));
          } catch (fallbackErr) {
            reject(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
          }
        }
      });
    }

    return this.fallbackInlineAnalysis(frames, segments);
  }

  /**
   * Throws an explicit error when the worker is unavailable so autoMontage
   * catches it and uses buildFallbackSegments (with fallback: true and warning).
   */
  private fallbackInlineAnalysis(
    _frames: FrameBufferData[],
    _segments: Array<{ in: number; out: number }>
  ): WorkerSegmentResult[] {
    throw new Error("Video analysis worker unavailable");
  }

  /**
   * Dispose worker instance to immediately free resources
   */
  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isSupported = false;
    }
    this.pendingRequests.clear();
    VideoAnalysisWorkerManager.instance = null;
  }
}
