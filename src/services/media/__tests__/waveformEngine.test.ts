import { describe, it, expect, beforeEach, vi } from "vitest";
import { WaveformService } from "../WaveformService";
import { MediaService } from "../MediaService";

describe("Phase 9: Native Waveform Engine", () => {
  let waveformService: WaveformService;

  beforeEach(() => {
    waveformService = WaveformService.getInstance();
    waveformService.clearMemoryCache();
    vi.clearAllMocks();
  });

  describe("Deterministic Cache Key Generation", () => {
    it("generates deterministic cache keys for waveform requests", () => {
      const key1 = waveformService.generateCacheKey("track1.mp3", 100);
      const key2 = waveformService.generateCacheKey("track1.mp3", 100);
      expect(key1).toBe(key2);
      expect(key1).toContain("100");
      expect(key1).toContain("wave_");
    });

    it("generates different keys for different sample counts", () => {
      const key1 = waveformService.generateCacheKey("track1.mp3", 100);
      const key2 = waveformService.generateCacheKey("track1.mp3", 500);
      expect(key1).not.toBe(key2);
    });
  });

  describe("Waveform Generation & Caching", () => {
    it("delegates to MediaService and stores peaks in memory cache", async () => {
      const mediaService = MediaService.getInstance();
      const mockResult = {
        success: true,
        peaks: [0.1, 0.4, 0.8, 0.95, 0.5, 0.2],
        duration: 45.2,
        sampleRate: 44100,
        channels: 2,
        fromCache: false,
      };

      vi.spyOn(mediaService, "generateWaveform").mockResolvedValue(mockResult);

      const res1 = await waveformService.getWaveform("audio_voice.wav", { samplesCount: 6 });
      expect(res1.success).toBe(true);
      expect(res1.peaks.length).toBe(6);
      expect(mediaService.generateWaveform).toHaveBeenCalledTimes(1);

      // Second request -> from in-memory cache
      const res2 = await waveformService.getWaveform("audio_voice.wav", { samplesCount: 6 });
      expect(res2.success).toBe(true);
      expect(res2.fromCache).toBe(true);
      expect(mediaService.generateWaveform).toHaveBeenCalledTimes(1);
    });

    it("normalizes peaks within [0.0 - 1.0]", async () => {
      const mediaService = MediaService.getInstance();
      const mockResult = {
        success: true,
        peaks: [0.0, 0.25, 0.5, 0.75, 1.0],
        duration: 12.0,
        sampleRate: 48000,
        channels: 2,
        fromCache: false,
      };

      vi.spyOn(mediaService, "generateWaveform").mockResolvedValue(mockResult);

      const res = await waveformService.getWaveform("sample.mp4");
      expect(res.peaks.every((p) => p >= 0.0 && p <= 1.0)).toBe(true);
    });
  });
});
