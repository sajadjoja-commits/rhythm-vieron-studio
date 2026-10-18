/**
 * Phase 9: Storage Cache Service & Diagnostics Manager
 * 
 * Provides unified device storage reporting, cache size governance,
 * and project cache lifecycle management across Android and Web.
 */

import { MediaService } from "./MediaService";
import { StorageDiagnostics, StorageCleanupResult, ProjectCacheInfo } from "./types";

export class StorageCacheService {
  private static instance: StorageCacheService;

  private constructor() {}

  public static getInstance(): StorageCacheService {
    if (!StorageCacheService.instance) {
      StorageCacheService.instance = new StorageCacheService();
    }
    return StorageCacheService.instance;
  }

  /**
   * Queries real-time disk storage breakdown
   */
  public async getDiagnostics(): Promise<StorageDiagnostics> {
    const mediaService = MediaService.getInstance();
    return mediaService.getStorageDiagnostics();
  }

  /**
   * Cleans specified cache targets (e.g. "thumbnails", "proxies", "waveforms", "temp", "all_cache")
   */
  public async cleanCache(target: "thumbnails" | "proxies" | "waveforms" | "temp" | "all_cache" = "all_cache"): Promise<StorageCleanupResult> {
    const mediaService = MediaService.getInstance();
    return mediaService.cleanStorageCache(target);
  }

  /**
   * Manages project cache directory (getInfo, clear, delete)
   */
  public async manageProjectCache(
    projectId: string,
    action: "getInfo" | "clear" | "delete" = "getInfo"
  ): Promise<ProjectCacheInfo> {
    const mediaService = MediaService.getInstance();
    return mediaService.manageProjectCache(projectId, action);
  }

  /**
   * Format bytes into human-readable string (KB, MB, GB)
   */
  public formatBytes(bytes: number, decimals = 1): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }
}

export const storageCacheService = StorageCacheService.getInstance();
