import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ArrowRight, Play, Pause, Scissors, Type, Music, Sparkles, Ratio, Download,
  Image as ImageIcon, Video, Plus, Wand2, Loader2, Palette, Activity, Layers,
  Gauge, Zap, Clapperboard, Undo2, Redo2, Eye, EyeOff, RotateCw, Diamond, Minus, Trash2,
} from "lucide-react";
import { useMedia, TransitionType, Clip, interpolateKeyframes } from "@/context/MediaContext";
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
import { toast } from "sonner";
import { analyzeBeats } from "@/lib/audioAnalysis";
import { t, getLang, isRTL } from "@/lib/i18n";
import { VireonLogo } from "@/components/VireonLogo";

interface EditorScreenProps {
  onBack: () => void;
}

const aspectRatios = [
  { label: "16:9", w: 16, h: 9 }, 
  { label: "9:16", w: 9, h: 16 },
  { label: "1:1", w: 1, h: 1 }, 
  { label: "4:5", w: 4, h: 5 },
  { label: "21:9", w: 21, h: 9 },
  { label: "4:3", w: 4, h: 3 },
  { label: "9:21", w: 9, h: 21 },
  { label: "2.39:1", w: 2.39, h: 1 },
  { label: "2:1", w: 2, h: 1 },
  { label: "16:10", w: 16, h: 10 },
  { label: "3:2", w: 3, h: 2 },
  { label: "5:4", w: 5, h: 4 },
];

type Tool = "transition" | "caption" | "music" | "filter" | "vfx" | "ratio" | "overlay" | "speed" | "cover" | null;

// Which timeline track is focused — determines which handles are visible
type FocusedTrack = "video" | "caption" | "audio" | "filter" | "vfx" | "overlay" | null;

