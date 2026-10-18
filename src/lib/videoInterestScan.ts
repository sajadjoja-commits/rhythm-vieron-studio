import { WebCodecsVideoDecoder } from "@/ai/video/WebCodecsVideoDecoder";

export interface DecodedScanFrame {
  frame: {
    close?: () => void;
    rgbaData?: Uint8ClampedArray | Uint8Array;
    getRgba?: (width: number, height: number) => Uint8ClampedArray | Uint8Array;
    [key: string]: any;
  };
  timestampMicros: number;
  frameIndex: number;
  isKeyFrame?: boolean;
}

export interface InterestScanDecoderLike {
  prepare(
    videoInput: string | Blob | File | ArrayBuffer
  ): Promise<{
    width: number;
    height: number;
    durationSeconds: number;
    fps: number;
    totalFrames: number;
    codec?: string;
  }>;
  getNextFrame(): Promise<DecodedScanFrame | null>;
  close(): void;
}

export interface VideoInterestScanOptions {
  bucketSec?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  maxScanMs?: number;
  decoderFactory?: () => InterestScanDecoderLike;
}

export interface VideoInterestScanResult {
  times: number[];
  motion: number[];
  brightness: number[];
  sharpness: number[];
  cutScore: number[];
  cuts: number[];
  bucketSec: number;
  partial?: boolean;
  scanDurationMs?: number;
}

const SMALL_W = 64;
const SMALL_H = 36;
const SMALL_PIXELS = SMALL_W * SMALL_H;

const SHARP_W = 160;
const SHARP_H = 90;
const SHARP_PIXELS = SHARP_W * SHARP_H;

const CUT_SCORE_THRESHOLD = 0.45;
const MIN_CUT_SEPARATION_SEC = 0.4;

const NEUTRAL_MOTION = 0.25;
const NEUTRAL_BRIGHTNESS = 0.5;
const NEUTRAL_SHARPNESS = 0.5;
const NEUTRAL_CUT_SCORE = 0;

/**
 * Checks whether the current runtime supports either WebCodecs VideoDecoder
 * or HTMLVideoElement.requestVideoFrameCallback for fast interest scanning.
 */
export function canRunVideoInterestScan(customDecoderFactory?: () => InterestScanDecoderLike): boolean {
  if (customDecoderFactory) return true;
  if (WebCodecsVideoDecoder.isSupported()) return true;
  if (typeof document !== "undefined") {
    const proto = typeof HTMLVideoElement !== "undefined" ? HTMLVideoElement.prototype : null;
    if (proto && typeof (proto as any).requestVideoFrameCallback === "function") {
      return true;
    }
  }
  return false;
}

/**
 * Computes 2D Discrete Laplacian variance sharpness (0..1) on a 160x90 RGBA buffer.
 */
export function computeLaplacianSharpness(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number = SHARP_W,
  height: number = SHARP_H
): number {
  const totalPixels = width * height;
  if (totalPixels <= 0 || rgba.length < totalPixels * 4) return NEUTRAL_SHARPNESS;

  const luma = new Float32Array(totalPixels);
  for (let p = 0, pix = 0; pix < totalPixels; p += 4, pix++) {
    luma[pix] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
  }

  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;

  for (let y = 1; y < height - 1; y += 2) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 2) {
      const center = luma[row + x];
      const up = luma[(y - 1) * width + x];
      const down = luma[(y + 1) * width + x];
      const left = luma[row + x - 1];
      const right = luma[row + x + 1];

      const lap = 4 * center - up - down - left - right;
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }

  if (lapCount === 0) return NEUTRAL_SHARPNESS;
  const lapMean = lapSum / lapCount;
  const lapVariance = Math.max(0, lapSqSum / lapCount - lapMean * lapMean);
  return Math.min(1, Math.max(0, lapVariance * 45));
}

function createOffscreenCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  dispose: () => void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const dispose = () => {
    try {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    } catch {}
    canvas.width = 0;
    canvas.height = 0;
    try {
      canvas.remove();
    } catch {}
  };
  return { canvas, ctx, dispose };
}

