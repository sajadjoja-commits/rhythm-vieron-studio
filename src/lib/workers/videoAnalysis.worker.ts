// Web Worker for Non-blocking Frame Quality Analysis, Sharpness, Exposure & Multi-Signal Rhythm Sync
export interface FrameBufferData {
  time: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface WorkerFrameAnalysis {
  time: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  blurPenalty: number;
  exposurePenalty: number;
  colorfulness: number;
  skinRatio: number;
  skinCenter: { x: number; y: number } | null;
  faceScore: number;
  handScore: number;
  isTransition: boolean;
}

export interface WorkerSegmentResult {
  in: number;
  out: number;
  motion: number;
  sharpness: number;
  blurPenalty: number;
  exposureQuality: number;
  actionIntensity: number;
  temporalStability: number;
  faceScore: number;
  handScore: number;
  handVelocityScore: number;
  brightness: number;
  colorfulness: number;
  containsTransition: boolean;
  overallQuality: number;
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
      const frameLuminances: Float32Array[] = [];
      const frameHistograms: Float32Array[] = [];

      // 1. Analyze individual frames (Sharpness, Exposure, Histograms, Skin)
      for (let fIdx = 0; fIdx < frames.length; fIdx++) {
        const f = frames[fIdx];
        const data = new Uint8ClampedArray(f.buffer);
        pixelArrays.push(data);

        const w = f.width;
        const h = f.height;
        const lum = new Float32Array(w * h);
        frameLuminances.push(lum);

        let brightnessSum = 0;
        let colorSum = 0;
        let skinPixels = 0;
        let skinXSum = 0;
        let skinYSum = 0;

        // 16-bin luminance histogram for transition detection
        const hist = new Float32Array(16);

        for (let p = 0, pix = 0; p < data.length; p += 4, pix++) {
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];

          // Perceived luminance
          const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          lum[pix] = l;
          brightnessSum += l;

          // Histogram binning
          const bin = Math.min(15, Math.floor(l * 16));
          hist[bin]++;

          // Saturation / colorfulness
          colorSum += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

          // Fast skin tone detection
          if (r > 60 && g > 35 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            skinPixels++;
            const x = (pix % w) / w;
            const y = Math.floor(pix / w) / h;
            skinXSum += x;
            skinYSum += y;
          }
        }

        const totalPixels = w * h || 1;
        // Normalize histogram
        for (let b = 0; b < 16; b++) {
          hist[b] /= totalPixels;
        }
        frameHistograms.push(hist);

        const brightness = brightnessSum / totalPixels;
        const colorfulness = colorSum / totalPixels;

        // Compute contrast (standard deviation of luminance)
        let lumDiffSqSum = 0;
        for (let pix = 0; pix < totalPixels; pix++) {
          const d = lum[pix] - brightness;
          lumDiffSqSum += d * d;
        }
        const contrast = Math.sqrt(lumDiffSqSum / totalPixels);

        // Compute Sharpness via 2D Discrete Laplacian Variance
        let lapSum = 0;
        let lapSqSum = 0;
        let lapCount = 0;

        for (let y = 1; y < h - 1; y += 2) {
          const row = y * w;
          for (let x = 1; x < w - 1; x += 2) {
            const center = lum[row + x];
            const up = lum[(y - 1) * w + x];
            const down = lum[(y + 1) * w + x];
            const left = lum[row + x - 1];
            const right = lum[row + x + 1];

            const lap = 4 * center - up - down - left - right;
            lapSum += lap;
            lapSqSum += lap * lap;
            lapCount++;
          }
        }

        const lapMean = lapSum / (lapCount || 1);
        const lapVariance = Math.max(0, (lapSqSum / (lapCount || 1)) - (lapMean * lapMean));
        // Normalized sharpness: 0 (blurry) to 1 (sharp edge detail)
        const sharpness = Math.min(1, lapVariance * 45);

        // Penalties:
        // Blurry frames get strong penalty
        const blurPenalty = sharpness < 0.08 ? Math.max(0.05, sharpness / 0.08) : 1.0;

        // Dark or blown-out frames get heavy penalty
        let exposurePenalty = 1.0;
        if (brightness < 0.08) {
          exposurePenalty = Math.max(0.01, brightness / 0.08); // pitch dark
        } else if (brightness > 0.90 && contrast < 0.1) {
          exposurePenalty = Math.max(0.05, (1 - brightness) / 0.1); // washed out
        }

