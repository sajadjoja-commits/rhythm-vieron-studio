import { useState, useEffect } from "react";
import { useMedia, Clip } from "@/context/MediaContext";
import { X, Check, FlipHorizontal, FlipVertical, Scissors, Ratio, Eye, EyeOff } from "lucide-react";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface RatioPanelProps {
  open: boolean;
  onClose: () => void;
  activeRatio: number;
  onRatioChange: (i: number) => void;
  onOpenCrop: () => void;
  activeClip: Clip | null;
  onUpdateActiveClip: (patch: Partial<Clip>) => void;
}

const ASPECT_RATIOS = [
  { label: "16:9", w: 16, h: 9, emoji: "🖥️" }, 
  { label: "9:16", w: 9, h: 16, emoji: "📱" },
  { label: "1:1", w: 1, h: 1, emoji: "⏹️" }, 
  { label: "4:5", w: 4, h: 5, emoji: "📸" },
  { label: "21:9", w: 21, h: 9, emoji: "🎞️" },
  { label: "4:3", w: 4, h: 3, emoji: "📺" },
  { label: "9:21", w: 9, h: 21, emoji: "🍿" },
  { label: "2.39:1", w: 2.39, h: 1, emoji: "🎥" },
  { label: "2:1", w: 2, h: 1, emoji: "🏞️" },
  { label: "16:10", w: 16, h: 10, emoji: "💻" },
  { label: "3:2", w: 3, h: 2, emoji: "🖼️" },
  { label: "5:4", w: 5, h: 4, emoji: "💾" },
];

export default function RatioPanel({ open, onClose, activeRatio, onRatioChange, onOpenCrop, activeClip, onUpdateActiveClip }: RatioPanelProps) {
  const isAr = getLang() === "ar";
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open) return null;

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{isAr ? "القياس الحالي:" : "Current Ratio:"}</span>
            <span className="text-primary font-extrabold">{activeRatio === 16/9 ? "16:9" : activeRatio === 9/16 ? "9:16" : "1:1"}</span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {isAr ? "إظهار الأبعاد" : "Show Ratio"}
          </button>
          <button 
            onClick={() => { playSfx("success"); onClose(); }}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90"
            title={isAr ? "تأكيد" : "Confirm"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button 
            onClick={() => { playSfx("click"); onClose(); }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const handleFlipH = () => {
    if (!activeClip) return;
    playSfx("click");
    onUpdateActiveClip({ flipH: !activeClip.flipH });
  };

  const handleFlipV = () => {
    if (!activeClip) return;
    playSfx("click");
    onUpdateActiveClip({ flipV: !activeClip.flipV });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200">
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[65vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/40">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Ratio className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            <span>{isAr ? "قياسات الفيديو وأبعاد المشهد" : "Aspect Ratio & Framing"}</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Collapse to see work button */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90"
              title={isAr ? "إخفاء لرؤية العمل" : "Minimize library to preview work"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{isAr ? "رؤية العمل" : "See Work"}</span>
            </button>

            <button 
              onClick={() => { playSfx("success"); onClose(); }} 
              className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white shadow-md active:scale-90 transition-all"
              title={isAr ? "تأكيد" : "Confirm"}
            >
              <Check className="w-4 h-4 text-white stroke-[3px]" />
            </button>
            <button 
              onClick={() => { playSfx("click"); onClose(); }} 
              className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 active:scale-90 transition-all"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Framing & Transform Quick Tools */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {/* Flip Horizontal */}
          <button
            onClick={handleFlipH}
            disabled={!activeClip}
            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-40 ${
              activeClip?.flipH ? "border-primary bg-primary/5 text-primary font-bold" : "border-border text-foreground hover:border-primary/30"
            }`}
          >
            <FlipHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-bold">{isAr ? "انعكاس أفقي" : "Flip H"}</span>
          </button>

          {/* Flip Vertical */}
          <button
            onClick={handleFlipV}
            disabled={!activeClip}
            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-40 ${
              activeClip?.flipV ? "border-primary bg-primary/5 text-primary font-bold" : "border-border text-foreground hover:border-primary/30"
            }`}
          >
            <FlipVertical className="w-5 h-5" />
            <span className="text-[10px] font-bold">{isAr ? "انعكاس عمودي" : "Flip V"}</span>
          </button>

          {/* Crop Tool (قص جزء من المشهد) */}
          <button
            onClick={() => {
              if (!activeClip) return;
              playSfx("click");
              onOpenCrop();
            }}
            disabled={!activeClip}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 border-dashed border-emerald-500/50 hover:border-emerald-500 hover:bg-emerald-500/5 text-emerald-400 font-bold transition-all active:scale-95 disabled:opacity-40"
          >
            <Scissors className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] font-extrabold">{isAr ? "قص الجزء المختار" : "Crop Clip"}</span>
          </button>
        </div>

        {/* Aspect Ratio List Grid */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {isAr ? "اختر نسبة الأبعاد للمعاينة" : "Select Target Aspect Ratio"}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {ASPECT_RATIOS.map((r, i) => {
              const isActive = activeRatio === i;
              return (
                <button
                  key={i}
                  onClick={() => {
                    playSfx("click");
                    onRatioChange(i);
                  }}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all active:scale-95 ${
                    isActive 
                      ? "gradient-primary text-primary-foreground border-transparent scale-[1.02] shadow-md shadow-primary/20 font-bold" 
                      : "bg-secondary/40 border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <span className="text-sm mb-1">{r.emoji}</span>
                  <span className="text-[10px] font-extrabold">{r.label}</span>
                  {isActive && (
                    <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center text-primary shadow z-10">
                      <Check className="w-2.5 h-2.5 stroke-[3px]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom margin padding */}
        <div className="mt-2"></div>

      </div>
    </div>
  );
}
