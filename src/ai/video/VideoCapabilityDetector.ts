/**
 * Video AI Capability Detector
 * Evaluates hardware and runtime capabilities for video encoding, decoding, OffscreenCanvas, and WASM.
 */

import { VideoCapabilityProfile } from "./types";

export class VideoCapabilityDetector {
  private static instance: VideoCapabilityDetector;
  private cachedProfile: VideoCapabilityProfile | null = null;

  public static getInstance(): VideoCapabilityDetector {
    if (!VideoCapabilityDetector.instance) {
      VideoCapabilityDetector.instance = new VideoCapabilityDetector();
    }
    return VideoCapabilityDetector.instance;
  }

  public async detect(forceRefresh = false): Promise<VideoCapabilityProfile> {
    if (this.cachedProfile && !forceRefresh) {
      return this.cachedProfile;
    }

    const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

    // 1. Device and OS Detection
    const ua = isBrowser ? navigator.userAgent || "" : "";
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    // 2. Hardware constraints
    const deviceMemoryGB = isBrowser && "deviceMemory" in navigator
      ? Number((navigator as any).deviceMemory || 4)
      : isAndroid ? 3 : 4;
    const hardwareConcurrency = isBrowser && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;

    // 3. WebCodecs check
    const hasVideoEncoder = isBrowser && typeof VideoEncoder === "function";
    const hasVideoDecoder = isBrowser && typeof VideoDecoder === "function";
    const hasWebCodecs = hasVideoEncoder;

    // 4. OffscreenCanvas check
    const hasOffscreenCanvas = isBrowser && typeof OffscreenCanvas === "function";

    // 5. WebGL2 check
    let hasWebGL2 = false;
    if (isBrowser) {
      try {
        const c = document.createElement("canvas");
        hasWebGL2 = Boolean(c.getContext("webgl2"));
      } catch {
        hasWebGL2 = false;
      }
    }

    // 6. WebGPU check
    const hasWebGPU = isBrowser && "gpu" in navigator && Boolean((navigator as any).gpu);

    // 7. WASM & SIMD check
    const hasWASM = isBrowser && typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
    let hasSIMD = false;
    if (hasWASM && typeof WebAssembly.validate === "function") {
      try {
        // WebAssembly SIMD byte signature
        hasSIMD = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 125, 0, 0, 0, 0, 11]));
      } catch {
        hasSIMD = false;
      }
    }

    // 8. Recommended Encoder
    let recommendedEncoder: "webcodecs" | "ffmpeg-wasm" | "media-recorder" = "media-recorder";
    if (hasVideoEncoder) {
      recommendedEncoder = "webcodecs";
    } else if (hasWASM) {
      recommendedEncoder = "ffmpeg-wasm";
    }

    // 9. Recommended Resolution Ceiling based on RAM & device tier
    let recommendedMaxResolution = { width: 1920, height: 1080, name: "1080p Full HD" };
    if (deviceMemoryGB <= 2 || (isAndroid && deviceMemoryGB <= 3)) {
      recommendedMaxResolution = { width: 1280, height: 720, name: "720p HD (RAM Optimized)" };
    } else if (deviceMemoryGB >= 8 && hasWebCodecs) {
      recommendedMaxResolution = { width: 1920, height: 1080, name: "1080p Full HD (Pro)" };
    }

    const profile: VideoCapabilityProfile = {
      hasWebCodecs,
      hasVideoEncoder,
      hasVideoDecoder,
      hasOffscreenCanvas,
      hasWebGL2,
      hasWebGPU,
      hasWASM,
      hasSIMD,
      deviceMemoryGB,
      hardwareConcurrency,
      isAndroid,
      isIOS,
      recommendedEncoder,
      recommendedMaxResolution,
    };

    this.cachedProfile = profile;
    return profile;
  }
}
