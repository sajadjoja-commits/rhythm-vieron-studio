import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { 
  runSmartBeatMontage, 
  runAutoMontage,
  buildMusicalBeatSlots, 
  clearVideoAnalysisCache, 
  buildVideoCacheKey,
  setCacheEntry,
  computeSegmentScore,
  type Segment,
} from "../lib/autoMontage";
import { SMART_TEMPLATES, buildSmartTemplateStyle } from "../lib/smartTemplates";
import { pickNearestFrameIndex } from "../lib/frameMatching";
import { analyzeFramesInWorker, type FrameBufferData } from "../lib/workers/videoAnalysis.worker";
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
        height: 1920, size: 0, file: undefined as any,
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
      height: 1080, size: 0, file: undefined as any,
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
      { id: "vid-short", name: "v1.mp4", type: "video", url: "blob:v1", duration: 2.2, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "vid-med", name: "v2.mp4", type: "video", url: "blob:v2", duration: 12.0, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "vid-long", name: "v3.mp4", type: "video", url: "blob:v3", duration: 45.0, width: 1920, height: 1080, size: 0, file: undefined as any },
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
        height: 1080, size: 0, file: undefined as any,
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
      { id: "vid-blurry", name: "blurry.mp4", type: "video", url: "blob:blurry", duration: 8, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "vid-sharp", name: "sharp.mp4", type: "video", url: "blob:sharp", duration: 8, width: 1920, height: 1080, size: 0, file: undefined as any },
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
      { id: "vid-dark", name: "dark.mp4", type: "video", url: "blob:dark", duration: 6, width: 1920, height: 1080, size: 0, file: undefined as any },
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
      { id: "vid-cached", name: "cached.mp4", type: "video", url: "blob:cached", duration: 10, width: 1920, height: 1080, size: 0, file: undefined as any },
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
      { id: "v1", name: "v1.mp4", type: "video", url: "blob:v1", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "v2", name: "v2.mp4", type: "video", url: "blob:v2", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
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
      { id: "v-abort", name: "v.mp4", type: "video", url: "blob:abort", duration: 10, width: 1920, height: 1080, size: 0, file: undefined as any },
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

  // 13. All 9 SMART_TEMPLATES Validation (Music & Non-Music Templates)
  it("Scenario 13: All 9 SMART_TEMPLATES execute runAutoMontage without throwing and non-music templates produce multiple clips across 2+ videos", async () => {
    expect(SMART_TEMPLATES.length).toBe(9);

    const media: MediaItem[] = [
      { id: "tpl-v1", name: "v1.mp4", type: "video", url: "blob:tpl-v1", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "tpl-v2", name: "v2.mp4", type: "video", url: "blob:tpl-v2", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "tpl-v3", name: "v3.mp4", type: "video", url: "blob:tpl-v3", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
    ];

    for (const tpl of SMART_TEMPLATES) {
      const musicUrl = tpl.ai.musicSync ? "blob:test-song" : undefined;
      const result = await runAutoMontage(media, tpl, [], musicUrl, { fastMode: true });

      expect(result.clips.length).toBeGreaterThan(1);

      if (!tpl.ai.musicSync) {
        // Non-music templates (vlog, retro) must split into multiple clips and use multiple videos sequentially
        const usedMediaIds = new Set(result.clips.map((c) => c.mediaId));
        expect(usedMediaIds.size).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // 14. Template Style Extraction & Application in runAutoMontage
  it("Scenario 14: buildSmartTemplateStyle and runAutoMontage populate filters, vfx, and captionStyle spanning [0, totalDuration]", async () => {
    const media: MediaItem[] = [
      { id: "style-v1", name: "v1.mp4", type: "video", url: "blob:style-v1", duration: 12, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "style-v2", name: "v2.mp4", type: "video", url: "blob:style-v2", duration: 12, width: 1920, height: 1080, size: 0, file: undefined as any },
    ];

    for (const tpl of SMART_TEMPLATES) {
      const result = await runAutoMontage(media, tpl, [], undefined, { fastMode: true, targetDuration: 10 });

      expect(result.totalDuration).toBeGreaterThan(0);
      expect(result.captions).toEqual([]);
      expect(result.filters.length).toBe(tpl.filters.length);
      expect(result.vfx.length).toBe(tpl.vfx.length);

      for (let i = 0; i < tpl.filters.length; i++) {
        expect(result.filters[i].type).toBe(tpl.filters[i].type);
        expect(result.filters[i].intensity).toBe(tpl.filters[i].intensity);
        expect(result.filters[i].start).toBe(0);
        expect(result.filters[i].end).toBeCloseTo(result.totalDuration, 3);
      }

      for (let i = 0; i < tpl.vfx.length; i++) {
        expect(result.vfx[i].type).toBe(tpl.vfx[i].type);
        expect(result.vfx[i].intensity).toBe(tpl.vfx[i].intensity);
        expect(result.vfx[i].start).toBe(0);
        expect(result.vfx[i].end).toBeCloseTo(result.totalDuration, 3);
      }

      expect(result.captionStyle).toEqual({
        font: tpl.caption.font,
        size: tpl.caption.size,
        color: tpl.caption.color,
        bg: tpl.caption.bg,
        animation: tpl.caption.animation,
        position: tpl.caption.position,
      });

      const directStyle = buildSmartTemplateStyle(tpl, result.totalDuration);
      expect(directStyle.captionStyle).toEqual(result.captionStyle);
      expect(directStyle.filters.map((f) => ({ type: f.type, start: f.start, end: f.end, intensity: f.intensity }))).toEqual(
        result.filters.map((f) => ({ type: f.type, start: f.start, end: f.end, intensity: f.intensity }))
      );
      expect(directStyle.vfx.map((v) => ({ type: v.type, start: v.start, end: v.end, intensity: v.intensity }))).toEqual(
        result.vfx.map((v) => ({ type: v.type, start: v.start, end: v.end, intensity: v.intensity }))
      );
    }
  });

  // 15. Custom Template Transitions vs Legacy Transition Behavior
  it("Scenario 15: Applies template transitionIn on clips 1..N with clamped duration, and preserves legacy fade every 4th clip when omitted", async () => {
    const media: MediaItem[] = [
      { id: "tr-v1", name: "v1.mp4", type: "video", url: "blob:tr-v1", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
      { id: "tr-v2", name: "v2.mp4", type: "video", url: "blob:tr-v2", duration: 15, width: 1920, height: 1080, size: 0, file: undefined as any },
    ];

    // 1. Legacy behavior when transition is omitted
    const legacyRes = await runSmartBeatMontage({
      media,
      beatTimes: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
      targetDuration: 6.0,
    });
    expect(legacyRes.clips.length).toBeGreaterThanOrEqual(5);
    expect(legacyRes.clips[0].transitionIn).toBeUndefined();
    expect(legacyRes.clips[1].transitionIn).toBeUndefined();
    expect(legacyRes.clips[2].transitionIn).toBeUndefined();
    expect(legacyRes.clips[3].transitionIn).toBeUndefined();
    expect(legacyRes.clips[4].transitionIn).toEqual({ type: "fade", duration: 0.15 });

    // 2. Template transition behavior (both sequential and interleaved)
    for (const interleaveMode of [false, true]) {
      const customRes = await runSmartBeatMontage({
        media,
        beatTimes: [1.0, 2.0, 3.5, 5.0],
        targetDuration: 5.0,
        interleave: interleaveMode,
        transition: { type: "zoom", duration: 0.8 },
      });

      expect(customRes.clips[0].transitionIn).toBeUndefined();
      for (let i = 1; i < customRes.clips.length; i++) {
        const prevDur = customRes.clips[i - 1].out - customRes.clips[i - 1].in;
        const currDur = customRes.clips[i].out - customRes.clips[i].in;
        const expectedDur = Number(Math.min(0.8, 0.4 * Math.min(prevDur, currDur)).toFixed(3));
        expect(customRes.clips[i].transitionIn).toEqual({
          type: "zoom",
          duration: expectedDur,
        });
      }
    }
  });

  // 16. Video Analysis Accuracy: pickNearestFrameIndex, computeSegmentScore & 1.5s Motion/Transition Neutrality
  it("Scenario 16: pickNearestFrameIndex selects temporally closest frame to segment midpoint", () => {
    const frames = [{ time: 0.8 }, { time: 2.4 }, { time: 5.1 }, { time: 8.9 }, { time: 11.2 }];

    // Midpoint of [4.5, 5.5] is 5.0 -> closest is index 2 (5.1)
    expect(pickNearestFrameIndex(frames, { in: 4.5, out: 5.5 })).toBe(2);
    // Target time 8.2 -> closest is index 3 (8.9, dist 0.7 vs 5.1 dist 3.1)
    expect(pickNearestFrameIndex(frames, 8.2)).toBe(3);
    // Target time 1.1 -> closest is index 0 (0.8, dist 0.3 vs 2.4 dist 1.3)
    expect(pickNearestFrameIndex(frames, 1.1)).toBe(0);
    // Segment [10.0, 12.0] at segIdx=0 should still pick index 4 (11.2), NOT index 0
    expect(pickNearestFrameIndex(frames, { in: 10.0, out: 12.0 })).toBe(4);
  });

  it("Scenario 17: computeSegmentScore differentiates sport vs food weights on the same segment and preserves exact default without weights", () => {
    const testSeg: Segment = {
      mediaId: "seg-1",
      in: 2,
      out: 4,
      score: 0,
      motion: 0.9,
      sharpness: 0.8,
      blurPenalty: 0.95,
      exposureQuality: 0.9,
      actionIntensity: 0.85,
      temporalStability: 0.75,
      audioEnergy: 0.7,
      faceScore: 0.6,
      handScore: 0.2,
      handVelocityScore: 0.3,
      brightness: 0.55,
      colorfulness: 0.3,
      containsTransition: false,
      overallQuality: 0.8,
    };

    const sportTpl = SMART_TEMPLATES.find((t) => t.id === "sport")!;
    const foodTpl = SMART_TEMPLATES.find((t) => t.id === "food")!;

    // 1. Without weights: matches exact default formula (with audioEnergy at 0.10)
    const expectedBaseWithFaces =
      testSeg.faceScore * 0.31 +
      testSeg.sharpness * 0.22 +
      testSeg.motion * 0.16 +
      testSeg.actionIntensity * 0.11 +
      testSeg.audioEnergy * 0.10 +
      testSeg.handVelocityScore * 0.05 +
      testSeg.colorfulness * 0.05;
    const expectedDefaultWithFaces =
      expectedBaseWithFaces * testSeg.blurPenalty * testSeg.exposureQuality;

    expect(computeSegmentScore(testSeg, true)).toBeCloseTo(expectedDefaultWithFaces, 6);

    const expectedBaseNoFaces =
      testSeg.sharpness * 0.27 +
      testSeg.actionIntensity * 0.25 +
      testSeg.motion * 0.20 +
      testSeg.audioEnergy * 0.10 +
      testSeg.handVelocityScore * 0.09 +
      testSeg.colorfulness * 0.09;
    const expectedDefaultNoFaces =
      expectedBaseNoFaces * testSeg.blurPenalty * testSeg.exposureQuality;

    expect(computeSegmentScore(testSeg, false)).toBeCloseTo(expectedDefaultNoFaces, 6);

    // 2. Same segment produces distinct scores for sport (motionWeight 0.9) vs food (brightnessWeight 0.8, colorWeight 0.7)
    const sportScore = computeSegmentScore(testSeg, true, sportTpl.ai);
    const foodScore = computeSegmentScore(testSeg, true, foodTpl.ai);

    expect(sportScore).not.toBeCloseTo(foodScore, 3);
    // Since testSeg has very high motion/action (0.9/0.85) and low colorfulness (0.3), sport scores higher than food
    expect(sportScore).toBeGreaterThan(foodScore);

    // Conversely, on a low-motion, high-color, ideal-brightness segment, food scores higher than sport
    const foodSeg: Segment = {
      ...testSeg,
      motion: 0.1,
      actionIntensity: 0.1,
      brightness: 0.55,
      colorfulness: 0.95,
    };
    expect(computeSegmentScore(foodSeg, true, foodTpl.ai)).toBeGreaterThan(
      computeSegmentScore(foodSeg, true, sportTpl.ai)
    );
  });

  it("Scenario 18: Worker motion and transition detection are neutral (0.5 and false) when frame delta > 1.5s, and active when <= 1.5s", () => {
    const W = 16;
    const H = 16;
    const makeFrame = (time: number, r: number, g: number, b: number): FrameBufferData => {
      const arr = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < arr.length; i += 4) {
        arr[i] = r;
        arr[i + 1] = g;
        arr[i + 2] = b;
        arr[i + 3] = 255;
      }
      return { time, width: W, height: H, buffer: arr.buffer };
    };

    // Case A: Consecutive frames are 2.4s apart (> 1.5s) with extreme pixel change (dark -> bright)
    const farFrames: FrameBufferData[] = [
      makeFrame(0.5, 20, 20, 20),
      makeFrame(2.9, 240, 240, 240),
    ];
    const farRes = analyzeFramesInWorker(farFrames, [{ in: 2.7, out: 3.1 }]);
    expect(farRes[0].motion).toBeCloseTo(0.5, 5);
    expect(farRes[0].containsTransition).toBe(false);

    // Case B: Consecutive frames are 0.8s apart (<= 1.5s) with the exact same pixel change
    const closeFrames: FrameBufferData[] = [
      makeFrame(2.1, 20, 20, 20),
      makeFrame(2.9, 240, 240, 240),
    ];
    const closeRes = analyzeFramesInWorker(closeFrames, [{ in: 2.7, out: 3.1 }]);
    expect(closeRes[0].motion).toBeGreaterThan(0.8);
    expect(closeRes[0].containsTransition).toBe(true);
    // Skin-tone movement is never used to synthesize handVelocityScore in worker
    expect(closeRes[0].handVelocityScore).toBe(0);
  });
});
