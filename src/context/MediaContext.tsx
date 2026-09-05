import { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { triggerHapticTick } from "@/lib/haptics";
import { robustSeekVideo } from "@/lib/videoSeeking";

export type MediaType = "video" | "image";

export interface MediaItem {
  id: string;
  url: string;
  type: MediaType;
  name: string;
  size: number;
  duration: number;
  file: File;
  thumbnail?: string;
  mediaRevision?: number;
  processedUrl?: string;
  width?: number;
  height?: number;
  editable?: boolean;
}

export type TransitionType = 
  | "none" 
  | "fade" 
  | "slide" 
  | "zoom" 
  | "wipe" 
  | "blur" 
  | "dissolve" 
  | "glitch" 
  | "spin" 
  | "flash" 
  | "shutter" 
  | "iris" 
  | "split" 
  | "mosaic" 
  | "ripple" 
  | "radar" 
  | "whip-pan" 
  | "zoom-blur" 
  | "glitch-slice" 
  | "page-flip" 
  | "gsap-elastic-zoom" 
  | "gsap-3d-flip" 
  | "gsap-stagger-wipe" 
  | "gsap-elastic-bounce"
  | "sun-flare"
  | "light-leak"
  | "brush-paint"
  | "bokeh-blur"
  | "cinematic-bars"
  | "cube-rotate"
  | "color-flow"
  | "retro-pixel"
  | "star-warp";

export interface Transition {
  type: TransitionType;
  duration: number;
}

export interface Keyframe {
  id: string;
  time: number; // relative to item start in seconds
  property: string;
  value: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface Clip {
  id: string;
  mediaId: string;
  in: number;
  out: number;
  transitionIn?: Transition;
  speed?: number;
  scale?: number;
  panX?: number;
  panY?: number;
  flipH?: boolean;
  flipV?: boolean;
  rotation?: number;
  opacity?: number;
  volume?: number;
  keyframes?: Keyframe[];
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  speedCurve?: { id: string; timePct: number; value: number }[];
  mediaRevision?: number;
  processedUrl?: string;
  editable?: boolean;
  url?: string;
  duration?: number;
}

export function interpolateKeyframes(
  item: { keyframes?: Keyframe[] },
  property: string,
  time: number,
  defaultValue: number
): number {
  if (!item.keyframes || item.keyframes.length === 0) return defaultValue;
  
  // Filter keyframes for this specific property
  const kfs = item.keyframes
    .filter(k => k.property === property)
    .sort((a, b) => a.time - b.time);
    
  if (kfs.length === 0) return defaultValue;
  
  // If time is before the first keyframe, return first keyframe's value
  if (time <= kfs[0].time) return kfs[0].value;
  
  // If time is after the last keyframe, return last keyframe's value
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
  
  // Find the two keyframes surrounding the current time
  let k1 = kfs[0];
  let k2 = kfs[0];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].time && time <= kfs[i + 1].time) {
      k1 = kfs[i];
      k2 = kfs[i + 1];
      break;
    }
  }
  
  const duration = k2.time - k1.time;
  if (duration <= 0) return k2.value;
  
  // Normalized time ratio (0 to 1)
  let t = (time - k1.time) / duration;
  
  // Apply cubic/bezier easing functions
  const easing = k2.easing || "linear";
  if (easing === "easeIn") {
    t = t * t * t;
  } else if (easing === "easeOut") {
    const f = t - 1;
    t = f * f * f + 1;
  } else if (easing === "easeInOut") {
    t = t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }
  
  return k1.value + (k2.value - k1.value) * t;
}

export const clipTimelineLen = (c: Clip) => Math.max(0, c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1);

export type CaptionAnimation = "none" | "fade" | "slide-up" | "slide-down" | "pop" | "typewriter" | "bounce" | "glitch" | "zoom-fade" | "scale-up" | "rotate-in" | "blur-in" | "elastic-drop" | "swing-in" | "reveal-left" | "reveal-right" | "heartbeat" | "neon-flicker" | "3d-flip" | "wave-bounce" | "curtain-reveal" | "shatter-pop";

export interface Caption {
  editable?: boolean;
  id: string;
  start: number;
  end: number;
  text: string;
  confidence?: number;
  font?: string;
  size?: number;
  color?: string;
  bg?: string;
  yPercent?: number;
  xPercent?: number;
  rotation?: number;
  scale?: number;
  flipH?: boolean;
  flipV?: boolean;
  animation?: CaptionAnimation;
  keyframes?: Keyframe[];
  isMultiLine?: boolean;
  customWidth?: number;
  // Enhanced text styling & template features
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  bgRadius?: number;
  bgPadding?: number;
  badgeIcon?: string;
  badgePosition?: "left" | "right" | "top";
  presetCategory?: string;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  nameEn?: string;
  font: string;
  size: number;
  color: string;
  bg: string;
  animation: CaptionAnimation;
  category?: "social" | "titles" | "callouts" | "badges" | "neon" | "aesthetic";
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  letterSpacing?: number;
  bgRadius?: number;
  bgPadding?: number;
  badgeIcon?: string;
  badgePosition?: "left" | "right" | "top";
  sampleText?: string;
  sampleTextAr?: string;
  sampleTextEn?: string;
}

export interface CaptionStyle {
  font: string;
  size: number;
  color: string;
  bg: string;
  position: "top" | "center" | "bottom";
  language: string;
  animation: CaptionAnimation;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  bgRadius?: number;
  bgPadding?: number;
  badgeIcon?: string;
  isMultiLine?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  rotation?: number;
  scale?: number;
}

