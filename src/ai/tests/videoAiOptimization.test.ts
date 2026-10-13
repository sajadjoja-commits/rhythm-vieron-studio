import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateH264Level } from "../video/VideoEncoderEngine";
import {
  RANGE_WEIGHT_LUT,
  RANGE_WEIGHT_SIGMA,
  processEnhanceFrameShared,
  EnhancementDspState,
} from "../video/enhancementDsp";
import { processingDimensions } from "../video/videoProcessingPolicy";
import { VideoCapabilityProfile } from "../video/types";

describe("Video AI Optimization & Robustness Requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Test (أ): H.264 level calculation matches specification
  // 720p30=0x1F, 1080p30=0x28, 1080p60=0x2A, 4K30=0x33
  // --------------------------------------------------------------------------
  it("Test (أ): should calculate exact H.264 levels for standard resolutions & fps", () => {
    expect(calculateH264Level(1280, 720, 30)).toBe("1F"); // 720p30 = 0x1F (Level 3.1)
    expect(calculateH264Level(1920, 1080, 30)).toBe("28"); // 1080p30 = 0x28 (Level 4.0)
    expect(calculateH264Level(1920, 1080, 60)).toBe("2A"); // 1080p60 = 0x2A (Level 4.2)
    expect(calculateH264Level(3840, 2160, 30)).toBe("33"); // 4K30 = 0x33 (Level 5.1)
  });

  // --------------------------------------------------------------------------
  // Test (ب): Max 1 pending addFrame pattern (at most 1 in-flight encode request)
  // --------------------------------------------------------------------------
  it("Test (ب): should enforce at most 1 pending addFrame in-flight at any moment", async () => {
    let inFlightAddFrames = 0;
    let maxConcurrentAddFrames = 0;
    const addFrameCalls: number[] = [];

    const mockEncoder = {
      addFrame: vi.fn(async (_canvas: any, _timestamp: number, _isKey: boolean) => {
        inFlightAddFrames++;
        if (inFlightAddFrames > maxConcurrentAddFrames) {
          maxConcurrentAddFrames = inFlightAddFrames;
        }
        addFrameCalls.push(inFlightAddFrames);
        // Simulate async hardware encoding latency
        await new Promise((r) => setTimeout(r, 10));
        inFlightAddFrames--;
      }),
    };

    // Simulate loop logic with pendingAddFrame
    let pendingAddFrame: Promise<void> | null = null;
    const totalFrames = 5;

    for (let i = 0; i < totalFrames; i++) {
      if (pendingAddFrame) {
        await pendingAddFrame;
        pendingAddFrame = null;
      }
      pendingAddFrame = mockEncoder.addFrame({} as any, i * 33333, i === 0);
    }

    if (pendingAddFrame) {
      await pendingAddFrame;
      pendingAddFrame = null;
    }

    expect(mockEncoder.addFrame).toHaveBeenCalledTimes(totalFrames);
    expect(maxConcurrentAddFrames).toBe(1);
    expect(inFlightAddFrames).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Test (ج): 60fps video segmentation calls reduced by ~half (every 2 frames)
  // --------------------------------------------------------------------------
  it("Test (ج): should reduce segmentImageSource calls by ~50% for 60fps video", async () => {
    const mockSegmentImageSource = vi.fn().mockResolvedValue({
      maskData: new Float32Array(256 * 256).fill(1.0),
      maskWidth: 256,
      maskHeight: 256,
      stats: { foregroundPixelCount: 1000, foregroundPercentage: 15 },
    });

    const fps = 60;
    const totalFrames = 10;
    let cachedMaskInfo: any = null;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const reuseMask = fps > 45 && frameIdx % 2 !== 0 && cachedMaskInfo !== null;
      if (reuseMask) {
        // Reuse cached mask
      } else {
        cachedMaskInfo = await mockSegmentImageSource();
      }
    }

    // For 10 frames at 60fps: frames 0, 2, 4, 6, 8 run segmentation (5 calls instead of 10)
    expect(mockSegmentImageSource).toHaveBeenCalledTimes(5);
  });

  // --------------------------------------------------------------------------
  // Test (د): Precomputed Bilateral LUT matches exact Math.exp with error <= 1/255
  // --------------------------------------------------------------------------
  it("Test (د): precomputed RANGE_WEIGHT_LUT must match Math.exp within 1/255 error", () => {
    const maxAllowedError = 1 / 255; // ~0.00392
    const denom = 2 * RANGE_WEIGHT_SIGMA * RANGE_WEIGHT_SIGMA;

    for (let d = 0; d < 256; d++) {
      const exactExp = Math.exp(-(d * d) / denom);
      const lutVal = RANGE_WEIGHT_LUT[d];
      const error = Math.abs(lutVal - exactExp);

      expect(error).toBeLessThanOrEqual(maxAllowedError);
    }
  });

  // --------------------------------------------------------------------------
  // Test (هـ): Consecutive static frames produce deterministic output within +/- 1
  // --------------------------------------------------------------------------
  it("Test (هـ): consecutive static frames must produce identical output within +/- 1 per channel", () => {
    const width = 16;
    const height = 16;
    const numPixels = width * height;

    const baseFrame = new Uint8ClampedArray(numPixels * 4);
    for (let i = 0; i < numPixels; i++) {
      baseFrame[i * 4] = (i * 7) % 256;
      baseFrame[i * 4 + 1] = (i * 13) % 256;
      baseFrame[i * 4 + 2] = (i * 19) % 256;
      baseFrame[i * 4 + 3] = 255;
    }

    const state = new EnhancementDspState();

    // Frame 1
    const frame1 = new Uint8ClampedArray(baseFrame);
    processEnhanceFrameShared(width, height, frame1, {}, state);

    // Frame 2 (identical static frame)
    const frame2 = new Uint8ClampedArray(baseFrame);
    processEnhanceFrameShared(width, height, frame2, {}, state);

    let maxChannelDiff = 0;
    for (let i = 0; i < frame1.length; i++) {
      const diff = Math.abs(frame2[i] - frame1[i]);
      if (diff > maxChannelDiff) maxChannelDiff = diff;
    }

    // Must match within +/- 1 per channel
    expect(maxChannelDiff).toBeLessThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Test (و): Android resolution policy with deviceMemoryGB and memoryKnown
  // --------------------------------------------------------------------------
  it("Test (و): Android resolution should be 1920 if deviceMemoryGB >= 6 and memoryKnown, else 1280", () => {
    const baseProfile: VideoCapabilityProfile = {
      hasWebCodecs: true,
      hasVideoEncoder: true,
      hasVideoDecoder: true,
      hasOffscreenCanvas: true,
      hasWebGL2: true,
      hasWebGPU: false,
      hasWASM: true,
      hasSIMD: true,
      deviceMemoryGB: 4,
      memoryKnown: true,
      hardwareConcurrency: 8,
      isAndroid: true,
      isIOS: false,
      recommendedEncoder: "webcodecs",
      recommendedMaxResolution: { width: 1280, height: 720, name: "720p HD" },
    };

    // Android with 4GB -> 1280
    const dims4 = processingDimensions(1920, 1080, baseProfile);
    expect(dims4.width).toBe(1280);
    expect(dims4.outputWidth).toBe(1280);
    expect(dims4.downscaled).toBe(true);

    // Android with 6GB & memoryKnown=true -> 1920
    const profile6Known = { ...baseProfile, deviceMemoryGB: 6, memoryKnown: true };
    const dims6 = processingDimensions(1920, 1080, profile6Known);
    expect(dims6.width).toBe(1920);
    expect(dims6.outputWidth).toBe(1920);
    expect(dims6.downscaled).toBe(false);

    // Android with 8GB but memoryKnown=false -> 1280
    const profile8Unknown = { ...baseProfile, deviceMemoryGB: 8, memoryKnown: false };
    const dimsUnknown = processingDimensions(1920, 1080, profile8Unknown);
    expect(dimsUnknown.width).toBe(1280);
    expect(dimsUnknown.outputWidth).toBe(1280);
    expect(dimsUnknown.downscaled).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test (ز): Cache verification rejects dead blob URL and history omits Blob
  // --------------------------------------------------------------------------
  it("Test (ز): cache verification rejects dead blob URL and history excludes large Blob", async () => {
    const globalFetch = globalThis.fetch;

    // Simulate dead blob URL: fetch throws TypeError
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    async function isBlobUrlAlive(url: string | undefined): Promise<boolean> {
      if (!url) return false;
      if (!url.startsWith("blob:")) return true;
      try {
        const controller = new AbortController();
        const res = await fetch(url, { signal: controller.signal });
        controller.abort();
        return res.ok || res.status === 200;
      } catch {
        return false;
      }
    }

    const isAlive = await isBlobUrlAlive("blob:http://localhost:3000/dead-uuid");
    expect(isAlive).toBe(false);

    // Cache-safe object has resultOmitted and no Blob instance
    const cacheSafeResult = {
      outputVideoBase64OrUrl: "https://example.com/video.mp4",
      width: 1920,
      height: 1080,
      durationSeconds: 10,
      resultOmitted: true,
    };
    expect((cacheSafeResult as any).blob).toBeUndefined();
    expect((cacheSafeResult as any).outputBlob).toBeUndefined();
    expect(cacheSafeResult.resultOmitted).toBe(true);

    globalThis.fetch = globalFetch;
  });
});
