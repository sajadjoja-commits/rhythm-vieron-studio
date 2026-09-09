export interface AICacheItem<T = any> {
  key: string;
  data: T;
  timestamp: number;
  ttlMs: number;
  taskType: string;
  providerUsed?: string;
}

export interface CacheConfig {
  maxMemoryItems?: number;
  useLocalStorage?: boolean;
  defaultTTLMs?: number; // Default 24 hours
}
