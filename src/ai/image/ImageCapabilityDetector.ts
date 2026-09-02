/**
 * ImageCapabilityDetector
 * Analyzes client environment: RAM, CPU, WebGPU, WebGL2, WASM SIMD, Threads & Android WebView.
 * Classifies device into LOW, MEDIUM, HIGH, ULTRA tiers and selects optimal engine parameters.
 */

import { DeviceTier, ExecutionProvider, ImageCapabilityProfile } from "./types";

export class ImageCapabilityDetector {
  private static instance: ImageCapabilityDetector;
  private cachedProfile: ImageCapabilityProfile | null = null;

  private constructor() {}

  public static getInstance(): ImageCapabilityDetector {
    if (!ImageCapabilityDetector.instance) {
      ImageCapabilityDetector.instance = new ImageCapabilityDetector();
    }
    return ImageCapabilityDetector.instance;
  }

  /**
   * Run full hardware and platform capability detection
   */
  public async detect(forceRefresh = false): Promise<ImageCapabilityProfile> {
    if (this.cachedProfile && !forceRefresh) {
      return this.cachedProfile;
    }

    const isBrowser = typeof window !== "undefined";
    const nav = isBrowser ? navigator : ({} as any);
    const userAgent = isBrowser ? nav.userAgent || "" : "";

    // 1. Android & WebView detection
    const isAndroid = /Android/i.test(userAgent);
    const isWebView =
      /(wv|WebView|Version\/[0-9.]+\s+Chrome\/[0-9.]+ Mobile)/i.test(userAgent) ||
      (isAndroid && /Version\/[0-9.]+/i.test(userAgent));

    // 2. Hardware specs
    const cpuCores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 4;
    
    // RAM estimation (navigator.deviceMemory is in GB on Chrome, standard browsers)
    let estimatedRamMB = 4096;
    if (typeof (nav as any).deviceMemory === "number") {
      estimatedRamMB = (nav as any).deviceMemory * 1024;
    } else {
      // Fallback estimate based on cores & platform
      if (isAndroid) {
        estimatedRamMB = cpuCores <= 4 ? 3072 : 6144;
      } else {
        estimatedRamMB = cpuCores <= 4 ? 4096 : 8192;
      }
    }

    // Performance memory check if available (Chrome specific)
    if (
      isBrowser &&
      (window.performance as any)?.memory?.jsHeapSizeLimit
    ) {
      const heapLimitMB = Math.round(
        (window.performance as any).memory.jsHeapSizeLimit / (1024 * 1024)
      );
      if (heapLimitMB > 0) {
        // Approximate total RAM from JS heap limit (typically 1/4th to 1/2 of system RAM)
        estimatedRamMB = Math.max(estimatedRamMB, heapLimitMB * 2);
      }
    }

    // 3. WebGPU detection
    let hasWebGPU = false;
    if (isBrowser && "gpu" in nav && typeof (nav as any).gpu?.requestAdapter === "function") {
      try {
        const adapter = await (nav as any).gpu.requestAdapter();
        if (adapter) {
          hasWebGPU = true;
        }
      } catch {
        hasWebGPU = false;
      }
    }

    // 4. WebGL and WebGL2 detection
    let hasWebGL = false;
    let hasWebGL2 = false;
    if (isBrowser) {
      try {
        const canvas = document.createElement("canvas");
        const gl2 = canvas.getContext("webgl2");
        if (gl2) {
          hasWebGL2 = true;
          hasWebGL = true;
        } else {
          const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
          if (gl) {
            hasWebGL = true;
          }
        }
      } catch {
        hasWebGL = false;
        hasWebGL2 = false;
      }
    }

    // 5. WASM SIMD & Threads detection
    const hasWasmSIMD = this.checkWasmSimd();
    const hasWasmThreads =
      typeof crossOriginIsolated !== "undefined" &&
      crossOriginIsolated &&
      typeof SharedArrayBuffer !== "undefined";

    // 6. Worker support
    const supportsWorkers = isBrowser && typeof Worker !== "undefined";

    // 7. Classify into Device Tier
    let deviceTier: DeviceTier = "MEDIUM";
    if (estimatedRamMB <= 3072 || cpuCores <= 2) {
      deviceTier = "LOW";
    } else if (hasWebGPU && estimatedRamMB >= 12288 && cpuCores >= 8) {
      deviceTier = "ULTRA";
    } else if ((hasWebGPU || hasWebGL2) && estimatedRamMB >= 6144 && cpuCores >= 6) {
      deviceTier = "HIGH";
    } else {
      deviceTier = "MEDIUM";
    }

    // 8. Determine optimal execution providers in priority order
    const supportedProviders: ExecutionProvider[] = [];
    if (hasWebGPU) supportedProviders.push("webgpu");
    if (hasWebGL || hasWebGL2) supportedProviders.push("webgl");
    supportedProviders.push("wasm");
    supportedProviders.push("cpu");

    const preferredProvider: ExecutionProvider = hasWebGPU
      ? "webgpu"
      : hasWebGL2
      ? "webgl"
      : "wasm";

    // 9. Determine max dimension and tiling strategy based on tier
    let maxDimension = 1536;
    let optimalTileSize = 256;
    let concurrencyLimit = 1;

    switch (deviceTier) {
      case "LOW":
        maxDimension = isAndroid ? 1024 : 1280;
        optimalTileSize = 128;
        concurrencyLimit = 1;
        break;
      case "MEDIUM":
        maxDimension = 2048;
        optimalTileSize = 256;
        concurrencyLimit = 1;
        break;
      case "HIGH":
        maxDimension = 3072;
        optimalTileSize = 384;
        concurrencyLimit = 2;
        break;
      case "ULTRA":
        maxDimension = 4096;
        optimalTileSize = 512;
        concurrencyLimit = 3;
        break;
    }

    const browserName = this.detectBrowser(userAgent);

    const profile: ImageCapabilityProfile = {
      deviceTier,
      estimatedRamMB,
      cpuCores,
      hasWebGPU,
      hasWebGL,
      hasWebGL2,
      hasWasmSIMD,
      hasWasmThreads,
      isAndroid,
      isWebView,
      browserName,
      maxDimension,
      optimalTileSize,
      preferredProvider,
      supportedProviders,
      concurrencyLimit,
      supportsWorkers,
    };

    this.cachedProfile = profile;
    return profile;
  }

