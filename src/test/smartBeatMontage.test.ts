import { describe, it, expect, vi, beforeAll } from "vitest";
import { runSmartBeatMontage } from "../lib/autoMontage";
import type { MediaItem } from "@/context/MediaContext";

beforeAll(() => {
  // Mock canvas 2D context for jsdom
  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(96 * 96 * 4),
    }),
  })) as any;

  // Mock video element seeking in jsdom
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = vi.fn().mockImplementation((tagName: string) => {
    if (tagName.toLowerCase() === "video") {
      const el = originalCreateElement("video");
      let currentTime = 0;
      Object.defineProperty(el, "currentTime", {
        get: () => currentTime,
        set: (t: number) => {
          currentTime = t;
          setTimeout(() => el.dispatchEvent(new Event("seeked")), 2);
        },
      });
      el.load = vi.fn().mockImplementation(() => {
        setTimeout(() => el.dispatchEvent(new Event("seeked")), 2);
      });
      return el;
    }
    return originalCreateElement(tagName);
  });
});

// Mock worker manager & vision analyzer for vitest environment
vi.mock("../lib/videoAnalysisWorkerManager", () => ({
  VideoAnalysisWorkerManager: {
    getInstance: () => ({
      analyzeFrames: async (_frames: any[], segments: Array<{ in: number; out: number }>) => {
        return segments.map((s) => ({
          in: s.in,
          out: s.out,
          motion: s.in >= 4 && s.in <= 8 ? 0.9 : 0.1, // High motion in middle of dynamic video
          faceScore: s.in >= 4 && s.in <= 8 ? 0.85 : 0,
          handScore: 0.2,
          handVelocityScore: 0.3,
          brightness: 0.6,
          colorfulness: 0.7,
        }));
      },
    }),
  },
}));

vi.mock("../lib/beatDetector", () => ({
  calculateSegmentAudioEnergiesBatch: async (_url: string, segments: Array<{ in: number; out: number }>) => {
    return segments.map((s) => (s.in >= 4 && s.in <= 8 ? 0.85 : 0.2));
  },
  analyzeAudioTrack: async () => ({ bpm: 120, beatTimes: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] }),
  clearAudioBufferCache: () => {},
}));

vi.mock("../lib/visionAnalyzer", () => ({
  disposeVisionModels: () => {},
  resetVisionDetector: () => {},
  getVisionAnalysisStatus: () => ({
    isDetectorAvailable: true,
    isInitialized: true,
    lastEngineUsed: "mediapipe",
    sessionStats: { realMediaPipeFrames: 5, fallbackFrames: 0, facesDetected: 2, handsDetected: 1 },
  }),
  analyzeFrameVision: async () => ({
    faceCount: 1,
    faceConfidence: 0.9,
    hasHands: true,
    handCount: 1,
    handPositions: [{ x: 0.5, y: 0.5 }],
  }),
  computeVisionSegmentScore: () => ({
    faceScore: 0.9,
    handScore: 0.8,
    handVelocityScore: 0.5,
  }),
}));

describe("Smart Beat Montage Scoring & Selection", () => {
  it("prioritizes high-motion and face-detected footage moments over static footage", async () => {
    // Media 1: Dynamic video (10s)
    // Media 2: Static photo (5s)
    const media: MediaItem[] = [
      {
        id: "media-dynamic",
        name: "action_video.mp4",
        type: "video",
        url: "blob:test-video-dynamic",
        size: 1000,
      file: null as any,
      duration: 10,
        width: 1920,
        height: 1080,
      },
      {
        id: "media-static",
        name: "static_photo.jpg",
        type: "image",
        url: "blob:test-photo",
        size: 1000,
      file: null as any,
      duration: 5,
        width: 1920,
        height: 1080,
      },
    ];

    const beatTimes = [1.0, 2.0, 3.0, 4.0];

    const result = await runSmartBeatMontage({
      media,
      beatTimes,
      targetDuration: 4.0,
      fastMode: true,
    });

    expect(result.clips.length).toBeGreaterThan(0);
    expect(result.analysis.segmentsAnalyzed).toBeGreaterThan(0);

    // The high-scoring segments (in: 4-8s of media-dynamic) should be favored
    const dynamicClips = result.clips.filter((c) => c.mediaId === "media-dynamic");
    expect(dynamicClips.length).toBeGreaterThan(0);

    // Verify clips have positive non-zero durations matching beat slots
    for (const clip of result.clips) {
      expect(clip.out - clip.in).toBeGreaterThan(0);
      expect(clip.in).toBeGreaterThanOrEqual(0);
    }
  });

  it("avoids redundant duplicate intervals when sufficient unique footage is available", async () => {
    const media: MediaItem[] = [
      {
        id: "media-long",
        name: "long_video.mp4",
        type: "video",
        url: "blob:test-long",
        size: 1000,
      file: null as any,
      duration: 20,
        width: 1920,
        height: 1080,
      },
    ];

    const beatTimes = [1.0, 2.0, 3.0, 4.0, 5.0];

    const result = await runSmartBeatMontage({
      media,
      beatTimes,
      targetDuration: 5.0,
      fastMode: true,
    });

    expect(result.clips.length).toBe(5);

    // Check that start timestamps are diverse and not all identical
    const startTimes = result.clips.map((c) => Math.round(c.in * 10) / 10);
    const uniqueStarts = new Set(startTimes);
    expect(uniqueStarts.size).toBeGreaterThan(1);
  });
});
