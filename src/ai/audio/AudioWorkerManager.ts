/**
 * Audio Worker Manager
 * Safe main-thread bridge to audioProcessing.worker with transferables and job cancellation.
 */

import { WorkerAudioTask, WorkerAudioResponse } from "./audioProcessing.worker";

export class AudioWorkerManager {
  private static instance: AudioWorkerManager;
  private worker: Worker | null = null;
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }
  > = new Map();

  private constructor() {
    this.initWorker();
  }

  public static getInstance(): AudioWorkerManager {
    if (!AudioWorkerManager.instance) {
      AudioWorkerManager.instance = new AudioWorkerManager();
    }
    return AudioWorkerManager.instance;
  }

  private initWorker(): void {
    try {
      // Standard Vite worker constructor
      this.worker = new Worker(
        new URL("./audioProcessing.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (e: MessageEvent<WorkerAudioResponse>) => {
        const { id, success, result, error } = e.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        this.pendingRequests.delete(id);

        if (success) {
          pending.resolve(result);
        } else {
          const errDetail = error || "Worker processing error";
          console.error(`[AudioWorkerManager] Worker task "${id}" failed:`, errDetail);
          pending.reject(new Error(errDetail));
        }
      };

      this.worker.onerror = (err: ErrorEvent) => {
        const errorMsg = err.message || "Worker execution failure";
        console.error("[AudioWorkerManager] Worker global error event:", errorMsg, err);
        // Fail all pending tasks gracefully with real error
        for (const [id, pending] of this.pendingRequests.entries()) {
          pending.reject(new Error(`Worker crash: ${errorMsg}`));
        }
        this.pendingRequests.clear();
      };
    } catch (e) {
      console.error("[AudioWorkerManager] Worker initialization failed:", e);
    }
  }

  public isReady(): boolean {
    return this.worker !== null;
  }

  public cancelTask(id: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      this.pendingRequests.delete(id);
      pending.reject(new DOMException(`Audio task ${id} was cancelled`, "AbortError"));
    }
    if (this.worker) {
      try {
        this.worker.postMessage({ id, type: "cancel", sampleRate: 0, channels: [] });
      } catch (err) {
        console.warn(`[AudioWorkerManager] Failed to send cancel to worker:`, err);
      }
    }
  }

  public async runTask<TResult = any>(
    task: WorkerAudioTask,
    transferableBuffers: ArrayBuffer[] = []
  ): Promise<TResult> {
    if (!this.worker) {
      this.initWorker();
    }

    if (!this.worker) {
      throw new Error("Audio Web Worker could not be initialized in this browser environment");
    }

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(task.id, { resolve, reject });
      this.worker!.postMessage(task, transferableBuffers);
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}
