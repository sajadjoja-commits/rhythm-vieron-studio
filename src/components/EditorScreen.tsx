import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ArrowRight, Play, Pause, Scissors, Type, Music, Sparkles, Ratio, Download,
  Image as ImageIcon, Video, Plus, Wand2, Loader2, Palette, Activity, Layers,
  Gauge, Zap, Clapperboard, Undo2, Redo2, Eye, EyeOff, RotateCw, Diamond, Minus, Trash2, Maximize2,
} from "lucide-react";
import { useMedia, TransitionType, Clip, interpolateKeyframes } from "@/context/MediaContext";
import { computeVfxState } from "@/lib/vfxEngine";
import MediaPicker from "@/components/MediaPicker";
import Timeline from "@/components/editor/Timeline";
import SpeedPanel from "@/components/editor/SpeedPanel";
import SmartCutOverlay from "@/components/editor/SmartCutOverlay";
import CoverPicker from "@/components/editor/CoverPicker";
import TransitionPanel from "@/components/editor/TransitionPanel";
import CaptionPanel from "@/components/editor/CaptionPanel";
import CaptionOverlay from "@/components/editor/CaptionOverlay";
import CaptionTimeline from "@/components/editor/CaptionTimeline";
import TransitionFx from "@/components/editor/TransitionFx";
import AudioTimeline from "@/components/editor/AudioTimeline";
import AudioPlayback from "@/components/editor/AudioPlayback";
import MusicPanel from "@/components/editor/MusicPanel";
import FilterTimeline from "@/components/editor/FilterTimeline";
import VfxTimeline from "@/components/editor/VfxTimeline";
import FilterPanel from "@/components/editor/FilterPanel";
import VfxPanel from "@/components/editor/VfxPanel";
import OverlayTimeline from "@/components/editor/OverlayTimeline";
import OverlayPanel from "@/components/editor/OverlayPanel";
import InteractiveOverlay from "@/components/editor/InteractiveOverlay";
import ExportDialog from "@/components/editor/ExportDialog";
import PublishTemplateDialog from "@/components/editor/PublishTemplateDialog";
import RatioPanel from "@/components/editor/RatioPanel";
import CropOverlay from "@/components/editor/CropOverlay";
import { AIToolsPanel } from "@/components/editor/AIToolsPanel";
import { toast } from "sonner";
import { playSfx } from "@/lib/soundFx";
import { attachFxChain } from "@/lib/audioFx";
import { analyzeBeats, getAudioContext } from "@/lib/audioAnalysis";
import { t, getLang, isRTL } from "@/lib/i18n";
import { VireonLogo } from "@/components/VireonLogo";
import { ASPECT_RATIOS, findClosestRatioIndex } from "@/lib/aspectRatios";
import { VideoJobManager } from "@/ai/video";

interface EditorScreenProps {
  onBack: () => void;
}

type Tool = "transition" | "caption" | "music" | "filter" | "vfx" | "ratio" | "overlay" | "speed" | "cover" | "ai" | null;

// Which timeline track is focused — determines which handles are visible
type FocusedTrack = "video" | "caption" | "audio" | "filter" | "vfx" | "overlay" | null;

