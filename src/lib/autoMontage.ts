// AI Auto-Montage & Smart Beat Engine with Non-blocking Worker Analysis, Blur/Exposure Penalties & Diversity
import { buildSmartTemplateStyle, type SmartTemplate } from "./smartTemplates";
import type { Clip, MediaItem, FilterItem, VfxItem, Caption, CaptionStyle, TransitionType, Transition } from "@/context/MediaContext";
import { 
  calculateSegmentAudioEnergiesBatch, 
  analyzeAudioTrack, 
  clearAudioBufferCache,
  type BeatAnalysisResult,
  type BeatPoint,
  type MusicSection
} from "./beatDetector";
import { 
  disposeVisionModels, 
  resetVisionDetector, 
  analyzeFrameVision, 
  computeVisionSegmentScore, 
  getVisionAnalysisStatus, 
  type VisionFrameAnalysis 
} from "./visionAnalyzer";
import { VideoAnalysisWorkerManager } from "./videoAnalysisWorkerManager";
import type { FrameBufferData, WorkerSegmentResult } from "./workers/videoAnalysis.worker";
import {
  scanVideoInterest,
  canRunVideoInterestScan,
  type VideoInterestScanResult,
  type VideoInterestScanOptions,
} from "./videoInterestScan";

export interface MontageProgressInfo {
  clipIndex: number;
  totalClips: number;
  percent: number;
  messageAr: string;
  messageEn: string;
}

export type MontageProgressCallback = (info: MontageProgressInfo) => void;

export interface MontageResult {
  clips: Clip[];
  filters: FilterItem[];
  vfx: VfxItem[];
  captions: Caption[];
  captionStyle: Partial<CaptionStyle>;
  totalDuration: number;
  analysis: { 
    segmentsAnalyzed: number; 
    segmentsSelected: number; 
    avgScore: number; 
    topScore: number; 
    durationBefore: number; 
    durationAfter: number;
    beatCount?: number;
    hasFacesDetected?: boolean;
    visionEngine?: "mediapipe" | "heuristic_fallback";
    degradedSegments?: number;
  };
}

export interface Segment { 
  mediaId: string; 
  fallback?: boolean;
  in: number; 
  out: number; 
  score: number; 
  motion: number; 
  sharpness: number;
  blurPenalty: number;
  exposureQuality: number;
  actionIntensity: number;
  temporalStability: number;
  audioEnergy: number;
  faceScore: number;
  handScore: number;
  handVelocityScore: number;
  brightness: number; 
  colorfulness: number;
  containsTransition: boolean;
  overallQuality: number;
}

// Bounded LRU Cache for analyzed segments and lightweight interest scan curves to prevent Android memory growth & re-analysis
const videoAnalysisCache = new Map<string, Segment[]>();
const videoInterestScanCache = new Map<string, VideoInterestScanResult>();
const MAX_CACHE_ENTRIES = 16;
const MAX_SCAN_CACHE_BUCKETS = 12000; // ~240KB max across all cached scan curves
let currentScanCacheBuckets = 0;

export function buildVideoCacheKey(m: MediaItem): string {
  const fileSig = m.file ? `${m.file.name}_${m.file.size}_${m.file.lastModified}` : (m.url || m.id);
  const durStr = typeof m.duration === "number" ? m.duration.toFixed(2) : "0";
  const resStr = `${m.width || 0}x${m.height || 0}`;
  return `v4_${m.id}_${fileSig}_${durStr}_${resStr}`;
}

export function setCachedInterestScan(key: string, scan: VideoInterestScanResult): void {
  const existing = videoInterestScanCache.get(key);
  if (existing) {
    currentScanCacheBuckets = Math.max(0, currentScanCacheBuckets - existing.times.length);
    videoInterestScanCache.delete(key);
  }
  const incomingBuckets = scan.times?.length || 0;
  if (incomingBuckets > MAX_SCAN_CACHE_BUCKETS) return;

  while (
    videoInterestScanCache.size >= MAX_CACHE_ENTRIES ||
    (videoInterestScanCache.size > 0 && currentScanCacheBuckets + incomingBuckets > MAX_SCAN_CACHE_BUCKETS)
  ) {
    const oldestKey = videoInterestScanCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = videoInterestScanCache.get(oldestKey);
    if (oldest) {
      currentScanCacheBuckets = Math.max(0, currentScanCacheBuckets - oldest.times.length);
    }
    videoInterestScanCache.delete(oldestKey);
  }

  videoInterestScanCache.set(key, scan);
  currentScanCacheBuckets += incomingBuckets;
}

export function getCachedInterestScan(key: string): VideoInterestScanResult | undefined {
  const scan = videoInterestScanCache.get(key);
  if (scan) {
    // Refresh LRU order
    videoInterestScanCache.delete(key);
    videoInterestScanCache.set(key, scan);
  }
  return scan;
}

export function setCacheEntry(
  key: string,
  value: Segment[],
  scan?: VideoInterestScanResult | null
): void {
  if (videoAnalysisCache.has(key)) {
    videoAnalysisCache.delete(key);
  } else if (videoAnalysisCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = videoAnalysisCache.keys().next().value;
    if (firstKey) videoAnalysisCache.delete(firstKey);
  }
  videoAnalysisCache.set(key, value);

  if (scan) {
    setCachedInterestScan(key, scan);
  }
}

export function clearVideoAnalysisCache(): void {
  videoAnalysisCache.clear();
  videoInterestScanCache.clear();
  currentScanCacheBuckets = 0;
}

// Global active montage controller for safe cancellation & preventing concurrent decoders
let activeMontageAbortController: AbortController | null = null;

export function abortActiveMontage(): void {
  if (activeMontageAbortController) {
    try {
      activeMontageAbortController.abort();
    } catch {}
    activeMontageAbortController = null;
  }
}

export const LONG_VIDEO_BURST_THRESHOLD_SEC = 25;
export const INTEREST_SCAN_MIN_DURATION_SEC = 12;
export const MAX_BURST_ANCHORS = 8;
export const FRAMES_PER_BURST = 3;
export const BURST_FRAME_STEP_SEC = 0.3;

export function computeVisionSampleIndices(frameCount: number, maxCalls: number = 8): number[] {
  if (frameCount <= 0 || maxCalls <= 0) return [];
  const stride = Math.max(1, Math.ceil(frameCount / maxCalls));
  const indices: number[] = [];
  for (let i = 0; i < frameCount && indices.length < maxCalls; i++) {
    if (i % stride === 0) {
      indices.push(i);
    }
  }
  return indices;
}

export function buildVideoSampleTimes(
  duration: number,
  fastMode: boolean = true,
  coarseSampling: boolean = false,
  reduceSparseForScan: boolean = false
): {
  sampleTimes: number[];
  frameCount: number;
  frameInterval: number;
  visionStride: number;
  isBurstSampling: boolean;
} {
  const maxFrames = coarseSampling ? 5 : reduceSparseForScan ? 12 : (fastMode ? 24 : 36);
  const targetStepSec = coarseSampling ? 3.5 : reduceSparseForScan ? 1.8 : (fastMode ? 0.9 : 0.75);

  if (!coarseSampling && duration > LONG_VIDEO_BURST_THRESHOLD_SEC) {
    const anchorCount = reduceSparseForScan ? 4 : MAX_BURST_ANCHORS;
    const sampleTimes: number[] = [];
    const minT = 0.4;
    const maxT = Math.max(minT, duration - 0.4);
    const sliceDur = duration / anchorCount;

    for (let a = 0; a < anchorCount; a++) {
      const center = Math.max(
        minT + BURST_FRAME_STEP_SEC,
        Math.min(maxT - BURST_FRAME_STEP_SEC, (a + 0.5) * sliceDur)
      );
      sampleTimes.push(
        Number(Math.max(minT, center - BURST_FRAME_STEP_SEC).toFixed(3)),
        Number(center.toFixed(3)),
        Number(Math.min(maxT, center + BURST_FRAME_STEP_SEC).toFixed(3))
      );
    }

    const frameCount = sampleTimes.length;
    const frameInterval = duration / (frameCount + 1);
    const visionStride = Math.max(1, Math.ceil(frameCount / 8));
    return {
      sampleTimes,
      frameCount,
      frameInterval,
      visionStride,
      isBurstSampling: true,
    };
  }

  const frameCount = Math.min(maxFrames, Math.max(3, Math.floor(duration / targetStepSec)));
  const frameInterval = duration / (frameCount + 1);
  const sampleTimes: number[] = [];
  for (let i = 1; i <= frameCount; i++) {
    const t = Math.max(0.4, Math.min(duration - 0.4, i * frameInterval));
    sampleTimes.push(t);
  }
  const visionStride = Math.max(1, Math.ceil(frameCount / 8));

  return {
    sampleTimes,
    frameCount,
    frameInterval,
    visionStride,
    isBurstSampling: false,
  };
}

/**
 * Lightweight, non-blocking video frame extractor that offloads motion, sharpness & exposure scoring to Web Worker.
 * Uses adaptive coarse sampling to prevent GPU decoder stalls on 4K/1080p videos.
 */
