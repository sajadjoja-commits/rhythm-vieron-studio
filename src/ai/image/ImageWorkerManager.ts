import { WorkerMessageRequest, WorkerMessageResponse } from './worker';

export interface WorkerJobCallbacks {
  onProgress?: (stage: string, percent: number) => void;
  resolve: (res: WorkerMessageResponse) => void;
  reject: (err: Error) => void;
}

export class ImageWorkerManager {
  private static instance: ImageWorkerManager | null = null;
  private worker: Worker | null = null;
  private pendingJobs: Map<string, WorkerJobCallbacks> = new Map();
  private nextJobId = 1;

  private constructor() {
    this.initWorker();
  }

  public static getInstance(): ImageWorkerManager {
    if (!ImageWorkerManager.instance) {
      ImageWorkerManager.instance = new ImageWorkerManager();
    }
    return ImageWorkerManager.instance;
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (e: MessageEvent<WorkerMessageResponse>) => {
        const msg = e.data;
        const job = this.pendingJobs.get(msg.id);
        if (!job) return;

        if (msg.type === 'PROGRESS') {
          job.onProgress?.(msg.stage || '', msg.percent || 0);
        } else if (msg.type === 'RESULT') {
          this.pendingJobs.delete(msg.id);
          job.resolve(msg);
        } else if (msg.type === 'ERROR') {
          this.pendingJobs.delete(msg.id);
          job.reject(new Error(msg.error || 'Worker operation failed'));
        }
      };

      this.worker.onerror = (err) => {
        console.error('Image Worker Error:', err);
      };
    } catch (e) {
      console.warn('Web Worker initialization error, running in fallback mode:', e);
    }
  }

  /**
   * Run background removal asynchronously in Web Worker with zero-copy Transferable ImageBitmap
   */
  public async removeBackground(
    bitmap: ImageBitmap,
    preferredModel: 'auto' | 'mediapipe-selfie' | 'u2netp-general' = 'auto',
    onProgress?: (stage: string, percent: number) => void
  ): Promise<WorkerMessageResponse> {
    if (!this.worker) {
      this.initWorker();
    }

    const id = `job_${this.nextJobId++}_${Date.now()}`;

    return new Promise<WorkerMessageResponse>((resolve, reject) => {
      this.pendingJobs.set(id, { resolve, reject, onProgress });

      const request: WorkerMessageRequest = {
        type: 'REMOVE_BACKGROUND',
        id,
        imageBitmap: bitmap,
        preferredModel
      };

      // Transfer imageBitmap ownership to worker
      this.worker?.postMessage(request, [bitmap]);
    });
  }

  /**
   * Refine mask using manual brush stroke
   */
  public async refineMaskWithBrush(
    mask: Float32Array,
    width: number,
    height: number,
    points: Array<{ x: number; y: number }>,
    mode: 'add' | 'erase',
    radius: number,
    hardness: number
  ): Promise<Float32Array> {
    const id = `brush_${this.nextJobId++}_${Date.now()}`;

    // Clone mask buffer for transfer
    const buffer = mask.buffer.slice(0) as ArrayBuffer;

    return new Promise<Float32Array>((resolve, reject) => {
      this.pendingJobs.set(id, {
        resolve: (res) => {
          if (res.maskBuffer) {
            resolve(new Float32Array(res.maskBuffer));
          } else {
            reject(new Error('Missing mask buffer in result'));
          }
        },
        reject
      });

      const request: WorkerMessageRequest = {
        type: 'REFINE_MASK_BRUSH',
        id,
        maskBuffer: buffer,
        width,
        height,
        brushParams: { points, mode, radius, hardness }
      };

      this.worker?.postMessage(request, [buffer]);
    });
  }

  /**
   * Run inpainting object removal asynchronously in Web Worker
   */
  public async removeObject(
    bitmap: ImageBitmap,
    mask: Float32Array,
    width: number,
    height: number,
    options?: {
      modelMode?: 'migan-512' | 'push-pull';
      dilatePx?: number;
      featherPx?: number;
      seed?: number;
      onProgress?: (stage: string, percent: number) => void;
    }
  ): Promise<WorkerMessageResponse> {
    if (!this.worker) {
      this.initWorker();
    }

    const id = `inpaint_${this.nextJobId++}_${Date.now()}`;
    const maskBuffer = mask.buffer.slice(0) as ArrayBuffer;

    return new Promise<WorkerMessageResponse>((resolve, reject) => {
      this.pendingJobs.set(id, {
        resolve,
        reject,
        onProgress: options?.onProgress
      });

      const request: WorkerMessageRequest = {
        type: 'REMOVE_OBJECT',
        id,
        imageBitmap: bitmap,
        maskBuffer,
        width,
        height,
        modelMode: options?.modelMode || 'push-pull',
        dilatePx: options?.dilatePx ?? 6,
        featherPx: options?.featherPx ?? 2,
        seed: options?.seed ?? 42
      };

      this.worker?.postMessage(request, [bitmap, maskBuffer]);
    });
  }

  /**
   * Run local image outpainting expansion asynchronously in Web Worker
   */
  public async expandImage(
    bitmap: ImageBitmap,
    origW: number,
    origH: number,
    targetW: number,
    targetH: number,
    originX: number,
    originY: number,
    options?: {
      modelMode?: 'migan-512' | 'push-pull' | 'fast-preview';
      seed?: number;
      signal?: AbortSignal;
      onProgress?: (stage: string, percent: number) => void;
    }
  ): Promise<WorkerMessageResponse> {
    if (!this.worker) {
      this.initWorker();
    }

    const id = `expand_${this.nextJobId++}_${Date.now()}`;

    return new Promise<WorkerMessageResponse>((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new DOMException('Expansion aborted by user', 'AbortError'));
        return;
      }

      const onAbort = () => {
        this.pendingJobs.delete(id);
        reject(new DOMException('Expansion aborted by user', 'AbortError'));
      };

      if (options?.signal) {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingJobs.set(id, {
        resolve: (res) => {
          if (options?.signal) {
            options.signal.removeEventListener('abort', onAbort);
          }
          resolve(res);
        },
        reject: (err) => {
          if (options?.signal) {
            options.signal.removeEventListener('abort', onAbort);
          }
          reject(err);
        },
        onProgress: options?.onProgress
      });

      const request: WorkerMessageRequest = {
        type: 'EXPAND_IMAGE',
        id,
        imageBitmap: bitmap,
        width: origW,
        height: origH,
        targetW,
        targetH,
        originX,
        originY,
        modelMode: options?.modelMode || 'push-pull',
        seed: options?.seed ?? 42
      };

      this.worker?.postMessage(request, [bitmap]);
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingJobs.clear();
  }
}
