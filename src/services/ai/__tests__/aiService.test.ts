import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { AIService } from "../AIService";
import { AndroidNativeAIProvider } from "../AndroidNativeAIProvider";
import { benchmarkRegistry } from "../benchmark";

const { mockVireonAI } = vi.hoisted(() => {
  return {
    mockVireonAI: {
      getAICapabilities: vi.fn().mockResolvedValue({
        nativeAI: true,
        arm64: true,
        nnapi: true,
        gpuAcceleration: true,
        xnnpack: true,
        availableMemoryMB: 3800,
        totalMemoryMB: 6000,
        performanceTier: "high",
        backends: ["mlkit_subject_segmentation", "whisper_cpp"],
      }),
      getAIModelStatus: vi.fn().mockImplementation(({ modelId }) =>
        Promise.resolve({
          status: modelId.includes("mlkit") ? "AVAILABLE" : "NOT_DOWNLOADED",
          available: modelId.includes("mlkit"),
        })
      ),
      removeBackground: vi.fn().mockImplementation(({ filePath }) => {
        if (filePath === "invalid_file") {
          throw new Error("Failed to decode input bitmap");
        }
        return Promise.resolve({
          success: true,
          outputUri: "content://com.vireon.ai.provider/cache/cutout_123.png",
          filePath: "/data/user/0/com.vireon.ai/cache/cutout_123.png",
          width: 1080,
          height: 1920,
          processingTime: 120,
          engine: "Google ML Kit Subject Segmentation",
        });
      }),
      detectFaces: vi.fn().mockResolvedValue({
        success: true,
        facesCount: 1,
        faces: [{ box: { x: 100, y: 100, width: 200, height: 200 }, confidence: 0.98 }],
        processingTime: 45,
        engine: "Google ML Kit Face Detection",
      }),
      cancelAI: vi.fn().mockResolvedValue({ cancelled: true }),
      getAIBenchmark: vi.fn().mockResolvedValue({ benchmarks: [], status: "NOT_MEASURED" }),
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
  registerPlugin: vi.fn(() => mockVireonAI),
}));

describe("Phase 7: Unified Native AI Engine & Performance Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  describe("1. AI Provider Selection & Capability Detection", () => {
    it("selects WebAIProvider when running in browser / Web environment", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("web");

      const service = AIService.getInstance();
      const caps = await service.getCapabilities(true);

      expect(caps.activeProvider).toBe("web-worker");
      expect(caps.nativeAI).toBe(false);
      expect(caps.backends).toContain("web_audio_dsp");
    });

    it("selects AndroidNativeAIProvider when running on Android native platform", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();
      const caps = await service.getCapabilities(true);

      expect(caps.activeProvider).toBe("android-native");
      expect(caps.nativeAI).toBe(true);
      expect(caps.arm64).toBe(true);
      expect(caps.nnapi).toBe(true);
      expect(caps.backends).toContain("mlkit_subject_segmentation");
    });
  });

  describe("2. Model Tiering & Storage Catalog", () => {
    it("contains properly tiered models (Essential, Optional, Experimental)", () => {
      const service = AIService.getInstance();
      const catalog = service.getModelCatalog();

      expect(catalog.length).toBeGreaterThanOrEqual(5);

      const essential = catalog.filter((m) => m.tier === "TIER_1_ESSENTIAL");
      const optional = catalog.filter((m) => m.tier === "TIER_2_OPTIONAL");
      const experimental = catalog.filter((m) => m.tier === "TIER_3_EXPERIMENTAL");

      expect(essential.length).toBeGreaterThan(0);
      expect(optional.length).toBeGreaterThan(0);
      expect(experimental.length).toBeGreaterThan(0);

      // Verify Google ML Kit is Tier 1 with 0 byte APK impact (Play Services dynamic delivery)
      const mlkit = catalog.find((m) => m.id === "mlkit-subject-segmenter");
      expect(mlkit).toBeDefined();
      expect(mlkit?.sizeBytes).toBe(0);
      expect(mlkit?.tier).toBe("TIER_1_ESSENTIAL");

      // Verify RMBG-2.0 is Tier 2 Optional with on-demand download URL
      const rmbg = catalog.find((m) => m.id === "rmbg-2.0");
      expect(rmbg).toBeDefined();
      expect(rmbg?.tier).toBe("TIER_2_OPTIONAL");
      expect(rmbg?.remoteUrls?.[0]).toContain("huggingface.co");
    });

    it("correctly reports model availability per platform", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();
      const mlkitStatus = await service.getModelStatus("mlkit-subject-segmenter");
      expect(mlkitStatus).toBe("AVAILABLE");
    });
  });

  describe("3. Zero-Copy Native Image Segmentation Pipeline", () => {
    it("passes native file paths directly without loading heavy blobs into RAM", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const nativeProvider = new AndroidNativeAIProvider();
      const result = await nativeProvider.removeBackground(
        "/data/user/0/com.vireon.ai/cache/camera_input.jpg"
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("/data/user/0/com.vireon.ai/cache/cutout_123.png");
      expect(result.outputUri).toBe("content://com.vireon.ai.provider/cache/cutout_123.png");
      expect(result.engine).toContain("Google ML Kit");
      expect(result.accelerator).toContain("NNAPI");
    });

    it("extracts nativePath from zero-RAM MediaPicker File object", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const mockFile: any = new File([new Blob([])], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(mockFile, "nativePath", {
        value: "/storage/emulated/0/DCIM/Camera/photo.jpg",
      });

      const nativeProvider = new AndroidNativeAIProvider();
      const result = await nativeProvider.removeBackground(mockFile);

      expect(result.success).toBe(true);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
    });
  });

  describe("4. Cancellation & AbortSignal Handling", () => {
    it("aborts operation immediately when AbortSignal is already aborted", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const controller = new AbortController();
      controller.abort();

      const service = AIService.getInstance();
      await expect(
        service.removeBackground("/data/test.png", { signal: controller.signal })
      ).rejects.toThrow("Operation was cancelled before execution");
    });
  });

  describe("5. Transparent Web Fallback on Native Failure", () => {
    it("falls back to WebAIProvider if native execution throws", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

      const service = AIService.getInstance();

      // Mock web fallback to return valid result
      vi.spyOn((service as any).webProvider, "removeBackground").mockResolvedValueOnce({
        success: true,
        imageDataUrl: "data:image/png;base64,fallback_cutout",
        width: 640,
        height: 480,
        processingTimeMs: 250,
        engine: "Google MediaPipe Vision (WASM / SIMD) [Fallback]",
      });

      // Pass "invalid_file" which causes native plugin mock to throw
      const result = await service.removeBackground("invalid_file");

      expect(result.success).toBe(true);
      expect(result.engine).toContain("MediaPipe");
    });
  });

  describe("6. Hardware Benchmark Registry & Honest Reporting", () => {
    it("marks unrun hardware paths as NOT_MEASURED without fabricating benchmark numbers", () => {
      const benchmarks = benchmarkRegistry.getAll();
      expect(benchmarks.length).toBeGreaterThan(0);

      const mlkitBench = benchmarkRegistry.get("backgroundRemoval-android-mlkit");
      expect(mlkitBench).toBeDefined();
      expect(mlkitBench?.status).toBe("NOT_MEASURED");
      expect(mlkitBench?.inferenceMs).toBe(0);

      const whisperBench = benchmarkRegistry.get("whisper-stt-android-native");
      expect(whisperBench).toBeDefined();
      expect(whisperBench?.status).toBe("NOT_MEASURED");
    });

    it("allows recording real hardware measurements with status MEASURED", () => {
      benchmarkRegistry.recordMeasurement("test-feature", {
        feature: "testFeature",
        runtime: "arm64-test",
        coldStartMs: 150,
        warmStartMs: 30,
        inferenceMs: 25,
        preprocessMs: 10,
        postprocessMs: 5,
        peakMemoryMB: 45,
        modelSizeMB: 10,
        runtimeSizeMB: 2,
      });

      const recorded = benchmarkRegistry.get("test-feature");
      expect(recorded).toBeDefined();
      expect(recorded?.status).toBe("MEASURED");
      expect(recorded?.inferenceMs).toBe(25);
    });
  });
});
