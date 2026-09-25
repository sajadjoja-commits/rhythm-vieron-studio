import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalModelPackManager, OFFICIAL_MODEL_PACKS } from "../LocalModelPackManager";

describe("Phase 9: Local AI Model Pack System", () => {
  let modelManager: LocalModelPackManager;

  beforeEach(() => {
    modelManager = LocalModelPackManager.getInstance();
    vi.clearAllMocks();
  });

  it("lists all official model packs from the catalogue", () => {
    const catalog = modelManager.getCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(7);

    const ids = catalog.map((m) => m.id);
    expect(ids).toContain("whisper-tiny");
    expect(ids).toContain("whisper-base");
    expect(ids).toContain("whisper-small");
    expect(ids).toContain("rmbg-2.0");
    expect(ids).toContain("mlkit-subject-segmenter");
    expect(ids).toContain("mlkit-face-detector");
  });

  it("filters models by category", () => {
    const sttModels = modelManager.getModelsByCategory("stt");
    expect(sttModels.every((m) => m.category === "stt")).toBe(true);
    expect(sttModels.length).toBeGreaterThanOrEqual(3);

    const visionModels = modelManager.getModelsByCategory("vision");
    expect(visionModels.some((m) => m.id === "mlkit-face-detector")).toBe(true);

    const segModels = modelManager.getModelsByCategory("segmentation");
    expect(segModels.some((m) => m.id === "rmbg-2.0")).toBe(true);
  });

  it("checks device RAM compatibility correctly", () => {
    // whisper-small requires 4GB RAM
    expect(modelManager.isCompatible("whisper-small", 2048)).toBe(false);
    expect(modelManager.isCompatible("whisper-small", 8192)).toBe(true);

    // whisper-tiny requires 1GB RAM
    expect(modelManager.isCompatible("whisper-tiny", 2048)).toBe(true);
  });

  it("resolves model paths for offline and native models", async () => {
    const mlkitPath = await modelManager.resolveModelPath("mlkit-face-detector");
    expect(mlkitPath).toContain("native://");

    const u2netPath = await modelManager.resolveModelPath("u2netp-nano");
    expect(u2netPath).toBe("/models/u2netp.onnx");
  });

  it("downloads model with streaming progress and updates status", async () => {
    const progressSpy = vi.fn();
    const model = await modelManager.downloadModel("rmbg-2.0", progressSpy);

    expect(model.status).toBe("downloaded");
    expect(model.storagePath).toBeDefined();
    expect(progressSpy).toHaveBeenCalledWith(100);
  });

  it("deletes a downloaded non-default model and reclaims storage", async () => {
    await modelManager.downloadModel("deepfilter-audio-denoise");
    const downloadedModel = modelManager.getModel("deepfilter-audio-denoise");
    expect(downloadedModel?.status).toBe("downloaded");

    const deleted = await modelManager.deleteModel("deepfilter-audio-denoise");
    expect(deleted).toBe(true);

    const after = modelManager.getModel("deepfilter-audio-denoise");
    expect(after?.status).toBe("missing");
    expect(after?.storagePath).toBeUndefined();
  });

  it("prevents deletion of default offline and native models", async () => {
    const deletedTiny = await modelManager.deleteModel("whisper-tiny");
    expect(deletedTiny).toBe(false);

    const deletedFace = await modelManager.deleteModel("mlkit-face-detector");
    expect(deletedFace).toBe(false);
  });
});
