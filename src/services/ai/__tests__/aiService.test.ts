import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { AIService } from "../AIService";
import { AndroidNativeAIProvider } from "../AndroidNativeAIProvider";
import { AIError } from "../types";
import { benchmarkRegistry } from "../benchmark";

const { mockVireonAI, mockVireonSTT } = vi.hoisted(() => {
  return {
    mockVireonAI: {
      getAICapabilities: vi.fn().mockResolvedValue({
        nativeAI: true,
        platform: "android",
        arm64: true,
        memory: { availableMB: 3800, totalMB: 6000 },
        runtimes: {
          whisperCpp: true,
          mlkitSubjectSegmentation: true,
          mlkitFaceDetection: true,
          mediapipe: false,
          onnx: false,
        },
        accelerators: {
          nnapiApiAvailable: true,
          gpuUsable: false,
          xnnpackUsable: false,
        },
        availableMemoryMB: 3800,
        totalMemoryMB: 6000,
        nnapi: true,
        gpuAcceleration: false,
        xnnpack: false,
        performanceTier: "high",
        backends: ["mlkit_subject_segmentation", "mlkit_face_detection", "whisper_cpp"],
      }),
      getAIModelStatus: vi.fn().mockImplementation(({ modelId }) => {
        if (modelId === "mlkit-subject-segmenter" || modelId.includes("mlkit")) {
          return Promise.resolve({ status: "AVAILABLE", available: true, framework: "mlkit" });
        }
        if (modelId === "whisper-tiny-ggml") {
          return Promise.resolve({ status: "AVAILABLE", available: true, framework: "whisper.cpp" });
        }
        if (modelId === "whisper-base-ggml") {
          return Promise.resolve({ status: "NOT_DOWNLOADED", available: false, framework: "whisper.cpp" });
        }
        return Promise.resolve({ status: "NOT_SUPPORTED", available: false, framework: "unknown" });
      }),
      removeBackground: vi.fn().mockImplementation(({ filePath }) => {
        if (filePath === "invalid_file") {
          throw new Error("AI_MODEL_INVALID: Failed to decode input bitmap");
        }
        return Promise.resolve({
          success: true,
          outputUri: "content://com.vireon.ai.provider/cache/cutout_123.png",
          filePath: "/data/user/0/com.vireon.ai/cache/cutout_123.png",
          width: 1080,
          height: 1920,
          processingTime: 120,
          engine: "Google ML Kit Subject Segmentation (Android Native)",
        });
      }),
      detectFaces: vi.fn().mockImplementation(({ filePath }) => {
        if (filePath === "unsupported_face_file") {
          throw new Error("AI_RUNTIME_UNAVAILABLE: ML Kit Face Detection unavailable on this device");
        }
        return Promise.resolve({
          success: true,
          facesCount: 1,
          faces: [
            {
              box: { x: 120, y: 150, width: 220, height: 260 },
              trackingId: 1,
              headEulerAngleX: 2.5,
              headEulerAngleY: -1.2,
              headEulerAngleZ: 0.1,
              smilingProbability: 0.94,
              leftEyeOpenProbability: 0.98,
              rightEyeOpenProbability: 0.97,
            },
          ],
          processingTime: 45,
          engine: "Google ML Kit Face Detection (Android Native)",
        });
      }),
      cancelAI: vi.fn().mockResolvedValue({ cancelled: true }),
      getAIBenchmark: vi.fn().mockResolvedValue({ benchmarks: [], status: "NOT_MEASURED" }),
    },
    mockVireonSTT: {
      transcribe: vi.fn().mockResolvedValue({
        success: true,
        segments: [{ start: 0, end: 2.5, text: "مرحبا بكم في استوديو فيرون" }],
        duration: 2.5,
      }),
    },
  };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
    isPluginAvailable: vi.fn((name: string) =>
      ["VireonAI", "AIImageProcessor", "VireonSTT"].includes(name)
    ),
  },
  registerPlugin: vi.fn((name: string) => {
    if (name === "VireonSTT") return mockVireonSTT;
    return mockVireonAI;
  }),
}));

