// AI Auto-Montage & Smart Beat Engine with Non-blocking Worker Analysis, Blur/Exposure Penalties & Diversity
import type { SmartTemplate } from "./smartTemplates";
import type { Clip, MediaItem, FilterItem, VfxItem, Caption, CaptionStyle } from "@/context/MediaContext";
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
  };
}

export interface Segment { 
  mediaId: string; 
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

// Bounded LRU Cache for analyzed segments to prevent Android memory growth & re-analysis
const videoAnalysisCache = new Map<string, Segment[]>();
const MAX_CACHE_ENTRIES = 16;

export function buildVideoCacheKey(m: MediaItem): string {
  const fileSig = m.file ? `${m.file.name}_${m.file.size}_${m.file.lastModified}` : (m.url || m.id);
  const durStr = typeof m.duration === "number" ? m.duration.toFixed(2) : "0";
  const resStr = `${m.width || 0}x${m.height || 0}`;
  return `v4_${m.id}_${fileSig}_${durStr}_${resStr}`;
}

export function setCacheEntry(key: string, value: Segment[]): void {
  if (videoAnalysisCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = videoAnalysisCache.keys().next().value;
    if (firstKey) videoAnalysisCache.delete(firstKey);
  }
  videoAnalysisCache.set(key, value);
}

export function clearVideoAnalysisCache(): void {
  videoAnalysisCache.clear();
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
  onFrameProgress?: (fraction: number) => void
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
      resolve([]); 
      return; 
    }

    const v = document.createElement("video");
    v.preload = "auto"; 
    v.muted = true; 
    v.playsInline = true;
    (v as any).disablePictureInPicture = true;

    // Adaptive frame sampling: coarse sampling for long video, refined for short video
    const maxFrames = coarseSampling ? 5 : (fastMode ? 7 : 12);
    const frameCount = Math.min(maxFrames, Math.max(3, Math.floor(duration / (coarseSampling ? 3.5 : 1.8))));
    const frameInterval = duration / (frameCount + 1);

