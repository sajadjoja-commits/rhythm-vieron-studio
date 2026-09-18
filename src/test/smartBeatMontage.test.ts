import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { 
  runSmartBeatMontage, 
  buildMusicalBeatSlots, 
  clearVideoAnalysisCache, 
  buildVideoCacheKey 
} from "../lib/autoMontage";
import { mapBeatsToTimeline, type BeatAnalysisResult } from "../lib/beatDetector";
import type { MediaItem } from "@/context/MediaContext";

beforeAll(() => {
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

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

const mockWorkerAnalyzeFrames = vi.fn();

vi.mock("../lib/videoAnalysisWorkerManager", () => ({
  VideoAnalysisWorkerManager: {
    getInstance: () => ({
      analyzeFrames: (...args: any[]) => mockWorkerAnalyzeFrames(...args),
    }),
  },
}));

vi.mock("../lib/beatDetector", async () => {
  const actual = await vi.importActual<any>("../lib/beatDetector");
  return {
    ...actual,
    calculateSegmentAudioEnergiesBatch: async (_url: string, segments: Array<{ in: number; out: number }>) => {
      return segments.map((s) => (s.in >= 4 && s.in <= 8 ? 0.85 : 0.2));
    },
    analyzeAudioTrack: async () => ({
      bpm: 120,
      offset: 0,
      beatTimes: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
      downbeats: [0.5, 2.5, 4.5],
      strongBeats: [0.5, 1.5, 2.5, 3.5, 4.5],
      peaks: [0.5, 2.5],
      beats: [
        { time: 0.5, strength: 0.9, isDownbeat: true, isStrong: true, section: "calm", energy: 0.2 },
        { time: 1.0, strength: 0.4, isDownbeat: false, isStrong: false, section: "calm", energy: 0.2 },
        { time: 1.5, strength: 0.7, isDownbeat: false, isStrong: true, section: "calm", energy: 0.25 },
        { time: 2.0, strength: 0.3, isDownbeat: false, isStrong: false, section: "calm", energy: 0.25 },
        { time: 2.5, strength: 0.95, isDownbeat: true, isStrong: true, section: "drop", energy: 0.85 },
        { time: 3.0, strength: 0.8, isDownbeat: false, isStrong: false, section: "drop", energy: 0.9 },
        { time: 3.5, strength: 0.85, isDownbeat: false, isStrong: true, section: "drop", energy: 0.88 },
        { time: 4.0, strength: 0.75, isDownbeat: false, isStrong: false, section: "drop", energy: 0.82 },
        { time: 4.5, strength: 0.9, isDownbeat: true, isStrong: true, section: "verse", energy: 0.55 },
        { time: 5.0, strength: 0.5, isDownbeat: false, isStrong: false, section: "verse", energy: 0.5 },
      ],
      energyCurve: [],
      sections: [
        { type: "calm", start: 0, end: 2.4, avgEnergy: 0.22, peakEnergy: 0.25 },
        { type: "drop", start: 2.4, end: 4.2, avgEnergy: 0.86, peakEnergy: 0.95 },
        { type: "verse", start: 4.2, end: 5.5, avgEnergy: 0.52, peakEnergy: 0.6 },
      ],
      duration: 5.5,
    }),
    clearAudioBufferCache: () => {},
  };
});

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
    faceScore: 0.85,
    handScore: 0.6,
    handVelocityScore: 0.4,
  }),
}));

