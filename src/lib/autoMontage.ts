// AI Auto-Montage Engine with Beat Detection & Vision Analysis
import type { SmartTemplate } from "./smartTemplates";
import type { Clip, MediaItem, FilterItem, VfxItem, Caption, CaptionStyle } from "@/context/MediaContext";
import { calculateSegmentAudioEnergy, analyzeAudioTrack } from "./beatDetector";
import { analyzeFrameVision, computeVisionSegmentScore, type VisionFrameAnalysis } from "./visionAnalyzer";

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

// High-performance cache for analyzed segments to ensure instantaneous subsequent runs
const videoAnalysisCache = new Map<string, Segment[]>();

async function analyzeVideoAdvanced(
  video: HTMLVideoElement, 
  url: string, 
  segmentSec: number, 
  duration: number,
  fastMode: boolean = false
): Promise<Segment[]> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { resolve([]); return; }
    canvas.width = 128; 
    canvas.height = 128;

    const v = video; 
    v.preload = "auto"; 
    v.muted = true; 
    v.src = url;

    const segments: Segment[] = [];
    const maxSegments = fastMode ? 6 : 12;
    const segCount = Math.min(maxSegments, Math.max(1, Math.floor(duration / segmentSec)));
    const actualSegmentSec = duration / segCount;

    const sampleTimes: number[] = [];
    if (fastMode) {
      // In fast mode (GoPro Quick style), sample 1 keyframe per segment for maximum speed
      for (let i = 0; i < segCount; i++) { 
        sampleTimes.push(i * actualSegmentSec + actualSegmentSec * 0.5); 
      }
    } else {
      for (let i = 0; i < segCount; i++) { 
        sampleTimes.push(i * actualSegmentSec); 
        sampleTimes.push(i * actualSegmentSec + actualSegmentSec * 0.5); 
      }
    }
    
    let sampleIdx = 0;
    const frameData: { 
      time: number; 
      brightness: number; 
      colorfulness: number; 
      pixels: Uint8ClampedArray | null;
      vision: VisionFrameAnalysis;
    }[] = [];
    
    const processFrame = async () => {
      if (sampleIdx >= sampleTimes.length) {
        // Calculate audio energy for each segment concurrently
        const audioPromises = Array.from({ length: segCount }, (_, i) => 
          calculateSegmentAudioEnergy(url, i * actualSegmentSec, Math.min((i + 1) * actualSegmentSec, duration))
        );
        const audioEnergies = await Promise.all(audioPromises);

        for (let i = 0; i < segCount; i++) {
          const f1 = fastMode ? frameData[i] : frameData[i * 2];
          const f2 = fastMode ? frameData[i] : frameData[i * 2 + 1];
          if (!f1) continue;

          let motion = 0.5;
          if (f1.pixels && f2?.pixels) { 
            let diff = 0; 
            for (let p = 0; p < f1.pixels.length; p += 32) {
              diff += Math.abs(f1.pixels[p] - f2.pixels[p]); 
            }
            motion = Math.min(1, diff / (f1.pixels.length / 32 * 255)); 
          }

          // Compute vision score (faces + hands + hand velocity)
          const visionScores = computeVisionSegmentScore(f2 ? [f1.vision, f2.vision] : [f1.vision]);

          segments.push({ 
            mediaId: "", 
            in: i * actualSegmentSec, 
            out: Math.min((i + 1) * actualSegmentSec, duration), 
            score: 0, 
            motion, 
            audioEnergy: audioEnergies[i] ?? 0.5,
            faceScore: visionScores.faceScore,
            handScore: visionScores.handScore,
            handVelocityScore: visionScores.handVelocityScore,
            brightness: f2 ? (f1.brightness + f2.brightness) / 2 : f1.brightness, 
            colorfulness: f2 ? (f1.colorfulness + f2.colorfulness) / 2 : f1.colorfulness
          });
        }
        resolve(segments); 
        return;
      }
      v.currentTime = Math.min(sampleTimes[sampleIdx], duration - 0.05);
    };

    v.addEventListener("seeked", async () => {
      try {
        ctx.drawImage(v, 0, 0, 128, 128);
        const pixels = ctx.getImageData(0, 0, 128, 128).data;
        let brightnessSum = 0, colorSum = 0;
        for (let p = 0; p < pixels.length; p += 8) { 
          const r = pixels[p], g = pixels[p+1], b = pixels[p+2]; 
          brightnessSum += (0.299*r+0.587*g+0.114*b)/255; 
          colorSum += (Math.max(r,g,b)-Math.min(r,g,b))/255; 
        }
        const n = pixels.length / 8;
        
        // Analyze face and hands for this frame
        const vision = await analyzeFrameVision(canvas);

        frameData.push({ 
          time: sampleTimes[sampleIdx], 
          brightness: brightnessSum/n, 
          colorfulness: colorSum/n, 
          pixels: new Uint8ClampedArray(pixels),
          vision
        });
      } catch { 
        frameData.push({ 
          time: sampleTimes[sampleIdx], 
          brightness: 0.5, 
          colorfulness: 0.3, 
          pixels: null,
          vision: { faceCount: 0, faceConfidence: 0, hasHands: false, handCount: 0, handPositions: [] }
        }); 
      }
      sampleIdx++; 
      // Yield to main thread
      setTimeout(() => {
        void processFrame();
      }, fastMode ? 2 : 10);
    });

    v.addEventListener("error", () => {
      try { v.src = ""; v.load(); } catch {}
      resolve([]);
    });
    v.load(); 
    void processFrame();
  });
}

