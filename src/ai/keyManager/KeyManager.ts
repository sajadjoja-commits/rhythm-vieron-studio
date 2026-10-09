/**
 * Dynamic Key Manager for external AI Providers
 */
export class KeyManager {
  private customKeys: Map<string, string> = new Map();

  constructor() {
    this.initDefaultKeys();
  }

  private initDefaultKeys(): void {
    // No hardcoded default keys; keys must come from runtime configuration, localStorage, or environment variables.
  }

  /**
   * Returns key for provider (e.g. 'groq', 'gemini', 'openai')
   */
  public getKey(providerId: string): string | undefined {
    const normalized = providerId.toLowerCase().trim();
    if (!normalized) return undefined;

    // 1. Check custom runtime set keys
    if (this.customKeys.has(normalized)) {
      const val = this.customKeys.get(normalized);
      return val && val.trim().length > 0 ? val.trim() : undefined;
    }

    // 2. Check localStorage if available
    if (typeof localStorage !== "undefined") {
      try {
        const storageKey = `${normalized.toUpperCase()}_API_KEY`;
        const localVal = localStorage.getItem(storageKey) || localStorage.getItem(`VITE_${storageKey}`);
        if (localVal && localVal.trim().length > 0) {
          return localVal.trim();
        }
      } catch {
        // Ignore storage read errors
      }
    }

    // 3. Check environment variables
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const envKeyName = `VITE_${normalized.toUpperCase()}_API_KEY`;
      const envVal = import.meta.env[envKeyName] || import.meta.env[`${normalized.toUpperCase()}_API_KEY`];
      if (envVal && typeof envVal === "string" && envVal.trim().length > 0) {
        return envVal.trim();
      }
    }

    return undefined;
  }

  /**
   * Sets a dynamic API key at runtime
   */
  public setKey(providerId: string, key: string, persistToStorage: boolean = true): void {
    const normalized = providerId.toLowerCase().trim();
    this.customKeys.set(normalized, key.trim());

    if (persistToStorage && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`${normalized.toUpperCase()}_API_KEY`, key.trim());
      } catch {
        // Ignore storage errors
      }
    }
  }

  /**
   * Removes a dynamic key
   */
  public removeKey(providerId: string): void {
    const normalized = providerId.toLowerCase().trim();
    this.customKeys.delete(normalized);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(`${normalized.toUpperCase()}_API_KEY`);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Masks key for logging (e.g., abcd...wxyz)
   */
  public maskKey(key?: string): string {
    if (!key || key.length < 8) return "********";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }
}