export type AudioFxType =
  | "none"
  | "robot"
  | "chipmunk"
  | "deep"
  | "female"
  | "male"
  | "megaphone"
  | "alien"
  | "underwater"
  | "echo"
  | "studio"
  | "reverb"
  | "telephone"
  | "lowpass";

export interface AudioTrackItem {
  id: string;
  name: string;
  url: string;
  file?: File;
  coverUrl?: string;
  start: number;
  offset: number;
  duration: number;
  sourceDuration: number;
  volume: number;
  muted: boolean;
  fx: AudioFxType;
  color: string;
  kind: "music" | "sfx" | "voice" | "video-audio";
  fadeIn?: number;
  fadeOut?: number;
  keyframes?: Keyframe[];
  beats?: number[];
  bpm?: number;
  end?: number;
}

export type FilterType = "brightness" | "contrast" | "saturate" | "grayscale" | "sepia" | "blur" | "hue-rotate" | "invert" | "vintage" | "warm" | "cool" | "dramatic" | "noir" | "fade-edge" | "duotone" | "dream" | "neon" | "sepia-blue";
export interface FilterItem { 
  id: string; 
  type: FilterType; 
  start: number; 
  end: number; 
  intensity: number; 
  keyframes?: Keyframe[]; 
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  hueRotate?: number;
  sharpness?: number;
  hslHue?: number;
  hslSaturation?: number;
  hslLightness?: number;
}

export type VfxType = 
  | "glitch" | "shake" | "flash" | "zoom-pulse" | "rgb-split" | "vhs" | "scan-lines" | "pixelate" | "rotate-3d" | "particles" | "light-leak" | "film-grain" | "chromatic" | "shake-v" | "bounce" | "swing" | "heartbeat" | "prism" | "crt-scanner" | "radial-lens-flare" | "motion-blur-streak" | "vintage-sepia-bloom" | "water-ripple" | "vintage-8mm" | "old-vhs-tape" | "retro-sepia-grain" | "crt-tv-retro"
  // Intro & Opener VFX
  | "cinematic-opener" | "spotlight-reveal" | "epic-zoom-in" | "neon-glow-entry" | "film-countdown" | "tv-power-on" | "curtain-rise"
  // Weather & Nature VFX
  | "rain-storm" | "snow-blizzard" | "fire-embers" | "fog-smoke" | "thunder-lightning" | "sparkles-stars" | "bubbles-floating"
  // Dance & Music Party VFX
  | "disco-strobe" | "bass-shake-pulse" | "neon-equalizer" | "rgb-rave" | "laser-beams" | "kaleidoscope-dance";
export interface VfxItem { id: string; type: VfxType; start: number; end: number; intensity: number; keyframes?: Keyframe[]; }

export interface OverlayItem {
  id: string; url: string; type: "image" | "video"; name: string; file: File;
  start: number; end: number; x: number; y: number; scale: number;
  opacity?: number; rotation?: number; blend?: string; brightness?: number;
  keyframes?: Keyframe[];
  flipH?: boolean; flipV?: boolean; duration?: number;
}

export type ExportPreset = "reels-15" | "reels-30" | "reels-60" | "story-60" | "full";

export interface ProjectMeta { id: string; name: string; updatedAt: number; duration: number; preset: ExportPreset; thumb?: string; coverImage?: string | null; }

interface MediaContextType {
  filters: FilterItem[]; vfx: VfxItem[]; overlays: OverlayItem[];
  addFilter: (f: Omit<FilterItem, "id">) => void;
  updateFilter: (id: string, patch: Partial<FilterItem>) => void;
  removeFilter: (id: string) => void;
  addVfx: (v: Omit<VfxItem, "id">) => void;
  updateVfx: (id: string, patch: Partial<VfxItem>) => void;
  removeVfx: (id: string) => void;
  addOverlay: (file: File) => Promise<string>;
  updateOverlay: (id: string, patch: Partial<OverlayItem>) => void;
  removeOverlay: (id: string) => void;
  media: MediaItem[]; clips: Clip[]; captions: Caption[]; captionStyle: CaptionStyle;
  audioTracks: AudioTrackItem[]; videoMuted: boolean; videoVolume: number; videoAudioFx: AudioFxType;
  exportPreset: ExportPreset; projectName: string; projectId: string;
  addFiles: (files: FileList | File[]) => Promise<MediaItem[]>;
  updateMediaItem: (id: string, patch: Partial<MediaItem>) => void;
  removeMedia: (id: string) => void; clearMedia: () => void;
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  setFilters: React.Dispatch<React.SetStateAction<FilterItem[]>>;
  setVfx: React.Dispatch<React.SetStateAction<VfxItem[]>>;
  setOverlays: React.Dispatch<React.SetStateAction<OverlayItem[]>>;
  splitClipAt: (clipId: string, localTime: number) => void;
  splitTrackAt: (trackType: "video" | "audio" | "caption" | "filter" | "vfx" | "overlay", time: number) => boolean;
  trimClip: (clipId: string, edge: "in" | "out", newValue: number) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, targetIndex: number) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setTransition: (clipId: string, transition: Transition) => void;
  coverImage: string | null; setCoverImage: (url: string | null) => void;
  audioBeats: number[]; setAudioBeats: React.Dispatch<React.SetStateAction<number[]>>;
  selectedAudioTrackId: string | null; setSelectedAudioTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  setCaptions: React.Dispatch<React.SetStateAction<Caption[]>>;
  setAudioTracks: React.Dispatch<React.SetStateAction<AudioTrackItem[]>>;
  updateCaption: (id: string, patch: Partial<Caption>) => void;
  removeCaption: (id: string) => void;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  addAudioTrack: (t: Omit<AudioTrackItem, "id">) => string;
  updateAudioTrack: (id: string, patch: Partial<AudioTrackItem>) => void;
  removeAudioTrack: (id: string) => void;
  setVideoMuted: (m: boolean) => void; setVideoVolume: (v: number) => void; setVideoAudioFx: (fx: AudioFxType) => void;
  setExportPreset: (p: ExportPreset) => void; setProjectName: (n: string) => void;
  newProject: () => void;
  createNewProjectWithFiles: (files: FileList | File[]) => Promise<MediaItem[]>;
  loadProject: (id: string) => Promise<boolean>;
  listProjects: () => Promise<ProjectMeta[]>; deleteProject: (id: string) => Promise<void>;
  totalDuration: number; getMediaById: (id: string) => MediaItem | undefined;
  resolveTimelineTime: (t: number) => { clip: Clip; clipIndex: number; mediaTime: number; clipStart: number } | null;
  splitClipsAtBeats: (beats: number[]) => void;
  applySmartTemplate: (tpl: import("@/lib/smartTemplates").SmartTemplate) => boolean;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}

