import { DeviceResourceProfile } from "./types";
import { AICapability } from "./types";

export class AIResourceManager {
  private static instance: AIResourceManager;
  private profile: DeviceResourceProfile;

  public static getInstance(): AIResourceManager {
    if (!AIResourceManager.instance) {
      AIResourceManager.instance = new AIResourceManager();
    }
    return AIResourceManager.instance;
  }

  constructor() {
    this.profile = this.detectDeviceProfile();
  }

  private detectDeviceProfile(): DeviceResourceProfile {
    const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

    const hasWebGPU = isBrowser && "gpu" in navigator && Boolean((navigator as any).gpu);
    const hasWebGL = isBrowser && Boolean(
      window.WebGLRenderingContext || window.WebGL2RenderingContext
    );
    const hasWASM = isBrowser && typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";

    const memory = isBrowser && "deviceMemory" in navigator
      ? Number((navigator as any).deviceMemory || 4)
      : 4;

    const concurrency = isBrowser && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;

    const ua = isBrowser ? navigator.userAgent || "" : "";
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    // Decision rule for recommended execution mode
    let recommendedMode: "auto" | "remote" | "local" = "auto";
    if (isAndroid && memory < 3) {
      recommendedMode = "remote"; // Constrained Android mobile prefers API execution
    }

    return {
      hasWebGPU,
      hasWebGL,
      hasWASM,
      deviceMemoryGB: memory,
      hardwareConcurrency: concurrency,
      isAndroid,
      isIOS,
      recommendedMode,
    };
  }

  public getProfile(): DeviceResourceProfile {
    return { ...this.profile };
  }

  /**
   * Evaluates if device can run a given AI Capability safely without crash
   */
  public canRunCapability(capability: AICapability): { allowed: boolean; reason?: string } {
    if (capability.requiresWebGPU && !this.profile.hasWebGPU) {
      return { allowed: false, reason: "WebGPU is not supported on this device/browser" };
    }

    if (capability.requiresWASM && !this.profile.hasWASM) {
      return { allowed: false, reason: "WebAssembly is not supported" };
    }

    // Check RAM bounds if specified
    if (capability.estimatedRAMMB && this.profile.deviceMemoryGB) {
      const availableRAMMB = this.profile.deviceMemoryGB * 1024 * 0.4; // Allocatable limit (~40%)
      if (capability.estimatedRAMMB > availableRAMMB) {
        return {
          allowed: false,
          reason: `Insufficient memory: requires ~${capability.estimatedRAMMB}MB, available limit is ~${Math.round(availableRAMMB)}MB`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Determines maximum safe concurrent jobs
   */
  public getMaxConcurrentJobs(): number {
    if (this.profile.isAndroid) return 1;
    if (this.profile.deviceMemoryGB && this.profile.deviceMemoryGB <= 2) return 1;
    return Math.max(1, Math.min(3, Math.floor(this.profile.hardwareConcurrency / 2)));
  }
}
