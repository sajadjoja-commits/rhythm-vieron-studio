/**
 * Exact Letterbox & Touch-Coordinate Mapping Utilities
 * Ensures mathematically accurate brush and mask coordinates across all device aspect ratios.
 */

export interface LetterboxRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Computes the exact letterboxed content rectangle of an aspect-ratio-preserved image
 * within a bounding container (equivalent to CSS object-contain).
 */
export function computeLetterboxRect(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number
): LetterboxRect {
  if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: 0, height: 0, left: 0, top: 0 };
  }

  const containerAspect = containerWidth / containerHeight;
  const imageAspect = naturalWidth / naturalHeight;

  let width: number;
  let height: number;
  let left: number;
  let top: number;

  if (imageAspect > containerAspect) {
    // Width-constrained: image fills container width, letterboxed vertically (top/bottom bars)
    width = containerWidth;
    height = containerWidth / imageAspect;
    left = 0;
    top = (containerHeight - height) / 2;
  } else {
    // Height-constrained: image fills container height, pillarboxed horizontally (left/right bars)
    height = containerHeight;
    width = containerHeight * imageAspect;
    top = 0;
    left = (containerWidth - width) / 2;
  }

  return { width, height, left, top };
}

/**
 * Maps a screen/pointer coordinate (clientX, clientY) accurately into the natural image coordinates
 * using the canvas bounding rectangle, avoiding any container-margin or letterbox offset.
 */
export function mapTouchToImageCoords(
  clientX: number,
  clientY: number,
  canvasBoundingRect: { left: number; top: number; width: number; height: number },
  naturalWidth: number,
  naturalHeight: number
): { x: number; y: number } {
  if (canvasBoundingRect.width <= 0 || canvasBoundingRect.height <= 0) {
    return { x: 0, y: 0 };
  }

  const scaleX = naturalWidth / canvasBoundingRect.width;
  const scaleY = naturalHeight / canvasBoundingRect.height;

  const rawX = (clientX - canvasBoundingRect.left) * scaleX;
  const rawY = (clientY - canvasBoundingRect.top) * scaleY;

  // Clamp within image boundary
  const x = Math.max(0, Math.min(naturalWidth, rawX));
  const y = Math.max(0, Math.min(naturalHeight, rawY));

  return { x, y };
}