async function analyzeVideoAdvanced(
  url: string, 
  segmentSec: number, 
  duration: number,
  fastMode: boolean = true,
  coarseSampling: boolean = false,
  signal?: AbortSignal,
  onFrameProgress?: (fraction: number) => void,
  reduceSparseForScan: boolean = false
): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Video analysis aborted"));
      return;
    }

    const canvas = document.createElement("canvas");
    // 96x96 resolution is mathematically optimal for motion/color/sharpness (56% fewer pixels than 128x128)
    const W = 96;
    const H = 96;
    canvas.width = W; 
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    if (!ctx) { 
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
      resolve([]); 
      return; 
    }

    const v = document.createElement("video");
    v.preload = "auto"; 
    v.muted = true; 
    v.playsInline = true;
    (v as any).disablePictureInPicture = true;

    const analysisStartMs = performance.now();

    const { sampleTimes, frameInterval, visionStride } = buildVideoSampleTimes(
      duration,
      fastMode,
      coarseSampling,
      reduceSparseForScan
    );

    // Candidate segment windows across the video
    const segStep = coarseSampling ? 3.0 : Math.max(1.2, segmentSec);
    const candidateCount = Math.max(1, Math.floor(duration / segStep));
    const segmentTimes: Array<{ in: number; out: number }> = [];
    for (let i = 0; i < candidateCount; i++) {
      const sIn = i * segStep;
      const sOut = Math.min(sIn + Math.max(1.5, segStep), duration);
      segmentTimes.push({ in: sIn, out: sOut });
    }
    if (segmentTimes.length > 0 && segmentTimes[segmentTimes.length - 1].out < duration - 0.5) {
      segmentTimes.push({ in: Math.max(0, duration - Math.max(1.5, segStep)), out: duration });
    }
    
    let sampleIdx = 0;
    let visionFrameCalls = 0;
    const extractedFrames: FrameBufferData[] = [];
    const visionPromises: Promise<{ time: number; analysis: VisionFrameAnalysis } | null>[] = [];
    let isCleanedUp = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    const WATCHDOG_IDLE_MS = 12000;

    const resetWatchdog = (timeoutMs: number = WATCHDOG_IDLE_MS) => {
      if (isCleanedUp) return;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
      }
      safetyTimer = setTimeout(() => {
        if (!isCleanedUp) {
          cleanup();
          extractedFrames.length = 0;
          visionPromises.length = 0;
          resolve(buildFallbackSegments());
        }
      }, timeoutMs);
    };

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (stepTimer) {
        clearTimeout(stepTimer);
        stepTimer = null;
      }
      signal?.removeEventListener("abort", onAbort);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("error", onError);
      v.onloadedmetadata = null;
      v.onseeked = null;
      v.onerror = null;
      try {
        if (typeof v.pause === "function") {
          v.pause();
        }
      } catch {}
      try {
        v.src = "";
        v.removeAttribute("src");
        if (typeof v.load === "function") {
          v.load();
        }
        v.remove();
      } catch {}
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch {}
      canvas.width = 0;
      canvas.height = 0;
      try {
        canvas.remove();
      } catch {}
    };

    let started = false;
    const onAbort = () => {
      cleanup();
      extractedFrames.length = 0;
      visionPromises.length = 0;
      reject(new Error("Video analysis aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const buildFallbackSegments = (): Segment[] =>
      segmentTimes.map((st) => ({
        mediaId: "",
        in: st.in,
        out: st.out,
        score: 0.12,
        motion: 0.25,
        sharpness: 0.3,
        blurPenalty: 0.6,
        exposureQuality: 0.7,
        actionIntensity: 0.25,
        temporalStability: 0.5,
        audioEnergy: 0.2,
        faceScore: 0,
        handScore: 0,
        handVelocityScore: 0,
        brightness: 0.5,
        colorfulness: 0.3,
        containsTransition: false,
        overallQuality: 0.15,
        fallback: true,
      }));

    const processFrame = () => {
      if (signal?.aborted) {
        cleanup();
        extractedFrames.length = 0;
        visionPromises.length = 0;
        reject(new Error("Video analysis aborted"));
        return;
      }

      if (sampleIdx >= sampleTimes.length) {
        // Refresh watchdog to cover worker + audio + vision batch completion
        resetWatchdog(Math.min(30000, 8000 + 400 * extractedFrames.length) + 4000);
        // All frames extracted - dispatch analysis & batch audio energy to Web Worker + Vision
        void (async () => {
          try {
            const workerMgr = VideoAnalysisWorkerManager.getInstance();
            
            // Concurrently calculate batch audio energies, worker results & vision detections
            const [workerResults, audioEnergies, visionResults] = await Promise.all([
              workerMgr.analyzeFrames(extractedFrames, segmentTimes),
              calculateSegmentAudioEnergiesBatch(url, segmentTimes),
              Promise.all(visionPromises)
            ]);

            const isMediaPipeEngine = getVisionAnalysisStatus().lastEngineUsed === "mediapipe";
            const validVisionResults = visionResults.filter(
              (vf): vf is { time: number; analysis: VisionFrameAnalysis } => vf !== null
            );
            const isMediaPipeAvailableInVideo = isMediaPipeEngine && validVisionResults.length > 0;
            const maxVisionNearestDist = visionStride * frameInterval * 1.2;

            const finalSegments: Segment[] = workerResults.map((wr: WorkerSegmentResult, i: number) => {
              const seg = segmentTimes[i];
              let segVisionFrames: VisionFrameAnalysis[] = [];

              if (isMediaPipeAvailableInVideo && seg) {
                segVisionFrames = validVisionResults
                  .filter((vf) => vf.time >= seg.in - 0.25 && vf.time <= seg.out + 0.25)
                  .map((vf) => vf.analysis);

                if (segVisionFrames.length === 0) {
                  const segMid = (seg.in + seg.out) / 2;
                  let nearestVf: { time: number; analysis: VisionFrameAnalysis } | null = null;
                  let minDist = Infinity;
                  for (const vf of validVisionResults) {
                    const dist = Math.abs(vf.time - segMid);
                    if (dist < minDist) {
                      minDist = dist;
                      nearestVf = vf;
                    }
                  }
                  if (nearestVf && minDist < maxVisionNearestDist) {
                    segVisionFrames = [nearestVf.analysis];
                  }
                }
              }

              const hasMediaPipeForSegment = segVisionFrames.length > 0;
              const visionScore = hasMediaPipeForSegment
                ? computeVisionSegmentScore(segVisionFrames)
                : { faceScore: 0, handScore: 0, handVelocityScore: 0 };

              // Boundary penalty: penalize segments that start within the first 0.3s or end within the last 0.3s
              let boundaryPenalty = 1.0;
              if (seg.in < 0.35) boundaryPenalty *= 0.75;
              if (seg.out > duration - 0.35) boundaryPenalty *= 0.75;

              const combinedQuality = (wr.overallQuality || 0.6) * boundaryPenalty;

              return {
                mediaId: "",
                in: wr.in,
                out: wr.out,
                score: combinedQuality,
                motion: wr.motion,
                sharpness: wr.sharpness,
                blurPenalty: wr.blurPenalty,
                exposureQuality: wr.exposureQuality,
                actionIntensity: wr.actionIntensity,
                temporalStability: wr.temporalStability,
                audioEnergy: audioEnergies[i] ?? 0.5,
                faceScore: isMediaPipeAvailableInVideo
                  ? (hasMediaPipeForSegment ? visionScore.faceScore : 0)
                  : wr.faceScore * 0.5,
                handScore: isMediaPipeAvailableInVideo
                  ? (hasMediaPipeForSegment ? visionScore.handScore : 0)
                  : wr.handScore * 0.5,
                handVelocityScore: hasMediaPipeForSegment ? visionScore.handVelocityScore : 0,
                brightness: wr.brightness,
                colorfulness: wr.colorfulness,
                containsTransition: wr.containsTransition,
                overallQuality: combinedQuality,
              };
            });

            const elapsedMs = Number((performance.now() - analysisStartMs).toFixed(1));
            console.info(
              `[AutoMontage] Video analysis completed: frames=${extractedFrames.length}, visionCalls=${visionPromises.length}, totalTimeMs=${elapsedMs}`
            );

            resolve(finalSegments);
          } catch (err) {
            console.warn("[AutoMontage] Worker analysis failed, using fallback segments:", err);
            resolve(buildFallbackSegments());
          } finally {
            cleanup();
            extractedFrames.length = 0;
            visionPromises.length = 0;
          }
        })();
        return;
      }

      onFrameProgress?.(sampleIdx / sampleTimes.length);
      const targetTime = Math.min(sampleTimes[sampleIdx], Math.max(0, duration - 0.05));
      try {
        v.currentTime = targetTime;
      } catch {
        sampleIdx++;
        stepTimer = setTimeout(processFrame, 4);
      }
    };

    const onLoadedMetadata = () => {
      if (started || isCleanedUp) return;
      started = true;
      resetWatchdog();
      processFrame();
    };

    const onSeeked = () => {
      started = true;
      if (isCleanedUp) return;
      if (signal?.aborted) {
        cleanup();
        extractedFrames.length = 0;
        visionPromises.length = 0;
        reject(new Error("Video analysis aborted"));
        return;
      }

      // Renew watchdog on every successfully extracted frame
      resetWatchdog();

      const frameTime = sampleTimes[sampleIdx];
      try {
        ctx.drawImage(v, 0, 0, W, H);
        const imgData = ctx.getImageData(0, 0, W, H);
        const bufferCopy = imgData.data.buffer.slice(0);
        extractedFrames.push({
          time: frameTime,
          width: W,
          height: H,
          buffer: bufferCopy,
        });

        if (sampleIdx % visionStride === 0 && visionFrameCalls < 8) {
          visionFrameCalls++;
          try {
            const frameCanvasCopy = document.createElement("canvas");
            frameCanvasCopy.width = W;
            frameCanvasCopy.height = H;
            const copyCtx = frameCanvasCopy.getContext("2d");
            if (copyCtx) {
              if (typeof copyCtx.putImageData === "function") {
                copyCtx.putImageData(imgData, 0, 0);
              } else if (typeof copyCtx.drawImage === "function") {
                copyCtx.drawImage(canvas, 0, 0);
              }
            }

            visionPromises.push(
              analyzeFrameVision(frameCanvasCopy)
                .then((analysis) => ({ time: frameTime, analysis }))
                .catch(() => null)
                .finally(() => {
                  frameCanvasCopy.width = 0;
                  frameCanvasCopy.height = 0;
                  frameCanvasCopy.remove();
                })
            );
          } catch {}
        }
      } catch {
        extractedFrames.push({
          time: frameTime,
          width: W,
          height: H,
          buffer: new ArrayBuffer(W * H * 4),
        });
      }
      sampleIdx++;
      stepTimer = setTimeout(processFrame, 4);
    };

    const onError = () => {
      cleanup();
      extractedFrames.length = 0;
      visionPromises.length = 0;
      resolve(buildFallbackSegments());
    };

    // Real browsers never fire "seeked" from load(); start sampling once metadata is ready.
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", onError);

    resetWatchdog();

    v.src = url;
    v.load();
  });
}

/**
 * Intelligent Musical Beat Slot Planner
 * Groups musical beats into rhythmically coherent shot durations instead of cutting on every beat.
 */
