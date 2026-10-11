import { AICacheItem, CacheConfig } from "../types/cache";

const FNV_SEED_1 = 0x811c9dc5;
const FNV_SEED_2 = 0x9e3779b9;
const FNV_PRIME_32 = 0x01000193;

const FULL_HASH_LIMIT = 2048;
const EDGE_SAMPLE_LEN = 512;
const INTERIOR_SAMPLES = 8192;
const DEFAULT_MAX_MEMORY_BYTES = 64 * 1024 * 1024; // 64 MB
const LOCAL_STORAGE_MAX_TEXT_BYTES = 250 * 1024; // 250 KB

interface HashState64 {
  h1: number;
  h2: number;
}

const VOLATILE_PAYLOAD_KEYS = new Set([
  "historyId",
  "jobId",
  "signal",
  "abortSignal",
  "onProgress",
]);

export class AICache {
  private memoryCache: Map<string, AICacheItem> = new Map();
  private itemByteSizes: Map<string, number> = new Map();
  private currentMemoryBytes: number = 0;
  private maxMemoryItems: number;
  private maxMemoryBytes: number;
  private useLocalStorage: boolean;
  private defaultTTLMs: number;
  private storagePrefix = "ai_cache_";

  constructor(config: CacheConfig = {}) {
    this.maxMemoryItems = config.maxMemoryItems ?? 100;
    this.maxMemoryBytes = config.maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES;
    this.useLocalStorage = config.useLocalStorage ?? true;
    this.defaultTTLMs = config.defaultTTLMs ?? 24 * 60 * 60 * 1000; // 24 Hours
  }

  private feedUnit(state: HashState64, val: number): void {
    const v = val | 0;
    state.h1 = Math.imul(state.h1 ^ v, FNV_PRIME_32) >>> 0;
    state.h2 = Math.imul(state.h2 ^ ((v + 0x85ebca6b) | 0), FNV_PRIME_32) >>> 0;
  }

  private feedString64(state: HashState64, str: string): void {
    const len = str.length;
    this.feedUnit(state, len);

    if (len <= FULL_HASH_LIMIT) {
      for (let i = 0; i < len; i++) {
        this.feedUnit(state, str.charCodeAt(i));
      }
    } else {
      for (let i = 0; i < EDGE_SAMPLE_LEN; i++) {
        this.feedUnit(state, str.charCodeAt(i));
      }
      const span = len - EDGE_SAMPLE_LEN * 2;
      for (let s = 0; s < INTERIOR_SAMPLES; s++) {
        const idx = EDGE_SAMPLE_LEN + Math.floor((s * span) / INTERIOR_SAMPLES);
        this.feedUnit(state, str.charCodeAt(idx));
      }
      for (let i = len - EDGE_SAMPLE_LEN; i < len; i++) {
        this.feedUnit(state, str.charCodeAt(i));
      }
    }
  }

  private feedBytes64(state: HashState64, bytes: Uint8Array): void {
    const len = bytes.byteLength;
    this.feedUnit(state, len);

    if (len <= FULL_HASH_LIMIT) {
      for (let i = 0; i < len; i++) {
        this.feedUnit(state, bytes[i]);
      }
    } else {
      for (let i = 0; i < EDGE_SAMPLE_LEN; i++) {
        this.feedUnit(state, bytes[i]);
      }
      const span = len - EDGE_SAMPLE_LEN * 2;
      for (let s = 0; s < INTERIOR_SAMPLES; s++) {
        const idx = EDGE_SAMPLE_LEN + Math.floor((s * span) / INTERIOR_SAMPLES);
        this.feedUnit(state, bytes[idx]);
      }
      for (let i = len - EDGE_SAMPLE_LEN; i < len; i++) {
        this.feedUnit(state, bytes[i]);
      }
    }
  }

