// Web Worker for Non-blocking Frame Analysis, Motion Scoring & Multi-Signal Beat Sync
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
}

self.onmessage = (e: MessageEvent) => {
  const { type, id, payload } = e.data || {};
  if (!id) return;

  try {
    if (type === "ANALYZE_FRAMES") {
      const { frames, segments } = payload as {
        frames: FrameBufferData[];
        segments: Array<{ in: number; out: number }>;
      };

      const analyzedFrames: WorkerFrameAnalysis[] = [];
      const pixelArrays: Uint8ClampedArray[] = [];

      // 1. Analyze individual frames (Luminance, Saturation, Skin heuristics)
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
        const step = 8; // Step by 8 bytes (2 pixels) for optimal balance of speed & accuracy

        for (let p = 0; p < data.length; p += step) {
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];

          // Perceived luminance
          brightnessSum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          // Saturation / colorfulness
          colorSum += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

          // Fast skin tone detection
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

        const skinCenter = skinRatio > 0.03
          ? { x: skinXSum / (skinPixels || 1), y: skinYSum / (skinPixels || 1) }
          : null;

        const faceScore = skinRatio > 0.16 ? Math.min(1, skinRatio * 3.5) : (skinRatio > 0.08 ? skinRatio * 2 : 0);
        const handScore = skinRatio > 0.03 && skinRatio <= 0.22 ? Math.min(1, skinRatio * 4) : 0;

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

      // 2. Compute motion deltas between consecutive frames
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
        const motion = Math.min(1, diffSum / (samples * 255) * 2.8);
        motionScores.push(motion);
      }

      // 3. Aggregate into target segments
      const segmentResults: WorkerSegmentResult[] = segments.map((seg, segIdx) => {
        // Find frames falling inside or nearest to this segment
        const matchingIndices: number[] = [];
        for (let i = 0; i < analyzedFrames.length; i++) {
          const t = analyzedFrames[i].time;
          if (t >= seg.in - 0.2 && t <= seg.out + 0.2) {
            matchingIndices.push(i);
          }
        }
        if (matchingIndices.length === 0) {
          // Nearest index fallback
          const nearestIdx = Math.min(segIdx, analyzedFrames.length - 1);
          matchingIndices.push(Math.max(0, nearestIdx));
        }

        let totalBrightness = 0;
        let totalColor = 0;
        let totalFace = 0;
        let totalHand = 0;
        let totalMotion = 0;
        let handMoveDist = 0;
        let prevPos: { x: number; y: number } | null = null;

        for (const idx of matchingIndices) {
          const af = analyzedFrames[idx];
          totalBrightness += af.brightness;
          totalColor += af.colorfulness;
          totalFace += af.faceScore;
          totalHand += af.handScore;
          totalMotion += motionScores[idx] ?? 0.5;

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
        const avgMotion = Math.min(1, totalMotion / count);
        const avgFace = Math.min(1, totalFace / count);
        const avgHand = Math.min(1, totalHand / count);
        const handVelocity = Math.min(1, (handMoveDist / Math.max(1, count - 1)) * 6);

        return {
          in: seg.in,
          out: seg.out,
          motion: avgMotion,
          faceScore: avgFace,
          handScore: avgHand,
          handVelocityScore: handVelocity,
          brightness: totalBrightness / count,
          colorfulness: totalColor / count,
        };
      });

      self.postMessage({
        type: "ANALYZE_FRAMES_SUCCESS",
        id,
        results: segmentResults,
      });
    } else {
      self.postMessage({ type: "ERROR", id, error: `Unknown worker action: ${type}` });
    }
  } catch (err: any) {
    self.postMessage({
      type: "ERROR",
      id,
      error: err?.message || String(err),
    });
  }
};
