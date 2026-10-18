import { ModelDownloadInfo } from "./types";

export class AIDownloadManager {
  private downloads: Map<string, ModelDownloadInfo> = new Map();
  private listeners: Map<string, Set<(info: ModelDownloadInfo) => void>> = new Map();

  public registerModel(modelId: string, name: string, url?: string, sizeBytes?: number): ModelDownloadInfo {
    const existing = this.downloads.get(modelId);
    if (existing) return existing;

    const info: ModelDownloadInfo = {
      modelId,
      name,
      url,
      sizeBytes,
      downloadedBytes: 0,
      percentage: 0,
      status: "idle",
    };
    this.downloads.set(modelId, info);
    return info;
  }

  public getModelInfo(modelId: string): ModelDownloadInfo | undefined {
    return this.downloads.get(modelId);
  }

  public async ensureModelDownloaded(
    modelId: string,
    downloaderFn?: (onProgress: (percent: number) => void) => Promise<boolean>
  ): Promise<boolean> {
    let info = this.downloads.get(modelId);
    if (!info) {
      info = this.registerModel(modelId, modelId);
    }

    if (info.status === "verified") return true;

    info.status = "downloading";
    info.percentage = 0;
    this.notify(modelId);

    try {
      if (downloaderFn) {
        await downloaderFn((percent) => {
          if (info) {
            info.percentage = Math.round(percent);
            this.notify(modelId);
          }
        });
      } else {
        // Simulated verified load for registered local assets
        info.percentage = 100;
      }

      info.status = "verified";
      info.percentage = 100;
      this.notify(modelId);
      return true;
    } catch (err: any) {
      info.status = "error";
      info.error = err?.message || "Model download failed";
      this.notify(modelId);
      return false;
    }
  }

  public subscribe(modelId: string, callback: (info: ModelDownloadInfo) => void): () => void {
    if (!this.listeners.has(modelId)) {
      this.listeners.set(modelId, new Set());
    }
    this.listeners.get(modelId)!.add(callback);

    const info = this.downloads.get(modelId);
    if (info) callback(info);

    return () => {
      const set = this.listeners.get(modelId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(modelId);
      }
    };
  }

  private notify(modelId: string): void {
    const info = this.downloads.get(modelId);
    if (!info) return;
    const callbacks = this.listeners.get(modelId);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb({ ...info });
        } catch {
          // Ignore
        }
      });
    }
  }
}
