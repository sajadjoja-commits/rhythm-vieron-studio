import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProxyService } from "../ProxyService";
import { MediaService } from "../MediaService";
import { MediaItem } from "@/context/MediaContext";

describe("Phase 9: Proxy Video Editing Engine", () => {
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = ProxyService.getInstance();
    proxyService.clearRegistry();
    vi.clearAllMocks();
  });

  describe("Proxy Recommendation Logic", () => {
    it("recommends proxy for 4K UHD video (3840x2160)", () => {
      const rec = proxyService.shouldGenerateProxy({
        width: 3840,
        height: 2160,
        bitrate: 40_000_000,
      });
      expect(rec.recommended).toBe(true);
      expect(rec.targetHeight).toBe(540);
      expect(rec.reason).toContain("4K UHD");
    });

    it("recommends proxy for 1440p (QHD) video", () => {
      const rec = proxyService.shouldGenerateProxy({
        width: 2560,
        height: 1440,
        bitrate: 15_000_000,
      });
      expect(rec.recommended).toBe(true);
      expect(rec.targetHeight).toBe(540);
    });

    it("recommends proxy for ultra-high bitrate video (>25Mbps)", () => {
      const rec = proxyService.shouldGenerateProxy({
        width: 1920,
        height: 1080,
        bitrate: 30_000_000,
      });
      expect(rec.recommended).toBe(true);
      expect(rec.reason).toContain("> 25Mbps");
    });

    it("does NOT recommend proxy for standard 1080p moderate-bitrate video", () => {
      const rec = proxyService.shouldGenerateProxy({
        width: 1920,
        height: 1080,
        bitrate: 8_000_000,
      });
      expect(rec.recommended).toBe(false);
    });
  });

  describe("Proxy Generation & URL Switching", () => {
    it("generates proxy and registers preview URL for editing", async () => {
      const mediaService = MediaService.getInstance();
      const mockResult = {
        success: true,
        originalPath: "/storage/emulated/0/DCIM/Camera/4k_video.mp4",
        proxyPath: "/cache/projects/proj1/proxies/proxy_abc.mp4",
        proxyWebPath: "http://localhost/_capacitor_file_/cache/proxies/proxy_abc.mp4",
        height: 540,
        size: 15000000,
        fromCache: false,
      };

      vi.spyOn(mediaService, "generateProxy").mockResolvedValue(mockResult);

      const res = await proxyService.generateProxy("/storage/emulated/0/DCIM/Camera/4k_video.mp4", {
        targetHeight: 540,
        projectId: "proj1",
      });

      expect(res.success).toBe(true);
      expect(res.proxyPath).toBe(mockResult.proxyPath);

      const media: MediaItem = {
        id: "media_1",
        url: "blob:http://localhost/orig-blob",
        type: "video",
        name: "4k_video.mp4",
        size: 500000000,
        duration: 60,
        file: new File([], "4k_video.mp4"),
        nativePath: "/storage/emulated/0/DCIM/Camera/4k_video.mp4",
      };

      // Preview URL returns proxy web path for smooth editing
      const previewUrl = proxyService.getPreviewUrl(media, true);
      expect(previewUrl).toBe(mockResult.proxyWebPath);

      // Export source MUST return the original high-resolution native path
      const exportSource = proxyService.getExportSource(media);
      expect(exportSource).toBe("/storage/emulated/0/DCIM/Camera/4k_video.mp4");
      expect(exportSource).not.toBe(mockResult.proxyPath);
    });
  });
});
