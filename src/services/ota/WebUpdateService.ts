import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  OtaChannel,
  OtaManifest,
  OtaState,
  NativeCapabilities,
  OtaStateChangeEvent,
} from "./types";
import { IOtaProvider, CapgoOtaProvider, StaticManifestOtaProvider } from "./OtaProvider";
import { checkCompatibility } from "./compatibility";
import { verifyBundleIntegrity } from "./checksum";

export interface NativeOtaPlugin {
  getNativeCapabilities(): Promise<NativeCapabilities>;
  getCurrentActiveVersion(): Promise<{
    version: string;
    isBundled: boolean;
    channel: string;
    status: string;
  }>;
  downloadAndInstallBundle(options: {
    version: string;
    bundleUrl: string;
    checksum: string;
    minNativeVersion: string;
    channel: string;
  }): Promise<{ success: boolean; versionPath: string; version: string }>;
  activateVersion(options: { version: string }): Promise<{
    success: boolean;
    reloaded: boolean;
    activeVersion: string;
  }>;
  notifyStartupSuccess(): Promise<{ success: boolean; version: string }>;
  rollbackToLastKnownGood(): Promise<{
    success: boolean;
    rolledBackTo: string;
    reloaded: boolean;
  }>;
  getInstalledVersions(): Promise<{
    versions: Array<{
      version: string;
      channel: string;
      isCurrent: boolean;
      installedAt: string;
    }>;
  }>;
}

function getNativeOtaPlugin(): NativeOtaPlugin | null {
  if (Capacitor.isNativePlatform()) {
    try {
      return registerPlugin<NativeOtaPlugin>("VireonOTA");
    } catch {
      return null;
    }
  }
  return null;
}

export type OtaListener = (event: OtaStateChangeEvent) => void;

/**
 * Central Orchestrator for Safe OTA Web Engine Updates
 */
export class WebUpdateService {
  private static instance: WebUpdateService | null = null;

  private state: OtaState = OtaState.IDLE;
  private channel: OtaChannel = "production";
  private currentVersion: string = "1.0.0";
  private nativeCapabilities: NativeCapabilities = {
    nativeVersion: "1.0.0",
    buildNumber: 1,
    mediaApiVersion: "1.0.0",
    sttApiVersion: "1.0.0",
    modelManagerApiVersion: "1.0.0",
    capabilities: [
      "native_whisper",
      "whisper_model_manager",
      "native_media_extractor",
      "native_media_muxer",
      "native_media_metadata",
      "content_resolver_uri",
    ],
  };

  private provider: IOtaProvider;
  private pendingManifest: OtaManifest | null = null;
  private downloadedBundleData: ArrayBuffer | null = null;
  private listeners: Set<OtaListener> = new Set();
  private lastError: string | null = null;

  private constructor() {
    this.provider = new CapgoOtaProvider();
    this.initializeFromNativeOrStorage();
  }

  public static getInstance(): WebUpdateService {
    if (!WebUpdateService.instance) {
      WebUpdateService.instance = new WebUpdateService();
    }
    return WebUpdateService.instance;
  }

  /**
   * Initialize current version and native capabilities
   */
  private async initializeFromNativeOrStorage(): Promise<void> {
    const plugin = getNativeOtaPlugin();
    if (plugin) {
      try {
        const caps = await plugin.getNativeCapabilities();
        if (caps && caps.nativeVersion) {
          this.nativeCapabilities = caps;
        }
        const active = await plugin.getCurrentActiveVersion();
        if (active && active.version) {
          this.currentVersion = active.version;
        }
      } catch (e) {
        console.warn("[WebUpdateService] Failed to read native OTA info:", e);
      }
    } else {
      // Browser / storage fallback
      try {
        const storedVer = localStorage.getItem("vieron_web_version");
        if (storedVer) this.currentVersion = storedVer;
        const storedChannel = localStorage.getItem("vieron_ota_channel") as OtaChannel;
        if (storedChannel) this.channel = storedChannel;
      } catch {
        // LocalStorage unavailable
      }
    }
  }

  public setProvider(provider: IOtaProvider): void {
    this.provider = provider;
  }

  public setChannel(channel: OtaChannel): void {
    this.channel = channel;
    try {
      localStorage.setItem("vieron_ota_channel", channel);
    } catch {}
  }

  public getChannel(): OtaChannel {
    return this.channel;
  }

  public getCurrentVersion(): string {
    return this.currentVersion;
  }