const EditorScreen = ({ onBack }: EditorScreenProps) => {
  const {
    media = [], clips = [], totalDuration, getMediaById, resolveTimelineTime,
    audioTracks = [], selectedAudioTrackId, setSelectedAudioTrackId, videoMuted, videoVolume, videoAudioFx, projectName, setProjectName,
    splitClipsAtBeats, filters = [], vfx = [], overlays = [], setAudioBeats, updateOverlay, setOverlays,
    splitTrackAt, coverImage, undo, redo, canUndo, canRedo, setClips,
    captions = [], captionStyle, setCaptions, setFilters, setVfx, updateAudioTrack, updateMediaItem,
    removeClip, removeCaption, removeAudioTrack, removeFilter, removeVfx, removeOverlay,
  } = useMedia();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showSmartCut, setShowSmartCut] = useState(false);
  const [activeRatio, setActiveRatio] = useState(0);
  const [userHasSetRatio, setUserHasSetRatio] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "blur">("contain");
  const [tool, setTool] = useState<Tool>(null);
  const [focusedTrack, setFocusedTrack] = useState<FocusedTrack>(null);
  const [transitionClipId, setTransitionClipId] = useState<string | null>(null);
  const [tlWidth, setTlWidth] = useState(360);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [detectingBeats, setDetectingBeats] = useState(false);
  const [beatProgress, setBeatProgress] = useState(0);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showPublishTemplateDialog, setShowPublishTemplateDialog] = useState(false);
  const [showCropOverlay, setShowCropOverlay] = useState(false);
  const [compareRaw, setCompareRaw] = useState(false); // real-time compare state
  const [showFrame, setShowFrame] = useState(false);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const overlayDragRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Dual-video ping-pong player elements to eliminate gapless buffer pauses across clip transitions
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const activeSlotRef = useRef<0 | 1>(0);
  const slot0ClipIdRef = useRef<string | null>(null);
  const slot1ClipIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Keep legacy videoRef reference pointing to active slot for external dialogs/tools
  useEffect(() => {
    videoRef.current = activeSlot === 0 ? videoRefA.current : videoRefB.current;
  }, [activeSlot]);
  const previewRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const lastTickRef = useRef<number>(0);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ 
    dist: number; 
    scale: number; 
    panX: number; 
    panY: number; 
    cx: number; 
    cy: number;
    angle: number;
    rotation: number;
  } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const hasMovedRef = useRef(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const hasMedia = media.length > 0 && clips.length > 0;
  const resolved = resolveTimelineTime(currentTime);
  const activeMedia = resolved ? getMediaById(resolved.clip.mediaId) : null;

  useEffect(() => {
    setMediaError(false);
  }, [activeMedia?.id]);

  const clipLocalTime = resolved ? currentTime - resolved.clipStart : 0;

  // Active clip-specific layout transformations with real-time keyframe interpolation
  const activeScale = useMemo(() => {
    if (!resolved?.clip) return 1;
    return interpolateKeyframes(resolved.clip, "scale", clipLocalTime, resolved.clip.scale ?? 1);
  }, [resolved?.clip, clipLocalTime]);

  const activePan = useMemo(() => {
    if (!resolved?.clip) return { x: 0, y: 0 };
    const x = interpolateKeyframes(resolved.clip, "panX", clipLocalTime, resolved.clip.panX ?? 0);
    const y = interpolateKeyframes(resolved.clip, "panY", clipLocalTime, resolved.clip.panY ?? 0);
    return { x, y };
  }, [resolved?.clip, clipLocalTime]);

  const activeRotation = useMemo(() => {
    if (!resolved?.clip) return 0;
    return interpolateKeyframes(resolved.clip, "rotation", clipLocalTime, resolved.clip.rotation ?? 0);
  }, [resolved?.clip, clipLocalTime]);

  const activeOpacity = useMemo(() => {
    if (!resolved?.clip) return 1;
    return interpolateKeyframes(resolved.clip, "opacity", clipLocalTime, resolved.clip.opacity ?? 1);
  }, [resolved?.clip, clipLocalTime]);

  const activeVolume = useMemo(() => {
    if (!resolved?.clip) return 1;
    return interpolateKeyframes(resolved.clip, "volume", clipLocalTime, resolved.clip.volume ?? 1);
  }, [resolved?.clip, clipLocalTime]);

  const activeFlipH = resolved?.clip.flipH ?? false;
  const activeFlipV = resolved?.clip.flipV ?? false;

  const cropStyle = useMemo(() => {
    if (!resolved?.clip) return {};
    const c = resolved.clip;
    if (c.cropX !== undefined && c.cropY !== undefined && c.cropW !== undefined && c.cropH !== undefined) {
      return {
        clipPath: `inset(${c.cropY}% ${100 - c.cropX - c.cropW}% ${100 - c.cropY - c.cropH}% ${c.cropX}%)`
      };
    }
    return {};
  }, [resolved?.clip]);

  const activeKfItem = useMemo(() => {
    switch (focusedTrack) {
      case "video":
        return resolved?.clip ? { id: resolved.clip.id, type: "video" as const, keyframes: resolved.clip.keyframes || [], localTime: clipLocalTime, defaultProps: { scale: resolved.clip.scale ?? 1, rotation: resolved.clip.rotation ?? 0, panX: resolved.clip.panX ?? 0, panY: resolved.clip.panY ?? 0, opacity: resolved.clip.opacity ?? 1 } } : null;
      case "caption": {
        const c = captions.find((x) => currentTime >= x.start && currentTime <= x.end);
        return c ? { id: c.id, type: "caption" as const, keyframes: c.keyframes || [], localTime: currentTime - c.start, defaultProps: { scale: c.scale ?? 1, rotation: c.rotation ?? 0, xPercent: c.xPercent ?? 50, yPercent: c.yPercent ?? (captionStyle.position === "top" ? 8 : captionStyle.position === "center" ? 50 : 88), opacity: 1 } } : null;
      }
      case "audio": {
        const a = audioTracks.find((x) => currentTime >= x.start && currentTime <= x.start + x.duration);
        return a ? { id: a.id, type: "audio" as const, keyframes: a.keyframes || [], localTime: currentTime - a.start, defaultProps: { volume: a.volume ?? 1 } } : null;
      }
      case "filter": {
        const f = filters.find((x) => currentTime >= x.start && currentTime <= x.end);
        return f ? { id: f.id, type: "filter" as const, keyframes: f.keyframes || [], localTime: currentTime - f.start, defaultProps: { intensity: f.intensity ?? 0.5 } } : null;
      }
      case "vfx": {
        const v = vfx.find((x) => currentTime >= x.start && currentTime <= x.end);
        return v ? { id: v.id, type: "vfx" as const, keyframes: v.keyframes || [], localTime: currentTime - v.start, defaultProps: { intensity: v.intensity ?? 0.5 } } : null;
      }
      case "overlay": {
        const o = overlays.find((x) => currentTime >= x.start && currentTime <= x.end);
        return o ? { id: o.id, type: "overlay" as const, keyframes: o.keyframes || [], localTime: currentTime - o.start, defaultProps: { scale: o.scale ?? 1, rotation: o.rotation ?? 0, x: o.x ?? 50, y: o.y ?? 50, opacity: o.opacity ?? 1 } } : null;
      }
    }
    return null;
  }, [focusedTrack, resolved, clipLocalTime, captions, audioTracks, filters, vfx, overlays, currentTime, captionStyle.position]);

  const hasKfAtPlayhead = useMemo(() => {
    if (!activeKfItem) return false;
    return activeKfItem.keyframes.some((kf) => Math.abs(kf.time - activeKfItem.localTime) < 0.05);
  }, [activeKfItem]);

  const togglePlayheadKeyframes = useCallback(() => {
    if (!activeKfItem) {
      toast.error(
        getLang() === "ar"
          ? "يرجى تحديد عنصر في المسار النشط أولاً!"
          : "Please select an item on the active track first!"
      );
      return;
    }
    vibrate(15);
    const { id, type, keyframes: existingKfs, localTime, defaultProps } = activeKfItem;
    const hasKf = existingKfs.some((kf) => Math.abs(kf.time - localTime) < 0.05);

    let updatedKfs = [...existingKfs];

    if (hasKf) {
      // Remove keyframes at this playhead
      updatedKfs = updatedKfs.filter((kf) => Math.abs(kf.time - localTime) >= 0.05);
      toast.success(getLang() === "ar" ? "تمت إزالة الإطار المفتاحي" : "Keyframe removed");
    } else {
      // Add keyframes for all keyframe-able properties of this track's item
      Object.entries(defaultProps).forEach(([prop, val]) => {
        // First keyframe for this property? Add a starting keyframe at time 0
        const propertyKfs = updatedKfs.filter((k) => k.property === prop);
        if (propertyKfs.length === 0) {
          updatedKfs.push({
            id: `start-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: 0,
            property: prop,
            value: val as number,
            easing: "linear" as const
          });
          if (localTime > 0.05) {
            updatedKfs.push({
              id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              time: localTime,
              property: prop,
              value: val as number,
              easing: "linear" as const
            });
          }
        } else {
          // Find/Interpolate value to set
          const valueToSet = interpolateKeyframes({ keyframes: existingKfs }, prop, localTime, val as number);
          updatedKfs.push({
            id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: localTime,
            property: prop,
            value: valueToSet,
            easing: "linear" as const
          });
        }
      });
      toast.success(getLang() === "ar" ? "تمت إضافة إطار مفتاحي ⬥" : "Keyframe added ⬥");
    }

    if (type === "video") {
      setClips((prev) => prev.map((c) => c.id === id ? { ...c, keyframes: updatedKfs } : c));
    } else if (type === "caption") {
      setCaptions((prev) => prev.map((c) => c.id === id ? { ...c, keyframes: updatedKfs } : c));
    } else if (type === "filter") {
      setFilters((prev) => prev.map((f) => f.id === id ? { ...f, keyframes: updatedKfs } : f));
    } else if (type === "vfx") {
      setVfx((prev) => prev.map((v) => v.id === id ? { ...v, keyframes: updatedKfs } : v));
    } else if (type === "audio") {
      updateAudioTrack(id, { keyframes: updatedKfs });
    } else if (type === "overlay") {
      updateOverlay(id, { keyframes: updatedKfs });
    }
  }, [activeKfItem, setClips, setCaptions, setFilters, setVfx, updateAudioTrack, updateOverlay]);

  const handleUpdateOverlay = useCallback((id: string, patch: Partial<OverlayItem>) => {
    setOverlays((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      const updatedOverlayItem = { ...o, ...patch };
      const updatedKeyframes = [...(o.keyframes || [])];
      
      const keys = Object.keys(patch) as Array<keyof Partial<OverlayItem>>;
      const kfProperties = ["x", "y", "scale", "rotation", "opacity"] as const;
      
      const hasKeyframes = updatedKeyframes.length > 0;
      const localTime = currentTime - o.start;
      
      if (hasKeyframes) {
        let changed = false;
        for (const prop of kfProperties) {
          if (keys.includes(prop)) {
            const val = patch[prop];
            if (val === undefined) continue;
            changed = true;
            
            const existingKfIdx = updatedKeyframes.findIndex(
              (k) => k.property === prop && Math.abs(k.time - localTime) < 0.05
            );
            
            if (existingKfIdx !== -1) {
              updatedKeyframes[existingKfIdx] = {
                ...updatedKeyframes[existingKfIdx],
                value: val,
              };
            } else {
              const newKf = {
                id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                time: localTime,
                property: prop,
                value: val,
                easing: "linear" as const
              };
              updatedKeyframes.push(newKf);
            }
          }
        }
        if (changed) {
          updatedOverlayItem.keyframes = updatedKeyframes;
        }
      }
      return updatedOverlayItem;
    }));
  }, [currentTime, setOverlays]);

  const updateActiveClip = useCallback((patch: Partial<Clip>) => {
    if (!resolved?.clip.id) return;
    setClips((prev) => prev.map((c) => {
      if (c.id !== resolved.clip.id) return c;
      const updatedClip = { ...c, ...patch };
      const updatedKeyframes = [...(c.keyframes || [])];
      
      const keys = Object.keys(patch) as Array<keyof Partial<Clip>>;
      const kfProperties = ["scale", "rotation", "panX", "panY", "opacity", "volume"] as const;
      
      const hasKeyframes = updatedKeyframes.length > 0;
      
      if (hasKeyframes) {
        let changed = false;
        for (const prop of kfProperties) {
          if (keys.includes(prop)) {
            const val = patch[prop];
            if (val === undefined) continue;
            changed = true;
            
            const existingKfIdx = updatedKeyframes.findIndex(
              (k) => k.property === prop && Math.abs(k.time - clipLocalTime) < 0.05
            );
            
            if (existingKfIdx !== -1) {
              updatedKeyframes[existingKfIdx] = {
                ...updatedKeyframes[existingKfIdx],
                value: val,
              };
            } else {
              const newKf = {
                id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                time: clipLocalTime,
                property: prop,
                value: val,
                easing: "linear" as const
              };
              updatedKeyframes.push(newKf);
            }
          }
        }
        if (changed) {
          updatedClip.keyframes = updatedKeyframes;
        }
      }
      return updatedClip;
    }));
  }, [resolved, clipLocalTime, setClips]);

  const handleApplyCrop = useCallback((crop: { x: number; y: number; w: number; h: number }) => {
    updateActiveClip({
      cropX: crop.x,
      cropY: crop.y,
      cropW: crop.w,
      cropH: crop.h
    });
  }, [updateActiveClip]);

  // Track active transition state to animate the preview in real-time
  const [activeTransition, setActiveTransition] = useState<{ type: TransitionType; duration: number; id: string } | null>(null);

  const transitionInType = resolved?.clip.transitionIn?.type;
  const transitionInDur = resolved?.clip.transitionIn?.duration;
  const clipStart = resolved?.clipStart;

  useEffect(() => {
    if (!resolved?.clip.id) {
      setActiveTransition((prev) => prev === null ? null : null);
      return;
    }
    const trans = resolved.clip.transitionIn;
    if (trans && trans.type !== "none") {
      const elapsed = currentTime - (clipStart ?? 0);
      if (elapsed >= 0 && elapsed <= trans.duration) {
        setActiveTransition((prev) => {
          if (
            prev &&
            prev.type === trans.type &&
            prev.duration === trans.duration &&
            prev.id === resolved.clip.id
          ) {
            return prev;
          }
          return {
            type: trans.type,
            duration: trans.duration,
            id: resolved.clip.id
          };
        });
        const remaining = (trans.duration - elapsed) * 1000;
        const t = setTimeout(() => {
          setActiveTransition((prev) => prev === null ? null : null);
        }, remaining);
        return () => clearTimeout(t);
      }
    }
    setActiveTransition((prev) => prev === null ? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.clip.id, currentTime, transitionInType, transitionInDur, clipStart]);

  const transitionClass = useMemo(() => {
    if (!activeTransition) return "";
    const { type } = activeTransition;
    switch (type) {
      case "fade": return "animate-video-dissolve";
      case "dissolve": return "animate-video-dissolve";
      case "slide": return "animate-video-slide";
      case "zoom": return "animate-video-zoom";
      case "wipe": return "animate-video-slide";
      case "blur": return "animate-video-blur";
      case "glitch": return "animate-video-glitch";
      case "spin": return "animate-video-spin";
      case "flash": return "animate-video-flash";
      case "shutter": return "animate-video-shutter";
      case "iris": return "animate-video-iris";
      case "split": return "animate-video-split";
      case "mosaic": return "animate-video-mosaic";
      case "ripple": return "animate-video-ripple";
      case "radar": return "animate-video-radar";
      case "gsap-elastic-zoom": return "animate-video-zoom";
      case "gsap-3d-flip": return "animate-video-spin";
      case "gsap-stagger-wipe": return "animate-video-slide";
      case "gsap-elastic-bounce": return "animate-video-shutter";
      default: return "";
    }
  }, [activeTransition]);

  const transitionStyle = useMemo(() => {
    if (!activeTransition) return {};
    return {
      "--trans-dur": `${activeTransition.duration * 1000}ms`
    } as React.CSSProperties;
  }, [activeTransition]);

  // Compute active CSS filter from FilterItems
  const activeFilterStyle = useMemo(() => {
    if (compareRaw) return "";
    const active = filters.filter((f) => currentTime >= f.start && currentTime <= f.end);
    if (!active.length) return "";
    const parts: string[] = [];
    for (const f of active) {
      const localTime = currentTime - f.start;
      const i = interpolateKeyframes(f, "intensity", localTime, f.intensity);
      
      // 1. Base Preset Filter
      switch (f.type) {
        case "brightness": parts.push(`brightness(${0.5 + i * 1.5})`); break;
        case "contrast": parts.push(`contrast(${0.5 + i * 1.5})`); break;
        case "saturate": parts.push(`saturate(${i * 3})`); break;
        case "grayscale": parts.push(`grayscale(${i})`); break;
        case "sepia": parts.push(`sepia(${i})`); break;
        case "blur": parts.push(`blur(${i * 8}px)`); break;
        case "hue-rotate": parts.push(`hue-rotate(${i * 360}deg)`); break;
        case "invert": parts.push(`invert(${i})`); break;
        case "vintage": parts.push(`sepia(${i * 0.6}) contrast(${0.8 + i * 0.4}) brightness(${0.9 + i * 0.2})`); break;
        case "warm": parts.push(`sepia(${i * 0.3}) saturate(${1 + i * 0.5}) brightness(${1 + i * 0.1})`); break;
        case "cool": parts.push(`hue-rotate(${i * 30}deg) saturate(${1 + i * 0.3})`); break;
        case "dramatic": parts.push(`contrast(${1 + i * 0.8}) brightness(${1 - i * 0.2}) saturate(${1 + i * 0.5})`); break;
        case "noir": parts.push(`grayscale(${i * 0.9 + 0.1}) contrast(${1 + i * 0.6}) brightness(${1 - i * 0.15})`); break;
        case "fade-edge": parts.push(`blur(${i * 0.5}px) brightness(${1 + i * 0.1}) saturate(${1 - i * 0.2})`); break;
        case "duotone": parts.push(`grayscale(${i * 0.8}) sepia(${i * 0.5}) hue-rotate(${i * 180}deg) contrast(${1 + i * 0.3})`); break;
        case "dream": parts.push(`blur(${i * 0.4}px) brightness(${1 + i * 0.15}) saturate(${1 + i * 0.3}) contrast(${1 - i * 0.1})`); break;
        case "neon": parts.push(`saturate(${1 + i * 0.8}) contrast(${1 + i * 0.4}) hue-rotate(${i * 60}deg) brightness(${1 + i * 0.1})`); break;
        case "sepia-blue": parts.push(`sepia(${i * 0.5}) hue-rotate(${i * 180}deg) saturate(${1 + i * 0.3})`); break;
      }

      // 2. Custom Fine-tuning Slider Adjustments
      if (f.brightness !== undefined && f.brightness !== 1) {
        parts.push(`brightness(${f.brightness})`);
      }
      if (f.contrast !== undefined && f.contrast !== 1) {
        parts.push(`contrast(${f.contrast})`);
      }
      if (f.saturation !== undefined && f.saturation !== 1) {
        parts.push(`saturate(${f.saturation})`);
      }
      if (f.blur !== undefined && f.blur > 0) {
        parts.push(`blur(${f.blur}px)`);
      }
      if (f.hueRotate !== undefined && f.hueRotate !== 0) {
        parts.push(`hue-rotate(${f.hueRotate}deg)`);
      }
      if (f.sharpness !== undefined && f.sharpness !== 0) {
        const cVal = 1 + f.sharpness * 0.15;
        const bVal = 1 + f.sharpness * 0.05;
        const sVal = 1 + f.sharpness * 0.05;
        parts.push(`contrast(${cVal}) brightness(${bVal}) saturate(${sVal})`);
      }
      if (f.hslHue !== undefined && f.hslHue !== 0) {
        parts.push(`hue-rotate(${f.hslHue}deg)`);
      }
      if (f.hslSaturation !== undefined && f.hslSaturation !== 0) {
        parts.push(`saturate(${1 + f.hslSaturation / 100})`);
      }
      if (f.hslLightness !== undefined && f.hslLightness !== 0) {
        parts.push(`brightness(${1 + f.hslLightness / 200})`);
      }
    }
    return parts.join(" ");
  }, [filters, currentTime, compareRaw]);

  // Compute active VFX styles
  const activeVfxStyle = useMemo(() => {
    if (compareRaw) {
      return {
        transform: "",
        overlayStyle: null as React.CSSProperties | null,
        filter: "",
        imageStyle: null as React.CSSProperties | null,
      };
    }
    const state = computeVfxState(vfx, currentTime);
    return {
      transform: state.transform,
      overlayStyle: state.overlayStyle,
      filter: state.filter,
      imageStyle: state.imageStyle,
    };
  }, [vfx, currentTime, compareRaw]);

  // Active overlays for preview
  const activeOverlays = useMemo(() => {
    return overlays.filter((o) => currentTime >= o.start && currentTime <= o.end);
  }, [overlays, currentTime]);

  // Single Source of Truth for Video Source Resolution (Requirement 9)
  const resolvePreviewSource = useCallback((clipId?: string): string => {
    if (!clipId) return "";
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return "";

    const mediaItem = getMediaById(clip.mediaId);
    const originalUrl = clip.originalUrl || mediaItem?.originalUrl || mediaItem?.url || "";

    // If comparing raw or user toggled off processed version for this clip
    if (compareRaw || clip.useProcessed === false) {
      return originalUrl;
    }

    if (clip.processedUrl) return clip.processedUrl;
    if (mediaItem?.processedUrl) return mediaItem.processedUrl;

    return originalUrl;
  }, [clips, getMediaById, compareRaw]);

  // Preview background mode and custom color
  const [editorBgMode, setEditorBgMode] = useState<"checkerboard" | "black" | "green" | "white" | "custom">("checkerboard");
  const [customBgColor, setCustomBgColor] = useState<string>("#00FF00");

  const setClipBgMode = useCallback((clipId: string, mode: "checkerboard" | "black" | "green" | "white" | "custom", color?: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          previewBgMode: mode,
          ...(color ? { previewBgColor: color } : {}),
        };
      })
    );
  }, [setClips]);

  const toggleClipProcessed = useCallback((clipId: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const nextVal = c.useProcessed === false ? true : false;
        return {
          ...c,
          useProcessed: nextVal,
        };
      })
    );
  }, [setClips]);

  const getPreviewBgStyle = useCallback((): React.CSSProperties => {
    const activeClip = resolved?.clip;
    const mode = activeClip?.previewBgMode || (activeClip?.hasAlpha ? editorBgMode : "black");
    switch (mode) {
      case "checkerboard":
        return {
          backgroundImage: `
            linear-gradient(45deg, #2b2b2b 25%, transparent 25%), 
            linear-gradient(-45deg, #2b2b2b 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #2b2b2b 75%), 
            linear-gradient(-45deg, transparent 75%, #2b2b2b 75%)
          `,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
          backgroundColor: "#141414",
        };
      case "green":
        return { backgroundColor: "#00FF00" };
      case "white":
        return { backgroundColor: "#FFFFFF" };
      case "custom":
        return { backgroundColor: activeClip?.previewBgColor || customBgColor || "#00FF00" };
      case "black":
      default:
        return { backgroundColor: "#000000" };
    }
  }, [resolved?.clip, editorBgMode, customBgColor]);

  /**
   * Apply AI-Processed Video to Editor Pipeline (Requirement 8 & 10)
   * Real end-to-end synchronization:
   * 1. Validate video decodability and dimensions via probe element
   * 2. Update media item state & revision, preserving originalUrl
   * 3. Invalidate clip cache
   * 4. Update timeline clip with processedUrl, useProcessed, hasAlpha and new mediaRevision
   * 5. Update active slot (A or B)
   * 6. Force video element reload
   * 7. Preserve current playback position, volume, mute, speed
   * 8. Trigger editor redraw
   */
  const applyProcessedVideoToEditor = useCallback(async (
    resultVideoBlobOrUrl: Blob | string,
    clipId?: string,
    options?: {
      hasAlpha?: boolean;
      previewBgMode?: "checkerboard" | "black" | "green" | "white" | "custom";
    }
  ): Promise<boolean> => {
    try {
      // Resiliently resolve target clip
      const clip = (clipId ? clips.find((c) => c.id === clipId) : null)
        || resolved?.clip
        || clips[0];

      if (!clip) {
        throw new Error(getLang() === "ar" ? "لم يتم العثور على المقطع في الخط الزمني." : "Clip not found in timeline");
      }

      // Convert Blob to Object URL or use provided URL
      let newBlobUrl: string;
      if (resultVideoBlobOrUrl instanceof Blob) {
        newBlobUrl = URL.createObjectURL(resultVideoBlobOrUrl);
      } else {
        newBlobUrl = resultVideoBlobOrUrl;
      }

      if (!newBlobUrl || typeof newBlobUrl !== "string") {
        throw new Error(getLang() === "ar" ? "رابط الفيديو الناتج غير صالح." : "Invalid output video URL");
      }

      // Ensure active ObjectURL is not collected by background video cleaner while editing
      VideoMemoryManager.getInstance().untrackObjectUrl(newBlobUrl);

      // Probe decodability and duration in an isolated video element before applying
      const probeVideo = document.createElement("video");
      probeVideo.preload = "auto";
      probeVideo.muted = true;
      probeVideo.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          // Even if probe timed out, proceed if readyState is at least HAVE_METADATA
          if (probeVideo.readyState >= 1 || probeVideo.videoWidth > 0) {
            resolve();
          } else {
            reject(new Error(getLang() === "ar" ? "انتهت مهلة التحقق من إمكانية فك ترميز الفيديو المعالج." : "Timed out validating processed video."));
          }
        }, 5000);

        const onMeta = () => {
          cleanup();
          if (probeVideo.videoWidth > 0 && probeVideo.videoHeight > 0) {
            resolve();
          } else {
            reject(new Error(getLang() === "ar" ? "أبعاد الفيديو الناتج غير صالحة." : "Invalid video dimensions in output."));
          }
        };

        const onErr = () => {
          cleanup();
          reject(new Error(getLang() === "ar" ? "فشل متصفح الويب في قراءة الفيديو المعالج." : "Browser failed to decode processed video output."));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          probeVideo.removeEventListener("loadedmetadata", onMeta);
          probeVideo.removeEventListener("error", onErr);
        };

        probeVideo.addEventListener("loadedmetadata", onMeta, { once: true });
        probeVideo.addEventListener("error", onErr, { once: true });
        probeVideo.src = newBlobUrl;
      });

      const mediaItem = getMediaById(clip.mediaId);
      const originalUrl = clip.originalUrl || mediaItem?.originalUrl || mediaItem?.url || "";
      const oldProcessedUrl = clip.processedUrl || mediaItem?.processedUrl;
      const isAlpha = options?.hasAlpha ?? (clip.hasAlpha || false);

      // 1. Update media item state with revision and preserve original source
      const newRevision = (clip.mediaRevision || mediaItem?.mediaRevision || 0) + 1;
      if (mediaItem) {
        updateMediaItem(mediaItem.id, {
          url: newBlobUrl,
          originalUrl,
          processedUrl: newBlobUrl,
          mediaRevision: newRevision,
          hasAlpha: isAlpha,
        });
      }

      // 2. Invalidate clip cache & 3. Update timeline clip with processed state
      setClips((prevClips) =>
        prevClips.map((c) =>
          c.id === clip.id
            ? {
                ...c,
                originalUrl,
                processedUrl: newBlobUrl,
                useProcessed: true,
                mediaRevision: newRevision,
                hasAlpha: isAlpha,
                previewBgMode: isAlpha ? (c.previewBgMode || "checkerboard") : c.previewBgMode,
              }
            : c
        )
      );

      if (isAlpha) {
        setEditorBgMode("checkerboard");
      }

      // Invalidate ping-pong preloaded slots cache for this clip
      slot0ClipIdRef.current = null;
      slot1ClipIdRef.current = null;

      // Revoke previous blob url if it was AI generated
      if (oldProcessedUrl && oldProcessedUrl.startsWith("blob:") && oldProcessedUrl !== newBlobUrl) {
        try {
          URL.revokeObjectURL(oldProcessedUrl);
        } catch {}
      }

      // 4. Determine target video slot (active slot)
      const curSlot = activeSlotRef.current;
      const activeEl = curSlot === 0 ? videoRefA.current : videoRefB.current;
      const standbyEl = curSlot === 0 ? videoRefB.current : videoRefA.current;

      if (activeEl) {
        const wasPlaying = isPlayingRef.current && !activeEl.paused;
        const preservedPlaybackPos = activeEl.currentTime || (resolved?.mediaTime || clip.in || 0);
        const preservedVolume = activeEl.volume;
        const preservedMuted = activeEl.muted;
        const preservedPlaybackRate = activeEl.playbackRate || (clip.speed || 1);

        activeEl.pause();
        activeEl.src = newBlobUrl;
        activeEl.preload = "auto";
        activeEl.load();

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            activeEl.removeEventListener("loadedmetadata", onMeta);
            resolve();
          }, 3000);

          const onMeta = () => {
            clearTimeout(timeout);
            activeEl.removeEventListener("loadedmetadata", onMeta);
            resolve();
          };

          activeEl.addEventListener("loadedmetadata", onMeta, { once: true });
        });

        try {
          activeEl.currentTime = Math.min(activeEl.duration || Infinity, preservedPlaybackPos);
        } catch {}

        activeEl.volume = preservedVolume;
        activeEl.muted = preservedMuted;
        activeEl.playbackRate = preservedPlaybackRate;

        if (wasPlaying) {
          try {
            await activeEl.play();
          } catch {}
        }
      }

      // Refresh standby slot to prevent old video flash
      if (standbyEl) {
        try {
          standbyEl.pause();
          standbyEl.removeAttribute("src");
          standbyEl.src = "";
          standbyEl.load();
        } catch {}
      }

      // Trigger editor redraw
      setMediaReady(true);
      setMediaError(false);

      return true;
    } catch (err: any) {
      console.error("[applyProcessedVideoToEditor] Error:", err);
      toast.error(err?.message || (getLang() === "ar" ? "فشل عرض الفيديو المعالج في نافذة المعاينة" : "Processed video failed to render in preview"));
      return false;
    }
  }, [clips, getMediaById, updateMediaItem, setClips, resolved]);

  // Subscribe to background Video Job Manager completions
  useEffect(() => {
    const unsubscribe = VideoJobManager.getInstance().subscribeCompleted(async (job) => {
      if (job.result && (job.result.blob || job.result.outputUrl)) {
        const targetClip = (job.targetClipId ? clips.find((c) => c.id === job.targetClipId) : null)
          || resolved?.clip
          || clips[0];

        if (targetClip) {
          console.log(`[EditorScreen] Video job ${job.id} completed. Applying output to clip ${targetClip.id}`);
          const applied = await applyProcessedVideoToEditor(
            job.result.blob || job.result.outputUrl!,
            targetClip.id
          );
          if (applied) {
            playSfx("success");
            toast.success(
              getLang() === "ar"
                ? "تم تحديث شاشة المعاينة بالفيديو المعالج بالذكاء الاصطناعي بنجاح!"
                : "Editor preview updated with processed AI video!"
            );
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [applyProcessedVideoToEditor, clips, resolved]);

  // Preload a clip into a standby video element without affecting audio or UI
  const preloadSlot = useCallback((
    el: HTMLVideoElement | null, 
    targetClip: typeof clips[0] | null, 
    targetMedia: MediaItem | null | undefined
  ) => {
    if (!el || !targetClip || !targetMedia || targetMedia.type !== "video") return;
    const targetSourceUrl = resolvePreviewSource(targetClip.id) || targetMedia.processedUrl || targetMedia.url;
    if (el.src !== targetSourceUrl && targetSourceUrl) {
      el.src = targetSourceUrl;
      el.preload = "auto";
    }
    el.muted = true;
    el.playbackRate = targetClip.speed && targetClip.speed > 0 ? targetClip.speed : 1;
    const targetIn = targetClip.in || 0.001;
    if (Math.abs(el.currentTime - targetIn) > 0.06 || el.currentTime === 0) {
      try { el.currentTime = targetIn; } catch {}
    }
  }, [resolvePreviewSource]);

  // Dual-video ping-pong synchronization effect: handles gapless clip transitions
  useEffect(() => {
    if (!resolved || !activeMedia) return;
    const curSlot = activeSlotRef.current;
    const activeEl = curSlot === 0 ? videoRefA.current : videoRefB.current;
    const standbyEl = curSlot === 0 ? videoRefB.current : videoRefA.current;
    const nextIdx = resolved.clipIndex + 1;
    const nextClip = nextIdx < clips.length ? clips[nextIdx] : null;
    const nextMedia = nextClip ? getMediaById(nextClip.mediaId) : null;

    if (activeMedia.type !== "video") {
      setMediaReady(true);
      // If current media is an image, pause video elements and preload next clip if video
      if (nextClip && nextMedia?.type === "video" && standbyEl) {
        preloadSlot(standbyEl, nextClip, nextMedia);
        if (curSlot === 0) slot1ClipIdRef.current = nextClip.id;
        else slot0ClipIdRef.current = nextClip.id;
      }
      return;
    }

    const currentClipId = resolved.clip.id;
    const currentVideoUrl = resolvePreviewSource(currentClipId) || activeMedia.processedUrl || activeMedia.url;
    const standbyPreloadedId = curSlot === 0 ? slot1ClipIdRef.current : slot0ClipIdRef.current;

    // Check if the upcoming clip was already preloaded into the standby slot
    if (standbyPreloadedId === currentClipId && standbyEl) {
      // Seamless ping-pong swap: switch active slot without any re-buffering!
      const newSlot: 0 | 1 = curSlot === 0 ? 1 : 0;
      activeSlotRef.current = newSlot;
      setActiveSlot(newSlot);
      videoRef.current = standbyEl;

      // Active element audio setup
      standbyEl.muted = videoMuted;
      const targetVol = (videoVolume ?? 1) * (activeVolume ?? 1);
      standbyEl.volume = Math.max(0, Math.min(1, targetVol));
      standbyEl.playbackRate = resolved.clip.speed && resolved.clip.speed > 0 ? resolved.clip.speed : 1;

      // Ensure exact start position
      const target = resolved.mediaTime || 0.001;
      if (Math.abs(standbyEl.currentTime - target) > 0.15) {
        try { standbyEl.currentTime = target; } catch {}
      }

      if (isPlayingRef.current) {
        standbyEl.play().catch(() => {});
      }

      // Decommission previous slot to standby
      if (activeEl) {
        activeEl.muted = true;
        activeEl.pause();
      }

      // Immediately preload the next upcoming clip into the newly vacated standby slot
      if (nextClip && nextMedia?.type === "video" && activeEl) {
        preloadSlot(activeEl, nextClip, nextMedia);
        if (newSlot === 0) slot1ClipIdRef.current = nextClip.id;
        else slot0ClipIdRef.current = nextClip.id;
      } else {
        if (newSlot === 0) slot1ClipIdRef.current = null;
        else slot0ClipIdRef.current = null;
      }
    } else {
      // Direct load (initial load, timeline scrub, or seek)
      if (activeEl) {
        if (activeEl.src !== currentVideoUrl && currentVideoUrl) {
          activeEl.src = currentVideoUrl;
          activeEl.preload = "auto";
        }
        activeEl.muted = videoMuted;
        const targetVol = (videoVolume ?? 1) * (activeVolume ?? 1);
        activeEl.volume = Math.max(0, Math.min(1, targetVol));
        activeEl.playbackRate = resolved.clip.speed && resolved.clip.speed > 0 ? resolved.clip.speed : 1;
        const target = resolved.mediaTime || 0.001;
        const threshold = (isPlayingRef.current && !activeEl.paused) ? 0.35 : 0.05;
        if (Math.abs(activeEl.currentTime - target) > threshold || activeEl.currentTime === 0) {
          try { activeEl.currentTime = target; } catch {}
        }
        if (isPlayingRef.current && activeEl.paused) {
          activeEl.play().catch(() => {});
        }
        if (curSlot === 0) slot0ClipIdRef.current = currentClipId;
        else slot1ClipIdRef.current = currentClipId;
      }

      // Preload next clip into standby slot
      if (nextClip && nextMedia?.type === "video" && standbyEl) {
        preloadSlot(standbyEl, nextClip, nextMedia);
        if (curSlot === 0) slot1ClipIdRef.current = nextClip.id;
        else slot0ClipIdRef.current = nextClip.id;
      }
    }
  }, [resolved, activeMedia, clips, videoMuted, videoVolume, activeVolume, preloadSlot, getMediaById, resolvePreviewSource]);

  // Seamless source swap when toggling between original and processed AI video
  useEffect(() => {
    if (!resolved?.clip) return;
    const curSlot = activeSlotRef.current;
    const activeEl = curSlot === 0 ? videoRefA.current : videoRefB.current;
    if (!activeEl) return;

    const targetUrl = resolvePreviewSource(resolved.clip.id);
    if (targetUrl && activeEl.src !== targetUrl) {
      const currentTimePos = activeEl.currentTime;
      const wasPlaying = isPlayingRef.current && !activeEl.paused;
      activeEl.src = targetUrl;
      try { activeEl.currentTime = currentTimePos; } catch {}
      if (wasPlaying) {
        activeEl.play().catch(() => {});
      }
    }
  }, [resolved?.clip, resolvePreviewSource]);

  // Synchronize audio volume and mute across dual slots (standby is always muted)
  useEffect(() => {
    const vA = videoRefA.current;
    const vB = videoRefB.current;
    const targetVol = (videoVolume ?? 1) * (activeVolume ?? 1);
    const clampedVol = Math.max(0, Math.min(1, targetVol));
    const finalVol = Number.isFinite(clampedVol) ? clampedVol : 1;

    if (activeSlot === 0) {
      if (vA) {
        vA.muted = videoMuted;
        vA.volume = finalVol;
      }
      if (vB) {
        vB.muted = true;
      }
    } else {
      if (vB) {
        vB.muted = videoMuted;
        vB.volume = finalVol;
      }
      if (vA) {
        vA.muted = true;
      }
    }
  }, [activeSlot, videoMuted, videoVolume, activeVolume]);

  const videoFxChainRef = useRef<ReturnType<typeof attachFxChain> | null>(null);

  useEffect(() => {
    const activeEl = activeSlot === 0 ? videoRefA.current : videoRefB.current;
    if (!activeEl || activeMedia?.type !== "video") return;
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (videoFxChainRef.current) {
        videoFxChainRef.current.cleanup();
        videoFxChainRef.current = null;
      }
      if (videoAudioFx && videoAudioFx !== "none") {
        videoFxChainRef.current = attachFxChain(ctx, activeEl, videoAudioFx, videoVolume * activeVolume, videoMuted);
      }
    } catch (e) {
      console.warn("videoFxChain error", e);
    }
  }, [activeSlot, videoAudioFx, videoMuted, videoVolume, activeVolume, activeMedia?.id, activeMedia?.type]);

  useEffect(() => {
    if (!isPlaying || !hasMedia) return;
    lastTickRef.current = performance.now();
    const activeEl = activeSlotRef.current === 0 ? videoRefA.current : videoRefB.current;
    if (activeEl && activeMedia?.type === "video") {
      activeEl.play().catch(() => {
        setIsPlaying(false);
        isPlayingRef.current = false;
      });
    }

    const tick = (now: number) => {
      if (!isPlayingRef.current) return;

      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const nextTime = currentTimeRef.current + dt;

      if (nextTime >= totalDuration) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentTime(totalDuration);
        currentTimeRef.current = totalDuration;
        videoRefA.current?.pause();
        videoRefB.current?.pause();
        return;
      }

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      // Soft lock: active video element is kept in close alignment with timeline time
      const curActive = activeSlotRef.current === 0 ? videoRefA.current : videoRefB.current;
      const r = resolveTimelineTime(nextTime);
      if (r && curActive && !curActive.paused && !curActive.seeking) {
        const expected = r.mediaTime;
        const drift = Math.abs(curActive.currentTime - expected);
        // If drift is moderate, gently soft-adjust without triggering hard decoder stall
        if (drift > 0.28) {
          try { curActive.currentTime = expected; } catch {}
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    const elA = videoRefA.current;
    const elB = videoRefB.current;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      elA?.pause();
      elB?.pause();
    };
  }, [isPlaying, hasMedia, totalDuration, activeMedia?.id, activeMedia?.type, resolveTimelineTime]);

  const seek = useCallback((t: number) => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentTime(t);
    currentTimeRef.current = t;

    videoRefA.current?.pause();
    videoRefB.current?.pause();

    const r = resolveTimelineTime(t);
    if (!r) return;
    const m = getMediaById(r.clip.mediaId);

    activeSlotRef.current = 0;
    setActiveSlot(0);
    videoRef.current = videoRefA.current;

    if (m?.type === "video" && videoRefA.current) {
      const activeVideoUrl = resolvePreviewSource(r.clip.id);
      if (videoRefA.current.src !== activeVideoUrl && activeVideoUrl) {
        videoRefA.current.src = activeVideoUrl;
        videoRefA.current.preload = "auto";
      }
      try { videoRefA.current.currentTime = r.mediaTime || 0.001; } catch {}
      videoRefA.current.playbackRate = r.clip.speed && r.clip.speed > 0 ? r.clip.speed : 1;
      videoRefA.current.muted = videoMuted;
      slot0ClipIdRef.current = r.clip.id;
    }

    // Preload next clip in slot 1
    const nextIdx = r.clipIndex + 1;
    if (nextIdx < clips.length) {
      const nextC = clips[nextIdx];
      const nextM = getMediaById(nextC.mediaId);
      if (nextM?.type === "video" && videoRefB.current) {
        const nextVideoUrl = resolvePreviewSource(nextC.id);
        if (videoRefB.current.src !== nextVideoUrl && nextVideoUrl) {
          videoRefB.current.src = nextVideoUrl;
          videoRefB.current.preload = "auto";
        }
        videoRefB.current.muted = true;
        videoRefB.current.playbackRate = nextC.speed && nextC.speed > 0 ? nextC.speed : 1;
        try { videoRefB.current.currentTime = nextC.in || 0.001; } catch {}
        slot1ClipIdRef.current = nextC.id;
      }
    }
  }, [resolveTimelineTime, getMediaById, clips, videoMuted, resolvePreviewSource]);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
    return `${min}:${sec.toString().padStart(2, "0")}.${ms}`;
  };

  const togglePlay = () => {
    if (hasMedia) {
      if (currentTime >= totalDuration - 0.05) {
        seek(0);
      }
      setIsPlaying((p) => {
        const next = !p;
        isPlayingRef.current = next;
        return next;
      });
    }
  };

  // Haptic vibration helper
  const vibrate = (ms = 10) => { try { navigator.vibrate?.(ms); } catch {} };

  // Pinch-to-zoom on preview
  const onPreviewTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-caption-text]") ||
      target.closest("[data-caption-overlay]") ||
      target.closest("[data-interactive-overlay]") ||
      target.closest("button")
    ) {
      return;
    }
    if (!resolved?.clip) return;
    const currentScale = resolved.clip.scale ?? 1;
    const currentPanX = resolved.clip.panX ?? 0;
    const currentPanY = resolved.clip.panY ?? 0;
    const currentRotation = resolved.clip.rotation ?? 0;

    hasMovedRef.current = false;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        dist: Math.hypot(dx, dy), scale: currentScale,
        panX: currentPanX, panY: currentPanY,
        angle: Math.atan2(dy, dx) * (180 / Math.PI),
        rotation: currentRotation,
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      hasMovedRef.current = true;
      setShowFrame(true);
    } else if (e.touches.length === 1) {
      panRef.current = {
        startX: e.touches[0].clientX, startY: e.touches[0].clientY,
        panX: currentPanX, panY: currentPanY,
      };
      setShowFrame(true);
    }
  }, [resolved]);

  const onPreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (!resolved?.clip) return;
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.3, Math.min(4, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const angleDiff = angle - pinchRef.current.angle;

      updateActiveClip({
        scale: newScale,
        panX: pinchRef.current.panX + (cx - pinchRef.current.cx),
        panY: pinchRef.current.panY + (cy - pinchRef.current.cy),
        rotation: pinchRef.current.rotation + angleDiff,
      });
    } else if (e.touches.length === 1 && panRef.current) {
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      if (Math.hypot(dx, dy) > 8) {
        hasMovedRef.current = true;
      }
      updateActiveClip({
        panX: panRef.current.panX + dx,
        panY: panRef.current.panY + dy,
      });
    }
  }, [resolved, updateActiveClip]);

  const onPreviewTouchEnd = useCallback(() => {
    pinchRef.current = null;
    panRef.current = null;
    setTimeout(() => setShowFrame(false), 1200);
  }, []);

  // Desktop mouse/wheel interaction for preview
  const onPreviewMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-caption-text]") ||
      target.closest("[data-caption-overlay]") ||
      target.closest("[data-interactive-overlay]") ||
      target.closest("button")
    ) {
      return;
    }
    if (!resolved?.clip) return;
    const currentPanX = resolved.clip.panX ?? 0;
    const currentPanY = resolved.clip.panY ?? 0;

    hasMovedRef.current = false;

    panRef.current = {
      startX: e.clientX, startY: e.clientY,
      panX: currentPanX, panY: currentPanY,
    };
    setShowFrame(true);
  }, [resolved]);

  const onPreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (!resolved?.clip) return;
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      if (Math.hypot(dx, dy) > 8) {
        hasMovedRef.current = true;
      }
      updateActiveClip({
        panX: panRef.current.panX + dx,
        panY: panRef.current.panY + dy,
      });
    }
  }, [resolved, updateActiveClip]);

  const onPreviewMouseUp = useCallback(() => {
    panRef.current = null;
    setTimeout(() => setShowFrame(false), 1200);
  }, []);

  const onPreviewWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-caption-text]") ||
      target.closest("[data-caption-overlay]") ||
      target.closest("[data-interactive-overlay]")
    ) {
      return;
    }
    if (!resolved?.clip) return;
    const currentScale = resolved.clip.scale ?? 1;
    const currentPanX = resolved.clip.panX ?? 0;
    const currentPanY = resolved.clip.panY ?? 0;

    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newScale = Math.max(0.3, Math.min(4, currentScale + delta));
    
    updateActiveClip({
      scale: newScale,
      panX: currentPanX,
      panY: currentPanY,
    });
  }, [resolved, updateActiveClip]);

  const deletableItem = useMemo(() => {
    if (!hasMedia) return null;
    if (focusedTrack === "video") {
      if (resolved?.clip) {
        return { type: "video", id: resolved.clip.id, label: getLang() === "ar" ? "المقطع الحالي" : "Current Clip" };
      }
    } else if (focusedTrack === "caption") {
      const activeCap = captions.find(c => currentTime >= c.start && currentTime <= c.end);
      if (activeCap) {
        return { type: "caption", id: activeCap.id, label: getLang() === "ar" ? "الترجمة الحالية" : "Current Caption" };
      }
    } else if (focusedTrack === "audio") {
      const activeAud = audioTracks.find(a => currentTime >= a.start && currentTime <= a.start + a.duration);
      if (activeAud) {
        return { type: "audio", id: activeAud.id, label: getLang() === "ar" ? "المقطع الصوتي الحالي" : "Current Audio" };
      }
    } else if (focusedTrack === "filter") {
      const activeFilt = filters.find(f => currentTime >= f.start && currentTime <= f.end);
      if (activeFilt) {
        return { type: "filter", id: activeFilt.id, label: getLang() === "ar" ? "الفلتر الحالي" : "Current Filter" };
      }
    } else if (focusedTrack === "vfx") {
      const activeVfxItem = vfx.find(v => currentTime >= v.start && currentTime <= v.end);
      if (activeVfxItem) {
        return { type: "vfx", id: activeVfxItem.id, label: getLang() === "ar" ? "المؤثر البصري الحالي" : "Current VFX" };
      }
    } else if (focusedTrack === "overlay") {
      if (selectedOverlayId) {
        const o = overlays.find(item => item.id === selectedOverlayId);
        if (o) {
          return { type: "overlay", id: o.id, label: getLang() === "ar" ? "الملصق/الطبقة المحددة" : "Selected Overlay" };
        }
      }
      const activeOv = overlays.find(o => currentTime >= o.start && currentTime <= o.end);
      if (activeOv) {
        return { type: "overlay", id: activeOv.id, label: getLang() === "ar" ? "الطبقة الحالية" : "Current Overlay" };
      }
    }
    return null;
  }, [hasMedia, focusedTrack, resolved?.clip, captions, audioTracks, filters, vfx, overlays, selectedOverlayId, currentTime]);

  const handleDeleteItem = useCallback(() => {
    const item = deletableItem;
    if (!item) {
      toast.error(getLang() === "ar" ? "لا يوجد عنصر محدد في هذا المسار لحذفه" : "No element selected on this track to delete");
      return;
    }

    if (item.type === "video") {
      removeClip(item.id);
      toast.success(getLang() === "ar" ? "تم حذف المقطع بنجاح" : "Clip removed successfully");
    } else if (item.type === "caption") {
      removeCaption(item.id);
      toast.success(getLang() === "ar" ? "تم حذف النص/الترجمة بنجاح" : "Caption removed successfully");
    } else if (item.type === "audio") {
      removeAudioTrack(item.id);
      setAudioBeats([]);
      toast.success(getLang() === "ar" ? "تم حذف المقطع الصوتي بنجاح" : "Audio track removed successfully");
    } else if (item.type === "filter") {
      removeFilter(item.id);
      toast.success(getLang() === "ar" ? "تم حذف الفلتر بنجاح" : "Filter removed successfully");
    } else if (item.type === "vfx") {
      removeVfx(item.id);
      toast.success(getLang() === "ar" ? "تم حذف المؤثر البصري بنجاح" : "VFX removed successfully");
    } else if (item.type === "overlay") {
      removeOverlay(item.id);
      if (selectedOverlayId === item.id) {
        setSelectedOverlayId(null);
      }
      toast.success(getLang() === "ar" ? "تم حذف الطبقة/الملصق بنجاح" : "Overlay removed successfully");
    }
    vibrate(20);
  }, [deletableItem, removeClip, removeCaption, removeAudioTrack, removeFilter, removeVfx, removeOverlay, selectedOverlayId, setAudioBeats]);

  const handleRatioChange = (i: number) => {
    setActiveRatio(i);
    setUserHasSetRatio(true);
    vibrate(15);
  };

  const autoDetectRatio = (width: number, height: number, force: boolean = false) => {
    if (!width || !height) return;
    if (userHasSetRatio && !force) return;
    const bestIndex = findClosestRatioIndex(width, height);
    setActiveRatio(bestIndex);
  };

  const tools = [
    { id: "ai", icon: Sparkles, label: getLang() === "ar" ? "أدوات AI" : "AI Tools" },
    { id: "cut", icon: Scissors, label: t("tool.cut") },
    { id: "smart-cut", icon: Zap, label: t("tool.smartCut") },
    { id: "delete", icon: Trash2, label: t("tool.delete") },
    { id: "speed", icon: Gauge, label: t("tool.speed") },
    { id: "transition", icon: Wand2, label: t("tool.transition") },
    { id: "caption", icon: Type, label: t("tool.caption") },
    { id: "music", icon: Music, label: t("tool.music") },
    { id: "filter", icon: Palette, label: t("tool.filter") },
    { id: "vfx", icon: Sparkles, label: t("tool.vfx") },
    { id: "overlay", icon: Layers, label: t("tool.overlay") },
    { id: "cover", icon: Clapperboard, label: t("tool.cover") },
    { id: "ratio", icon: Ratio, label: t("tool.ratio") },
  ];

  // Immediate manual cut at the playhead — no panel
  const handleManualCut = () => {
    splitTrackAt(focusedTrack || "video", currentTime);
  };

  const onToolClick = (id: string) => {
    if (id === "cut") { handleManualCut(); }
    else if (id === "smart-cut") { setFocusedTrack("video"); setShowSmartCut(true); }
    else if (id === "delete") { handleDeleteItem(); }
    else if (id === "ai") { setTool(tool === "ai" ? null : "ai"); setFocusedTrack("video"); }
    else if (id === "keyframe") { setTool(tool === "keyframe" ? null : "keyframe"); setFocusedTrack("video"); }
    else if (id === "speed") { setTool(tool === "speed" ? null : "speed"); setFocusedTrack("video"); }
    else if (id === "cover") { setTool(tool === "cover" ? null : "cover"); }
    else if (id === "caption") { setTool(tool === "caption" ? null : "caption"); setFocusedTrack("caption"); }
    else if (id === "music") { setTool(tool === "music" ? null : "music"); setFocusedTrack("audio"); }
    else if (id === "filter") { setTool(tool === "filter" ? null : "filter"); setFocusedTrack("filter"); }
    else if (id === "vfx") { setTool(tool === "vfx" ? null : "vfx"); setFocusedTrack("vfx"); }
    else if (id === "overlay") { setTool(tool === "overlay" ? null : "overlay"); setFocusedTrack("overlay"); }
    else if (id === "ratio") { setTool(tool === "ratio" ? null : "ratio"); }
    else if (id === "transition") {
      if (clips.length < 2) { toast.error(t("toast.needTwoClips")); return; }
      setTransitionClipId(clips[1].id);
      setTool("transition");
      setFocusedTrack("video");
    }
  };

  // When clicking on video timeline track area, focus it
  const onVideoTrackFocus = useCallback(() => {
    setFocusedTrack("video");
  }, []);

  const onDetectBeats = async () => {
    const tAudio = (selectedAudioTrackId ? audioTracks.find((a) => a.id === selectedAudioTrackId) : null) || audioTracks.find((a) => a.file || a.url);
    if (!tAudio) { toast.error(t("toast.uploadMusicFirst")); return; }
    setDetectingBeats(true);
    setBeatProgress(5);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const info = tAudio.file
        ? await analyzeBeats(tAudio.file, undefined, (p) => setBeatProgress(Math.min(99, Math.round(p))))
        : await analyzeBeatsFromUrl(tAudio.url, undefined, (p) => setBeatProgress(Math.min(99, Math.round(p))));
      const beatsOnTimeline = info.beats
        .filter((b) => b >= tAudio.offset && b <= tAudio.offset + tAudio.duration)
        .map((b) => tAudio.start + (b - tAudio.offset))
        .filter((b) => b > 0 && b < totalDuration);
      
      updateAudioTrack(tAudio.id, { beats: beatsOnTimeline, bpm: info.bpm });
      setAudioBeats(beatsOnTimeline);
      setSelectedAudioTrackId(tAudio.id);
      toast.success(
        getLang() === "ar"
          ? `[${tAudio.name}] BPM ≈ ${info.bpm} — ${beatsOnTimeline.length} ضربة (عرضت على المسار المحدد فقط)`
          : `[${tAudio.name}] BPM ≈ ${info.bpm} — ${beatsOnTimeline.length} beats (mapped to selected track)`
      );
    } catch (e) {
      console.error(e);
      toast.error(t("toast.beatDetectFailed"));
    } finally {
      setDetectingBeats(false);
      setBeatProgress(0);
    }
  };

  const onExport = () => {
    if (!hasMedia) return;
    setShowExportDialog(true);
  };




  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
            <ArrowRight className={`w-5 h-5 text-foreground transition-transform ${isRTL() ? "" : "rotate-180"}`} />
          </button>
          <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-xl border border-border/60">
            <VireonLogo className="w-5 h-5" />
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="font-heading font-bold text-foreground bg-transparent text-center max-w-[120px] text-xs focus:outline-none focus:bg-secondary/80 rounded px-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onExport}
            disabled={!hasMedia}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl gradient-primary glow-primary-sm disabled:opacity-40 font-bold"
          >
            <Download className="w-3.5 h-3.5 text-primary-foreground" />
            <span className="text-[11px] font-bold text-primary-foreground">{t("editor.export")}</span>
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex items-center justify-center p-2 flex-shrink-0" style={{ height: "min(36vh, 260px)" }}>
        {!hasMedia ? (
          <div className="w-full max-w-sm">
            <div className="aspect-video rounded-2xl border-2 border-dashed border-primary/30 bg-card flex flex-col items-center justify-center gap-3 p-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Plus className="w-7 h-7 text-primary" />
              </div>
              <p className="font-heading font-bold text-foreground text-center text-sm">{t("editor.addMedia")}</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <MediaPicker accept="video" className="flex items-center gap-1 px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-[10px] font-bold">
                  <Video className="w-3 h-3" /> {t("editor.video")}
                </MediaPicker>
                <MediaPicker accept="image" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-[10px] font-bold">
                  <ImageIcon className="w-3 h-3" /> {t("editor.photos")}
                </MediaPicker>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1 w-full relative">
            {/* Current Aspect Ratio Overlay Indicator Badge */}
            {activeMedia && (
              <div className="absolute top-1 start-2 z-20 pointer-events-none">
                <div className="px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/20 text-[10px] font-bold text-white shadow-md flex items-center gap-1.5 animate-in fade-in duration-150">
                  <span>{ASPECT_RATIOS[activeRatio]?.emoji || "🖥️"}</span>
                  <span className="font-extrabold">{ASPECT_RATIOS[activeRatio]?.label || "16:9"}</span>
                  <span className="text-white/60 text-[9px] font-medium hidden sm:inline">· {ASPECT_RATIOS[activeRatio]?.primaryPlatform}</span>
                </div>
              </div>
            )}

            {/* AI Processed & Background Toggle Overlay on Active Clip */}
            {resolved?.clip && (resolved.clip.processedUrl || activeMedia?.processedUrl) && (
              <div className="absolute top-1 end-2 z-20 flex items-center gap-1.5 animate-in fade-in duration-200">
                {/* AI / Original Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleClipProcessed(resolved.clip.id);
                  }}
                  className={`px-2 py-0.5 rounded-lg backdrop-blur-md border text-[10px] font-bold shadow-md flex items-center gap-1 transition-all active:scale-95 ${
                    resolved.clip.useProcessed !== false
                      ? "bg-primary/90 text-primary-foreground border-primary/40"
                      : "bg-black/75 text-white/80 border-white/20 hover:text-white"
                  }`}
                  title={
                    resolved.clip.useProcessed !== false
                      ? (isRTL() ? "التبديل إلى الفيديو الأصلي" : "Switch to Original Video")
                      : (isRTL() ? "التبديل إلى نتيجة الذكاء الاصطناعي" : "Switch to AI Processed Video")
                  }
                >
                  <Sparkles className="w-3 h-3" />
                  <span>
                    {resolved.clip.useProcessed !== false
                      ? (isRTL() ? "النتيجة الذكية" : "AI Result")
                      : (isRTL() ? "الأصلي" : "Original")}
                  </span>
                </button>

                {/* Alpha Backdrop Selector (if background removed) */}
                {resolved.clip.hasAlpha && resolved.clip.useProcessed !== false && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const curMode = resolved.clip.previewBgMode || "checkerboard";
                      const modes: Array<"checkerboard" | "green" | "black" | "white"> = ["checkerboard", "green", "black", "white"];
                      const nextIdx = (modes.indexOf(curMode as any) + 1) % modes.length;
                      setClipBgMode(resolved.clip.id, modes[nextIdx]);
                    }}
                    className="px-1.5 py-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/20 text-[10px] font-bold text-white shadow-md flex items-center gap-1 transition-all hover:bg-black/90 active:scale-95"
                    title={isRTL() ? "تغيير خلفية المعاينة للمفرّغ" : "Change transparent backdrop"}
                  >
                    <span className="text-[11px]">
                      {(resolved.clip.previewBgMode || "checkerboard") === "checkerboard" && "🏁"}
                      {resolved.clip.previewBgMode === "green" && "🟩"}
                      {resolved.clip.previewBgMode === "black" && "⬛"}
                      {resolved.clip.previewBgMode === "white" && "⬜"}
                    </span>
                    <span className="text-[9px] font-medium hidden xs:inline">
                      {(resolved.clip.previewBgMode || "checkerboard") === "checkerboard" && (isRTL() ? "شطرنج" : "Alpha")}
                      {resolved.clip.previewBgMode === "green" && (isRTL() ? "كروما" : "Green")}
                      {resolved.clip.previewBgMode === "black" && (isRTL() ? "أسود" : "Black")}
                      {resolved.clip.previewBgMode === "white" && (isRTL() ? "أبيض" : "White")}
                    </span>
                  </button>
                )}
              </div>
            )}

            <div
              ref={previewRef}
              className={`rounded-2xl overflow-hidden relative transition-all duration-200 flex items-center justify-center shadow-2xl ${showFrame ? "border-2 border-primary/80 ring-2 ring-primary/30" : "border border-border/70"}`}
              style={{
                aspectRatio: `${ASPECT_RATIOS[activeRatio]?.w ?? 16} / ${ASPECT_RATIOS[activeRatio]?.h ?? 9}`,
                height: "100%",
                maxHeight: "100%",
                maxWidth: "100%",
                width: "auto",
                flexGrow: 0,
                flexShrink: 1,
                ...getPreviewBgStyle(),
              }}
              onTouchStart={onPreviewTouchStart}
              onTouchMove={onPreviewTouchMove}
              onTouchEnd={onPreviewTouchEnd}
              onMouseDown={onPreviewMouseDown}
              onMouseMove={onPreviewMouseMove}
              onMouseUp={onPreviewMouseUp}
              onMouseLeave={onPreviewMouseUp}
              onWheel={onPreviewWheel}
            >
              {/* Blurred Mirror Background Layer for Social Media / YouTube framing */}
              {fitMode === "blur" && activeMedia && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50 scale-125 blur-xl select-none">
                  {activeMedia.type === "video" ? (
                    <video src={activeMedia.url} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={activeMedia.url} className="w-full h-full object-cover" alt="" />
                  )}
                </div>
              )}

              <div style={{
                transform: `scale(${activeScale}) translate(${activePan.x / activeScale}px, ${activePan.y / activeScale}px) rotate(${activeRotation}deg)`,
                transformOrigin: "center center",
                width: "100%", height: "100%",
                position: "relative",
                transition: (pinchRef.current || panRef.current) ? "none" : "transform 200ms ease-out",
              }}>
                {/* Ping-Pong Video Player Slot A */}
                <video 
                  ref={videoRefA} 
                  className={`absolute inset-0 w-full h-full ${fitMode === "cover" ? "object-cover" : "object-contain"} ${activeSlot === 0 ? transitionClass : ""}`} 
                  playsInline 
                  preload="auto" 
                  disablePictureInPicture
                  onLoadedData={() => {
                    if (activeSlot === 0) {
                      setMediaReady(true);
                      setMediaError(false);
                    }
                  }}
                  onCanPlay={() => {
                    if (activeSlot === 0) {
                      setMediaReady(true);
                      setMediaError(false);
                    }
                  }}
                  onSeeked={() => {
                    if (activeSlot === 0) {
                      setMediaReady(true);
                      setMediaError(false);
                    }
                  }}
                  onError={() => {
                    if (activeSlot === 0) {
                      setMediaReady(true);
                      setMediaError(true);
                    }
                  }}
                  onLoadedMetadata={(e) => {
                    if (activeSlot === 0) {
                      setMediaReady(true);
                      setMediaError(false);
                      autoDetectRatio(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
                    }
                  }}
                  style={{
                    ...transitionStyle,
                    ...cropStyle,
                    opacity: activeSlot === 0 && activeMedia?.type === "video" ? activeOpacity : 0,
                    pointerEvents: activeSlot === 0 ? "auto" : "none",
                    zIndex: activeSlot === 0 ? 2 : 1,
                    filter: [activeFilterStyle, activeVfxStyle.filter].filter(Boolean).join(" ") || undefined,
                    transform: `${activeVfxStyle.transform || ""} scaleX(${activeFlipH ? -1 : 1}) scaleY(${activeFlipV ? -1 : 1})`,
                    ...activeVfxStyle.imageStyle,
                    willChange: "transform, filter",
                    backfaceVisibility: "hidden"
                  }} 
                />

                {/* Ping-Pong Video Player Slot B */}
                <video 
                  ref={videoRefB} 
                  className={`absolute inset-0 w-full h-full ${fitMode === "cover" ? "object-cover" : "object-contain"} ${activeSlot === 1 ? transitionClass : ""}`} 
                  playsInline 
                  preload="auto" 
                  disablePictureInPicture
                  onLoadedData={() => {
                    if (activeSlot === 1) {
                      setMediaReady(true);
                      setMediaError(false);
                    }
                  }}
                  onCanPlay={() => {
                    if (activeSlot === 1) {
                      setMediaReady(true);
                      setMediaError(false);
                    }
                  }}
                  onSeeked={() => {
                    if (activeSlot === 1) {
                      setMediaReady(true);
                      setMediaError(false);
                    }
                  }}
                  onError={() => {
                    if (activeSlot === 1) {
                      setMediaReady(true);
                      setMediaError(true);
                    }
                  }}
                  onLoadedMetadata={(e) => {
                    if (activeSlot === 1) {
                      setMediaReady(true);
                      setMediaError(false);
                      autoDetectRatio(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
                    }
                  }}
                  style={{
                    ...transitionStyle,
                    ...cropStyle,
                    opacity: activeSlot === 1 && activeMedia?.type === "video" ? activeOpacity : 0,
                    pointerEvents: activeSlot === 1 ? "auto" : "none",
                    zIndex: activeSlot === 1 ? 2 : 1,
                    filter: [activeFilterStyle, activeVfxStyle.filter].filter(Boolean).join(" ") || undefined,
                    transform: `${activeVfxStyle.transform || ""} scaleX(${activeFlipH ? -1 : 1}) scaleY(${activeFlipV ? -1 : 1})`,
                    ...activeVfxStyle.imageStyle,
                    willChange: "transform, filter",
                    backfaceVisibility: "hidden"
                  }} 
                />

                {activeMedia?.type === "image" ? (
                  <img src={activeMedia.url} alt={activeMedia.name} className={`absolute inset-0 w-full h-full ${fitMode === "cover" ? "object-cover" : "object-contain"} ${transitionClass}`}
                    onLoad={(e) => {
                      setMediaReady(true);
                      setMediaError(false);
                      const img = e.currentTarget;
                      autoDetectRatio(img.naturalWidth, img.naturalHeight);
                    }}
                    onError={() => {
                      setMediaReady(true);
                      setMediaError(true);
                    }}
                    style={{
                      ...transitionStyle,
                      ...cropStyle,
                      opacity: activeOpacity,
                      zIndex: 3,
                      filter: [activeFilterStyle, activeVfxStyle.filter].filter(Boolean).join(" ") || undefined,
                      transform: `${activeVfxStyle.transform || ""} scaleX(${activeFlipH ? -1 : 1}) scaleY(${activeFlipV ? -1 : 1})`,
                      ...activeVfxStyle.imageStyle
                    }} />
                ) : null}
              </div>

              {/* Social Media & Video Publishing Safe Zones Overlay */}
              {showSafeZones && (ASPECT_RATIOS[activeRatio]?.hasSafeZones) && (
                <div className="absolute inset-0 pointer-events-none z-25 flex flex-col justify-between p-2 select-none animate-in fade-in duration-200">
                  {ASPECT_RATIOS[activeRatio]?.safeZoneType === "reels_tiktok" && (
                    <>
                      {/* Top bar safe margin */}
                      <div className="h-[14%] w-full border-b border-dashed border-red-500/50 bg-red-500/10 flex items-start justify-center pt-1">
                        <span className="text-[8px] font-bold text-red-300 px-1.5 py-0.5 rounded bg-black/80 shadow">
                          {isRTL() ? "أزرار التطبيق العلوية" : "Top UI Margin"}
                        </span>
                      </div>
                      {/* Middle safe area with right action buttons indicator */}
                      <div className="flex-1 w-full flex justify-between relative items-center">
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-[9px] font-black text-emerald-400 bg-black/80 px-2 py-0.5 rounded-full border border-emerald-500/40 shadow">
                            {isRTL() ? "✓ منطقة أمان النصوص والملصقات" : "✓ Safe Zone for Text & Stickers"}
                          </span>
                        </div>
                        {/* Right rail icons */}
                        <div className="w-[18%] h-full border-s border-dashed border-red-500/50 bg-red-500/10 flex flex-col items-center justify-center gap-1">
                          <span className="text-[7px] font-bold text-red-300 [writing-mode:vertical-rl] rotate-180">
                            {isRTL() ? "أزرار التفاعل" : "Action Icons"}
                          </span>
                        </div>
                      </div>
                      {/* Bottom bar safe margin */}
                      <div className="h-[22%] w-full border-t border-dashed border-red-500/50 bg-red-500/10 flex items-center justify-center pb-1">
                        <span className="text-[8px] font-bold text-red-300 px-1.5 py-0.5 rounded bg-black/80 shadow">
                          {isRTL() ? "منطقة الوصف والصوت" : "Bottom Caption Margin"}
                        </span>
                      </div>
                    </>
                  )}
                  {ASPECT_RATIOS[activeRatio]?.safeZoneType === "youtube_safe" && (
                    <div className="absolute inset-[6%] border border-dashed border-amber-400/70 rounded-xl flex items-center justify-center">
                      <span className="text-[9px] font-bold text-amber-300 bg-black/80 px-2.5 py-0.5 rounded shadow">
                        {isRTL() ? "منطقة أمان يوتيوب (Title Safe 90%)" : "YouTube Safe Area (90%)"}
                      </span>
                    </div>
                  )}
                  {ASPECT_RATIOS[activeRatio]?.safeZoneType === "instagram_grid" && (
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      <div className="border-r border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div />
                    </div>
                  )}
                </div>
              )}

              {!mediaReady && !mediaError && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center z-30 animate-in fade-in duration-200">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              )}

              {mediaError && (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 z-30 text-center gap-2">
                  <Video className="w-8 h-8 text-rose-400 opacity-80" />
                  <p className="text-xs font-bold text-foreground">
                    {isRTL() ? "تعذر تشغيل هذا المقطع" : "Unable to play clip"}
                  </p>
                  <p className="text-[10px] text-muted-foreground max-w-[200px]">
                    {isRTL() ? "يرجى استبدال المقطع بملف فيديو صالح" : "Please replace clip with a valid file"}
                  </p>
                </div>
              )}

              {/* Overlay items with interactive touch controls */}
              {activeOverlays.map((o) => {
                const localTime = currentTime - o.start;
                const interpolatedOverlay = {
                  ...o,
                  x: interpolateKeyframes(o, "x", localTime, o.x),
                  y: interpolateKeyframes(o, "y", localTime, o.y),
                  scale: interpolateKeyframes(o, "scale", localTime, o.scale),
                  rotation: interpolateKeyframes(o, "rotation", localTime, o.rotation ?? 0),
                  opacity: interpolateKeyframes(o, "opacity", localTime, o.opacity ?? 1),
                };
                return (
                  <InteractiveOverlay
                    key={o.id}
                    overlay={interpolatedOverlay}
                    selected={selectedOverlayId === o.id}
                    containerRef={previewRef}
                    onSelect={setSelectedOverlayId}
                    onUpdate={handleUpdateOverlay}
                  />
                );
              })}
              {/* VFX overlay */}
              {activeVfxStyle.overlayStyle && (
                <div data-vfx-overlay className="absolute inset-0 pointer-events-none z-10" style={activeVfxStyle.overlayStyle} />
              )}
              {/* Frame border overlay when pinching/transforming */}
              {showFrame && (
                <div className="absolute inset-0 pointer-events-none z-30 transition-all duration-150">
                  {/* Transformed Bounding Box Frame */}
                  <div
                    className="absolute inset-0 border-2 border-cyan-400 shadow-[0_0_16px_rgba(6,182,212,0.65)] rounded-xl"
                    style={{
                      transform: `scale(${activeScale}) translate(${activePan.x / activeScale}px, ${activePan.y / activeScale}px) rotate(${activeRotation}deg)`,
                      transformOrigin: "center center",
                    }}
                  >
                    {/* 4 Corner Handle Dots */}
                    <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-md" />
                    <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-md" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-md" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-md" />

                    {/* Rotation Degree Pill (Top Center) */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-950/90 border border-cyan-400/80 px-2.5 py-0.5 rounded-full shadow-xl">
                      <RotateCw className="w-3 h-3 text-cyan-300" />
                      <span className="text-[10px] text-cyan-200 font-extrabold font-mono">
                        {Math.round(activeRotation)}°
                      </span>
                    </div>

                    {/* Scale Percentage Pill (Bottom Center) */}
                    {Math.round(activeScale * 100) !== 100 && (
                      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-950/90 border border-cyan-400/80 px-2.5 py-0.5 rounded-full shadow-xl">
                        <Maximize2 className="w-3 h-3 text-cyan-300" />
                        <span className="text-[10px] text-cyan-200 font-extrabold font-mono">
                          {Math.round(activeScale * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Center Alignment Snap Lines */}
                  {Math.abs(activePan.x) < 8 && (
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-cyan-400 border-r border-dashed border-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.9)] z-40" />
                  )}
                  {Math.abs(activePan.y) < 8 && (
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-cyan-400 border-b border-dashed border-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.9)] z-40" />
                  )}
                </div>
              )}
              {resolved && (
                <TransitionFx
                  triggerKey={resolved.clip.id}
                  type={resolved.clip.transitionIn?.type ?? "none"}
                  durationMs={Math.round((resolved.clip.transitionIn?.duration ?? 0.5) * 1000)}
                />
              )}
              <CaptionOverlay currentTime={currentTime} />
            </div>
          </div>
        )}
      </div>

      {/* Audio playback engine */}
      <AudioPlayback tracks={audioTracks} currentTime={currentTime} isPlaying={isPlaying} />

      {/* Bottom workspace */}
      <div className="relative bg-card border-t border-border flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Playback controls + time display */}
        <div className="flex items-center justify-center gap-3 py-1.5 px-4 flex-shrink-0 bg-secondary/10 rounded-xl mx-3 my-1 border border-border/20">
          {/* Undo Button */}
          <button
            onClick={undo}
            disabled={!canUndo}
            aria-label={t("editor.undo")}
            className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform shadow-sm"
          >
            <Undo2 className="w-4 h-4 text-foreground" />
          </button>

          {/* Current Time (Timer Start) */}
          {hasMedia && (
            <span className="text-xs font-mono font-medium text-foreground min-w-[36px] text-right">
              {formatTime(currentTime)}
            </span>
          )}

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay} disabled={!hasMedia}
            className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center glow-primary disabled:opacity-40 active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause className="w-4 h-4 text-primary-foreground" /> : <Play className="w-4 h-4 text-primary-foreground ml-0.5" />}
          </button>

          {/* Keyframes Toggle Button — ⬥ Diamond / Minus icon */}
          {hasMedia && (
            <button
              onClick={togglePlayheadKeyframes}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-90 ${
                hasKfAtPlayhead 
                  ? "bg-rose-500 text-white shadow-md shadow-rose-500/20 ring-2 ring-rose-400/40 scale-105" 
                  : "bg-secondary text-primary hover:bg-secondary/80"
              }`}
              title={
                hasKfAtPlayhead 
                  ? (getLang() === "ar" ? "إزالة الإطار المفتاحي -" : "Remove Keyframe -")
                  : (getLang() === "ar" ? "إضافة إطار مفتاحي ⬥" : "Add Keyframe ⬥")
              }
            >
              {hasKfAtPlayhead ? (
                <Minus className="w-4 h-4 stroke-[3]" />
              ) : (
                <Diamond className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Total Duration (Timer End) */}
          {hasMedia && (
            <span className="text-xs font-mono font-medium text-muted-foreground min-w-[36px] text-left">
              {formatTime(totalDuration)}
            </span>
          )}

          {/* Redo Button */}
          <button
            onClick={redo}
            disabled={!canRedo}
            aria-label={t("editor.redo")}
            className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform shadow-sm"
          >
            <Redo2 className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* All tracks in a scrollable area with unified playhead */}
        {hasMedia && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain" ref={tracksContainerRef}>
            <div className="relative min-h-full">
              {/* Unified playhead line — spans all tracks and dynamically stretches as new tracks are added */}
              <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-primary z-40">
                <div className="w-3 h-3 -ml-[5px] -mt-0.5 rounded-full bg-primary glow-primary-sm sticky top-0" />
              </div>

              {/* Video timeline — click to focus */}
              <div onClick={onVideoTrackFocus}>
                <Timeline
                  currentTime={currentTime}
                  pxPerSec={pxPerSec}
                  onSeek={seek}
                  isPlaying={isPlaying}
                  onUserScrub={(s) => { if (s && isPlaying) setIsPlaying(false); }}
                  onOpenTransition={(clipId) => { setTransitionClipId(clipId); setTool("transition"); }}
                  onWidthChange={setTlWidth}
                  onPxPerSecChange={setPxPerSec}
                  focused={focusedTrack === "video"}
                  onFocus={onVideoTrackFocus}
                  hidePlayhead
                  onOpenCover={() => { setTool(tool === "cover" ? null : "cover"); }}
                />
              </div>

              {/* Caption track — Text track (Always shown by default) */}
              <div onClick={() => setFocusedTrack("caption")}>
                <CaptionTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "caption"} onSeek={seek} onAddClick={() => setTool("caption")} onFocus={() => setFocusedTrack("caption")} />
              </div>

              {/* Audio track — Music track (Always shown by default) */}
              <div onClick={() => setFocusedTrack("audio")}>
                <AudioTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "audio"} onSeek={seek} onAddClick={() => setTool("music")} onFocus={() => setFocusedTrack("audio")} />
              </div>

              {/* Filter track — Appears when filters exist or focused */}
              {(filters.length > 0 || focusedTrack === "filter") && (
                <div onClick={() => setFocusedTrack("filter")}>
                  <FilterTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "filter"} onSeek={seek} onAddClick={() => setTool("filter")} onFocus={() => setFocusedTrack("filter")} />
                </div>
              )}

              {/* VFX track — Appears when VFX exist or focused */}
              {(vfx.length > 0 || focusedTrack === "vfx") && (
                <div onClick={() => setFocusedTrack("vfx")}>
                  <VfxTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "vfx"} onSeek={seek} onAddClick={() => setTool("vfx")} onFocus={() => setFocusedTrack("vfx")} />
                </div>
              )}

              {/* Overlay track — Appears when overlays exist or focused */}
              {(overlays.length > 0 || focusedTrack === "overlay") && (
                <div onClick={() => setFocusedTrack("overlay")}>
                  <OverlayTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "overlay"} onSeek={seek} onAddClick={() => setTool("overlay")} onFocus={() => setFocusedTrack("overlay")} />
                </div>
              )}

              <div className="px-3 py-1 flex items-center justify-between border-t border-border/40 text-[9px] text-muted-foreground">
                <span>
                  {clips.length} {getLang() === "ar" ? "مقاطع" : clips.length === 1 ? "clip" : "clips"} · {totalDuration.toFixed(1)}s
                </span>
                <span>
                  {getLang() === "ar" ? "اسحب للتصفح والتحكم" : "Drag to scrub timeline"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Tools Bar */}
        <div className="flex-shrink-0 border-t border-border">
          <div className="flex overflow-x-auto no-scrollbar gap-1.5 px-2 py-2">
            {tools.map((toolItem) => {
              const isDelete = toolItem.id === "delete";
              const isDeleteEnabled = isDelete && !!deletableItem;
              return (
                <button
                  key={toolItem.id}
                  onClick={() => onToolClick(toolItem.id)}
                  disabled={isDelete && !isDeleteEnabled}
                  className={`flex flex-col items-center gap-1 py-2 px-3.5 rounded-2xl flex-shrink-0 min-w-[58px] transition-all active:scale-95 ${
                    isDelete 
                      ? isDeleteEnabled
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 ring-1 ring-red-500/30 font-bold scale-105"
                        : "text-muted-foreground/30 bg-secondary/20 cursor-not-allowed"
                      : tool === toolItem.id 
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40 font-bold" 
                        : "text-muted-foreground bg-secondary/40 hover:bg-secondary/60"
                  }`}
                  title={
                    isDelete
                      ? isDeleteEnabled
                        ? `${t("tool.delete")} ${deletableItem.label}`
                        : (getLang() === "ar" ? "حذف العنصر (اختر مساراً وعنصراً أولاً)" : "Delete element (Select track and element first)")
                      : undefined
                  }
                >
                  <toolItem.icon className="w-6 h-6" />
                  <span className="text-[10px] font-semibold whitespace-nowrap">{toolItem.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panels — pop from bottom */}
        {tool === "ai" && (
          <AIToolsPanel
            open={tool === "ai"}
            onClose={() => setTool(null)}
            mediaType={activeMedia?.type === "image" ? "image" : "video"}
            targetClipId={resolved?.clip?.id}
            targetMediaId={resolved?.clip?.mediaId || activeMedia?.id}
            currentMediaUrlOrBase64={
              resolved?.clip
                ? resolvePreviewSource(resolved.clip.id) || activeMedia?.processedUrl || activeMedia?.url || undefined
                : activeMedia?.processedUrl || activeMedia?.url || undefined
            }
            onApplyResult={async (resData) => {
              if (resData?.outputVideoBase64OrUrl) {
                const targetClip = (resData.targetClipId ? clips.find((c) => c.id === resData.targetClipId) : null) || resolved?.clip || clips[0];
                const targetClipId = targetClip?.id;
                const blob = resData.blob || resData.outputBlob;
                const applied = await applyProcessedVideoToEditor(
                  blob || resData.outputVideoBase64OrUrl,
                  targetClipId,
                  {
                    hasAlpha: resData.hasAlpha,
                  }
                );
                if (applied) {
                  playSfx("success");
                  toast.success(
                    getLang() === "ar"
                      ? "تم تطبيق الفيديو المعالج وتحديث شاشة المعاينة بنجاح!"
                      : "Processed video applied and verified in preview!"
                  );
                  return true;
                }
                return false;
              } else if (resData?.outputImageBase64OrUrl && activeMedia) {
                updateMediaItem(activeMedia.id, { url: resData.outputImageBase64OrUrl });
                toast.success(getLang() === "ar" ? "تم تحديث الصورة بنتيجة المعالجة الذكية!" : "Updated image with AI result!");
                return true;
              }
              return false;
            }}
          />
        )}
        {tool === "speed" && <SpeedPanel open={tool === "speed"} onClose={() => setTool(null)} currentTime={currentTime} />}
        {tool === "cover" && <CoverPicker open={tool === "cover"} onClose={() => setTool(null)} videoRef={videoRef as React.RefObject<HTMLVideoElement>} />}
        {tool === "transition" && <TransitionPanel open={tool === "transition"} clipId={transitionClipId} onClose={() => setTool(null)} />}
        {tool === "caption" && <CaptionPanel open={tool === "caption"} onClose={() => setTool(null)} currentTime={currentTime} />}
        {tool === "music" && <MusicPanel open={tool === "music"} onClose={() => setTool(null)} currentTime={currentTime} />}
        {tool === "filter" && <FilterPanel open={tool === "filter"} onClose={() => setTool(null)} currentTime={currentTime} />}
        {tool === "vfx" && <VfxPanel open={tool === "vfx"} onClose={() => setTool(null)} currentTime={currentTime} />}
        {tool === "overlay" && <OverlayPanel open={tool === "overlay"} onClose={() => setTool(null)} currentTime={currentTime} />}
        {tool === "ratio" && (
          <RatioPanel
            open={tool === "ratio"}
            onClose={() => setTool(null)}
            activeRatio={activeRatio}
            onRatioChange={handleRatioChange}
            onOpenCrop={() => setShowCropOverlay(true)}
            activeClip={resolved?.clip ?? null}
            onUpdateActiveClip={updateActiveClip}
            showSafeZones={showSafeZones}
            onToggleSafeZones={setShowSafeZones}
            fitMode={fitMode}
            onFitModeChange={setFitMode}
            onAutoDetect={() => {
              if (activeMedia?.width && activeMedia?.height) {
                autoDetectRatio(activeMedia.width, activeMedia.height, true);
              } else if (videoRef.current?.videoWidth && videoRef.current?.videoHeight) {
                autoDetectRatio(videoRef.current.videoWidth, videoRef.current.videoHeight, true);
              }
              toast.success(isRTL() ? "تم ضبط الأبعاد تلقائياً حسب المقطع الأصلي" : "Auto-detected original aspect ratio");
            }}
          />
        )}
      </div>

      {/* Smart cut animated overlay */}
      <SmartCutOverlay open={showSmartCut} onClose={() => setShowSmartCut(false)} />

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        projectName={projectName}
        totalDuration={totalDuration}
        previewRef={previewRef as React.RefObject<HTMLDivElement>}
        videoRef={videoRef as React.RefObject<HTMLVideoElement>}
        onPlayForExport={() => setIsPlaying(true)}
        onStopPlay={() => setIsPlaying(false)}
        seekToStart={() => seek(0)}
        activeRatio={activeRatio}
      />

      {/* Publish Template Dialog */}
      <PublishTemplateDialog
        open={showPublishTemplateDialog}
        onClose={() => setShowPublishTemplateDialog(false)}
        previewRef={previewRef as React.RefObject<HTMLDivElement>}
        videoRef={videoRef as React.RefObject<HTMLVideoElement>}
        activeRatio={activeRatio}
      />

      {/* Crop Media Overlay */}
      <CropOverlay
        open={showCropOverlay}
        onClose={() => setShowCropOverlay(false)}
        clip={resolved?.clip ?? null}
        mediaItem={activeMedia ?? null}
        onApplyCrop={handleApplyCrop}
      />
    </div>
  );
};

export default EditorScreen;
