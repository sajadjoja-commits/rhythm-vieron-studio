import { describe, it, expect } from 'vitest';
import { ImagePostprocessor } from '../src/ai/image/ImagePostprocessor';

describe('ImagePostprocessor: Guided Filter Edge Preservation', () => {
  it('preserves sharp edges from the guide image instead of leaving a blurry boundary', () => {
    const width = 20;
    const height = 10;
    const n = width * height;

    // Guide image: Sharp vertical boundary at x = 10
    // Left side: black (0.0), Right side: bright white (1.0)
    const guideLuma = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        guideLuma[y * width + x] = x >= 10 ? 1.0 : 0.0;
      }
    }

    // Coarse mask: Blurry transition across x = 8 to 12
    const coarseMask = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Linear smooth ramp from 0 to 1 between x=5 and x=15
        const ramp = (x - 5) / 10;
        coarseMask[y * width + x] = Math.max(0, Math.min(1, ramp));
      }
    }

    // Before filtering: at x=9 coarse is 0.4, at x=10 coarse is 0.5 (blurry transition)
    expect(coarseMask[0 * width + 9]).toBeCloseTo(0.4, 1);
    expect(coarseMask[0 * width + 10]).toBeCloseTo(0.5, 1);

    // Run Guided Filter with original sharp guide
    const filteredMask = ImagePostprocessor.guidedFilter(
      guideLuma,
      coarseMask,
      width,
      height,
      { radius: 2, eps: 1e-4 }
    );

    // After filtering: The sharp step of guideLuma at x=10 pulls the mask sharply towards 0.0 at x=9 and towards 1.0 at x=10!
    const valAtX8 = filteredMask[3 * width + 8];
    const valAtX9 = filteredMask[3 * width + 9];
    const valAtX10 = filteredMask[3 * width + 10];
    const valAtX11 = filteredMask[3 * width + 11];

    // Verify sharp transition:
    // Left side of edge is low
    expect(valAtX8).toBeLessThan(0.35);
    // Right side of edge is high
    expect(valAtX11).toBeGreaterThan(0.65);
    // The jump at the boundary (between x=9 and x=10) is significantly steeper than the input coarse slope
    const outputJump = valAtX10 - valAtX9;
    const inputJump = coarseMask[3 * width + 10] - coarseMask[3 * width + 9];
    expect(outputJump).toBeGreaterThan(inputJump);
  });

  it('correctly extracts luminance and performs bilinear upscaling', () => {
    // 2x2 mask
    const lowRes = new Float32Array([0.0, 1.0, 0.0, 1.0]);
    // Upscale to 4x4
    const upscaled = ImagePostprocessor.upscaleMaskBilinear(lowRes, 2, 2, 4, 4);
    expect(upscaled.length).toBe(16);
    expect(upscaled[0]).toBe(0.0);
    expect(upscaled[3]).toBe(1.0);
  });
});