    // Key sample timestamps (excluding first 0.35s and last 0.35s to prevent mobile camera button shakes)
    const sampleTimes: number[] = [];
    for (let i = 1; i <= frameCount; i++) { 
      const t = Math.max(0.4, Math.min(duration - 0.4, i * frameInterval));
      sampleTimes.push(t); 
    }

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
    const extractedFrames: FrameBufferData[] = [];
    const visionPromises: Promise<{ time: number; analysis: VisionFrameAnalysis }>[] = [];
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
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
      } catch {}
      canvas.width = 1;
      canvas.height = 1;
    };

    if (signal) {
      signal.addEventListener("abort", () => {
        cleanup();
        reject(new Error("Video analysis aborted"));
      });
    }

    const processFrame = () => {
      if (signal?.aborted) {
        cleanup();
        reject(new Error("Video analysis aborted"));
        return;
      }

      if (sampleIdx >= sampleTimes.length) {
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

            cleanup();

            const finalSegments: Segment[] = workerResults.map((wr: WorkerSegmentResult, i: number) => {
              const seg = segmentTimes[i];
              const segVisionFrames = visionResults
                .filter((vf) => seg && vf.time >= seg.in - 0.25 && vf.time <= seg.out + 0.25)
                .map((vf) => vf.analysis);

              const visionScore = computeVisionSegmentScore(segVisionFrames);

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
                faceScore: Math.max(wr.faceScore, visionScore.faceScore),
                handScore: Math.max(wr.handScore, visionScore.handScore),
                handVelocityScore: Math.max(wr.handVelocityScore, visionScore.handVelocityScore),
                brightness: wr.brightness,
                colorfulness: wr.colorfulness,
                containsTransition: wr.containsTransition,
                overallQuality: combinedQuality,
              };
            });

            resolve(finalSegments);
          } catch (err) {
            console.warn("[AutoMontage] Worker analysis failed, using fallback segments:", err);
            cleanup();
            resolve(
              segmentTimes.map((st) => ({
                mediaId: "",
                in: st.in,
                out: st.out,
                score: 0.5,
                motion: 0.5,
                sharpness: 0.6,
                blurPenalty: 1.0,
                exposureQuality: 1.0,
                actionIntensity: 0.5,
                temporalStability: 0.8,
                audioEnergy: 0.5,
                faceScore: 0,
                handScore: 0,
                handVelocityScore: 0,
                brightness: 0.6,
                colorfulness: 0.5,
                containsTransition: false,
                overallQuality: 0.55,
              }))
            );
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
        setTimeout(processFrame, 4);
      }
    };

    v.addEventListener("seeked", () => {
      if (signal?.aborted) {
        cleanup();
        reject(new Error("Video analysis aborted"));
        return;
      }

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

        visionPromises.push(
          analyzeFrameVision(canvas)
            .then((analysis) => ({ time: frameTime, analysis }))
            .catch(() => ({
              time: frameTime,
              analysis: { faceCount: 0, faceConfidence: 0, hasHands: false, handCount: 0, handPositions: [] },
            }))
        );
      } catch {
        extractedFrames.push({
          time: frameTime,
          width: W,
          height: H,
          buffer: new ArrayBuffer(W * H * 4),
        });
      }
      sampleIdx++;
      setTimeout(processFrame, 4);
    });

    v.addEventListener("error", () => {
      cleanup();
      resolve(
        segmentTimes.map((st) => ({
          mediaId: "",
          in: st.in,
          out: st.out,
          score: 0.5,
          motion: 0.5,
          sharpness: 0.5,
          blurPenalty: 1.0,
          exposureQuality: 1.0,
          actionIntensity: 0.5,
          temporalStability: 0.8,
          audioEnergy: 0.5,
          faceScore: 0,
          handScore: 0,
          handVelocityScore: 0,
          brightness: 0.6,
          colorfulness: 0.5,
          containsTransition: false,
          overallQuality: 0.5,
        }))
      );
    });

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
  const effectiveDur = targetDuration > 0 ? targetDuration : 30;

  // Case 1: Rich Musical Analysis available
  if (beatResult && beatResult.beats.length > 0) {
    const slots: BeatSlot[] = [];
    const beats = beatResult.beats.filter((b) => b.time <= effectiveDur + 0.5);
    
    let currentSlotStart = 0;
    let bIdx = 0;

    while (bIdx < beats.length && currentSlotStart < effectiveDur - 0.3) {
      const b = beats[bIdx];
      const secType = b.section;

      // Grouping rules based on musical section:
      // Calm: 4 beats (1 measure) or 2 beats. Min dur: 1.4s, Max dur: 3.5s
      // Buildup: accelerating 2 beats -> 1 beat. Min dur: 0.8s
      // Drop: downbeats and strong beats (0.65s - 1.2s)
      // Verse: 2 beats (1.1s - 2.2s)
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

      // Find next candidate cut point
      let targetNextBeatIdx = Math.min(beats.length - 1, bIdx + beatsToAdvance);
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
          isDownbeat: b.isDownbeat,
          isStrong: b.isStrong,
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

export interface SmartBeatMontageParams {
  media: MediaItem[];
  beatTimes?: number[];
  audioTrackUrl?: string;
  audioAnalysis?: BeatAnalysisResult;
  targetDuration?: number;
  fastMode?: boolean;
  minShotDuration?: number;
  maxShotDuration?: number;
  signal?: AbortSignal;
  onProgress?: MontageProgressCallback;
}

/**
 * High-Performance Smart Beat Montage Engine
 * Synchronizes candidate video moments with musical rhythm and energy.
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

  // 1. Analyze Audio if URL provided and not yet analyzed
  let computedAudioAnalysis = audioAnalysis || null;
  if (!computedAudioAnalysis && audioTrackUrl) {
    try {
      computedAudioAnalysis = await analyzeAudioTrack(audioTrackUrl, { signal: activeSignal });
    } catch {
      computedAudioAnalysis = null;
    }
  }

  const resolvedBeatTimes = computedAudioAnalysis
    ? computedAudioAnalysis.beatTimes
    : beatTimes;

  // 2. Candidate Extraction with Intelligent Caching
  const allCandidateSegments: Segment[] = [];
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
        allCandidateSegments.push(...cached.map((s) => ({ ...s, mediaId: m.id })));
      } else {
        const segLen = isLongFootage ? 3.0 : 1.6;
        const segs = await analyzeVideoAdvanced(
          m.url, 
          segLen, 
          m.duration, 
          fastMode,
          isLongFootage,
          activeSignal,
          (fraction) => {
            const currentP = baseProgress + Math.round(fraction * (65 / totalCount));
            onProgress?.({
              clipIndex: mIdx + 1,
              totalClips: totalCount,
              percent: Math.min(80, currentP),
              messageAr: `تحليل المقطع ${mIdx + 1} من ${totalCount} (${Math.round(currentP)}%)...`,
              messageEn: `Analyzing clip ${mIdx + 1} of ${totalCount} (${Math.round(currentP)}%)...`,
            });
          }
        );
        setCacheEntry(cacheKey, segs);
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
    const motionVal = Math.min(1, Math.max(0, seg.motion));
    const sharpVal = Math.min(1, Math.max(0, seg.sharpness));
    const blurPen = seg.blurPenalty;
    const expoQual = seg.exposureQuality;
    const faceVal = Math.min(1, Math.max(0, seg.faceScore));
    const handVelVal = Math.min(1, Math.max(0, seg.handVelocityScore));
    const colorVal = Math.min(1, Math.max(0, seg.colorfulness));
    const actionVal = Math.min(1, Math.max(0, seg.actionIntensity));

    const transitionPen = seg.containsTransition ? 0.25 : 1.0;

    let baseScore = 0;
    if (hasFacesDetected) {
      baseScore =
        faceVal * 0.35 +
        sharpVal * 0.25 +
        motionVal * 0.18 +
        actionVal * 0.12 +
        handVelVal * 0.05 +
        colorVal * 0.05;
    } else {
      baseScore =
        sharpVal * 0.30 +
        actionVal * 0.28 +
        motionVal * 0.22 +
        handVelVal * 0.10 +
        colorVal * 0.10;
    }

    // Strictly apply blur, exposure, transition penalties
    seg.score = baseScore * blurPen * expoQual * transitionPen;
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

  // 5. Diversity-Aware Selection & Maximum Marginal Relevance
  // Enforces round-robin across source media, prevents repeat cuts, and matches energy to slots
  const usedRanges = new Map<string, Array<{ in: number; out: number }>>();
  const mediaUsageCount = new Map<string, number>();
  validMedia.forEach((m) => {
    usedRanges.set(m.id, []);
    mediaUsageCount.set(m.id, 0);
  });

  let lastMediaId = "";
  let consecutiveCountSameMedia = 0;
  const finalClips: Clip[] = [];

  for (let i = 0; i < beatSlots.length; i++) {
    const slot = beatSlots[i];
    const targetDur = slot.dur;

    let bestCandidate: Segment | null = null;
    let bestCandidateScore = -Infinity;
    let bestSliceIn = 0;
    let bestSliceOut = targetDur;
    let bestMedia: MediaItem = validMedia[0];

    for (const cand of allCandidateSegments) {
      const m = validMedia.find((vm) => vm.id === cand.mediaId);
      if (!m) continue;

      const mDur = m.duration || (m.type === "image" ? 5 : 3);
      const candMid = (cand.in + cand.out) / 2;

      // Center slice around candidate midpoint
      let sliceIn = Math.max(0, candMid - targetDur / 2);
      if (sliceIn + targetDur > mDur) {
        sliceIn = Math.max(0, mDur - targetDur);
      }
      const sliceOut = Math.min(mDur, sliceIn + targetDur);
      const actualDur = Math.max(0.1, sliceOut - sliceIn);

      // Overlap with previously chosen ranges in this media item
      const curRanges = usedRanges.get(m.id) || [];
      let overlapSec = 0;
      for (const r of curRanges) {
        const oStart = Math.max(sliceIn, r.in);
        const oEnd = Math.min(sliceOut, r.out);
        if (oEnd > oStart) {
          overlapSec += (oEnd - oStart);
        }
      }
      const overlapRatio = actualDur > 0 ? overlapSec / actualDur : 0;

      // Disqualify already used ranges if we have enough total footage
      let overlapPenalty = 0;
      if (totalFootageDur >= effectiveTargetDuration * 0.85) {
        if (overlapRatio > 0.08) {
          overlapPenalty = 10.0; // strict exclusion
        }
      } else {
        overlapPenalty = overlapRatio * 0.8;
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

      const totalScore = cand.score + diversityScore + fairDistributionBonus + energyFitBonus - overlapPenalty;

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

    finalClips.push({
      id: `beat-clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      mediaId: bestMedia.id,
      in: Number(bestSliceIn.toFixed(3)),
      out: Number(bestSliceOut.toFixed(3)),
      transitionIn: i > 0 && i % 4 === 0 ? { type: "fade", duration: 0.15 } : undefined,
    });
  }

  const totalDur = finalClips.reduce((acc, c) => acc + (c.out - c.in), 0);
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
    signal?: AbortSignal;
    onProgress?: MontageProgressCallback;
  }
): Promise<MontageResult> {
  const { fastMode = true, targetDuration: overrideDuration, signal, onProgress } = options || {};

  // If template specifies beat sync or musicUrl is given, run rhythm montage
  if (template.aiRules.beatSync || musicUrl) {
    return runSmartBeatMontage({
      media,
      audioTrackUrl: musicUrl,
      targetDuration: overrideDuration || template.aiRules.targetDuration,
      fastMode,
      signal,
      onProgress,
    });
  }

  // Otherwise standard smart moment selection
  return runSmartBeatMontage({
    media,
    targetDuration: overrideDuration || template.aiRules.targetDuration || 30,
    fastMode,
    minShotDuration: template.aiRules.minClipSec || 0.8,
    maxShotDuration: template.aiRules.maxClipSec || 4.0,
    signal,
    onProgress,
  });
}
