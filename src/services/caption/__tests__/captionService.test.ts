import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaptionService } from "../CaptionService";
import { WebCaptionProvider } from "../WebCaptionProvider";
import { AndroidCaptionProvider } from "../AndroidCaptionProvider";

// Mock transcribeLocally from @/lib/localTranscribe
vi.mock("@/lib/localTranscribe", () => ({
  transcribeLocally: vi.fn().mockImplementation(async (source, options) => {
    if (options?.language === "error_trigger") {
      throw new Error("Transcribe mock failure");
    }
    options?.onProgress?.({
      phase: "transcribing",
      progress: 50,
      message: "Processing audio...",
    });
    return [
      {
        id: "cap-1",
        start: 0.5,
        end: 2.5,
        text: "مرحبا بكم في استوديو فيرون",
      },
    ];
  }),
}));

// Mock @capacitor/core
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
    isPluginAvailable: vi.fn(() => false),
  },
}));

describe("Caption Architecture Refactor (Phase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WebCaptionProvider", () => {
    it("should initialize with web platform and correct metadata", () => {
      const provider = new WebCaptionProvider();
      expect(provider.id).toBe("web-wasm-whisper");
      expect(provider.platform).toBe("web");
      expect(provider.isAvailable()).toBe(true);
    });

    it("should successfully transcribe audio and notify progress", async () => {
      const provider = new WebCaptionProvider();
      const progressEvents: any[] = [];

      const segments = await provider.transcribe("mock-audio-blob", {
        language: "ar",
        onProgress: (p) => progressEvents.push(p),
      });

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("مرحبا بكم في استوديو فيرون");
      expect(segments[0].start).toBe(0.5);
      expect(segments[0].end).toBe(2.5);
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0].phase).toBe("transcribing");
    });

    it("should accurately bubble up errors from the underlying transcriber", async () => {
      const provider = new WebCaptionProvider();
      await expect(
        provider.transcribe("mock-audio-blob", { language: "error_trigger" })
      ).rejects.toThrow("Transcribe mock failure");
    });
  });

  describe("AndroidCaptionProvider", () => {
    it("should initialize with android platform and correct metadata", () => {
      const provider = new AndroidCaptionProvider();
      expect(provider.id).toBe("android-native-stt");
      expect(provider.platform).toBe("android");
    });

    it("should correctly report that native STT is not available when no native plugin is installed", () => {
      const provider = new AndroidCaptionProvider();
      expect(provider.isNativeCapabilityAvailable()).toBe(false);
    });

    it("should fall back transparently to Web provider when native is not installed", async () => {
      const provider = new AndroidCaptionProvider();
      const segments = await provider.transcribe("mock-audio-source", { language: "ar" });
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("مرحبا بكم في استوديو فيرون");
    });
  });

  describe("CaptionService Orchestrator", () => {
    it("should provide a singleton instance", () => {
      const instance1 = CaptionService.getInstance();
      const instance2 = CaptionService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should resolve WebCaptionProvider when on web platform", () => {
      const service = CaptionService.getInstance();
      const provider = service.getProvider();
      expect(provider.platform).toBe("web");
      expect(provider.id).toBe("web-wasm-whisper");
    });

    it("should route transcribe calls to the resolved provider", async () => {
      const service = CaptionService.getInstance();
      const result = await service.transcribe("sample-source", { language: "ar" });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("مرحبا بكم في استوديو فيرون");
    });
  });
});
