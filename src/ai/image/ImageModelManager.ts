/**
 * ImageModelManager
 * Manages neural network weights and models:
 * - MediaPipe Vision Task Models (TFLite / WASM)
 * - ONNX Runtime Models
 * - IndexedDB persistent binary caching with versioning & SHA-256 validation
 * - Download progress tracking with speed (MB/s) and ETA
 * - AbortController cancellation & corrupted model auto-eviction
 */

import { openDB, IDBPDatabase } from "idb";
import { sha256 } from "hash-wasm";
import { ModelManifest, ImageAIProgressEvent } from "./types";

const DB_NAME = "vireon_image_ai_models_v1";
const STORE_NAME = "model_binaries";

interface StoredModelRecord {
  id: string;
  version: string;
  data: ArrayBuffer;
  sha256: string;
  sizeBytes: number;
  updatedAt: number;
}

export const OFFICIAL_MODEL_MANIFESTS: Record<string, ModelManifest> = {
  // Google MediaPipe Image Segmenter (Selfie / General) - ~1.5 MB (ultra fast, offline, Android WebView native)
  "mediapipe-selfie-segmenter": {
    id: "mediapipe-selfie-segmenter",
    name: "Google MediaPipe Selfie & Subject Segmenter",
    task: "remove-background",
    version: "0.10.35",
    sizeBytes: 1572864,
    urls: [
      "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/selfie_segmenter.tflite",
      "/models/mediapipe/selfie_segmenter.tflite",
    ],
    framework: "mediapipe",
    minTier: "LOW",
  },
  // Google MediaPipe DeepLabV3 Image Segmenter for general objects / animals / humans - ~2.5 MB
  "mediapipe-deeplab-segmenter": {
    id: "mediapipe-deeplab-segmenter",
    name: "Google MediaPipe DeepLabV3 Vision Segmenter",
    task: "remove-background",
    version: "0.10.35",
    sizeBytes: 2621440,
    urls: [
      "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
      "/models/mediapipe/deeplab_v3.tflite",
    ],
    framework: "mediapipe",
    minTier: "MEDIUM",
  },
  // Google MediaPipe Face Detector (BlazeFace Short Range) - ~0.8 MB
  "mediapipe-face-detector": {
    id: "mediapipe-face-detector",
    name: "Google MediaPipe BlazeFace Detector",
    task: "face-enhance",
    version: "0.10.35",
    sizeBytes: 819200,
    urls: [
      "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
      "/models/mediapipe/blaze_face_short_range.tflite",
    ],
    framework: "mediapipe",
    minTier: "LOW",
  },
  // Google MediaPipe Face Landmarker - ~2.5 MB
  "mediapipe-face-landmarker": {
    id: "mediapipe-face-landmarker",
    name: "Google MediaPipe Face Landmarker",
    task: "face-enhance",
    version: "0.10.35",
    sizeBytes: 2621440,
    urls: [
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
      "/models/mediapipe/face_landmarker.task",
    ],
    framework: "mediapipe",
    minTier: "LOW",
  },
};

export class ImageModelManager {
  private static instance: ImageModelManager;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private memoryCache: Map<string, ArrayBuffer> = new Map();

  private constructor() {}

  public static getInstance(): ImageModelManager {
    if (!ImageModelManager.instance) {
      ImageModelManager.instance = new ImageModelManager();
    }
    return ImageModelManager.instance;
  }