export interface BeatSlot {
  in: number;
  out: number;
  dur: number;
  isDownbeat: boolean;
  isStrong: boolean;
  section: "calm" | "verse" | "buildup" | "drop";
  targetEnergy: number;
}

export function buildMusicalBeatSlots(
  beatResult: BeatAnalysisResult | null,
  rawBeatTimes: number[],
  targetDuration: number,
  minShotDuration: number = 0.65,
  maxShotDuration: number = 3.8
): BeatSlot[] {
  const rawEffectiveDur = targetDuration > 0 ? targetDuration : 30;
  const allSourceBeats =
    beatResult && beatResult.beats.length > 0
      ? beatResult.beats.map((b) => b.time)
      : rawBeatTimes.filter((b) => b > 0.05);
  const maxBeatInTrack = allSourceBeats.length > 0 ? Math.max(...allSourceBeats) : 0;
  // If montage target is shorter than the selected music track, snap the end to the last beat at/before targetDuration
  const beatsUpToTarget = allSourceBeats.filter((t) => t <= rawEffectiveDur + 0.05).sort((a, b) => a - b);
  const lastBeatBeforeTarget = beatsUpToTarget.length > 0 ? beatsUpToTarget[beatsUpToTarget.length - 1] : 0;
  const effectiveDur =
    maxBeatInTrack > rawEffectiveDur + 0.15 && lastBeatBeforeTarget >= minShotDuration
      ? lastBeatBeforeTarget
      : rawEffectiveDur;

  // Case 1: Rich Musical Analysis available (takes strict precedence over rawBeatTimes)
  if (beatResult && beatResult.beats.length > 0) {
    const slots: BeatSlot[] = [];
    const beats = beatResult.beats.filter((b) => b.time <= effectiveDur + 0.5);
    const sections = beatResult.sections || [];
    const downbeatSet = new Set((beatResult.downbeats || []).map((t) => Number(t.toFixed(2))));
    const strongBeatSet = new Set((beatResult.strongBeats || []).map((t) => Number(t.toFixed(2))));

    const resolveSectionAt = (t: number, fallbackSec: BeatSlot["section"]): BeatSlot["section"] => {
      const found = sections.find((s) => t >= s.start - 0.05 && t <= s.end + 0.05);
      return found ? found.type : fallbackSec;
    };

    const isNearSectionBoundary = (t: number): boolean =>
      sections.some((s) => Math.abs(s.start - t) <= 0.18 || Math.abs(s.end - t) <= 0.18);

    let currentSlotStart = 0;
    let bIdx = 0;

    while (bIdx < beats.length && currentSlotStart < effectiveDur - 0.3) {
      const b = beats[bIdx];
      const secType = resolveSectionAt(b.time, b.section);
      const isDownbeat = Boolean(b.isDownbeat || downbeatSet.has(Number(b.time.toFixed(2))));
      const isStrong = Boolean(isDownbeat || b.isStrong || strongBeatSet.has(Number(b.time.toFixed(2))));

      let beatsToAdvance = 2;
      if (secType === "calm") {
        beatsToAdvance = 4;
      } else if (secType === "buildup") {
        beatsToAdvance = (bIdx % 4 === 0) ? 2 : 1;
      } else if (secType === "drop") {
        beatsToAdvance = 1;
      } else {
        beatsToAdvance = 2;
      }

      // Find next candidate cut point, snapping within ±1 beat to a section boundary or downbeat if valid
      let targetNextBeatIdx = Math.min(beats.length - 1, bIdx + beatsToAdvance);
      for (const offset of [0, -1, 1]) {
        const candIdx = targetNextBeatIdx + offset;
        if (candIdx <= bIdx || candIdx >= beats.length) continue;
        const candBeat = beats[candIdx];
        const candDur = candBeat.time - currentSlotStart;
        if (candDur >= minShotDuration && candDur <= maxShotDuration) {
          const candIsDown = Boolean(candBeat.isDownbeat || downbeatSet.has(Number(candBeat.time.toFixed(2))));
          if (isNearSectionBoundary(candBeat.time) || candIsDown) {
            targetNextBeatIdx = candIdx;
            break;
          }
        }
      }

      let cutTime = beats[targetNextBeatIdx].time;

      // Ensure min and max shot duration constraints
      let shotDur = cutTime - currentSlotStart;
      while (shotDur < minShotDuration && targetNextBeatIdx < beats.length - 1) {
        targetNextBeatIdx++;
        cutTime = beats[targetNextBeatIdx].time;
        shotDur = cutTime - currentSlotStart;
      }

      if (shotDur > maxShotDuration) {
        cutTime = currentSlotStart + maxShotDuration;
        shotDur = maxShotDuration;
      }

      // Cap at target duration
      if (cutTime > effectiveDur) {
        cutTime = effectiveDur;
        shotDur = effectiveDur - currentSlotStart;
      }

      if (shotDur < minShotDuration && slots.length > 0) {
        // Merge short remnant with preceding slot
        const prevSlot = slots[slots.length - 1];
        prevSlot.out = Number(cutTime.toFixed(3));
        prevSlot.dur = Number((prevSlot.out - prevSlot.in).toFixed(3));
        currentSlotStart = cutTime;
      } else if (shotDur >= minShotDuration || slots.length === 0) {
        slots.push({
          in: Number(currentSlotStart.toFixed(3)),
          out: Number(cutTime.toFixed(3)),
          dur: Number(shotDur.toFixed(3)),
          isDownbeat,
          isStrong,
          section: secType,
          targetEnergy: b.energy,
        });
        currentSlotStart = cutTime;
      }

      bIdx = targetNextBeatIdx + 1;
    }

    // If leftover time remains before effectiveDur
    if (currentSlotStart < effectiveDur - 0.1) {
      const rem = effectiveDur - currentSlotStart;
      if (rem < minShotDuration && slots.length > 0) {
        const lastSlot = slots[slots.length - 1];
        lastSlot.out = Number(effectiveDur.toFixed(3));
        lastSlot.dur = Number((lastSlot.out - lastSlot.in).toFixed(3));
      } else {
        slots.push({
          in: Number(currentSlotStart.toFixed(3)),
          out: Number(effectiveDur.toFixed(3)),
          dur: Number(rem.toFixed(3)),
          isDownbeat: false,
          isStrong: false,
          section: "verse",
          targetEnergy: 0.5,
        });
      }
    }

    if (slots.length > 0) return slots;
  }

  // Case 2: Fallback with raw beat times
  const sortedBeats = Array.from(new Set(rawBeatTimes.filter((b) => b > 0.05))).sort((a, b) => a - b);
  const slots: BeatSlot[] = [];

  // If no beats exist (neither beatResult nor rawBeatTimes), divide target duration into multiple slots
  // between minShotDuration and maxShotDuration, merging any short remainder with the last slot.
  if (sortedBeats.length === 0) {
    const safeMin = Math.max(0.2, minShotDuration);
    const safeMax = Math.max(safeMin, maxShotDuration);
    const midDur = (safeMin + safeMax) / 2;
    const stepDur =
      effectiveDur >= safeMin * 2 && effectiveDur < midDur + safeMin
        ? effectiveDur / 2
        : midDur;

    let currentStart = 0;
    while (currentStart < effectiveDur - 0.05) {
      const remaining = effectiveDur - currentStart;
      if (remaining < safeMin && slots.length > 0) {
        const lastSlot = slots[slots.length - 1];
        lastSlot.out = Number(effectiveDur.toFixed(3));
        lastSlot.dur = Number((lastSlot.out - lastSlot.in).toFixed(3));
        currentStart = effectiveDur;
        break;
      }

      const nextOut = Math.min(effectiveDur, currentStart + stepDur);
      const dur = nextOut - currentStart;
      const isDownbeat = slots.length % 4 === 0;
      const isStrong = isDownbeat || slots.length % 2 === 0;
      slots.push({
        in: Number(currentStart.toFixed(3)),
        out: Number(nextOut.toFixed(3)),
        dur: Number(dur.toFixed(3)),
        isDownbeat,
        isStrong,
        section: isStrong ? "drop" : "verse",
        targetEnergy: isStrong ? 0.75 : 0.45,
      });
      currentStart = nextOut;
    }

    if (slots.length === 0) {
      slots.push({
        in: 0,
        out: effectiveDur,
        dur: effectiveDur,
        isDownbeat: true,
        isStrong: true,
        section: "verse",
        targetEnergy: 0.5,
      });
    }

    return slots;
  }

  let prevTime = 0;

  for (let i = 0; i < sortedBeats.length; i++) {
    const b = sortedBeats[i];
    if (b > effectiveDur + 0.1) break;

    const dur = b - prevTime;
    // Group beats if spacing is under minimum duration
    if (dur >= minShotDuration) {
      const isDownbeat = (slots.length % 4 === 0);
      const isStrong = isDownbeat || (slots.length % 2 === 0);
      slots.push({
        in: Number(prevTime.toFixed(3)),
        out: Number(b.toFixed(3)),
        dur: Number(dur.toFixed(3)),
        isDownbeat,
        isStrong,
        section: isStrong ? "drop" : "verse",
        targetEnergy: isStrong ? 0.75 : 0.45,
      });
      prevTime = b;
    }
  }

  // Add final segment or merge if short
  if (prevTime < effectiveDur - 0.1) {
    const remaining = effectiveDur - prevTime;
    if (remaining < minShotDuration && slots.length > 0) {
      const lastSlot = slots[slots.length - 1];
      lastSlot.out = Number(effectiveDur.toFixed(3));
      lastSlot.dur = Number((lastSlot.out - lastSlot.in).toFixed(3));
    } else {
      slots.push({
        in: Number(prevTime.toFixed(3)),
        out: Number(effectiveDur.toFixed(3)),
        dur: Number(remaining.toFixed(3)),
        isDownbeat: false,
        isStrong: false,
        section: "verse",
        targetEnergy: 0.5,
      });
    }
  }

  if (slots.length === 0) {
    slots.push({
      in: 0,
      out: effectiveDur,
      dur: effectiveDur,
      isDownbeat: true,
      isStrong: true,
      section: "verse",
      targetEnergy: 0.5,
    });
  }

  return slots;
}

export interface SegmentScoringWeights {
  motionWeight: number;
  brightnessWeight: number;
  colorWeight: number;
  faceWeight: number;
}

