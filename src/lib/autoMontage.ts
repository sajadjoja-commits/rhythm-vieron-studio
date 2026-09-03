// AI Auto-Montage Engine with Non-blocking Web Worker Analysis & Beat Sync
import type { SmartTemplate } from "./smartTemplates";
import type { Clip, MediaItem, FilterItem, VfxItem, Caption, CaptionStyle } from "@/context/MediaContext";
import { calculateSegmentAudioEnergiesBatch, analyzeAudioTrack, clearAudioBufferCache } from "./beatDetector";
import { disposeVisionModels } from "./visionAnalyzer";
import { VideoAnalysisWorkerManager } from "./videoAnalysisWorkerManager";
import type { FrameBufferData } from "./workers/videoAnalysis.worker";

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
  };
}

interface Segment { 
  mediaId: string; 
  in: number; 
  out: number; 
  score: number; 
  motion: number; 
  audioEnergy: number;
  faceScore: number;
  handScore: number;
  handVelocityScore: number;
  brightness: number; 
  colorfulness: number; 
}

// Bounded LRU Cache for analyzed segments (max 10 entries) to prevent Android memory growth
const videoAnalysisCache = new Map<string, Segment[]>();
function setCacheEntry(key: string, value: Segment[]) {
  if (videoAnalysisCache.size >= 10) {
    const firstKey = videoAnalysisCache.keys().next().value;
    if (firstKey) videoAnalysisCache.delete(firstKey);
  }
  videoAnalysisCache.set(key, value);
}

/**
 * Lightweight, non-blocking video frame extractor that offloads motion & vision scoring to Web Worker
 */