const MediaContext = createContext<MediaContextType | null>(null);

const getVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { resolve(video.duration || 0); URL.revokeObjectURL(video.src); };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });

const extractVideoFrameThumbnail = async (file: File): Promise<string> => {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject();
    });

    const targetTime = Math.min(0.5, (video.duration || 1) / 2);
    const seekOk = await robustSeekVideo(video, targetTime, { timeoutMs: 1200, toleranceSec: 0.04 });
    if (seekOk) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth || 320, 320);
      canvas.height = Math.min(video.videoHeight || 180, 180);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        return dataUrl;
      }
    }
  } catch {
    /* fallback */
  } finally {
    try {
      video.src = "";
      video.load();
    } catch {}
    URL.revokeObjectURL(url);
  }
  return "";
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const DB_NAME = "vireon-ai-db";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_FILES = "files";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbPut = async (store: string, key: any, val: any) => {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    const r = key === undefined ? s.put(val) : s.put(val, key);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
};
const idbGet = async <T,>(store: string, key: any): Promise<T | undefined> => {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => res(r.result as T); r.onerror = () => rej(r.error);
  });
};
const idbAll = async <T,>(store: string): Promise<T[]> => {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => res(r.result as T[]); r.onerror = () => rej(r.error);
  });
};
const idbDel = async (store: string, key: any) => {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const r = tx.objectStore(store).delete(key);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
};

