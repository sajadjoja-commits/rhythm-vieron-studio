// Safe localStorage wrapper that handles iframe restrictions and SecurityError gracefully
const inMemoryStorage = new Map<string, string>();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Storage access restricted in iframe/browser settings
    }
    return inMemoryStorage.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Storage access restricted
    }
    inMemoryStorage.set(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // Storage access restricted
    }
    inMemoryStorage.delete(key);
  },

  clear(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {
      // Storage access restricted
    }
    inMemoryStorage.clear();
  },

  key(index: number): string | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.key(index);
      }
    } catch {
      // Storage access restricted
    }
    return Array.from(inMemoryStorage.keys())[index] ?? null;
  },

  get length(): number {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.length;
      }
    } catch {
      // Storage access restricted
    }
    return inMemoryStorage.size;
  },
};
