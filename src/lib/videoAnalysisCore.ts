// Shared pure frame-analysis math used by BOTH the Web Worker and the
// main-thread fallback, so results are identical either way.

export interface FrameBufferData {
  time: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface WorkerFrameAnalysis {
  time: number;
  brightness: number;
  colorfulness: number;
  skinRatio: number;
  skinCenter: { x: number; y: number } | null;
  faceScore: number;
  handScore: number;
}

export interface WorkerSegmentResult {
  in: number;
  out: number;
  motion: number;
  faceScore: number;
  handScore: number;
  handVelocityScore: number;
  brightness: number;
  colorfulness: number;
  sharpness: number;
}

export function analyzeFramesCore(
  frames: FrameBufferData[],
  segments: Array<{ in: number; out: number }>
): WorkerSegmentResult[] {
  const analyzedFrames: WorkerFrameAnalysis[] = [];
  const pixelArrays: Uint8ClampedArray[] = [];
  const sharpnessScores: number[] = [];

  for (let fIdx = 0; fIdx < frames.length; fIdx++) {
    const f = frames[fIdx];
    const data = new Uint8ClampedArray(f.buffer);
    pixelArrays.push(data);

    let brightnessSum = 0;
    let colorSum = 0;
    let skinPixels = 0;
    let skinXSum = 0;
    let skinYSum = 0;

    const totalPixels = f.width * f.height;
    const step = 8;

    for (let p = 0; p < data.length; p += step) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];

      brightnessSum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      colorSum += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

      if (r > 60 && g > 35 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
        skinPixels++;
        const pixelIdx = p / 4;
        skinXSum += (pixelIdx % f.width) / f.width;
        skinYSum += Math.floor(pixelIdx / f.width) / f.height;
      }
    }

    const sampledCount = data.length / step;
    const brightness = brightnessSum / sampledCount;
    const colorfulness = colorSum / sampledCount;
    const skinRatio = skinPixels / (totalPixels / 2);

    const skinCenter =
      skinRatio > 0.03 ? { x: skinXSum / (skinPixels || 1), y: skinYSum / (skinPixels || 1) } : null;

    const faceScore = skinRatio > 0.16 ? Math.min(1, skinRatio * 3.5) : skinRatio > 0.08 ? skinRatio * 2 : 0;
    const handScore = skinRatio > 0.03 && skinRatio <= 0.22 ? Math.min(1, skinRatio * 4) : 0;

    // Focus / sharpness estimate: mean absolute horizontal luminance gradient.
    // Blurry or out-of-focus frames score low and get filtered out of highlights.
    let gradSum = 0;
    let gradCount = 0;
    for (let y = 0; y < f.height; y += 2) {
      const rowStart = y * f.width * 4;
      for (let x = 0; x < f.width - 1; x += 2) {
        const i = rowStart + x * 4;
        const l1 = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const l2 = 0.299 * data[i + 8] + 0.587 * data[i + 9] + 0.114 * data[i + 10];
        gradSum += Math.abs(l2 - l1);
        gradCount++;
      }
    }
    sharpnessScores.push(gradCount > 0 ? Math.min(1, gradSum / gradCount / 24) : 0.5);

    analyzedFrames.push({
      time: f.time,
      brightness,
      colorfulness,
      skinRatio,
      skinCenter,
      faceScore,
      handScore,
    });
  }

  // Motion deltas between consecutive frames
  const motionScores: number[] = [];
  for (let i = 0; i < pixelArrays.length; i++) {
    if (i === 0 || pixelArrays.length < 2) {
      motionScores.push(0.5);
      continue;
    }
    const prev = pixelArrays[i - 1];
    const curr = pixelArrays[i];
    let diffSum = 0;
    const minLen = Math.min(prev.length, curr.length);
    const motionStep = 16;
    for (let p = 0; p < minLen; p += motionStep) {
      diffSum += Math.abs(curr[p] - prev[p]);
    }
    const samples = minLen / motionStep;
    motionScores.push(Math.min(1, (diffSum / (samples * 255)) * 2.8));
  }

  return segments.map((seg, segIdx) => {
    const matchingIndices: number[] = [];
    for (let i = 0; i < analyzedFrames.length; i++) {
      const t = analyzedFrames[i].time;
      if (t >= seg.in - 0.2 && t <= seg.out + 0.2) matchingIndices.push(i);
    }
    if (matchingIndices.length === 0) {
      const nearestIdx = Math.min(segIdx, analyzedFrames.length - 1);
      matchingIndices.push(Math.max(0, nearestIdx));
    }

    let totalBrightness = 0;
    let totalColor = 0;
    let totalFace = 0;
    let totalHand = 0;
    let totalMotion = 0;
    let totalSharp = 0;
    let handMoveDist = 0;
    let prevPos: { x: number; y: number } | null = null;

    for (const idx of matchingIndices) {
      const af = analyzedFrames[idx];
      if (!af) continue;
      totalBrightness += af.brightness;
      totalColor += af.colorfulness;
      totalFace += af.faceScore;
      totalHand += af.handScore;
      totalMotion += motionScores[idx] ?? 0.5;
      totalSharp += sharpnessScores[idx] ?? 0.5;

      if (af.skinCenter) {
        if (prevPos) {
          const dx = af.skinCenter.x - prevPos.x;
          const dy = af.skinCenter.y - prevPos.y;
          handMoveDist += Math.sqrt(dx * dx + dy * dy);
        }
        prevPos = af.skinCenter;
      }
    }

    const count = matchingIndices.length || 1;

    return {
      in: seg.in,
      out: seg.out,
      motion: Math.min(1, totalMotion / count),
      faceScore: Math.min(1, totalFace / count),
      handScore: Math.min(1, totalHand / count),
      handVelocityScore: Math.min(1, (handMoveDist / Math.max(1, count - 1)) * 6),
      brightness: totalBrightness / count,
      colorfulness: totalColor / count,
      sharpness: Math.min(1, totalSharp / count),
    };
  });
}