        const skinRatio = skinPixels / totalPixels;
        const skinCenter = skinRatio > 0.03
          ? { x: skinXSum / (skinPixels || 1), y: skinYSum / (skinPixels || 1) }
          : null;

        const faceScore = skinRatio > 0.14 ? Math.min(1, skinRatio * 3.8) : (skinRatio > 0.06 ? skinRatio * 2.2 : 0);
        const handScore = skinRatio > 0.025 && skinRatio <= 0.20 ? Math.min(1, skinRatio * 4.2) : 0;

        // Detect if this frame is an abrupt scene transition compared to previous frame
        let isTransition = false;
        if (fIdx > 0) {
          const prevHist = frameHistograms[fIdx - 1];
          let histDiff = 0;
          for (let b = 0; b < 16; b++) {
            histDiff += Math.abs(hist[b] - prevHist[b]);
          }
          if (histDiff > 0.42) {
            isTransition = true;
          }
        }

        analyzedFrames.push({
          time: f.time,
          brightness,
          contrast,
          sharpness,
          blurPenalty,
          exposurePenalty,
          colorfulness,
          skinRatio,
          skinCenter,
          faceScore,
          handScore,
          isTransition,
        });
      }

      // 2. Compute motion deltas and action intensity
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
        const motion = Math.min(1, (diffSum / (samples * 255)) * 2.8);
        motionScores.push(motion);
      }

      // 3. Aggregate into target segments
      const segmentResults: WorkerSegmentResult[] = segments.map((seg, segIdx) => {
        const matchingIndices: number[] = [];
        for (let i = 0; i < analyzedFrames.length; i++) {
          const t = analyzedFrames[i].time;
          if (t >= seg.in - 0.15 && t <= seg.out + 0.15) {
            matchingIndices.push(i);
          }
        }
        if (matchingIndices.length === 0) {
          const nearestIdx = Math.min(segIdx, analyzedFrames.length - 1);
          matchingIndices.push(Math.max(0, nearestIdx));
        }

        let totalBrightness = 0;
        let totalColor = 0;
        let totalSharpness = 0;
        let minBlurPenalty = 1.0;
        let minExposurePenalty = 1.0;
        let totalFace = 0;
        let totalHand = 0;
        let totalMotion = 0;
        let handMoveDist = 0;
        let hasTransition = false;
        let prevPos: { x: number; y: number } | null = null;

        for (const idx of matchingIndices) {
          const af = analyzedFrames[idx];
          totalBrightness += af.brightness;
          totalColor += af.colorfulness;
          totalSharpness += af.sharpness;
          if (af.blurPenalty < minBlurPenalty) minBlurPenalty = af.blurPenalty;
          if (af.exposurePenalty < minExposurePenalty) minExposurePenalty = af.exposurePenalty;
          totalFace += af.faceScore;
          totalHand += af.handScore;
          totalMotion += motionScores[idx] ?? 0.5;
          if (af.isTransition) hasTransition = true;

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
        const avgSharpness = totalSharpness / count;
        const avgFace = Math.min(1, totalFace / count);
        const avgHand = Math.min(1, totalHand / count);
        const handVelocity = Math.min(1, (handMoveDist / Math.max(1, count - 1)) * 6);
        const exposureQuality = minExposurePenalty;

        // Action intensity: intentional dynamic motion
        const actionIntensity = Math.min(1, avgMotion * 0.7 + handVelocity * 0.3);

        // Temporal stability: stable camera tracking (penalize chaotic jumpy frames)
        const temporalStability = Math.max(0, 1 - Math.abs(avgMotion - 0.45) * 1.2);

        // Overall quality score
        const baseScore =
          avgSharpness * 0.35 +
          avgMotion * 0.25 +
          avgFace * 0.25 +
          (totalColor / count) * 0.15;

        // Combine with penalties
        const transitionPenalty = hasTransition ? 0.2 : 1.0;
        const overallQuality = baseScore * minBlurPenalty * minExposurePenalty * transitionPenalty;

        return {
          in: seg.in,
          out: seg.out,
          motion: avgMotion,
          sharpness: avgSharpness,
          blurPenalty: minBlurPenalty,
          exposureQuality,
          actionIntensity,
          temporalStability,
          faceScore: avgFace,
          handScore: avgHand,
          handVelocityScore: handVelocity,
          brightness: totalBrightness / count,
          colorfulness: totalColor / count,
          containsTransition: hasTransition,
          overallQuality: Number(overallQuality.toFixed(3)),
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
