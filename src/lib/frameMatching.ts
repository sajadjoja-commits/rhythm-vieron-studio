// Pure helper for matching video segments to their nearest extracted frame by timestamp

export interface TimedFrameLike {
  time: number;
}

export interface TimeRangeLike {
  in: number;
  out: number;
}

/**
 * Returns the index of the frame whose timestamp is closest to `target`
 * (either a target timestamp in seconds or a segment `{ in, out }` using its midpoint).
 */
export function pickNearestFrameIndex(
  frames: ReadonlyArray<TimedFrameLike | number>,
  target: number | TimeRangeLike
): number {
  if (!frames || frames.length === 0) {
    return 0;
  }

  const targetTime =
    typeof target === "number" ? target : (target.in + target.out) / 2;

  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < frames.length; i++) {
    const item = frames[i];
    const frameTime = typeof item === "number" ? item : item.time;
    const dist = Math.abs(frameTime - targetTime);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}
