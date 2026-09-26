/**
 * Phase 10: Installed Model State Store
 * 
 * Persistent device storage for installed models:
 * - On Web: IndexedDB "vieron_local_models_v1" store
 * - On Android: Native storage synchronized with VireonAIPlugin
 */

import { openDB, IDBPDatabase } from "idb";
import { Capacitor } from "@capacitor/core";
import { InstalledModel, ModelPackStatus } from "./types";
import { getVireonAIPlugin } from "../AndroidNativeAIProvider";

const DB_NAME = "vieron_local_models_v1";
const STORE_NAME = "installed_models";

export class InstalledModelStore {
  private static instance: InstalledModelStore;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private memoryCache: Map<string, InstalledModel> = new Map();

  private constructor() {}

  public static getInstance(): InstalledModelStore {
    if (!InstalledModelStore.instance) {
      InstalledModelStore.instance = new InstalledModelStore();
    }
    return InstalledModelStore.instance;
  }

  private async getDB(): Promise<IDBPDatabase | null> {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      return null;
    }
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

  public async getInstalledModels(): Promise<InstalledModel[]> {
    const results: InstalledModel[] = [];

    // 1. From Native Android if available
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const plugin = getVireonAIPlugin();
      if (plugin && (plugin as any).getInstalledModelPacks) {
        try {
          const res = await (plugin as any).getInstalledModelPacks();
          if (res?.success && Array.isArray(res.models)) {
            for (const m of res.models) {
              const installed: InstalledModel = {
                id: m.id,
                version: m.version || "1.0.0",
                path: m.path,
                installedAt: Date.now(),
                sha256: m.sha256 || "",
                sizeBytes: m.sizeBytes || 0,
                status: "installed",
                localUri: `file://${m.path}`,
              };
              this.memoryCache.set(m.id, installed);
              results.push(installed);
            }
          }
        } catch (e) {
          console.warn("[InstalledModelStore] Error reading native installed models:", e);
        }
      }
    }

    // 2. From IndexedDB
    try {
      const db = await this.getDB();
      if (db) {
        const storedList = (await db.getAll(STORE_NAME)) as InstalledModel[];
        for (const item of storedList) {
          if (!results.some((r) => r.id === item.id)) {
            this.memoryCache.set(item.id, item);
            results.push(item);
          }
        }
      }
    } catch (e) {
      console.warn("[InstalledModelStore] Error reading IndexedDB:", e);
    }

    // 3. From in-memory cache
    for (const [id, item] of this.memoryCache.entries()) {
      if (!results.some((r) => r.id === id)) {
        results.push(item);
      }
    }

    return results;
  }

  public async getInstalledModel(id: string): Promise<InstalledModel | undefined> {
    if (this.memoryCache.has(id)) {
      return this.memoryCache.get(id);
    }

    const all = await this.getInstalledModels();
    return all.find((m) => m.id === id);
  }

  public async saveInstalledModel(model: InstalledModel): Promise<void> {
    this.memoryCache.set(model.id, model);

    try {
      const db = await this.getDB();
      if (db) {
        await db.put(STORE_NAME, model);
      }
    } catch (e) {
      console.warn("[InstalledModelStore] Error saving to IndexedDB:", e);
    }
  }

  public async updateStatus(id: string, status: ModelPackStatus): Promise<void> {
    const existing = await this.getInstalledModel(id);
    if (existing) {
      existing.status = status;
      await this.saveInstalledModel(existing);
    }
  }

  public async deleteInstalledModel(id: string): Promise<boolean> {
    this.memoryCache.delete(id);

    let deleted = false;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const plugin = getVireonAIPlugin();
      if (plugin && (plugin as any).deleteModelPack) {
        try {
          const res = await (plugin as any).deleteModelPack({ modelId: id });
          deleted = res?.success ?? false;
        } catch {}
      }
    }

    try {
      const db = await this.getDB();
      if (db) {
        await db.delete(STORE_NAME, id);
        deleted = true;
      }
    } catch (e) {
      console.warn("[InstalledModelStore] Error deleting from IndexedDB:", e);
    }

    return deleted;
  }
}

export const installedModelStore = InstalledModelStore.getInstance();
