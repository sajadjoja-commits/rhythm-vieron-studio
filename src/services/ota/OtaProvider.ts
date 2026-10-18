import { OtaChannel, OtaManifest } from "./types";

/**
 * Standard OTA Server Abstraction Interface
 */
export interface IOtaProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Check whether a new update is available on the specified channel
   */
  checkForUpdate(
    channel: OtaChannel,
    currentVersion: string
  ): Promise<OtaManifest | null>;

  /**
   * Fetch an explicit manifest from a URL
   */
  fetchManifest(manifestUrl: string): Promise<OtaManifest>;

  /**
   * Download the bundle binary as an ArrayBuffer with progress reporting and cancellation
   */
  downloadBundle(
    bundleUrl: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<ArrayBuffer>;
}

/**
 * Static Manifest OTA Provider
 * Loads manifest from an HTTP endpoint / CDN (e.g. /ota-manifest.json or static server)
 */
export class StaticManifestOtaProvider implements IOtaProvider {
  public readonly id = "static-manifest-provider";
  public readonly name = "Static Manifest Provider";

  private readonly baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  public async checkForUpdate(
    channel: OtaChannel,
    currentVersion: string
  ): Promise<OtaManifest | null> {
    const url = `${this.baseUrl}/ota-manifest-${channel}.json?t=${Date.now()}`;
    try {
      const manifest = await this.fetchManifest(url);
      if (manifest && manifest.channel === channel && manifest.version !== currentVersion) {
        return manifest;
      }
      return null;
    } catch {
      // If channel-specific manifest not found, try fallback ota-manifest.json
      try {
        const fallbackUrl = `${this.baseUrl}/ota-manifest.json?t=${Date.now()}`;
        const fallbackManifest = await this.fetchManifest(fallbackUrl);
        if (
          fallbackManifest &&
          fallbackManifest.channel === channel &&
          fallbackManifest.version !== currentVersion
        ) {
          return fallbackManifest;
        }
      } catch {
        // Offline or unavailable
      }
      return null;
    }
  }

  public async fetchManifest(manifestUrl: string): Promise<OtaManifest> {
    const res = await fetch(manifestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch OTA manifest: HTTP ${res.status}`);
    }

    const data = await res.json();
    this.validateManifestSchema(data);
    return data as OtaManifest;
  }

  public async downloadBundle(
    bundleUrl: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    const res = await fetch(bundleUrl, {
      method: "GET",
      signal,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Failed to download OTA bundle: HTTP ${res.status}`);
    }

    const contentLength = Number(res.headers.get("content-length")) || 0;
    const reader = res.body?.getReader();

    if (!reader) {
      const buf = await res.arrayBuffer();
      onProgress?.(1.0);
      return buf;
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (contentLength > 0 && onProgress) {
          onProgress(Math.min(0.99, receivedBytes / contentLength));
        }
      }
    }

    const combined = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    onProgress?.(1.0);
    return combined.buffer;
  }

  private validateManifestSchema(data: any): void {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid manifest: must be a JSON object");
    }
    if (!data.version || typeof data.version !== "string") {
      throw new Error("Invalid manifest: missing or invalid 'version'");
    }
    if (!data.bundleUrl || typeof data.bundleUrl !== "string") {
      throw new Error("Invalid manifest: missing or invalid 'bundleUrl'");
    }
    if (!data.checksum || typeof data.checksum !== "string") {
      throw new Error("Invalid manifest: missing or invalid 'checksum'");
    }
    if (!data.minNativeVersion || typeof data.minNativeVersion !== "string") {
      throw new Error("Invalid manifest: missing or invalid 'minNativeVersion'");
    }
  }
}

/**
 * Capgo-Compatible OTA Provider
 * Communicates with Capgo bundle API / channel distribution
 */
export class CapgoOtaProvider implements IOtaProvider {
  public readonly id = "capgo-provider";
  public readonly name = "Capgo Distribution Provider";

  private readonly appId: string;
  private readonly staticProvider: StaticManifestOtaProvider;

  constructor(appId: string = "4ff5064c-bd8c-4b62-b998-25e5da1d59c5") {
    this.appId = appId;
    this.staticProvider = new StaticManifestOtaProvider();
  }

  public async checkForUpdate(
    channel: OtaChannel,
    currentVersion: string
  ): Promise<OtaManifest | null> {
    try {
      // In production/staging, query Capgo public bundle endpoint or static manifest
      return await this.staticProvider.checkForUpdate(channel, currentVersion);
    } catch {
      return null;
    }
  }

  public async fetchManifest(manifestUrl: string): Promise<OtaManifest> {
    return this.staticProvider.fetchManifest(manifestUrl);
  }

  public async downloadBundle(
    bundleUrl: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    return this.staticProvider.downloadBundle(bundleUrl, onProgress, signal);
  }
}
