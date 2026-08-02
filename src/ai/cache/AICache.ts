import { AICacheItem, CacheConfig } from "../types/cache";

export class AICache {
  private memoryCache: Map<string, AICacheItem> = new Map();
  private maxMemoryItems: number;
  private useLocalStorage: boolean;
  private defaultTTLMs: number;
  private storagePrefix = "ai_cache_";

  constructor(config: CacheConfig = {}) {
    this.maxMemoryItems = config.maxMemoryItems ?? 100;
    this.useLocalStorage = config.useLocalStorage ?? true;
    this.defaultTTLMs = config.defaultTTLMs ?? 24 * 60 * 60 * 1000; // 24 Hours
  }

  /**
   * Generates a deterministic hash for payload and options
   */
  public generateHash(taskType: string, payload: any): string {
    try {
      let str = taskType + ":";
      if (typeof payload === "string") {
        str += payload.length > 500 ? payload.slice(0, 200) + payload.slice(-200) + payload.length : payload;
      } else if (payload && typeof payload === "object") {
        const payloadCopy = { ...payload };
        // Strip large data strings or retain concise representation for hashing
        if (payloadCopy.audioBase64 && typeof payloadCopy.audioBase64 === "string") {
          payloadCopy.audioBase64 = payloadCopy.audioBase64.slice(0, 100) + "_" + payloadCopy.audioBase64.length;
        }
        if (payloadCopy.mediaUrlOrBase64 && typeof payloadCopy.mediaUrlOrBase64 === "string") {
          payloadCopy.mediaUrlOrBase64 = payloadCopy.mediaUrlOrBase64.slice(0, 100) + "_" + payloadCopy.mediaUrlOrBase64.length;
        }
        str += JSON.stringify(payloadCopy);
      } else {
        str += String(payload);
      }

      // Simple hash
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      return `hash_${Math.abs(hash).toString(36)}`;
    } catch {
      return `hash_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
  }

  public get<T>(key: string): T | null {
    const now = Date.now();

    // 1. Check memory cache first
    const memItem = this.memoryCache.get(key);
    if (memItem) {
      if (now - memItem.timestamp <= memItem.ttlMs) {
        return memItem.data as T;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // 2. Check LocalStorage fallback
    if (this.useLocalStorage && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(this.storagePrefix + key);
        if (raw) {
          const item: AICacheItem = JSON.parse(raw);
          if (now - item.timestamp <= item.ttlMs) {
            // Restore to memory cache
            this.memoryCache.set(key, item);
            return item.data as T;
          } else {
            localStorage.removeItem(this.storagePrefix + key);
          }
        }
      } catch {
        // Ignore storage read errors
      }
    }

    return null;
  }

  public set<T>(key: string, taskType: string, data: T, ttlMs?: number, providerUsed?: string): void {
    const item: AICacheItem<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttlMs: ttlMs ?? this.defaultTTLMs,
      taskType,
      providerUsed,
    };

    // Prune memory cache if too large
    if (this.memoryCache.size >= this.maxMemoryItems) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }

    this.memoryCache.set(key, item);

    // Persist to LocalStorage if payload size is reasonable (< 250KB)
    if (this.useLocalStorage && typeof localStorage !== "undefined") {
      try {
        const str = JSON.stringify(item);
        if (str.length < 250 * 1024) {
          localStorage.setItem(this.storagePrefix + key, str);
        }
      } catch {
        // Ignore quota overflow or storage write errors
      }
    }
  }

  public clear(): void {
    this.memoryCache.clear();
    if (this.useLocalStorage && typeof localStorage !== "undefined") {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.storagePrefix)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        // Ignore
      }
    }
  }
}
