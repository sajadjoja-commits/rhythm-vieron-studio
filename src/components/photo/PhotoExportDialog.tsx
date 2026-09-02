import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Download,
  Share2,
  Check,
  Sparkles,
  Sliders,
  Loader2,
  Image as ImageIcon,
  Copy,
  Layers,
  Send,
  MessageCircle,
  Instagram
} from "lucide-react";
import { toast } from "sonner";
import { t, isRTL, getLang } from "@/lib/i18n";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { saveImageToGallery } from "@/services/NativeService";

export interface PhotoExportLayer {
  id: string;
  type: "text" | "sticker" | "shape" | "image";
  text?: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
  shapeType?: "rect" | "circle" | "triangle" | "star";
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  url?: string;
  emoji?: string;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  width?: number;
  height?: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface PhotoExportProps {
  isOpen: boolean;
  onClose: () => void;
  baseImage: HTMLImageElement | null;
  imgUrl: string | null;
  naturalSize: { width: number; height: number };
  filter: string;
  filterCssString: string;
  brightness: number;
  contrast: number;
  saturate: number;
  blurVal: number;
  hueVal: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
  panX: number;
  panY: number;
  cropRatio: string;
  vfxType: string;
  vfxIntensity: number;
  layers: PhotoExportLayer[];
  previewContainerWidth: number;
  previewContainerHeight: number;
}

const QUALITY_PRESETS = [
  { id: "original", labelAr: "الدقة الأصلية (UHD)", labelEn: "Original UHD", scale: 1.0 },
  { id: "4k", labelAr: "فائق الدقة 4K", labelEn: "4K Ultra HD", targetMax: 3840 },
  { id: "2k", labelAr: "عالي الدقة 2K", labelEn: "2K Quad HD", targetMax: 2560 },
  { id: "1080p", labelAr: "دقة كاملة 1080p", labelEn: "1080p Full HD", targetMax: 1920 },
  { id: "instagram", labelAr: "انستجرام (1:1)", labelEn: "Instagram (1:1)", exactW: 1080, exactH: 1080 },
  { id: "story", labelAr: "ستوري / تيك توك (9:16)", labelEn: "Story / Reels (9:16)", exactW: 1080, exactH: 1920 }
];

const FORMAT_OPTIONS = [
  { id: "image/png", label: "PNG", ext: "png", quality: 1.0, descAr: "جودة رسومية فائقة بدون ضغط", descEn: "Lossless crisp quality" },
  { id: "image/jpeg", label: "JPG (High)", ext: "jpg", quality: 0.95, descAr: "ضغط عالي الجودة وحجم أصغر", descEn: "High quality (95%)" },
  { id: "image/webp", label: "WEBP", ext: "webp", quality: 0.98, descAr: "تنسيق حديث فائق الكفاءة", descEn: "Modern web-optimized" }
];

export default function PhotoExportDialog({
  isOpen,
  onClose,
  baseImage,
  imgUrl,
  naturalSize,
  filter,
  brightness,
  contrast,
  saturate,
  blurVal,
  hueVal,
  rotation,
  flipH,
  flipV,
  zoom,
  panX,
  panY,
  cropRatio,
  vfxType,
  vfxIntensity,
  layers,
  previewContainerWidth,
  previewContainerHeight
}: PhotoExportProps) {
  const [selectedQuality, setSelectedQuality] = useState<number>(0);
  const [selectedFormat, setSelectedFormat] = useState<number>(0);
  const [exporting, setExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportInfo, setExportInfo] = useState<{ width: number; height: number; sizeFormatted: string } | null>(null);
  const [savedToGallery, setSavedToGallery] = useState<boolean>(false);

  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxDimensions, setBoxDimensions] = useState<{ w: number; h: number }>({ w: 320, h: 220 });

  const en = getLang() === "en";