  private feedValue64(state: HashState64, value: any, seen: WeakSet<object>): void {
    if (value === null) {
      this.feedString64(state, "null;");
      return;
    }
    if (value === undefined) {
      this.feedString64(state, "undef;");
      return;
    }

    const t = typeof value;
    if (t === "boolean" || t === "number" || t === "bigint") {
      this.feedString64(state, `${t}:${String(value)};`);
      return;
    }
    if (t === "string") {
      this.feedString64(state, "str:");
      this.feedString64(state, value);
      return;
    }
    if (t === "function" || t === "symbol") {
      return;
    }

    if (typeof value === "object") {
      if (seen.has(value)) {
        this.feedString64(state, "[Circular];");
        return;
      }

      if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
        this.feedString64(state, `ArrayBuffer:${value.byteLength}:`);
        this.feedBytes64(state, new Uint8Array(value));
        return;
      }

      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
        const view = value as ArrayBufferView;
        this.feedString64(
          state,
          `View:${view.constructor?.name || "View"}:${view.byteOffset}:${view.byteLength}:`
        );
        this.feedBytes64(
          state,
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
        );
        return;
      }

      if (typeof File !== "undefined" && value instanceof File) {
        this.feedString64(
          state,
          `File:${value.name}:${value.size}:${value.type}:${value.lastModified};`
        );
        return;
      }

      if (typeof Blob !== "undefined" && value instanceof Blob) {
        const extraName = (value as any).name ? String((value as any).name) : "";
        this.feedString64(state, `Blob:${value.size}:${value.type}:${extraName};`);
        return;
      }

      if (value instanceof Date) {
        this.feedString64(state, `Date:${value.getTime()};`);
        return;
      }

      if (value instanceof RegExp) {
        this.feedString64(state, `RegExp:${value.toString()};`);
        return;
      }

      seen.add(value);

      if (Array.isArray(value)) {
        this.feedString64(state, `Arr:${value.length}[`);
        for (let i = 0; i < value.length; i++) {
          this.feedValue64(state, value[i], seen);
          this.feedString64(state, ",");
        }
        seen.delete(value);
        this.feedString64(state, "]");
        return;
      }

      if (value instanceof Map) {
        this.feedString64(state, `Map:${value.size}{`);
        const entries = Array.from(value.entries()).sort((a, b) =>
          String(a[0]).localeCompare(String(b[0]))
        );
        for (const [k, v] of entries) {
          this.feedValue64(state, k, seen);
          this.feedString64(state, "=>");
          this.feedValue64(state, v, seen);
          this.feedString64(state, ";");
        }
        seen.delete(value);
        this.feedString64(state, "}");
        return;
      }

      if (value instanceof Set) {
        this.feedString64(state, `Set:${value.size}{`);
        for (const item of value.values()) {
          this.feedValue64(state, item, seen);
          this.feedString64(state, ";");
        }
        seen.delete(value);
        this.feedString64(state, "}");
        return;
      }

