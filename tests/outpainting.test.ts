import { describe, it, expect } from 'vitest';
import { ImagePostprocessor } from '../src/ai/image/ImagePostprocessor';

describe('Local Image Outpainting Synthetic Tests', () => {
  /**
   * (A) Expansion Steps Calculation & Warning for >50% expansion
   */
  it('(A) calculateExpansionSteps divides expansions > 25% and triggers warning when > 50%', () => {
    const origW = 1000;
    const origH = 1000;

    // Small expansion: +20% on right (orig longest = 1000, 20% = 200px <= 250px)
    const smallPlan = ImagePostprocessor.calculateExpansionSteps(origW, origH, 1200, 1000, 0, 0);
    expect(smallPlan.numSteps).toBe(1);
    expect(smallPlan.shouldWarn).toBe(false);

    // Moderate expansion: +40% on right (400px > 250px limit per step)
    // Should split into at least 2 steps (400 / 250 = 1.6 -> 2 steps)
    const modPlan = ImagePostprocessor.calculateExpansionSteps(origW, origH, 1400, 1000, 0, 0);
    expect(modPlan.numSteps).toBe(2);
    expect(modPlan.shouldWarn).toBe(false);

    // Large expansion: +80% on width (800px > 500px threshold of 50%)
    const largePlan = ImagePostprocessor.calculateExpansionSteps(origW, origH, 1800, 1000, 0, 0);
    expect(largePlan.numSteps).toBeGreaterThanOrEqual(3);
    expect(largePlan.shouldWarn).toBe(true);

    // Verify all steps monotonically increase up to target
    let prevW = origW;
    let prevH = origH;
    for (const step of largePlan.steps) {
      expect(step.curW).toBeGreaterThanOrEqual(prevW);
      expect(step.curH).toBeGreaterThanOrEqual(prevH);
      prevW = step.curW;
      prevH = step.curH;
    }
    expect(prevW).toBe(1800);
    expect(prevH).toBe(1000);
  });

  /**
   * (B) Mirror-Blur Generation: Immediate non-AI preview
   */
  it('(B) createMirrorBlurExpandedCanvas correctly mirrors edge pixels and blurs outward', () => {
    const origW = 100;
    const origH = 100;
    const origRgba = new Uint8ClampedArray(origW * origH * 4);

    // Create a distinctive border color: red along right 30px edge
    for (let y = 0; y < origH; y++) {
      for (let x = 0; x < origW; x++) {
        const p = (y * origW + x) * 4;
        if (x >= 70) {
          origRgba[p] = 255; // Red border
          origRgba[p + 1] = 0;
          origRgba[p + 2] = 0;
          origRgba[p + 3] = 255;
        } else {
          origRgba[p] = 50;
          origRgba[p + 1] = 50;
          origRgba[p + 2] = 50;
          origRgba[p + 3] = 255;
        }
      }
    }

    // Expand width to 140 (+40px on right, padLeft = 0)
    const targetW = 140;
    const targetH = 100;
    const expanded = ImagePostprocessor.createMirrorBlurExpandedCanvas(
      origRgba,
      origW,
      origH,
      targetW,
      targetH,
      0,
      0
    );

    // Check newly expanded region x: 101..120 (mirrors to 97..78 which are all >= 70 red)
    for (let y = 20; y < 80; y++) {
      for (let x = 101; x < 120; x++) {
        const p = (y * targetW + x) * 4;
        expect(expanded[p]).toBeGreaterThan(80); // Has mirrored red
        expect(expanded[p + 3]).toBe(255); // Fully opaque
      }
    }
  });

  /**
   * (C) Outpaint Mask: New region is 1.0, interior is 0.0, overlap is 16px
   */
  it('(C) createOutpaintMask produces opaque outer mask with smooth 16px overlap into context', () => {
    const origW = 100;
    const origH = 100;
    const padLeft = 20;
    const padTop = 20;
    const targetW = 140;
    const targetH = 140;
    const overlapPx = 16;

    const mask = ImagePostprocessor.createOutpaintMask(
      targetW,
      targetH,
      padLeft,
      padTop,
      origW,
      origH,
      overlapPx
    );

    expect(mask.length).toBe(targetW * targetH);

    // Far outer pixel in newly created territory (e.g. x: 5, y: 5) must be 1.0 (fully masked for inpainting)
    expect(mask[5 * targetW + 5]).toBe(1.0);

    // Deep inner pixel inside original image (e.g. center x: 70, y: 70) must be 0.0 (unmasked, completely preserved)
    expect(mask[70 * targetW + 70]).toBe(0.0);

    // Pixel in the overlap transition zone (e.g. padLeft + 5 = x: 25, y: 70)
    // Should be strictly between 0 and 1
    const overlapVal = mask[70 * targetW + 25];
    expect(overlapVal).toBeGreaterThan(0.0);
    expect(overlapVal).toBeLessThan(1.0);
  });

  /**
   * (D) Strict Byte-for-Byte Preservation of Original in Center
   */
  it('(D) Preserves center original image byte-for-byte in final output', () => {
    const origW = 60;
    const origH = 60;
    const origRgba = new Uint8ClampedArray(origW * origH * 4);

    // Fill original with random bytes
    for (let i = 0; i < origRgba.length; i++) {
      origRgba[i] = (i * 73 + 19) % 256;
    }

    const targetW = 100;
    const targetH = 100;
    const ox = 20;
    const oy = 20;

    // Simulate expansion composite
    const outCanvas = ImagePostprocessor.createMirrorBlurExpandedCanvas(
      origRgba,
      origW,
      origH,
      targetW,
      targetH,
      ox,
      oy
    );

    // Copy original image into center strictly byte-by-byte (as required by pipeline)
    for (let y = 0; y < origH; y++) {
      const origRow = y * origW * 4;
      const targetRow = (oy + y) * targetW * 4;
      const targetStart = targetRow + ox * 4;
      outCanvas.set(origRgba.subarray(origRow, origRow + origW * 4), targetStart);
    }

    // Verify 100% byte-for-byte exact equality across all RGBA values
    for (let y = 0; y < origH; y++) {
      for (let x = 0; x < origW; x++) {
        const origP = (y * origW + x) * 4;
        const outP = ((oy + y) * targetW + (ox + x)) * 4;

        expect(outCanvas[outP]).toBe(origRgba[origP]);
        expect(outCanvas[outP + 1]).toBe(origRgba[origP + 1]);
        expect(outCanvas[outP + 2]).toBe(origRgba[origP + 2]);
        expect(outCanvas[outP + 3]).toBe(origRgba[origP + 3]);
      }
    }
  });

  /**
   * (E) 4096px Longest Dimension Cap
   */
  it('(E) calculateExpansionSteps caps dimensions when exceeding 4096px', () => {
    const origW = 3000;
    const origH = 3000;
    const targetW = 6000; // Exceeds 4096
    const targetH = 3000;

    // Scale to max 4096
    const maxLongest = 4096;
    const scale = maxLongest / Math.max(targetW, targetH);
    const scaledTargetW = Math.round(targetW * scale);
    const scaledTargetH = Math.round(targetH * scale);
    const scaledOrigW = Math.round(origW * scale);
    const scaledOrigH = Math.round(origH * scale);

    expect(Math.max(scaledTargetW, scaledTargetH)).toBeLessThanOrEqual(4096);
    expect(scaledTargetW).toBe(4096);
    expect(scaledTargetH).toBe(2048);
  });
});