const EditorScreen = ({ onBack }: EditorScreenProps) => {
  const {
    media = [], clips = [], totalDuration, getMediaById, resolveTimelineTime,
    audioTracks = [], videoMuted, videoVolume, projectName, setProjectName,
    splitClipsAtBeats, filters = [], vfx = [], overlays = [], setAudioBeats, updateOverlay, setOverlays,
    splitTrackAt, coverImage, undo, redo, canUndo, canRedo, setClips,
    captions = [], captionStyle, setCaptions, setFilters, setVfx, updateAudioTrack,
    removeClip, removeCaption, removeAudioTrack, removeFilter, removeVfx, removeOverlay,
  } = useMedia();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showSmartCut, setShowSmartCut] = useState(false);
  const [activeRatio, setActiveRatio] = useState(0);
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
  const videoRef = useRef<HTMLVideoElement>(null);
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
    if (compareRaw) return { transform: "", overlayStyle: null as React.CSSProperties | null, filter: "", imageStyle: null as React.CSSProperties | null };
    const active = vfx.filter((v) => currentTime >= v.start && currentTime <= v.end);
    if (!active.length) return { transform: "", overlayStyle: null as React.CSSProperties | null, filter: "", imageStyle: null as React.CSSProperties | null };
    
    const transforms: string[] = [];
    const filters: string[] = [];
    let overlayStyle: React.CSSProperties | null = null;
    let imageStyle: React.CSSProperties | null = null;

    for (const v of active) {
      const localTime = currentTime - v.start;
      const i = interpolateKeyframes(v, "intensity", localTime, v.intensity);
      switch (v.type) {
        case "shake":
          transforms.push(`translate(${Math.sin(currentTime * 50) * i * 6}px, ${Math.cos(currentTime * 40) * i * 4}px)`);
          break;
        case "shake-v":
          transforms.push(`translate(0, ${Math.sin(currentTime * 45) * i * 8}px)`);
          break;
        case "bounce":
          transforms.push(`translateY(${Math.abs(Math.sin(currentTime * 6)) * i * 20}px)`);
          break;
        case "swing":
          transforms.push(`rotate(${Math.sin(currentTime * 3) * i * 12}deg)`);
          break;
        case "heartbeat":
          transforms.push(`scale(${1 + Math.abs(Math.sin(currentTime * 5)) * i * 0.12})`);
          break;
        case "prism":
          filters.push(`hue-rotate(${currentTime * 120}deg)`);
          break;
        case "chromatic":
          overlayStyle = { backgroundColor: `rgba(255,0,0,${i * 0.15})` };
          transforms.push(`translateX(${Math.sin(currentTime * 20) * i * 3}px)`);
          filters.push(`hue-rotate(${Math.sin(currentTime * 5) * i * 30}deg)`);
          break;
        case "zoom-pulse":
          transforms.push(`scale(${1 + Math.sin(currentTime * 8) * i * 0.15})`);
          break;
        case "rotate-3d":
          transforms.push(`perspective(400px) rotateY(${Math.sin(currentTime * 3) * i * 20}deg)`);
          break;
        case "flash":
          overlayStyle = { backgroundColor: `rgba(255,255,255,${Math.max(0, Math.sin(currentTime * 12) * i * 0.7)})` };
          break;
        case "light-leak":
          overlayStyle = {
            background: `radial-gradient(circle at ${50 + Math.sin(currentTime * 2) * 20}% ${30 + Math.cos(currentTime * 3) * 15}%, rgba(249,115,22,${i * 0.45}) 0%, rgba(236,72,153,${i * 0.2}) 40%, transparent 75%)`
          };
          break;
        case "glitch":
          transforms.push(`translate(${Math.random() * i * 8 - i * 4}px, 0) skewX(${Math.random() * i * 4 - i * 2}deg)`);
          filters.push(`hue-rotate(${Math.random() * i * 180}deg) contrast(1.2)`);
          break;
        case "rgb-split":
          filters.push(`drop-shadow(${i * 6 * Math.sin(currentTime * 15)}px 0px 0px rgba(255,0,0,0.7)) drop-shadow(${-i * 6 * Math.sin(currentTime * 15)}px 0px 0px rgba(0,255,255,0.7))`);
          break;
        case "vhs":
          overlayStyle = {
            background: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 255, 0, 0.06))",
            backgroundSize: "100% 4px, 6px 100%",
            pointerEvents: "none"
          };
          filters.push("contrast(1.1) brightness(1.05) saturate(1.25)");
          transforms.push(`translateY(${(Math.random() - 0.5) * i * 1.5}px) scale(${1 + i * 0.015})`);
          break;
        case "scan-lines":
          overlayStyle = {
            background: `repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,${0.18 * i}) 2px, rgba(0,0,0,0) 4px)`,
            pointerEvents: "none"
          };
          break;
        case "pixelate":
          filters.push("contrast(1.2) saturate(1.35) brightness(1.05)");
          imageStyle = { imageRendering: "pixelated" };
          break;
        case "film-grain":
          overlayStyle = {
            background: "radial-gradient(circle, transparent 50%, rgba(0,0,0,0.1) 100%)",
            opacity: 0.5,
            pointerEvents: "none"
          };
          filters.push(`contrast(${1 + i * 0.15 + Math.sin(currentTime * 30) * 0.05 * i})`);
          break;
        case "particles":
          overlayStyle = {
            background: "radial-gradient(circle at center, transparent 30%, rgba(251,191,36,0.15) 100%)",
            pointerEvents: "none"
          };
          filters.push(`saturate(${1 + i * 0.3})`);
          break;
        default:
          break;
      }
    }
    return {
      transform: transforms.join(" "),
      overlayStyle,
      filter: filters.join(" "),
      imageStyle
    };
  }, [vfx, currentTime, compareRaw]);

  // Active overlays for preview
  const activeOverlays = useMemo(() => {
    return overlays.filter((o) => currentTime >= o.start && currentTime <= o.end);
  }, [overlays, currentTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !resolved || !activeMedia || activeMedia.type !== "video") return;
    if (v.src !== activeMedia.url) {
      v.src = activeMedia.url;
      v.load(); // Force immediate load of the new source to speed up metadata & first-frame render
    }
    const target = resolved.mediaTime;
    if (Math.abs(v.currentTime - target) > 0.25) {
      try { v.currentTime = target; } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.clip.id, activeMedia?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = videoMuted;
    v.volume = videoVolume * activeVolume;
  }, [videoMuted, videoVolume, activeVolume, activeMedia?.id]);

  // Apply per-clip playback speed to the video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = resolved?.clip.speed && resolved.clip.speed > 0 ? resolved.clip.speed : 1;
  }, [resolved?.clip.id, resolved?.clip.speed, activeMedia?.id]);

  useEffect(() => {
    if (!isPlaying || !hasMedia) return;
    lastTickRef.current = performance.now();
    const v = videoRef.current;
    if (v && activeMedia?.type === "video") {
      v.play().catch(() => {
        setIsPlaying(false);
        isPlayingRef.current = false;
      });
    }

    const tick = (now: number) => {
      if (!isPlayingRef.current) return;

      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const videoEl = videoRef.current;
      if (videoEl && activeMedia?.type === "video" && !videoEl.paused && !videoEl.seeking) {
        // Find current active clip's layout to map real video currentTime back to timeline space
        const r = resolveTimelineTime(currentTimeRef.current);
        if (r && r.clip.mediaId === activeMedia.id) {
          const c = r.clip;
          const sp = c.speed && c.speed > 0 ? c.speed : 1;
          const localT = (videoEl.currentTime - c.in) / sp;
          const realTimelineTime = r.clipStart + localT;

          if (realTimelineTime >= totalDuration) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            setCurrentTime(0);
            currentTimeRef.current = 0;
          } else {
            setCurrentTime(realTimelineTime);
            currentTimeRef.current = realTimelineTime;
          }
        } else {
          // Fallback timer if clip is not resolved or not matching
          setCurrentTime((t) => {
            const next = t + dt;
            if (next >= totalDuration) {
              setIsPlaying(false);
              isPlayingRef.current = false;
              currentTimeRef.current = 0;
              return 0;
            }
            currentTimeRef.current = next;
            return next;
          });
        }
      } else if (!videoEl || activeMedia?.type !== "video" || videoEl.paused) {
        // Fallback timer for images or when video is not playing
        setCurrentTime((t) => {
          const next = t + dt;
          if (next >= totalDuration) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            currentTimeRef.current = 0;
            return 0;
          }
          currentTimeRef.current = next;
          return next;
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (v) v.pause();
    };
  }, [isPlaying, hasMedia, totalDuration, activeMedia?.id, activeMedia?.type, resolveTimelineTime]);

  const seek = useCallback((t: number) => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentTime(t);
    currentTimeRef.current = t;
    const r = resolveTimelineTime(t);
    const v = videoRef.current;
    if (v) {
      try { v.pause(); } catch {}
    }
    const m = r ? getMediaById(r.clip.mediaId) : null;
    if (v && m?.type === "video") {
      if (v.src !== m.url) v.src = m.url;
      try { v.currentTime = r!.mediaTime; } catch {}
    }
  }, [resolveTimelineTime, getMediaById]);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
    return `${min}:${sec.toString().padStart(2, "0")}.${ms}`;
  };

  const togglePlay = () => {
    if (hasMedia) {
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
    setShowFrame(false);
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
    setShowFrame(false);
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
  }, [deletableItem, removeClip, removeCaption, removeAudioTrack, removeFilter, removeVfx, removeOverlay, selectedOverlayId]);

  const handleRatioChange = (i: number) => {
    setActiveRatio(i);
    vibrate(15);
  };

  const autoDetectRatio = (width: number, height: number) => {
    if (!width || !height) return;
    const mediaRatio = width / height;
    let bestIndex = 0;
    let minDiff = Infinity;
    aspectRatios.forEach((r, idx) => {
      const diff = Math.abs((r.w / r.h) - mediaRatio);
      if (diff < minDiff) {
        minDiff = diff;
        bestIndex = idx;
      }
    });
    setActiveRatio(bestIndex);
  };

  const tools = [
    { id: "cut", icon: Scissors, label: t("tool.cut") },
    { id: "smart-cut", icon: Zap, label: t("tool.smartCut") },
    { id: "delete", icon: Trash2, label: getLang() === "ar" ? "حذف سريع" : "Quick Delete" },
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
    const tAudio = audioTracks.find((a) => a.file || a.url);
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
      setAudioBeats(beatsOnTimeline);
      toast.success(
        getLang() === "ar"
          ? `BPM ≈ ${info.bpm} — ${beatsOnTimeline.length} ضربة (عرضت على المسار)`
          : `BPM ≈ ${info.bpm} — ${beatsOnTimeline.length} beats (mapped to timeline)`
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
          <div className="h-full flex flex-col items-center justify-center gap-1 w-full">
            <div
              ref={previewRef}
              className={`rounded-xl bg-black overflow-hidden relative transition-all ${showFrame ? "border-2 border-primary/60" : "border border-border"}`}
              style={{
                aspectRatio: `${aspectRatios[activeRatio].w}/${aspectRatios[activeRatio].h}`,
                height: "100%", maxHeight: "100%",
                width: "auto", maxWidth: "100%",
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
              <div style={{
                transform: `scale(${activeScale}) translate(${activePan.x / activeScale}px, ${activePan.y / activeScale}px) rotate(${activeRotation}deg)`,
                transformOrigin: "center center",
                width: "100%", height: "100%",
                transition: (pinchRef.current || panRef.current) ? "none" : "transform 200ms ease-out",
              }}>
                {activeMedia?.type === "video" ? (
                  <video 
                    ref={videoRef} 
                    className={`w-full h-full object-contain ${transitionClass}`} 
                    playsInline 
                    preload="auto" 
                    disablePictureInPicture
                    poster="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>"
                    onLoadedData={() => { setMediaReady(true); setMediaError(false); }}
                    onCanPlay={() => { setMediaReady(true); setMediaError(false); }}
                    onSeeked={() => { setMediaReady(true); setMediaError(false); }}
                    onError={() => { setMediaReady(true); setMediaError(true); }}
                    onLoadedMetadata={(e) => {
                      setMediaReady(true);
                      setMediaError(false);
                      const video = e.currentTarget;
                      autoDetectRatio(video.videoWidth, video.videoHeight);
                    }}
                    style={{
                      ...transitionStyle,
                      ...cropStyle,
                      opacity: activeOpacity,
                      filter: [activeFilterStyle, activeVfxStyle.filter].filter(Boolean).join(" ") || undefined,
                      transform: `${activeVfxStyle.transform || ""} scaleX(${activeFlipH ? -1 : 1}) scaleY(${activeFlipV ? -1 : 1})`,
                      ...activeVfxStyle.imageStyle,
                      willChange: "transform, filter",
                      backfaceVisibility: "hidden"
                    }} />
                ) : activeMedia?.type === "image" ? (
                  <img src={activeMedia.url} alt={activeMedia.name} className={`w-full h-full object-contain ${transitionClass}`}
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
                      filter: [activeFilterStyle, activeVfxStyle.filter].filter(Boolean).join(" ") || undefined,
                      transform: `${activeVfxStyle.transform || ""} scaleX(${activeFlipH ? -1 : 1}) scaleY(${activeFlipV ? -1 : 1})`,
                      ...activeVfxStyle.imageStyle
                    }} />
                ) : null}
              </div>

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
              {/* Frame border overlay when pinching */}
              {showFrame && (
                <div className="absolute inset-0 pointer-events-none z-20 border-2 border-dashed border-primary/40 rounded-xl" />
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
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" ref={tracksContainerRef}>
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
                  hidePlayhead
                  onOpenCover={() => { setTool(tool === "cover" ? null : "cover"); }}
                />
              </div>

              {/* Caption track — Text track (Always shown by default) */}
              <div onClick={() => setFocusedTrack("caption")}>
                <CaptionTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "caption"} onSeek={seek} onAddClick={() => setTool("caption")} />
              </div>

              {/* Audio track — Music track (Always shown by default) */}
              <div onClick={() => setFocusedTrack("audio")}>
                <AudioTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "audio"} onSeek={seek} onAddClick={() => setTool("music")} />
              </div>

              {/* Filter track — Appears when filters exist or focused */}
              {(filters.length > 0 || focusedTrack === "filter") && (
                <div onClick={() => setFocusedTrack("filter")}>
                  <FilterTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "filter"} onSeek={seek} onAddClick={() => setTool("filter")} />
                </div>
              )}

              {/* VFX track — Appears when VFX exist or focused */}
              {(vfx.length > 0 || focusedTrack === "vfx") && (
                <div onClick={() => setFocusedTrack("vfx")}>
                  <VfxTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "vfx"} onSeek={seek} onAddClick={() => setTool("vfx")} />
                </div>
              )}

              {/* Overlay track — Appears when overlays exist or focused */}
              {(overlays.length > 0 || focusedTrack === "overlay") && (
                <div onClick={() => setFocusedTrack("overlay")}>
                  <OverlayTimeline currentTime={currentTime} pxPerSec={pxPerSec} containerW={tlWidth} isPlaying={isPlaying} focused={focusedTrack === "overlay"} onSeek={seek} onAddClick={() => setTool("overlay")} />
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
            {tools.map((t) => {
              const isDelete = t.id === "delete";
              const isDeleteEnabled = isDelete && !!deletableItem;
              return (
                <button
                  key={t.id}
                  onClick={() => onToolClick(t.id)}
                  disabled={isDelete && !isDeleteEnabled}
                  className={`flex flex-col items-center gap-1 py-2 px-3.5 rounded-2xl flex-shrink-0 min-w-[58px] transition-all active:scale-95 ${
                    isDelete 
                      ? isDeleteEnabled
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 ring-1 ring-red-500/30 font-bold scale-105"
                        : "text-muted-foreground/30 bg-secondary/20 cursor-not-allowed"
                      : tool === t.id 
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40 font-bold" 
                        : "text-muted-foreground bg-secondary/40 hover:bg-secondary/60"
                  }`}
                  title={
                    isDelete
                      ? isDeleteEnabled
                        ? `${getLang() === "ar" ? "حذف سريع لـ " : "Quick Delete "}${deletableItem.label}`
                        : (getLang() === "ar" ? "حذف العنصر (اختر مساراً وعنصراً أولاً)" : "Delete element (Select track and element first)")
                      : undefined
                  }
                >
                  <t.icon className="w-6 h-6" />
                  <span className="text-[10px] font-semibold whitespace-nowrap">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panels — pop from bottom */}
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
