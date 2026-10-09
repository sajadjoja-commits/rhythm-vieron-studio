import { AICacheItem, CacheConfig } from "../types/cache";

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

const VOLATILE_PAYLOAD_KEYS = new Set([
  "historyId",
  "jobId",
  "signal",
  "abortSignal",
  "onProgress",
]);

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

  private feedString64(hash: bigint, str: string): bigint {
    let h = hash;
    const len = str.length;
    // Mix string length first
    h = ((h ^ BigInt(len)) * FNV_PRIME_64) & MASK_64;

    if (len <= 1048576) {
      for (let i = 0; i < len; i++) {
        h = ((h ^ BigInt(str.charCodeAt(i))) * FNV_PRIME_64) & MASK_64;
      }
    } else {
      // For strings > 1MB, hash prefix (4096), suffix (4096), and 65536 evenly spaced samples across the interior
      const edgeLen = 4096;
      for (let i = 0; i < edgeLen; i++) {
        h = ((h ^ BigInt(str.charCodeAt(i))) * FNV_PRIME_64) & MASK_64;
      }
      const samples = 65536;
      const span = len - edgeLen * 2;
      for (let s = 0; s < samples; s++) {
        const idx = edgeLen + Math.floor((s * span) / samples);
        h = ((h ^ BigInt(str.charCodeAt(idx))) * FNV_PRIME_64) & MASK_64;
      }
      for (let i = len - edgeLen; i < len; i++) {
        h = ((h ^ BigInt(str.charCodeAt(i))) * FNV_PRIME_64) & MASK_64;
      }
    }
    return h;
  }

  private feedBytes64(hash: bigint, bytes: Uint8Array): bigint {
    let h = hash;
    const len = bytes.byteLength;
    h = ((h ^ BigInt(len)) * FNV_PRIME_64) & MASK_64;

    if (len <= 1048576) {
      for (let i = 0; i < len; i++) {
        h = ((h ^ BigInt(bytes[i])) * FNV_PRIME_64) & MASK_64;
      }
    } else {
      const edgeLen = 4096;
      for (let i = 0; i < edgeLen; i++) {
        h = ((h ^ BigInt(bytes[i])) * FNV_PRIME_64) & MASK_64;
      }
      const samples = 65536;
      const span = len - edgeLen * 2;
      for (let s = 0; s < samples; s++) {
        const idx = edgeLen + Math.floor((s * span) / samples);
        h = ((h ^ BigInt(bytes[idx])) * FNV_PRIME_64) & MASK_64;
      }
      for (let i = len - edgeLen; i < len; i++) {
        h = ((h ^ BigInt(bytes[i])) * FNV_PRIME_64) & MASK_64;
      }
    }
    return h;
  }

  private feedValue64(hash: bigint, value: any, seen: WeakSet<object>): bigint {
    let h = hash;

    if (value === null) {
      return this.feedString64(h, "null;");
    }
    if (value === undefined) {
      return this.feedString64(h, "undef;");
    }

    const t = typeof value;
    if (t === "boolean" || t === "number" || t === "bigint") {
      return this.feedString64(h, `${t}:${String(value)};`);
    }
    if (t === "string") {
      h = this.feedString64(h, "str:");
      return this.feedString64(h, value);
    }
    if (t === "function" || t === "symbol") {
      return h;
    }

    if (typeof value === "object") {
      if (seen.has(value)) {
        return this.feedString64(h, "[Circular];");
      }

      if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
        h = this.feedString64(h, `ArrayBuffer:${value.byteLength}:`);
        return this.feedBytes64(h, new Uint8Array(value));
      }

      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
        const view = value as ArrayBufferView;
        h = this.feedString64(
          h,
          `View:${view.constructor?.name || "View"}:${view.byteOffset}:${view.byteLength}:`
        );
        return this.feedBytes64(
          h,
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
        );
      }

      if (typeof File !== "undefined" && value instanceof File) {
        return this.feedString64(
          h,
          `File:${value.name}:${value.size}:${value.type}:${value.lastModified};`
        );
      }

      if (typeof Blob !== "undefined" && value instanceof Blob) {
        const extraName = (value as any).name ? String((value as any).name) : "";
        return this.feedString64(h, `Blob:${value.size}:${value.type}:${extraName};`);
      }

      if (value instanceof Date) {
        return this.feedString64(h, `Date:${value.getTime()};`);
      }

      if (value instanceof RegExp) {
        return this.feedString64(h, `RegExp:${value.toString()};`);
      }

      seen.add(value);

      if (Array.isArray(value)) {
        h = this.feedString64(h, `Arr:${value.length}[`);
        for (let i = 0; i < value.length; i++) {
          h = this.feedValue64(h, value[i], seen);
          h = this.feedString64(h, ",");
        }
        seen.delete(value);
        return this.feedString64(h, "]");
      }

      if (value instanceof Map) {
        h = this.feedString64(h, `Map:${value.size}{`);
        const entries = Array.from(value.entries()).sort((a, b) =>
          String(a[0]).localeCompare(String(b[0]))
        );
        for (const [k, v] of entries) {
          h = this.feedValue64(h, k, seen);
          h = this.feedString64(h, "=>");
          h = this.feedValue64(h, v, seen);
          h = this.feedString64(h, ";");
        }
        seen.delete(value);
        return this.feedString64(h, "}");
      }

      if (value instanceof Set) {
        h = this.feedString64(h, `Set:${value.size}{`);
        for (const item of value.values()) {
          h = this.feedValue64(h, item, seen);
          h = this.feedString64(h, ";");
        }
        seen.delete(value);
        return this.feedString64(h, "}");
      }

      const keys = Object.keys(value).sort();
      h = this.feedString64(h, "Obj{");
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (VOLATILE_PAYLOAD_KEYS.has(k)) continue;
        const propVal = value[k];
        if (propVal === undefined || typeof propVal === "function") continue;
        h = this.feedString64(h, `${k}:`);
        h = this.feedValue64(h, propVal, seen);
        h = this.feedString64(h, ";");
      }
      seen.delete(value);
      return this.feedString64(h, "}");
    }

    return h;
  }

  /**
   * Generates a 64-bit deterministic FNV-1a hash for taskType and payload
   */
  public generateHash(taskType: string, payload: any): string {
    let mediaType = "general";
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      mediaType = payload.inputMediaType || payload.mediaType || payload.category || "general";
    }
    let hash = FNV_OFFSET_BASIS_64;
    hash = this.feedString64(hash, `${taskType}:${mediaType}:`);
    hash = this.feedValue64(hash, payload, new WeakSet<object>());
    return `hash_${hash.toString(16).padStart(16, "0")}`;
  }

  public get<T>(key: string): T | null {
    const now = Date.now();

    // 1. Check memory cache first (with LRU promotion)
    const memItem = this.memoryCache.get(key);
    if (memItem) {
      if (now - memItem.timestamp <= memItem.ttlMs) {
        // Refresh position to most-recently-used
        this.memoryCache.delete(key);
        this.memoryCache.set(key, memItem);
        return memItem.data as T;
      } else {
        this.memoryCache.delete(key);
        if (this.useLocalStorage && typeof localStorage !== "undefined") {
          try {
            localStorage.removeItem(this.storagePrefix + key);
          } catch {
            // Ignore
          }
        }
      }
    }

    // 2. Check LocalStorage fallback
    if (this.useLocalStorage && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(this.storagePrefix + key);
        if (raw) {
          const item: AICacheItem = JSON.parse(raw);
          if (now - item.timestamp <= item.ttlMs) {
            // Restore to memory cache with LRU capacity check
            if (!this.memoryCache.has(key)) {
              while (this.memoryCache.size >= this.maxMemoryItems && this.maxMemoryItems > 0) {
                const lruKey = this.memoryCache.keys().next().value;
                if (lruKey !== undefined) {
                  this.memoryCache.delete(lruKey);
                } else {
                  break;
                }
              }
            } else {
              this.memoryCache.delete(key);
            }
            if (this.maxMemoryItems > 0) {
              this.memoryCache.set(key, item);
            }
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

    // If key already exists, remove first so re-insertion marks it most-recently-used
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }

    // Evict least-recently-used entries if at capacity
    while (this.memoryCache.size >= this.maxMemoryItems && this.maxMemoryItems > 0) {
      const lruKey = this.memoryCache.keys().next().value;
      if (lruKey !== undefined) {
        this.memoryCache.delete(lruKey);
      } else {
        break;
      }
    }

    if (this.maxMemoryItems > 0) {
      this.memoryCache.set(key, item);
    }

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

  public delete(key: string): boolean {
    const existed = this.memoryCache.delete(key);
    if (this.useLocalStorage && typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(this.storagePrefix + key);
      } catch {
        // Ignore
      }
    }
    return existed;
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
