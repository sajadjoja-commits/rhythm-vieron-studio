import { useMemo, useState, useEffect, useRef } from "react";
import { X, Download, Share2, Check, Sparkles, Film, Music, Languages, Sliders, Volume2, Loader2, Wifi, WifiOff, Globe } from "lucide-react";
import { useMedia, interpolateKeyframes } from "@/context/MediaContext";
import { toast } from "sonner";
import { t, isRTL, getLang } from "@/lib/i18n";
import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import PublishTemplateDialog from "@/components/editor/PublishTemplateDialog";

const VireonMedia = registerPlugin<any>('VireonMedia');

// 2. دالة التصدير النهائية لحفظ الفيديو
async function handleExportFinished(temporaryVideoPath: string) {
  try {
    console.log("تم التصدير المؤقت بالويب بالمسار:", temporaryVideoPath);
    
    if (!Capacitor.isNativePlatform()) {
      console.log("Not running on a native platform, skipping native gallery save.");
      return;
    }

    // استدعاء دالة الجافا ونقل مسار الفيديو لها
    const result = await VireonMedia.saveVideoToGallery({ 
        path: temporaryVideoPath 
    });
    
    if (result && result.success) {
        alert(isRTL() ? "تم حفظ الفيديو بنجاح في الاستوديو!" : "Video saved successfully to gallery!");
    }
  } catch (error: any) {
    console.error("فشل نقل الفيديو للاستوديو:", error);
    alert((isRTL() ? "فشل الحفظ: " : "Save failed: ") + error.message);
  }
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

const SOCIALS = [
  { id: "tiktok", labelKey: "export.social.tiktok", color: "linear-gradient(135deg, #010101, #25F4EE, #FE2C55)", url: "https://www.tiktok.com/" },
  { id: "whatsapp", labelKey: "export.social.whatsapp", color: "linear-gradient(135deg, #25D366, #128C7E)", url: "https://api.whatsapp.com/send" },
  { id: "instagram", labelKey: "export.social.instagram", color: "linear-gradient(135deg, #833AB4, #FD1D1D, #FCAF45)", url: "https://www.instagram.com/" },
  { id: "snapchat", labelKey: "export.social.snapchat", color: "linear-gradient(135deg, #FFFC00, #F39C12)", url: "https://www.snapchat.com/" },
  { id: "youtube", labelKey: "export.social.youtube", color: "linear-gradient(135deg, #FF0000, #C0392B)", url: "https://www.youtube.com/" },
  { id: "facebook", labelKey: "export.social.facebook", color: "linear-gradient(135deg, #1877F2, #3B5998)", url: "https://www.facebook.com/" },
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
    resolveTimelineTime,
  } = useMedia();
  const [quality, setQuality] = useState(2); // default to 1080p
  const [fps, setFps] = useState(1); // default to 30fps
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<string | null>(null);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"export" | "publish">("export");
  const abortControllerRef = useRef<boolean>(false);
  const ffmpegRef = useRef<any>(null);
  const writtenFilesRef = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);

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
  }, [open]);

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

  const startExport = async () => {
    if (clips.length === 0) {
      toast.error(isRTL() ? "لا يوجد مقاطع فيديو أو صور للتصدير!" : "No clips available to export!");
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

    // 1. First-time loading of FFmpeg core
    if (!ffmpegRef.current) {
      toast.info(isRTL() ? "جاري تحميل محرك معالجة الفيديو (المرة الأولى فقط)..." : "Loading video processing engine (first-time only)...");
      setProgress(0.02);
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        const ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({ message }) => {
          console.log("FFmpeg Log:", message);
        });
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        ffmpegRef.current = ffmpeg;
      } catch (err) {
        console.error("Failed to load FFmpeg.wasm:", err);
        toast.error(isRTL() ? "فشل تحميل محرك معالجة الفيديو!" : "Failed to load video processing engine!");
        setExporting(false);
        setProgress(0);
        return;
      }
    }

    // Ensure custom web fonts are loaded
    try {
      if ("fonts" in document) {
        await document.fonts.ready;
      }
    } catch {}

    // 2. Calculate resolution based on selected options
    const ratioObj = aspectRatios[activeRatio] || { w: 16, h: 9 };
    const chosenQuality = QUALITY_OPTIONS[quality] || QUALITY_OPTIONS[2];
    const canvasH = chosenQuality.value;
    const canvasW = Math.round(canvasH * (ratioObj.w / ratioObj.h));
    
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
            gainNode.connect(offlineCtx.destination);

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
                gainNode.connect(offlineCtx.destination);

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
        const renderedBuffer = await offlineCtx.startRendering();
        const wavBytes = bufferToWav(renderedBuffer);
        await ffmpegRef.current.writeFile("audio.wav", new Uint8Array(wavBytes));
        writtenFilesRef.current.add("audio.wav");
      } catch (err) {
        console.error("Offline audio rendering failed:", err);
      }
    }

    setProgress(0.25);

    // 6. Draw frames sequentially
    const fpsVal = FPS_OPTIONS[fps] || 30;
    const frameDuration = 1 / fpsVal;
    const totalFrames = Math.ceil(totalDuration * fpsVal);

    const seekVideo = (video: HTMLVideoElement, time: number) => {
      return new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          resolve();
        };
        const onSeeked = () => { done(); };
        const onError = () => { done(); };
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        video.currentTime = time;
        setTimeout(done, 75);
      });
    };

    // Cleanup resources helper
    const cleanup = () => {
      Object.keys(preloadedMap).forEach((key) => {
        const el = preloadedMap[key];
        if (el instanceof HTMLVideoElement) {
          try { el.pause(); el.src = ""; el.load(); el.remove(); } catch {}
        } else if (el instanceof HTMLImageElement) {
          try { el.src = ""; el.remove(); } catch {}
        }
      });
      try {
        if (hiddenContainer && hiddenContainer.parentNode) {
          hiddenContainer.parentNode.removeChild(hiddenContainer);
        }
      } catch (err) {
        console.warn("Hidden container cleanup failed:", err);
      }
      // Release canvas GPU context memory
      canvas.width = 0;
      canvas.height = 0;
    };
    cleanupRef.current = cleanup;

    for (let i = 0; i < totalFrames; i++) {
      if (abortControllerRef.current) {
        cleanup();
        setExporting(false);
        setProgress(0);
        setEstimatedTimeLeft(null);
        return;
      }

      const elapsed = i * frameDuration;
      
      // Update compilation state (scaled between 0.25 and 0.85 for rendering frames)
      const currentProgress = 0.25 + 0.60 * (i / totalFrames);
      setProgress(currentProgress);

      // Estimate time remaining based on frame rendering speed
      const now = Date.now();
      const elapsedMs = now - exportStartTime;
      if (i > 3 && elapsedMs > 500) {
        const msPerFrame = elapsedMs / (i + 1);
        const remainingFrames = totalFrames - (i + 1);
        const frameSecsLeft = (remainingFrames * msPerFrame) / 1000;
        // Factor in FFmpeg encoding step (~15% of pipeline)
        const totalSecsLeft = frameSecsLeft / 0.85;
        setEstimatedTimeLeft(formatTimeRemaining(totalSecsLeft));
      }

      // Resolve current clip and timing details
      const resClip = resolveTimelineTime(elapsed);
      const activeMedia = resClip ? media.find(m => m.id === resClip.clip.mediaId) : null;

      // Seek active video if needed
      if (resClip && activeMedia && activeMedia.type === "video") {
        const preloadedVid = preloadedMap[resClip.clip.mediaId] as HTMLVideoElement;
        if (preloadedVid) {
          preloadedVid.muted = true;
          preloadedVid.playbackRate = resClip.clip.speed && resClip.clip.speed > 0 ? resClip.clip.speed : 1;
          await seekVideo(preloadedVid, resClip.mediaTime);
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
          const step = 16;
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
            await seekVideo(el, Math.max(0, elapsed - o.start));
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

        // Background box
        ctx.fillStyle = bg;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(-rectW / 2, -rectH / 2, rectW, rectH, 8 * (exportHeight / previewH));
        } else {
          ctx.rect(-rectW / 2, -rectH / 2, rectW, rectH);
        }
        ctx.fill();

        // Text stroke/shadow for crisp visibility
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4 * (exportHeight / previewH);
        ctx.fillStyle = color;

        const startY = -((textLines.length - 1) * lineHeight) / 2;
        textLines.forEach((line, idx) => {
          ctx.fillText(line, 0, startY + idx * lineHeight);
        });

        ctx.restore();
      }

      // Save frame as PNG to virtual filesystem
      const frameName = `frame_${String(i + 1).padStart(4, "0")}.png`;
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        await ffmpegRef.current.writeFile(frameName, new Uint8Array(arrayBuffer));
        writtenFilesRef.current.add(frameName);
      }
    }

    // 7. Execute FFmpeg
    setProgress(0.85);
    const crf = quality === 0 ? "18" : quality === 1 ? "18" : quality === 2 ? "21" : quality === 3 ? "21" : "23";
    const hasAudioFile = hasAudioSources;

    const ffmpegArgs = [
      "-framerate", String(fpsVal),
      "-f", "image2",
      "-i", "frame_%04d.png"
    ];

    if (hasAudioFile) {
      ffmpegArgs.push("-i", "audio.wav");
    }

    ffmpegArgs.push(
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-crf", crf
    );

    if (hasAudioFile) {
      ffmpegArgs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
    }

    ffmpegArgs.push("output.mp4");

    try {
      // Listen to progress to scale 0.85 to 0.99 and calculate ETA
      ffmpegRef.current.on("progress", ({ progress: ffProg }: { progress: number }) => {
        const currentProg = 0.85 + 0.14 * ffProg;
        setProgress(currentProg);
        const now = Date.now();
        const totalElapsedSec = (now - exportStartTime) / 1000;
        if (currentProg > 0.1) {
          const totalEstSec = totalElapsedSec / currentProg;
          const remSec = Math.max(0, totalEstSec - totalElapsedSec);
          setEstimatedTimeLeft(formatTimeRemaining(remSec));
        }
      });

      await ffmpegRef.current.exec(ffmpegArgs);
      writtenFilesRef.current.add("output.mp4");

      if (abortControllerRef.current) {
        cleanup();
        setExporting(false);
        setProgress(0);
        setEstimatedTimeLeft(null);
        return;
      }

      // 8. Read result
      setProgress(0.99);
      const finalVideoData = await ffmpegRef.current.readFile("output.mp4");
      const finalBlob = new Blob([finalVideoData], { type: "video/mp4" });

      // Sanity check: Ensure generated video is valid and not 0 bytes or suspiciously small (< 10KB)
      if (!finalBlob || finalBlob.size < 10240) {
        const fileSize = finalBlob?.size || 0;
        throw new Error(
          isRTL()
            ? `ملف الفيديو المصدّر غير صالح أو بحجم صغير جداً (${fileSize} بايت)!`
            : `Exported video file size is invalid or suspiciously small (${fileSize} bytes)!`
        );
      }

      const finalVideoUrl = URL.createObjectURL(finalBlob);

      setExportedVideoUrl(finalVideoUrl);
      setProgress(1.0);
      setEstimatedTimeLeft(null);

      // Trigger automatic file download
      const a = document.createElement("a");
      a.href = finalVideoUrl;
      a.download = `${projectName.trim().replace(/\s+/g, "_") || "vireon_video"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success(t("toast.exportSuccess"));
      setExporting(false);

      // Call custom Java plugin to save the video natively
      if (Capacitor.isNativePlatform()) {
        (async () => {
          try {
            const arrayBuffer = await finalBlob.arrayBuffer();
            const base64Data = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const savedFile = await Filesystem.writeFile({
              path: `export_${Date.now()}.mp4`,
              data: base64Data,
              directory: Directory.Cache
            });
            await handleExportFinished(savedFile.uri);
          } catch (err) {
            console.error("Error writing native file:", err);
            toast.error(isRTL() ? "فشل حفظ الملف على النظام المحلي!" : "Failed to save local native file!");
          }
        })();
      } else {
        console.log("Non-native platform, skipping native file write and handleExportFinished");
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

  const shareTo = async (platform: (typeof SOCIALS)[number]) => {
    if (exportedVideoUrl) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: projectName || "Vireon Video",
            text: `Watch my video: ${projectName || ""}`,
            url: window.location.href,
          });
          toast.success(t("toast.shareOpened"));
          return;
        } catch (e) {
          console.warn("Native share fallback:", e);
        }
      }
      toast.info(t("toast.sharingRedirect", { platform: t(platform.labelKey) }));
      window.open(platform.url, "_blank");
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
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeMode === "export"
                  ? "gradient-primary text-primary-foreground shadow-md"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                <span>{isRTL() ? "تصدير فيديو MP4" : "Export Video MP4"}</span>
              </div>
              <span className="text-[9px] opacity-90 flex items-center gap-1 font-medium">
                <WifiOff className="w-2.5 h-2.5" />
                {isRTL() ? "يعمل أوفلاين وأونلاين" : "Works Offline & Online"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("publish")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeMode === "publish"
                  ? "gradient-primary text-primary-foreground shadow-md"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{isRTL() ? "نشر كقالب للمجتمع" : "Publish as Template"}</span>
              </div>
              <span className="text-[9px] opacity-90 flex items-center gap-1 font-medium">
                <Globe className="w-2.5 h-2.5" />
                {isRTL() ? "يتطلب أونلاين" : "Requires Online"}
              </span>
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
              <div className="relative w-full max-w-[270px] aspect-[9/16] max-h-[42vh] rounded-2xl overflow-hidden bg-black/95 border border-border flex items-center justify-center shadow-2xl">
                {coverImage ? (
                  <img src={coverImage} alt="cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
                    <Film className="w-8 h-8 opacity-40 animate-pulse" />
                    <span className="text-xs">{t("export.noCover")}</span>
                  </div>
                )}
                {(exporting || (exportedVideoUrl && progress >= 1)) && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <rect
                      x="1" y="1" width="98" height="98" rx="4"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2.5"
                      pathLength={1000}
                      strokeDasharray={1000}
                      strokeDashoffset={dashOffset}
                      style={{ transition: "stroke-dashoffset 150ms linear", filter: "drop-shadow(0 0 8px hsl(var(--primary)))" }}
                    />
                  </svg>
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

          {exporting && (
            <div className="w-full max-w-sm text-center space-y-4 animate-in fade-in duration-200">
              <div className="bg-card border border-border/80 p-5 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span>{isRTL() ? "جاري التصدير والمعالجة..." : "Exporting video..."}</span>
                  <span className="text-primary font-mono text-sm">{Math.round(progress * 100)}%</span>
                </div>

                <div className="w-full bg-secondary h-3 rounded-full overflow-hidden shadow-inner relative">
                  <div 
                    className="bg-primary h-full rounded-full transition-all duration-150 shadow-[0_0_12px_rgba(var(--primary-rgb),0.8)]" 
                    style={{ width: `${Math.max(2, progress * 100)}%` }} 
                  />
                </div>

                <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                  <p className="animate-pulse font-medium">{getRenderStepMessage(progress)}</p>
                  {estimatedTimeLeft && (
                    <p className="text-primary font-semibold flex items-center justify-center gap-1 mt-1">
                      ⏱ {estimatedTimeLeft}
                    </p>
                  )}
                </div>

                <button 
                  onClick={handleCancelExport}
                  className="w-full py-2.5 mt-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <X className="w-4 h-4" /> {isRTL() ? "إلغاء التصدير" : "Cancel Export"}
                </button>
              </div>
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

              {/* Compatible Video Player for Android WebView Downloads */}
              <div className="space-y-2.5">
                <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-[30vh] border border-border shadow-2xl flex items-center justify-center">
                  <video 
                    src={exportedVideoUrl} 
                    controls 
                    playsInline 
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 text-center leading-relaxed px-2">
                  {isRTL() 
                    ? "⬥ لمستخدمي أندرويد و WebView: إذا لم يبدأ التنزيل تلقائياً، يمكنك تشغيل الفيديو أعلاه، والضغط على النقاط الثلاث للتحميل، أو الضغط مطولاً على الفيديو لاختيار 'حفظ الفيديو'." 
                    : "⬥ For Android & WebView Users: If download didn't trigger, play the video above, tap the three dots menu to download, or long-press the video and select 'Save Video'."}
                </p>
              </div>

              <button onClick={handleDownload}
                className="w-full py-4 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-sm flex items-center justify-center gap-2 transition-all">
                <Download className="w-5 h-5" /> {t("export.downloadManual")}
              </button>

              <div className="space-y-3">
                <p className="text-[11px] font-bold text-muted-foreground text-center flex items-center justify-center gap-1.5">
                  <Share2 className="w-4 h-4 text-primary" /> {t("export.socialShare")}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {SOCIALS.map((s) => (
                    <button key={s.id} onClick={() => shareTo(s)}
                      className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-card border border-border/80 hover:border-primary/40 active:scale-95 transition-all shadow-sm">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shadow-md shadow-black/15" style={{ background: s.color }}>
                        {t(s.labelKey)?.charAt(0) || ""}
                      </span>
                      <span className="text-[11px] font-bold text-foreground">{t(s.labelKey)}</span>
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
    </div>
  );
};

export default ExportDialog;
