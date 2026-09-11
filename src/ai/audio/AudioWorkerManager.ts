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
          pending.reject(new Error(error || "Worker processing error"));
        }
      };

      this.worker.onerror = (err) => {
        console.error("[AudioWorkerManager] Worker global error:", err);
      };
    } catch (e) {
      console.warn("[AudioWorkerManager] Worker initialization failed:", e);
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
      throw new Error("Audio Web Worker could not be initialized");
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