/**
 * Pure segment quality scoring function.
 * Incorporates audioEnergy (0.10 weight in both branches) and optional template weights.
 */
export function computeSegmentScore(
  seg: Segment,
  hasFaces: boolean,
  weights?: SegmentScoringWeights
): number {
  const motionVal = Math.min(1, Math.max(0, seg.motion));
  const sharpVal = Math.min(1, Math.max(0, seg.sharpness));
  const blurPen = seg.blurPenalty;
  const expoQual = seg.exposureQuality;
  const faceVal = Math.min(1, Math.max(0, seg.faceScore));
  const handVelVal = Math.min(1, Math.max(0, seg.handVelocityScore));
  const colorVal = Math.min(1, Math.max(0, seg.colorfulness));
  const actionVal = Math.min(1, Math.max(0, seg.actionIntensity));
  const audioVal = Math.min(1, Math.max(0, seg.audioEnergy ?? 0));
  const brightVal = Math.min(1, Math.max(0, seg.brightness));

  const transitionPen = seg.containsTransition ? 0.25 : 1.0;
  const fallbackPen = seg.fallback ? 0.15 : 1.0;

  let defaultBaseScore = 0;
  if (hasFaces) {
    // Rebalanced with audioEnergy at 0.10 (sum = 0.31 + 0.22 + 0.16 + 0.11 + 0.10 + 0.05 + 0.05 = 1.00)
    defaultBaseScore =
      faceVal * 0.31 +
      sharpVal * 0.22 +
      motionVal * 0.16 +
      actionVal * 0.11 +
      audioVal * 0.10 +
      handVelVal * 0.05 +
      colorVal * 0.05;
  } else {
    // Rebalanced with audioEnergy at 0.10 (sum = 0.27 + 0.25 + 0.20 + 0.10 + 0.09 + 0.09 = 1.00)
    defaultBaseScore =
      sharpVal * 0.27 +
      actionVal * 0.25 +
      motionVal * 0.20 +
      audioVal * 0.10 +
      handVelVal * 0.09 +
      colorVal * 0.09;
  }

  let baseScore = defaultBaseScore;
  if (weights) {
    const wMotion = Math.max(0, weights.motionWeight ?? 0);
    const wBright = Math.max(0, weights.brightnessWeight ?? 0);
    const wColor = Math.max(0, weights.colorWeight ?? 0);
    const wFace = hasFaces ? Math.max(0, weights.faceWeight ?? 0) : 0;
    const weightSum = wMotion + wBright + wColor + wFace;

    let weightedPart = defaultBaseScore;
    if (weightSum > 0) {
      const motionActionSignal = Math.min(1, Math.max(0, (motionVal + actionVal) * 0.5));
      const brightnessCloseness = Math.min(1, Math.max(0, 1 - Math.abs(brightVal - 0.55) / 0.55));
      const rawWeighted =
        (motionActionSignal * wMotion +
          brightnessCloseness * wBright +
          colorVal * wColor +
          faceVal * wFace) /
        weightSum;
      weightedPart = Math.min(1, Math.max(0, rawWeighted));
    }

    baseScore = 0.5 * defaultBaseScore + 0.5 * weightedPart;
  }

  return baseScore * blurPen * expoQual * transitionPen * fallbackPen;
}

/**
 * Pure helper that merges dense interest scan curves (motion, brightness, sharpness, cuts)
 * into candidate Segments within each segment's [in, out] window.
 * Preserves faceScore and handScore from sparse vision analysis.
 */
export function applyInterestScanToSegments(
  segments: Segment[],
  scan: VideoInterestScanResult
): Segment[] {
  if (!scan || !scan.motion || scan.motion.length === 0 || segments.length === 0) {
    return segments;
  }

  const bucketSec = scan.bucketSec > 0 ? scan.bucketSec : 0.4;
  const numBuckets = scan.motion.length;

  // Compute 95th percentile of motion across the video for normalization
  const finiteMotions = scan.motion.filter((v) => Number.isFinite(v) && v >= 0);
  const sortedMotions = [...finiteMotions].sort((a, b) => a - b);
  const p95Idx =
    sortedMotions.length > 0
      ? Math.min(sortedMotions.length - 1, Math.floor(sortedMotions.length * 0.95))
      : 0;
  let rawP95 = sortedMotions.length > 0 ? sortedMotions[p95Idx] : 0;
  if (rawP95 <= 1e-4 && sortedMotions.length > 0) {
    const activeMotions = sortedMotions.filter((v) => v > 1e-4);
    if (activeMotions.length > 0) {
      const actIdx = Math.min(activeMotions.length - 1, Math.floor(activeMotions.length * 0.95));
      rawP95 = activeMotions[actIdx];
    }
  }
  const normDenom = rawP95 > 1e-6 ? rawP95 : 1;

  return segments.map((seg) => {
    const startB = Math.min(numBuckets - 1, Math.max(0, Math.floor(seg.in / bucketSec)));
    const endB = Math.min(
      numBuckets - 1,
      Math.max(startB, Math.ceil(seg.out / bucketSec) - 1)
    );
    const count = Math.max(1, endB - startB + 1);

    let sumMotion = 0;
    let sumBrightness = 0;
    let sumSharpness = 0;
    for (let b = startB; b <= endB; b++) {
      sumMotion += scan.motion[b] ?? 0;
      sumBrightness += scan.brightness[b] ?? seg.brightness;
      sumSharpness += scan.sharpness[b] ?? seg.sharpness;
    }

    const meanRawMotion = sumMotion / count;
    const normMotion =
      rawP95 > 1e-6 ? Math.min(1, Math.max(0, meanRawMotion / normDenom)) : 0;
    const meanBrightness = sumBrightness / count;
    const meanSharpness = sumSharpness / count;

    const blendedBrightness = Math.min(
      1,
      Math.max(0, 0.5 * seg.brightness + 0.5 * meanBrightness)
    );
    const blendedSharpness = Math.min(
      1,
      Math.max(0, 0.5 * seg.sharpness + 0.5 * meanSharpness)
    );
    const containsTransition =
      Array.isArray(scan.cuts) &&
      scan.cuts.some((cutTime) => cutTime >= seg.in + 0.15 && cutTime < seg.out);
    const temporalStability = Math.max(0, 1 - Math.abs(normMotion - 0.45) * 1.2);

    const updated: Segment = {
      ...seg,
      motion: normMotion,
      actionIntensity: normMotion,
      brightness: blendedBrightness,
      sharpness: blendedSharpness,
      containsTransition,
      temporalStability,
    };
    updated.score = computeSegmentScore(updated, updated.faceScore > 0.12);
    updated.overallQuality = updated.score;
    return updated;
  });
}

/**
 * Scene-aware slice adjustment:
 * If a scene cut falls inside [sliceIn + 0.2, sliceIn + dur), moves sliceIn to that cut
 * if the remaining shot fits dur; otherwise moves to the start of the preceding shot if it fits dur;
 * otherwise leaves sliceIn unchanged.
 */
export function snapSliceToShot(
  sliceIn: number,
  dur: number,
  cuts?: readonly number[] | null,
  mediaDur?: number
): number {
  if (!cuts || cuts.length === 0 || !Number.isFinite(dur) || dur <= 0) {
    return sliceIn;
  }
  const safeMediaDur =
    typeof mediaDur === "number" && Number.isFinite(mediaDur) && mediaDur > 0
      ? mediaDur
      : Infinity;
  const sortedCuts = [...cuts]
    .filter((c) => Number.isFinite(c) && c > 0 && c < safeMediaDur)
    .sort((a, b) => a - b);
  if (sortedCuts.length === 0) {
    return sliceIn;
  }

  const sliceOut = sliceIn + dur;
  const internalCut = sortedCuts.find((c) => c >= sliceIn + 0.2 && c < sliceOut - 1e-6);
  if (internalCut === undefined) {
    return sliceIn;
  }

  // Next cut after internalCut (or mediaDur if none)
  const nextCut = sortedCuts.find((c) => c > internalCut + 1e-6) ?? safeMediaDur;
  if (internalCut + dur <= Math.min(nextCut, safeMediaDur) + 1e-6) {
    return Number(internalCut.toFixed(3));
  }

  // Otherwise try moving to the start of the previous shot if [prevShotStart, internalCut] fits dur
  let prevShotStart = 0;
  for (const c of sortedCuts) {
    if (c < internalCut - 1e-6) {
      prevShotStart = c;
    } else {
      break;
    }
  }

  if (
    internalCut - prevShotStart >= dur - 1e-6 &&
    prevShotStart + dur <= safeMediaDur + 1e-6
  ) {
    return Number(prevShotStart.toFixed(3));
  }

  return sliceIn;
}

/**
 * Aligns slice start so the local motion peak within [sliceIn - dur/2, sliceIn + dur/2]
 * lands at ~0.15 * dur from slice start on strong/downbeats, or ~0.35 * dur on normal beats.
 * Bounds shift to ±dur/2 and [0, mediaDur - dur], and optionally applies snapSliceToShot afterwards.
 */