      const keys = Object.keys(value).sort();
      this.feedString64(state, "Obj{");
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (VOLATILE_PAYLOAD_KEYS.has(k)) continue;
        const propVal = value[k];
        if (propVal === undefined || typeof propVal === "function") continue;
        this.feedString64(state, `${k}:`);
        this.feedValue64(state, propVal, seen);
        this.feedString64(state, ";");
      }
      seen.delete(value);
      this.feedString64(state, "}");
    }
  }

  /**
   * Computes total string length (in characters/bytes) inside data without JSON.stringify
   */
  private measureDataTextBytes(value: any, seen: WeakSet<object> = new WeakSet()): number {
    if (value === null || value === undefined) return 0;
    const t = typeof value;
    if (t === "string") return value.length;
    if (t !== "object") return 0;

    if (seen.has(value)) return 0;
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
      return value.byteLength;
    }

    seen.add(value);
    let total = 0;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        total += this.measureDataTextBytes(value[i], seen);
      }
    } else if (value instanceof Map) {
      for (const [k, v] of value.entries()) {
        total += this.measureDataTextBytes(k, seen) + this.measureDataTextBytes(v, seen);
      }
    } else if (value instanceof Set) {
      for (const v of value.values()) {
        total += this.measureDataTextBytes(v, seen);
      }
    } else {
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        total += this.measureDataTextBytes(value[keys[i]], seen);
      }
    }
    seen.delete(value);
    return total;
  }

  private removeFromMemory(key: string): boolean {
    const existed = this.memoryCache.delete(key);
    const sz = this.itemByteSizes.get(key);
    if (sz !== undefined) {
      this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - sz);
      this.itemByteSizes.delete(key);
    }
    return existed;
  }

  private insertIntoMemory(key: string, item: AICacheItem, dataBytes: number): void {
    this.removeFromMemory(key);

    if (this.maxMemoryItems <= 0 || this.maxMemoryBytes <= 0) {
      return;
    }

    // Do not store an item larger than half of maxMemoryBytes
    if (dataBytes > this.maxMemoryBytes * 0.5) {
      return;
    }

    while (
      this.memoryCache.size > 0 &&
      (this.memoryCache.size >= this.maxMemoryItems ||
        this.currentMemoryBytes + dataBytes > this.maxMemoryBytes)
    ) {
      const lruKey = this.memoryCache.keys().next().value;
      if (lruKey !== undefined) {
        this.removeFromMemory(lruKey);
      } else {
        break;
      }
    }

    this.memoryCache.set(key, item);
    this.itemByteSizes.set(key, dataBytes);
    this.currentMemoryBytes += dataBytes;
  }

  public getMemoryBytes(): number {
    return this.currentMemoryBytes;
  }

  /**
   * Generates a 64-bit deterministic FNV-1a hash (dual 32-bit Math.imul lanes) for taskType and payload
   */
  public generateHash(taskType: string, payload: any): string {
    let mediaType = "general";
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      mediaType = payload.inputMediaType || payload.mediaType || payload.category || "general";
    }
    const state: HashState64 = {
      h1: FNV_SEED_1,
      h2: FNV_SEED_2,
    };
    this.feedString64(state, `${taskType}:${mediaType}:`);
    this.feedValue64(state, payload, new WeakSet<object>());
    const hex1 = (state.h1 >>> 0).toString(16).padStart(8, "0");
    const hex2 = (state.h2 >>> 0).toString(16).padStart(8, "0");
    return `hash_${hex1}${hex2}`;
  }

  public get<T>(key: string): T | null {
    const now = Date.now();

    // 1. Check memory cache first (with LRU promotion)
    const memItem = this.memoryCache.get(key);
    if (memItem) {
      if (now - memItem.timestamp <= memItem.ttlMs) {
        // Refresh position to most-recently-used
        const sz = this.itemByteSizes.get(key) ?? 0;
        this.memoryCache.delete(key);
        this.itemByteSizes.delete(key);
        this.memoryCache.set(key, memItem);
        this.itemByteSizes.set(key, sz);
        return memItem.data as T;
      } else {
        this.removeFromMemory(key);
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
            const dataBytes = this.measureDataTextBytes(item.data);
            this.insertIntoMemory(key, item, dataBytes);
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
    const dataBytes = this.measureDataTextBytes(data);

    // Do not store an item larger than half of maxMemoryBytes
    if (this.maxMemoryItems <= 0 || this.maxMemoryBytes <= 0 || dataBytes > this.maxMemoryBytes * 0.5) {
      this.delete(key);
      return;
    }

    const item: AICacheItem<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttlMs: ttlMs ?? this.defaultTTLMs,
      taskType,
      providerUsed,
    };

    this.insertIntoMemory(key, item, dataBytes);

    // Persist to LocalStorage only if text length is <= 250KB (checked BEFORE JSON.stringify)
    if (
      this.useLocalStorage &&
      typeof localStorage !== "undefined" &&
      dataBytes <= LOCAL_STORAGE_MAX_TEXT_BYTES
    ) {
      try {
        const str = JSON.stringify(item);
        if (str.length < LOCAL_STORAGE_MAX_TEXT_BYTES) {
          localStorage.setItem(this.storagePrefix + key, str);
        }
      } catch {
        // Ignore quota overflow or storage write errors
      }
    }
  }

  public delete(key: string): boolean {
    const existed = this.removeFromMemory(key);
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
    this.itemByteSizes.clear();
    this.currentMemoryBytes = 0;
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