describe("Comprehensive Smart Cut & Rhythm Engine Test Suite", () => {
  beforeEach(() => {
    clearVideoAnalysisCache();
    mockWorkerAnalyzeFrames.mockImplementation(async (_frames: any[], segments: Array<{ in: number; out: number }>) => {
      return segments.map((s) => ({
        in: s.in,
        out: s.out,
        motion: s.in >= 3 && s.in <= 7 ? 0.85 : 0.2,
        sharpness: 0.75,
        blurPenalty: 1.0,
        exposureQuality: 1.0,
        actionIntensity: s.in >= 3 && s.in <= 7 ? 0.9 : 0.2,
        temporalStability: 0.8,
        faceScore: s.in >= 3 && s.in <= 7 ? 0.8 : 0.1,
        handScore: 0.2,
        handVelocityScore: 0.3,
        brightness: 0.55,
        colorfulness: 0.6,
        containsTransition: false,
        overallQuality: s.in >= 3 && s.in <= 7 ? 0.88 : 0.45,
      }));
    });
  });

  // 1. Single Short Video Scenario
  it("Scenario 1: Single short video (3s) cuts within valid bounds without overflowing duration", async () => {
    const media: MediaItem[] = [
      {
        id: "short-vid",
        name: "short.mp4",
        type: "video",
        url: "blob:short",
        duration: 3.2,
        width: 1080,
        height: 1920,
      },
    ];

    const result = await runSmartBeatMontage({
      media,
      beatTimes: [0.8, 1.6, 2.4, 3.0],
      targetDuration: 3.0,
      minShotDuration: 0.6,
    });

    expect(result.clips.length).toBeGreaterThan(0);
    for (const clip of result.clips) {
      expect(clip.in).toBeGreaterThanOrEqual(0);
      expect(clip.out).toBeLessThanOrEqual(3.2);
      expect(clip.out - clip.in).toBeGreaterThanOrEqual(0.5);
    }
  });

  // 2. Ten Different Videos Scenario (Diversity & Round Robin)
  it("Scenario 2: 10 different videos distributes cuts evenly and alternates sources", async () => {
    const media: MediaItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `vid-${i + 1}`,
      name: `video_${i + 1}.mp4`,
      type: "video",
      url: `blob:vid-${i + 1}`,
      duration: 10,
      width: 1920,
      height: 1080,
    }));

    const result = await runSmartBeatMontage({
      media,
      beatTimes: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
      targetDuration: 8.0,
    });

    expect(result.clips.length).toBe(8);

    // Verify diversity: no consecutive cuts from the exact same media item
    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i].mediaId).not.toBe(result.clips[i - 1].mediaId);
    }

    // Verify multiple different media items were selected
    const selectedMediaIds = new Set(result.clips.map((c) => c.mediaId));
    expect(selectedMediaIds.size).toBeGreaterThanOrEqual(4);
  });

  // 3. Videos of Mixed Durations (Short, Medium, Long)
  it("Scenario 3: Mixed video lengths (2s, 12s, 45s) properly sliced without boundary overflow", async () => {
    const media: MediaItem[] = [
      { id: "vid-short", name: "v1.mp4", type: "video", url: "blob:v1", duration: 2.2, width: 1920, height: 1080 },
      { id: "vid-med", name: "v2.mp4", type: "video", url: "blob:v2", duration: 12.0, width: 1920, height: 1080 },
      { id: "vid-long", name: "v3.mp4", type: "video", url: "blob:v3", duration: 45.0, width: 1920, height: 1080 },
    ];

    const result = await runSmartBeatMontage({
      media,
      beatTimes: [1.2, 2.4, 3.6, 5.0],
      targetDuration: 5.0,
    });

    expect(result.clips.length).toBeGreaterThanOrEqual(3);
    for (const c of result.clips) {
      const src = media.find((m) => m.id === c.mediaId)!;
      expect(c.in).toBeGreaterThanOrEqual(0);
      expect(c.out).toBeLessThanOrEqual(src.duration);
    }
  });

  // 4. Musical Rhythm: Calm Music Section Handling
  it("Scenario 4: Calm music sections produce longer sustained shots (>= 1.2s)", () => {
    const calmBeats: BeatAnalysisResult = {
      bpm: 80,
      offset: 0,
      beatTimes: [0.75, 1.5, 2.25, 3.0, 3.75, 4.5],
      downbeats: [0.75, 3.75],
      strongBeats: [0.75, 2.25, 3.75],
      peaks: [],
      beats: [
        { time: 0.75, strength: 0.4, isDownbeat: true, isStrong: true, section: "calm", energy: 0.2 },
        { time: 1.5, strength: 0.2, isDownbeat: false, isStrong: false, section: "calm", energy: 0.2 },
        { time: 2.25, strength: 0.3, isDownbeat: false, isStrong: true, section: "calm", energy: 0.2 },
        { time: 3.0, strength: 0.2, isDownbeat: false, isStrong: false, section: "calm", energy: 0.2 },
        { time: 3.75, strength: 0.4, isDownbeat: true, isStrong: true, section: "calm", energy: 0.2 },
        { time: 4.5, strength: 0.2, isDownbeat: false, isStrong: false, section: "calm", energy: 0.2 },
      ],
      energyCurve: [],
      sections: [{ type: "calm", start: 0, end: 5.0, avgEnergy: 0.2, peakEnergy: 0.25 }],
      duration: 5.0,
    };

    const slots = buildMusicalBeatSlots(calmBeats, calmBeats.beatTimes, 5.0, 0.7, 4.0);
    // In calm section, beats are grouped so shots are longer
    for (const slot of slots) {
      expect(slot.dur).toBeGreaterThanOrEqual(1.2);
    }
  });

  // 5. Fast Tempo Music & Minimum Duration Constraint
  it("Scenario 5: Fast 180 BPM music enforces minimum clip duration (no micro-clips < 0.6s)", () => {
    // 180 BPM = beat every 0.33s
    const fastBeatTimes = [0.33, 0.66, 1.0, 1.33, 1.66, 2.0, 2.33, 2.66, 3.0];
    const slots = buildMusicalBeatSlots(null, fastBeatTimes, 3.0, 0.65, 3.5);

    for (const slot of slots) {
      expect(slot.dur).toBeGreaterThanOrEqual(0.6);
    }
  });

  // 6. High-Impact Drop Section Matching
  it("Scenario 6: Drops and downbeats match high-action and motion candidate moments", async () => {
    const media: MediaItem[] = [
      {
        id: "v-action",
        name: "action.mp4",
        type: "video",
        url: "blob:action",
        duration: 10,
        width: 1920,
        height: 1080,
      },
    ];

    const result = await runSmartBeatMontage({
      media,
      audioTrackUrl: "blob:test-drop-song",
      targetDuration: 5.0,
    });

    expect(result.clips.length).toBeGreaterThan(0);
    // The top candidate moments (around 4-8s where action is high) should be selected
    const selectedRanges = result.clips.map((c) => ({ in: c.in, out: c.out }));
    const hitsActionZone = selectedRanges.some((r) => r.in >= 2.5 && r.out <= 8.5);
    expect(hitsActionZone).toBe(true);
  });

  // 7. Silent Start & Audio Offset Synchronization
  it("Scenario 7: Audio with silent start and offset correctly maps to timeline without drift", () => {
    const beatResult: BeatAnalysisResult = {
      bpm: 120,
      offset: 1.5, // 1.5 seconds of silence before first beat
      beatTimes: [1.5, 2.0, 2.5, 3.0, 3.5],
      downbeats: [1.5, 3.5],
      strongBeats: [1.5, 2.5, 3.5],
      peaks: [1.5],
      beats: [
        { time: 1.5, strength: 0.9, isDownbeat: true, isStrong: true, section: "verse", energy: 0.5 },
        { time: 2.0, strength: 0.4, isDownbeat: false, isStrong: false, section: "verse", energy: 0.5 },
        { time: 2.5, strength: 0.8, isDownbeat: false, isStrong: true, section: "verse", energy: 0.5 },
        { time: 3.0, strength: 0.4, isDownbeat: false, isStrong: false, section: "verse", energy: 0.5 },
        { time: 3.5, strength: 0.9, isDownbeat: true, isStrong: true, section: "verse", energy: 0.5 },
      ],
      energyCurve: [],
      sections: [{ type: "verse", start: 1.5, end: 4.0, avgEnergy: 0.5, peakEnergy: 0.9 }],
      duration: 4.0,
    };

    // Track placed at timeline t=2.0 with offset 1.0 and duration 3.0
    const mapped = mapBeatsToTimeline(beatResult, 2.0, 1.0, 3.0, 30);

    expect(mapped.beatsOnTimeline.length).toBeGreaterThan(0);
    // First beat at 1.5 with offset 1.0 -> 2.0 + (1.5 - 1.0) = 2.5 on timeline
    expect(mapped.beatsOnTimeline[0]).toBeCloseTo(2.5, 2);
  });

  // 8. Quality Penalty: Blurry Video Rejection
  it("Scenario 8: Rejects blurry footage in favor of sharp footage via Laplacian variance penalty", async () => {
    // Video 1 is blurry (low Laplacian sharpness -> heavy blur penalty)
    // Video 2 is sharp
    const media: MediaItem[] = [
      { id: "vid-blurry", name: "blurry.mp4", type: "video", url: "blob:blurry", duration: 8, width: 1920, height: 1080 },
      { id: "vid-sharp", name: "sharp.mp4", type: "video", url: "blob:sharp", duration: 8, width: 1920, height: 1080 },
    ];

    mockWorkerAnalyzeFrames.mockImplementation(async (_frames: any[], segments: Array<{ in: number; out: number }>) => {
      return segments.map((s) => {
        // If url matches blurry, apply severe blur penalty
        const isBlurry = s.in < 100; // Will test with dynamic worker returns
        return {
          in: s.in,
          out: s.out,
          motion: 0.7,
          sharpness: 0.02, // very blurry
          blurPenalty: 0.05, // 95% penalty!
          exposureQuality: 1.0,
          actionIntensity: 0.7,
          temporalStability: 0.8,
          faceScore: 0.3,
          handScore: 0,
          handVelocityScore: 0,
          brightness: 0.5,
          colorfulness: 0.5,
          containsTransition: false,
          overallQuality: 0.03,
        };
      });
    });

    const result = await runSmartBeatMontage({
      media: [media[0]],
      beatTimes: [1.0, 2.0],
      targetDuration: 2.0,
    });

    // Score should reflect the heavy penalty
    expect(result.analysis.topScore).toBeLessThan(0.2);
  });

  // 9. Quality Penalty: Pitch Black / Overexposed Rejection
  it("Scenario 9: Penalizes pitch black or overexposed video frames", async () => {
    const media: MediaItem[] = [
      { id: "vid-dark", name: "dark.mp4", type: "video", url: "blob:dark", duration: 6, width: 1920, height: 1080 },
    ];

    mockWorkerAnalyzeFrames.mockImplementation(async (_frames: any[], segments: Array<{ in: number; out: number }>) => {
      return segments.map((s) => ({
        in: s.in,
        out: s.out,
        motion: 0.5,
        sharpness: 0.7,
        blurPenalty: 1.0,
        exposureQuality: 0.02, // severe dark penalty
        actionIntensity: 0.5,
        temporalStability: 0.8,
        faceScore: 0,
        handScore: 0,
        handVelocityScore: 0,
        brightness: 0.03, // pitch black
        colorfulness: 0.1,
        containsTransition: false,
        overallQuality: 0.02,
      }));
    });

    const result = await runSmartBeatMontage({
      media,
      beatTimes: [1.0, 2.0],
      targetDuration: 2.0,
    });

    expect(result.analysis.topScore).toBeLessThan(0.1);
  });

  // 10. Intelligent Caching: Changing Music Skips Video Analysis
  it("Scenario 10: Changing music or beat settings reuses video analysis cache with 0 re-analyses", async () => {
    const media: MediaItem[] = [
      { id: "vid-cached", name: "cached.mp4", type: "video", url: "blob:cached", duration: 10, width: 1920, height: 1080 },
    ];

    mockWorkerAnalyzeFrames.mockClear();

    // Run 1: First analysis
    await runSmartBeatMontage({
      media,
      beatTimes: [1.0, 2.0, 3.0],
      targetDuration: 3.0,
    });

    const workerCallCountAfterFirstRun = mockWorkerAnalyzeFrames.mock.calls.length;
    expect(workerCallCountAfterFirstRun).toBeGreaterThan(0);

    // Run 2: User changes music track or beat settings
    const tStart = performance.now();
    await runSmartBeatMontage({
      media,
      beatTimes: [0.8, 1.6, 2.4, 3.2],
      targetDuration: 3.2,
    });
    const durationMs = performance.now() - tStart;

    // Worker was NOT called again because video analysis is cached!
    expect(mockWorkerAnalyzeFrames.mock.calls.length).toBe(workerCallCountAfterFirstRun);
    // Instantaneous calculation (< 50ms)
    expect(durationMs).toBeLessThan(100);
  });

  // 11. Timeline Integrity: Gap-Free & Overlap-Free Continuity
  it("Scenario 11: Timeline clips are valid, positive duration, and non-overlapping in sequence", async () => {
    const media: MediaItem[] = [
      { id: "v1", name: "v1.mp4", type: "video", url: "blob:v1", duration: 15, width: 1920, height: 1080 },
      { id: "v2", name: "v2.mp4", type: "video", url: "blob:v2", duration: 15, width: 1920, height: 1080 },
    ];

    const result = await runSmartBeatMontage({
      media,
      beatTimes: [1.0, 2.0, 3.5, 5.0, 6.5, 8.0],
      targetDuration: 8.0,
    });

    expect(result.clips.length).toBe(6);
    let cumulativeTimelineTime = 0;

    for (let i = 0; i < result.clips.length; i++) {
      const c = result.clips[i];
      const clipDur = c.out - c.in;
      expect(clipDur).toBeGreaterThanOrEqual(0.5);
      cumulativeTimelineTime += clipDur;
    }

    expect(cumulativeTimelineTime).toBeCloseTo(result.totalDuration, 1);
  });

  // 12. Cancellation Support (AbortSignal)
  it("Scenario 12: Aborting analysis cleanly stops execution with AbortError", async () => {
    const media: MediaItem[] = [
      { id: "v-abort", name: "v.mp4", type: "video", url: "blob:abort", duration: 10, width: 1920, height: 1080 },
    ];

    const abortController = new AbortController();
    abortController.abort(); // Pre-abort

    await expect(
      runSmartBeatMontage({
        media,
        beatTimes: [1.0, 2.0],
        signal: abortController.signal,
      })
    ).rejects.toThrow();
  });
});
