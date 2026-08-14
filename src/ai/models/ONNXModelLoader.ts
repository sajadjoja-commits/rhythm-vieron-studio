import * as ort from "onnxruntime-web";
import { openDB, IDBPDatabase } from "idb";
import { sha256 } from "hash-wasm";
import { AIProgressManager } from "../runtime/AIProgressManager";

export interface ModelManifest {
  id: string;
  name: string;
  version: string;
  sizeBytes: number;
  expectedSha256?: string;
  urls: string[];
  inputShape: number[];
  outputShape: number[];
}

const DB_NAME = "ai_models_store";
const DB_VERSION = 1;
const STORE_NAME = "onnx_models";

interface StoredModelRecord {
  id: string;
  version: string;
  data: ArrayBuffer;
  sha256Hash: string;
  updatedAt: number;
}

export class ONNXModelLoader {
  private static instance: ONNXModelLoader;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private sessionCache: Map<string, ort.InferenceSession> = new Map();
  private loadingPromiseMap: Map<string, Promise<{ session: ort.InferenceSession; providerUsed: string; fromCache: boolean }>> = new Map();

  private constructor() {
    this.initORT();
  }

  public static getInstance(): ONNXModelLoader {
    if (!ONNXModelLoader.instance) {
      ONNXModelLoader.instance = new ONNXModelLoader();
    }
    return ONNXModelLoader.instance;
  }

  /**
   * Configure ONNX Runtime Web options for WebGPU, WASM SIMD, and multi-threading
   */
  private initORT(): void {
    try {
      if (typeof window !== "undefined") {
        const isIsolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
        ort.env.wasm.numThreads = isIsolated ? Math.min(navigator.hardwareConcurrency || 4, 4) : 1;
        ort.env.wasm.simd = true;
        ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
      }
    } catch (e) {
      console.warn("[ONNXModelLoader] Failed to set ORT environment options:", e);
    }
  }

  /**
   * Get IndexedDB instance
   */
  private async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * Load or Download ONNX InferenceSession with caching, version management, and cancellation support
   */
  public async loadModel(
    manifest: ModelManifest,
    signal?: AbortSignal
  ): Promise<{
    session: ort.InferenceSession;
    providerUsed: string;
    fromCache: boolean;
  }> {
    const cacheKey = `${manifest.id}_${manifest.version}`;

    if (signal?.aborted) {
      throw new Error(`[ONNXModelLoader] Model loading aborted for ${manifest.id}`);
    }

    // Return cached session in memory if already loaded
    if (this.sessionCache.has(cacheKey)) {
      return {
        session: this.sessionCache.get(cacheKey)!,
        providerUsed: "memory_cache",
        fromCache: true,
      };
    }

    // Return pending in-flight loading promise if already loading
    if (this.loadingPromiseMap.has(cacheKey)) {
      console.log(`[ONNXModelLoader] Joining in-flight model load lock for ${manifest.id}`);
      return this.loadingPromiseMap.get(cacheKey)!;
    }

    const loadPromise = (async () => {
      const progressManager = AIProgressManager.getInstance();
      progressManager.createProgress(`model_${manifest.id}`, `Checking local storage for model ${manifest.name}...`);
      progressManager.updateProgress(`model_${manifest.id}`, 0.05, `Checking local storage for model ${manifest.name}...`);

      let modelBuffer = await this.getModelFromIndexedDB(manifest.id, manifest.version);
      let fromCache = false;

      if (modelBuffer) {
        // Verify SHA-256 hash of cached model buffer if manifest specifies SHA-256
        if (manifest.expectedSha256) {
          progressManager.updateProgress(`model_${manifest.id}`, 0.1, "Verifying cached model SHA-256 integrity...");
          const uint8 = new Uint8Array(modelBuffer);
          const hash = await sha256(uint8);
          if (hash.toLowerCase() !== manifest.expectedSha256.toLowerCase()) {
            console.warn(`[ONNXModelLoader] Cached model SHA-256 mismatch! Expected ${manifest.expectedSha256}, got ${hash}. Purging corrupt cache.`);
            await this.purgeModelFromIndexedDB(manifest.id);
            modelBuffer = null;
          } else {
            console.log(`[ONNXModelLoader] Cached model SHA-256 verified successfully for ${manifest.id}`);
          }
        }
      }

      if (modelBuffer) {
        console.log(`[ONNXModelLoader] Loaded verified model "${manifest.name}" from IndexedDB cache.`);
        progressManager.updateProgress(`model_${manifest.id}`, 0.5, `Model "${manifest.name}" loaded from IndexedDB.`);
        fromCache = true;
      } else {
        console.log(`[ONNXModelLoader] Model "${manifest.name}" not in IndexedDB cache. Downloading...`);
        progressManager.updateProgress(`model_${manifest.id}`, 0.15, `Downloading model ${manifest.name}...`);
        
        modelBuffer = await this.downloadModelWithProgress(manifest, signal);
        
        // Verify SHA-256 integrity if hash is specified in manifest
        if (manifest.expectedSha256) {
          progressManager.updateProgress(`model_${manifest.id}`, 0.85, "Verifying downloaded SHA-256 integrity...");
          const uint8 = new Uint8Array(modelBuffer);
          const hash = await sha256(uint8);
          if (hash.toLowerCase() !== manifest.expectedSha256.toLowerCase()) {
            console.warn(`[ONNXModelLoader] Downloaded hash mismatch! Expected ${manifest.expectedSha256}, got ${hash}`);
            await this.purgeModelFromIndexedDB(manifest.id);
            throw new Error(`[ONNXModelLoader] SHA-256 hash verification failed for downloaded model ${manifest.id}`);
          } else {
            console.log(`[ONNXModelLoader] SHA-256 integrity verified successfully for downloaded model ${manifest.id}`);
          }
        }

        // Save to IndexedDB and purge old versions automatically
        await this.saveModelToIndexedDB(manifest.id, manifest.version, modelBuffer);
        await this.purgeOutdatedVersions(manifest.id, manifest.version);
      }

      if (signal?.aborted) {
        throw new Error(`[ONNXModelLoader] Session creation aborted for ${manifest.id}`);
      }

      progressManager.updateProgress(`model_${manifest.id}`, 0.9, `Initializing ONNX Runtime session for ${manifest.name}...`);

      let session: ort.InferenceSession;
      let providerUsed = "wasm";

      try {
        const res = await this.createInferenceSession(manifest, modelBuffer);
        session = res.session;
        providerUsed = res.providerUsed;
      } catch (sessionErr: any) {
        if (fromCache) {
          console.warn(`[ONNXModelLoader] Session creation failed for cached model "${manifest.id}". Purging corrupt cache and re-downloading...`, sessionErr);
          await this.purgeModelFromIndexedDB(manifest.id);
          fromCache = false;
          
          progressManager.updateProgress(`model_${manifest.id}`, 0.15, `Re-downloading model ${manifest.name}...`);
          modelBuffer = await this.downloadModelWithProgress(manifest, signal);
          
          if (manifest.expectedSha256) {
            const uint8 = new Uint8Array(modelBuffer);
            const hash = await sha256(uint8);
            if (hash.toLowerCase() !== manifest.expectedSha256.toLowerCase()) {
              await this.purgeModelFromIndexedDB(manifest.id);
              throw new Error(`[ONNXModelLoader] SHA-256 hash verification failed for model ${manifest.id}`);
            }
          }

          await this.saveModelToIndexedDB(manifest.id, manifest.version, modelBuffer);
          await this.purgeOutdatedVersions(manifest.id, manifest.version);

          const res = await this.createInferenceSession(manifest, modelBuffer);
          session = res.session;
          providerUsed = res.providerUsed;
        } else {
          throw sessionErr;
        }
      }

      this.sessionCache.set(cacheKey, session);
      progressManager.updateProgress(`model_${manifest.id}`, 1.0, `Model ${manifest.name} ready.`);

      return { session, providerUsed, fromCache };
    })();

    this.loadingPromiseMap.set(cacheKey, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromiseMap.delete(cacheKey);
    }
  }