const ACTIVE_KEY = "vireon:activeProjectId";
const trackColors = ["#a855f7", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6"];

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const freshStartRef = useRef(false);
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem(ACTIVE_KEY) || uid());
  const [projectName, setProjectName] = useState<string>(() => t("editor.projectName"));
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>([]);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string | null>(null);
  const [audioBeats, setAudioBeats] = useState<number[]>([]);
  const [filters, setFilters] = useState<FilterItem[]>([]);
  const [vfx, setVfx] = useState<VfxItem[]>([]);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoVolume, setVideoVolume] = useState(1);
  const [videoAudioFx, setVideoAudioFx] = useState<AudioFxType>("none");
  const [exportPreset, setExportPreset] = useState<ExportPreset>("full");
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    font: "Cairo", size: 22, color: "#ffffff", bg: "rgba(0,0,0,0.55)",
    position: "bottom", language: "ar", animation: "fade",
  });

  const hydratedRef = useRef(false);

  type Snapshot = {
    clips: Clip[]; captions: Caption[]; filters: FilterItem[]; vfx: VfxItem[];
    overlays: OverlayItem[]; audioTracks: AudioTrackItem[]; captionStyle: CaptionStyle;
  };
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const presentRef = useRef<Snapshot | null>(null);
  const pendingPrevRef = useRef<Snapshot | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const applyingRef = useRef(false);
  const [, setHistVersion] = useState(0);

  const flushPending = useCallback(() => {
    if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = undefined; }
    if (pendingPrevRef.current) {
      pastRef.current.push(pendingPrevRef.current);
      if (pastRef.current.length > 60) pastRef.current.shift();
      pendingPrevRef.current = null;
      futureRef.current = [];
    }
  }, []);

  const applySnapshot = useCallback((s: Snapshot) => {
    applyingRef.current = true;
    setClips(s.clips); setCaptions(s.captions); setFilters(s.filters);
    setVfx(s.vfx); setOverlays(s.overlays); setAudioTracks(s.audioTracks);
    setCaptionStyle(s.captionStyle);
    presentRef.current = s;
  }, []);

  const resetHistory = useCallback(() => {
    pastRef.current = []; futureRef.current = [];
    presentRef.current = null; pendingPrevRef.current = null;
    if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = undefined; }
    setHistVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    flushPending();
    if (!pastRef.current.length) { toast.info(t("toast.nothingToUndo")); return; }
    const prev = pastRef.current.pop()!;
    if (presentRef.current) futureRef.current.push(presentRef.current);
    applySnapshot(prev);
    setHistVersion((v) => v + 1);
    toast.success(t("toast.undoDone"));
    try { navigator.vibrate?.(8); } catch { /* ignore */ }
  }, [flushPending, applySnapshot]);

  const redo = useCallback(() => {
    flushPending();
    if (!futureRef.current.length) { toast.info(t("toast.nothingToRedo")); return; }
    const next = futureRef.current.pop()!;
    if (presentRef.current) pastRef.current.push(presentRef.current);
    applySnapshot(next);
    setHistVersion((v) => v + 1);
    toast.success(t("toast.redoDone"));
    try { navigator.vibrate?.(8); } catch { /* ignore */ }
  }, [flushPending, applySnapshot]);

  const canUndo = pastRef.current.length > 0 || pendingPrevRef.current != null;
  const canRedo = futureRef.current.length > 0;

  useEffect(() => {
    if (freshStartRef.current) { hydratedRef.current = true; return; }
    (async () => {
      try {
        const proj = await idbGet<any>(STORE_PROJECTS, projectId);
        if (proj) {
          setProjectName(proj.name || t("editor.projectName"));
          setExportPreset(proj.exportPreset || "full");
          setVideoMuted(!!proj.videoMuted);
          setVideoVolume(proj.videoVolume ?? 1);
          setVideoAudioFx(proj.videoAudioFx || "none");
          setCaptions(proj.captions || []);
          setCaptionStyle(proj.captionStyle || captionStyle);
          setCoverImage(proj.coverImage || null);
          const restoredMedia: MediaItem[] = [];
          for (const m of proj.media || []) {
            const blob = await idbGet<Blob>(STORE_FILES, m.fileKey);
            if (!blob) continue;
            const file = new File([blob], m.name, { type: m.mime });
            restoredMedia.push({ id: m.id, url: URL.createObjectURL(blob), type: m.type, name: m.name, size: m.size, duration: m.duration, file });
          }
          setMedia(restoredMedia);
          setClips(proj.clips || []);
          setFilters(proj.filters || []);
          setVfx(proj.vfx || []);
          const restoredOverlays: OverlayItem[] = [];
          for (const o of proj.overlays || []) {
            const blob = o.fileKey ? await idbGet<Blob>(STORE_FILES, o.fileKey) : null;
            const url = blob ? URL.createObjectURL(blob) : o.url;
            restoredOverlays.push({ ...o, url, file: blob ? new File([blob], o.name, { type: blob.type }) : undefined });
          }
          setOverlays(restoredOverlays);
          const restoredAudio: AudioTrackItem[] = [];
          for (const a of proj.audioTracks || []) {
            const blob = a.fileKey ? await idbGet<Blob>(STORE_FILES, a.fileKey) : null;
            const url = blob ? URL.createObjectURL(blob) : a.url;
            restoredAudio.push({ ...a, url, file: blob ? new File([blob], a.name, { type: blob.type }) : undefined });
          }
          setAudioTracks(restoredAudio);
        }
      } catch (e) { console.warn("project restore failed", e); }
      finally { hydratedRef.current = true; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDuration = useMemo(() => {
    const clipsLen = clips.reduce((acc, c) => acc + clipTimelineLen(c), 0);
    const audioLen = audioTracks.reduce((acc, t) => Math.max(acc, t.start + t.duration), 0);
    return Math.max(clipsLen, audioLen);
  }, [clips, audioTracks]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(async () => {
      try {
        for (const m of media) {
          const fileKey = `media:${m.id}`;
          const exists = await idbGet(STORE_FILES, fileKey);
          if (!exists) await idbPut(STORE_FILES, fileKey, m.file);
        }
        for (const a of audioTracks) {
          if (!a.file) continue;
          const fileKey = `audio:${a.id}`;
          const exists = await idbGet(STORE_FILES, fileKey);
          if (!exists) await idbPut(STORE_FILES, fileKey, a.file);
        }
        for (const o of overlays) {
          if (!o.file) continue;
          const fileKey = `overlay:${o.id}`;
          const exists = await idbGet(STORE_FILES, fileKey);
          if (!exists) await idbPut(STORE_FILES, fileKey, o.file);
        }
        const effectiveCover = coverImage || (media.length > 0 ? media[0].url : null);

        const payload = {
          id: projectId, name: projectName, updatedAt: Date.now(),
          exportPreset, videoMuted, videoVolume, videoAudioFx, captions, captionStyle, coverImage: effectiveCover, clips,
          filters, vfx,
          overlays: overlays.map((o) => ({ id: o.id, start: o.start, end: o.end, x: o.x, y: o.y, scale: o.scale, opacity: o.opacity, rotation: o.rotation, blend: o.blend, brightness: o.brightness, name: o.name, type: o.type, fileKey: o.file ? `overlay:${o.id}` : null, url: o.file ? null : o.url })),
          media: media.map((m) => ({ id: m.id, name: m.name, type: m.type, size: m.size, duration: m.duration, mime: m.file.type, fileKey: `media:${m.id}` })),
          audioTracks: audioTracks.map((a) => ({ id: a.id, name: a.name, start: a.start, offset: a.offset, duration: a.duration, sourceDuration: a.sourceDuration, volume: a.volume, muted: a.muted, fx: a.fx, color: a.color, kind: a.kind, fileKey: a.file ? `audio:${a.id}` : null, url: a.file ? null : a.url })),
        };
        await idbPut(STORE_PROJECTS, undefined, payload);
        localStorage.setItem(ACTIVE_KEY, projectId);

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          supabase.from("projects").upsert({
            id: projectId, name: projectName, export_preset: exportPreset,
            clips_json: clips as unknown as any, captions_json: captions as unknown as any, caption_style_json: captionStyle as unknown as any,
            audio_tracks_json: audioTracks.map((a) => ({ id: a.id, name: a.name, start: a.start, offset: a.offset, duration: a.duration, sourceDuration: a.sourceDuration, volume: a.volume, muted: a.muted, fx: a.fx, color: a.color, kind: a.kind, url: a.file ? null : a.url })),
            filters_json: filters as unknown as any, vfx_json: vfx as unknown as any, cover_image: effectiveCover,
            duration: totalDuration, updated_at: new Date().toISOString(),
          }).then(({ error }) => { if (error) console.warn("cloud sync failed", error.message); });
        }
      } catch (e) { console.warn("autosave failed", e); }
    }, 600);
    return () => clearTimeout(t);
  }, [projectId, projectName, exportPreset, videoMuted, videoVolume, videoAudioFx, captions, captionStyle, coverImage, clips, media, audioTracks, filters, vfx, totalDuration, overlays]);

  useEffect(() => {
    const snap: Snapshot = { clips, captions, filters, vfx, overlays, audioTracks, captionStyle };
    if (!presentRef.current) { presentRef.current = snap; return; }
    if (applyingRef.current) { applyingRef.current = false; presentRef.current = snap; return; }
    if (!pendingPrevRef.current) pendingPrevRef.current = presentRef.current;
    presentRef.current = snap;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      if (pendingPrevRef.current) {
        pastRef.current.push(pendingPrevRef.current);
        if (pastRef.current.length > 60) pastRef.current.shift();
        pendingPrevRef.current = null;
        futureRef.current = [];
        commitTimerRef.current = undefined;
        setHistVersion((v) => v + 1);
      }
    }, 450);
  }, [clips, captions, filters, vfx, overlays, audioTracks, captionStyle]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const isValidMediaFile = (f: File) => {
      if (f.type && (f.type.startsWith("video/") || f.type.startsWith("image/"))) return true;
      const name = (f.name || "").toLowerCase();
      return /\.(mp4|mov|avi|m4v|webm|mkv|3gp|jpg|jpeg|png|gif|webp|heic|bmp|tiff)$/i.test(name);
    };

    const valid = arr.filter(isValidMediaFile);
    if (valid.length === 0) { toast.error(t("toast.selectValidFiles")); return []; }

    const items: MediaItem[] = valid.map((file) => {
      let type: MediaType = "image";
      if (file.type && file.type.startsWith("video/")) {
        type = "video";
      } else if (file.type && file.type.startsWith("image/")) {
        type = "image";
      } else {
        const isVideoExt = /\.(mp4|mov|avi|m4v|webm|mkv|3gp)$/i.test((file.name || "").toLowerCase());
        type = isVideoExt ? "video" : "image";
      }
      return { id: uid(), url: URL.createObjectURL(file), type, name: file.name, size: file.size, file, duration: type === "video" ? 0 : 5 };
    });
    setMedia((prev) => [...prev, ...items]);
    setClips((prev) => [...prev, ...items.map<Clip>((m) => ({ id: uid(), mediaId: m.id, in: 0, out: m.duration || 5 }))]);
    toast.success(t("toast.mediaUploaded", { n: items.length }));
    items.forEach((m) => {
      if (m.type !== "video") return;
      getVideoDuration(m.file).then((d) => {
        const dur = d || 5;
        setMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, duration: dur } : x)));
        setClips((prev) => prev.map((c) => c.mediaId === m.id && c.in === 0 && (c.out === 5 || c.out === 0) ? { ...c, out: dur } : c));
      });
      if (m.file) {
        extractVideoFrameThumbnail(m.file).then((thumb) => {
          if (thumb) {
            setMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, thumbnail: thumb } : x)));
          }
        });
      }
    });
    return items;
  }, []);

  const updateMediaItem = useCallback((id: string, patch: Partial<MediaItem>) => {
    setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => { const item = prev.find((m) => m.id === id); if (item) URL.revokeObjectURL(item.url); return prev.filter((m) => m.id !== id); });
    setClips((prev) => prev.filter((c) => c.mediaId !== id));
    idbDel(STORE_FILES, `media:${id}`).catch(() => {});
  }, []);

  const clearMedia = useCallback(() => {
    setMedia((prev) => { prev.forEach((m) => URL.revokeObjectURL(m.url)); return []; });
    setClips([]); setCaptions([]);
  }, []);

  const splitClipAt = useCallback((clipId: string, localTime: number) => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === clipId);
      if (idx === -1) return prev;
      const c = prev[idx];
      const splitAt = c.in + localTime;
      if (splitAt <= c.in + 0.05 || splitAt >= c.out - 0.05) { toast.error(t("toast.splitTooClose")); return prev; }
      const left: Clip = { ...c, out: splitAt };
      const right: Clip = { id: uid(), mediaId: c.mediaId, in: splitAt, out: c.out, speed: c.speed, scale: c.scale, panX: c.panX, panY: c.panY, flipH: c.flipH, flipV: c.flipV };
      const next = [...prev]; next.splice(idx, 1, left, right);
      toast.success(t("toast.splitDone"));
      return next;
    });
  }, []);

  const resolveTimelineTime = useCallback((t: number) => {
    let acc = 0;
    const clipsLen = clips.reduce((sum, c) => sum + clipTimelineLen(c), 0);
    if (t > clipsLen) return null;

    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const sp = c.speed && c.speed > 0 ? c.speed : 1;
      const len = clipTimelineLen(c);
      if (t < acc + len || i === clips.length - 1) {
        const localT = Math.min(Math.max(0, t - acc), len);
        return { clip: c, clipIndex: i, mediaTime: c.in + localT * sp, clipStart: acc };
      }
      acc += len;
    }
    return null;
  }, [clips]);

  const splitTrackAt = useCallback((trackType: "video" | "audio" | "caption" | "filter" | "vfx" | "overlay", time: number) => {
    let success = false;
    if (trackType === "video") {
      const r = resolveTimelineTime(time);
      if (!r) { toast.error(t("toast.noClipAtPlayhead")); return false; }
      const localTime = r.mediaTime - r.clip.in;
      const c = r.clip;
      const splitAt = c.in + localTime;
      if (splitAt <= c.in + 0.05 || splitAt >= c.out - 0.05) { toast.error(t("toast.splitTooClose")); return false; }
      setClips((prev) => {
        const idx = prev.findIndex((x) => x.id === c.id);
        if (idx === -1) return prev;
        const left: Clip = { ...c, out: splitAt };
        const right: Clip = { id: uid(), mediaId: c.mediaId, in: splitAt, out: c.out, speed: c.speed, scale: c.scale, panX: c.panX, panY: c.panY, flipH: c.flipH, flipV: c.flipV };
        const next = [...prev]; next.splice(idx, 1, left, right);
        return next;
      });
      success = true;
    } else if (trackType === "audio") {
      setAudioTracks((prev) => {
        const active = prev.filter((a) => time > a.start && time < a.start + a.duration);
        if (!active.length) return prev;
        const next = [...prev];
        for (const track of active) {
          const idx = next.findIndex((x) => x.id === track.id);
          if (idx === -1) continue;
          const dt = time - track.start;
          if (dt <= 0.05 || dt >= track.duration - 0.05) continue;
          const left: AudioTrackItem = { ...track, duration: dt };
          const right: AudioTrackItem = { ...track, id: uid(), start: time, offset: track.offset + dt, duration: track.duration - dt };
          next.splice(idx, 1, left, right);
          success = true;
        }
        return next;
      });
    } else if (trackType === "caption") {
      setCaptions((prev) => {
        const active = prev.filter((c) => time > c.start && time < c.end);
        if (!active.length) return prev;
        const next = [...prev];
        for (const cap of active) {
          const idx = next.findIndex((x) => x.id === cap.id);
          if (idx === -1) continue;
          if (time - cap.start <= 0.05 || cap.end - time <= 0.05) continue;
          const left: Caption = { ...cap, end: time };
          const right: Caption = { ...cap, id: uid(), start: time };
          next.splice(idx, 1, left, right);
          success = true;
        }
        return next;
      });
    } else if (trackType === "filter") {
      setFilters((prev) => {
        const active = prev.filter((f) => time > f.start && time < f.end);
        if (!active.length) return prev;
        const next = [...prev];
        for (const filt of active) {
          const idx = next.findIndex((x) => x.id === filt.id);
          if (idx === -1) continue;
          if (time - filt.start <= 0.05 || filt.end - time <= 0.05) continue;
          const left: FilterItem = { ...filt, end: time };
          const right: FilterItem = { ...filt, id: uid(), start: time };
          next.splice(idx, 1, left, right);
          success = true;
        }
        return next;
      });
    } else if (trackType === "vfx") {
      setVfx((prev) => {
        const active = prev.filter((v) => time > v.start && time < v.end);
        if (!active.length) return prev;
        const next = [...prev];
        for (const item of active) {
          const idx = next.findIndex((x) => x.id === item.id);
          if (idx === -1) continue;
          if (time - item.start <= 0.05 || item.end - time <= 0.05) continue;
          const left: VfxItem = { ...item, end: time };
          const right: VfxItem = { ...item, id: uid(), start: time };
          next.splice(idx, 1, left, right);
          success = true;
        }
        return next;
      });
    } else if (trackType === "overlay") {
      setOverlays((prev) => {
        const active = prev.filter((o) => time > o.start && time < o.end);
        if (!active.length) return prev;
        const next = [...prev];
        for (const item of active) {
          const idx = next.findIndex((x) => x.id === item.id);
          if (idx === -1) continue;
          if (time - item.start <= 0.05 || item.end - time <= 0.05) continue;
          const left: OverlayItem = { ...item, end: time };
          const right: OverlayItem = { ...item, id: uid(), start: time };
          next.splice(idx, 1, left, right);
          success = true;
        }
        return next;
      });
    }

    if (success) {
      toast.success(t("toast.splitDone"));
      try { navigator.vibrate?.(12); } catch {}
      return true;
    } else {
      toast.error(t("toast.noClipAtPlayhead"));
      return false;
    }
  }, [resolveTimelineTime]);

  const trimClip = useCallback((clipId: string, edge: "in" | "out", newValue: number) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clipId) return c;
      const mediaItem = media.find((m) => m.id === c.mediaId);
      const isVideo = mediaItem && mediaItem.type === "video";
      const maxSourceDuration = isVideo && mediaItem.duration > 0 ? mediaItem.duration : Infinity;

      if (edge === "in") {
        const clampedIn = Math.max(0, Math.min(newValue, c.out - 0.1));
        return { ...c, in: clampedIn };
      } else {
        const clampedOut = Math.max(c.in + 0.1, Math.min(newValue, maxSourceDuration));
        return { ...c, out: clampedOut };
      }
    }));
  }, [media]);

  const removeClip = useCallback((clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    triggerHapticTick("medium");
  }, []);

  const moveClip = useCallback((clipId: string, targetIndex: number) => {
    setClips((prev) => {
      const from = prev.findIndex((c) => c.id === clipId);
      if (from === -1) return prev;
      const clamped = Math.max(0, Math.min(prev.length - 1, targetIndex));
      if (clamped === from) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(clamped, 0, moved);
      return next;
    });
  }, []);

  const setClipSpeed = useCallback((clipId: string, speed: number) => {
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, speed } : c)));
  }, []);

  const setTransition = useCallback((clipId: string, transition: Transition) => {
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, transitionIn: transition } : c)));
  }, []);

  const updateCaption = useCallback((id: string, patch: Partial<Caption>) => {
    setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const removeCaption = useCallback((id: string) => { setCaptions((prev) => prev.filter((c) => c.id !== id)); }, []);

  const addAudioTrack = useCallback((t_param: Omit<AudioTrackItem, "id">) => {
    const id = uid();
    const color = t_param.color || trackColors[Math.floor(Math.random() * trackColors.length)];
    setAudioTracks((prev) => [...prev, { ...t_param, id, color }]);
    setSelectedAudioTrackId(id);
    toast.success(t("toast.audioAdded"));
    return id;
  }, []);
  const updateAudioTrack = useCallback((id: string, patch: Partial<AudioTrackItem>) => {
    setAudioTracks((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);
  const removeAudioTrack = useCallback((id: string) => {
    setAudioTracks((prev) => {
      const t_track = prev.find((a) => a.id === id);
      if (t_track) URL.revokeObjectURL(t_track.url);
      const remaining = prev.filter((a) => a.id !== id);
      return remaining;
    });
    setSelectedAudioTrackId((prev) => (prev === id ? null : prev));
    setAudioBeats([]);
    idbDel(STORE_FILES, `audio:${id}`).catch(() => {});
  }, []);

  const newProject = useCallback(() => {
    media.forEach((m) => URL.revokeObjectURL(m.url));
    audioTracks.forEach((a) => URL.revokeObjectURL(a.url));
    const id = uid();
    freshStartRef.current = true; hydratedRef.current = true;
    setProjectId(id); setProjectName(t("editor.projectName"));
    setMedia([]); setClips([]); setCaptions([]); setAudioTracks([]);
    setFilters([]); setVfx([]); setOverlays([]); setCoverImage(null);
    setVideoMuted(false); setVideoVolume(1); setVideoAudioFx("none"); setExportPreset("full");
    localStorage.setItem(ACTIVE_KEY, id);
    resetHistory();
  }, [media, audioTracks, resetHistory]);

  const createNewProjectWithFiles = useCallback(async (files: FileList | File[]) => {
    newProject();
    return await addFiles(files);
  }, [newProject, addFiles]);

  const loadProject = useCallback(async (id: string) => {
    const proj = await idbGet<any>(STORE_PROJECTS, id);
    if (!proj) return false;
    media.forEach((m) => URL.revokeObjectURL(m.url));
    audioTracks.forEach((a) => URL.revokeObjectURL(a.url));
    overlays.forEach((o) => { if (o.file) URL.revokeObjectURL(o.url); });
    setProjectId(id); localStorage.setItem(ACTIVE_KEY, id);
    setProjectName(proj.name || t("editor.projectName"));
    setExportPreset(proj.exportPreset || "full");
    setVideoMuted(!!proj.videoMuted); setVideoVolume(proj.videoVolume ?? 1);
    setCaptions(proj.captions || []); setCaptionStyle(proj.captionStyle || captionStyle);
    setCoverImage(proj.coverImage || null);
    const restoredMedia: MediaItem[] = [];
    for (const m of proj.media || []) {
      const blob = await idbGet<Blob>(STORE_FILES, m.fileKey);
      if (!blob) continue;
      const file = new File([blob], m.name, { type: m.mime });
      restoredMedia.push({ id: m.id, url: URL.createObjectURL(blob), type: m.type, name: m.name, size: m.size, duration: m.duration, file });
    }
    setMedia(restoredMedia); setClips(proj.clips || []);
    setFilters(proj.filters || []);
    setVfx(proj.vfx || []);
    const restoredOverlays: OverlayItem[] = [];
    for (const o of proj.overlays || []) {
      const blob = o.fileKey ? await idbGet<Blob>(STORE_FILES, o.fileKey) : null;
      const url = blob ? URL.createObjectURL(blob) : o.url;
      restoredOverlays.push({ ...o, url, file: blob ? new File([blob], o.name, { type: blob.type }) : undefined });
    }
    setOverlays(restoredOverlays);
    const restoredAudio: AudioTrackItem[] = [];
    for (const a of proj.audioTracks || []) {
      const blob = a.fileKey ? await idbGet<Blob>(STORE_FILES, a.fileKey) : null;
      const url = blob ? URL.createObjectURL(blob) : a.url;
      restoredAudio.push({ ...a, url, file: blob ? new File([blob], a.name, { type: blob.type }) : undefined });
    }
    setAudioTracks(restoredAudio); resetHistory();
    toast.success(t("toast.projectLoaded"));
    return true;
  }, [media, audioTracks, overlays, captionStyle, resetHistory]);

  const listProjects = useCallback(async (): Promise<ProjectMeta[]> => {
    const localAll = await idbAll<any>(STORE_PROJECTS);
    const localProjects = await Promise.all(
      localAll.map(async (p) => {
        let cover = p.coverImage || p.cover_image || null;
        if (!cover && p.media && p.media.length > 0) {
          const m = p.media[0];
          if (m.fileKey) {
            try {
              const blob = await idbGet<Blob>(STORE_FILES, m.fileKey);
              if (blob) cover = URL.createObjectURL(blob);
            } catch (e) { /* ignore */ }
          }
        }
        return {
          id: p.id, name: p.name, updatedAt: p.updatedAt || 0,
          duration: (p.clips || []).reduce((acc: number, c: any) => acc + (c.out - c.in), 0),
          preset: p.exportPreset || "full",
          coverImage: cover,
        };
      })
    );
    const { data: { session } } = await supabase.auth.getSession();
    let cloudProjects: ProjectMeta[] = [];
    if (session?.user) {
      const { data, error } = await supabase.from("projects").select("id, name, duration, export_preset, updated_at, cover_image").order("updated_at", { ascending: false });
      if (!error && data) {
        cloudProjects = data.map((p: any) => ({
          id: p.id, name: p.name, updatedAt: new Date(p.updated_at).getTime(), duration: p.duration || 0, preset: p.export_preset || "full", coverImage: p.cover_image || null
        }));
      }
    }
    const merged = new Map<string, ProjectMeta>();
    for (const p of localProjects) merged.set(p.id, p);
    for (const p of cloudProjects) merged.set(p.id, p);
    return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await idbDel(STORE_PROJECTS, id);
    const proj = await idbGet<any>(STORE_PROJECTS, id);
    if (proj?.media) for (const m of proj.media) await idbDel(STORE_FILES, m.fileKey);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) { await supabase.from("projects").delete().eq("id", id); }
    toast.success(t("toast.projectDeleted"));
  }, []);

  const getMediaById = useCallback((id: string) => media.find((m) => m.id === id), [media]);

  const splitClipsAtBeats = useCallback((beats: number[]) => {
    if (!beats.length) return;
    setClips((prev) => {
      const out: Clip[] = [];
      let acc = 0;
      for (const c of prev) {
        const len = c.out - c.in;
        const inBeats = beats.filter((b) => b > acc + 0.1 && b < acc + len - 0.1).map((b) => c.in + (b - acc)).sort((a, b) => a - b);
        if (!inBeats.length) { out.push(c); acc += len; continue; }
        let lastIn = c.in;
        for (const b of inBeats) { out.push({ id: uid(), mediaId: c.mediaId, in: lastIn, out: b }); lastIn = b; }
        out.push({ id: uid(), mediaId: c.mediaId, in: lastIn, out: c.out });
        acc += len;
      }
      toast.success(t("smartCut.done", { n: beats.length }));
      return out;
    });
  }, []);

  const applySmartTemplate = useCallback((tpl: import("@/lib/smartTemplates").SmartTemplate) => {
    const dur = clips.reduce((acc, c) => acc + Math.max(0, c.out - c.in), 0);
    if (clips.length === 0 || dur <= 0) { toast.error(t("toast.addMediaFirst")); return false; }
    setFilters(tpl.filters.map((f) => ({ id: uid(), type: f.type, start: 0, end: dur, intensity: f.intensity })));
    setVfx(tpl.vfx.map((v) => ({ id: uid(), type: v.type, start: 0, end: dur, intensity: v.intensity })));
    if (tpl.transition !== "none") {
      setClips((prev) => prev.map((c, i) => (i === 0 ? c : { ...c, transitionIn: { type: tpl.transition, duration: 0.5 } })));
    }
    setCaptionStyle((s) => ({ ...s, font: tpl.caption.font, size: tpl.caption.size, color: tpl.caption.color, bg: tpl.caption.bg, animation: tpl.caption.animation, position: tpl.caption.position }));
    if (tpl.segmentSec > 0) {
      const beats: number[] = [];
      for (let t = tpl.segmentSec; t < dur - 0.2; t += tpl.segmentSec) beats.push(t);
      if (beats.length) splitClipsAtBeats(beats);
    }
    toast.success(t("toast.templateApplied", { name: tpl.name }));
    return true;
  }, [clips, splitClipsAtBeats]);

  const addFilter = useCallback((f: Omit<FilterItem, "id">) => { setFilters((prev) => [...prev, { ...f, id: uid() }]); }, []);
  const updateFilter = useCallback((id: string, patch: Partial<FilterItem>) => { setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f))); }, []);
  const removeFilter = useCallback((id: string) => { setFilters((prev) => prev.filter((f) => f.id !== id)); }, []);
  const addVfx = useCallback((v: Omit<VfxItem, "id">) => { setVfx((prev) => [...prev, { ...v, id: uid() }]); }, []);
  const updateVfx = useCallback((id: string, patch: Partial<VfxItem>) => { setVfx((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v))); }, []);
  const removeVfx = useCallback((id: string) => { setVfx((prev) => prev.filter((v) => v.id !== id)); }, []);

  const addOverlay = useCallback(async (file: File): Promise<string> => {
    const id = uid(); const url = URL.createObjectURL(file);
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const item: OverlayItem = { id, url, type, name: file.name, file, start: 0, end: 3, x: 50, y: 50, scale: 0.4, opacity: 1, rotation: 0, blend: "normal", brightness: 1 };
    setOverlays((prev) => [...prev, item]);
    toast.success(t("toast.overlayAdded"));
    return id;
  }, []);
  const updateOverlay = useCallback((id: string, patch: Partial<OverlayItem>) => { setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o))); }, []);
  const removeOverlay = useCallback((id: string) => { setOverlays((prev) => { const item = prev.find((o) => o.id === id); if (item) URL.revokeObjectURL(item.url); return prev.filter((o) => o.id !== id); }); }, []);

  return (
    <MediaContext.Provider
      value={{
        media, clips, captions, captionStyle, audioTracks, videoMuted, videoVolume, videoAudioFx,
        exportPreset, projectName, projectId,
        filters, vfx, overlays,
        addFiles, updateMediaItem, removeMedia, clearMedia,
        setClips, splitClipAt, splitTrackAt, trimClip, removeClip, moveClip, setClipSpeed, setTransition,
        setFilters, setVfx, setOverlays,
        coverImage, setCoverImage,
        audioBeats, setAudioBeats,
        selectedAudioTrackId, setSelectedAudioTrackId,
        setCaptions, updateCaption, removeCaption, setCaptionStyle,
        setAudioTracks,
        addAudioTrack, updateAudioTrack, removeAudioTrack, setVideoMuted, setVideoVolume, setVideoAudioFx,
        addFilter, updateFilter, removeFilter,
        addVfx, updateVfx, removeVfx,
        addOverlay, updateOverlay, removeOverlay,
        setExportPreset, setProjectName, newProject, createNewProjectWithFiles, loadProject, listProjects, deleteProject,
        totalDuration, getMediaById, resolveTimelineTime, splitClipsAtBeats,
        applySmartTemplate,
        undo, redo, canUndo, canRedo,
      }}
    >
      {children}
    </MediaContext.Provider>
  );
};

export const useMedia = () => {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error("useMedia must be used within MediaProvider");
  return ctx;
};