export function alignToMotionPeak(
  sliceIn: number,
  dur: number,
  motionCurve?: readonly number[] | null,
  bucketSec: number = 0.4,
  beatStrongness: boolean | number | "strong" | "downbeat" | "normal" = false,
  mediaDur?: number,
  cuts?: readonly number[] | null
): number {
  if (
    !motionCurve ||
    motionCurve.length === 0 ||
    !Number.isFinite(dur) ||
    dur <= 0 ||
    !Number.isFinite(bucketSec) ||
    bucketSec <= 0
  ) {
    return cuts ? snapSliceToShot(sliceIn, dur, cuts, mediaDur) : sliceIn;
  }

  const effectiveMediaDur =
    typeof mediaDur === "number" && Number.isFinite(mediaDur) && mediaDur > 0
      ? mediaDur
      : motionCurve.length * bucketSec;

  const winStart = Math.max(0, sliceIn - dur / 2);
  const winEnd = Math.min(effectiveMediaDur, sliceIn + dur / 2);

  const startIdx = Math.max(0, Math.floor((winStart + 1e-6) / bucketSec));
  const endIdx = Math.min(
    motionCurve.length - 1,
    Math.max(startIdx, Math.floor((winEnd + 1e-6) / bucketSec))
  );

  let peakIdx = startIdx;
  let maxMotion = -Infinity;
  let minMotion = Infinity;

  for (let i = startIdx; i <= endIdx; i++) {
    const val = Number.isFinite(motionCurve[i]) ? motionCurve[i] : 0;
    if (val > maxMotion) {
      maxMotion = val;
      peakIdx = i;
    }
    if (val < minMotion) {
      minMotion = val;
    }
  }

  let alignedIn = sliceIn;
  if (maxMotion > minMotion + 1e-6) {
    const isStrong =
      beatStrongness === true ||
      beatStrongness === "strong" ||
      beatStrongness === "downbeat" ||
      (typeof beatStrongness === "number" && beatStrongness >= 0.7);
    const targetOffsetFromStart = (isStrong ? 0.15 : 0.35) * dur;
    const peakTime = peakIdx * bucketSec;
    const desiredIn = peakTime - targetOffsetFromStart;
    const clampedShift = Math.max(-dur / 2, Math.min(dur / 2, desiredIn - sliceIn));
    alignedIn = sliceIn + clampedShift;
  }

  const maxValidIn = Math.max(0, effectiveMediaDur - dur);
  alignedIn = Number(Math.max(0, Math.min(maxValidIn, alignedIn)).toFixed(3));

  if (cuts && cuts.length > 0) {
    alignedIn = snapSliceToShot(alignedIn, dur, cuts, effectiveMediaDur);
  }

  return alignedIn;
}

export interface SmartBeatMontageParams {
  media: MediaItem[];
  beatTimes?: number[];
  audioTrackUrl?: string;
  audioAnalysis?: BeatAnalysisResult;
  targetDuration?: number;
  fastMode?: boolean;
  minShotDuration?: number;
  maxShotDuration?: number;
  interleave?: boolean;
  transition?: { type: TransitionType; duration: number };
  weights?: SegmentScoringWeights;
  alignToMotion?: boolean;
  interestScanOptions?: VideoInterestScanOptions;
  signal?: AbortSignal;
  onProgress?: MontageProgressCallback;
}

/**
 * High-Performance Smart Beat Montage Engine
 * Synchronizes candidate video moments with musical rhythm and energy.
 * Default mode (interleave = false) cuts sequentially video-by-video in upload order.
 */
