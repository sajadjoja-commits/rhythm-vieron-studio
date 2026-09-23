import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { MediaService } from "../MediaService";
import { WebMediaProvider } from "../WebMediaProvider";
import { AndroidMediaProvider } from "../AndroidMediaProvider";

const mockVireonMedia = {
  getMediaMetadata: vi.fn(),
  prepareMediaInput: vi.fn(),
  copyMediaToAppStorage: vi.fn(),
  exportMediaNatively: vi.fn(),
  cancelMediaOperation: vi.fn(),
  releaseMediaResource: vi.fn(),
  saveVideoToGallery: vi.fn(),
};

// Mock @capacitor/core
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
    isPluginAvailable: vi.fn(() => false),
    convertFileSrc: vi.fn((path: string) => `http://localhost/_capacitor_file_${path}`),
  },
  registerPlugin: vi.fn(() => mockVireonMedia),
}));

describe("Phase 5: High-Performance Media Pipeline Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Capacitor.isNativePlatform as any).mockReturnValue(false);
    (Capacitor.getPlatform as any).mockReturnValue("web");
    (Capacitor.isPluginAvailable as any).mockReturnValue(false);
  });

  describe("Provider Resolution & Web Fallback", () => {
    it("selects WebMediaProvider when running on Web platform", () => {
      const mediaService = MediaService.getInstance();
      const provider = mediaService.getProvider();
      expect(provider.id).toBe("web-media-provider");
      expect(provider.platform).toBe("web");
    });

    it("selects AndroidMediaProvider when running natively on Android with VireonMedia plugin", () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      const mediaService = MediaService.getInstance();
      const provider = mediaService.getProvider();
      expect(provider.id).toBe("android-media-provider");
      expect(provider.platform).toBe("android");
    });

    it("falls back to WebMediaProvider when running on Android but VireonMedia plugin is not available", () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(false);

      const mediaService = MediaService.getInstance();
      const provider = mediaService.getProvider();
      expect(provider.id).toBe("web-media-provider");
      expect(provider.platform).toBe("web");
    });
  });

  describe("Native Metadata Extraction (Without RAM Bloat)", () => {
    it("successfully extracts metadata via Native MediaMetadataRetriever on Android", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.getMediaMetadata.mockResolvedValueOnce({
        success: true,
        width: 3840,
        height: 2160,
        duration: 42.5,
        rotation: 90,
        mimeType: "video/mp4",
        fileSize: 104857600,
        bitrate: 20000000,
        hasAudio: true,
      });

      const provider = new AndroidMediaProvider();
      const meta = await provider.getMetadata("/data/user/0/com.vireon.ai/files/vireon_media/clip1.mp4");

      expect(mockVireonMedia.getMediaMetadata).toHaveBeenCalledWith({
        uri: "/data/user/0/com.vireon.ai/files/vireon_media/clip1.mp4",
      });
      expect(meta.width).toBe(3840);
      expect(meta.height).toBe(2160);
      expect(meta.duration).toBe(42.5);
      expect(meta.rotation).toBe(90);
      expect(meta.fileSize).toBe(104857600);
      expect(meta.hasAudio).toBe(true);
    });

    it("handles content:// URIs seamlessly without converting to binary", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.getMediaMetadata.mockResolvedValueOnce({
        success: true,
        width: 1920,
        height: 1080,
        duration: 15.0,
        rotation: 0,
        mimeType: "video/mp4",
        fileSize: 25000000,
        hasAudio: true,
      });

      const provider = new AndroidMediaProvider();
      const meta = await provider.getMetadata("content://media/external/video/media/12345");

      expect(mockVireonMedia.getMediaMetadata).toHaveBeenCalledWith({
        uri: "content://media/external/video/media/12345",
      });
      expect(meta.width).toBe(1920);
      expect(meta.duration).toBe(15.0);
    });

    it("handles file:// URIs and cleans path if needed", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.getMediaMetadata.mockResolvedValueOnce({
        success: true,
        width: 1280,
        height: 720,
        duration: 8.2,
        mimeType: "video/mp4",
        fileSize: 12000000,
      });

      const provider = new AndroidMediaProvider();
      await provider.getMetadata("file:///data/user/0/com.vireon.ai/files/video.mp4");

      expect(mockVireonMedia.getMediaMetadata).toHaveBeenCalledWith({
        uri: "file:///data/user/0/com.vireon.ai/files/video.mp4",
      });
    });

    it("transparently falls back to Web provider if native metadata call throws an error", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.getMediaMetadata.mockRejectedValueOnce(new Error("Native driver error"));

      const provider = new AndroidMediaProvider();
      // On Web fallback with dummy image blob
      const dummyBlob = new Blob(["fake data"], { type: "image/png" });
      
      // Spy on fallback
      const fallbackSpy = vi.spyOn((provider as any).fallbackWebProvider, "getMetadata").mockResolvedValueOnce({
        width: 800,
        height: 600,
        duration: 0,
        mimeType: "image/png",
        fileSize: 9,
      });

      const meta = await provider.getMetadata(dummyBlob);
      expect(fallbackSpy).toHaveBeenCalledWith(dummyBlob);
      expect(meta.width).toBe(800);
    });
  });

  describe("Media Preparation & Storage Resolution", () => {
    it("prepares content:// input into an app storage path via streaming", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.prepareMediaInput.mockResolvedValueOnce({
        success: true,
        path: "/data/user/0/com.vireon.ai/files/vireon_media/prepared_123.mp4",
        webPath: "http://localhost/_capacitor_file_/data/user/0/com.vireon.ai/files/vireon_media/prepared_123.mp4",
        name: "prepared_123.mp4",
        mimeType: "video/mp4",
        size: 54321000,
      });

      const provider = new AndroidMediaProvider();
      const prepared = await provider.prepareInput("content://media/external/video/media/999");

      expect(mockVireonMedia.prepareMediaInput).toHaveBeenCalledWith({
        uri: "content://media/external/video/media/999",
      });
      expect(prepared.path).toBe("/data/user/0/com.vireon.ai/files/vireon_media/prepared_123.mp4");
      expect(prepared.size).toBe(54321000);
    });

    it("prepares object with nativePath directly without copying", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.prepareMediaInput.mockResolvedValueOnce({
        success: true,
        path: "/data/user/0/com.vireon.ai/files/existing.mp4",
        webPath: "http://localhost/_capacitor_file_/data/user/0/com.vireon.ai/files/existing.mp4",
        name: "existing.mp4",
        mimeType: "video/mp4",
        size: 12345,
      });

      const provider = new AndroidMediaProvider();
      const mockFile = {
        name: "existing.mp4",
        nativePath: "/data/user/0/com.vireon.ai/files/existing.mp4",
      };

      const prepared = await provider.prepareInput(mockFile as any);
      expect(mockVireonMedia.prepareMediaInput).toHaveBeenCalledWith({
        uri: "/data/user/0/com.vireon.ai/files/existing.mp4",
      });
      expect(prepared.path).toBe("/data/user/0/com.vireon.ai/files/existing.mp4");
    });
  });

  describe("Native Export & MediaStore Pipeline", () => {
    it("calls exportMediaNatively on Android without transmitting video binary", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.exportMediaNatively.mockResolvedValueOnce({
        success: true,
        path: "/data/user/0/com.vireon.ai/cache/vireon_exports/final_render.mp4",
        uri: "file:///data/user/0/com.vireon.ai/cache/vireon_exports/final_render.mp4",
        size: 85000000,
        savedToGallery: true,
      });

      const provider = new AndroidMediaProvider();
      const progressUpdates: any[] = [];

      const result = await provider.exportMedia(
        {
          inputUri: "/data/user/0/com.vireon.ai/files/vireon_media/source.mp4",
          outputFileName: "final_render.mp4",
          startTime: 2.0,
          endTime: 12.5,
          saveToGallery: true,
        },
        (p) => progressUpdates.push(p)
      );

      expect(mockVireonMedia.exportMediaNatively).toHaveBeenCalledWith(
        expect.objectContaining({
          inputUri: "/data/user/0/com.vireon.ai/files/vireon_media/source.mp4",
          outputFileName: "final_render.mp4",
          startTime: 2.0,
          endTime: 12.5,
          saveToGallery: true,
        })
      );

      expect(result.success).toBe(true);
      expect(result.savedToGallery).toBe(true);
      expect(result.size).toBe(85000000);
      expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
    });

    it("supports native operation cancellation via AbortSignal", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.exportMediaNatively.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("CANCELLED")), 50);
        });
      });
      mockVireonMedia.cancelMediaOperation.mockResolvedValueOnce({ cancelled: true });

      const provider = new AndroidMediaProvider();
      const controller = new AbortController();

      const exportPromise = provider.exportMedia(
        {
          inputUri: "/data/user/0/com.vireon.ai/files/vireon_media/clip.mp4",
          operationId: "op_test_123",
        },
        undefined,
        controller.signal
      );

      // Trigger abort immediately
      controller.abort();

      await expect(exportPromise).rejects.toThrow();
      expect(mockVireonMedia.cancelMediaOperation).toHaveBeenCalledWith({
        operationId: "op_test_123",
      });
    });

    it("rejects immediately if signal was already aborted before start", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      const provider = new AndroidMediaProvider();
      const controller = new AbortController();
      controller.abort();

      await expect(
        provider.exportMedia(
          { inputUri: "/data/user/0/com.vireon.ai/files/clip.mp4" },
          undefined,
          controller.signal
        )
      ).rejects.toThrow("Export was cancelled before start");

      expect(mockVireonMedia.exportMediaNatively).not.toHaveBeenCalled();
    });
  });

  describe("Resource Cleanup", () => {
    it("releases native cached resource properly", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Capacitor.getPlatform as any).mockReturnValue("android");
      (Capacitor.isPluginAvailable as any).mockReturnValue(true);

      mockVireonMedia.releaseMediaResource.mockResolvedValueOnce({ success: true });

      const provider = new AndroidMediaProvider();
      const released = await provider.releaseResource("/data/user/0/com.vireon.ai/files/vireon_media/temp.mp4");

      expect(mockVireonMedia.releaseMediaResource).toHaveBeenCalledWith({
        path: "/data/user/0/com.vireon.ai/files/vireon_media/temp.mp4",
      });
      expect(released).toBe(true);
    });

    it("releases blob: URL on Web platform", async () => {
      const provider = new WebMediaProvider();
      const mockRevoke = vi.fn();
      if (!URL.revokeObjectURL) {
        (URL as any).revokeObjectURL = mockRevoke;
      } else {
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(mockRevoke);
      }

      const released = await provider.releaseResource("blob:http://localhost/12345");
      expect(mockRevoke).toHaveBeenCalledWith("blob:http://localhost/12345");
      expect(released).toBe(true);
    });
  });
});
