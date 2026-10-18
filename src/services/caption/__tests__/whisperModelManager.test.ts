import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { NativeWhisperModelManager, whisperModelManager } from "../WhisperModelManager";
import { AndroidCaptionProvider } from "../AndroidCaptionProvider";

const mockPlugin = {
  isAvailable: vi.fn(),
  getModels: vi.fn(),
  getModelInfo: vi.fn(),
  isModelAvailable: vi.fn(),
  releaseModel: vi.fn(),
  transcribe: vi.fn(),
  cancel: vi.fn(),
};

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    isPluginAvailable: vi.fn(() => true),
  },
  registerPlugin: vi.fn(() => mockPlugin),
}));

vi.mock("@/lib/localTranscribe", () => ({
  transcribeLocally: vi.fn().mockResolvedValue([
    {
      id: "fallback-seg",
      start: 0.0,
      end: 1.5,
      text: "النص البديل بنجاح",
    },
  ]),
}));

describe("Phase 4: WhisperModelManager & Model Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true);
  });

  describe("Model Discovery & Metadata (No Binary over JS Bridge)", () => {
    it("should return registered model catalog metadata without binary buffers", async () => {
      mockPlugin.getModels.mockResolvedValueOnce({
        defaultModelId: "whisper-tiny",
        models: [
          {
            id: "whisper-tiny",
            name: "Whisper Tiny (Multilingual)",
            fileName: "ggml-tiny.bin",
            format: "ggml",
            language: "multilingual",
            version: "1.0",
            isDefault: true,
            isAvailable: true,
            status: "ready",
            size: 77691713,
            storagePath: "/data/user/0/com.vireon.ai/files/models/whisper/ggml-tiny.bin",
          },
          {
            id: "whisper-base",
            name: "Whisper Base (Multilingual)",
            fileName: "ggml-base.bin",
            format: "ggml",
            language: "multilingual",
            version: "1.0",
            isDefault: false,
            isAvailable: false,
            status: "not_found",
            size: 0,
            storagePath: "",
          },
        ],
      });

      const models = await whisperModelManager.getModels();

      expect(mockPlugin.getModels).toHaveBeenCalledTimes(1);
      expect(models).toHaveLength(2);

      const tiny = models[0];
      expect(tiny.id).toBe("whisper-tiny");
      expect(tiny.fileName).toBe("ggml-tiny.bin");
      expect(tiny.status).toBe("ready");
      expect(tiny.size).toBe(77691713);

      // Verify NO binary properties exist
      expect((tiny as any).buffer).toBeUndefined();
      expect((tiny as any).data).toBeUndefined();
      expect((tiny as any).base64).toBeUndefined();
    });

    it("should query specific model metadata via getModelInfo", async () => {
      mockPlugin.getModelInfo.mockResolvedValueOnce({
        model: {
          id: "whisper-tiny",
          name: "Whisper Tiny (Multilingual)",
          fileName: "ggml-tiny.bin",
          format: "ggml",
          status: "ready",
          size: 77691713,
          isAvailable: true,
        },
      });

      const info = await whisperModelManager.getModelInfo("whisper-tiny");

      expect(mockPlugin.getModelInfo).toHaveBeenCalledWith({ modelId: "whisper-tiny" });
      expect(info).not.toBeNull();
      expect(info?.id).toBe("whisper-tiny");
      expect(info?.format).toBe("ggml");
      expect(info?.isAvailable).toBe(true);
    });

    it("should correctly check model readiness with isModelAvailable", async () => {
      mockPlugin.isModelAvailable.mockResolvedValueOnce({
        available: true,
        modelId: "whisper-tiny",
        status: "ready",
      });

      const isReady = await whisperModelManager.isModelAvailable("whisper-tiny");
      expect(isReady).toBe(true);

      mockPlugin.isModelAvailable.mockResolvedValueOnce({
        available: false,
        modelId: "whisper-base",
        status: "not_found",
      });

      const isBaseReady = await whisperModelManager.isModelAvailable("whisper-base");
      expect(isBaseReady).toBe(false);
    });
  });

  describe("Model Selection & Structured Error Handling", () => {
    it("should pass selected modelId to native transcribe", async () => {
      mockPlugin.transcribe.mockResolvedValueOnce({
        success: true,
        segments: [
          {
            start: 0.0,
            end: 1.8,
            text: "اختبار النموذج الأصلي",
            confidence: 0.99,
          },
        ],
      });

      const provider = new AndroidCaptionProvider();
      const segments = await provider.transcribe("/data/user/0/com.vireon.ai/cache/audio.mp4", {
        language: "ar",
        modelId: "whisper-tiny",
      });

      expect(mockPlugin.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({
          audioPath: "/data/user/0/com.vireon.ai/cache/audio.mp4",
          language: "ar",
          modelId: "whisper-tiny",
        })
      );
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toContain("اختبار النموذج الأصلي");
    });

    it("should handle NATIVE_MODEL_NOT_FOUND and fall back to Web Whisper", async () => {
      mockPlugin.transcribe.mockRejectedValueOnce({
        code: "NATIVE_MODEL_NOT_FOUND",
        message: "Whisper model 'whisper-small' was not found on device storage or assets.",
      });

      const provider = new AndroidCaptionProvider();
      const segments = await provider.transcribe("/data/user/0/com.vireon.ai/cache/audio.mp4", {
        language: "ar",
        modelId: "whisper-small",
      });

      // Valid fallback without throwing
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("النص البديل بنجاح");
    });

    it("should handle NATIVE_MODEL_INVALID (corrupt magic/empty) and fall back gracefully", async () => {
      mockPlugin.transcribe.mockRejectedValueOnce({
        code: "NATIVE_MODEL_INVALID",
        message: "Bad GGML magic: 0x00000000 in model file",
      });

      const provider = new AndroidCaptionProvider();
      const segments = await provider.transcribe("/data/user/0/com.vireon.ai/cache/audio.mp4", {
        language: "ar",
        modelId: "whisper-tiny",
      });

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("النص البديل بنجاح");
    });

    it("should handle NATIVE_MODEL_LOAD_FAILED and fall back gracefully", async () => {
      mockPlugin.transcribe.mockRejectedValueOnce({
        code: "NATIVE_MODEL_LOAD_FAILED",
        message: "Failed to initialize native whisper context",
      });

      const provider = new AndroidCaptionProvider();
      const segments = await provider.transcribe("/data/user/0/com.vireon.ai/cache/audio.mp4", {
        language: "ar",
      });

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("النص البديل بنجاح");
    });
  });

  describe("Memory & Context Reclaim", () => {
    it("should invoke releaseModel on plugin to reclaim native memory", async () => {
      mockPlugin.releaseModel.mockResolvedValueOnce({ released: true });

      const released = await whisperModelManager.releaseModel();
      expect(mockPlugin.releaseModel).toHaveBeenCalledTimes(1);
      expect(released).toBe(true);
    });
  });
});
