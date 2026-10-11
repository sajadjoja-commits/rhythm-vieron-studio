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
  maxMemoryBytes?: number; // Default 64MB
  useLocalStorage?: boolean;
  defaultTTLMs?: number; // Default 24 hours
}
