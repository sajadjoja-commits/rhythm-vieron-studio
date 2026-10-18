import { describe, it, expect } from 'vitest';
import { ImageInferenceEngine } from '../src/ai/image/ImageInferenceEngine';
import { ImagePostprocessor } from '../src/ai/image/ImagePostprocessor';

describe('Output Resolution & Scaling Constraints', () => {
  it('preserves exact 12MP resolution without downscaling (e.g. 4032 x 3024)', () => {
    const srcW = 4032;
    const srcH = 3024;
    const res = ImageInferenceEngine.calculateTargetResolution(srcW, srcH, 4096);

    expect(res.scaled).toBe(false);
    expect(res.w).toBe(4032);
    expect(res.h).toBe(3024);
  });

  it('preserves standard Full HD resolution without modification (1920 x 1080)', () => {
    const res = ImageInferenceEngine.calculateTargetResolution(1920, 1080, 4096);
    expect(res.scaled).toBe(false);
    expect(res.w).toBe(1920);
    expect(res.h).toBe(1080);
  });

  it('caps images exceeding 4096px at 4096 on the longest edge preserving aspect ratio', () => {
    // 6000 x 4000 image
    const res = ImageInferenceEngine.calculateTargetResolution(6000, 4000, 4096);
    expect(res.scaled).toBe(true);
    expect(res.w).toBe(4096);
    // 4000 * (4096 / 6000) = 2730.66 -> 2731
    expect(res.h).toBe(2731);
    expect(Math.max(res.w, res.h)).toBe(4096);
  });

  it('upscales model internal mask (320x320) to full target resolution', () => {
    const modelMask = new Float32Array(320 * 320).fill(0.8);
    const targetW = 4032;
    const targetH = 3024;

    const fullResMask = ImagePostprocessor.upscaleMaskBilinear(modelMask, 320, 320, targetW, targetH);
    expect(fullResMask.length).toBe(targetW * targetH);
    expect(fullResMask[0]).toBeCloseTo(0.8, 2);
    expect(fullResMask[targetW * targetH - 1]).toBeCloseTo(0.8, 2);
  });
});
