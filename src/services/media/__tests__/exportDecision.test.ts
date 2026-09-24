import { describe, it, expect, vi } from "vitest";
import { resolveExportPath } from "../exportDecision";
import { MediaService } from "../MediaService";
import { saveVideoToGallery, saveImageToGallery } from "@/services/NativeService";
import { Capacitor } from "@capacitor/core";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    isPluginAvailable: vi.fn(() => true),
    convertFileSrc: vi.fn((path: string) => `http://localhost/_capacitor_file_${path}`),
  },
  registerPlugin: vi.fn(() => ({
    saveVideoToGallery: vi.fn().mockResolvedValue({ success: true }),
    saveImageToGallery: vi.fn().mockResolvedValue({ success: true }),
    getMediaMetadata: vi.fn().mockResolvedValue({ success: true, width: 1920, height: 1080, duration: 10 }),
    prepareMediaInput: vi.fn(),
    exportMediaNatively: vi.fn().mockResolvedValue({ success: true, path: "/out.mp4" }),
    cancelMediaOperation: vi.fn().mockResolvedValue({ cancelled: true }),
    releaseMediaResource: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

describe("Phase 5.1: Export Decision Layer & Zero-Copy Pipeline", () => {
  const baseClip = {
    id: "clip-1",
    mediaId: "media-1",
    in: 2,
    out: 8,
    speed: 1,
    volume: 1,
    muted: false,
  };

  const baseMediaItem = {
    id: "media-1",
    name: "sample.mp4",
    type: "video" as const,
    url: "blob:http://localhost/mock-blob",
    duration: 10,
    width: 1920,
    height: 1080,
    nativePath: "/storage/emulated/0/DCIM/Camera/sample.mp4",
    nativeUri: "content://media/external/video/media/101",
  };

  describe("resolveExportPath Decision Matrix", () => {
    it("routes to WEB_RENDER_PATH when running in Web environment", () => {
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [baseMediaItem as any],
        isNativePlatform: false,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("Web");
    });

    it("routes to NATIVE_FAST_PATH for single video clip with trim on Android", () => {
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [baseMediaItem as any],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("NATIVE_FAST_PATH");
      expect(decision.nativeConfig).toBeDefined();
      expect(decision.nativeConfig?.inputUri).toBe("/storage/emulated/0/DCIM/Camera/sample.mp4");
      expect(decision.nativeConfig?.startTime).toBe(2);
      expect(decision.nativeConfig?.endTime).toBe(8);
    });

    it("routes to WEB_RENDER_PATH when timeline contains captions/subtitles", () => {
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [baseMediaItem as any],
        captions: [{ id: "c1", text: "Hello Vireon", start: 1, end: 3 }],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("captions");
    });

    it("routes to WEB_RENDER_PATH when timeline contains color filters", () => {
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [baseMediaItem as any],
        filters: [{ id: "f1", name: "vivid", intensity: 0.8 }],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("filters");
    });

    it("routes to WEB_RENDER_PATH when timeline contains VFX effects", () => {
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [baseMediaItem as any],
        vfx: [{ id: "v1", type: "glitch" }],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("VFX");
    });

    it("routes to WEB_RENDER_PATH when timeline contains overlays or stickers", () => {
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [baseMediaItem as any],
        overlays: [{ id: "o1", type: "sticker", content: "fire" }],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("overlays");
    });

    it("routes to WEB_RENDER_PATH when timeline contains multiple clips", () => {
      const clip2 = { ...baseClip, id: "clip-2", mediaId: "media-2" };
      const decision = resolveExportPath({
        clips: [baseClip as any, clip2 as any],
        media: [baseMediaItem as any],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("multiple clips");
    });

    it("routes to WEB_RENDER_PATH when clip has transitions", () => {
      const clipWithTransition = {
        ...baseClip,
        transitionIn: { type: "fade", duration: 0.5 },
      };
      const decision = resolveExportPath({
        clips: [clipWithTransition as any],
        media: [baseMediaItem as any],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("transition");
    });

    it("routes to WEB_RENDER_PATH when clip speed is changed", () => {
      const clipWithSpeed = { ...baseClip, speed: 2.0 };
      const decision = resolveExportPath({
        clips: [clipWithSpeed as any],
        media: [baseMediaItem as any],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("speed");
    });

    it("routes to WEB_RENDER_PATH when media item is an image", () => {
      const imageItem = { ...baseMediaItem, type: "image" as const };
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [imageItem as any],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("static image");
    });

    it("routes to WEB_RENDER_PATH when no native handle is present on media item", () => {
      const itemWithoutNative = {
        ...baseMediaItem,
        nativePath: undefined,
        nativeUri: undefined,
      };
      const decision = resolveExportPath({
        clips: [baseClip as any],
        media: [itemWithoutNative as any],
        isNativePlatform: true,
      });

      expect(decision.pathType).toBe("WEB_RENDER_PATH");
      expect(decision.reason).toContain("native file path");
    });
  });

  describe("MediaService Provider Resolution For Source", () => {
    it("routes native file paths to AndroidMediaProvider on Android", () => {
      const mediaService = MediaService.getInstance();
      const provider = mediaService.getProviderForSource("/data/user/0/com.vireon.ai/video.mp4");
      expect(provider.id).toBe("android-media-provider");
    });

    it("routes content:// URIs to AndroidMediaProvider on Android", () => {
      const mediaService = MediaService.getInstance();
      const provider = mediaService.getProviderForSource("content://media/external/video/media/123");
      expect(provider.id).toBe("android-media-provider");
    });

    it("routes pure in-memory Blobs to WebMediaProvider to avoid serialization", () => {
      const mediaService = MediaService.getInstance();
      const dummyBlob = new Blob(["dummy content"], { type: "video/mp4" });
      const provider = mediaService.getProviderForSource(dummyBlob);
      expect(provider.id).toBe("web-media-provider");
    });
  });

  describe("NativeService Zero-Base64 Direct Paths", () => {
    it("saveVideoToGallery directly executes native save when given a string path", async () => {
      const result = await saveVideoToGallery("/data/user/0/com.vireon.ai/exports/vireon_video.mp4");
      expect(result.success).toBe(true);
      expect(result.path).toBe("/data/user/0/com.vireon.ai/exports/vireon_video.mp4");
    });

    it("saveImageToGallery directly executes native save when given a string path", async () => {
      const result = await saveImageToGallery("/data/user/0/com.vireon.ai/exports/vireon_photo.png");
      expect(result.success).toBe(true);
      expect(result.path).toBe("/data/user/0/com.vireon.ai/exports/vireon_photo.png");
    });
  });
});
