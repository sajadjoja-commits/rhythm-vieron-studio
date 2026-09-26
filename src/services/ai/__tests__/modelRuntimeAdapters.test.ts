import { describe, it, expect } from "vitest";
import { MLKitAdapter } from "../runtime/adapters/MLKitAdapter";
import { WhisperCppAdapter } from "../runtime/adapters/WhisperCppAdapter";
import { ONNXRuntimeAdapter } from "../runtime/adapters/ONNXRuntimeAdapter";
import { ImageUpscalerAdapter } from "../runtime/adapters/ImageUpscalerAdapter";

describe("Phase 10: AI Model Runtime Adapters", () => {
  it("verifies MLKitAdapter contract and capabilities", async () => {
    const adapter = new MLKitAdapter();
    expect(adapter.isLoaded()).toBe(false);

    await adapter.load();
    expect(adapter.isLoaded()).toBe(true);

    const caps = adapter.getCapabilities();
    expect(caps.framework).toBeDefined();
    expect(caps.supportedInputTypes.length).toBeGreaterThan(0);

    const mem = adapter.getMemoryUsage();
    expect(mem.heapMB).toBeGreaterThan(0);

    await adapter.unload();
    expect(adapter.isLoaded()).toBe(false);
  });

  it("verifies WhisperCppAdapter contract and capabilities", async () => {
    const adapter = new WhisperCppAdapter();
    await adapter.load();
    expect(adapter.isLoaded()).toBe(true);

    const caps = adapter.getCapabilities();
    expect(caps.supportedInputTypes).toContain("audio/wav");

    const mem = adapter.getMemoryUsage();
    expect(mem.residentMB).toBeGreaterThan(0);

    await adapter.unload();
    expect(adapter.isLoaded()).toBe(false);
  });

  it("verifies ONNXRuntimeAdapter contract and capabilities", async () => {
    const adapter = new ONNXRuntimeAdapter("test-onnx", "Test ONNX");
    expect(adapter.id).toBe("test-onnx");

    const caps = adapter.getCapabilities();
    expect(caps.framework).toBe("ONNX Runtime");
    expect(caps.supportedInputTypes).toContain("Tensor");
  });

  it("verifies ImageUpscalerAdapter memory and telemetry", async () => {
    const adapter = new ImageUpscalerAdapter();
    await adapter.load();

    const mem = adapter.getMemoryUsage();
    expect(mem.heapMB).toBeGreaterThan(0);
    expect(mem.residentMB).toBe(22);

    const caps = adapter.getCapabilities();
    expect(caps.precision).toBe("FP32");
  });
});