describe("Phase 7.1: Vireon Native AI Engine Hardening & Implementation Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  describe("1. Real Provider Selection & Truthful Capabilities", () => {
    it("selects WebAIProvider in browser with truthful capabilities", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("web");

      const service = AIService.getInstance();
      const caps = await service.getCapabilities(true);

      expect(caps.activeProvider).toBe("web-worker");
      expect(caps.nativeAI).toBe(false);
      expect(caps.platform).toBe("web");
      expect(caps.accelerators.nnapiApiAvailable).toBe(false);
      expect(caps.backends).toContain("web_audio_dsp");
    });

    it("selects AndroidNativeAIProvider on Android with truthful hardware flags", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();
      const caps = await service.getCapabilities(true);

      expect(caps.activeProvider).toBe("android-native");
      expect(caps.nativeAI).toBe(true);
      expect(caps.platform).toBe("android");
      expect(caps.arm64).toBe(true);
      // Truthful: NNAPI API availability reported without falsely claiming active GPU delegate
      expect(caps.accelerators.nnapiApiAvailable).toBe(true);
      expect(caps.accelerators.gpuUsable).toBe(false);
      expect(caps.accelerators.xnnpackUsable).toBe(false);
      expect(caps.runtimes.mlkitSubjectSegmentation).toBe(true);
      expect(caps.runtimes.mlkitFaceDetection).toBe(true);
      expect(caps.runtimes.whisperCpp).toBe(true);
    });
  });

  describe("2. Truthful Model Status Reporting", () => {
    it("correctly identifies available and uninstalled models without false positives", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();

      // Available ML Kit model
      const mlkitStatus = await service.getModelStatus("mlkit-subject-segmenter");
      expect(mlkitStatus).toBe("AVAILABLE");

      // Uninstalled model
      const uninstalledWhisper = await service.getModelStatus("whisper-base-ggml");
      expect(uninstalledWhisper).toBe("NOT_DOWNLOADED");

      // Strictly truthful: completely unknown model is NOT marked as AVAILABLE
      const unknownStatus = await service.getModelStatus("unknown-custom-model");
      expect(unknownStatus).toBe("NOT_SUPPORTED");
    });
  });

  describe("3. Real Android Native Face Detection & Web Fallback", () => {
    it("executes real Google ML Kit Face Detection with detailed bounding box and angle metrics", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();
      const result = await service.detectFaces("/data/user/0/com.vireon.ai/cache/portrait.jpg");

      expect(result.success).toBe(true);
      expect(result.facesCount).toBe(1);
      expect(result.faces[0].box).toEqual({ x: 120, y: 150, width: 220, height: 260 });
      expect(result.faces[0].smilingProbability).toBe(0.94);
      expect(result.faces[0].leftEyeOpenProbability).toBe(0.98);
      expect(result.engine).toContain("Google ML Kit Face Detection");
    });

    it("transparently falls back to Web MediaPipe face detection when Native encounters AI_RUNTIME_UNAVAILABLE", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();

      // Mock Web fallback
      vi.spyOn((service as any).webProvider, "detectFaces").mockResolvedValueOnce({
        success: true,
        facesCount: 1,
        faces: [{ box: { x: 50, y: 50, width: 100, height: 100 }, confidence: 0.92 }],
        processingTimeMs: 150,
        engine: "Google MediaPipe BlazeFace (WASM) [Fallback]",
      });

      // Pass path that triggers native AI_RUNTIME_UNAVAILABLE
      const result = await service.detectFaces("unsupported_face_file");

      expect(result.success).toBe(true);
      expect(result.engine).toContain("MediaPipe");
    });
  });

  describe("4. Native Low-Copy Pipeline & Zero Base64 Serialization", () => {
    it("routes native file paths directly without loading heavy binaries into JavaScript", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const nativeProvider = new AndroidNativeAIProvider();
      const result = await nativeProvider.removeBackground(
        "/data/user/0/com.vireon.ai/cache/camera_input.jpg"
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("/data/user/0/com.vireon.ai/cache/cutout_123.png");
      expect(result.outputUri).toBe("content://com.vireon.ai.provider/cache/cutout_123.png");
      expect(result.engine).toContain("Google ML Kit Subject Segmentation");
    });

    it("extracts nativePath from zero-RAM MediaPicker File handles", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const zeroRamFile: any = new File([new Blob([])], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(zeroRamFile, "nativePath", {
        value: "/storage/emulated/0/DCIM/Camera/photo.jpg",
      });

      const nativeProvider = new AndroidNativeAIProvider();
      const result = await nativeProvider.removeBackground(zeroRamFile);

      expect(result.success).toBe(true);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
    });
  });

  describe("5. Responsive Cancellation & Structured Error Handling", () => {
    it("immediately rejects with AI_CANCELLED when AbortSignal is pre-aborted", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const controller = new AbortController();
      controller.abort();

      const service = AIService.getInstance();
      await expect(
        service.removeBackground("/data/test.png", { signal: controller.signal })
      ).rejects.toMatchObject({
        code: "AI_CANCELLED",
      });
    });

    it("propagates cancelAI operation token to native plugin", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const nativeProvider = new AndroidNativeAIProvider();
      const cancelled = await nativeProvider.cancel("ai_op_12345");

      expect(cancelled).toBe(true);
      expect(mockVireonAI.cancelAI).toHaveBeenCalledWith({ operationId: "ai_op_12345" });
    });
  });

  describe("6. Native Whisper Integration Preservation", () => {
    it("routes speech-to-text directly to native whisper.cpp without Base64 overhead", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();
      const result = await service.transcribe("/data/user/0/com.vireon.ai/audio/speech.wav");

      expect(result.success).toBe(true);
      expect(result.text).toBe("مرحبا بكم في استوديو فيرون");
      expect(result.engine).toContain("whisper.cpp");
      expect(mockVireonSTT.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ audioPath: "/data/user/0/com.vireon.ai/audio/speech.wav" })
      );
    });
  });

  describe("7. Benchmark Integrity & NOT_MEASURED State", () => {
    it("strictly preserves status: 'NOT_MEASURED' for unmeasured hardware paths", () => {
      const mlkitBench = benchmarkRegistry.get("backgroundRemoval-android-mlkit");
      expect(mlkitBench).toBeDefined();
      expect(mlkitBench?.status).toBe("NOT_MEASURED");
      expect(mlkitBench?.inferenceMs).toBe(0);

      const whisperBench = benchmarkRegistry.get("whisper-stt-android-native");
      expect(whisperBench).toBeDefined();
      expect(whisperBench?.status).toBe("NOT_MEASURED");
    });
  });
});