  private async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, 1, {
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
   * Fetch or retrieve model binary with IndexedDB caching and progress reporting
   */
  public async getModelBinary(
    manifest: ModelManifest,
    onProgress?: (progress: Partial<ImageAIProgressEvent>) => void,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    const cacheKey = `${manifest.id}_${manifest.version}`;

    // 1. Check in-memory buffer cache
    if (this.memoryCache.has(cacheKey)) {
      onProgress?.({
        stage: "loading_model",
        progress: 1.0,
        message: `Loaded ${manifest.name} from memory cache`,
      });
      return this.memoryCache.get(cacheKey)!;
    }

    // 2. Check IndexedDB persistent cache
    try {
      const db = await this.getDB();
      const stored = (await db.get(STORE_NAME, cacheKey)) as StoredModelRecord | undefined;
      if (stored && stored.data && stored.data.byteLength > 0) {
        // Validate checksum if specified
        if (manifest.sha256) {
          const hash = await sha256(new Uint8Array(stored.data));
          if (hash !== manifest.sha256) {
            console.warn(`[ImageModelManager] Checksum mismatch for ${manifest.id}, evicting cache`);
            await db.delete(STORE_NAME, cacheKey);
          } else {
            this.memoryCache.set(cacheKey, stored.data);
            onProgress?.({
              stage: "loading_model",
              progress: 1.0,
              message: `Loaded ${manifest.name} from persistent local storage`,
            });
            return stored.data;
          }
        } else {
          this.memoryCache.set(cacheKey, stored.data);
          onProgress?.({
            stage: "loading_model",
            progress: 1.0,
            message: `Loaded ${manifest.name} from local storage`,
          });
          return stored.data;
        }
      }
    } catch (dbErr) {
      console.warn("[ImageModelManager] IndexedDB read error:", dbErr);
    }

    // 3. Download from URLs with progress & retry
    let lastError: Error | null = null;
    for (const url of manifest.urls) {
      if (signal?.aborted) {
        throw new Error(`[ImageModelManager] Model download aborted for ${manifest.id}`);
      }

      try {
        const buffer = await this.downloadWithProgress(url, manifest, onProgress, signal);
        
        // Cache in memory
        this.memoryCache.set(cacheKey, buffer);

        // Store asynchronously in IndexedDB
        try {
          const db = await this.getDB();
          await db.put(STORE_NAME, {
            id: cacheKey,
            version: manifest.version,
            data: buffer,
            sha256: manifest.sha256 || "",
            sizeBytes: buffer.byteLength,
            updatedAt: Date.now(),
          });
        } catch (dbWriteErr) {
          console.warn("[ImageModelManager] Failed to persist model to IndexedDB:", dbWriteErr);
        }

        return buffer;
      } catch (err: any) {
        lastError = err;
        console.warn(`[ImageModelManager] Failed to fetch model from ${url}:`, err?.message || err);
      }
    }

    throw new Error(
      `[ImageModelManager] Failed to download model ${manifest.name} from all available sources: ${lastError?.message || "Network error"}`
    );
  }

  /**
   * Download binary stream with chunked progress calculation
   */
  private async downloadWithProgress(
    url: string,
    manifest: ModelManifest,
    onProgress?: (progress: Partial<ImageAIProgressEvent>) => void,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    const startTime = Date.now();
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    const totalBytes = contentLengthHeader
      ? parseInt(contentLengthHeader, 10)
      : manifest.sizeBytes;

    if (!response.body) {
      const buf = await response.arrayBuffer();
      return buf;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new Error(`Download cancelled for ${manifest.name}`);
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        chunks.push(value);
        receivedBytes += value.length;

        const now = Date.now();
        const durationSec = Math.max(0.1, (now - startTime) / 1000);
        const speedMBps = receivedBytes / (1024 * 1024 * durationSec);
        const progressRatio = totalBytes > 0 ? Math.min(1.0, receivedBytes / totalBytes) : 0.5;
        const remainingBytes = Math.max(0, totalBytes - receivedBytes);
        const etaSeconds = speedMBps > 0 ? Math.round(remainingBytes / (speedMBps * 1024 * 1024)) : 0;

        onProgress?.({
          stage: "downloading_model",
          progress: progressRatio,
          downloadBytes: receivedBytes,
          totalBytes,
          speedMBps: Math.round(speedMBps * 10) / 10,
          etaSeconds,
          message: `Downloading ${manifest.name} (${Math.round((receivedBytes / (1024 * 1024)) * 10) / 10} MB / ${Math.round((totalBytes / (1024 * 1024)) * 10) / 10} MB - ${Math.round(speedMBps * 10) / 10} MB/s)`,
        });
      }
    }

    // Combine chunks into single ArrayBuffer
    const combined = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined.buffer;
  }

  /**
   * Evict specific model from both memory and IndexedDB
   */
  public async evictModel(manifestId: string, version: string): Promise<void> {
    const cacheKey = `${manifestId}_${version}`;
    this.memoryCache.delete(cacheKey);
    try {
      const db = await this.getDB();
      await db.delete(STORE_NAME, cacheKey);
    } catch {
      // Ignore
    }
  }

  /**
   * Clear all cached models
   */
  public async clearAll(): Promise<void> {
    this.memoryCache.clear();
    try {
      const db = await this.getDB();
      await db.clear(STORE_NAME);
    } catch {
      // Ignore
    }
  }
}
