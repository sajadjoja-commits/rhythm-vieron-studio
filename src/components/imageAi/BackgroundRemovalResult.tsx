import React, { useState } from "react";
import {
  ArrowLeft,
  Scissors,
  CheckCircle2,
  SlidersHorizontal,
  Brush,
  Download,
  Share2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  Maximize2,
  ShieldCheck,
  Palette,
  X,
} from "lucide-react";
import { BeforeAfterSlider } from "@/components/ui/BeforeAfterSlider";
import { BackgroundPreviewBar, BgPreviewMode } from "./BackgroundPreviewBar";
import { MaskEditor } from "./MaskEditor";
import { ImageExportPanel } from "./ImageExportPanel";
import { playSfx } from "@/lib/soundFx";

interface BackgroundRemovalResultProps {
  originalImageUrl: string;
  resultDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  executionTimeMs?: number;
  onApply: (finalDataUrl: string) => void;
  onClose: () => void;
  onReProcess?: () => void;
  className?: string;
}

export type ResultViewMode = "slider" | "result" | "mask-editor" | "export";

export const BackgroundRemovalResult: React.FC<BackgroundRemovalResultProps> = ({
  originalImageUrl,
  resultDataUrl,
  originalWidth,
  originalHeight,
  executionTimeMs = 240,
  onApply,
  onClose,
  onReProcess,
  className = "",
}) => {
  // Current active working cutout data URL
  const [currentResultUrl, setCurrentResultUrl] = useState<string>(resultDataUrl);
  const [viewMode, setViewMode] = useState<ResultViewMode>("slider");

  // Background Preview States (For display only)
  const [bgPreviewMode, setBgPreviewMode] = useState<BgPreviewMode>("transparent");
  const [customBgColor, setCustomBgColor] = useState<string>("#3b82f6");
  const [customBgImageUrl, setCustomBgImageUrl] = useState<string | null>(null);

  // Zoom & Pan for Result Mode
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMaskUpdated = (updatedUrl: string) => {
    setCurrentResultUrl(updatedUrl);
  };

  return (
    <div
      className={`flex flex-col h-full w-full bg-slate-950 text-slate-100 select-none overflow-hidden ${className}`}
      dir="rtl"
    >
      {/* 1. Header: Back, Title, Status & Processing Time */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 transition"
            title="رجوع / إغلاق"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white">إزالة الخلفية</h2>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>مكتمل</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {originalWidth} × {originalHeight} px • تم العزل في {executionTimeMs} ms
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setViewMode("slider");
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === "slider"
                ? "bg-primary text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">قبل / بعد</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setViewMode("result");
            }}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === "result"
                ? "bg-primary text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>النتيجة</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setViewMode("mask-editor");
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === "mask-editor"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Brush className="w-3.5 h-3.5" />
            <span>تعديل القناع</span>
          </button>
        </div>
      </div>

      {/* 2. Main Viewport Area */}
      <div className="flex-1 relative overflow-hidden bg-slate-950 flex flex-col">
        {viewMode === "slider" ? (
          /* Before / After Draggable Slider */
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
            <BeforeAfterSlider
              beforeImage={originalImageUrl}
              afterImage={currentResultUrl}
              beforeLabel="الأصل"
              afterLabel="مفرغة (AI)"
              aspectRatio="auto"
              className="w-full h-full max-h-[70vh] rounded-2xl"
              showCheckerboard={true}
            />
          </div>
        ) : viewMode === "mask-editor" ? (
          /* Smart Mask Editor Canvas */
          <div className="flex-1 w-full h-full overflow-hidden">
            <MaskEditor
              originalImageUrl={originalImageUrl}
              initialMaskOrCutoutUrl={currentResultUrl}
              bgPreviewMode={bgPreviewMode}
              customBgColor={customBgColor}
              customBgImageUrl={customBgImageUrl}
              onMaskUpdated={handleMaskUpdated}
              className="h-full"
            />
          </div>
        ) : (
          /* Live Result Display with Background Layer */
          <div
            className="flex-1 relative flex items-center justify-center p-3 overflow-hidden select-none"
            style={{
              backgroundImage:
                bgPreviewMode === "transparent"
                  ? `
                    linear-gradient(45deg, #1e293b 25%, transparent 25%),
                    linear-gradient(-45deg, #1e293b 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #1e293b 75%),
                    linear-gradient(-45deg, transparent 75%, #1e293b 75%)
                  `
                  : "none",
              backgroundSize: "16px 16px",
              backgroundColor:
                bgPreviewMode === "white"
                  ? "#ffffff"
                  : bgPreviewMode === "black"
                  ? "#000000"
                  : bgPreviewMode === "custom-color"
                  ? customBgColor
                  : "#090d16",
            }}
          >
            {bgPreviewMode === "custom-image" && customBgImageUrl && (
              <img
                src={customBgImageUrl}
                alt="Custom Background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}
            <img
              src={currentResultUrl}
              alt="Cutout Result"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl relative z-10 pointer-events-none"
            />
          </div>
        )}
      </div>

      {/* 3. Background Preview Bar (Shown when in Result or Slider modes) */}
      {viewMode !== "mask-editor" && (
        <div className="px-3 pt-2 bg-slate-900/80 border-t border-slate-800 flex-shrink-0">
          <BackgroundPreviewBar
            currentMode={bgPreviewMode}
            onModeChange={setBgPreviewMode}
            customColor={customBgColor}
            onCustomColorChange={setCustomBgColor}
            customImageUrl={customBgImageUrl}
            onCustomImageSelected={setCustomBgImageUrl}
          />
        </div>
      )}

      {/* 4. Bottom Action & Export Bar */}
      <div className="flex items-center justify-between gap-2 p-3 bg-slate-900 border-t border-slate-800 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {onReProcess && (
            <button
              type="button"
              onClick={onReProcess}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition border border-slate-700 min-h-[44px]"
              title="إعادة المعالجة"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Quick PNG Download */}
          <a
            href={currentResultUrl}
            download={`vireon_cutout_${Date.now()}.png`}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold border border-slate-700 transition min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">حفظ PNG</span>
          </a>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              playSfx("pop");
              onApply(currentResultUrl);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-900/30 transition active:scale-95 min-h-[44px]"
          >
            <Check className="w-4 h-4" />
            <span>اعتماد في المشروع</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackgroundRemovalResult;