  /**
   * Fast synchronous retrieval of cached profile or sensible defaults
   */
  public getProfileSync(): ImageCapabilityProfile {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }
    const isBrowser = typeof window !== "undefined";
    const isAndroid = isBrowser && /Android/i.test(navigator.userAgent);
    return {
      deviceTier: isAndroid ? "MEDIUM" : "HIGH",
      estimatedRamMB: 4096,
      cpuCores: isBrowser ? navigator.hardwareConcurrency || 4 : 4,
      hasWebGPU: false,
      hasWebGL: true,
      hasWebGL2: true,
      hasWasmSIMD: true,
      hasWasmThreads: false,
      isAndroid,
      isWebView: false,
      browserName: "Browser",
      maxDimension: 2048,
      optimalTileSize: 256,
      preferredProvider: "wasm",
      supportedProviders: ["webgl", "wasm", "cpu"],
      concurrencyLimit: 1,
      supportsWorkers: true,
    };
  }

  private checkWasmSimd(): boolean {
    try {
      if (typeof WebAssembly !== "object" || typeof WebAssembly.validate !== "function") {
        return false;
      }
      // WASM SIMD validation byte sequence
      const bytes = new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
        10, 1, 8, 0, 125, 0, 0, 0, 0, 11,
      ]);
      return WebAssembly.validate(bytes);
    } catch {
      return false;
    }
  }

  private detectBrowser(ua: string): string {
    if (/Chrome\/([0-9.]+)/i.test(ua)) return "Chrome";
    if (/Firefox\/([0-9.]+)/i.test(ua)) return "Firefox";
    if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
    if (/Edge\/([0-9.]+)/i.test(ua)) return "Edge";
    return "Unknown Browser";
  }
}