  useEffect(() => {
    if (!isOpen) {
      setExporting(false);
      setProgress(0);
      setExportedUrl(null);
      setExportedBlob(null);
      setExportInfo(null);
      setSavedToGallery(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (previewBoxRef.current) {
      setBoxDimensions({
        w: previewBoxRef.current.clientWidth || 320,
        h: previewBoxRef.current.clientHeight || 220
      });
    }
  }, [isOpen, exportedUrl]);

  if (!isOpen) return null;

  // Helper to load PIP images
  const loadImageAsync = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
    });
  };

  const getComputedDimensions = () => {
    const origW = naturalSize.width || 1080;
    const origH = naturalSize.height || 1080;
    const preset = QUALITY_PRESETS[selectedQuality];

    if (preset.exactW && preset.exactH) {
      return { width: preset.exactW, height: preset.exactH };
    }

    let targetW = origW;
    let targetH = origH;

    if (cropRatio !== "free" && cropRatio.includes(":")) {
      const parts = cropRatio.split(":");
      const r = Number(parts[0]) / Number(parts[1]);
      if (origW / origH > r) {
        targetW = Math.round(origH * r);
      } else {
        targetH = Math.round(origW / r);
      }
    }

    if (preset.targetMax) {
      const maxDim = Math.max(targetW, targetH);
      if (maxDim > preset.targetMax) {
        const scale = preset.targetMax / maxDim;
        targetW = Math.round(targetW * scale);
        targetH = Math.round(targetH * scale);
      }
    }

    return { width: targetW, height: targetH };
  };

  const startExport = async () => {
    if (!baseImage) {
      toast.error(en ? "No image loaded to export" : "لا توجد صورة للتصدير");
      return;
    }

    setExporting(true);
    setProgress(0.1);

    try {
      const { width: exportW, height: exportH } = getComputedDimensions();
      const format = FORMAT_OPTIONS[selectedFormat];

      const canvas = document.createElement("canvas");
      canvas.width = exportW;
      canvas.height = exportH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize canvas context");

      setProgress(0.25);

      // 1. Fill solid background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, exportW, exportH);

      // 2. Base Image Drawing with Filters & Transformations
      ctx.save();
      const filterParts = [
        filter !== "none" ? filter : "",
        `brightness(${brightness}%)`,
        `contrast(${contrast}%)`,
        `saturate(${saturate}%)`,
        blurVal > 0 ? `blur(${blurVal}px)` : "",
        hueVal > 0 ? `hue-rotate(${hueVal}deg)` : ""
      ].filter(Boolean).join(" ");

      ctx.filter = filterParts || "none";
      ctx.translate(exportW / 2, exportH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

      const sX = exportW / baseImage.naturalWidth;
      const sY = exportH / baseImage.naturalHeight;
      const fitScale = cropRatio === "free" ? Math.min(sX, sY) : Math.max(sX, sY);
      const drawScale = fitScale * zoom;

      const dw = baseImage.naturalWidth * drawScale;
      const dh = baseImage.naturalHeight * drawScale;

      const previewW = previewContainerWidth > 0 ? previewContainerWidth : 450;
      const previewH = previewContainerHeight > 0 ? previewContainerHeight : 450;
      const scaleFactorX = exportW / previewW;
      const scaleFactorY = exportH / previewH;
      const unifiedScaleFactor = Math.min(scaleFactorX, scaleFactorY);

      const cx = panX * scaleFactorX;
      const cy = panY * scaleFactorY;

      ctx.drawImage(baseImage, -dw / 2 + cx, -dh / 2 + cy, dw, dh);
      ctx.restore();

      setProgress(0.5);

      // 3. Visual Effects (VFX)
      if (vfxType === "vignette") {
        ctx.save();
        const grad = ctx.createRadialGradient(
          exportW / 2, exportH / 2, exportW * 0.25,
          exportW / 2, exportH / 2, exportW * 0.7
        );
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, `rgba(0,0,0,${vfxIntensity / 100})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, exportW, exportH);
        ctx.restore();
      } else if (vfxType === "light-leak") {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = vfxIntensity / 100;
        const grad = ctx.createLinearGradient(0, 0, exportW * 0.8, exportH * 0.8);
        grad.addColorStop(0, "rgba(255, 120, 50, 0.4)");
        grad.addColorStop(0.5, "rgba(255, 200, 80, 0.2)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, exportW, exportH);
        ctx.restore();
      } else if (vfxType === "film-grain") {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        const grainCount = Math.floor(exportW * exportH * 0.04 * (vfxIntensity / 100));
        for (let i = 0; i < grainCount; i++) {
          const gx = Math.random() * exportW;
          const gy = Math.random() * exportH;
          const gSize = Math.random() * (exportW / 500) + 1;
          ctx.fillRect(gx, gy, gSize, gSize);
        }
        ctx.restore();
      } else if (vfxType === "neon-glow") {
        ctx.save();
        ctx.globalCompositeOperation = "color-dodge";
        ctx.fillStyle = `rgba(59, 130, 246, ${vfxIntensity / 250})`;
        ctx.fillRect(0, 0, exportW, exportH);
        ctx.restore();
      }

      setProgress(0.7);

      // 4. Draw Active Layers with Sub-pixel Precision
      for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity;

        const lx = (layer.x / 100) * exportW;
        const ly = (layer.y / 100) * exportH;

        ctx.translate(lx, ly);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.scale(layer.scale, layer.scale);

        if (layer.type === "text") {
          const drawFontSize = (layer.fontSize || 22) * unifiedScaleFactor;
          ctx.font = `${layer.fontWeight || "bold"} ${drawFontSize}px "${layer.fontFamily || "Cairo"}", sans-serif`;
          ctx.textAlign = layer.textAlign || "center";
          ctx.textBaseline = "middle";

          const lines = (layer.text || "").split("\n");
          const lineHeight = drawFontSize * 1.3;
          const totalTextHeight = lines.length * lineHeight;
          let yOffset = -totalTextHeight / 2 + lineHeight / 2;

          for (const line of lines) {
            const metrics = ctx.measureText(line);
            const textW = metrics.width;
            const textH = drawFontSize;

            // Background box with rounded corners
            if (layer.bgColor && layer.bgColor !== "transparent" && layer.bgColor !== "rgba(0,0,0,0)") {
              ctx.fillStyle = layer.bgColor;
              const padX = 14 * unifiedScaleFactor;
              const padY = 8 * unifiedScaleFactor;
              const radius = 8 * unifiedScaleFactor;

              let rx = -textW / 2 - padX;
              if (layer.textAlign === "left") rx = -padX;
              else if (layer.textAlign === "right") rx = -textW - padX;

              const ry = yOffset - textH / 2 - padY / 2;
              const rw = textW + padX * 2;
              const rh = textH + padY;

              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(rx, ry, rw, rh, radius);
              } else {
                ctx.rect(rx, ry, rw, rh);
              }
              ctx.fill();
            }

            // Outline stroke
            ctx.strokeStyle = "rgba(0,0,0,0.85)";
            ctx.lineWidth = Math.max(2, 3.5 * unifiedScaleFactor);
            ctx.lineJoin = "round";
            ctx.strokeText(line, 0, yOffset);

            // Text Fill
            ctx.fillStyle = layer.color || "#ffffff";
            ctx.fillText(line, 0, yOffset);

            yOffset += lineHeight;
          }
        } else if (layer.type === "sticker") {
          const drawStickerSize = (layer.fontSize || 44) * unifiedScaleFactor;
          ctx.font = `${drawStickerSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(layer.emoji || "✨", 0, 0);
        } else if (layer.type === "image" && layer.url) {
          try {
            const pipImg = await loadImageAsync(layer.url);
            const dw = (layer.width || 25) * 10 * unifiedScaleFactor;
            const dh = (layer.height || 25) * 10 * unifiedScaleFactor;
            ctx.drawImage(pipImg, -dw / 2, -dh / 2, dw, dh);
          } catch (err) {
            console.error("PIP image overlay render error:", err);
          }
        } else if (layer.type === "shape") {
          const sw = (layer.width || 20) * 10 * unifiedScaleFactor;
          const sh = (layer.height || 20) * 10 * unifiedScaleFactor;
          ctx.fillStyle = layer.fillColor || "rgba(59, 130, 246, 0.4)";
          ctx.strokeStyle = layer.strokeColor || "#ffffff";
          ctx.lineWidth = (layer.strokeWidth || 2) * unifiedScaleFactor;

          if (layer.shapeType === "rect") {
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 8 * unifiedScaleFactor);
            } else {
              ctx.rect(-sw / 2, -sh / 2, sw, sh);
            }
            ctx.fill();
            ctx.stroke();
          } else if (layer.shapeType === "circle") {
            ctx.beginPath();
            ctx.arc(0, 0, sw / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (layer.shapeType === "triangle") {
            ctx.beginPath();
            ctx.moveTo(0, -sh / 2);
            ctx.lineTo(sw / 2, sh / 2);
            ctx.lineTo(-sw / 2, sh / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (layer.shapeType === "star") {
            ctx.beginPath();
            const spikes = 5;
            const outerR = sw / 2;
            const innerR = sw / 4;
            let rot = (Math.PI / 2) * 3;
            const step = Math.PI / spikes;
            ctx.moveTo(0, -outerR);
            for (let i = 0; i < spikes; i++) {
              ctx.lineTo(Math.cos(rot) * outerR, Math.sin(rot) * outerR);
              rot += step;
              ctx.lineTo(Math.cos(rot) * innerR, Math.sin(rot) * innerR);
              rot += step;
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      setProgress(0.9);

      // 5. Convert canvas to output blob
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setExporting(false);
            toast.error(en ? "Failed to generate image file" : "فشل إنشاء ملف الصورة");
            return;
          }

          const fileUrl = URL.createObjectURL(blob);
          const sizeKb = blob.size / 1024;
          const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${Math.round(sizeKb)} KB`;

          setExportedUrl(fileUrl);
          setExportedBlob(blob);
          setExportInfo({
            width: exportW,
            height: exportH,
            sizeFormatted: sizeStr
          });
          setProgress(1.0);
          setExporting(false);

          // If on native platform, automatically save to gallery cache
          if (Capacitor.isNativePlatform()) {
            try {
              const fileName = `vireon_${Date.now()}.${format.ext}`;
              await saveImageToGallery(blob, fileName);
              setSavedToGallery(true);
            } catch (err) {
              console.warn("Auto gallery save notice:", err);
            }
          }

          toast.success(en ? "Photo exported in high quality!" : "تم تصدير الصورة بجودة عالية بنجاح!");
        },
        format.id,
        format.quality
      );
    } catch (err) {
      setExporting(false);
      console.error("Photo export error:", err);
      toast.error(en ? "Export process encountered an error" : "حدث خطأ أثناء عملية التصدير");
    }
  };

  const handleDownload = () => {
    if (!exportedBlob && !exportedUrl) return;
    const format = FORMAT_OPTIONS[selectedFormat];
    const fileName = `vireon_photo_${Date.now()}.${format.ext}`;

    if (Capacitor.isNativePlatform() && exportedBlob) {
      saveImageToGallery(exportedBlob, fileName)
        .then(() => {
          setSavedToGallery(true);
          toast.success(en ? "Saved to device gallery" : "تم الحفظ في معرض الصور بالجهاز");
        })
        .catch((err) => {
          toast.error(en ? "Save to gallery failed" : "فشل الحفظ في المعرض");
        });
      return;
    }

    if (exportedUrl) {
      const a = document.createElement("a");
      a.href = exportedUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setSavedToGallery(true);
      toast.success(en ? "Image downloaded successfully" : "تم تحميل الصورة بنجاح");
    }
  };

  const handleShare = async (platform?: string) => {
    const format = FORMAT_OPTIONS[selectedFormat];
    const fileName = `vireon_photo_${Date.now()}.${format.ext}`;

    if (!exportedBlob && !exportedUrl) return;

    if (platform === "copy") {
      try {
        if (exportedBlob && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([
            new ClipboardItem({ [exportedBlob.type || "image/png"]: exportedBlob })
          ]);
          toast.success(en ? "Image copied to clipboard!" : "تم نسخ الصورة إلى الحافظة!");
          return;
        }
      } catch (err) {
        console.warn("Clipboard write notice:", err);
      }
    }

    if (Capacitor.isNativePlatform()) {
      try {
        if (exportedBlob) {
          const saveRes = await saveImageToGallery(exportedBlob, fileName);
          if (saveRes.path) {
            await Share.share({
              title: "Vireon Photo",
              text: en ? "Check out my photo created with Vireon!" : "شاهد صورتي المصممة عبر فيرون!",
              url: saveRes.path,
              dialogTitle: en ? "Share Photo" : "مشاركة الصورة"
            });
            return;
          }
        }
      } catch (err) {
        console.warn("Native share notice:", err);
      }
    }

    if (navigator.share && exportedBlob) {
      try {
        const file = new File([exportedBlob], fileName, { type: exportedBlob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Vireon Photo",
            text: en ? "Created with Vireon Photo Studio" : "تم التصميم عبر محرر صور فيرون"
          });
          return;
        }
      } catch (err) {
        console.warn("Web Share API notice:", err);
      }
    }

    // Fallback: trigger download
    handleDownload();
  };

  const dashOffset = 1000 - Math.round(progress * 1000);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" dir={isRTL() ? "rtl" : "ltr"}>
      <div className="bg-[#111622] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#161c2c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                {exportedUrl ? (en ? "Photo Export Ready" : "اكتمل تصدير الصورة") : (en ? "Export High-Quality Photo" : "تصدير الصورة بجودة فائقة")}
              </h2>
              <p className="text-[10px] text-gray-400">
                {exportedUrl ? (en ? "Saved with original graphic crispness" : "تم التصدير بنقاء رسومي ومطابقة تامة") : (en ? "Select resolution & format settings" : "حدد أبعاد وتنسيق حفظ الصورة")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          {/* Animated Preview Container */}
          <div
            ref={previewBoxRef}
            className="relative w-full aspect-video bg-black/60 rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center shadow-inner"
          >
            {exportedUrl ? (
              <img
                src={exportedUrl}
                alt="Exported Output"
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
                <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
                <p className="text-xs font-bold text-white/90">
                  {en ? "WYSIWYG Pixel-Perfect Engine" : "محرك تصدير فائق الدقة والمطابقة"}
                </p>
                <p className="text-[10px] text-gray-400 max-w-[240px]">
                  {en ? "Preserves sub-pixel text positioning, filters, and layer effects" : "يحافظ على تموضع النصوص والمؤثرات والملصقات بدقة مطابقة للمعاينة"}
                </p>
              </div>
            )}

            {/* Perimeter Glow Progress on Exporting */}
            {exporting && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                <defs>
                  <linearGradient id="photoExportGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
                <rect
                  x="2"
                  y="2"
                  width={Math.max(0, boxDimensions.w - 4)}
                  height={Math.max(0, boxDimensions.h - 4)}
                  rx="16"
                  ry="16"
                  fill="none"
                  stroke="url(#photoExportGlow)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  pathLength={1000}
                  strokeDasharray={1000}
                  strokeDashoffset={dashOffset}
                  style={{
                    transition: "stroke-dashoffset 200ms ease-out",
                    filter: "drop-shadow(0 0 8px rgba(59,130,246,0.9))"
                  }}
                />
              </svg>
            )}

            {/* Exporting Loading Overlay */}
            {exporting && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 space-y-2.5">
                <div className="text-4xl font-black font-mono text-white tracking-tight drop-shadow-[0_0_20px_rgba(59,130,246,0.9)]">
                  {Math.round(progress * 100)} <span className="text-xl text-blue-400 font-bold">%</span>
                </div>
                <p className="text-xs font-semibold text-white/90 animate-pulse">
                  {progress < 0.4
                    ? (en ? "Composing high-res layers..." : "جاري دمج الطبقات الفائقة...")
                    : progress < 0.8
                    ? (en ? "Rendering filters & overlays..." : "تطبيق الفلاتر والمؤثرات...")
                    : (en ? "Encoding image file..." : "تشفير الصورة النهائية...")}
                </p>
              </div>
            )}
          </div>

          {/* Pre-Export Settings Screen */}
          {!exportedUrl && !exporting && (
            <div className="space-y-4">
              
              {/* Quality Preset Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  {en ? "Resolution & Quality" : "أبعاد وجودة التصدير"}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {QUALITY_PRESETS.map((p, idx) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedQuality(idx)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-start flex flex-col gap-0.5 ${
                        selectedQuality === idx
                          ? "border-blue-500 bg-blue-500/15 text-blue-400 shadow-md shadow-blue-500/10"
                          : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      <span className="line-clamp-1">{en ? p.labelEn : p.labelAr}</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {p.exactW && p.exactH ? `${p.exactW}×${p.exactH}` : p.targetMax ? `Up to ${p.targetMax}px` : "Original UHD"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  {en ? "File Format" : "صيغة الملف"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAT_OPTIONS.map((f, idx) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFormat(idx)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center gap-1 ${
                        selectedFormat === idx
                          ? "border-purple-500 bg-purple-500/15 text-purple-400 shadow-md shadow-purple-500/10"
                          : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      <span>{f.label}</span>
                      <span className="text-[9px] text-gray-400 line-clamp-1">{en ? f.descEn : f.descAr}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Export Button */}
              <button
                onClick={startExport}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white font-black text-sm hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/25"
              >
                <Download className="w-4 h-4" />
                {en ? "Export High-Quality Photo" : "بدء تصدير الصورة الآن"}
              </button>
            </div>
          )}

          {/* Post-Export Success & Sharing Screen */}
          {exportedUrl && !exporting && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Success Badge */}
              <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-emerald-400">
                  <Check className="w-5 h-5 bg-emerald-500 text-black rounded-full p-0.5" />
                  <div>
                    <p className="text-xs font-bold">{en ? "Photo Exported Successfully!" : "تم حفظ وتصدير الصورة بنجاح!"}</p>
                    <p className="text-[10px] text-emerald-300/80">
                      {exportInfo ? `${exportInfo.width} × ${exportInfo.height} PX • ${exportInfo.sizeFormatted}` : (en ? "Ready to share and save" : "جاهزة للمشاركة والحفظ")}
                    </p>
                  </div>
                </div>
                {savedToGallery && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {en ? "Saved" : "تم الحفظ"}
                  </span>
                )}
              </div>

              {/* Primary Native / Web Share Button */}
              <button
                onClick={() => handleShare()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 hover:opacity-95 active:scale-98 transition-all"
              >
                <Share2 className="w-4 h-4" />
                {en ? "Share Photo Now" : "مشاركة الصورة الآن"}
              </button>

              {/* Secondary Download / Save Button */}
              <button
                onClick={handleDownload}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/10 transition-all active:scale-98"
              >
                <Download className="w-4 h-4 text-blue-400" />
                {en ? "Save / Download File" : "حفظ / تنزيل الملف مجدداً"}
              </button>

              {/* Quick Actions Grid */}
              <div className="pt-1 space-y-2">
                <p className="text-[11px] font-bold text-gray-400 text-center">
                  {en ? "Quick Actions & Sharing" : "خيارات سريعة للمشاركة"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleShare("copy")}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-200 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Copy className="w-3.5 h-3.5 text-purple-400" />
                    {en ? "Copy to Clipboard" : "نسخ للحافظة"}
                  </button>
                  <button
                    onClick={() => handleShare("direct")}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-200 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5 text-blue-400" />
                    {en ? "Send to Apps" : "إرسال للتطبيقات"}
                  </button>
                </div>
              </div>

              {/* Back to Editing Button */}
              <button
                onClick={onClose}
                className="w-full py-2.5 text-center text-xs text-gray-400 hover:text-white font-semibold transition-colors"
              >
                {en ? "Back to Editor" : "العودة للمحرر ومتابعة التعديل"}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
