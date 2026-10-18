import { describe, it, expect } from 'vitest';

/**
 * Coordinate mapping function matching BackgroundRemovalResult implementation
 */
export function mapCanvasClickToNormalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): { normX: number; normY: number } {
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const normX = Math.max(0, Math.min(1, relX / rect.width));
  const normY = Math.max(0, Math.min(1, relY / rect.height));
  return { normX, normY };
}

/**
 * Normalized keypoint to native mask pixel index
 */
export function normalizedPointToMaskIndex(
  normX: number,
  normY: number,
  maskWidth: number,
  maskHeight: number
): { pixelX: number; pixelY: number; index: number } {
  const pixelX = Math.max(0, Math.min(maskWidth - 1, Math.floor(normX * maskWidth)));
  const pixelY = Math.max(0, Math.min(maskHeight - 1, Math.floor(normY * maskHeight)));
  const index = pixelY * maskWidth + pixelX;
  return { pixelX, pixelY, index };
}

describe('InteractiveSegmenter: Click to Normalized Keypoint and Mask Coordinates', () => {
  const viewportRect = { left: 100, top: 50, width: 800, height: 600 };
  const nativeW = 4032;
  const nativeH = 3024;

  it('correctly maps center click to 0.5, 0.5 normalized keypoint', () => {
    // Click at center: (100 + 400, 50 + 300) = (500, 350)
    const { normX, normY } = mapCanvasClickToNormalizedPoint(500, 350, viewportRect);
    expect(normX).toBeCloseTo(0.5, 4);
    expect(normY).toBeCloseTo(0.5, 4);

    const { pixelX, pixelY, index } = normalizedPointToMaskIndex(normX, normY, nativeW, nativeH);
    expect(pixelX).toBe(2016);
    expect(pixelY).toBe(1512);
    expect(index).toBe(1512 * nativeW + 2016);
  });

  it('correctly maps top-left corner click to 0.0, 0.0 and index 0', () => {
    const { normX, normY } = mapCanvasClickToNormalizedPoint(100, 50, viewportRect);
    expect(normX).toBe(0.0);
    expect(normY).toBe(0.0);

    const { pixelX, pixelY, index } = normalizedPointToMaskIndex(normX, normY, nativeW, nativeH);
    expect(pixelX).toBe(0);
    expect(pixelY).toBe(0);
    expect(index).toBe(0);
  });

  it('correctly maps bottom-right click to 1.0, 1.0 clamped to last mask index', () => {
    const { normX, normY } = mapCanvasClickToNormalizedPoint(900, 650, viewportRect);
    expect(normX).toBe(1.0);
    expect(normY).toBe(1.0);

    const { pixelX, pixelY, index } = normalizedPointToMaskIndex(normX, normY, nativeW, nativeH);
    expect(pixelX).toBe(nativeW - 1);
    expect(pixelY).toBe(nativeH - 1);
    expect(index).toBe(nativeW * nativeH - 1);
  });

  it('clamps clicks outside boundary cleanly', () => {
    const { normX, normY } = mapCanvasClickToNormalizedPoint(50, 0, viewportRect); // Outside left & top
    expect(normX).toBe(0.0);
    expect(normY).toBe(0.0);

    const outsideRight = mapCanvasClickToNormalizedPoint(1200, 900, viewportRect); // Outside right & bottom
    expect(outsideRight.normX).toBe(1.0);
    expect(outsideRight.normY).toBe(1.0);
  });
});
