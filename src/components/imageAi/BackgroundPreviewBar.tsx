import React, { useRef } from "react";
import { Sparkles, Palette, Image as ImageIcon, Check } from "lucide-react";

export type BgPreviewMode = "transparent" | "white" | "black" | "custom-color" | "custom-image";

interface BackgroundPreviewBarProps {
  currentMode: BgPreviewMode;
  onModeChange: (mode: BgPreviewMode) => void;
  customColor: string;
  onCustomColorChange: (color: string) => void;
  customImageUrl: string | null;
  onCustomImageSelected: (dataUrl: string | null) => void;
  className?: string;
}

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#64748b", // Slate
];

export const BackgroundPreviewBar: React.FC<BackgroundPreviewBarProps> = ({
  currentMode,
  onModeChange,
  customColor,
  onCustomColorChange,
  customImageUrl,
  onCustomImageSelected,
  className = "",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onCustomImageSelected(reader.result);
        onModeChange("custom-image");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      className={`flex flex-col gap-2 p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md select-none ${className}`}
      dir="rtl"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <Palette className="w-3.5 h-3.5 text-primary" />
          <span>خلفية المعاينة</span>
          <span className="text-[10px] font-normal text-slate-400">
            (للمعاينة فقط — يظل PNG شفافاً)
          </span>
        </div>

        {currentMode === "custom-image" && customImageUrl && (
          <button
            type="button"
            onClick={() => onCustomImageSelected(null)}
            className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold"
          >
            إزالة الصورة
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {/* Transparent (Checkerboard) */}
        <button
          type="button"
          onClick={() => onModeChange("transparent")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 border ${
            currentMode === "transparent"
              ? "bg-slate-800 text-primary border-primary shadow-sm"
              : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="خلفية مفرغة شفافة"
        >
          <div className="w-4 h-4 rounded-md border border-slate-600 overflow-hidden relative">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #475569 25%, transparent 25%),
                  linear-gradient(-45deg, #475569 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #475569 75%),
                  linear-gradient(-45deg, transparent 75%, #475569 75%)
                `,
                backgroundSize: "6px 6px",
                backgroundColor: "#1e293b",
              }}
            />
          </div>
          <span>شفافة</span>
        </button>

        {/* White Background */}
        <button
          type="button"
          onClick={() => onModeChange("white")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 border ${
            currentMode === "white"
              ? "bg-slate-800 text-white border-primary shadow-sm"
              : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="خلفية بيضاء"
        >
          <div className="w-4 h-4 rounded-md bg-white border border-slate-400" />
          <span>أبيض</span>
        </button>

        {/* Black Background */}
        <button
          type="button"
          onClick={() => onModeChange("black")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 border ${
            currentMode === "black"
              ? "bg-slate-800 text-white border-primary shadow-sm"
              : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="خلفية سوداء"
        >
          <div className="w-4 h-4 rounded-md bg-black border border-slate-700" />
          <span>أسود</span>
        </button>

        {/* Color Presets Palette */}
        {PRESET_COLORS.map((color) => {
          const isSelected = currentMode === "custom-color" && customColor.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => {
                onCustomColorChange(color);
                onModeChange("custom-color");
              }}
              className="relative w-6 h-6 rounded-full flex-shrink-0 transition-transform hover:scale-110 active:scale-95 flex items-center justify-center shadow"
              style={{ backgroundColor: color }}
              title={color}
            >
              {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
            </button>
          );
        })}

        {/* Custom Color Input Picker */}
        <label
          className={`relative flex items-center justify-center w-7 h-7 rounded-xl cursor-pointer border flex-shrink-0 transition ${
            currentMode === "custom-color"
              ? "border-primary bg-slate-800"
              : "border-slate-700 bg-slate-950 hover:bg-slate-850"
          }`}
          title="اختيار لون مخصص"
        >
          <input
            type="color"
            value={customColor}
            onChange={(e) => {
              onCustomColorChange(e.target.value);
              onModeChange("custom-color");
            }}
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
          />
          <Palette className="w-4 h-4 text-slate-300" />
        </label>

        {/* Custom Image Background */}
        <button
          type="button"
          onClick={() => {
            if (customImageUrl) {
              onModeChange("custom-image");
            } else {
              fileInputRef.current?.click();
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 border ${
            currentMode === "custom-image"
              ? "bg-slate-800 text-amber-400 border-amber-500 shadow-sm"
              : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="اختيار صورة كخلفية"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>صورة</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default BackgroundPreviewBar;
