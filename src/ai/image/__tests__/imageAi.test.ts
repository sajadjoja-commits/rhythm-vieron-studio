import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { ImageCapabilityDetector } from "../ImageCapabilityDetector";
import { ImageMemoryManager } from "../ImageMemoryManager";
import { ImagePreprocessor } from "../ImagePreprocessor";
import { ImagePostprocessor } from "../ImagePostprocessor";
import { ImageOutputVerifier } from "../ImageOutputVerifier";
import { ImageAIEngine } from "../ImageAIEngine";
import { ImageAIResult } from "../types";

// Polyfill ImageData for JSDOM test environment if missing
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: PredefinedColorSpace = "srgb";

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height || dataOrWidth.length / (4 * widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
      }
    }
  } as any;
}

// Polyfill URL.createObjectURL / revokeObjectURL for JSDOM
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => `blob:http://localhost/${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => {};
}

describe("Image AI Engine Core Tests", () => {
  beforeEach(() => {
    ImageMemoryManager.getInstance().purgeAll();
  });

  afterEach(() => {
    ImageMemoryManager.getInstance().purgeAll();
  });

  describe("ImageCapabilityDetector", () => {
    it("should detect hardware specs and assign a valid DeviceTier", async () => {
      const detector = ImageCapabilityDetector.getInstance();
      const profile = await detector.detect();

      expect(["LOW", "MEDIUM", "HIGH", "ULTRA"]).toContain(profile.deviceTier);
      expect(profile.estimatedRamMB).toBeGreaterThan(0);
      expect(profile.cpuCores).toBeGreaterThan(0);
      expect(profile.maxDimension).toBeGreaterThanOrEqual(1024);
      expect(profile.optimalTileSize).toBeGreaterThanOrEqual(128);
      expect(profile.supportedProviders.length).toBeGreaterThan(0);
      expect(["webgpu", "webgl", "wasm", "cpu"]).toContain(profile.preferredProvider);
    });

    it("should provide synchronous profile fallback", () => {
      const detector = ImageCapabilityDetector.getInstance();
      const syncProfile = detector.getProfileSync();

      expect(syncProfile).toBeDefined();
      expect(syncProfile.maxDimension).toBeGreaterThan(0);
    });
  });

  describe("ImageMemoryManager", () => {
    it("should handle scoped execution with automatic disposal", async () => {
      const mem = ImageMemoryManager.getInstance();

      let createdUrl = "";
      const result = await mem.withScope(async ({ createUrl, createCanvas }) => {
        const blob = new Blob(["fake-image-bytes"], { type: "image/png" });
        createdUrl = createUrl(blob);
        expect(createdUrl).toContain("blob:");

        const canvas = createCanvas(100, 100);
        expect(canvas.width).toBe(100);
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe("ImagePreprocessor", () => {
    it("should convert ImageData to normalized Float32 NCHW tensor", () => {
      const preprocessor = ImagePreprocessor.getInstance();
      const width = 16;
      const height = 16;
      const mockData = new Uint8ClampedArray(width * height * 4);

      // Fill with arbitrary test RGB values
      for (let i = 0; i < mockData.length; i += 4) {
        mockData[i] = 128; // R
        mockData[i + 1] = 64; // G
        mockData[i + 2] = 200; // B
        mockData[i + 3] = 255; // A
      }

      const imgData = new ImageData(mockData, width, height);
      const tensor = preprocessor.imageDataToNCHWTensor(
        imgData,
        width,
        height,
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
      );

      expect(tensor).toBeInstanceOf(Float32Array);
      expect(tensor.length).toBe(3 * width * height);

      // First channel (R)
      const expectedR = (128 / 255 - 0.485) / 0.229;
      expect(Math.abs(tensor[0] - expectedR)).toBeLessThan(0.01);
    });
  });

  describe("ImagePostprocessor", () => {
    it("should apply neural mask to create soft alpha channel", () => {
      const postprocessor = ImagePostprocessor.getInstance();
      const width = 8;
      const height = 8;
      const srcBytes = new Uint8ClampedArray(width * height * 4);
      srcBytes.fill(255);
      const srcImageData = new ImageData(srcBytes, width, height);

      // Half transparent mask
      const rawMask = new Float32Array(width * height);
      for (let i = 0; i < rawMask.length; i++) {
        rawMask[i] = i < rawMask.length / 2 ? 1.0 : 0.0;
      }

      const outImageData = postprocessor.applyMaskToImage(
        srcImageData,
        rawMask,
        width,
        height,
        { edgeRefinement: false, featherRadius: 0, threshold: 0.1 }
      );

      expect(outImageData.width).toBe(width);
      expect(outImageData.height).toBe(height);
      // First pixel should be opaque
      expect(outImageData.data[3]).toBe(255);
      // Last pixel should be transparent
      expect(outImageData.data[outImageData.data.length - 1]).toBe(0);
    });
  });

  describe("ImageOutputVerifier", () => {
    it("should reject corrupted or empty data URL", async () => {
      const verifier = ImageOutputVerifier.getInstance();
      const mockResult: ImageAIResult = {
        success: true,
        outputDataUrl: "",
        mimeType: "image/png",
        width: 100,
        height: 100,
        originalWidth: 100,
        originalHeight: 100,
        taskType: "remove-background",
        engineName: "Test",
        executionProvider: "wasm",
        executionTimeMs: 100,
        timings: { modelLoadMs: 0, preprocessMs: 0, inferenceMs: 0, postprocessMs: 0, totalMs: 100 },
        metrics: { deviceTier: "MEDIUM", isLocal: true, hasAlphaChannel: false },
      };

      const verification = await verifier.verify("remove-background", mockResult);
      expect(verification.passed).toBe(false);
      expect(verification.reason).toContain("empty or corrupted");
    });
  });

  describe("ImageAIEngine Coordinator", () => {
    it("should provide a singleton instance with core image tools", () => {
      const engine = ImageAIEngine.getInstance();
      expect(engine).toBeDefined();
      expect(typeof engine.removeBackground).toBe("function");
      expect(typeof engine.enhanceFace).toBe("function");
      expect(typeof engine.enhanceImage).toBe("function");
      expect(typeof engine.removeObject).toBe("function");
      expect(typeof engine.detectFaces).toBe("function");
      expect(typeof engine.getCapabilities).toBe("function");
    });
  });
});
