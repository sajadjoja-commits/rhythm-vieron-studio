/**
 * Manages loading, caching, memory optimization, and unloading of local WebAssembly / WebGPU AI models
 */
export interface LocalModelMeta {
  id: string;
  name: string;
  sizeBytes?: number;
  isLoaded: boolean;
  modelInstance?: any;
}

export class LocalModelLoader {
  private models: Map<string, LocalModelMeta> = new Map();

  /**
   * Register a local model definition
   */
  public registerModel(id: string, name: string): void {
    if (!this.models.has(id)) {
      this.models.set(id, { id, name, isLoaded: false });
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
   */
  public async getOrLoadModel<T = any>(
    id: string,
    loaderFn: () => Promise<T>
  ): Promise<T> {
    const existing = this.models.get(id);
    if (existing?.isLoaded && existing.modelInstance) {
      return existing.modelInstance as T;
    }

    console.log(`[AI LocalModelLoader] Loading model into memory: ${id}...`);
    const instance = await loaderFn();
    this.models.set(id, {
      id,
      name: existing?.name || id,
      isLoaded: true,
      modelInstance: instance,
    });
    return instance;
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