  /**
   * Helper to attempt InferenceSession creation with WebGPU -> WASM SIMD / WASM fallback
   */
  private async createInferenceSession(
    manifest: ModelManifest,
    modelBuffer: ArrayBuffer
  ): Promise<{ session: ort.InferenceSession; providerUsed: string }> {
    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
    
    if (hasWebGPU) {
      try {
        const webgpuOptions: ort.InferenceSession.SessionOptions = {
          executionProviders: ["webgpu", "wasm"],
          graphOptimizationLevel: "all",
          executionMode: "sequential",
          enableCpuMemArena: true,
          enableMemPattern: true,
        };
        const session = await ort.InferenceSession.create(modelBuffer, webgpuOptions);
        console.log(`[ONNXModelLoader] InferenceSession created for ${manifest.id} using WebGPU execution provider.`);
        return { session, providerUsed: "webgpu" };
      } catch (err) {
        console.warn(`[ONNXModelLoader] WebGPU session creation failed for ${manifest.id}, falling back to WASM SIMD/WASM:`, err);
      }
    }

    try {
      const wasmOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
        executionMode: "sequential",
        enableCpuMemArena: true,
        enableMemPattern: true,
      };
      const session = await ort.InferenceSession.create(modelBuffer, wasmOptions);
      const isSimd = typeof ort !== "undefined" && ort.env?.wasm?.simd;
      const providerUsed = isSimd ? "wasm-simd" : "wasm";
      console.log(`[ONNXModelLoader] InferenceSession created for ${manifest.id} using ${providerUsed} execution provider.`);
      return { session, providerUsed };
    } catch (fallbackErr) {
      console.error(`[ONNXModelLoader] WASM session creation failed for ${manifest.id}:`, fallbackErr);
      throw new Error(`Failed to create ONNX InferenceSession for ${manifest.id}: ${String(fallbackErr)}`);
    }
  }

  /**
   * Fetch model file with progress reporting, AbortSignal, and fallback URLs
   */
  private async downloadModelWithProgress(manifest: ModelManifest, signal?: AbortSignal): Promise<ArrayBuffer> {
    const progressManager = AIProgressManager.getInstance();

    for (let urlIndex = 0; urlIndex < manifest.urls.length; urlIndex++) {
      if (signal?.aborted) {
        throw new Error(`Download aborted for model ${manifest.id}`);
      }

      const url = manifest.urls[urlIndex];
      try {
        console.log(`[ONNXModelLoader] Fetching model from URL: ${url}`);
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
        if (contentType.includes("text/html") || contentType.includes("text/plain")) {
          throw new Error(`URL ${url} returned ${contentType} instead of binary ONNX model file (likely SPA fallback)`);
        }

        const contentLength = response.headers.get("Content-Length");
        const totalBytes = contentLength ? parseInt(contentLength, 10) : manifest.sizeBytes;

        let buffer: ArrayBuffer;

        if (!response.body) {
          buffer = await response.arrayBuffer();
        } else {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let loadedBytes = 0;

          while (true) {
            if (signal?.aborted) {
              reader.cancel();
              throw new Error(`Download aborted for model ${manifest.id}`);
            }

            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            loadedBytes += value.byteLength;

            if (totalBytes > 0) {
              const pct = Math.min(0.8, 0.1 + (loadedBytes / totalBytes) * 0.7);
              const loadedMb = (loadedBytes / (1024 * 1024)).toFixed(1);
              const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
              progressManager.updateProgress(
                `model_${manifest.id}`,
                pct,
                `Downloading model ${manifest.name} (${loadedMb} MB / ${totalMb} MB)...`
              );
            }
          }

          const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const resultBuffer = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            resultBuffer.set(chunk, offset);
            offset += chunk.length;
          }
          buffer = resultBuffer.buffer;
        }

        // Validate buffer is not HTML string
        const checkBytes = new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength));
        if (checkBytes.length > 0 && checkBytes[0] === 60 && (checkBytes[1] === 33 || checkBytes[1] === 104)) {
          throw new Error(`Downloaded file from ${url} starts with HTML tags ('<'), not binary ONNX model`);
        }

        return buffer;
      } catch (err: any) {
        if (err?.name === "AbortError" || signal?.aborted) {
          throw new Error(`Download aborted for model ${manifest.id}`);
        }
        console.warn(`[ONNXModelLoader] Failed to download model from ${url}:`, err);
        if (urlIndex === manifest.urls.length - 1) {
          throw err;
        }
      }
    }

    throw new Error(`Failed to download model ${manifest.id} from all provided URLs.`);
  }

  /**
   * Purge single model record from IndexedDB
   */
  private async purgeModelFromIndexedDB(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.delete(STORE_NAME, id);
      console.log(`[ONNXModelLoader] Purged model record ${id} from IndexedDB.`);
    } catch (e) {
      console.warn("[ONNXModelLoader] Error purging model from IndexedDB:", e);
    }
  }

  /**
   * Get cached model from IndexedDB
   */
  private async getModelFromIndexedDB(id: string, version: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDB();
      const record = (await db.get(STORE_NAME, id)) as StoredModelRecord | undefined;
      if (record && record.version === version && record.data) {
        return record.data;
      }
    } catch (e) {
      console.warn("[ONNXModelLoader] Error reading from IndexedDB:", e);
    }
    return null;
  }

  /**
   * Save downloaded model to IndexedDB
   */
  private async saveModelToIndexedDB(id: string, version: string, data: ArrayBuffer): Promise<void> {
    try {
      const db = await this.getDB();
      const record: StoredModelRecord = {
        id,
        version,
        data,
        sha256Hash: "",
        updatedAt: Date.now(),
      };
      await db.put(STORE_NAME, record);
      console.log(`[ONNXModelLoader] Model ${id} (v${version}) saved to IndexedDB.`);
    } catch (e) {
      console.warn("[ONNXModelLoader] Error saving model to IndexedDB:", e);
    }
  }

  /**
   * Purge old versions of model automatically
   */
  private async purgeOutdatedVersions(id: string, currentVersion: string): Promise<void> {
    try {
      const db = await this.getDB();
      const record = (await db.get(STORE_NAME, id)) as StoredModelRecord | undefined;
      if (record && record.version !== currentVersion) {
        await db.delete(STORE_NAME, id);
        console.log(`[ONNXModelLoader] Purged outdated version ${record.version} of model ${id}`);
      }
    } catch (e) {
      console.warn("[ONNXModelLoader] Error purging outdated model versions:", e);
    }
  }

  /**
   * Release ONNX session memory
   */
  public async releaseSession(modelId: string, version: string): Promise<void> {
    const cacheKey = `${modelId}_${version}`;
    const session = this.sessionCache.get(cacheKey);
    if (session) {
      try {
        await session.release();
      } catch (e) {
        console.warn(`[ONNXModelLoader] Error releasing session ${cacheKey}:`, e);
      }
      this.sessionCache.delete(cacheKey);
    }
  }
}
