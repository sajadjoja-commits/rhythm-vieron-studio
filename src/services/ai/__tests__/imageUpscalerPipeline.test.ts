import { describe, it, expect } from "vitest";
import { ImageUpscalerService } from "../ImageUpscalerService";
import { ImageUpscalerAdapter } from "../runtime/adapters/ImageUpscalerAdapter";

function makeImageData(pixels: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData !== "undefined") {
    return new ImageData(pixels, width, height);
  }
  return {
    data: pixels,
    width,
    height,
    colorSpace: "srgb",
  } as ImageData;
}

describe("Phase 10: Image Upscaler Pipeline & Super-Resolution Runtime", () => {
  it("initializes and verifies ImageUpscalerAdapter lifecycle", async () => {
    const adapter = new ImageUpscalerAdapter();
    expect(adapter.isLoaded()).toBe(false);

    await adapter.load();
    expect(adapter.isLoaded()).toBe(true);

    const mem = adapter.getMemoryUsage();
    expect(mem.heapMB).toBeGreaterThan(0);

    const caps = adapter.getCapabilities();
    expect(caps.precision).toBe("FP32");
    expect(caps.supportedInputTypes).toContain("ImageData");

    await adapter.unload();
    expect(adapter.isLoaded()).toBe(false);
  });

  it("executes real sub-pixel convolutional neural super-resolution inference (2x scale)", async () => {
    const adapter = new ImageUpscalerAdapter();
    await adapter.load();

    // Create a 16x16 input test pattern
    const inW = 16;
    const inH = 16;
    const pixels = new Uint8ClampedArray(inW * inH * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i * 7) % 255; // R
      pixels[i + 1] = (i * 13) % 255; // G
      pixels[i + 2] = (i * 29) % 255; // B
      pixels[i + 3] = 255; // A
    }

    const inputData = makeImageData(pixels, inW, inH);
    const result = await adapter.infer({
      imageData: inputData,
      scale: 2,
      sharpenStrength: 0.4,
      denoiseStrength: 0.1,
    });

    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    expect(result.scale).toBe(2);
    expect(result.imageData.data.length).toBe(32 * 32 * 4);
    expect(result.inferenceTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.outputPixels).toBe(1024);
  });

  it("handles responsive cancellation during upscaler inference", async () => {
    const adapter = new ImageUpscalerAdapter();
    await adapter.load();

    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    pixels.fill(200);
    const inputData = makeImageData(pixels, 8, 8);

    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.infer({
        imageData: inputData,
        scale: 2,
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelled/i);
  });

  it("executes complete 8-stage ImageUpscalerService with progress reporting", async () => {
    const service = ImageUpscalerService.getInstance();

    const pixels = new Uint8ClampedArray(10 * 10 * 4);
    pixels.fill(128);
    const inputData = makeImageData(pixels, 10, 10);

    const stagesReported: string[] = [];
    const result = await service.upscaleImage(inputData, {
      scale: 2,
      onProgress: (p) => {
        stagesReported.push(p.stage);
      },
    });

    expect(result.success).toBe(true);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    expect(result.originalWidth).toBe(10);
    expect(result.originalHeight).toBe(10);
    expect(result.scale).toBe(2);
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(stagesReported).toContain("preprocessing");
    expect(stagesReported).toContain("inference");
    expect(stagesReported).toContain("completed");
  });
});
