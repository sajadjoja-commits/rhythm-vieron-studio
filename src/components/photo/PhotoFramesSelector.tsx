import React from "react";
import { Frame, Sparkles, Sliders, Type, Palette } from "lucide-react";
import { PhotoFrameConfig } from "./PhotoExportDialog";

interface PhotoFramesSelectorProps {
  frameConfig: PhotoFrameConfig;
  onChangeFrameConfig: (config: PhotoFrameConfig) => void;
  en?: boolean;
}

const FRAME_PRESETS = [
  { id: "none" as const, labelAr: "بدون إطار", labelEn: "No Frame", icon: "🚫", desc: "الصورة الأصلية كاملة" },
  { id: "polaroid" as const, labelAr: "بولارويد كلاسيكي", labelEn: "Polaroid", icon: "📸", desc: "إطار أبيض مع مساحة عنوان سفلية" },
  { id: "film" as const, labelAr: "شريط سينمائي 35mm", labelEn: "Film 35mm", icon: "🎞️", desc: "شريط كوداك مع ثقوب وعلامات الفيلم" },
  { id: "minimal" as const, labelAr: "عصري ناعم", labelEn: "Minimalist", icon: "🖼️", desc: "إطار أنيق مع حواف وزوايا مستديرة" },
  { id: "neon" as const, labelAr: "نيون متوهج", labelEn: "Cyber Neon", icon: "⚡", desc: "إطار مشع بتوهج ضوئي ملوّن" },
  { id: "gold-double" as const, labelAr: "ملكي مزدوج", labelEn: "Luxury Gold", icon: "👑", desc: "إطار ذهبي فاخر بخطين متوازيين" },
  { id: "stamp" as const, labelAr: "طابع بريدي", labelEn: "Postage Stamp", icon: "💌", desc: "حواف مسننة تشبه طابع البريد" },
  { id: "float-shadow" as const, labelAr: "عائم ثلاثي الأبعاد", labelEn: "3D Float", icon: "✨", desc: "ظل ناعم عميق يبرز الصورة" },
  { id: "blur-bg" as const, labelAr: "خلفية ممتدة ضبابية", labelEn: "Blurred BG", icon: "🌌", desc: "تمديد الصورة كخلفية مضببة" },
];

const FRAME_COLORS = [
  { value: "#ffffff", label: "أبيض ناصع" },
  { value: "#000000", label: "أسود داكن" },
  { value: "#fef08a", label: "كريمي / عاجي" },
  { value: "#f59e0b", label: "ذهبي فاخر" },
  { value: "#94a3b8", label: "فضي أنيق" },
  { value: "#ef4444", label: "أحمر قرمزي" },
  { value: "#3b82f6", label: "أزرق ملكي" },
  { value: "#10b981", label: "أخضر زمردي" },
  { value: "#ec4899", label: "وردي نيون" },
  { value: "#8b5cf6", label: "بنفسجي ساحر" },
];

const NEON_GLOW_COLORS = [
  "#3b82f6", // Electric Blue
  "#ec4899", // Neon Pink
  "#10b981", // Emerald Neon
  "#eab308", // Cyber Yellow
  "#a855f7", // Purple UV
  "#06b6d4", // Cyan Glow
];

export const PhotoFramesSelector: React.FC<PhotoFramesSelectorProps> = ({
  frameConfig,
  onChangeFrameConfig,
  en = false,
}) => {
  const update = (partial: Partial<PhotoFrameConfig>) => {
    onChangeFrameConfig({ ...frameConfig, ...partial });
  };

  return (
    <div className="space-y-4">
      {/* Preset Frame Styles Grid */}
      <div>
        <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
          <Frame className="w-3.5 h-3.5 text-blue-400" />
          {en ? "Choose Frame & Border Style" : "اختر نمط الإطار والبرواز الفني"}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FRAME_PRESETS.map((p) => {
            const isSelected = frameConfig.type === p.id;
            return (
              <button
                key={p.id}
                onClick={() => update({ type: p.id })}
                className={`p-2.5 rounded-2xl border text-start flex flex-col gap-1 transition-all ${
                  isSelected
                    ? "bg-blue-600/15 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10 scale-[1.02]"
                    : "bg-[#1d2636] border-white/5 text-foreground hover:bg-[#253147] hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{p.icon}</span>
                  <span className="text-xs font-black">{en ? p.labelEn : p.labelAr}</span>
                </div>
                <span className="text-[9px] text-muted-foreground line-clamp-1">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {frameConfig.type !== "none" && (
        <div className="bg-[#1d2636] p-3.5 rounded-2xl border border-white/10 space-y-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
          
          {/* Frame Thickness & Radius */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-bold">
                <span>{en ? "Frame Width" : "سماكة الإطار"}</span>
                <span className="text-blue-400 font-mono">{frameConfig.width}px</span>
              </div>
              <input
                type="range"
                min={4}
                max={50}
                value={frameConfig.width}
                onChange={(e) => update({ width: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>

            {frameConfig.type !== "film" && frameConfig.type !== "stamp" && (
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-bold">
                  <span>{en ? "Corner Radius" : "استدارة زوايا الإطار"}</span>
                  <span className="text-blue-400 font-mono">{frameConfig.radius}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={frameConfig.radius}
                  onChange={(e) => update({ radius: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>
            )}
          </div>

          {/* Frame Color Swatches */}
          {frameConfig.type !== "film" && (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1.5 font-bold flex items-center gap-1">
                <Palette className="w-3 h-3 text-purple-400" />
                {en ? "Frame Border Color" : "لون الإطار"}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {FRAME_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => update({ color: c.value })}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      frameConfig.color === c.value ? "border-blue-400 scale-125 shadow-md" : "border-white/10"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
                {/* Hex Custom input */}
                <input
                  type="color"
                  value={frameConfig.color.startsWith("#") ? frameConfig.color : "#ffffff"}
                  onChange={(e) => update({ color: e.target.value })}
                  className="w-7 h-7 bg-transparent border-0 cursor-pointer rounded-full"
                  title={en ? "Custom Color" : "لون مخصص"}
                />
              </div>
            </div>
          )}

          {/* Neon Glow Color Picker */}
          {frameConfig.type === "neon" && (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1.5 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                {en ? "Neon Glow Color" : "لون التوهج المشع (Glow Color)"}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {NEON_GLOW_COLORS.map((nc) => (
                  <button
                    key={nc}
                    onClick={() => update({ glowColor: nc })}
                    className={`w-6 h-6 rounded-full border-2 transition-transform shadow-lg ${
                      frameConfig.glowColor === nc ? "border-white scale-125 ring-2 ring-white/50" : "border-transparent"
                    }`}
                    style={{ backgroundColor: nc, boxShadow: `0 0 10px ${nc}` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Polaroid Caption Input */}
          {frameConfig.type === "polaroid" && (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1 font-bold flex items-center gap-1">
                <Type className="w-3 h-3 text-blue-400" />
                {en ? "Polaroid Caption Title" : "عنوان / نص أسفل البولارويد"}
              </label>
              <input
                type="text"
                value={frameConfig.polaroidCaption || ""}
                onChange={(e) => update({ polaroidCaption: e.target.value })}
                placeholder={en ? "e.g., Summer Memories ✨" : "مثال: ذكريات الصيف الجميلة ✨"}
                className="w-full bg-[#131924] border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
