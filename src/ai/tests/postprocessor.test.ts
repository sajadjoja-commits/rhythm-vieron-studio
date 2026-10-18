import { describe, it, expect } from "vitest";
import { ImagePostprocessor } from "../image/ImagePostprocessor";

describe("ImagePostprocessor Verification Suite", () => {
  it("should combine AI Mask with user Add and Remove strokes correctly", () => {
    const postprocessor = ImagePostprocessor.getInstance();
    const width = 4;
    const height = 4;
    const total = width * height;

    // AI mask: half opaque
    const aiMask = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      aiMask[i] = i < total / 2 ? 1.0 : 0.0;
    }

    // User Add stroke: add bottom-right pixel (index 15)
    const userAdd = new Float32Array(total);
    userAdd[15] = 1.0;

    // User Remove stroke: erase top-left pixel (index 0)
    const userRemove = new Float32Array(total);
    userRemove[0] = 1.0;

    const combined = postprocessor.combineMasks(aiMask, userAdd, userRemove, width, height);

    // Pixel 0 was removed -> 0
    expect(combined[0]).toBe(0);
    // Pixel 1 was kept -> 1
    expect(combined[1]).toBe(1);
    // Pixel 15 was added -> 1
    expect(combined[15]).toBe(1);
  });

  it("should resample mask bilinearly to target dimensions", () => {
    const postprocessor = ImagePostprocessor.getInstance();
    const srcMask = new Float32Array([
      1.0, 0.0,
      0.0, 1.0
    ]);

    const resampled = postprocessor.resampleMask(srcMask, 2, 2, 4, 4);
    expect(resampled.length).toBe(16);
    expect(resampled[0]).toBe(1.0);
    expect(resampled[15]).toBe(1.0);
  });
});