export async function runSmartBeatMontage({
  media,
  beatTimes = [],
  audioTrackUrl,
  audioAnalysis,
  targetDuration,
  fastMode = true,
  minShotDuration = 0.65,
  maxShotDuration = 3.8,
  interleave = false,
  transition,
  weights,
  alignToMotion = true,
  interestScanOptions,
  signal,
  onProgress,
}: SmartBeatMontageParams): Promise<MontageResult> {
  // Cancel previous active jobs
  abortActiveMontage();
  activeMontageAbortController = new AbortController();
  const activeSignal = signal || activeMontageAbortController.signal;

  resetVisionDetector();
  const validMedia = media.filter((m) => m.type === "video" || m.type === "image");
  if (validMedia.length === 0) {
    return {
      clips: [],
      filters: [],
      vfx: [],
      captions: [],
      captionStyle: {},
      totalDuration: 0,
      analysis: {
        segmentsAnalyzed: 0,
        segmentsSelected: 0,
        avgScore: 0,
        topScore: 0,
        durationBefore: 0,
        durationAfter: 0,
        beatCount: 0,
        hasFacesDetected: false,
      },
    };
  }

  const totalFootageDur = validMedia.reduce((acc, m) => acc + (m.duration || 5), 0);
  const isLongFootage = totalFootageDur > 180;

  onProgress?.({
    clipIndex: 0,
    totalClips: validMedia.length,
    percent: 5,
    messageAr: isLongFootage ? "تحليل سريع للإيقاع (مقاطع طويلة)..." : "بدء تحليل الإيقاع والمشاهد...",
    messageEn: isLongFootage ? "Adaptive turbo beat analysis for long footage..." : "Starting beat & moment analysis...",
  });

  // 1. Analyze Audio if URL provided and not yet analyzed.
  // Precedence rule: audioAnalysis (downbeats, strongBeats, sections) strictly wins over legacy beatTimes.
  let computedAudioAnalysis =
    audioAnalysis && audioAnalysis.beats && audioAnalysis.beats.length > 0
      ? audioAnalysis
      : null;
  if (!computedAudioAnalysis && audioTrackUrl) {
    try {
      const analyzed = await analyzeAudioTrack(audioTrackUrl, { signal: activeSignal });
      if (analyzed && analyzed.beats && analyzed.beats.length > 0) {
        computedAudioAnalysis = analyzed;
      }
    } catch {
      computedAudioAnalysis = null;
    }
  }

  const resolvedBeatTimes =
    computedAudioAnalysis && computedAudioAnalysis.beats.length > 0
      ? (computedAudioAnalysis.beatTimes?.length
          ? computedAudioAnalysis.beatTimes
          : computedAudioAnalysis.beats.map((b) => b.time))
      : beatTimes;

  // 2. Candidate Extraction with Intelligent Caching
  const allCandidateSegments: Segment[] = [];
  const mediaScanMap = new Map<string, VideoInterestScanResult>();
  const totalCount = validMedia.length;

  for (let mIdx = 0; mIdx < totalCount; mIdx++) {
    if (activeSignal.aborted) throw new Error("Smart cut aborted");

    const m = validMedia[mIdx];
    const baseProgress = 10 + Math.round((mIdx / totalCount) * 65);

    onProgress?.({
      clipIndex: mIdx + 1,
      totalClips: totalCount,
      percent: baseProgress,
      messageAr: `تحليل المقطع ${mIdx + 1} من ${totalCount}...`,
      messageEn: `Analyzing clip ${mIdx + 1} of ${totalCount}...`,
    });

    if (m.type === "video" && m.duration > 0.5) {
      const cacheKey = buildVideoCacheKey(m);
      if (videoAnalysisCache.has(cacheKey)) {
        const cached = videoAnalysisCache.get(cacheKey)!;
        // Refresh LRU order
        videoAnalysisCache.delete(cacheKey);
        videoAnalysisCache.set(cacheKey, cached);
        const cachedScan = getCachedInterestScan(cacheKey);
        if (cachedScan) {
          mediaScanMap.set(m.id, cachedScan);
        }
        allCandidateSegments.push(...cached.map((s) => ({ ...s, mediaId: m.id })));
      } else {
        const segLen = isLongFootage ? 3.0 : 1.6;
        const shouldRunDenseScan = m.duration > INTEREST_SCAN_MIN_DURATION_SEC;
        const willReduceSparse =
          shouldRunDenseScan && canRunVideoInterestScan(interestScanOptions?.decoderFactory);
        const sparseProgressScale = shouldRunDenseScan ? 0.55 : 1.0;

        let segs = await analyzeVideoAdvanced(
          m.url, 
          segLen, 
          m.duration, 
          fastMode,
          isLongFootage,
          activeSignal,
          (fraction) => {
            const currentP =
              baseProgress + Math.round(fraction * sparseProgressScale * (65 / totalCount));
            onProgress?.({
              clipIndex: mIdx + 1,
              totalClips: totalCount,
              percent: Math.min(80, currentP),
              messageAr: `تحليل المقطع ${mIdx + 1} من ${totalCount} (${Math.round(currentP)}%)...`,
              messageEn: `Analyzing clip ${mIdx + 1} of ${totalCount} (${Math.round(currentP)}%)...`,
            });
          },
          willReduceSparse
        );

        let scanResult: VideoInterestScanResult | null = null;
        if (shouldRunDenseScan) {
          scanResult = await scanVideoInterest(m.file || m.url, m.duration, {
            bucketSec: 0.4,
            ...interestScanOptions,
            signal: activeSignal,
            onProgress: (scanFraction) => {
              const combinedFrac =
                sparseProgressScale + (1 - sparseProgressScale) * scanFraction;
              const currentP = baseProgress + Math.round(combinedFrac * (65 / totalCount));
              onProgress?.({
                clipIndex: mIdx + 1,
                totalClips: totalCount,
                percent: Math.min(80, currentP),
                messageAr: `تحليل المقطع ${mIdx + 1} من ${totalCount} (${Math.round(currentP)}%)...`,
                messageEn: `Analyzing clip ${mIdx + 1} of ${totalCount} (${Math.round(currentP)}%)...`,
              });
            },
          });

          if (activeSignal.aborted) throw new Error("Smart cut aborted");

          if (scanResult) {
            segs = applyInterestScanToSegments(segs, scanResult);
            mediaScanMap.set(m.id, scanResult);
          }
        }

        setCacheEntry(cacheKey, segs, scanResult);
        allCandidateSegments.push(...segs.map((s) => ({ ...s, mediaId: m.id })));
      }
    } else {
      // Photo / static image segment
      allCandidateSegments.push({
        mediaId: m.id,
        in: 0,
        out: m.duration || 5,
        score: 0.6,
        motion: 0.1,
        sharpness: 0.8,
        blurPenalty: 1.0,
        exposureQuality: 1.0,
        actionIntensity: 0.1,
        temporalStability: 1.0,
        audioEnergy: 0.1,
        faceScore: 0,
        handScore: 0,
        handVelocityScore: 0,
        brightness: 0.6,
        colorfulness: 0.5,
        containsTransition: false,
        overallQuality: 0.6,
      });
    }
    await new Promise((r) => setTimeout(r, 6));
  }

  if (activeSignal.aborted) throw new Error("Smart cut aborted");

  onProgress?.({
    clipIndex: totalCount,
    totalClips: totalCount,
    percent: 82,
    messageAr: "مزامنة وتوزيع اللقطات على ضربات الموسيقى...",
    messageEn: "Syncing & distributing cuts to rhythm...",
  });

  // 3. Multi-Signal Quality Scoring
  const maxFaceScoreInProject = Math.max(...allCandidateSegments.map((s) => s.faceScore), 0);
  const hasFacesDetected = maxFaceScoreInProject > 0.12;

  for (const seg of allCandidateSegments) {
    seg.score = computeSegmentScore(seg, hasFacesDetected, weights);
  }

  // 4. Build Musical Beat Slots
  const effectiveTargetDuration = targetDuration && targetDuration > 0
    ? targetDuration
    : (resolvedBeatTimes.length > 0 ? Math.max(...resolvedBeatTimes) : totalFootageDur);

  const beatSlots = buildMusicalBeatSlots(
    computedAudioAnalysis,
    resolvedBeatTimes,
    effectiveTargetDuration,
    minShotDuration,
    maxShotDuration
  );

  // Helper to expand fine-grained candidate anchors for a video so short or few-segment videos
  // can still yield all distinct non-overlapping slices before any repetition occurs.
  const getExpandedCandidatesForMedia = (m: MediaItem): Segment[] => {
    const mDur = Math.max(0.1, m.duration || (m.type === "image" ? 5 : 3));
    const baseCands = allCandidateSegments.filter((s) => s.mediaId === m.id);
    if (baseCands.length === 0) return [];
    const step = Math.max(0.45, Math.min(0.9, minShotDuration));
    if (mDur <= step * 1.5 || baseCands.length >= Math.ceil(mDur / step)) {
      return baseCands;
    }
    const extraSegments: Segment[] = [];
    const expanded: Segment[] = [...baseCands];
    for (let t = step / 2; t < mDur - step / 2; t += step) {
      const hasNearby = expanded.some((c) => Math.abs((c.in + c.out) / 2 - t) < step * 0.45);
      if (hasNearby) continue;
      // Inherit quality metrics from enclosing or nearest analyzed segment
      const parent =
        baseCands.find((c) => t >= c.in && t <= c.out) ||
        baseCands.reduce((best, c) =>
          Math.abs((c.in + c.out) / 2 - t) < Math.abs((best.in + best.out) / 2 - t) ? c : best
        , baseCands[0]);
      const winHalf = Math.min(step / 2, t, mDur - t);
      const subSeg: Segment = {
        ...parent,
        in: Number(Math.max(0, t - winHalf).toFixed(3)),
        out: Number(Math.min(mDur, t + winHalf).toFixed(3)),
      };
      expanded.push(subSeg);
      extraSegments.push(subSeg);
    }

    const mScan = mediaScanMap.get(m.id);
    if (mScan && extraSegments.length > 0) {
      const refinedExtras = applyInterestScanToSegments(extraSegments, mScan);
      for (const s of refinedExtras) {
        s.score = computeSegmentScore(s, hasFacesDetected, weights);
      }
      return [...baseCands, ...refinedExtras];
    }
    return expanded;
  };

  const finalClips: Clip[] = [];
  let beatCarry = 0;

  const computeTransitionIn = (clipIdx: number, prevDur: number, currDur: number): Transition | undefined => {
    if (clipIdx <= 0) return undefined;
    if (transition) {
      if (transition.type === "none" || transition.duration <= 0) return undefined;
      const clampedDur = Number(
        Math.min(transition.duration, 0.4 * Math.min(Math.max(0.1, prevDur), Math.max(0.1, currDur))).toFixed(3)
      );
      return { type: transition.type, duration: clampedDur };
    }
    return clipIdx % 4 === 0 ? { type: "fade", duration: 0.15 } : undefined;
  };

  if (!interleave) {
    // 5A. Sequential Mode (Default for 1 or more videos when interleave === false):
    // - Keeps videos in exact upload order.
    // - Distributes contiguous beat slots proportionally to each video's usable duration.
    // - Snaps inter-video transition boundaries within ±1 beat to a section boundary or downbeat.
    // - Inside each video: selects highest-scoring non-overlapping moments and orders them chronologically.
    // - Carries any shortfall (beatCarry or unfilled slots) forward to the next video; if the last video is short,
    //   repeats minimally (exhausting non-overlapping segments per pass) without two identical consecutive cuts.
    const S = beatSlots.length;
    const N = validMedia.length;
    const activeVideoCount = Math.min(N, S);

    const usableDurs = validMedia.map((m) => {
      const rawDur = Math.max(0.1, m.duration || (m.type === "image" ? 5 : 3));
      const mCands = allCandidateSegments.filter((s) => s.mediaId === m.id);
      if (mCands.length === 0) return rawDur;
      const goodCands = mCands.filter((s) => !s.containsTransition && s.blurPenalty >= 0.35);
      const ratio = goodCands.length > 0 ? goodCands.length / mCands.length : 0.25;
      return Math.max(0.1, rawDur * ratio);
    });

    const totalUsable = usableDurs.slice(0, activeVideoCount).reduce((a, b) => a + b, 0) || 1;
    const exactShares = usableDurs
      .slice(0, activeVideoCount)
      .map((u) => (u / totalUsable) * S);
    const slotCounts = exactShares.map((sh) => Math.max(1, Math.floor(sh)));
    let currentSum = slotCounts.reduce((a, b) => a + b, 0);

    if (currentSum < S) {
      const orderByRemainder = exactShares
        .map((sh, idx) => ({ idx, rem: sh - slotCounts[idx] }))
        .sort((a, b) => b.rem - a.rem);
      let rIdx = 0;
      while (currentSum < S) {
        slotCounts[orderByRemainder[rIdx % orderByRemainder.length].idx]++;
        currentSum++;
        rIdx++;
      }
    } else if (currentSum > S) {
      const orderByCount = slotCounts
        .map((cnt, idx) => ({ idx, cnt, sh: exactShares[idx] }))
        .sort((a, b) => b.cnt - a.cnt || a.sh - b.sh);
      let rIdx = 0;
      while (currentSum > S && rIdx < orderByCount.length * S) {
        const target = orderByCount[rIdx % orderByCount.length].idx;
        if (slotCounts[target] > 1) {
          slotCounts[target]--;
          currentSum--;
        }
        rIdx++;
      }
    }

    const boundaries: number[] = [0];
    for (let i = 0; i < activeVideoCount; i++) {
      boundaries.push(boundaries[i] + slotCounts[i]);
    }
    boundaries[activeVideoCount] = S;

    // Snap inter-video transition boundaries within ±1 beat to a section boundary or downbeat
    const boundaryPriority = (slotIdx: number): number => {
      if (slotIdx <= 0 || slotIdx >= S) return 0;
      const t = beatSlots[slotIdx].in;
      const hasSectionBoundary =
        Boolean(
          computedAudioAnalysis?.sections?.some(
            (sc) => Math.abs(sc.start - t) <= 0.22 || Math.abs(sc.end - t) <= 0.22
          )
        ) || beatSlots[slotIdx].section !== beatSlots[slotIdx - 1].section;
      if (hasSectionBoundary) return 3;
      const isDown =
        beatSlots[slotIdx].isDownbeat ||
        Boolean(computedAudioAnalysis?.downbeats?.some((d) => Math.abs(d - t) <= 0.12));
      if (isDown) return 2;
      const isStr =
        beatSlots[slotIdx].isStrong ||
        Boolean(computedAudioAnalysis?.strongBeats?.some((sb) => Math.abs(sb - t) <= 0.12));
      return isStr ? 1 : 0;
    };

    for (let bIdx = 1; bIdx < activeVideoCount; bIdx++) {
      const orig = boundaries[bIdx];
      const minIdx = boundaries[bIdx - 1] + 1;
      const maxIdx = boundaries[bIdx + 1] - 1;
      let bestIdx = orig;
      let bestPrio = boundaryPriority(orig);
      for (const offset of [-1, 1]) {
        const candIdx = orig + offset;
        if (candIdx < minIdx || candIdx > maxIdx) continue;
        const prio = boundaryPriority(candIdx);
        if (prio > bestPrio) {
          bestPrio = prio;
          bestIdx = candIdx;
        }
      }
      boundaries[bIdx] = bestIdx;
    }

    let currentSlotIdx = 0;

    for (let vIdx = 0; vIdx < N && currentSlotIdx < S; vIdx++) {
      const m = validMedia[vIdx];
      const isLastVideo = vIdx === N - 1 || vIdx === activeVideoCount - 1;
      const targetEndSlot = isLastVideo
        ? S
        : Math.min(S, Math.max(currentSlotIdx + 1, boundaries[vIdx + 1]));
      const mDur = Math.max(0.1, m.duration || (m.type === "image" ? 5 : 3));
      const mCands = getExpandedCandidatesForMedia(m);
      const mScan = mediaScanMap.get(m.id);
      const videoUsedRanges: Array<{ in: number; out: number }> = [];
      let passNumber = 0;

      while (currentSlotIdx < targetEndSlot) {
        const remainingSlots = beatSlots.slice(currentSlotIdx, targetEndSlot);
        if (remainingSlots.length === 0) break;

        // Determine how many upcoming slots can fit in a single non-overlapping pass of mDur
        let passSlotCount = 1;
        let cumReqDur = Math.max(0.1, remainingSlots[0].dur + beatCarry);
        for (let k = 1; k < remainingSlots.length; k++) {
          const nextDur = remainingSlots[k].dur;
          if (cumReqDur + nextDur <= mDur + 0.05) {
            cumReqDur += nextDur;
            passSlotCount++;
          } else if (mDur - cumReqDur >= minShotDuration) {
            // Allow video to contribute its remaining usable non-overlapping tail (>= minShotDuration)
            cumReqDur += nextDur;
            passSlotCount++;
            break;
          } else {
            break;
          }
        }

        const passSlots = remainingSlots.slice(0, passSlotCount);
        const avgSlotDur =
          passSlots.reduce((acc, sl, idx) => acc + sl.dur + (idx === 0 ? beatCarry : 0), 0) /
          passSlots.length;
        const repSlot = passSlots[0];
        const prevClipOnThisVideo =
          finalClips.length > 0 && finalClips[finalClips.length - 1].mediaId === m.id
            ? finalClips[finalClips.length - 1]
            : null;

        // Score all candidates in mCands for this pass
        // On repeat passes (passNumber > 0), strongly prioritize any unused segments first and shift candidate centers
        const passShift =
          passNumber === 0
            ? 0
            : ((passNumber % 3 === 1 ? 0.35 : passNumber % 3 === 2 ? -0.35 : 0.2) * avgSlotDur);

        const scoredCands = mCands.map((cand) => {
          const rawMid = (cand.in + cand.out) / 2;
          const candMid = Math.max(
            avgSlotDur * 0.5,
            Math.min(mDur - avgSlotDur * 0.5, rawMid + passShift)
          );
          let estIn = Math.max(0, candMid - avgSlotDur / 2);
          if (estIn + avgSlotDur > mDur) estIn = Math.max(0, mDur - avgSlotDur);
          const estOut = Math.min(mDur, estIn + avgSlotDur);
          const estDur = Math.max(0.1, estOut - estIn);

          let overlapSec = 0;
          for (const r of videoUsedRanges) {
            const oStart = Math.max(estIn, r.in);
            const oEnd = Math.min(estOut, r.out);
            if (oEnd > oStart) overlapSec += oEnd - oStart;
          }
          const overlapUnits = overlapSec / estDur;
          // In repeat passes (passNumber > 0), unused segments (overlapUnits <= 0.08) get strict priority over already-used ones
          const overlapPenalty =
            overlapUnits > 0.08
              ? Math.ceil(overlapUnits - 0.08) * (passNumber > 0 ? 25.0 : 10.0) + overlapUnits * 4.0
              : 0;

          let consecutiveIdenticalPenalty = 0;
          if (
            prevClipOnThisVideo &&
            Math.abs(estIn - prevClipOnThisVideo.in) < 0.25 &&
            Math.abs(estOut - prevClipOnThisVideo.out) < 0.25
          ) {
            consecutiveIdenticalPenalty = 35.0;
          }

          let energyFitBonus = 0;
          if (repSlot.section === "drop" || repSlot.isDownbeat) {
            energyFitBonus = cand.actionIntensity * 0.25 + cand.motion * 0.15;
          } else if (repSlot.section === "calm") {
            energyFitBonus = cand.faceScore * 0.25 + cand.temporalStability * 0.15;
          }

          return {
            cand,
            mid: candMid,
            isUnused: overlapUnits <= 0.08,
            totalScore: cand.score + energyFitBonus - overlapPenalty - consecutiveIdenticalPenalty,
          };
        });

        scoredCands.sort((a, b) => {
          if (passNumber > 0 && a.isUnused !== b.isUnused) {
            return a.isUnused ? -1 : 1;
          }
          return b.totalScore - a.totalScore;
        });

        // Greedily pick top passSlotCount non-overlapping moments
        const chosenMoments: Array<{ cand: Segment; mid: number; totalScore: number }> = [];
        const minCenterSep = Math.max(0.35, avgSlotDur * 0.75);
        for (const item of scoredCands) {
          if (chosenMoments.length >= passSlotCount) break;
          const tooClose = chosenMoments.some((ch) => Math.abs(ch.mid - item.mid) < minCenterSep);
          if (!tooClose) {
            chosenMoments.push(item);
          }
        }
        if (chosenMoments.length < passSlotCount) {
          for (const item of scoredCands) {
            if (chosenMoments.length >= passSlotCount) break;
            if (!chosenMoments.includes(item)) {
              chosenMoments.push(item);
            }
          }
        }
        while (chosenMoments.length < passSlotCount) {
          const idx = chosenMoments.length;
          const frac = (idx + 0.5) / passSlotCount;
          chosenMoments.push({
            cand: mCands[0],
            mid: frac * mDur,
            totalScore: 0,
          });
        }

        // Sort moments spatially first so we can slice non-overlapping intervals across the video
        chosenMoments.sort((a, b) => a.mid - b.mid);

        const K = passSlots.length;
        // Build slot-to-spatial-bin permutation:
        // - Pass 0 (first pass): strictly chronological ascending [0, 1, ..., K-1]
        // - Pass > 0 (repeat passes): vary start point and playback order (reverse, middle-out rotation, odd-even)
        const perm: number[] = [];
        if (passNumber === 0 || K <= 1) {
          for (let j = 0; j < K; j++) perm.push(j);
        } else if (passNumber % 3 === 1) {
          // Reverse chronological order (end of video -> start of video)
          for (let j = K - 1; j >= 0; j--) perm.push(j);
        } else if (passNumber % 3 === 2) {
          // Rotated middle-first order
          const startBin = Math.max(1, Math.floor(K / 2));
          for (let j = 0; j < K; j++) perm.push((startBin + j) % K);
        } else {
          // Alternating odd-then-even bins
          for (let j = 1; j < K; j += 2) perm.push(j);
          for (let j = 0; j < K; j += 2) perm.push(j);
        }

        // Map each spatial bin sIdx (0..K-1) to the slot j that will use it
        const slotIndexForSpatialBin = new Array<number>(K).fill(0);
        for (let j = 0; j < K; j++) {
          slotIndexForSpatialBin[perm[j]] = j;
        }
        const spatialReqDurs = slotIndexForSpatialBin.map((slotJ) =>
          Math.max(0.1, passSlots[slotJ].dur + (slotJ === 0 ? beatCarry : 0))
        );
        const totalPassReqDur = spatialReqDurs.reduce((a, b) => a + b, 0);
        const slack = Math.max(0, mDur - totalPassReqDur);
        // Vary starting offset at the beginning of each repeat pass so rounds don't start at 0
        const passStartOffset =
          passNumber === 0 ? 0 : Number((((passNumber * 0.37) % 0.8) * slack).toFixed(3));

        let cursor = passStartOffset;
        const spatialSlices: Array<{ in: number; out: number } | null> = new Array(K).fill(null);

        for (let sIdx = 0; sIdx < K; sIdx++) {
          const reqDur = spatialReqDurs[sIdx];
          const slotForBin = passSlots[slotIndexForSpatialBin[sIdx]];
          const remainingRequiredAfterS = spatialReqDurs
            .slice(sIdx + 1)
            .reduce((acc, d) => acc + d, 0);

          if (!isLastVideo && sIdx > 0 && mDur - cursor < minShotDuration) {
            break;
          }

          const maxSliceOut = Math.min(
            mDur,
            Math.max(cursor + Math.min(reqDur, mDur - cursor), mDur - remainingRequiredAfterS)
          );
          let sliceIn = chosenMoments[sIdx].mid - reqDur / 2;
          if (sliceIn + reqDur > maxSliceOut) {
            sliceIn = maxSliceOut - reqDur;
          }
          sliceIn = Math.max(cursor, sliceIn);

          // Apply motion-peak alignment and scene-aware shot snapping when dense scan is available
          if (mScan) {
            if (alignToMotion !== false && mScan.motion.length > 0) {
              const beatStrong = Boolean(
                slotForBin.isDownbeat || slotForBin.isStrong || slotForBin.section === "drop"
              );
              sliceIn = alignToMotionPeak(
                sliceIn,
                reqDur,
                mScan.motion,
                mScan.bucketSec || 0.4,
                beatStrong,
                mDur
              );
            }
            sliceIn = snapSliceToShot(sliceIn, reqDur, mScan.cuts, mDur);
            if (sliceIn + reqDur > maxSliceOut) {
              sliceIn = maxSliceOut - reqDur;
            }
            sliceIn = Math.max(cursor, Math.min(Math.max(0, mDur - reqDur), sliceIn));
          }

          const sliceOut = Math.min(mDur, sliceIn + reqDur);
          cursor = sliceOut;
          spatialSlices[sIdx] = { in: sliceIn, out: sliceOut };
        }

        // Emit clips in the pass's slot order (chronological on Pass 0, varied on Pass > 0)
        let emittedInPass = 0;
        for (let j = 0; j < K; j++) {
          const sIdx = perm[j];
          const planned = spatialSlices[sIdx];
          if (!planned) break;

          const slot = passSlots[j];
          const targetDur = Math.max(0.1, slot.dur + beatCarry);
          let sliceIn = planned.in;
          let sliceOut = planned.out;

          // Prevent two consecutive identical cuts when repeating on the last video (passNumber > 0)
          const lastClip = finalClips.length > 0 ? finalClips[finalClips.length - 1] : null;
          if (passNumber > 0 && lastClip && lastClip.mediaId === m.id) {
            if (
              Math.abs(sliceIn - lastClip.in) < 0.2 &&
              Math.abs(sliceOut - lastClip.out) < 0.2
            ) {
              const shiftAmount = Math.max(0.25, Math.min(targetDur * 0.45, Math.max(0, mDur - targetDur)));
              const candForward = Math.min(Math.max(0, mDur - targetDur), lastClip.in + shiftAmount);
              const candBackward = Math.max(0, lastClip.in - shiftAmount);
              if (Math.abs(candForward - lastClip.in) >= 0.15) {
                sliceIn = candForward;
              } else if (Math.abs(candBackward - lastClip.in) >= 0.15) {
                sliceIn = candBackward;
              } else if (mDur > 0.4) {
                sliceIn = ((passNumber + j + 1) % 2 === 1) ? Math.min(0.2, mDur * 0.18) : 0;
              }
              sliceOut = Math.min(mDur, sliceIn + targetDur);
            }
          }

          const actualDur = Math.max(0.1, sliceOut - sliceIn);
          beatCarry = targetDur - actualDur;

          videoUsedRanges.push({ in: sliceIn, out: sliceOut });
          const clipIdx = finalClips.length;
          const prevClipDur = lastClip ? lastClip.out - lastClip.in : actualDur;
          finalClips.push({
            id: `beat-clip-${Date.now()}-${clipIdx}-${Math.random().toString(36).slice(2, 6)}`,
            mediaId: m.id,
            in: Number(sliceIn.toFixed(3)),
            out: Number(sliceOut.toFixed(3)),
            transitionIn: computeTransitionIn(clipIdx, prevClipDur, actualDur),
          });
          currentSlotIdx++;
          emittedInPass++;
        }

        passNumber++;
        if (!isLastVideo || emittedInPass === 0 || passNumber > S + 2) {
          // Non-last videos never repeat; guard against infinite loops on very short single videos
          break;
        }
      }
    }
  } else {
    // 5B. Single-Video Mode (validMedia.length === 1) or Legacy Interleaved Mode (interleave === true)
    const expandedPool: Segment[] = [];
    validMedia.forEach((m) => {
      expandedPool.push(...getExpandedCandidatesForMedia(m));
    });

    const usedRanges = new Map<string, Array<{ in: number; out: number }>>();
    const mediaUsageCount = new Map<string, number>();
    validMedia.forEach((m) => {
      usedRanges.set(m.id, []);
      mediaUsageCount.set(m.id, 0);
    });

    let lastMediaId = "";
    let consecutiveCountSameMedia = 0;

    for (let i = 0; i < beatSlots.length; i++) {
      const slot = beatSlots[i];
      // Carry any previous shortfall forward so later cuts stay on the beat grid.
      const targetDur = Math.max(0.1, slot.dur + beatCarry);

      let bestCandidate: Segment | null = null;
      let bestCandidateScore = -Infinity;
      let bestSliceIn = 0;
      let bestSliceOut = targetDur;
      let bestMedia: MediaItem = validMedia[0];
      const lastClip = finalClips.length > 0 ? finalClips[finalClips.length - 1] : null;

      for (const cand of expandedPool) {
        const m = validMedia.find((vm) => vm.id === cand.mediaId);
        if (!m) continue;

        const mDur = m.duration || (m.type === "image" ? 5 : 3);
        const candMid = (cand.in + cand.out) / 2;

        // Center slice around candidate midpoint
        let sliceIn = Math.max(0, candMid - targetDur / 2);
        if (sliceIn + targetDur > mDur) {
          sliceIn = Math.max(0, mDur - targetDur);
        }

        // Apply motion-peak alignment and scene-aware shot snapping when dense scan is available
        const mScan = mediaScanMap.get(m.id);
        if (mScan) {
          if (alignToMotion !== false && mScan.motion.length > 0) {
            const beatStrong = Boolean(
              slot.isDownbeat || slot.isStrong || slot.section === "drop"
            );
            sliceIn = alignToMotionPeak(
              sliceIn,
              targetDur,
              mScan.motion,
              mScan.bucketSec || 0.4,
              beatStrong,
              mDur
            );
          }
          sliceIn = snapSliceToShot(sliceIn, targetDur, mScan.cuts, mDur);
          if (sliceIn + targetDur > mDur) {
            sliceIn = Math.max(0, mDur - targetDur);
          }
          sliceIn = Math.max(0, sliceIn);
        }

        const sliceOut = Math.min(mDur, sliceIn + targetDur);
        const actualDur = Math.max(0.1, sliceOut - sliceIn);

        // Cumulative overlap across all passes so no segment repeats until all non-overlapping segments are exhausted
        const curRanges = usedRanges.get(m.id) || [];
        let overlapSec = 0;
        for (const r of curRanges) {
          const oStart = Math.max(sliceIn, r.in);
          const oEnd = Math.min(sliceOut, r.out);
          if (oEnd > oStart) {
            overlapSec += (oEnd - oStart);
          }
        }
        const overlapUnits = actualDur > 0 ? overlapSec / actualDur : 0;
        const overlapPenalty =
          overlapUnits > 0.08 ? Math.ceil(overlapUnits - 0.08) * 10.0 + overlapUnits * 2.0 : 0;

        // Prevent two consecutive identical cuts
        let consecutiveIdenticalPenalty = 0;
        if (
          lastClip &&
          lastClip.mediaId === m.id &&
          Math.abs(sliceIn - lastClip.in) < 0.25 &&
          Math.abs(sliceOut - lastClip.out) < 0.25
        ) {
          consecutiveIdenticalPenalty = 25.0;
        }

        // Diversity Bonus / Penalty:
        // Max 1 consecutive cut from same media if multiple videos exist
        let diversityScore = 0;
        if (validMedia.length > 1) {
          if (m.id === lastMediaId) {
            diversityScore = consecutiveCountSameMedia >= 1 ? -1.5 : -0.3;
          } else {
            diversityScore = 0.25;
          }
        }

        // Usage fairness bonus (boost less-used media items)
        const usageCount = mediaUsageCount.get(m.id) || 0;
        const fairDistributionBonus = -usageCount * 0.08;

        // Music Energy Match:
        // In drops / downbeats: high action intensity, motion, and hand velocity
        // In calm / verse: clear faces, stability, and sharpness
        let energyFitBonus = 0;
        if (slot.section === "drop" || slot.isDownbeat) {
          energyFitBonus = cand.actionIntensity * 0.25 + cand.motion * 0.15;
        } else if (slot.section === "calm") {
          energyFitBonus = cand.faceScore * 0.25 + cand.temporalStability * 0.15;
        }

        // Prefer sources long enough to fill the whole beat slot.
        const shortfallPenalty = Math.max(0, targetDur - actualDur) / targetDur * 1.2;

        const totalScore =
          cand.score -
          shortfallPenalty +
          diversityScore +
          fairDistributionBonus +
          energyFitBonus -
          overlapPenalty -
          consecutiveIdenticalPenalty;

        if (totalScore > bestCandidateScore) {
          bestCandidateScore = totalScore;
          bestCandidate = cand;
          bestMedia = m;
          bestSliceIn = sliceIn;
          bestSliceOut = sliceOut;
        }
      }

      // Fallback if all candidates heavily penalized
      if (!bestCandidate) {
        bestMedia = validMedia.find((m) => m.id !== lastMediaId) || validMedia[0];
        const mDur = bestMedia.duration || 5;
        bestSliceIn = 0;
        bestSliceOut = Math.min(mDur, targetDur);
      }

      beatCarry = targetDur - Math.max(0.1, bestSliceOut - bestSliceIn);

      // Update consecutive tracker
      if (bestMedia.id === lastMediaId) {
        consecutiveCountSameMedia++;
      } else {
        consecutiveCountSameMedia = 1;
        lastMediaId = bestMedia.id;
      }

      // Record usage
      const mRanges = usedRanges.get(bestMedia.id) || [];
      mRanges.push({ in: bestSliceIn, out: bestSliceOut });
      usedRanges.set(bestMedia.id, mRanges);
      mediaUsageCount.set(bestMedia.id, (mediaUsageCount.get(bestMedia.id) || 0) + 1);

      const currDur = Math.max(0.1, bestSliceOut - bestSliceIn);
      const prevDur = lastClip ? lastClip.out - lastClip.in : currDur;
      finalClips.push({
        id: `beat-clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        mediaId: bestMedia.id,
        in: Number(bestSliceIn.toFixed(3)),
        out: Number(bestSliceOut.toFixed(3)),
        transitionIn: computeTransitionIn(i, prevDur, currDur),
      });
    }
  }

  // Matches MediaContext clipTimelineLen: transitionIn is rendered in-place at clip start without shortening timeline duration
  const totalDur = finalClips.reduce(
    (acc, c) => acc + Math.max(0, c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1),
    0
  );
  const avgScore = allCandidateSegments.length > 0
    ? allCandidateSegments.reduce((a, s) => a + s.score, 0) / allCandidateSegments.length
    : 0;

  const visionStatus = getVisionAnalysisStatus();
  disposeVisionModels();
  clearAudioBufferCache();

  onProgress?.({
    clipIndex: totalCount,
    totalClips: totalCount,
    percent: 100,
    messageAr: `تم التقطيع بنجاح! (${finalClips.length} لقطة متزامنة)`,
    messageEn: `Smart Cut complete! (${finalClips.length} beat-synced cuts)`,
  });

  return {
    clips: finalClips,
    filters: [],
    vfx: [],
    captions: [],
    captionStyle: {},
    totalDuration: totalDur,
    analysis: {
      segmentsAnalyzed: allCandidateSegments.length,
      segmentsSelected: finalClips.length,
      avgScore,
      topScore: Math.max(...allCandidateSegments.map((s) => s.score), 0),
      durationBefore: validMedia.reduce((acc, m) => acc + m.duration, 0),
      durationAfter: totalDur,
      beatCount: resolvedBeatTimes.length,
      hasFacesDetected,
      visionEngine: visionStatus.lastEngineUsed === "mediapipe" ? "mediapipe" : "heuristic_fallback",
      degradedSegments: allCandidateSegments.filter((sg) => sg.fallback).length,
    },
  };
}

/**
 * Main Template-based Auto Montage Engine
 */
export async function runAutoMontage(
  media: MediaItem[],
  template: SmartTemplate,
  existingClips: Clip[] = [],
  musicUrl?: string,
  options?: {
    fastMode?: boolean;
    targetDuration?: number;
    alignToMotion?: boolean;
    signal?: AbortSignal;
    onProgress?: MontageProgressCallback;
  }
): Promise<MontageResult> {
  const {
    fastMode = true,
    targetDuration: overrideDuration,
    alignToMotion = true,
    signal,
    onProgress,
  } = options || {};

  try {
    const beatSync = template.ai.musicSync;
    const resolvedTargetDuration = overrideDuration || template.ai.targetDuration || 30;
    const minShotDuration = template.ai.minClipSec || 0.8;
    const maxShotDuration = template.ai.maxClipSec || 4.0;
    const tplTransition = {
      type: template.transition,
      duration: template.transitionDuration,
    };
    const tplWeights: SegmentScoringWeights = {
      motionWeight: template.ai.motionWeight,
      brightnessWeight: template.ai.brightnessWeight,
      colorWeight: template.ai.colorWeight,
      faceWeight: template.ai.faceWeight,
    };

    // If template specifies beat sync or musicUrl is given, run rhythm montage
    const result =
      beatSync || musicUrl
        ? await runSmartBeatMontage({
            media,
            audioTrackUrl: musicUrl,
            targetDuration: resolvedTargetDuration,
            fastMode,
            minShotDuration,
            maxShotDuration,
            transition: tplTransition,
            weights: tplWeights,
            alignToMotion,
            signal,
            onProgress,
          })
        : await runSmartBeatMontage({
            media,
            targetDuration: resolvedTargetDuration,
            fastMode,
            minShotDuration,
            maxShotDuration,
            transition: tplTransition,
            weights: tplWeights,
            alignToMotion,
            signal,
            onProgress,
          });

    const style = buildSmartTemplateStyle(template, result.totalDuration);
    return {
      ...result,
      filters: style.filters,
      vfx: style.vfx,
      captions: [],
      captionStyle: style.captionStyle,
    };
  } catch (err) {
    console.error("[runAutoMontage] Failed to generate smart template montage:", {
      templateId: template?.id,
      templateName: template?.nameEn || template?.name,
      beatSync: template?.ai?.musicSync,
      targetDuration: overrideDuration || template?.ai?.targetDuration,
      minClipSec: template?.ai?.minClipSec,
      maxClipSec: template?.ai?.maxClipSec,
      mediaCount: media?.length ?? 0,
      hasMusicUrl: Boolean(musicUrl),
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      error: err,
    });
    throw err;
  }
}