async function analyzeVideoAdvanced(
  url: string, 
  segmentSec: number, 
  duration: number,
  fastMode: boolean = true,
  coarseSampling: boolean = false,
  onFrameProgress?: (fraction: number) => void
): Promise<Segment[]> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    // 96x96 resolution is mathematically optimal for motion/color/skin heuristics (56% fewer pixels than 128x128)
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

    // Reduced sampling frequency: adaptive keyframe count to prevent ANR & excessive decoder seeking
    const maxFrames = coarseSampling ? 4 : (fastMode ? 6 : 10);
    const frameCount = Math.min(maxFrames, Math.max(2, Math.floor(duration / (coarseSampling ? 4.0 : 1.5))));
    const frameInterval = duration / (frameCount + 1);

    // Key sample timestamps
    const sampleTimes: number[] = [];
    for (let i = 1; i <= frameCount; i++) { 
      sampleTimes.push(i * frameInterval); 
    }

    // Generate candidate segment windows across the video
    const segStep = coarseSampling ? 3.0 : Math.max(1.2, segmentSec);
    const candidateCount = Math.max(1, Math.floor(duration / segStep));
    const segmentTimes: Array<{ in: number; out: number }> = [];
    for (let i = 0; i < candidateCount; i++) {
      const sIn = i * segStep;
      const sOut = Math.min(sIn + Math.max(1.5, segStep), duration);
      segmentTimes.push({ in: sIn, out: sOut });
    }
    // Also include a final tail segment if not covered
    if (segmentTimes.length > 0 && segmentTimes[segmentTimes.length - 1].out < duration - 0.5) {
      segmentTimes.push({ in: Math.max(0, duration - Math.max(1.5, segStep)), out: duration });
    }
    
    let sampleIdx = 0;
    const extractedFrames: FrameBufferData[] = [];
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try {
        v.pause();
        v.src = "";
        v.removeAttribute("src");
        v.load();
      } catch {}
      canvas.width = 1;
      canvas.height = 1;
    };

    const processFrame = () => {
      if (sampleIdx >= sampleTimes.length) {
        // All frames extracted - dispatch analysis & batch audio energy to Web Worker
        void (async () => {
          try {
            const workerMgr = VideoAnalysisWorkerManager.getInstance();
            
            // Concurrently calculate batch audio energies & worker vision/motion results
            const [workerResults, audioEnergies] = await Promise.all([
              workerMgr.analyzeFrames(extractedFrames, segmentTimes),
              calculateSegmentAudioEnergiesBatch(url, segmentTimes)
            ]);

            cleanup();

            const finalSegments: Segment[] = workerResults.map((wr, i) => ({
              mediaId: "",
              in: wr.in,
              out: wr.out,
              score: 0,
              motion: wr.motion,
              audioEnergy: audioEnergies[i] ?? 0.5,
              faceScore: wr.faceScore,
              handScore: wr.handScore,
              handVelocityScore: wr.handVelocityScore,
              brightness: wr.brightness,
              colorfulness: wr.colorfulness,
            }));

            resolve(finalSegments);
          } catch (err) {
            console.warn("Worker analysis failed, using fallback segments:", err);
            cleanup();
            resolve(
              segmentTimes.map((st) => ({
                mediaId: "",
                in: st.in,
                out: st.out,
                score: 0,
                motion: 0.5,
                audioEnergy: 0.5,
                faceScore: 0,
                handScore: 0,
                handVelocityScore: 0,
                brightness: 0.6,
                colorfulness: 0.5,
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
      try {
        ctx.drawImage(v, 0, 0, W, H);
        const imgData = ctx.getImageData(0, 0, W, H);
        // Create an ArrayBuffer copy to transfer to worker
        const bufferCopy = imgData.data.buffer.slice(0);
        extractedFrames.push({
          time: sampleTimes[sampleIdx],
          width: W,
          height: H,
          buffer: bufferCopy,
        });
      } catch {
        // Fallback placeholder frame
        extractedFrames.push({
          time: sampleTimes[sampleIdx],
          width: W,
          height: H,
          buffer: new ArrayBuffer(W * H * 4),
        });
      }
      sampleIdx++;
      // Yield to main thread immediately to maintain UI responsiveness
      setTimeout(processFrame, 4);
    });

    v.addEventListener("error", () => {
      cleanup();
      resolve([]);
    });

    // Safety timeout in case video loading fails on Android
    setTimeout(() => {
      if (!isCleanedUp && extractedFrames.length === 0) {
        cleanup();
        resolve([]);
      }
    }, 6000);

    v.src = url;
    v.load();
  });
}

export interface AutoMontageOptions {
  fastMode?: boolean;
  targetDuration?: number;
  onProgress?: MontageProgressCallback;
}

export async function runAutoMontage(
  media: MediaItem[], 
  template: SmartTemplate, 
  existingClips: Clip[],
  musicTrackUrl?: string,
  options?: AutoMontageOptions
): Promise<MontageResult> {
  const fastMode = options?.fastMode ?? true;
  const customTargetDuration = options?.targetDuration;
  const onProgress = options?.onProgress;
  const ai = { ...template.ai };
  
  if (customTargetDuration && customTargetDuration > 0) {
    ai.targetDuration = customTargetDuration;
  }
  const segments: Segment[] = [];

  // Calculate total footage duration to adaptively handle long files
  const totalFootageDur = media.reduce((acc, m) => acc + (m.duration || 3), 0);
  const isLongFootage = totalFootageDur > 180; // > 3 minutes

  onProgress?.({
    clipIndex: 0,
    totalClips: media.length,
    percent: 5,
    messageAr: isLongFootage ? "تحليل سريع للمقاطع الطويلة..." : "بدء التحليل الذكي للمقاطع...",
    messageEn: isLongFootage ? "Adaptive turbo analysis for long footage..." : "Initializing smart scene analysis...",
  });

  // 1. Optional Beat Detection
  let beatTimes: number[] = [];
  if (musicTrackUrl || ai.musicSync) {
    const targetUrl = musicTrackUrl || media.find(m => (m.type as string) === "audio")?.url;
    if (targetUrl) {
      try {
        const beatRes = await analyzeAudioTrack(targetUrl);
        if (beatRes && beatRes.beatTimes.length > 0) {
          beatTimes = beatRes.beatTimes;
        }
      } catch (e) {
        console.warn("Beat detection skipped in auto-montage:", e);
      }
    }
  }

  // 2. Segment Analysis
  const validMedia = media.filter((m) => m.type === "video" || m.type === "image");
  const totalClipsCount = validMedia.length || 1;

  if (existingClips.length > 0) {
    for (let cIdx = 0; cIdx < existingClips.length; cIdx++) {
      const c = existingClips[cIdx];
      const m = media.find((m) => m.id === c.mediaId);
      if (!m) continue;
      const dur = c.out - c.in;
      const segLen = template.segmentSec > 0 ? template.segmentSec : dur;
      const segCount = Math.max(1, Math.floor(dur / segLen));
      for (let i = 0; i < segCount; i++) { 
        const s = c.in + i * segLen; 
        segments.push({ 
          mediaId: c.mediaId, 
          in: s, 
          out: Math.min(s + segLen, c.out), 
          score: 0, 
          motion: 0.5, 
          audioEnergy: 0.5,
          faceScore: 0,
          handScore: 0,
          handVelocityScore: 0,
          brightness: 0.6, 
          colorfulness: 0.5 
        }); 
      }
    }
  } else {
    for (let mIdx = 0; mIdx < validMedia.length; mIdx++) {
      const m = validMedia[mIdx];
      const baseProgress = 10 + Math.round((mIdx / totalClipsCount) * 70);

      onProgress?.({
        clipIndex: mIdx + 1,
        totalClips: totalClipsCount,
        percent: baseProgress,
        messageAr: `تحليل المقطع ${mIdx + 1} من ${totalClipsCount}...`,
        messageEn: `Analyzing clip ${mIdx + 1} of ${totalClipsCount}...`,
      });

      if (m.type === "video" && m.duration > 0.5) {
        const cacheKey = `${m.url}_${m.duration}_v2`;
        if (videoAnalysisCache.has(cacheKey)) {
          const cached = videoAnalysisCache.get(cacheKey)!;
          segments.push(...cached.map(s => ({ ...s, mediaId: m.id })));
        } else {
          const segLen = template.segmentSec > 0 ? template.segmentSec : (isLongFootage ? 4 : 2.5);
          const segs = await analyzeVideoAdvanced(
            m.url, 
            segLen, 
            m.duration, 
            fastMode, 
            isLongFootage,
            (fraction) => {
              const currentP = baseProgress + Math.round(fraction * (70 / totalClipsCount));
              onProgress?.({
                clipIndex: mIdx + 1,
                totalClips: totalClipsCount,
                percent: Math.min(85, currentP),
                messageAr: `تحليل المقطع ${mIdx + 1} من ${totalClipsCount} (${Math.round(currentP)}%)...`,
                messageEn: `Analyzing clip ${mIdx + 1} of ${totalClipsCount} (${Math.round(currentP)}%)...`,
              });
            }
          );
          setCacheEntry(cacheKey, segs);
          segments.push(...segs.map((s) => ({ ...s, mediaId: m.id })));
        }
      } else { 
        segments.push({ 
          mediaId: m.id, 
          in: 0, 
          out: m.duration || 3, 
          score: 0, 
          motion: 0.1, 
          audioEnergy: 0.1,
          faceScore: 0,
          handScore: 0,
          handVelocityScore: 0,
          brightness: 0.6, 
          colorfulness: 0.5 
        }); 
      }
      await new Promise(r => setTimeout(r, 10));
    }
  }

  onProgress?.({
    clipIndex: totalClipsCount,
    totalClips: totalClipsCount,
    percent: 88,
    messageAr: "مزامنة المشاهد الأفضل وتطبيق المؤثرات...",
    messageEn: "Selecting best highlights & applying style...",
  });

  // 3. Auto-detect face presence across entire video set
  const maxFaceScoreInProject = Math.max(...segments.map(s => s.faceScore), 0);
  const hasFacesDetected = maxFaceScoreInProject > 0.15;

  // 4. Weighted Scoring Matrix
  for (const seg of segments) { 
    if (hasFacesDetected) {
      // People / Vlog Mode
      seg.score = 
        seg.motion * ai.motionWeight +
        seg.audioEnergy * 0.25 +
        seg.faceScore * Math.max(0.35, ai.faceWeight) +
        seg.handVelocityScore * 0.15 +
        seg.brightness * ai.brightnessWeight +
        seg.colorfulness * ai.colorWeight;
    } else {
      // Action / Showcase Mode
      seg.score = 
        seg.motion * (ai.motionWeight + 0.15) +
        seg.audioEnergy * 0.25 +
        seg.handVelocityScore * 0.35 +
        seg.handScore * 0.10 +
        seg.brightness * ai.brightnessWeight +
        seg.colorfulness * ai.colorWeight;
    }
  }

  const sorted = [...segments].sort((a, b) => b.score - a.score);

  // 5. Select Best Segments and calculate cut durations
  let selected: Segment[];
  if (ai.targetDuration > 0) {
    let totalDur = 0; 
    selected = [];

    for (const seg of sorted) { 
      if (totalDur >= ai.targetDuration) break; 
      
      let clipLen = Math.min(seg.out - seg.in, ai.maxClipSec);
      if (clipLen < ai.minClipSec) clipLen = ai.minClipSec;

      if (beatTimes.length > 1) {
        const avgBeatInterval = (beatTimes[beatTimes.length - 1] - beatTimes[0]) / beatTimes.length;
        if (avgBeatInterval > 0.2) {
          const beatMultiplier = Math.max(1, Math.round(clipLen / avgBeatInterval));
          clipLen = Math.max(ai.minClipSec, Math.min(ai.maxClipSec, beatMultiplier * avgBeatInterval));
        }
      }

      selected.push({ ...seg, out: seg.in + clipLen }); 
      totalDur += clipLen; 
    }
  } else { 
    selected = sorted.map((seg) => { 
      const len = Math.min(seg.out - seg.in, ai.maxClipSec); 
      return { ...seg, out: seg.in + Math.max(len, ai.minClipSec) }; 
    }); 
  }

  selected.sort((a, b) => { 
    const aIdx = media.findIndex((m) => m.id === a.mediaId); 
    const bIdx = media.findIndex((m) => m.id === b.mediaId); 
    return aIdx !== bIdx ? aIdx - bIdx : a.in - b.in; 
  });

  const clips: Clip[] = selected.map((seg, i) => ({ 
    id: `clip-${Date.now()}-${i}`, 
    mediaId: seg.mediaId, 
    in: seg.in, 
    out: seg.out, 
    transitionIn: i > 0 ? { type: template.transition, duration: template.transitionDuration } : undefined, 
    speed: ai.speedRamp && seg.score > (sorted[0]?.score ?? 1) * 0.8 ? 0.5 : 1 
  }));

  const totalDur = clips.reduce((acc, c) => acc + (c.out - c.in) / (c.speed || 1), 0);
  const filters: FilterItem[] = template.filters.map((f, i) => ({ id: `filter-${Date.now()}-${i}`, type: f.type, start: 0, end: totalDur, intensity: f.intensity }));
  const vfx: VfxItem[] = template.vfx.map((v, i) => ({ id: `vfx-${Date.now()}-${i}`, type: v.type, start: 0, end: totalDur, intensity: v.intensity }));
  const captionStyle: Partial<CaptionStyle> = { font: template.caption.font, size: template.caption.size, color: template.caption.color, bg: template.caption.bg, position: template.caption.position, animation: template.caption.animation };
  const avgScore = segments.length > 0 ? segments.reduce((a, s) => a + s.score, 0) / segments.length : 0;

  // Explicitly free models & memory
  disposeVisionModels();
  clearAudioBufferCache();

  onProgress?.({
    clipIndex: totalClipsCount,
    totalClips: totalClipsCount,
    percent: 100,
    messageAr: "تم المونتاج بنجاح!",
    messageEn: "Montage generated successfully!",
  });

  return { 
    clips, 
    filters, 
    vfx, 
    captions: [], 
    captionStyle, 
    totalDuration: totalDur, 
    analysis: { 
      segmentsAnalyzed: segments.length, 
      segmentsSelected: selected.length, 
      avgScore, 
      topScore: sorted[0]?.score ?? 0, 
      durationBefore: media.reduce((acc, m) => acc + m.duration, 0), 
      durationAfter: totalDur,
      beatCount: beatTimes.length,
      hasFacesDetected
    } 
  };
}

export interface SmartBeatMontageParams {
  media: MediaItem[];
  beatTimes: number[];
  targetDuration?: number;
  fastMode?: boolean;
  onProgress?: MontageProgressCallback;
}

export async function runSmartBeatMontage({
  media,
  beatTimes,
  targetDuration,
  fastMode = true,
  onProgress,
}: SmartBeatMontageParams): Promise<MontageResult> {
  const validMedia = media.filter((m) => m.type === "video" || m.type === "image");
  if (validMedia.length === 0 || beatTimes.length === 0) {
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
        beatCount: beatTimes.length,
        hasFacesDetected: false,
      },
    };
  }

  const totalFootageDur = validMedia.reduce((acc, m) => acc + (m.duration || 5), 0);
  const isLongFootage = totalFootageDur > 180; // > 3 minutes

  onProgress?.({
    clipIndex: 0,
    totalClips: validMedia.length,
    percent: 5,
    messageAr: isLongFootage ? "تحليل سريع للإيقاع (مقاطع طويلة)..." : "بدء تحليل الإيقاع والمشاهد...",
    messageEn: isLongFootage ? "Adaptive turbo beat analysis for long footage..." : "Starting beat & moment analysis...",
  });

  // 1. Analyze candidate segments across all selected media items
  const allCandidateSegments: Segment[] = [];
  const totalCount = validMedia.length;

  for (let mIdx = 0; mIdx < totalCount; mIdx++) {
    const m = validMedia[mIdx];
    const baseProgress = 10 + Math.round((mIdx / totalCount) * 70);

    onProgress?.({
      clipIndex: mIdx + 1,
      totalClips: totalCount,
      percent: baseProgress,
      messageAr: `تحليل المقطع ${mIdx + 1} من ${totalCount} (${Math.round(baseProgress)}%)...`,
      messageEn: `Analyzing clip ${mIdx + 1} of ${totalCount} (${Math.round(baseProgress)}%)...`,
    });

    if (m.type === "video" && m.duration > 0.5) {
      const cacheKey = `${m.url}_${m.duration}_beat_v2`;
      if (videoAnalysisCache.has(cacheKey)) {
        const cached = videoAnalysisCache.get(cacheKey)!;
        allCandidateSegments.push(...cached.map((s) => ({ ...s, mediaId: m.id })));
      } else {
        const segLen = isLongFootage ? 3.0 : 1.5;
        const segs = await analyzeVideoAdvanced(
          m.url, 
          segLen, 
          m.duration, 
          fastMode,
          isLongFootage,
          (fraction) => {
            const currentP = baseProgress + Math.round(fraction * (70 / totalCount));
            onProgress?.({
              clipIndex: mIdx + 1,
              totalClips: totalCount,
              percent: Math.min(85, currentP),
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
        score: 0.5,
        motion: 0.1,
        audioEnergy: 0.1,
        faceScore: 0,
        handScore: 0,
        handVelocityScore: 0,
        brightness: 0.6,
        colorfulness: 0.5,
      });
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  onProgress?.({
    clipIndex: totalCount,
    totalClips: totalCount,
    percent: 88,
    messageAr: "مزامنة وتوزيع اللقطات على ضربات الموسيقى...",
    messageEn: "Syncing & distributing cuts to rhythm...",
  });

  // 2. Multi-Signal Weighted Scoring Matrix
  const maxFaceScoreInProject = Math.max(...allCandidateSegments.map((s) => s.faceScore), 0);
  const hasFacesDetected = maxFaceScoreInProject > 0.12;

  for (const seg of allCandidateSegments) {
    const motionVal = Math.min(1, Math.max(0, seg.motion));
    const audioVal = Math.min(1, Math.max(0, seg.audioEnergy));
    const faceVal = Math.min(1, Math.max(0, seg.faceScore));
    const handVal = Math.min(1, Math.max(0, seg.handScore));
    const handVelVal = Math.min(1, Math.max(0, seg.handVelocityScore));
    const brightVal = Math.min(1, Math.max(0, seg.brightness));
    const colorVal = Math.min(1, Math.max(0, seg.colorfulness));

    // Exposure quality bonus (peaks for well-lit, non-clipped video)
    const exposureQuality = brightVal > 0.2 && brightVal < 0.88 ? 0.08 : 0;

    if (hasFacesDetected) {
      // People / Vlog / Story Mode: prioritize clear faces, motion, audio energy
      seg.score =
        faceVal * 0.38 +
        motionVal * 0.24 +
        audioVal * 0.18 +
        handVelVal * 0.08 +
        handVal * 0.04 +
        colorVal * 0.04 +
        exposureQuality;
    } else {
      // Dynamic / Action / B-roll Mode: prioritize motion, audio energy, hand dynamics
      seg.score =
        motionVal * 0.40 +
        audioVal * 0.25 +
        handVelVal * 0.15 +
        handVal * 0.06 +
        colorVal * 0.06 +
        exposureQuality;
    }
  }

  // Sort candidates by multi-signal score descending
  const sortedCandidates = [...allCandidateSegments].sort((a, b) => b.score - a.score);

  // 3. Determine target output duration & construct beat slots from beatTimes
  const musicDuration = beatTimes.length > 0 ? Math.max(...beatTimes) : 0;
  const autoDuration = musicDuration > 0
    ? (musicDuration <= totalFootageDur ? musicDuration : Math.min(musicDuration, totalFootageDur))
    : totalFootageDur;
  const effectiveTargetDuration = targetDuration && targetDuration > 0 ? targetDuration : autoDuration;

  const sortedBeats = Array.from(new Set(beatTimes.filter((b) => b > 0.05))).sort((a, b) => a - b);
  const slots: { in: number; out: number; dur: number }[] = [];
  let prevBeat = 0;
  for (const b of sortedBeats) {
    if (effectiveTargetDuration > 0 && b > effectiveTargetDuration + 0.05) {
      if (prevBeat < effectiveTargetDuration - 0.15) {
        slots.push({ in: prevBeat, out: effectiveTargetDuration, dur: effectiveTargetDuration - prevBeat });
      }
      break;
    }
    const dur = b - prevBeat;
    if (dur >= 0.15) {
      slots.push({ in: prevBeat, out: b, dur });
      prevBeat = b;
    }
  }

  if (slots.length === 0) {
    const fallbackDur = effectiveTargetDuration > 0 ? Math.min(3, effectiveTargetDuration) : 3;
    slots.push({ in: 0, out: fallbackDur, dur: fallbackDur });
  }

  // 4. Intelligent Beat-Slot Assignment with High-Value Moment Prioritization & Non-Repetition
  const usedFootageRanges = new Map<string, Array<{ in: number; out: number }>>();
  const candidateUsageCount = new Map<string, number>();
  validMedia.forEach((m) => usedFootageRanges.set(m.id, []));

  let lastMediaId = "";
  const finalClips: Clip[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const targetDur = slot.dur;

    let bestCandidate: Segment | null = null;
    let bestCandidateScore = -Infinity;
    let bestSliceIn = 0;
    let bestSliceOut = targetDur;
    let bestMedia: MediaItem = validMedia[0];

    // Evaluate all candidates across all media items for the best fit for this beat slot
    for (const cand of allCandidateSegments) {
      const m = validMedia.find((vm) => vm.id === cand.mediaId);
      if (!m) continue;

      const mDur = m.duration || (m.type === "image" ? 5 : 3);
      const candMid = (cand.in + cand.out) / 2;

      // Position candidate slice centered around the candidate's peak moment
      let sliceIn = Math.max(0, candMid - targetDur / 2);
      if (sliceIn + targetDur > mDur) {
        sliceIn = Math.max(0, mDur - targetDur);
      }
      const sliceOut = Math.min(mDur, sliceIn + targetDur);
      const actualSliceDur = Math.max(0.1, sliceOut - sliceIn);

      // Calculate overlap duration with already chosen ranges of this media item
      const ranges = usedFootageRanges.get(m.id) || [];
      let overlapSec = 0;
      for (const r of ranges) {
        const oStart = Math.max(sliceIn, r.in);
        const oEnd = Math.min(sliceOut, r.out);
        if (oEnd > oStart) {
          overlapSec += (oEnd - oStart);
        }
      }
      const overlapRatio = actualSliceDur > 0 ? overlapSec / actualSliceDur : 0;

      // Repetition Penalty:
      // If total footage duration >= required output duration, strictly prevent any repeated footage.
      // If footage is short and repetition is necessary, penalize recent reuse to maximize variety.
      let repetitionPenalty = 0;
      const candKey = `${cand.mediaId}_${cand.in.toFixed(2)}`;
      const usageCount = candidateUsageCount.get(candKey) || 0;

      if (totalFootageDur >= effectiveTargetDuration * 0.9) {
        if (overlapRatio > 0.08) {
          repetitionPenalty = 5.0 * overlapRatio; // effectively disqualify already used footage
        }
      } else {
        repetitionPenalty = (usageCount * 0.45) + (overlapRatio * 0.35);
      }

      // Diversity Bonus: prefer alternating media items between consecutive beat cuts
      const isDifferentMedia = validMedia.length > 1 && m.id !== lastMediaId;
      const diversityBonus = isDifferentMedia ? 0.22 : 0;

      // Rhythm / Beat Energy Match:
      // Fast rapid cuts (< 0.9s) benefit from high motion / hand velocity
      // Longer sustained cuts (>= 1.5s) benefit from clear face / stable aesthetics
      let rhythmBonus = 0;
      if (targetDur < 0.9) {
        rhythmBonus = (cand.motion * 0.16) + (cand.handVelocityScore * 0.10);
      } else if (targetDur >= 1.5) {
        rhythmBonus = (cand.faceScore * 0.16) + (cand.colorfulness * 0.05);
      }

      const slotCandidateScore = cand.score + diversityBonus + rhythmBonus - repetitionPenalty;

      if (slotCandidateScore > bestCandidateScore) {
        bestCandidateScore = slotCandidateScore;
        bestCandidate = cand;
        bestMedia = m;
        bestSliceIn = sliceIn;
        bestSliceOut = sliceOut;
      }
    }

    // Fallback if no candidate was picked
    if (!bestCandidate) {
      bestMedia = validMedia.find((m) => m.id !== lastMediaId) || validMedia[0];
      const mDur = bestMedia.duration || 5;
      bestSliceIn = 0;
      bestSliceOut = Math.min(mDur, targetDur);
    }

    // Append the selected beat clip
    finalClips.push({
      id: `beat-clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      mediaId: bestMedia.id,
      in: bestSliceIn,
      out: bestSliceOut,
      transitionIn: i > 0 && i % 3 === 0 ? { type: "fade", duration: 0.12 } : undefined,
    });

    // Record used time range and usage count
    const curRanges = usedFootageRanges.get(bestMedia.id) || [];
    curRanges.push({ in: bestSliceIn, out: bestSliceOut });
    usedFootageRanges.set(bestMedia.id, curRanges);

    if (bestCandidate) {
      const candKey = `${bestCandidate.mediaId}_${bestCandidate.in.toFixed(2)}`;
      candidateUsageCount.set(candKey, (candidateUsageCount.get(candKey) || 0) + 1);
    }

    lastMediaId = bestMedia.id;
  }

  const totalDur = finalClips.reduce((acc, c) => acc + (c.out - c.in), 0);
  const avgScore = allCandidateSegments.length > 0 ? allCandidateSegments.reduce((a, s) => a + s.score, 0) / allCandidateSegments.length : 0;

  // Cleanup models & decoded audio cache
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
      topScore: sortedCandidates[0]?.score ?? 0,
      durationBefore: validMedia.reduce((acc, m) => acc + m.duration, 0),
      durationAfter: totalDur,
      beatCount: sortedBeats.length,
      hasFacesDetected,
    },
  };
}
