import { Capacitor } from "@capacitor/core";

export type OTAUpdateStatus =
  | "idle"
  | "checking"
  | "no-update"
  | "update-available"
  | "downloading"
  | "ready-to-install"
  | "installing"
  | "success"
  | "error";

export interface OTAUpdateState {
  status: OTAUpdateStatus;
  progress: number;
  version?: string;
  error?: string;
}

/**
 * OTA Update Service for Vieron
 * Handles Web-only updates via @capgo/capacitor-updater
 *
 * UPDATE SAFETY GUIDELINES:
 *
 * WEB/OTA-SAFE (Can be updated via Capgo without APK reinstall):
 * - React UI components and layouts
 * - CSS/Styling
 * - TypeScript/JavaScript logic
 * - AI Web workers (imageAi.worker, etc.)
 * - Existing WASM assets (ONNX Runtime, FFmpeg WASM)
 * - Static assets (images, icons in dist)
 * - Bug fixes in the Web layer
 *
 * NATIVE RELEASE REQUIRED (Requires new APK/AAB build):
 * - Java/Kotlin source code changes
 * - AndroidManifest.xml modifications (new permissions, activities, metadata)
 * - New native plugins or changes to existing native plugin APIs
 * - ML Kit native dependency version changes
 * - Gradle, AGP, Kotlin, or Android SDK version changes
 * - applicationId or Signing Key changes
 */
class CapgoService {
  private static instance: CapgoService;
  private updater: any = null;
  private isInitialized = false;
  private listeners: Set<(state: OTAUpdateState) => void> = new Set();
  private state: OTAUpdateState = {
    status: "idle",
    progress: 0,
  };
  private currentBundle: any = null;
  private downloadedBundleId: string | null = null;

  private constructor() {}

  public static getInstance(): CapgoService {
    if (!CapgoService.instance) {
      CapgoService.instance = new CapgoService();
    }
    return CapgoService.instance;
  }

  private setState(newState: Partial<OTAUpdateState>) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach((listener) => listener(this.state));
  }

  public getState(): OTAUpdateState {
    return this.state;
  }

  public subscribe(listener: (state: OTAUpdateState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Initializes the Capgo service and notifies app ready.
   */
  public async init() {
    if (this.isInitialized || typeof window === "undefined" || !Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
      this.updater = CapacitorUpdater;

      // 1. Notify Capgo that the app booted successfully.
      await this.updater.notifyAppReady();

      // 2. Fetch current bundle info
      this.currentBundle = await this.updater.current();
      console.log("[Capgo] App ready. Current bundle:", this.currentBundle);

      // 3. Setup listeners
      this.updater.addListener("download", (info: any) => {
        if (info.percent !== undefined) {
          this.setState({ status: "downloading", progress: info.percent });
        }
      });

      this.updater.addListener("downloadComplete", () => {
        this.setState({ status: "ready-to-install", progress: 100 });
      });

      this.updater.addListener("downloadFailed", (err: any) => {
        console.error("[Capgo] Download failed:", err);
        this.setState({ status: "error", error: "Download failed" });
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("[Capgo] Initialization failed:", error);
    }
  }

  /**
   * Get current Web version identifier
   */
  public getWebVersion(): string {
    return this.currentBundle?.bundle?.version || "builtin";
  }

  /**
   * Checks for available updates.
   */
  public async checkForUpdate(): Promise<boolean> {
    if (!this.isInitialized || !this.updater) return false;

    if (this.state.status === "checking" || this.state.status === "downloading") return false;

    this.setState({ status: "checking", error: undefined });

    try {
      const latest = await this.updater.getLatest();
      console.log("[Capgo] Check result:", latest);

      if (latest.kind === "up_to_date") {
        this.setState({ status: "no-update" });
        return false;
      }

      if (latest.url && latest.version) {
        this.setState({
          status: "update-available",
          version: latest.version
        });
        return true;
      }

      this.setState({ status: "no-update" });
      return false;
    } catch (error: any) {
      console.error("[Capgo] Check failed:", error);
      this.setState({ status: "error", error: error?.message || "Failed to check for updates" });
      return false;
    }
  }

  /**
   * Downloads the available update.
   */
  public async downloadUpdate(): Promise<void> {
    if (!this.isInitialized || !this.updater) return;
    if (this.state.status !== "update-available") return;

    this.setState({ status: "downloading", progress: 0 });

    try {
      const latest = await this.updater.getLatest();
      if (!latest.url || !latest.version) {
        throw new Error("No update info available for download");
      }

      const bundle = await this.updater.download({
        url: latest.url,
        version: latest.version,
      });

      console.log("[Capgo] Downloaded bundle:", bundle);
      this.downloadedBundleId = bundle.id;
      this.setState({ status: "ready-to-install", progress: 100 });
    } catch (error: any) {
      console.error("[Capgo] Download failed:", error);
      this.setState({ status: "error", error: error?.message || "Failed to download update" });
    }
  }

  /**
   * Applies the update and reloads the app.
   */
  public async applyUpdate(): Promise<void> {
    if (!this.isInitialized || !this.updater) return;
    if (this.state.status !== "ready-to-install" || !this.downloadedBundleId) return;

    this.setState({ status: "installing" });

    try {
      // Set the bundle as active and reload immediately
      await this.updater.set({ id: this.downloadedBundleId });

      // Note: app will reload here
      this.setState({ status: "success" });
    } catch (error: any) {
      console.error("[Capgo] Apply failed:", error);
      this.setState({ status: "error", error: error?.message || "Failed to apply update" });
    }
  }
}

export const otaService = CapgoService.getInstance();

/**
 * Legacy wrapper for main.tsx compatibility
 */
export async function initCapgo() {
  await otaService.init();
}