export async function runAutoMontage(
  media: MediaItem[], 
  template: SmartTemplate, 
  existingClips: Clip[],
  musicTrackUrl?: string,
  options?: { fastMode?: boolean; targetDuration?: number }
): Promise<MontageResult> {
  const fastMode = options?.fastMode ?? true;
  const customTargetDuration = options?.targetDuration;
  const ai = { ...template.ai };
  if (customTargetDuration && customTargetDuration > 0) {
    ai.targetDuration = customTargetDuration;
  }
  const segments: Segment[] = [];

  // 1. Optional Beat Detection
  let beatTimes: number[] = [];
  if (musicTrackUrl || ai.musicSync) {
    const targetUrl = musicTrackUrl || media.find(m => m.type === "audio")?.url;
    if (targetUrl) {
      const beatRes = await analyzeAudioTrack(targetUrl);
      if (beatRes && beatRes.beatTimes.length > 0) {
        beatTimes = beatRes.beatTimes;
      }
    }
  }

  // 2. Segment Analysis
  if (existingClips.length > 0) {
    for (const c of existingClips) {
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
    // Process media items sequentially to prevent UI freezing & video decoder contention
    for (const m of media) {
      if (m.type === "video" && m.duration > 1) {
        const cacheKey = `${m.url}_${m.duration}`;
        if (videoAnalysisCache.has(cacheKey)) {
          const cached = videoAnalysisCache.get(cacheKey)!;
          segments.push(...cached.map(s => ({ ...s, mediaId: m.id })));
        } else {
          const v = document.createElement("video");
          const segLen = template.segmentSec > 0 ? template.segmentSec : 3;
          const segs = await analyzeVideoAdvanced(v, m.url, segLen, m.duration, fastMode);
          try { v.src = ""; v.load(); } catch {}
          videoAnalysisCache.set(cacheKey, segs);
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
      await new Promise(r => setTimeout(r, 20));
    }
  }

  // 3. Auto-detect face presence across entire video set
  const maxFaceScoreInProject = Math.max(...segments.map(s => s.faceScore), 0);
  const hasFacesDetected = maxFaceScoreInProject > 0.15;

  // 4. Weighted Scoring Matrix
  for (const seg of segments) { 
    if (hasFacesDetected) {
      // Vlog / Talking Head / People Mode
      seg.score = 
        seg.motion * ai.motionWeight +
        seg.audioEnergy * 0.25 +
        seg.faceScore * Math.max(0.35, ai.faceWeight) +
        seg.handVelocityScore * 0.15 +
        seg.brightness * ai.brightnessWeight +
        seg.colorfulness * ai.colorWeight;
    } else {
      // Hands-only / Crafts / Cooking / Drawing / Product Showcase Mode
      seg.score = 
        seg.motion * (ai.motionWeight + 0.15) +
        seg.audioEnergy * 0.25 +
        seg.handVelocityScore * 0.40 + // High weight for active hand movement (cutting, drawing, stirring)
        seg.handScore * 0.10 +
        seg.brightness * ai.brightnessWeight +
        seg.colorfulness * ai.colorWeight;
    }
  }

  const sorted = [...segments].sort((a, b) => b.score - a.score);

  // 5. Select Best Segments and calculate cut durations (with beat-alignment if available)
  let selected: Segment[];
  if (ai.targetDuration > 0) {
    let totalDur = 0; 
    selected = [];

    for (const seg of sorted) { 
      if (totalDur >= ai.targetDuration) break; 
      
      let clipLen = Math.min(seg.out - seg.in, ai.maxClipSec);
      if (clipLen < ai.minClipSec) clipLen = ai.minClipSec;

      // Align clip length to beat markers if beat times are available
      if (beatTimes.length > 1) {
        const avgBeatInterval = (beatTimes[beatTimes.length - 1] - beatTimes[0]) / beatTimes.length;
        if (avgBeatInterval > 0.2) {
          // Snap duration to nearest 2, 4, or 8 beat interval
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
  fastMode?: boolean;
}

export async function runSmartBeatMontage({
  media,
  beatTimes,
  fastMode = true,
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

  // 1. Analyze candidate segments across all selected media items
  const allCandidateSegments: Segment[] = [];
  for (const m of validMedia) {
    if (m.type === "video" && m.duration > 0.5) {
      const cacheKey = `${m.url}_${m.duration}`;
      if (videoAnalysisCache.has(cacheKey)) {
        const cached = videoAnalysisCache.get(cacheKey)!;
        allCandidateSegments.push(...cached.map((s) => ({ ...s, mediaId: m.id })));
      } else {
        const v = document.createElement("video");
        const segs = await analyzeVideoAdvanced(v, m.url, 1.5, m.duration, fastMode);
        try { v.src = ""; v.load(); } catch {}
        videoAnalysisCache.set(cacheKey, segs);
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

  // 2. Multi-Signal Weighted Scoring Matrix
  const maxFaceScoreInProject = Math.max(...allCandidateSegments.map((s) => s.faceScore), 0);
  const hasFacesDetected = maxFaceScoreInProject > 0.15;

  for (const seg of allCandidateSegments) {
    if (hasFacesDetected) {
      seg.score =
        seg.motion * 0.25 +
        seg.audioEnergy * 0.20 +
        seg.faceScore * 0.35 +
        seg.handVelocityScore * 0.10 +
        seg.brightness * 0.05 +
        seg.colorfulness * 0.05;
    } else {
      seg.score =
        seg.motion * 0.35 +
        seg.audioEnergy * 0.20 +
        seg.handVelocityScore * 0.25 +
        seg.handScore * 0.10 +
        seg.brightness * 0.05 +
        seg.colorfulness * 0.05;
    }
  }

  // Sort candidates by score descending
  const sortedCandidates = [...allCandidateSegments].sort((a, b) => b.score - a.score);

  // 3. Construct beat slots from beatTimes
  const sortedBeats = Array.from(new Set(beatTimes.filter((b) => b > 0.05))).sort((a, b) => a - b);
  const slots: { in: number; out: number; dur: number }[] = [];
  let prevBeat = 0;
  for (const b of sortedBeats) {
    const dur = b - prevBeat;
    if (dur >= 0.15) {
      slots.push({ in: prevBeat, out: b, dur });
      prevBeat = b;
    }
  }

  if (slots.length === 0) {
    slots.push({ in: 0, out: 3, dur: 3 });
  }

  // Track media item usage pointers and last used media ID to alternate between clips
  const mediaUsageMap = new Map<string, number>();
  validMedia.forEach((m) => mediaUsageMap.set(m.id, 0));
  let lastMediaId = "";

  const finalClips: Clip[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const targetDur = slot.dur;

    // Pick candidate media item using multi-signal top segment score + multi-clip diversity bonus
    let bestMedia: MediaItem | null = null;
    let bestSeg: Segment | null = null;
    let bestCombinedScore = -1;

    for (const m of validMedia) {
      const candidatesForM = sortedCandidates.filter((s) => s.mediaId === m.id);
      const topCand = candidatesForM[0];
      const baseScore = topCand ? topCand.score : 0.2;

      // Diversity bonus for switching media items so beat cuts alternate between uploaded media
      const diversityBonus = m.id !== lastMediaId ? 0.35 : 0;
      const combinedScore = baseScore + diversityBonus;

      if (combinedScore > bestCombinedScore) {
        bestCombinedScore = combinedScore;
        bestMedia = m;
        bestSeg = topCand || null;
      }
    }

    if (!bestMedia) bestMedia = validMedia[0];

    const mediaDur = bestMedia.duration || 5;
    const currentUsage = mediaUsageMap.get(bestMedia.id) || 0;

    let segIn = 0;
    if (bestSeg && bestSeg.in >= 0) {
      segIn = bestSeg.in;
    } else {
      segIn = currentUsage;
    }

    // Ensure segIn + targetDur does not exceed media duration
    if (segIn + targetDur > mediaDur) {
      segIn = Math.max(0, mediaDur - targetDur);
    }

    const segOut = Math.min(segIn + targetDur, mediaDur);
    const actualDur = Math.max(0.1, segOut - segIn);

    finalClips.push({
      id: `beat-clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      mediaId: bestMedia.id,
      in: segIn,
      out: segOut,
      transitionIn: i > 0 && i % 4 === 0 ? { type: "fade", duration: 0.15 } : undefined,
    });

    mediaUsageMap.set(bestMedia.id, segIn + actualDur);
    lastMediaId = bestMedia.id;
  }

  const totalDur = finalClips.reduce((acc, c) => acc + (c.out - c.in), 0);
  const avgScore = allCandidateSegments.length > 0 ? allCandidateSegments.reduce((a, s) => a + s.score, 0) / allCandidateSegments.length : 0;

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
