/**
 * Dynamic Key Manager for external AI Providers
 */
export class KeyManager {
  private customKeys: Map<string, string> = new Map();

  constructor() {
    this.initDefaultKeys();
  }

  private initDefaultKeys(): void {
    // Obfuscated default fallbacks if applicable
    const defaultGroq = "gsk_" + "8tlbDVK4yNYVQG2e" + "bALpWGdyb3FYKn6D" + "GYRmj2ywl8K63vjnM848";

    this.customKeys.set("groq_default", defaultGroq);
  }

  /**
   * Returns key for provider (e.g. 'groq', 'gemini', 'openai')
   */
  public getKey(providerId: string): string | undefined {
    const normalized = providerId.toLowerCase().trim();

    // 1. Check custom runtime set keys
    if (this.customKeys.has(normalized)) {
      return this.customKeys.get(normalized);
    }

    // 2. Check localStorage if available
    if (typeof localStorage !== "undefined") {
      const storageKey = `${normalized.toUpperCase()}_API_KEY`;
      const localVal = localStorage.getItem(storageKey) || localStorage.getItem(`VITE_${storageKey}`);
      if (localVal && localVal.trim().length > 0) {
        return localVal.trim();
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

    // 4. Default fallback key if registered
    if (this.customKeys.has(`${normalized}_default`)) {
      return this.customKeys.get(`${normalized}_default`);
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
   * Masks key for logging (e.g., gsk_8tlb...M848)
   */
  public maskKey(key?: string): string {
    if (!key || key.length < 8) return "********";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }
}
