import { DeviceResourceProfile } from "./types";
import { AICapability } from "./types";

export class AIResourceManager {
  private static instance: AIResourceManager;
  private profile: DeviceResourceProfile;
  private lastNavDeviceMemory: any;

  public static getInstance(): AIResourceManager {
    if (!AIResourceManager.instance) {
      AIResourceManager.instance = new AIResourceManager();
    }
    return AIResourceManager.instance;
  }

  constructor() {
    const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
    this.lastNavDeviceMemory = isBrowser && "deviceMemory" in navigator ? (navigator as any).deviceMemory : undefined;
    this.profile = this.detectDeviceProfile();
  }

  private detectDeviceProfile(): DeviceResourceProfile {
    const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

    const hasWebGPU = isBrowser && "gpu" in navigator && Boolean((navigator as any).gpu);
    const hasWebGL = isBrowser && Boolean(
      window.WebGLRenderingContext || window.WebGL2RenderingContext
    );
    const hasWASM = isBrowser && typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";

    const memoryKnown = isBrowser && "deviceMemory" in navigator && (navigator as any).deviceMemory !== undefined;
    const memory = memoryKnown
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

    const availableRAMMB = Math.round(memory * 1024);

    return {
      hasWebGPU,
      hasWebGL,
      hasWASM,
      memoryKnown,
      deviceMemoryGB: memory,
      availableRAMMB,
      hardwareConcurrency: concurrency,
      isAndroid,
      isIOS,
      recommendedMode,
    };
  }

  public getProfile(): DeviceResourceProfile {
    const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
    const currentNavMem = isBrowser && "deviceMemory" in navigator ? (navigator as any).deviceMemory : undefined;
    if (currentNavMem !== this.lastNavDeviceMemory) {
      this.lastNavDeviceMemory = currentNavMem;
      this.profile = this.detectDeviceProfile();
    }
    return { ...this.profile };
  }

  /**
   * Evaluates if device can run a given AI Capability safely without crash
   */
  public canRunCapability(
    capability: AICapability,
    ctx?: { durationSec?: number }
  ): { allowed: boolean; reason?: string } {
    const profile = this.getProfile();

    if (capability.requiresWebGPU && !profile.hasWebGPU) {
      return { allowed: false, reason: "WebGPU is not supported on this device/browser" };
    }

    if (capability.requiresWASM && !profile.hasWASM) {
      return { allowed: false, reason: "WebAssembly is not supported" };
    }

    let requiredRAMMB = capability.estimatedRAMMB ?? 0;
    if (capability.domain === "audio" && ctx?.durationSec && ctx.durationSec > 0) {
      // durationSec × 48000 × 2 channels × 4 bytes × 6 copies
      const dynamicBytes = ctx.durationSec * 48000 * 2 * 4 * 6;
      const dynamicRAMMB = dynamicBytes / (1024 * 1024);
      requiredRAMMB = Math.max(requiredRAMMB, dynamicRAMMB);
    }

    // Check RAM bounds if specified
    if (requiredRAMMB > 0 && profile.deviceMemoryGB) {
      const availableRAMMB = profile.deviceMemoryGB * 1024 * 0.4; // Allocatable limit (~40%)
      if (requiredRAMMB > availableRAMMB) {
        return {
          allowed: false,
          reason: `Insufficient memory: requires ~${Math.round(requiredRAMMB)}MB, available limit is ~${Math.round(availableRAMMB)}MB`,
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
