import { useMemo, useState, useEffect, useRef } from "react";
import { X, Download, Share2, Check, Sparkles, Film, Music, Languages, Sliders, Volume2, Loader2, Wifi, WifiOff, Globe, AlertTriangle } from "lucide-react";
import { useMedia, interpolateKeyframes } from "@/context/MediaContext";
import { toast } from "sonner";
import { t, isRTL, getLang } from "@/lib/i18n";
import { applyOfflineFxChain } from "@/lib/audioFx";
import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { saveVideoToGallery } from "@/services/NativeService";
import PublishTemplateDialog from "@/components/editor/PublishTemplateDialog";
import { robustSeekVideo } from "@/lib/videoSeeking";
import { validateExportedVideo } from "@/lib/videoValidator";
import { isWebCodecsSupported, exportWithWebCodecs } from "@/lib/webcodecsEncoder";

const VireonMedia = registerPlugin<any>('VireonMedia');


// 3. Fallback engine using browser MediaRecorder API for 100% offline & WASM-restricted environments
async function recordCanvasWithMediaRecorder(
  canvas: HTMLCanvasElement,
  totalDuration: number,
  fpsVal: number,
  renderedAudioBuffer: AudioBuffer | null,
  bitrateVal: number,
  onProgress: (p: number) => void,
  isAborted: () => boolean,
  renderFrameAtTime?: (elapsed: number) => Promise<void>
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      const mimeTypeCandidates = [
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];
      let mimeType = "";
      for (const t of mimeTypeCandidates) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }

      const stream = canvas.captureStream(fpsVal);
      let audioCtx: AudioContext | null = null;

      if (renderedAudioBuffer) {
        try {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtxClass) {
            audioCtx = new AudioCtxClass();
            const dest = audioCtx.createMediaStreamDestination();
            const src = audioCtx.createBufferSource();
            src.buffer = renderedAudioBuffer;
            src.connect(dest);
            src.start(0);
            dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
          }
        } catch (e) {
          console.warn("MediaRecorder audio track attachment notice:", e);
        }
      }

      const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: bitrateVal };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onerror = (err) => {
        if (audioCtx) { try { audioCtx.close(); } catch {} }
        reject(err);
      };

      recorder.onstop = () => {
        if (audioCtx) { try { audioCtx.close(); } catch {} }
        const finalType = recorder.mimeType || mimeType || "video/mp4";
        const resultBlob = new Blob(chunks, { type: finalType });
        resolve(resultBlob);
      };

      recorder.start(100);

      const dt = 1 / Math.max(1, fpsVal);
      let elapsedSec = 0;
      const durSec = Math.max(0.5, totalDuration);

      const stepRenderLoop = async () => {
        if (isAborted()) {
          try { recorder.stop(); } catch {}
          if (audioCtx) { try { audioCtx.close(); } catch {} }
          reject(new Error("Export cancelled"));
          return;
        }

        if (renderFrameAtTime && elapsedSec <= durSec + 0.05) {
          try {
            await renderFrameAtTime(elapsedSec);
          } catch (err) {
            console.warn("Render frame error in MediaRecorder fallback:", err);
          }
          elapsedSec += dt;
          const p = Math.min(0.99, elapsedSec / durSec);
          onProgress(0.85 + 0.14 * p);
          setTimeout(stepRenderLoop, Math.max(10, Math.round(dt * 1000)));
        } else {
          try { recorder.stop(); } catch {}
        }
      };

      stepRenderLoop();
    } catch (e) {
      reject(e);
    }
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectName: string;
  totalDuration: number;
  previewRef: React.RefObject<HTMLDivElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  onPlayForExport: () => void;
  onStopPlay: () => void;
  seekToStart: () => void;
  activeRatio?: number;
}

const QUALITY_OPTIONS = [
  { labelKey: "export.quality.4k", value: 2160, width: 3840, height: 2160, bitrate: 45_000_000 },
  { labelKey: "export.quality.2k", value: 1440, width: 2560, height: 1440, bitrate: 20_000_000 },
  { labelKey: "export.quality.1080p", value: 1080, width: 1920, height: 1080, bitrate: 8_000_000 },
  { labelKey: "export.quality.720p", value: 720, width: 1280, height: 720, bitrate: 5_000_000 },
  { labelKey: "export.quality.480p", value: 480, width: 854, height: 480, bitrate: 2_500_000 },
];
const FPS_OPTIONS = [24, 30, 60];

// Authentic Brand Icons for Social Sharing
const TikTokIcon = () => (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.89-2.89c.28 0 .54.04.79.1V9.4a6.33 6.33 0 1 0 5.55 6.27V9.45a8.27 8.27 0 0 0 4.77 1.49v-3.74a4.86 4.86 0 0 1-1.05-.51z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.99c-.002 5.45-4.437 9.884-9.885 9.884m0-18.421c-6.262 0-11.358 5.096-11.36 11.36 0 2.003.521 3.958 1.511 5.672l-1.604 5.86 5.996-1.573a11.31 11.31 0 005.451 1.401h.005c6.26 0 11.357-5.097 11.359-11.36.001-3.037-1.182-5.893-3.335-8.047a11.283 11.283 0 00-8.023-3.313"/>
  </svg>
);

const InstagramIcon = () => (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
  </svg>
);

