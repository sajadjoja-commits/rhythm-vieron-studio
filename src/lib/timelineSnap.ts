import { triggerHapticTick } from "@/lib/haptics";

interface SnapOptions {
  thresholdPx?: number;
  pxPerSec: number;
  targets: number[]; // Candidate timestamps (playhead, other clip starts/ends)
}

/**
 * Snaps a target timeline timestamp (e.g. clip handle or playhead) to candidate timestamps.
 * Returns the snapped time and whether a snap occurred.
 */
let lastHapticSnapTime = 0;

export function snapTimelineTime(
  currentTime: number,
  { thresholdPx = 10, pxPerSec, targets }: SnapOptions
): { time: number; snapped: boolean; targetSnapped?: number } {
  const thresholdSec = thresholdPx / Math.max(1, pxPerSec);
  let bestTarget: number | null = null;
  let minDiff = thresholdSec;

  for (const t of targets) {
    const diff = Math.abs(currentTime - t);
    if (diff < minDiff) {
      minDiff = diff;
      bestTarget = t;
    }
  }

  if (bestTarget !== null) {
    const now = performance.now();
    if (now - lastHapticSnapTime > 120) {
      lastHapticSnapTime = now;
      triggerHapticTick("light");
      try {
        navigator.vibrate?.(12);
      } catch {}
    }
    return { time: bestTarget, snapped: true, targetSnapped: bestTarget };
  }

  return { time: currentTime, snapped: false };
}

interface PreviewSnapOptions {
  x: number;          // percent 0..100
  y: number;          // percent 0..100
  rotation?: number;   // degrees
  scale?: number;      // scale factor
  thresholdPercent?: number;
  thresholdDeg?: number;
}

interface PreviewSnapResult {
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  showSnapX: boolean; // guide line for horizontal center
  showSnapY: boolean; // guide line for vertical center
}

let lastPreviewHapticTime = 0;

/**
 * Snaps in-preview interactive items (captions, stickers, overlays) to center or alignment axes.
 */
export function snapPreviewTransform({
  x,
  y,
  rotation,
  scale,
  thresholdPercent = 2.5,
  thresholdDeg = 3.5,
}: PreviewSnapOptions): PreviewSnapResult {
  let snappedX = x;
  let snappedY = y;
  let snappedRot = rotation;
  let snappedScale = scale;
  let showSnapX = false;
  let showSnapY = false;
  let snappedAny = false;

  // Snap X center (50%)
  if (Math.abs(x - 50) < thresholdPercent) {
    snappedX = 50;
    showSnapX = true;
    snappedAny = true;
  }

  // Snap Y center (50%)
  if (Math.abs(y - 50) < thresholdPercent) {
    snappedY = 50;
    showSnapY = true;
    snappedAny = true;
  }

  // Snap Rotation to 0, 90, 180, 270, -90 deg
  if (rotation !== undefined) {
    const cardinalAngles = [0, 90, 180, 270, 360, -90, -180, -270];
    for (const angle of cardinalAngles) {
      if (Math.abs(rotation - angle) < thresholdDeg) {
        snappedRot = angle;
        snappedAny = true;
        break;
      }
    }
  }

  // Snap Scale to 1.0
  if (scale !== undefined && Math.abs(scale - 1.0) < 0.04) {
    snappedScale = 1.0;
    snappedAny = true;
  }

  if (snappedAny) {
    const now = performance.now();
    if (now - lastPreviewHapticTime > 120) {
      lastPreviewHapticTime = now;
      triggerHapticTick("light");
      try {
        navigator.vibrate?.(10);
      } catch {}
    }
  }

  return {
    x: snappedX,
    y: snappedY,
    rotation: snappedRot,
    scale: snappedScale,
    showSnapX,
    showSnapY,
  };
}