function extractFrameRgba(
  source: any,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Uint8ClampedArray | Uint8Array | null {
  try {
    ctx.drawImage(source, 0, 0, width, height);
  } catch {
    // Source might be a synthetic test frame object
  }
  if (source && typeof source.getRgba === "function") {
    return source.getRgba(width, height);
  }
  if (source && source.rgbaData && source.rgbaData.length >= width * height * 4) {
    return source.rgbaData;
  }
  try {
    return ctx.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }
}

/**
 * Dense, low-cost whole-video interest scanner.
 * Produces per-bucket (default 0.4s) motion, brightness, sharpness, and cutScore curves plus scene cut timestamps.
 * Returns null if scanning is unsupported, aborted, or fails so the caller can fall back cleanly.
 */
export async function scanVideoInterest(
  source: string | Blob | File | ArrayBuffer,
  durationSec: number,
  options: VideoInterestScanOptions = {}
): Promise<VideoInterestScanResult | null> {
  const {
    bucketSec: rawBucketSec = 0.4,
    signal,
    onProgress,
    maxScanMs: customMaxScanMs,
    decoderFactory,
  } = options;

  try {
    if (signal?.aborted) return null;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

    const bucketSec = Math.max(0.1, rawBucketSec);
    const numBuckets = Math.max(1, Math.ceil(durationSec / bucketSec));
    const maxScanMs = customMaxScanMs ?? Math.max(8000, durationSec * 250);
    const scanStartMs = performance.now();

    const times = new Array<number>(numBuckets);
    for (let b = 0; b < numBuckets; b++) {
      times[b] = Number((b * bucketSec).toFixed(3));
    }

    const motionSum = new Float64Array(numBuckets);
    const motionCount = new Uint32Array(numBuckets);
    const brightnessSum = new Float64Array(numBuckets);
    const brightnessCount = new Uint32Array(numBuckets);
    const sharpnessArr = new Float32Array(numBuckets).fill(-1);
    const cutScoreArr = new Float32Array(numBuckets).fill(0);
    const cuts: number[] = [];

    const smallSurface = createOffscreenCanvas(SMALL_W, SMALL_H);
    const sharpSurface = createOffscreenCanvas(SHARP_W, SHARP_H);

    if (!smallSurface.ctx || !sharpSurface.ctx) {
      smallSurface.dispose();
      sharpSurface.dispose();
      return null;
    }

    const smallCtx = smallSurface.ctx;
    const sharpCtx = sharpSurface.ctx;

    const prevLuma = new Float32Array(SMALL_PIXELS);
    const currLuma = new Float32Array(SMALL_PIXELS);
    const prevLumaHist = new Float32Array(16);
    const currLumaHist = new Float32Array(16);
    // 12-bin coarse color histogram (4 bins each for R, G, B)
    const prevColorHist = new Float32Array(12);
    const currColorHist = new Float32Array(12);
    let hasPrevFrame = false;
    let partial = false;
    let totalFramesProcessed = 0;

    const processFrameAtTime = (frameSource: any, timeSec: number) => {
      if (!Number.isFinite(timeSec) || timeSec < 0) return;
      const clampedTime = Math.min(durationSec, Math.max(0, timeSec));
      const bIdx = Math.min(numBuckets - 1, Math.max(0, Math.floor(clampedTime / bucketSec)));

      const rgba = extractFrameRgba(frameSource, smallCtx, SMALL_W, SMALL_H);
      if (!rgba || rgba.length < SMALL_PIXELS * 4) return;

      currLumaHist.fill(0);
      currColorHist.fill(0);

      let lumaSum = 0;
      let motionDiffSum = 0;

      for (let p = 0, pix = 0; pix < SMALL_PIXELS; p += 4, pix++) {
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];

        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        currLuma[pix] = l;
        lumaSum += l;

        if (hasPrevFrame) {
          motionDiffSum += Math.abs(l - prevLuma[pix]);
        }

        const lBin = Math.min(15, Math.floor(l * 16));
        currLumaHist[lBin]++;

        currColorHist[Math.min(3, r >> 6)]++;
        currColorHist[4 + Math.min(3, g >> 6)]++;
        currColorHist[8 + Math.min(3, b >> 6)]++;
      }

      const invPixels = 1 / SMALL_PIXELS;
      for (let i = 0; i < 16; i++) currLumaHist[i] *= invPixels;
      for (let i = 0; i < 12; i++) currColorHist[i] *= invPixels;

      const frameBrightness = lumaSum * invPixels;
      brightnessSum[bIdx] += frameBrightness;
      brightnessCount[bIdx]++;

      if (hasPrevFrame) {
        const frameMotion = motionDiffSum * invPixels;
        motionSum[bIdx] += frameMotion;
        motionCount[bIdx]++;

        // L1 histogram distance in [0, 1] for 16-bin luminance + 12-bin coarse RGB
        let lumaHistDiff = 0;
        for (let i = 0; i < 16; i++) {
          lumaHistDiff += Math.abs(currLumaHist[i] - prevLumaHist[i]);
        }
        const lumaDist = 0.5 * lumaHistDiff;

        let colorHistDiff = 0;
        for (let i = 0; i < 12; i++) {
          colorHistDiff += Math.abs(currColorHist[i] - prevColorHist[i]);
        }
        const colorDist = colorHistDiff / 6;

        const frameCutScore = Math.min(1, lumaDist * 0.75 + colorDist * 0.35);
        if (frameCutScore > cutScoreArr[bIdx]) {
          cutScoreArr[bIdx] = frameCutScore;
        }

        if (frameCutScore > CUT_SCORE_THRESHOLD) {
          const lastCut = cuts.length > 0 ? cuts[cuts.length - 1] : -Infinity;
          if (clampedTime - lastCut >= MIN_CUT_SEPARATION_SEC) {
            cuts.push(Number(clampedTime.toFixed(3)));
          }
        }
      }

      // Compute Laplacian sharpness on 160x90 canvas at most ONCE per bucket
      if (sharpnessArr[bIdx] < 0) {
        const sharpRgba = extractFrameRgba(frameSource, sharpCtx, SHARP_W, SHARP_H);
        if (sharpRgba && sharpRgba.length >= SHARP_PIXELS * 4) {
          sharpnessArr[bIdx] = computeLaplacianSharpness(sharpRgba, SHARP_W, SHARP_H);
        } else {
          sharpnessArr[bIdx] = computeLaplacianSharpness(rgba, SMALL_W, SMALL_H);
        }
      }

      prevLuma.set(currLuma);
      prevLumaHist.set(currLumaHist);
      prevColorHist.set(currColorHist);
      hasPrevFrame = true;
      totalFramesProcessed++;
    };

    try {
      let decodedViaWebCodecs = false;

      // Path 1: WebCodecs sequential hardware decoding (or injected test decoderFactory)
      if (decoderFactory || WebCodecsVideoDecoder.isSupported()) {
        let decoder: InterestScanDecoderLike | null = null;
        try {
          decoder = decoderFactory ? decoderFactory() : new WebCodecsVideoDecoder();
          const meta = await decoder.prepare(source);
          if (signal?.aborted) {
            return null;
          }

          const effectiveDur = meta.durationSeconds > 0 ? meta.durationSeconds : durationSec;
          while (true) {
            if (signal?.aborted) {
              return null;
            }
            if (performance.now() - scanStartMs > maxScanMs) {
              partial = true;
              break;
            }

            const item = await decoder.getNextFrame();
            if (!item) break;

            try {
              if (signal?.aborted) {
                return null;
              }
              const timeSec = item.timestampMicros / 1_000_000;
              processFrameAtTime(item.frame, timeSec);
              if (onProgress && effectiveDur > 0) {
                onProgress(Math.min(1, Math.max(0, timeSec / effectiveDur)));
              }
            } finally {
              try {
                item.frame?.close?.();
              } catch {}
            }
          }

          decodedViaWebCodecs = totalFramesProcessed > 0;
        } catch {
          decodedViaWebCodecs = totalFramesProcessed > 0;
        } finally {
          try {
            decoder?.close();
          } catch {}
        }
      }

      // Path 2: Fallback to muted HTMLVideoElement at playbackRate = 4 with requestVideoFrameCallback
      if (!decodedViaWebCodecs) {
        if (signal?.aborted) return null;
        if (typeof document === "undefined") return null;

        const video = document.createElement("video");
        if (typeof (video as any).requestVideoFrameCallback !== "function") {
          try {
            video.remove();
          } catch {}
          return null;
        }

        let objectUrlToRevoke: string | null = null;
        let rvfcHandle: number | null = null;
        let budgetTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanupVideo = () => {
          if (budgetTimer !== null) {
            clearTimeout(budgetTimer);
            budgetTimer = null;
          }
          if (rvfcHandle !== null && typeof (video as any).cancelVideoFrameCallback === "function") {
            try {
              (video as any).cancelVideoFrameCallback(rvfcHandle);
            } catch {}
            rvfcHandle = null;
          }
          try {
            video.pause();
          } catch {}
          try {
            video.removeAttribute("src");
            video.load();
            video.remove();
          } catch {}
          if (objectUrlToRevoke) {
            try {
              URL.revokeObjectURL(objectUrlToRevoke);
            } catch {}
            objectUrlToRevoke = null;
          }
        };

        try {
          const scanDone = await new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (ok: boolean) => {
              if (settled) return;
              settled = true;
              signal?.removeEventListener("abort", onAbort);
              resolve(ok);
            };

            const onAbort = () => finish(false);
            signal?.addEventListener("abort", onAbort, { once: true });

            const remainingBudgetMs = Math.max(100, maxScanMs - (performance.now() - scanStartMs));
            budgetTimer = setTimeout(() => {
              partial = true;
              finish(totalFramesProcessed > 0);
            }, remainingBudgetMs);

            const onFrame = (_now: number, metadata: { mediaTime?: number }) => {
              if (settled || signal?.aborted) {
                finish(false);
                return;
              }
              if (performance.now() - scanStartMs > maxScanMs) {
                partial = true;
                finish(totalFramesProcessed > 0);
                return;
              }

              const mediaTime =
                typeof metadata?.mediaTime === "number" ? metadata.mediaTime : video.currentTime || 0;
              processFrameAtTime(video, mediaTime);
              if (onProgress && durationSec > 0) {
                onProgress(Math.min(1, Math.max(0, mediaTime / durationSec)));
              }

              if (mediaTime >= durationSec - 0.05 || video.ended) {
                finish(true);
                return;
              }

              rvfcHandle = (video as any).requestVideoFrameCallback(onFrame);
            };

            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";
            (video as any).disablePictureInPicture = true;

            video.onended = () => finish(totalFramesProcessed > 0);
            video.onerror = () => finish(false);
            video.onloadedmetadata = () => {
              if (settled || signal?.aborted) {
                finish(false);
                return;
              }
              try {
                video.playbackRate = 4.0;
              } catch {}
              rvfcHandle = (video as any).requestVideoFrameCallback(onFrame);
              const playPromise = video.play();
              if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => finish(totalFramesProcessed > 0));
              }
            };

            if (typeof source === "string") {
              video.src = source;
            } else if (source instanceof ArrayBuffer) {
              objectUrlToRevoke = URL.createObjectURL(new Blob([source], { type: "video/mp4" }));
              video.src = objectUrlToRevoke;
            } else {
              objectUrlToRevoke = URL.createObjectURL(source);
              video.src = objectUrlToRevoke;
            }
            video.load();
          });

          if (!scanDone || signal?.aborted || totalFramesProcessed === 0) {
            return null;
          }
        } finally {
          cleanupVideo();
        }
      }

      if (signal?.aborted || totalFramesProcessed === 0) {
        return null;
      }

      // Assemble per-bucket output arrays
      const motion: number[] = new Array(numBuckets);
      const brightness: number[] = new Array(numBuckets);
      const sharpness: number[] = new Array(numBuckets);
      const cutScore: number[] = new Array(numBuckets);

      // Find the last bucket that actually received frames so we know where a partial cutoff occurred
      let lastVisitedBucket = -1;
      for (let b = numBuckets - 1; b >= 0; b--) {
        if (brightnessCount[b] > 0 || motionCount[b] > 0) {
          lastVisitedBucket = b;
          break;
        }
      }

      let prevValidMotion = 0;
      let prevValidBrightness = NEUTRAL_BRIGHTNESS;
      let prevValidSharpness = NEUTRAL_SHARPNESS;

      for (let b = 0; b < numBuckets; b++) {
        const isBeyondPartialCutoff = partial && b > lastVisitedBucket;

        if (isBeyondPartialCutoff) {
          motion[b] = NEUTRAL_MOTION;
          brightness[b] = NEUTRAL_BRIGHTNESS;
          sharpness[b] = NEUTRAL_SHARPNESS;
          cutScore[b] = NEUTRAL_CUT_SCORE;
          continue;
        }

        if (motionCount[b] > 0) {
          prevValidMotion = motionSum[b] / motionCount[b];
          motion[b] = prevValidMotion;
        } else {
          motion[b] = b === 0 ? 0 : prevValidMotion;
        }

        if (brightnessCount[b] > 0) {
          prevValidBrightness = brightnessSum[b] / brightnessCount[b];
          brightness[b] = prevValidBrightness;
        } else {
          brightness[b] = prevValidBrightness;
        }

        if (sharpnessArr[b] >= 0) {
          prevValidSharpness = sharpnessArr[b];
          sharpness[b] = prevValidSharpness;
        } else {
          sharpness[b] = prevValidSharpness;
        }

        cutScore[b] = cutScoreArr[b];
      }

      // If bucket 0 had only the very first frame (so motionCount[0] === 0) and bucket 1 has motion, copy bucket 1
      if (motionCount[0] === 0 && numBuckets > 1 && motionCount[1] > 0) {
        motion[0] = motion[1];
      }

      const scanDurationMs = Number((performance.now() - scanStartMs).toFixed(1));
      return {
        times,
        motion,
        brightness,
        sharpness,
        cutScore,
        cuts,
        bucketSec,
        ...(partial ? { partial: true } : {}),
        scanDurationMs,
      };
    } finally {
      smallSurface.dispose();
      sharpSurface.dispose();
    }
  } catch {
    return null;
  }
}
