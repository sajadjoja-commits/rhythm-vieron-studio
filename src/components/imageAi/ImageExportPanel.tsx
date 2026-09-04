import React, { useState } from "react";
import {
  Download,
  Share2,
  Copy,
  Check,
  AlertTriangle,
  Info,
  ShieldCheck,
  FileImage,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { playSfx } from "@/lib/soundFx";

interface ImageExportPanelProps {
  originalWidth: number;
  originalHeight: number;
  resultDataUrl: string;
  sourceImageUrl: string;
  executionTimeMs?: number;
  onApplyToProject?: () => void;
  className?: string;
}

export const ImageExportPanel: React.FC<ImageExportPanelProps> = ({
  originalWidth,
  originalHeight,
  resultDataUrl,
  sourceImageUrl,
  executionTimeMs,
  onApplyToProject,
  className = "",
}) => {
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [jpgBgColor, setJpgBgColor] = useState<string>("#ffffff");
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate exported Blob based on user chosen format and background color
  const generateExportBlob = async (
    format: "png" | "jpeg" | "webp",
    bgColor = "#ffffff"
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = originalWidth || img.naturalWidth || img.width;
        canvas.height = originalHeight || img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context creation failed"));
          return;
        }

        if (format === "jpeg") {
          // Fill background for JPG since JPG does not support alpha
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const mimeType =
          format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
        const quality = format === "jpeg" ? 0.95 : undefined;

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create blob"));
          },
          mimeType,
          quality
        );
      };
      img.onerror = (e) => reject(e);
      img.src = resultDataUrl;
    });
  };

  const handleDownload = async (targetFormat: "png" | "jpeg" | "webp" = exportFormat) => {
    try {
      setIsExporting(true);
      playSfx("click");
      const blob = await generateExportBlob(targetFormat, jpgBgColor);
      const url = URL.createObjectURL(blob);
      const ext = targetFormat === "jpeg" ? "jpg" : targetFormat;
      const link = document.createElement("a");
      link.href = url;
      link.download = `vireon_cutout_${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      playSfx("success");
      toast.success(
        targetFormat === "png"
          ? "تم تنزيل الصورة كـ PNG شفاف بنجاح"
          : "تم تنزيل الصورة بنجاح"
      );
    } catch (err: any) {
      toast.error("حدث خطأ أثناء تنزيل الصورة");
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = async () => {
    try {
      playSfx("tap");
      const blob = await generateExportBlob("png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      playSfx("success");
      toast.success("تم نسخ الصورة الشفافة إلى الحافظة");
      setTimeout(() => setCopied(false), 2500);
    } catch (err: any) {
      toast.error("تعذر نسخ الصورة تلقائياً في هذا المتصفح");
    }
  };

  const handleShare = async () => {
    try {
      playSfx("tap");
      const blob = await generateExportBlob(exportFormat, jpgBgColor);
      const ext = exportFormat === "jpeg" ? "jpg" : exportFormat;
      const file = new File([blob], `vireon_cutout_${Date.now()}.${ext}`, {
        type: blob.type,
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Vireon Studio Cutout",
          text: "تم عزل وتفريغ الخلفية بنجاح عبر استوديو فيريون",
        });
      } else {
        // Fallback to download
        handleDownload(exportFormat);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast.error("تعذر إتمام المشاركة");
      }
    }
  };

  return (
    <div
      className={`flex flex-col gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 select-none ${className}`}
      dir="rtl"
    >
      {/* Information Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
          <Info className="w-3.5 h-3.5 text-primary" />
          <span>تصدير وحفظ الصورة</span>
        </div>
        {executionTimeMs !== undefined && (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
            {executionTimeMs} مللي ثانية
          </span>
        )}
      </div>

      {/* Format Selection Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800">
        <button
          type="button"
          onClick={() => setExportFormat("png")}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition ${
            exportFormat === "png"
              ? "bg-primary text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>PNG (شفاف)</span>
        </button>
        <button
          type="button"
          onClick={() => setExportFormat("jpeg")}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition ${
            exportFormat === "jpeg"
              ? "bg-primary text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>JPG (مدمج)</span>
        </button>
        <button
          type="button"
          onClick={() => setExportFormat("webp")}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition ${
            exportFormat === "webp"
              ? "bg-primary text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>WEBP</span>
        </button>
      </div>

      {/* JPG Warning & Background Filler */}
      {exportFormat === "jpeg" && (
        <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-300 text-xs flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
            <span>صيغة JPG لا تدعم الشفافية. يرجى اختيار لون الخلفية:</span>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: "أبيض", val: "#ffffff" },
              { label: "أسود", val: "#000000" },
              { label: "رمادي", val: "#e2e8f0" },
            ].map((c) => (
              <button
                key={c.val}
                type="button"
                onClick={() => setJpgBgColor(c.val)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                  jpgBgColor === c.val
                    ? "bg-slate-800 border-amber-400 text-white"
                    : "bg-slate-900/60 border-slate-700 text-slate-300"
                }`}
              >
                {c.label}
              </button>
            ))}
            <label className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] cursor-pointer">
              <span>مخصص:</span>
              <input
                type="color"
                value={jpgBgColor}
                onChange={(e) => setJpgBgColor(e.target.value)}
                className="w-4 h-4 rounded cursor-pointer bg-transparent border-0"
              />
            </label>
          </div>
        </div>
      )}

      {/* Compact Info Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[11px] p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
        <div>
          <span className="text-slate-400 block text-[10px]">الأبعاد الأصلية:</span>
          <span className="font-bold text-slate-200">
            {originalWidth} × {originalHeight} px
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">حالة الشفافية:</span>
          <span className="font-bold text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>قناة ألفا نقية 100%</span>
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleDownload()}
          disabled={isExporting}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-lg shadow-primary/20 transition active:scale-95 min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>حفظ {exportFormat.toUpperCase()}</span>
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold border border-slate-700 transition active:scale-95 min-h-[44px]"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? "تم النسخ" : "نسخ PNG"}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold border border-slate-700 transition active:scale-95 min-h-[44px]"
        >
          <Share2 className="w-4 h-4" />
          <span>مشاركة</span>
        </button>
      </div>

      {onApplyToProject && (
        <button
          type="button"
          onClick={() => {
            playSfx("select");
            onApplyToProject();
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition active:scale-95 min-h-[44px]"
        >
          <Check className="w-4 h-4" />
          <span>اعتماد وتطبيق في المشروع</span>
        </button>
      )}
    </div>
  );
};

export default ImageExportPanel;
