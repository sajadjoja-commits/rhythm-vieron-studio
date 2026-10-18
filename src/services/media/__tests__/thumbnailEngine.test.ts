import { describe, it, expect, beforeEach, vi } from "vitest";
import { ThumbnailService } from "../ThumbnailService";
import { MediaService } from "../MediaService";

describe("Phase 9: Native Thumbnail Engine & Smart Cache", () => {
  let thumbnailService: ThumbnailService;

  beforeEach(() => {
    thumbnailService = ThumbnailService.getInstance();
    thumbnailService.clearMemoryCache();
    vi.clearAllMocks();
  });

  describe("Deterministic Cache Key Generation", () => {
    it("generates deterministic keys for identical inputs", () => {
      const key1 = thumbnailService.generateCacheKey("video_123.mp4", 5.24, 320, 180);
      const key2 = thumbnailService.generateCacheKey("video_123.mp4", 5.21, 320, 180);
      // Both round to 5.2s
      expect(key1).toBe(key2);
      expect(key1).toContain("320x180");
      expect(key1).toContain("v1");
    });

    it("generates distinct keys for different timestamps", () => {
      const key1 = thumbnailService.generateCacheKey("video_123.mp4", 1.0, 320, 180);
      const key2 = thumbnailService.generateCacheKey("video_123.mp4", 8.0, 320, 180);
      expect(key1).not.toBe(key2);
    });

    it("generates distinct keys for different dimensions", () => {
      const key1 = thumbnailService.generateCacheKey("video_123.mp4", 2.0, 320, 180);
      const key2 = thumbnailService.generateCacheKey("video_123.mp4", 2.0, 640, 360);
      expect(key1).not.toBe(key2);
    });
  });

  describe("LRU Memory Cache & Delegation", () => {
    it("stores and retrieves thumbnails from in-memory cache", async () => {
      const mediaService = MediaService.getInstance();
      const mockResult = {
        success: true,
        filePath: "/cache/vieron_thumbnails/thumb_abc.jpg",
        webPath: "http://localhost/_capacitor_file_/cache/thumb_abc.jpg",
        width: 320,
        height: 180,
        timestampSeconds: 3.5,
        fromCache: false,
      };

      vi.spyOn(mediaService, "generateThumbnail").mockResolvedValue(mockResult);

      // First fetch -> invokes mediaService
      const res1 = await thumbnailService.getThumbnail("sample_video.mp4", {
        timestampSeconds: 3.5,
        width: 320,
        height: 180,
      });

      expect(res1.success).toBe(true);
      expect(res1.filePath).toBe(mockResult.filePath);
      expect(mediaService.generateThumbnail).toHaveBeenCalledTimes(1);

      // Second fetch -> serves from memory cache
      const res2 = await thumbnailService.getThumbnail("sample_video.mp4", {
        timestampSeconds: 3.5,
        width: 320,
        height: 180,
      });

      expect(res2.success).toBe(true);
      expect(res2.fromCache).toBe(true);
      // MediaService should not be called again
      expect(mediaService.generateThumbnail).toHaveBeenCalledTimes(1);
    });

    it("reports whether a thumbnail is currently cached in memory", async () => {
      expect(thumbnailService.hasCachedThumbnail("test_src.mp4", 1.0)).toBe(false);

      const mediaService = MediaService.getInstance();
      vi.spyOn(mediaService, "generateThumbnail").mockResolvedValue({
        success: true,
        filePath: "/path.jpg",
        webPath: "/path.jpg",
        width: 320,
        height: 180,
        timestampSeconds: 1.0,
        fromCache: false,
      });

      await thumbnailService.getThumbnail("test_src.mp4", { timestampSeconds: 1.0 });
      expect(thumbnailService.hasCachedThumbnail("test_src.mp4", 1.0)).toBe(true);
    });

    it("clears memory cache on demand", async () => {
      const mediaService = MediaService.getInstance();
      vi.spyOn(mediaService, "generateThumbnail").mockResolvedValue({
        success: true,
        filePath: "/path.jpg",
        webPath: "/path.jpg",
        width: 320,
        height: 180,
        timestampSeconds: 1.0,
        fromCache: false,
      });

      await thumbnailService.getThumbnail("test_src.mp4", { timestampSeconds: 1.0 });
      expect(thumbnailService.hasCachedThumbnail("test_src.mp4", 1.0)).toBe(true);

      thumbnailService.clearMemoryCache();
      expect(thumbnailService.hasCachedThumbnail("test_src.mp4", 1.0)).toBe(false);
    });
  });
});