const SnapchatIcon = () => (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M12.006 2c-3.791 0-5.889 2.457-5.992 5.097-.034.863.265 1.638.647 2.215.118.178.14.288.082.417-.11.246-.549.986-1.109 1.155-.386.116-.766-.021-.992-.294-.15-.182-.259-.283-.418-.283-.16 0-.317.098-.415.367-.149.408.069 1.05.613 1.547.464.424.962.585 1.428.528.239-.029.387.054.488.232.327.573 1.144.972 2.016 1.12.247.042.428.188.468.423.09.529.356 2.053.486 2.441.168.504.464.819.897.819.349 0 .736-.207 1.159-.617.476-.461.986-.713 1.499-.713.513 0 1.023.252 1.499.713.423.41.81.617 1.159.617.433 0 .729-.315.897-.819.13-.388.396-1.912.486-2.441.04-.235.221-.381.468-.423.872-.148 1.689-.547 2.016-1.12.101-.178.249-.261.488-.232.466.057.964-.104 1.428-.528.544-.497.762-1.139.613-1.547-.098-.269-.255-.367-.415-.367-.159 0-.268.101-.418.283-.226.273-.606.41-.992.294-.56-.169-.999-.909-1.109-1.155-.058-.129-.036-.239.082-.417.382-.577.681-1.352.647-2.215C17.895 4.457 15.797 2 12.006 2z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const SOCIALS = [
  { id: "tiktok", labelKey: "export.social.tiktok", color: "#000000", url: "https://www.tiktok.com/upload", icon: <TikTokIcon /> },
  { id: "whatsapp", labelKey: "export.social.whatsapp", color: "#25D366", url: "https://api.whatsapp.com/send", icon: <WhatsAppIcon /> },
  { id: "instagram", labelKey: "export.social.instagram", color: "linear-gradient(135deg, #833AB4, #FD1D1D, #FCAF45)", url: "https://www.instagram.com/", icon: <InstagramIcon /> },
  { id: "telegram", labelKey: "export.social.telegram", color: "#229ED9", url: "https://t.me/share/url", icon: <TelegramIcon /> },
  { id: "snapchat", labelKey: "export.social.snapchat", color: "#FFFC00", textColor: "#000000", url: "https://www.snapchat.com/", icon: <SnapchatIcon /> },
  { id: "youtube", labelKey: "export.social.youtube", color: "#FF0000", url: "https://studio.youtube.com", icon: <YouTubeIcon /> },
];

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

const ExportDialog = ({ open, onClose, projectName, totalDuration, previewRef, videoRef, onPlayForExport, onStopPlay, seekToStart, activeRatio = 1 }: Props) => {
  const {
    coverImage,
    clips = [],
    media = [],
    captions = [],
    captionStyle,
    audioTracks = [],
    filters = [],
    vfx = [],
    overlays = [],
    videoMuted,
    videoVolume,
    videoAudioFx,
    resolveTimelineTime,
  } = useMedia();
  const [quality, setQuality] = useState(2); // default to 1080p
  const [fps, setFps] = useState(1); // default to 30fps
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<string | null>(null);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [savedNativePath, setSavedNativePath] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"export" | "publish">("export");
  const [autoCoverUrl, setAutoCoverUrl] = useState<string | null>(null);
  const exportedBlobRef = useRef<Blob | null>(null);
  const abortControllerRef = useRef<boolean>(false);
  const ffmpegRef = useRef<any>(null);
  const writtenFilesRef = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);

  const [showSafeguardModal, setShowSafeguardModal] = useState<boolean>(false);
  const [safeguardDetails, setSafeguardDetails] = useState<{ estFrames: number; estMB: number; resName: string; fpsVal: number } | null>(null);

  // Auto-capture or pick cover image from video / media if user didn't set one explicitly
  useEffect(() => {
    if (!open) return;

    if (coverImage) {
      setAutoCoverUrl(coverImage);
      return;
    }

    let captured = false;
    if (videoRef?.current && videoRef.current.videoWidth > 0) {
      try {
        const v = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          if (dataUrl && dataUrl.length > 100) {
            setAutoCoverUrl(dataUrl);
            captured = true;
          }
        }
      } catch (e) {
        console.warn("videoRef cover capture notice:", e);
      }
    }

    if (captured) return;

    const firstMedia = media.length > 0 ? media[0] : null;
    if (firstMedia) {
      if (firstMedia.type === "image") {
        setAutoCoverUrl(firstMedia.url);
      } else if (firstMedia.type === "video") {
        const vid = document.createElement("video");
        vid.crossOrigin = "anonymous";
        vid.muted = true;
        vid.src = firstMedia.url;
        vid.currentTime = 0.5;
        vid.onloadeddata = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = vid.videoWidth || 640;
            canvas.height = vid.videoHeight || 360;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
              setAutoCoverUrl(canvas.toDataURL("image/jpeg", 0.85));
            }
          } catch {
            setAutoCoverUrl(firstMedia.thumbnail || firstMedia.url);
          }
        };
        vid.onerror = () => {
          setAutoCoverUrl(firstMedia.thumbnail || firstMedia.url);
        };
      }
    }
  }, [open, coverImage, videoRef, media, clips]);

  const displayCover = coverImage || autoCoverUrl;

  // Detect true video dimensions and orientation
  const trueVideoDimensions = useMemo(() => {
    if (videoRef?.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      return { w: videoRef.current.videoWidth, h: videoRef.current.videoHeight };
    }
    if (media.length > 0) {
      const m = media[0];
      if (m.width && m.height) {
        return { w: m.width, h: m.height };
      }
    }
    return null;
  }, [videoRef, media]);

  const effectiveRatioObj = useMemo(() => {
    if (trueVideoDimensions && (activeRatio === 0 || activeRatio === 1 || !aspectRatios[activeRatio])) {
      const trueAspect = trueVideoDimensions.w / trueVideoDimensions.h;
      let closestIdx = 0;
      let minDiff = Infinity;
      aspectRatios.forEach((r, idx) => {
        const diff = Math.abs((r.w / r.h) - trueAspect);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      return aspectRatios[closestIdx];
    }
    return aspectRatios[activeRatio] || aspectRatios[0];
  }, [activeRatio, trueVideoDimensions]);

  // Perimeter draw offset
  const PERIM = 1000;
  const dashOffset = useMemo(() => PERIM * (1 - progress), [progress]);

  useEffect(() => {
    if (open) {
      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl);
        setExportedVideoUrl(null);
      }
      setProgress(0);
      setExporting(false);
      setEstimatedTimeLeft(null);
      abortControllerRef.current = false;
    } else {
      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl);
        setExportedVideoUrl(null);
      }
    }
    return () => {
      abortControllerRef.current = true;
    };
  }, [open, exportedVideoUrl]);

  if (!open) return null;

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0 || !isFinite(seconds)) return null;
    const rounded = Math.ceil(seconds);
    if (rounded < 60) {
      return isRTL() ? `${rounded} ثانية متبقية` : `${rounded}s remaining`;
    }
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return isRTL()
      ? `${mins} دقيقة و ${secs} ثانية متبقية`
      : `${mins}m ${secs}s remaining`;
  };

  const handleCancelExport = async () => {
    abortControllerRef.current = true;
    toast.info(isRTL() ? "تم إلغاء التصدير وتنظيف الموارد" : "Export cancelled and resources freed");
    
    if (cleanupRef.current) {
      try { cleanupRef.current(); } catch (e) { console.warn(e); }
    }

    if (ffmpegRef.current) {
      if (writtenFilesRef.current.size > 0) {
        try {
          const deletePromises = Array.from(writtenFilesRef.current).map(fileName =>
            ffmpegRef.current.deleteFile(fileName).catch(() => {})
          );
          await Promise.all(deletePromises);
          writtenFilesRef.current.clear();
        } catch (e) {
          console.warn("Virtual file deletion error on cancel:", e);
        }
      }
      try {
        ffmpegRef.current.terminate();
      } catch (e) {
        console.warn("FFmpeg terminate warning:", e);
      }
      ffmpegRef.current = null;
    }

    setExporting(false);
    setProgress(0);
    setEstimatedTimeLeft(null);
  };

  const handleCloseDialog = () => {
    if (exporting) {
      handleCancelExport();
    } else {
      abortControllerRef.current = true;
      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl);
        setExportedVideoUrl(null);
      }
      onClose();
    }
  };

  // Compute rendering step message based on progress
  const getRenderStepMessage = (p: number) => {
    const percentage = Math.round(p * 100);
    if (percentage <= 20) return isRTL() ? "تهيئة محرك المعالجة المتطور..." : "Initializing advanced rendering engine...";
    if (percentage <= 45) return isRTL() ? "تركيب مقاطع الفيديو والصور والتأثيرات..." : "Stitching video, photos and transitions...";
    if (percentage <= 70) return isRTL() ? "رسم تراكيب الكابشن والطبقات البصرية..." : "Applying overlays, custom captions and VFX...";
    if (percentage <= 90) return isRTL() ? "دمج وهندسة المسارات الصوتية الذكية..." : "Mixing audio tracks & background music...";
    if (percentage <= 99) return isRTL() ? "تشفير وحرق التعديلات في ملف MP4 نهائي..." : "Encoding and burning final edits into MP4...";
    return isRTL() ? "تم التصدير بنجاح!" : "Export completed successfully!";
  };

  // Helper: compute aspect contain dimensions
  const getContainSize = (mediaW: number, mediaH: number, canvasW: number, canvasH: number) => {
    const mediaRatio = mediaW / mediaH;
    const canvasRatio = canvasW / canvasH;
    let drawW = canvasW;
    let drawH = canvasH;
    if (mediaRatio > canvasRatio) {
      drawH = canvasW / mediaRatio;
    } else {
      drawW = canvasH * mediaRatio;
    }
    return { drawW, drawH };
  };

  // Helper: compute active filters CSS string
  const getFilterCSSString = (time: number) => {
    const active = filters.filter((f) => time >= f.start && time <= f.end);
    if (!active.length) return "";
    const parts: string[] = [];
    for (const f of active) {
      const i = f.intensity;
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
        case "fade-edge": parts.push(`blur(${i * 0.5}px) brightness(${1 + i * 0.15}) saturate(${1 - i * 0.2})`); break;
        case "duotone": parts.push(`grayscale(${i * 0.8}) sepia(${i * 0.5}) hue-rotate(${i * 180}deg) contrast(${1 + i * 0.3})`); break;
        case "dream": parts.push(`blur(${i * 0.4}px) brightness(${1 + i * 0.15}) saturate(${1 + i * 0.3}) contrast(${1 - i * 0.1})`); break;
        case "neon": parts.push(`saturate(${1 + i * 0.8}) contrast(${1 + i * 0.4}) hue-rotate(${i * 60}deg) brightness(${1 + i * 0.1})`); break;
        case "sepia-blue": parts.push(`sepia(${i * 0.5}) hue-rotate(${i * 180}deg) saturate(${1 + i * 0.3})`); break;
      }
      if (f.brightness !== undefined && f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
      if (f.contrast !== undefined && f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
      if (f.saturation !== undefined && f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
      if (f.blur !== undefined && f.blur > 0) parts.push(`blur(${f.blur}px)`);
      if (f.hueRotate !== undefined && f.hueRotate !== 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
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
  };

  const startExport = async (bypassSafeguard: boolean = false) => {
    if (clips.length === 0) {
      toast.error(isRTL() ? "لا يوجد مقاطع فيديو أو صور للتصدير!" : "No clips available to export!");
      return;
    }

    const fpsValCheck = FPS_OPTIONS[fps] || 30;
    const totalFramesCheck = Math.ceil(totalDuration * fpsValCheck);
    const chosenQualityCheck = QUALITY_OPTIONS[quality] || QUALITY_OPTIONS[2];
    const estSizeBytesCheck = (chosenQualityCheck.bitrate * totalDuration) / 8;
    const estMBCheck = Math.round(estSizeBytesCheck / (1024 * 1024));

    if (!bypassSafeguard && (totalFramesCheck > 3000 || estMBCheck > 150 || (chosenQualityCheck.value >= 1440 && totalDuration > 45))) {
      setSafeguardDetails({
        estFrames: totalFramesCheck,
        estMB: estMBCheck,
        resName: `${chosenQualityCheck.value}p`,
        fpsVal: fpsValCheck,
      });
      setShowSafeguardModal(true);
      return;
    }

    setExporting(true);
    setProgress(0);
    setEstimatedTimeLeft(null);
    if (exportedVideoUrl) {
      URL.revokeObjectURL(exportedVideoUrl);
      setExportedVideoUrl(null);
    }
    abortControllerRef.current = false;
    writtenFilesRef.current.clear();
    const exportStartTime = Date.now();

    toast.info(t("toast.exportStarted"));

    try {
      // 1. First-time loading of FFmpeg core (Offline-First)
    if (!ffmpegRef.current) {
      toast.info(isRTL() ? "جاري تحضير محرك التصدير دون اتصال..." : "Preparing offline export engine...");
      setProgress(0.02);
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        const ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({ message }) => {
          console.log("FFmpeg Log:", message);
        });

        // Try loading bundled local core files (100% offline, zero network dependencies)
        let loaded = false;
        try {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const coreUrl = `${origin}/ffmpeg/ffmpeg-core.js`;
          const wasmUrl = `${origin}/ffmpeg/ffmpeg-core.wasm`;
          await ffmpeg.load({
            coreURL: await toBlobURL(coreUrl, "text/javascript"),
            wasmURL: await toBlobURL(wasmUrl, "application/wasm"),
          });
          ffmpegRef.current = ffmpeg;
          loaded = true;
          console.log("FFmpeg core loaded successfully from local bundle.");
        } catch (localErr) {
          console.warn("Local FFmpeg core load notice:", localErr);
        }

        if (!loaded) {
          console.warn("FFmpeg WASM unavailable; falling back directly to Native Canvas Exporter.");
        }
      } catch (err) {
        console.warn("FFmpeg setup warning, using Canvas MediaRecorder fallback:", err);
      }
    }

    // Ensure custom web fonts are loaded
    try {
      if ("fonts" in document) {
        await document.fonts.ready;
      }
    } catch {}

    // 2. Calculate resolution based on selected options and true video aspect ratio
    const ratioObj = effectiveRatioObj;
    const chosenQuality = QUALITY_OPTIONS[quality] || QUALITY_OPTIONS[2];

    let canvasW: number;
    let canvasH: number;

    if (ratioObj.w >= ratioObj.h) {
      // Landscape / Square: height is quality value, width scales proportionally
      canvasH = chosenQuality.value;
      canvasW = Math.round(canvasH * (ratioObj.w / ratioObj.h));
    } else {
      // Portrait (e.g. 9:16, 4:5): width is quality value, height scales proportionally (e.g. 1080x1920)
      canvasW = chosenQuality.value;
      canvasH = Math.round(canvasW * (ratioObj.h / ratioObj.w));
    }
    
    // Ensure width and height are even numbers
    const exportWidth = canvasW % 2 === 0 ? canvasW : canvasW + 1;
    const exportHeight = canvasH % 2 === 0 ? canvasH : canvasH + 1;

    const previewW = previewRef.current?.clientWidth || 360;
    const previewH = previewRef.current?.clientHeight || 640;

    // 3. Create offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      toast.error("Failed to create rendering context.");
      setExporting(false);
      return;
    }

    // Create a hidden container appended to the DOM to bypass mobile WebView media throttling and muting
    const hiddenContainer = document.createElement("div");
    hiddenContainer.id = "vireon-export-hidden-container";
    hiddenContainer.style.position = "absolute";
    hiddenContainer.style.width = "0px";
    hiddenContainer.style.height = "0px";
    hiddenContainer.style.overflow = "hidden";
    hiddenContainer.style.opacity = "0";
    hiddenContainer.style.pointerEvents = "none";
    document.body.appendChild(hiddenContainer);

    // 4. Preload all clips and overlays (images AND video overlays) into offline elements
    const preloadedMap: Record<string, HTMLImageElement | HTMLVideoElement> = {};
    const itemsToPreload = new Set<{ idOrUrl: string; type: "image" | "video"; url: string }>();

    clips.forEach(c => {
      const m = media.find(item => item.id === c.mediaId);
      if (m) {
        itemsToPreload.add({ idOrUrl: c.mediaId, type: m.type as any, url: m.url });
      } else {
        itemsToPreload.add({ idOrUrl: c.mediaId, type: "image", url: c.mediaId });
      }
    });

    overlays.forEach(o => {
      const m = media.find(item => item.id === o.url);
      const url = m ? m.url : o.url;
      const type = o.type === "video" ? "video" : (m ? (m.type as any) : "image");
      itemsToPreload.add({ idOrUrl: o.url, type, url });
    });

    const totalItems = itemsToPreload.size;
    let loadedItems = 0;

    const preloadAllAssets = async () => {
      const promises = Array.from(itemsToPreload).map(async ({ idOrUrl, type, url }) => {
        const isExternal = url.startsWith("http://") || url.startsWith("https://");

        if (type === "image") {
          return new Promise<void>((resolve) => {
            const img = new Image();
            if (isExternal) {
              img.crossOrigin = "anonymous";
            }
            img.src = url;
            img.onload = () => {
              preloadedMap[idOrUrl] = img;
              preloadedMap[url] = img;
              hiddenContainer.appendChild(img);
              loadedItems++;
              setProgress(0.05 + 0.10 * (loadedItems / Math.max(1, totalItems)));
              resolve();
            };
            img.onerror = () => {
              console.warn("Failed to preload image:", url);
              loadedItems++;
              setProgress(0.05 + 0.10 * (loadedItems / Math.max(1, totalItems)));
              resolve();
            };
          });
        } else {
          return new Promise<void>((resolve) => {
            const vid = document.createElement("video");
            if (isExternal) {
              vid.crossOrigin = "anonymous";
            }
            vid.muted = true;
            vid.playsInline = true;
            vid.src = url;
            vid.preload = "auto";
            
            vid.onloadeddata = () => {
              preloadedMap[idOrUrl] = vid;
              preloadedMap[url] = vid;
              hiddenContainer.appendChild(vid);
              loadedItems++;
              setProgress(0.05 + 0.10 * (loadedItems / Math.max(1, totalItems)));
              resolve();
            };
            vid.onerror = () => {
              console.warn("Failed to preload video:", url);
              loadedItems++;
              setProgress(0.05 + 0.10 * (loadedItems / Math.max(1, totalItems)));
              resolve();
            };
            vid.load();
          });
        }
      });

      await Promise.all(promises);
    };

    // Run the preloading phase
    await preloadAllAssets();
    if (abortControllerRef.current) {
      try { hiddenContainer.parentNode?.removeChild(hiddenContainer); } catch {}
      setExporting(false);
      setProgress(0);
      return;
    }

    // 5. Setup OfflineAudioContext and render background music / voiceover / video audio
    const hasAudioSources = audioTracks.length > 0 || (!videoMuted && clips.some(c => {
      const m = media.find(item => item.id === c.mediaId);
      return m && m.type === "video";
    }));

    const fetchAndDecodeAudio = async (url: string, targetCtx: BaseAudioContext) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const decoded = await targetCtx.decodeAudioData(arrayBuffer);
        return decoded;
      } catch (err) {
        console.warn(`Failed to fetch/decode audio from ${url}:`, err);
        return null;
      }
    };

    const bufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const view = new DataView(bufferArr);
      const channels = [];
      let i;
      let sample;
      let offset = 0;
      let pos = 0;

      const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
      };

      const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
      };

      // write Header
      setUint32(0x46464952); // "RIFF"
      setUint32(length - 8); // file length - 8
      setUint32(0x45564157); // "WAVE"

      setUint32(0x20746d66); // "fmt " chunk
      setUint32(16); // chunk size = 16
      setUint16(1); // PCM = 1
      setUint16(numOfChan);
      setUint32(buffer.sampleRate);
      setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
      setUint16(numOfChan * 2); // block align
      setUint16(16); // bits per sample = 16

      setUint32(0x61746164); // "data" chunk
      setUint32(length - pos - 4); // chunk length

      // write interleaved data
      for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }

      while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
          sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
          sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff; // scale to 16-bit signed int
          view.setInt16(pos, sample, true);
          pos += 2;
        }
        offset++;
      }

      return bufferArr;
    };

    const audioBufferCache: Record<string, AudioBuffer> = {};
    let renderedAudioBuffer: AudioBuffer | null = null;

    if (hasAudioSources) {
      setProgress(0.15);
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

      // Render background music / voiceover tracks
      let audioTrackCount = 0;
      for (const track of audioTracks) {
        if (abortControllerRef.current) return;
        let buffer = audioBufferCache[track.url];
        if (!buffer) {
          buffer = await fetchAndDecodeAudio(track.url, offlineCtx);
          if (buffer) {
            audioBufferCache[track.url] = buffer;
          }
        }
        if (buffer) {
          try {
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            const gainNode = offlineCtx.createGain();
            gainNode.gain.value = track.volume * (track.muted ? 0 : 1);
            source.connect(gainNode);
            const fxOut = applyOfflineFxChain(offlineCtx, gainNode, track.fx || "none");
            fxOut.connect(offlineCtx.destination);

            const startOffset = Math.min(track.offset || 0, buffer.duration);
            const playDuration = Math.max(0, Math.min(track.duration, buffer.duration - startOffset));
            source.start(track.start, startOffset, playDuration);
          } catch (err) {
            console.warn("OfflineAudioContext scheduling failed for track:", track.url, err);
          }
        }
        audioTrackCount++;
        setProgress(0.15 + 0.05 * (audioTrackCount / Math.max(1, audioTracks.length)));
      }

      // Render video clips audio
      if (!videoMuted) {
        let runningClipStart = 0;
        let clipIndexCount = 0;
        for (const clip of clips) {
          if (abortControllerRef.current) return;
          const sp = clip.speed && clip.speed > 0 ? clip.speed : 1;
          const len = Math.max(0, clip.out - clip.in) / sp;
          const clipStart = runningClipStart;
          runningClipStart += len;

          const mItem = media.find(m => m.id === clip.mediaId);
          if (mItem && mItem.type === "video") {
            let buffer = audioBufferCache[mItem.url];
            if (!buffer) {
              buffer = await fetchAndDecodeAudio(mItem.url, offlineCtx);
              if (buffer) {
                audioBufferCache[mItem.url] = buffer;
              }
            }
            if (buffer) {
              try {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = sp;

                const gainNode = offlineCtx.createGain();
                const baseVol = (clip.volume !== undefined ? clip.volume : 1) * videoVolume;
                gainNode.gain.setValueAtTime(baseVol, clipStart);

                // volume keyframes
                if (clip.keyframes && clip.keyframes.length > 0) {
                  const volKeyframes = clip.keyframes.filter(kf => kf.property === "volume");
                  volKeyframes.forEach(kf => {
                    const kfTimelineTime = clipStart + kf.time;
                    const targetVol = kf.value * videoVolume;
                    gainNode.gain.linearRampToValueAtTime(targetVol, kfTimelineTime);
                  });
                }

                source.connect(gainNode);
                const fxOut = applyOfflineFxChain(offlineCtx, gainNode, videoAudioFx || "none");
                fxOut.connect(offlineCtx.destination);

                const startOffset = Math.min(clip.in, buffer.duration);
                const srcDuration = Math.max(0, Math.min(clip.out, buffer.duration) - startOffset);
                source.start(clipStart, startOffset, srcDuration);
              } catch (err) {
                console.warn("OfflineAudioContext video audio scheduling failed:", mItem.url, err);
              }
            }
          }
          clipIndexCount++;
          setProgress(0.20 + 0.05 * (clipIndexCount / Math.max(1, clips.length)));
        }
      }

      try {
        renderedAudioBuffer = await offlineCtx.startRendering();
        if (ffmpegRef.current && renderedAudioBuffer) {
          const wavBytes = bufferToWav(renderedAudioBuffer);
          await ffmpegRef.current.writeFile("audio.wav", new Uint8Array(wavBytes));
          writtenFilesRef.current.add("audio.wav");
        }
      } catch (err) {
        console.error("Offline audio rendering failed:", err);
      }
    }

    setProgress(0.25);

    // 6. Draw frames sequentially
    const fpsVal = FPS_OPTIONS[fps] || 30;
    const frameDuration = 1 / fpsVal;
    const totalFrames = Math.ceil(totalDuration * fpsVal);

    // High performance frame renderer function shared by FFmpeg and MediaRecorder fallback
    const drawFrameAtTime = async (elapsed: number) => {
        // Resolve current clip and timing details
      const resClip = resolveTimelineTime(elapsed);
      const activeMedia = resClip ? media.find(m => m.id === resClip.clip.mediaId) : null;

      // Seek active video if needed
      if (resClip && activeMedia && activeMedia.type === "video") {
        const preloadedVid = preloadedMap[resClip.clip.mediaId] as HTMLVideoElement;
        if (preloadedVid) {
          preloadedVid.muted = true;
          preloadedVid.playbackRate = resClip.clip.speed && resClip.clip.speed > 0 ? resClip.clip.speed : 1;
          await robustSeekVideo(preloadedVid, resClip.mediaTime, { timeoutMs: 1500, toleranceSec: 0.04 });
        }
      }

      // Clear offscreen canvas
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, exportWidth, exportHeight);

      // Oscillate microscopic pixel color
      ctx.fillStyle = `rgba(0, 0, 0, ${0.01 + 0.005 * Math.sin(elapsed * 100)})`;
      ctx.fillRect(0, 0, 1, 1);

      // Draw active clip with custom parameters
      if (resClip && activeMedia) {
        const clip = resClip.clip;
        ctx.save();

        // 1. Staged Alpha transition and keyframed Opacity
        const clipLocalTime = elapsed - resClip.clipStart;
        let alpha = 1;
        let transDuration = clip.transitionIn?.duration || 0;
        if (transDuration > 10) transDuration /= 1000;

        if (clip.transitionIn && clip.transitionIn.type !== "none") {
          if (clipLocalTime < transDuration) {
            alpha = clipLocalTime / transDuration;
          }
        }
        const keyframeOpacity = interpolateKeyframes(clip, "opacity", clipLocalTime, clip.opacity ?? 1);
        ctx.globalAlpha = alpha * keyframeOpacity;

        // 2. Active Scale, Rotation, Flip, and Position Pan transformations
        const scale = interpolateKeyframes(clip, "scale", clipLocalTime, clip.scale ?? 1);
        const panX = interpolateKeyframes(clip, "panX", clipLocalTime, clip.panX ?? 0);
        const panY = interpolateKeyframes(clip, "panY", clipLocalTime, clip.panY ?? 0);
        const rotation = interpolateKeyframes(clip, "rotation", clipLocalTime, clip.rotation ?? 0);
        const flipH = clip.flipH ?? false;
        const flipV = clip.flipV ?? false;

        // Center-origin positioning
        ctx.translate(exportWidth / 2, exportHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale((flipH ? -1 : 1) * scale, (flipV ? -1 : 1) * scale);

        // Pan scale translation
        const px = panX * (exportWidth / previewW);
        const py = panY * (exportHeight / previewH);
        ctx.translate(px, py);

        // 3. Render color-grading filter lookup
        const filterStr = getFilterCSSString(elapsed);
        if (filterStr) {
          ctx.filter = filterStr;
        }

        // 4. Render actual preloaded media layer
        if (activeMedia.type === "video") {
          const preloadedVid = preloadedMap[clip.mediaId] as HTMLVideoElement;
          if (preloadedVid && preloadedVid.videoWidth > 0) {
            const vw = preloadedVid.videoWidth;
            const vh = preloadedVid.videoHeight;
            const { drawW, drawH } = getContainSize(vw, vh, exportWidth, exportHeight);
            ctx.drawImage(preloadedVid, -drawW / 2, -drawH / 2, drawW, drawH);
          }
        } else if (activeMedia.type === "image") {
          const preloadedImg = preloadedMap[clip.mediaId] as HTMLImageElement;
          if (preloadedImg && (preloadedImg.complete || preloadedImg.naturalWidth > 0)) {
            const iw = preloadedImg.naturalWidth || 1080;
            const ih = preloadedImg.naturalHeight || 1920;
            const { drawW, drawH } = getContainSize(iw, ih, exportWidth, exportHeight);
            ctx.drawImage(preloadedImg, -drawW / 2, -drawH / 2, drawW, drawH);
          }
        }

        // 5. Render transitions inside transform context
        const trans = clip.transitionIn;
        const clipElapsed = elapsed - resClip.clipStart;
        if (trans && trans.type !== "none" && clipElapsed < transDuration) {
          const tRatio = clipElapsed / transDuration;
          const invTRatio = 1 - tRatio;
          
          if (trans.type === "blur") {
            ctx.save();
            ctx.filter = `blur(${invTRatio * 24}px)`;
            if (activeMedia.type === "video") {
              const preloadedVid = preloadedMap[clip.mediaId] as HTMLVideoElement;
              if (preloadedVid && preloadedVid.videoWidth > 0) {
                const vw = preloadedVid.videoWidth;
                const vh = preloadedVid.videoHeight;
                const { drawW, drawH } = getContainSize(vw, vh, exportWidth, exportHeight);
                ctx.drawImage(preloadedVid, -drawW / 2, -drawH / 2, drawW, drawH);
              }
            } else if (activeMedia.type === "image") {
              const preloadedImg = preloadedMap[clip.mediaId] as HTMLImageElement;
              if (preloadedImg && (preloadedImg.complete || preloadedImg.naturalWidth > 0)) {
                const iw = preloadedImg.naturalWidth || 1080;
                const ih = preloadedImg.naturalHeight || 1920;
                const { drawW, drawH } = getContainSize(iw, ih, exportWidth, exportHeight);
                ctx.drawImage(preloadedImg, -drawW / 2, -drawH / 2, drawW, drawH);
              }
            }
            ctx.restore();
          } else if (trans.type === "zoom") {
            const zoomScale = 1 + invTRatio * 0.35;
            ctx.scale(zoomScale, zoomScale);
          }
        }

        // Reset filter & restore context to default screen-space
        ctx.filter = "none";
        ctx.restore();

        // 6. Render screen-space transition overlays (fade, iris, wipes, slide, flash)
        if (trans && trans.type !== "none" && clipElapsed < transDuration) {
          const tRatio = clipElapsed / transDuration;
          const invTRatio = 1 - tRatio;
          ctx.save();

          if (trans.type === "fade") {
            ctx.fillStyle = `rgba(0, 0, 0, ${invTRatio})`;
            ctx.fillRect(0, 0, exportWidth, exportHeight);
          } else if (trans.type === "dissolve") {
            ctx.fillStyle = `rgba(0, 0, 0, ${invTRatio * 0.6})`;
            ctx.fillRect(0, 0, exportWidth, exportHeight);
            ctx.fillStyle = `rgba(255, 255, 255, ${invTRatio * 0.15})`;
            ctx.fillRect(0, 0, exportWidth, exportHeight);
          } else if (trans.type === "flash") {
            ctx.fillStyle = `rgba(255, 140, 0, ${invTRatio * 0.9})`;
            ctx.fillRect(0, 0, exportWidth, exportHeight);
          } else if (trans.type === "shutter") {
            ctx.fillStyle = "#000000";
            const shutH = (exportHeight / 2) * invTRatio;
            ctx.fillRect(0, 0, exportWidth, shutH);
            ctx.fillRect(0, exportHeight - shutH, exportWidth, shutH);
          } else if (trans.type === "wipe") {
            const wipeX = tRatio * exportWidth;
            const grad = ctx.createLinearGradient(wipeX - 40, 0, wipeX + 40, 0);
            grad.addColorStop(0, "transparent");
            grad.addColorStop(0.5, "rgba(168, 85, 247, 0.95)");
            grad.addColorStop(1, "transparent");
            ctx.fillStyle = grad;
            ctx.fillRect(wipeX - 40, 0, 80, exportHeight);
          } else if (trans.type === "slide") {
            const slideX = invTRatio * exportWidth;
            ctx.fillStyle = "rgba(168, 85, 247, 0.4)";
            ctx.fillRect(0, 0, slideX, exportHeight);
          } else if (trans.type === "iris") {
            const cx = exportWidth / 2;
            const cy = exportHeight / 2;
            const maxRad = Math.sqrt(cx * cx + cy * cy);
            const r = tRatio * maxRad;
            ctx.fillStyle = "black";
            ctx.beginPath();
            ctx.rect(0, 0, exportWidth, exportHeight);
            ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
            ctx.fill();
          } else if (trans.type === "glitch") {
            if (Math.random() < 0.45) {
              ctx.fillStyle = "rgba(255, 0, 0, 0.15)";
              ctx.fillRect(0, 0, exportWidth, exportHeight);
            }
          } else if (trans.type === "split") {
            ctx.fillStyle = "#000000";
            const halfW = exportWidth / 2;
            const shutW = halfW * invTRatio;
            ctx.fillRect(0, 0, shutW, exportHeight);
            ctx.fillRect(exportWidth - shutW, 0, shutW, exportHeight);
          } else if (trans.type === "mosaic") {
            ctx.fillStyle = `rgba(17, 17, 17, ${invTRatio * 0.7})`;
            ctx.fillRect(0, 0, exportWidth, exportHeight);
          } else if (trans.type === "ripple") {
            ctx.strokeStyle = `rgba(59, 130, 246, ${invTRatio * 0.8})`;
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.arc(exportWidth / 2, exportHeight / 2, tRatio * exportWidth * 0.6, 0, Math.PI * 2);
            ctx.stroke();
          } else if (trans.type === "radar") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
            ctx.beginPath();
            ctx.moveTo(exportWidth / 2, exportHeight / 2);
            ctx.arc(exportWidth / 2, exportHeight / 2, Math.sqrt(exportWidth * exportWidth + exportHeight * exportHeight), -Math.PI / 2, -Math.PI / 2 + tRatio * Math.PI * 2);
            ctx.lineTo(exportWidth / 2, exportHeight / 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      // Draw ALL 18 VFX layers
      const activeVfxs = vfx.filter(v => elapsed >= v.start && elapsed <= v.end);
      for (const v of activeVfxs) {
        const intensity = v.intensity ?? 1;
        ctx.save();

        if (v.type === "flash") {
          const flashAlpha = Math.max(0, Math.sin(elapsed * 12) * intensity * 0.7);
          ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
          ctx.fillRect(0, 0, exportWidth, exportHeight);
        } else if (v.type === "light-leak") {
          const lx = 50 + Math.sin(elapsed * 2) * 20;
          const ly = 30 + Math.cos(elapsed * 3) * 15;
          const grad = ctx.createRadialGradient(
            (lx / 100) * exportWidth, (ly / 100) * exportHeight, 0,
            (lx / 100) * exportWidth, (ly / 100) * exportHeight, exportWidth * 0.75
          );
          grad.addColorStop(0, `rgba(249,115,22,${intensity * 0.45})`);
          grad.addColorStop(0.4, `rgba(236,72,153,${intensity * 0.2})`);
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, exportWidth, exportHeight);
        } else if (v.type === "scan-lines") {
          ctx.fillStyle = `rgba(0,0,0,${0.18 * intensity})`;
          for (let y = 0; y < exportHeight; y += 4) {
            ctx.fillRect(0, y, exportWidth, 2);
          }
        } else if (v.type === "film-grain") {
          ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05 * intensity})`;
          ctx.fillRect(0, 0, exportWidth, exportHeight);
        } else if (v.type === "glitch") {
          if (Math.random() < 0.6) {
            const h = Math.random() * 20 + 5;
            const y = Math.random() * exportHeight;
            ctx.fillStyle = "rgba(236, 72, 153, 0.25)";
            ctx.fillRect(Math.random() * 30 - 15, y, exportWidth, h);
            ctx.fillStyle = "rgba(6, 182, 212, 0.25)";
            ctx.fillRect(Math.random() * 30 - 15, y + 2, exportWidth, h);
          }
        } else if (v.type === "shake") {
          const offX = Math.sin(elapsed * 35) * 12 * intensity;
          ctx.translate(offX, 0);
        } else if (v.type === "shake-v") {
          const offY = Math.cos(elapsed * 35) * 12 * intensity;
          ctx.translate(0, offY);
        } else if (v.type === "zoom-pulse") {
          const pulse = 1 + Math.sin(elapsed * 15) * 0.06 * intensity;
          ctx.translate(exportWidth / 2, exportHeight / 2);
          ctx.scale(pulse, pulse);
          ctx.translate(-exportWidth / 2, -exportHeight / 2);
        } else if (v.type === "rgb-split" || v.type === "chromatic") {
          ctx.globalAlpha = 0.2 * intensity;
          ctx.fillStyle = "#ff0040";
          ctx.fillRect(6 * intensity, 0, exportWidth, exportHeight);
          ctx.fillStyle = "#00ffff";
          ctx.fillRect(-6 * intensity, 0, exportWidth, exportHeight);
        } else if (v.type === "vhs") {
          ctx.fillStyle = "rgba(168, 85, 247, 0.1)";
          ctx.fillRect(0, 0, exportWidth, exportHeight);
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(0, exportHeight - 20, exportWidth, 10);
        } else if (v.type === "pixelate") {
          ctx.fillStyle = `rgba(59, 130, 246, ${0.15 * intensity})`;
          const step = Math.max(16, Math.round(exportHeight / 40));
          for (let py = 0; py < exportHeight; py += step * 2) {
            for (let px = 0; px < exportWidth; px += step * 2) {
              ctx.fillRect(px, py, step, step);
            }
          }
        } else if (v.type === "rotate-3d") {
          const rot = Math.sin(elapsed * 3) * 4 * intensity;
          ctx.translate(exportWidth / 2, exportHeight / 2);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.translate(-exportWidth / 2, -exportHeight / 2);
        } else if (v.type === "particles") {
          ctx.fillStyle = "rgba(245, 158, 11, 0.6)";
          for (let pIdx = 0; pIdx < 20; pIdx++) {
            const px = ((pIdx * 137.5 + elapsed * 50) % exportWidth);
            const py = ((pIdx * 211.3 - elapsed * 80 + exportHeight * 2) % exportHeight);
            const pr = (pIdx % 3) + 2;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (v.type === "bounce") {
          const bY = Math.abs(Math.sin(elapsed * 10)) * 16 * intensity;
          ctx.translate(0, -bY);
        } else if (v.type === "swing") {
          const sRot = Math.sin(elapsed * 5) * 5 * intensity;
          ctx.translate(exportWidth / 2, exportHeight / 2);
          ctx.rotate((sRot * Math.PI) / 180);
          ctx.translate(-exportWidth / 2, -exportHeight / 2);
        } else if (v.type === "heartbeat") {
          const hb = 1 + (Math.sin(elapsed * 12) > 0.5 ? 0.05 : 0) * intensity;
          ctx.translate(exportWidth / 2, exportHeight / 2);
          ctx.scale(hb, hb);
          ctx.translate(-exportWidth / 2, -exportHeight / 2);
        } else if (v.type === "prism") {
          const grad = ctx.createLinearGradient(0, 0, exportWidth, exportHeight);
          grad.addColorStop(0, "rgba(217, 70, 239, 0.15)");
          grad.addColorStop(0.5, "rgba(34, 211, 238, 0.15)");
          grad.addColorStop(1, "rgba(251, 146, 60, 0.15)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, exportWidth, exportHeight);
        }

        ctx.restore();
      }

      // Draw Active Sticker/Image/Video Overlays with Preview-Matching Scale & Bounding
      const activeOvs = overlays.filter(o => elapsed >= o.start && elapsed <= o.end);
      for (const o of activeOvs) {
        let el = preloadedMap[o.url] || preloadedMap[o.id];
        if (!el) {
          const m = media.find(item => item.id === o.url);
          if (m) el = preloadedMap[m.url] || preloadedMap[m.id];
        }

        if (el) {
          if (el instanceof HTMLVideoElement) {
            el.muted = true;
            await robustSeekVideo(el, Math.max(0, elapsed - o.start), { timeoutMs: 1500, toleranceSec: 0.04 });
          }

          const isImgComplete = el instanceof HTMLImageElement && (el.complete || el.naturalWidth > 0);
          const isVidReady = el instanceof HTMLVideoElement && el.videoWidth > 0;

          if (isImgComplete || isVidReady) {
            ctx.save();
            const ox = (o.x / 100) * exportWidth;
            const oy = (o.y / 100) * exportHeight;
            ctx.translate(ox, oy);
            ctx.rotate(((o.rotation ?? 0) * Math.PI) / 180);

            const flipH = o.flipH ?? false;
            const flipV = o.flipV ?? false;
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
            ctx.globalAlpha = o.opacity ?? 1;

            if (o.blend && o.blend !== "normal") {
              ctx.globalCompositeOperation = o.blend as GlobalCompositeOperation;
            }

            const rawW = el instanceof HTMLVideoElement ? el.videoWidth : (el as HTMLImageElement).naturalWidth || 200;
            const rawH = el instanceof HTMLVideoElement ? el.videoHeight : (el as HTMLImageElement).naturalHeight || 200;

            // In preview, overlays are bounded by max-w-[200px] / max-h-[200px] in preview container space
            const maxDim = 200;
            const scaleFactor = Math.min(1, maxDim / Math.max(rawW, rawH));
            const previewBaseW = rawW * scaleFactor;
            const previewBaseH = rawH * scaleFactor;

            const oScale = o.scale ?? 1;
            const drawW = (previewBaseW / previewW) * exportWidth * oScale;
            const drawH = (previewBaseH / previewH) * exportHeight * oScale;

            ctx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
          }
        }
      }

      // Draw Active Captions (Subtitles with Keyframes & Multi-line Support)
      const activeCaps = captions.filter(c => elapsed >= c.start && elapsed <= c.end);
      for (const activeCap of activeCaps) {
        ctx.save();
        const capLocalTime = elapsed - activeCap.start;

        const font = activeCap.font ?? captionStyle.font ?? "Inter";
        const size = activeCap.size ?? captionStyle.size ?? 18;
        const color = activeCap.color ?? captionStyle.color ?? "#ffffff";
        const bg = activeCap.bg ?? captionStyle.bg ?? "rgba(0,0,0,0.6)";
        const strokeWidth = activeCap.strokeWidth ?? captionStyle.strokeWidth ?? 0;
        const strokeColor = activeCap.strokeColor ?? captionStyle.strokeColor ?? "#000000";
        const shadowColor = activeCap.shadowColor ?? captionStyle.shadowColor ?? "rgba(0,0,0,0.8)";
        const shadowBlur = activeCap.shadowBlur ?? captionStyle.shadowBlur ?? 4;
        const bgRadius = activeCap.bgRadius ?? captionStyle.bgRadius ?? 8;
        const textTransform = activeCap.textTransform ?? captionStyle.textTransform ?? "none";

        const scale = interpolateKeyframes(activeCap, "scale", capLocalTime, activeCap.scale ?? 1);
        const rotation = interpolateKeyframes(activeCap, "rotation", capLocalTime, activeCap.rotation ?? 0);
        const xPercent = interpolateKeyframes(activeCap, "xPercent", capLocalTime, activeCap.xPercent ?? 50);
        const yPercent = interpolateKeyframes(activeCap, "yPercent", capLocalTime, activeCap.yPercent ?? (captionStyle.position === "top" ? 8 : captionStyle.position === "center" ? 50 : 88));
        const opacity = interpolateKeyframes(activeCap, "opacity", capLocalTime, 1);
        const flipH = activeCap.flipH ?? false;
        const flipV = activeCap.flipV ?? false;

        const cx = (xPercent / 100) * exportWidth;
        const cy = (yPercent / 100) * exportHeight;

        ctx.translate(cx, cy);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale((flipH ? -1 : 1) * scale, (flipV ? -1 : 1) * scale);
        ctx.globalAlpha = opacity;

        const previewFontSize = Math.min(size, 28);
        const fontSize = previewFontSize * (exportHeight / previewH);
        ctx.font = `bold ${fontSize}px ${font}, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        const textLines = (activeCap.text || "").split("\n");
        const paddingX = 16 * (exportHeight / previewH);
        const paddingY = 8 * (exportHeight / previewH);
        const lineHeight = fontSize * 1.3;

        let maxLineWidth = 0;
        textLines.forEach(line => {
          const w = ctx.measureText(line).width;
          if (w > maxLineWidth) maxLineWidth = w;
        });

        const rectW = maxLineWidth + paddingX * 2;
        const rectH = textLines.length * lineHeight + paddingY * 2;

        const radiusVal = bgRadius * (exportHeight / previewH);

        // Background box
        if (bg && bg !== "rgba(0,0,0,0)") {
          ctx.fillStyle = bg;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(-rectW / 2, -rectH / 2, rectW, rectH, radiusVal);
          } else {
            ctx.rect(-rectW / 2, -rectH / 2, rectW, rectH);
          }
          ctx.fill();
        }

        // Text stroke & shadow for crisp visibility
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = shadowBlur * (exportHeight / previewH);
        ctx.fillStyle = color;

        if (strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth * (exportHeight / previewH);
        }

        const startY = -((textLines.length - 1) * lineHeight) / 2;
        textLines.forEach((line, idx) => {
          const formattedLine = textTransform === "uppercase" 
            ? line.toUpperCase() 
            : textTransform === "lowercase" 
            ? line.toLowerCase() 
            : line;

          if (strokeWidth > 0) {
            ctx.strokeText(formattedLine, 0, startY + idx * lineHeight);
          }
          ctx.fillText(formattedLine, 0, startY + idx * lineHeight);
        });

        ctx.restore();
      }
    };

    // 6. Execute Multi-Tiered Export Pipeline
    let finalBlob: Blob | null = null;

    // Diagnostic logging
    console.log("[EXPORT PIPELINE START]", {
      duration: totalDuration,
      fps: fpsVal,
      totalFrames,
      resolution: `${exportWidth}x${exportHeight}`,
      audioSources: hasAudioSources,
      hasRenderedAudio: renderedAudioBuffer !== null,
      platform: Capacitor.getPlatform(),
    });

    // Tier 1: Hardware-Accelerated WebCodecs + MP4 Muxer (Primary)
    let webcodecsSupported = false;
    try {
      webcodecsSupported = await isWebCodecsSupported(
        exportWidth,
        exportHeight,
        fpsVal,
        chosenQuality.bitrate
      );
    } catch (e) {
      console.warn("WebCodecs support check notice:", e);
    }

    if (webcodecsSupported) {
      try {
        console.log("[EXPORT ENGINE]: Initializing WebCodecs Hardware Muxer Engine...");
        toast.info(
          isRTL()
            ? "جاري التصدير باستخدام محرك التسريع للعتاد (WebCodecs MP4)..."
            : "Exporting with hardware-accelerated WebCodecs MP4 engine..."
        );

        finalBlob = await exportWithWebCodecs({
          canvas,
          exportWidth,
          exportHeight,
          fps: fpsVal,
          bitrate: chosenQuality.bitrate,
          totalDuration,
          renderedAudioBuffer,
          onProgress: (p) => setProgress(p),
          isAborted: () => abortControllerRef.current,
          renderFrameAtTime: drawFrameAtTime,
        });

        console.log("[EXPORT ENGINE]: WebCodecs export succeeded!");
      } catch (wcErr) {
        console.warn("[EXPORT ENGINE]: WebCodecs export failed, falling back to secondary engines:", wcErr);
        finalBlob = null;
      }
    }

    // Tier 2: FFmpeg WASM Batch Engine (Secondary)
    if (!finalBlob && ffmpegRef.current) {
      try {
        console.log("[EXPORT ENGINE]: Initializing FFmpeg WASM Batch Engine...");
        toast.info(
          isRTL()
            ? "جاري التصدير عبر محرك FFmpeg المعالج..."
            : "Exporting with FFmpeg WASM engine..."
        );

        for (let i = 0; i < totalFrames; i++) {
          if (abortControllerRef.current) {
            cleanup();
            setExporting(false);
            setProgress(0);
            setEstimatedTimeLeft(null);
            return;
          }

          const elapsed = i * frameDuration;
          const currentProgress = 0.25 + 0.55 * (i / totalFrames);
          setProgress(currentProgress);

          const now = Date.now();
          const elapsedMs = now - exportStartTime;
          if (i > 3 && elapsedMs > 500) {
            const msPerFrame = elapsedMs / (i + 1);
            const remainingFrames = totalFrames - (i + 1);
            const totalSecsLeft = (remainingFrames * msPerFrame) / 1000 / 0.85;
            setEstimatedTimeLeft(formatTimeRemaining(totalSecsLeft));
          }

          await drawFrameAtTime(elapsed);

          const frameName = `frame_${String(i + 1).padStart(4, "0")}.jpg`;
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            await ffmpegRef.current.writeFile(frameName, new Uint8Array(arrayBuffer));
            writtenFilesRef.current.add(frameName);
          }
        }

        setProgress(0.85);
        const crf = quality === 0 ? "18" : quality === 1 ? "18" : quality === 2 ? "21" : "23";
        const hasAudioFile = hasAudioSources;

        const ffmpegArgs = [
          "-framerate", String(fpsVal),
          "-f", "image2",
          "-i", "frame_%04d.jpg"
        ];

        if (hasAudioFile) {
          ffmpegArgs.push("-i", "audio.wav");
        }

        ffmpegArgs.push(
          "-c:v", "libx264",
          "-profile:v", "high",
          "-level", "4.0",
          "-pix_fmt", "yuv420p",
          "-crf", crf
        );

        if (hasAudioFile) {
          ffmpegArgs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
        }

        ffmpegArgs.push("output.mp4");

        ffmpegRef.current.on("progress", ({ progress: ffProg }: { progress: number }) => {
          setProgress(0.85 + 0.12 * ffProg);
        });

        await ffmpegRef.current.exec(ffmpegArgs);
        writtenFilesRef.current.add("output.mp4");

        if (!abortControllerRef.current) {
          const finalVideoData = await ffmpegRef.current.readFile("output.mp4");
          finalBlob = new Blob([finalVideoData], { type: "video/mp4" });
        }
      } catch (ffErr) {
        console.warn("[EXPORT ENGINE]: FFmpeg WASM export notice:", ffErr);
        finalBlob = null;
      }
    }

    // Tier 3: Frame-Paced Canvas MediaRecorder Engine (Compatible Tertiary)
    if (!finalBlob) {
      console.log("[EXPORT ENGINE]: Initializing Frame-Paced MediaRecorder Engine...");
      toast.info(
        isRTL()
          ? "جاري التصدير المباشر عبر محرك الوسائط المحلي..."
          : "Using direct frame-paced MediaRecorder engine..."
      );

      finalBlob = await recordCanvasWithMediaRecorder(
        canvas,
        totalDuration,
        fpsVal,
        renderedAudioBuffer,
        chosenQuality.bitrate,
        (p) => setProgress(p),
        () => abortControllerRef.current,
        drawFrameAtTime
      );
    }

    if (!finalBlob) {
      throw new Error(
        isRTL()
          ? "فشل إنشاء ملف الفيديو عبر جميع محركات التصدير المتاحة!"
          : "Failed to generate video file across all export engines!"
      );
    }

    // Post-Export Validation
    setProgress(0.97);
    toast.info(isRTL() ? "جاري التحقق من صحة وقابلية تشغيل ملف الفيديو..." : "Validating video container structure...");

    const validation = await validateExportedVideo(finalBlob, totalDuration);
    if (!validation.valid) {
      throw new Error(
        (isRTL() ? "خطأ في التحقق من صحة ملف الفيديو: " : "Video validation failed: ") +
          (validation.error || "Corrupted video output")
      );
    }

    console.log("[EXPORT SUCCESSFUL AND VALIDATED]", {
      sizeMB: validation.sizeMB?.toFixed(2),
      duration: validation.duration,
      resolution: `${validation.width}x${validation.height}`,
      containerType: validation.containerType,
    });

      // Sanity check: Ensure generated video is valid and not empty
      if (!finalBlob || finalBlob.size < 100) {
        const fileSize = finalBlob?.size || 0;
        throw new Error(
          isRTL()
            ? `ملف الفيديو المصدّر غير صالح أو بحجم صغير جداً (${fileSize} بايت)!`
            : `Exported video file size is invalid or suspiciously small (${fileSize} bytes)!`
        );
      }

      exportedBlobRef.current = finalBlob;
      const finalVideoUrl = URL.createObjectURL(finalBlob);

      setExportedVideoUrl(finalVideoUrl);
      setProgress(1.0);
      setEstimatedTimeLeft(null);

      // Trigger automatic file download with correct extension
      const fileExt = finalBlob.type.includes("webm") ? "webm" : "mp4";
      const a = document.createElement("a");
      a.href = finalVideoUrl;
      a.download = `${projectName.trim().replace(/\s+/g, "_") || "vireon_video"}.${fileExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success(t("toast.exportSuccess"));
      setExporting(false);

      // Call custom Java plugin to save the video natively
      if (Capacitor.isNativePlatform()) {
        (async () => {
          try {
            const saveRes = await saveVideoToGallery(
              finalBlob,
              `${projectName.trim().replace(/\s+/g, "_") || "vireon_video"}.${fileExt}`,
              () => abortControllerRef.current
            );
            if (saveRes?.path) {
              setSavedNativePath(saveRes.path);
            }
            if (saveRes?.warning) {
              toast.warning(saveRes.warning);
            }
            if (saveRes?.success) {
              toast.success(isRTL() ? "تم حفظ الفيديو بنجاح في المعرض المحلي!" : "Video saved successfully to native gallery!");
            }
          } catch (err: any) {
            console.error("Error writing native file:", err);
            toast.error((isRTL() ? "فشل حفظ الملف على النظام المحلي: " : "Failed to save local native file: ") + (err?.message || String(err)));
          } finally {
            // Trigger automatic share prompt after save confirmation
            setTimeout(() => {
              shareTo().catch(() => {});
            }, 300);
          }
        })();
      } else {
        console.log("Non-native platform, video ready for sharing");
        // Automatically prompt share sheet on web as well
        setTimeout(() => {
          shareTo().catch(() => {});
        }, 500);
      }
    } catch (err: any) {
      console.error("FFmpeg execution or file reading failed:", err);
      if (!abortControllerRef.current) {
        toast.error(
          err?.message ||
          (isRTL() ? "فشل تشفير وتصدير الفيديو النهائي!" : "Failed to encode and export final video!")
        );
      }
      setExporting(false);
      setProgress(0);
      setEstimatedTimeLeft(null);
    } finally {
      cleanup();
      // Clean up virtual filesystem files to avoid memory leaks
      if (ffmpegRef.current && writtenFilesRef.current.size > 0) {
        try {
          const deletePromises = Array.from(writtenFilesRef.current).map(fileName => 
            ffmpegRef.current.deleteFile(fileName).catch(() => {})
          );
          await Promise.all(deletePromises);
          writtenFilesRef.current.clear();
        } catch (fErr) {
          console.warn("Virtual file cleanup warning:", fErr);
        }
      }
    }
  };

  const handleDownload = () => {
    if (exportedVideoUrl) {
      try {
        const a = document.createElement("a");
        a.href = exportedVideoUrl;
        a.download = `${projectName.trim().replace(/\s+/g, "_") || "vireon_video"}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(
          isRTL()
            ? "بدء التنزيل التلقائي... في حال عدم الاكتمال، استخدم مشغل الفيديو أدناه."
            : "Starting auto download... If it fails, please use the video player below."
        );
      } catch (err) {
        console.warn("Manual anchor download failed:", err);
        toast.error(
          isRTL()
            ? "فشل التنزيل التلقائي. يرجى الضغط مطولاً على الفيديو بالأسفل لحفظه."
            : "Auto download failed. Please long-press the video below to save it."
        );
      }
    }
  };

  const shareTo = async (platform?: (typeof SOCIALS)[number]) => {
    try {
      if (!exportedBlobRef.current && !exportedVideoUrl) {
        toast.info(isRTL() ? "يرجى تصدير الفيديو أولاً لتتمكن من مشاركته!" : "Please export the video first before sharing!");
        return;
      }

      const titleText = projectName || "Vireon Video";
      const shareText = isRTL() ? "فيديو عالي الدقة مُنشأ عبر Vireon Studio" : "Check out my video created with Vireon Studio";

      // 1. Native Mobile Platform sharing using native saved file URI
      if (Capacitor.isNativePlatform()) {
        let targetUri = savedNativePath;
        if (!targetUri && exportedBlobRef.current) {
          const fileExt = exportedBlobRef.current.type.includes("webm") ? "webm" : "mp4";
          const fileName = `vireon_${Date.now()}.${fileExt}`;
          const saveRes = await saveVideoToGallery(
            exportedBlobRef.current,
            fileName,
            () => abortControllerRef.current
          );
          if (saveRes?.path) {
            targetUri = saveRes.path;
            setSavedNativePath(targetUri);
          }
        }

        if (targetUri) {
          await Share.share({
            title: titleText,
            text: shareText,
            files: [targetUri],
            dialogTitle: isRTL() ? "مشاركة الفيديو" : "Share Video",
          });
          toast.success(isRTL() ? "تم فتح نافذة المشاركة النظامية!" : "Opened system share sheet!");
          return;
        }
      }

      // 2. Web Browser sharing using File object (supported in Chrome/Safari/Firefox mobile)
      if (exportedBlobRef.current && typeof navigator !== "undefined" && navigator.canShare) {
        const fileExt = exportedBlobRef.current.type.includes("webm") ? "webm" : "mp4";
        const fileName = `${projectName.trim().replace(/\s+/g, "_") || "vireon_video"}.${fileExt}`;
        const file = new File([exportedBlobRef.current], fileName, { type: exportedBlobRef.current.type || "video/mp4" });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: titleText,
            text: shareText,
          });
          toast.success(isRTL() ? "تم فتح نافذة المشاركة بنجاح!" : "Shared successfully!");
          return;
        }
      }

      // 3. Fallback Capacitor Share API / URL share or social platform redirect
      if (platform?.url && !Capacitor.isNativePlatform()) {
        try {
          window.open(platform.url, "_blank");
          return;
        } catch {}
      }

      await Share.share({
        title: titleText,
        text: shareText,
        url: exportedVideoUrl || window.location.href,
        dialogTitle: isRTL() ? "مشاركة الفيديو" : "Share Video",
      });
    } catch (err: any) {
      if (
        err?.name === "AbortError" ||
        err?.message?.includes("canceled") ||
        err?.message?.includes("Canceled") ||
        err?.message?.includes("dismissed") ||
        err?.message?.includes("Dismissed") ||
        err?.message?.includes("User cancelled")
      ) {
        return; // Quietly ignore user cancellation of share sheet
      }
      console.warn("[ExportDialog] Share sheet error:", err);
      toast.error((isRTL() ? "تعذر فتح المشاركة: " : "Share sheet error: ") + (err?.message || String(err)));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col animate-fade-in" dir={isRTL() ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/80 bg-card flex-shrink-0">
        <span className="text-sm font-bold text-foreground flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" /> {t("export.title")}
        </span>
        <button 
          onClick={handleCloseDialog} 
          disabled={exporting} 
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40 hover:bg-secondary/80 active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-start p-4 sm:p-6 gap-5 w-full max-w-xl mx-auto">
          
          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-card border border-border/80 rounded-2xl w-full shadow-sm">
            <button
              type="button"
              onClick={() => setActiveMode("export")}
              className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeMode === "export"
                  ? "gradient-primary text-primary-foreground shadow-md"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isRTL() ? "تصدير فيديو MP4" : "Export Video MP4"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("publish")}
              className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeMode === "publish"
                  ? "gradient-primary text-primary-foreground shadow-md"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isRTL() ? "نشر كقالب للمجتمع" : "Publish as Template"}</span>
            </button>
          </div>

          {activeMode === "publish" ? (
            !navigator.onLine ? (
              <div className="bg-card border border-amber-500/30 p-6 rounded-2xl text-center space-y-3 shadow-lg my-4 w-full max-w-md">
                <WifiOff className="w-10 h-10 text-amber-500 mx-auto animate-pulse" />
                <h3 className="text-sm font-bold text-foreground">
                  {isRTL() ? "ميزة نشر القالب تتطلب اتصالاً بالإنترنت" : "Publishing template requires internet connection"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isRTL()
                    ? "أنت في الوضع أوفلاين حالياً. يمكنك تصدير وتنزيل الفيديو مباشرة إلى جهازك بدون إنترنت، أو الاتصال بالشبكة لنشر تصميمك كقالب للمجتمع."
                    : "You are currently offline. You can export the video locally or connect to the internet to publish as a template."}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveMode("export")}
                  className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-xs shadow-md mt-2"
                >
                  {isRTL() ? "الانتقال إلى تصدير فيديو (أوفلاين)" : "Switch to Offline Video Export"}
                </button>
              </div>
            ) : (
              <div className="w-full">
                <PublishTemplateDialog
                  open={true}
                  onClose={handleCloseDialog}
                  previewRef={previewRef}
                  videoRef={videoRef}
                  activeRatio={activeRatio}
                  embedded={true}
                />
              </div>
            )
          ) : (
            <>
              {/* Cover Preview Aspect Box */}
              <div 
                className="relative w-full max-w-[270px] max-h-[42vh] rounded-2xl overflow-hidden bg-black/95 border border-border flex items-center justify-center shadow-2xl transition-all"
                style={{ aspectRatio: `${effectiveRatioObj.w} / ${effectiveRatioObj.h}` }}
              >
                {displayCover ? (
                  <img src={displayCover} alt="cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
                    <Film className="w-8 h-8 opacity-40 animate-pulse" />
                    <span className="text-xs">{t("export.noCover")}</span>
                  </div>
                )}
                {(exporting || (exportedVideoUrl && progress >= 1)) && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="exportProgressGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="50%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                      <filter id="exportGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Dark track border background */}
                    <rect
                      x="1.5" y="1.5" width="97" height="97" rx="12"
                      fill="none"
                      stroke="rgba(59, 130, 246, 0.25)"
                      strokeWidth="3"
                    />

                    {/* Active progress perimeter stroke travelling around the box */}
                    <rect
                      x="1.5" y="1.5" width="97" height="97" rx="12"
                      fill="none"
                      stroke="url(#exportProgressGlow)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      pathLength={1000}
                      strokeDasharray={1000}
                      strokeDashoffset={dashOffset}
                      filter="url(#exportGlowFilter)"
                      style={{
                        transition: "stroke-dashoffset 200ms ease-out",
                        filter: "drop-shadow(0 0 8px rgba(59,130,246,0.9))",
                      }}
                    />
                  </svg>
                )}

                {/* Centered Real Export Progress Overlay */}
                {exporting && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 space-y-3 animate-in fade-in duration-200">
                    <div className="relative flex items-center justify-center">
                      <div className="text-4xl sm:text-5xl font-black font-mono text-white tracking-tight drop-shadow-[0_0_20px_rgba(59,130,246,0.9)]">
                        {Math.round(progress * 100)} <span className="text-2xl text-primary font-bold">%</span>
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-white/90 animate-pulse px-2 max-w-[220px]">
                      {getRenderStepMessage(progress)}
                    </p>

                    {estimatedTimeLeft && (
                      <p className="text-[11px] font-medium text-primary-foreground/90 bg-primary/20 px-3 py-1 rounded-full border border-primary/40 shadow-sm">
                        ⏱ {estimatedTimeLeft}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleCancelExport}
                      className="mt-2 px-4 py-1.5 rounded-xl bg-destructive/90 text-destructive-foreground hover:bg-destructive text-xs font-bold transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isRTL() ? "إلغاء التصدير" : "Cancel Export"}</span>
                    </button>
                  </div>
                )}
              </div>

          {!exportedVideoUrl && !exporting && (
            <div className="w-full max-w-sm space-y-5 animate-in fade-in duration-200">
              <div className="bg-card border border-border/80 p-4 rounded-2xl space-y-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-primary" /> {t("export.quality")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUALITY_OPTIONS.slice(1, 5).map((q, i) => {
                      const actualIdx = i + 1; // map back to indices 1, 2, 3, 4
                      return (
                        <button key={q.value} onClick={() => setQuality(actualIdx)}
                          className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${quality === actualIdx ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-secondary/30 text-foreground"}`}>
                          {t(q.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                    <Film className="w-3.5 h-3.5 text-primary" /> {t("export.fps")}
                  </p>
                  <div className="flex gap-2">
                    {FPS_OPTIONS.map((f, i) => (
                      <button key={f} onClick={() => setFps(i)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${fps === i ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-secondary/30 text-foreground"}`}>
                        {t("export.fpsOpt", { f })}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={startExport}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/25"
              >
                <Download className="w-5 h-5 animate-bounce" /> {t("export.saveToGallery")}
              </button>
            </div>
          )}

          {exportedVideoUrl && !exporting && (
            <div className="w-full max-w-sm space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-center gap-2.5 text-primary">
                <Check className="w-6 h-6 bg-primary text-primary-foreground rounded-full p-1 shadow-lg" />
                <div className="text-start">
                  <p className="text-sm font-bold">{t("export.success")}</p>
                  <p className="text-[10px] opacity-90">{t("export.successDesc")}</p>
                </div>
              </div>

              {/* Primary Share Action */}
              <button onClick={() => shareTo()}
                className="w-full py-4 rounded-2xl bg-primary hover:opacity-90 text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/25 active:scale-98">
                <Share2 className="w-5 h-5" /> {isRTL() ? "مشاركة الفيديو الآن" : "Share Video Now"}
              </button>

              {/* Secondary Manual Download Action */}
              <button onClick={handleDownload}
                className="w-full py-3.5 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all border border-border/60">
                <Download className="w-4 h-4" /> {t("export.downloadManual")}
              </button>

              <div className="space-y-3">
                <p className="text-[11px] font-bold text-muted-foreground text-center flex items-center justify-center gap-1.5">
                  <Share2 className="w-4 h-4 text-primary" /> {t("export.socialShare")}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {SOCIALS.map((s) => (
                    <button key={s.id} onClick={() => shareTo(s)}
                      className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-card border border-border/80 hover:border-primary/50 hover:bg-secondary/40 active:scale-95 transition-all shadow-sm group">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md transition-transform group-hover:scale-105" style={{ background: s.color, color: s.textColor || "#FFFFFF" }}>
                        {s.icon}
                      </div>
                      <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">{t(s.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Adaptive Quality Safeguard Modal */}
      {showSafeguardModal && safeguardDetails && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 text-start animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isRTL() ? "تنبيه حجم وجودة التصدير العالية" : "High Quality Export Warning"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isRTL() ? "الإعدادات المختارة تتطلب قدرة معالجة عالية" : "Selected settings require significant processing memory"}
                </p>
              </div>
            </div>

            <div className="bg-secondary/40 border border-border/80 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">{isRTL() ? "الجودة والمعدل:" : "Resolution & FPS:"}</span>
                <span className="font-bold text-foreground">{safeguardDetails.resName} @ {safeguardDetails.fpsVal}fps</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">{isRTL() ? "إجمالي الإطارات:" : "Total Frames:"}</span>
                <span className="font-bold text-foreground">~{safeguardDetails.estFrames.toLocaleString()} frames</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">{isRTL() ? "الحجم التقريبي:" : "Est. File Size:"}</span>
                <span className="font-bold text-foreground">~{safeguardDetails.estMB} MB</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {isRTL()
                ? "تصدير هذا الفيديو بالإعدادات الحالية قد يستغرق عدة دقائق أو يتسبب ببطء التصدير على بعض الأجهزة. نوصي باستخدام دقة 1080p بمعدل 30 إطار/ثانية لتصدير سريع ومضمون."
                : "Rendering this video at high resolution/FPS may take longer and requires high system memory. 1080p @ 30fps is recommended for optimal speed and reliability."}
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowSafeguardModal(false);
                  setQuality(2); // 1080p
                  setFps(1); // 30fps
                  setTimeout(() => startExport(true), 50);
                }}
                className="w-full py-3.5 px-4 rounded-xl gradient-primary text-primary-foreground font-bold text-xs shadow-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{isRTL() ? "التحويل إلى 1080p 30fps (موصى به)" : "Switch to 1080p 30fps (Recommended)"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSafeguardModal(false);
                  startExport(true);
                }}
                className="w-full py-3 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <span>{isRTL() ? "المتابعة بنفس الإعدادات" : "Continue with Selected Quality"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSafeguardModal(false)}
                className="w-full py-2 text-center text-xs text-muted-foreground hover:text-foreground font-semibold"
              >
                {isRTL() ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportDialog;
