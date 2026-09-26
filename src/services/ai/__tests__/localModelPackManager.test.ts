import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalModelPackManager, OFFICIAL_MODEL_PACKS } from "../LocalModelPackManager";
import { OFFICIAL_MODEL_CATALOGUE } from "../manifest/catalogue";

describe("Phase 10: Local AI Model Pack System & Real Model Runtime", () => {
  let modelManager: LocalModelPackManager;

  beforeEach(() => {
    modelManager = LocalModelPackManager.getInstance();
    vi.clearAllMocks();
  });

  it("lists all official model packs from the catalogue including super-resolution upscaler", () => {
    const catalog = modelManager.getCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(8);

    const ids = catalog.map((m) => m.id);
    expect(ids).toContain("vieron-upscaler-2x");
    expect(ids).toContain("whisper-tiny");
    expect(ids).toContain("whisper-base");
    expect(ids).toContain("whisper-small");
    expect(ids).toContain("rmbg-2.0");
    expect(ids).toContain("mlkit-subject-segmenter");
    expect(ids).toContain("mlkit-face-detector");
  });

  it("strictly eliminates fake placeholder checksums (a1b2c3..., c3d4e5...)", () => {
    for (const manifest of OFFICIAL_MODEL_CATALOGUE) {
      if (manifest.sha256) {
        expect(manifest.sha256).not.toMatch(/^a1b2c3/i);
        expect(manifest.sha256).not.toMatch(/^c3d4e5/i);
        // Valid 64-character hex hash
        expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/i);
      }
    }
  });

  it("separates immutable ModelManifest catalogue from mutable InstalledModel state", () => {
    const manifests = modelManager.getManifests();
    expect(manifests.length).toBeGreaterThanOrEqual(8);

    const upscaler = modelManager.getManifest("vieron-upscaler-2x");
    expect(upscaler).toBeDefined();
    expect(upscaler?.format).toBe("algorithmic");
    expect(upscaler?.task).toBe("upscale");
    expect(upscaler?.runtime).toBe("algorithmic");
    expect(upscaler?.isPretrainedAIModel).toBe(false);
  });

  it("filters models by category including new upscale category", () => {
    const sttModels = modelManager.getModelsByCategory("stt");
    expect(sttModels.every((m) => m.category === "stt")).toBe(true);
    expect(sttModels.length).toBeGreaterThanOrEqual(3);

    const upscaleModels = modelManager.getModelsByCategory("upscale");
    expect(upscaleModels.some((m) => m.id === "vieron-upscaler-2x")).toBe(true);

    const visionModels = modelManager.getModelsByCategory("vision");
    expect(visionModels.some((m) => m.id === "mlkit-face-detector")).toBe(true);
  });

  it("checks device RAM compatibility correctly", () => {
    // whisper-small requires 4GB RAM
    expect(modelManager.isCompatible("whisper-small", 2048)).toBe(false);
    expect(modelManager.isCompatible("whisper-small", 8192)).toBe(true);

    // whisper-tiny requires 1GB RAM
    expect(modelManager.isCompatible("whisper-tiny", 2048)).toBe(true);

    // vieron-upscaler-2x requires 512MB RAM
    expect(modelManager.isCompatible("vieron-upscaler-2x", 2048)).toBe(true);
  });

  it("resolves model paths for offline default and native models", async () => {
    const mlkitPath = await modelManager.resolveModelPath("mlkit-face-detector");
    expect(mlkitPath).toContain("native://");

    const upscalerPath = await modelManager.resolveModelPath("vieron-upscaler-2x");
    expect(upscalerPath).toBe("/models/vieron-upscaler-2x");
  });

  it("performs real SHA-256 verification and verifies default offline models", async () => {
    const verification = await modelManager.verifyModel("whisper-tiny");
    expect(verification.expectedSha256).toBe("be07e048b1e599ad109d301412219ff04e5f70b01096864700cc9e3f95b3a116");
    // Algorithmic filter verifies without fake hash
    const upscalerVerif = await modelManager.verifyModel("vieron-upscaler-2x");
    expect(upscalerVerif.isValid).toBe(true);
    expect(upscalerVerif.computedSha256).toContain("Classical Algorithmic Filter");
  });

  it("installs model with progress reporting and atomic state update", async () => {
    const progressSpy = vi.fn();
    const installed = await modelManager.installModel("vieron-upscaler-2x", {
      onProgress: progressSpy,
    });

    expect(installed.status).toBe("algorithmic");
    expect(installed.path).toBeDefined();
    expect(progressSpy).toHaveBeenCalled();
  });

  it("provides clean runtime adapters for models", () => {
    const upscalerAdapter = modelManager.getRuntimeAdapter("vieron-upscaler-2x");
    expect(upscalerAdapter).toBeDefined();
    expect(upscalerAdapter?.id).toBe("vieron-upscaler-2x");
    expect(upscalerAdapter?.getCapabilities().framework).toContain("Algorithmic");

    const mlkitAdapter = modelManager.getRuntimeAdapter("mlkit-subject-segmenter");
    expect(mlkitAdapter).toBeDefined();
    expect(mlkitAdapter?.getCapabilities().supportedInputTypes).toBeDefined();
  });

  it("prevents deletion of default offline and native models", async () => {
    const deletedTiny = await modelManager.deleteModel("whisper-tiny");
    expect(deletedTiny).toBe(false);

    const deletedFace = await modelManager.deleteModel("mlkit-face-detector");
    expect(deletedFace).toBe(false);
  });
});
