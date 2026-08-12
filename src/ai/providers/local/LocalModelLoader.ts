import { AIProgressManager } from "../../runtime/AIProgressManager";

/**
 * Manages loading, caching, memory optimization, and unloading of local WebAssembly / WebGPU AI models
 */
export interface LocalModelMeta {
  id: string;
  name: string;
  version?: string;
  sizeBytes?: number;
  isLoaded: boolean;
  modelInstance?: any;
  checksum?: string;
}

export class LocalModelLoader {
  private models: Map<string, LocalModelMeta> = new Map();
  private progressManager?: AIProgressManager;

  public setProgressManager(pm: AIProgressManager): void {
    this.progressManager = pm;
  }

  /**
   * Register a local model definition
   */
  public registerModel(id: string, name: string, version?: string, checksum?: string): void {
    if (!this.models.has(id)) {
      this.models.set(id, { id, name, version, isLoaded: false, checksum });
    }
  }

  /**
   * Check if model is loaded into memory
   */
  public isLoaded(id: string): boolean {
    return Boolean(this.models.get(id)?.isLoaded);
  }

  /**
   * Gets loaded model instance or loads it via provided loader factory
   * Supports Progress reporting and AbortSignal
   */
  public async getOrLoadModel<T = any>(
    id: string,
    loaderFn: (signal?: AbortSignal) => Promise<T>,
    options?: {
      jobId?: string;
      signal?: AbortSignal;
      retryCount?: number;
    }
  ): Promise<T> {
    const existing = this.models.get(id);
    if (existing?.isLoaded && existing.modelInstance) {
      return existing.modelInstance as T;
    }

    const retries = options?.retryCount ?? 2;
    let lastError: any;

    for (let i = 0; i <= retries; i++) {
      try {
        if (options?.jobId && this.progressManager) {
          this.progressManager.updateProgress(
            options.jobId,
            65,
            `Loading model: ${existing?.name || id} (Attempt ${i + 1})`,
            "processing"
          );
        }

        console.log(`[AI LocalModelLoader] Loading model into memory: ${id}...`);
        const instance = await loaderFn(options?.signal);

        this.models.set(id, {
          id,
          name: existing?.name || id,
          isLoaded: true,
          modelInstance: instance,
          version: existing?.version,
          checksum: existing?.checksum
        });

        if (options?.jobId && this.progressManager) {
          this.progressManager.updateProgress(options.jobId, 75, "Model Loaded", "processing");
        }

        return instance;
      } catch (err) {
        lastError = err;
        console.warn(`[AI LocalModelLoader] Load failed for ${id} (Attempt ${i + 1}):`, err);
        if (options?.signal?.aborted) throw err;
        if (i < retries) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error(`Failed to load local model ${id} after ${retries + 1} attempts`);
  }

  /**
   * Unload specific model to free WebGL / WebGPU / WASM RAM
   */
  public async unloadModel(id: string): Promise<void> {
    const meta = this.models.get(id);
    if (meta && meta.isLoaded) {
      if (meta.modelInstance && typeof meta.modelInstance.dispose === "function") {
        try {
          meta.modelInstance.dispose();
        } catch {
          // Ignore
        }
      }
      meta.isLoaded = false;
      meta.modelInstance = undefined;
      console.log(`[AI LocalModelLoader] Unloaded local model: ${id}`);
    }
  }

  /**
   * Unload all loaded local models
   */
  public async unloadAll(): Promise<void> {
    for (const id of this.models.keys()) {
      await this.unloadModel(id);
    }
  }
}
