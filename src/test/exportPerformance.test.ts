import { describe, it, expect, vi } from "vitest";
import {
  buildPreloadPlan,
  runWithConcurrency,
  cleanupPreloadedElements,
  collectRequiredAudioUrls,
  hasAudibleExportSources,
  calculateBufferRMS,
  computeNormalizedGain,
  computeSeekTolerance,
  getContainSize,
  getFilterCSSString,
} from "@/lib/export";
import { robustSeekVideo } from "@/lib/videoSeeking";

describe("Export Performance & Memory Helpers", () => {
  describe("buildPreloadPlan", () => {
    it("deduplicates multiple clips and overlays referencing the same media URL into a single item with all aliases", () => {
      const media = [
        { id: "media-1", url: "blob:video-1", type: "video" as const },
        { id: "media-2", url: "blob:image-1", type: "image" as const },
      ];
      const clips = [
        { id: "clip-a", mediaId: "media-1" },
        { id: "clip-b", mediaId: "media-1" }, // split clip from same media-1
        { id: "clip-c", mediaId: "media-2" },
      ];
      const overlays = [
        { id: "ov-1", url: "blob:video-1", type: "video" as const },
        { id: "ov-2", url: "blob:sticker-1", type: "image" as const },
      ];

      const plan = buildPreloadPlan(clips, media, overlays);

      // Should have 3 unique (url, type) entries:
      // 1. blob:video-1 (video) -> aliases: clip-a, clip-b, media-1, blob:video-1, ov-1
      // 2. blob:image-1 (image) -> aliases: clip-c, media-2, blob:image-1
      // 3. blob:sticker-1 (image) -> aliases: blob:sticker-1, ov-2
      expect(plan).toHaveLength(3);

      const video1Entry = plan.find((p) => p.url === "blob:video-1" && p.type === "video");
      expect(video1Entry).toBeDefined();
      expect(video1Entry!.aliases).toEqual(
        expect.arrayContaining(["clip-a", "clip-b", "media-1", "blob:video-1", "ov-1"])
      );
      expect(new Set(video1Entry!.aliases).size).toBe(video1Entry!.aliases.length);
    });
  });

  describe("runWithConcurrency", () => {
    it("limits concurrent executions to the specified concurrency limit", async () => {
      const items = [1, 2, 3, 4, 5, 6];
      let active = 0;
      let maxObservedActive = 0;

      await runWithConcurrency(items, 2, async () => {
        active++;
        maxObservedActive = Math.max(maxObservedActive, active);
        await new Promise((r) => setTimeout(r, 15));
        active--;
      });

      expect(maxObservedActive).toBeLessThanOrEqual(2);
      expect(active).toBe(0);
    });

    it("stops scheduling remaining items when isAborted returns true", async () => {
      const items = [1, 2, 3, 4, 5];
      const processed: number[] = [];
      let abort = false;

      await runWithConcurrency(
        items,
        1,
        async (item) => {
          processed.push(item);
          if (item === 2) abort = true;
        },
        () => abort
      );

      expect(processed).toEqual([1, 2]);
    });
  });

  describe("cleanupPreloadedElements", () => {
    it("pauses videos, strips src, calls load(), clears map, and removes hiddenContainer", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const vid = document.createElement("video");
      vid.src = "blob:test-video";
      const pauseSpy = vi.spyOn(vid, "pause").mockImplementation(() => {});
      const loadSpy = vi.spyOn(vid, "load").mockImplementation(() => {});
      container.appendChild(vid);

      const img = new Image();
      img.src = "blob:test-image";

      const map: Record<string, HTMLImageElement | HTMLVideoElement> = {
        "clip-1": vid,
        "media-1": vid, // shared reference
        "img-1": img,
      };

      cleanupPreloadedElements(container, map, [vid]);

      expect(pauseSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(vid.getAttribute("src")).toBeNull();
      expect(Object.keys(map)).toHaveLength(0);
      expect(container.parentNode).toBeNull();
    });
  });

  describe("collectRequiredAudioUrls & hasAudibleExportSources", () => {
    it("excludes muted clips, zero-volume clips without volume keyframes, and muted tracks", () => {
      const media = [
        { id: "m-audible", url: "blob:v-audible", type: "video" as const },
        { id: "m-muted", url: "blob:v-muted", type: "video" as const },
        { id: "m-kf", url: "blob:v-kf", type: "video" as const },
        { id: "m-img", url: "blob:img", type: "image" as const },
      ];

      const clips = [
        { mediaId: "m-audible", volume: 0.8, muteOriginalAudio: false, in: 0, out: 5 },
        { mediaId: "m-muted", volume: 1, muteOriginalAudio: true, in: 0, out: 5 },
        {
          mediaId: "m-kf",
          volume: 0,
          muteOriginalAudio: false,
          in: 0,
          out: 5,
          keyframes: [{ id: "kf1", time: 1, property: "volume" as const, value: 0.75, easing: "linear" as const }],
        },
        { mediaId: "m-img", volume: 1, in: 0, out: 5 },
      ];

      const overlays = [
        { url: "blob:ov-muted", type: "video" as const, muted: true, volume: 1, start: 0, end: 4 },
        { url: "blob:ov-zero", type: "video" as const, muted: false, volume: 0, start: 0, end: 4 },
        { url: "blob:ov-active", type: "video" as const, muted: false, volume: 0.5, start: 0, end: 4 },
      ];

      const audioTracks = [
        { url: "blob:track-muted", muted: true, volume: 1, duration: 5 },
        { url: "blob:track-active", muted: false, volume: 0.9, duration: 10 },
      ];

      const input = {
        clips,
        media,
        overlays,
        audioTracks,
        videoMuted: false,
        videoVolume: 1,
      };

      const urls = collectRequiredAudioUrls(input);

      expect(urls).toEqual([
        "blob:track-active",
        "blob:v-audible",
        "blob:v-kf",
        "blob:ov-active",
      ]);

      expect(hasAudibleExportSources(input)).toBe(true);
    });

    it("returns empty array when all clips and tracks are muted or silent", () => {
      const media = [{ id: "m1", url: "blob:v1", type: "video" as const }];
      const clips = [{ mediaId: "m1", volume: 0, muteOriginalAudio: false, in: 0, out: 5 }];

      const input = {
        clips,
        media,
        overlays: [],
        audioTracks: [],
        videoMuted: false,
        videoVolume: 1,
      };

      expect(collectRequiredAudioUrls(input)).toEqual([]);
      expect(hasAudibleExportSources(input)).toBe(false);
    });
  });

  describe("calculateBufferRMS & computeNormalizedGain", () => {
    it("detects silent vs non-silent AudioBuffer-like objects", () => {
      const silentChannel = new Float32Array(1000);
      const silentBuf = {
        numberOfChannels: 1,
        length: 1000,
        sampleRate: 44100,
        getChannelData: () => silentChannel,
      } as unknown as AudioBuffer;

      const silentRes = calculateBufferRMS(silentBuf);
      expect(silentRes.rmsDb).toBe(-60);
      expect(silentRes.peak).toBe(0);
      expect(computeNormalizedGain(silentRes.rmsDb)).toBe(1.0);

      const toneChannel = new Float32Array(1000).fill(0.25);
      const toneBuf = {
        numberOfChannels: 1,
        length: 1000,
        sampleRate: 44100,
        getChannelData: () => toneChannel,
      } as unknown as AudioBuffer;

      const toneRes = calculateBufferRMS(toneBuf);
      expect(toneRes.peak).toBeCloseTo(0.25, 4);
      expect(toneRes.rmsDb).toBeGreaterThan(-15);
    });
  });

  describe("computeSeekTolerance, getContainSize, getFilterCSSString", () => {
    it("computes half-frame seek tolerance for 24, 30, and 60 fps", () => {
      expect(computeSeekTolerance(60)).toBeCloseTo(0.5 / 60, 5);
      expect(computeSeekTolerance(30)).toBeCloseTo(0.5 / 30, 5);
      expect(computeSeekTolerance(24)).toBeCloseTo(0.5 / 24, 5);
    });

    it("computes aspect-ratio preserving contain dimensions", () => {
      const res = getContainSize(1920, 1080, 1080, 1920);
      expect(res.drawW).toBe(1080);
      expect(res.drawH).toBeCloseTo(607.5, 2);
    });

    it("computes CSS filter string only for active filters at current time", () => {
      const filters = [
        { id: "f1", type: "brightness", intensity: 0.5, start: 0, end: 5 },
        { id: "f2", type: "contrast", intensity: 0.8, start: 6, end: 10 },
      ] as any;
      expect(getFilterCSSString(filters, 2)).toContain("brightness(1.25)");
      expect(getFilterCSSString(filters, 2)).not.toContain("contrast");
      expect(getFilterCSSString(filters, 12)).toBe("");
    });
  });

  describe("robustSeekVideo", () => {
    it("returns immediately when video is already within fps-based tolerance", async () => {
      const fakeVideo = {
        duration: 10,
        currentTime: 1.005,
        readyState: 3,
        seeking: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLVideoElement;

      // At 60fps, tolerance = 0.5 / 60 = 0.00833s -> |1.005 - 1.0| = 0.005 <= 0.00833
      const ok = await robustSeekVideo(fakeVideo, 1.0, { fps: 60 });
      expect(ok).toBe(true);
      expect(fakeVideo.addEventListener).not.toHaveBeenCalled();
    });
  });
});