  public getStatus(): OtaState {
    return this.state;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public getNativeCapabilities(): NativeCapabilities {
    return { ...this.nativeCapabilities };
  }

  public subscribe(listener: OtaListener): () => void {
    this.listeners.add(listener);
    listener({
      state: this.state,
      manifest: this.pendingManifest,
      error: this.lastError,
      activeVersion: this.currentVersion,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(payload: Partial<OtaStateChangeEvent>): void {
    const event: OtaStateChangeEvent = {
      state: this.state,
      manifest: this.pendingManifest,
      error: this.lastError,
      activeVersion: this.currentVersion,
      ...payload,
    };
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error("[WebUpdateService] Listener error:", err);
      }
    });
  }

  private setState(state: OtaState, error: string | null = null): void {
    this.state = state;
    this.lastError = error;
    this.notify({ state, error });
  }

  /**
   * Asynchronously check for update on the configured channel
   */
  public async checkForUpdate(customChannel?: OtaChannel): Promise<OtaManifest | null> {
    const targetChannel = customChannel || this.channel;
    this.setState(OtaState.CHECKING);

    try {
      const manifest = await this.provider.checkForUpdate(targetChannel, this.currentVersion);

      if (!manifest) {
        this.setState(OtaState.IDLE);
        return null;
      }

      // Check Native/Web compatibility contract
      const compat = checkCompatibility(manifest, this.nativeCapabilities);
      if (!compat.compatible) {
        console.warn(`[WebUpdateService] Update incompatible: ${compat.reason}`);
        this.setState(OtaState.INCOMPATIBLE, compat.reason);
        return null;
      }

      this.pendingManifest = manifest;
      this.setState(OtaState.AVAILABLE);
      return manifest;
    } catch (err: any) {
      console.warn("[WebUpdateService] Check for update failed (network/offline):", err);
      this.setState(OtaState.IDLE);
      return null;
    }
  }

  /**
   * Download and verify an available update bundle
   */
  public async downloadUpdate(
    manifest?: OtaManifest,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<boolean> {
    const targetManifest = manifest || this.pendingManifest;
    if (!targetManifest) {
      this.setState(OtaState.FAILED, "No manifest available to download");
      return false;
    }

    this.setState(OtaState.DOWNLOADING);

    try {
      // 1. Download to temporary in-memory buffer
      const bundleData = await this.provider.downloadBundle(
        targetManifest.bundleUrl,
        (p) => {
          this.notify({ progress: p });
          onProgress?.(p);
        },
        signal
      );

      // 2. Verify SHA-256 integrity and optional signature
      this.setState(OtaState.VERIFYING);
      const verifyResult = await verifyBundleIntegrity(
        bundleData,
        targetManifest.checksum,
        targetManifest.signature
      );

      if (!verifyResult.valid) {
        const err = verifyResult.error || "Bundle checksum mismatch";
        console.error(`[WebUpdateService] ${err}`);
        this.downloadedBundleData = null;
        this.setState(OtaState.FAILED, err);
        return false;
      }

      this.downloadedBundleData = bundleData;
      this.setState(OtaState.READY);
      return true;
    } catch (err: any) {
      this.downloadedBundleData = null;
      const message = err?.message || String(err);
      console.error("[WebUpdateService] Download failed:", message);
      this.setState(OtaState.FAILED, message);
      return false;
    }
  }

  /**
   * Atomically install and activate the verified update
   */
  public async activateUpdate(versionToActivate?: string): Promise<boolean> {
    const version = versionToActivate || this.pendingManifest?.version;
    if (!version) {
      this.setState(OtaState.FAILED, "No version specified for activation");
      return false;
    }

    this.setState(OtaState.ACTIVATING);

    const plugin = getNativeOtaPlugin();
    if (plugin && this.pendingManifest) {
      try {
        // Hand off verified manifest to Native Android OTA engine for atomic directory extraction & pointer switch
        const installRes = await plugin.downloadAndInstallBundle({
          version: this.pendingManifest.version,
          bundleUrl: this.pendingManifest.bundleUrl,
          checksum: this.pendingManifest.checksum,
          minNativeVersion: this.pendingManifest.minNativeVersion,
          channel: this.pendingManifest.channel,
        });

        if (!installRes.success) {
          this.setState(OtaState.FAILED, "Native bundle installation failed");
          return false;
        }

        // Flush Service Worker cache prior to WebView reload to prevent mixed-version assets
        await this.flushServiceWorkerCache();

        // Atomically switch active server base path
        const activateRes = await plugin.activateVersion({ version: this.pendingManifest.version });
        if (activateRes.success) {
          this.currentVersion = activateRes.activeVersion || version;
          this.setState(OtaState.ACTIVE);
          return true;
        } else {
          this.setState(OtaState.FAILED, "Native version activation failed");
          return false;
        }
      } catch (err: any) {
        console.error("[WebUpdateService] Native activation exception:", err);
        this.setState(OtaState.FAILED, err?.message || String(err));
        return false;
      }
    }

    // Browser / mock environment fallback
    try {
      await this.flushServiceWorkerCache();
      this.currentVersion = version;
      localStorage.setItem("vieron_web_version", version);
      this.setState(OtaState.ACTIVE);
      return true;
    } catch (err: any) {
      this.setState(OtaState.FAILED, err?.message || String(err));
      return false;
    }
  }

  /**
   * Rollback to the last known-good version
   */
  public async rollback(): Promise<boolean> {
    const plugin = getNativeOtaPlugin();
    if (plugin) {
      try {
        const res = await plugin.rollbackToLastKnownGood();
        if (res.success) {
          this.currentVersion = res.rolledBackTo || "bundled";
          this.setState(OtaState.ROLLED_BACK);
          return true;
        }
      } catch (err) {
        console.error("[WebUpdateService] Rollback failed:", err);
      }
    }

    // Web fallback
    try {
      localStorage.removeItem("vieron_web_version");
      this.currentVersion = "1.0.0";
      this.setState(OtaState.ROLLED_BACK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Notify native engine that startup succeeded to clear watchdog and mark as known-good
   */
  public async notifyStartupSuccess(): Promise<void> {
    const plugin = getNativeOtaPlugin();
    if (plugin) {
      try {
        await plugin.notifyStartupSuccess();
      } catch (err) {
        console.warn("[WebUpdateService] Startup success notification failed:", err);
      }
    }
  }

  /**
   * Clear PWA Service Worker caches to guarantee zero mixed-version assets
   */
  private async flushServiceWorkerCache(): Promise<void> {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active) {
          reg.active.postMessage({ type: "FLUSH_OTA_CACHE" });
        }
        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys
              .filter((k) => k.startsWith("vireon-runtime-"))
              .map((k) => caches.delete(k))
          );
        }
      } catch {
        // Cache flush optional
      }
    }
  }
}

export const webUpdateService = WebUpdateService.getInstance();
