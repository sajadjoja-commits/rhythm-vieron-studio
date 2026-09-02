import { useState, useEffect } from "react";
import { Clip } from "@/context/MediaContext";
import { 
  X, 
  Check, 
  FlipHorizontal, 
  FlipVertical, 
  RotateCw,
  Scissors, 
  Ratio, 
  Eye, 
  EyeOff, 
  Smartphone, 
  Monitor, 
  Film, 
  Camera, 
  Sparkles,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Layers,
  Wand2
} from "lucide-react";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { ASPECT_RATIOS, AspectRatioOption } from "@/lib/aspectRatios";

interface RatioPanelProps {
  open: boolean;
  onClose: () => void;
  activeRatio: number;
  onRatioChange: (i: number) => void;
  onOpenCrop: () => void;
  activeClip: Clip | null;
  onUpdateActiveClip: (patch: Partial<Clip>) => void;
  showSafeZones?: boolean;
  onToggleSafeZones?: (val: boolean) => void;
  fitMode?: "contain" | "cover" | "blur";
  onFitModeChange?: (mode: "contain" | "cover" | "blur") => void;
  onAutoDetect?: () => void;
}

type CategoryTab = "all" | "social" | "video" | "cinema" | "photo";

export default function RatioPanel({
  open,
  onClose,
  activeRatio,
  onRatioChange,
  onOpenCrop,
  activeClip,
  onUpdateActiveClip,
  showSafeZones = false,
  onToggleSafeZones,
  fitMode = "contain",
  onFitModeChange,
  onAutoDetect,
}: RatioPanelProps) {
  const isAr = getLang() === "ar";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>("all");

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open) return null;

  const currentRatioObj = ASPECT_RATIOS[activeRatio] || ASPECT_RATIOS[0];

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir={isAr ? "rtl" : "ltr"}>
        <div className="bg-card/95 backdrop-blur-2xl border border-primary/40 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span className="text-muted-foreground">{isAr ? "القياس:" : "Ratio:"}</span>
            <span className="text-primary font-black">{currentRatioObj.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
              {currentRatioObj.primaryPlatform}
            </span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {isAr ? "تغيير الأبعاد" : "Change Ratio"}
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

  const handleRotate = () => {
    if (!activeClip) return;
    playSfx("click");
    const currentRot = activeClip.rotation || 0;
    const nextRot = (currentRot + 90) % 360;
    onUpdateActiveClip({ rotation: nextRot });
  };

  const filteredRatios = ASPECT_RATIOS.filter((r) => {
    if (selectedCategory === "all") return true;
    return r.category === selectedCategory;
  });

  const categories: { id: CategoryTab; labelAr: string; labelEn: string; icon: any }[] = [
    { id: "all", labelAr: "الكل", labelEn: "All", icon: Ratio },
    { id: "social", labelAr: "منصات النشر", labelEn: "Social", icon: Smartphone },
    { id: "video", labelAr: "فيديو وشاشات", labelEn: "Video", icon: Monitor },
    { id: "cinema", labelAr: "سينما", labelEn: "Cinema", icon: Film },
    { id: "photo", labelAr: "صور", labelEn: "Photo", icon: Camera },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={isAr ? "rtl" : "ltr"}>
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[72vh] overflow-y-auto no-scrollbar pb-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl gradient-primary flex items-center justify-center shadow-sm">
              <Ratio className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-heading font-black text-sm text-foreground flex items-center gap-1.5">
                <span>{isAr ? "أبعاد وقياسات المشهد للنشر" : "Aspect Ratio & Publishing Sizing"}</span>
              </h3>
              <p className="text-[11px] text-muted-foreground font-medium">
                {currentRatioObj.label} · {isAr ? currentRatioObj.nameAr : currentRatioObj.nameEn} ({currentRatioObj.resolutionLabel})
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Auto Detect Button */}
            {onAutoDetect && (
              <button
                onClick={() => {
                  playSfx("click");
                  onAutoDetect();
                }}
                className="px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-[11px] font-bold text-foreground border border-border/60 flex items-center gap-1 transition-all active:scale-95"
                title={isAr ? "تلقائي من أبعاد المقطع الأصلي" : "Auto-detect from source video"}
              >
                <Wand2 className="w-3 h-3 text-primary" />
                <span>{isAr ? "تلقائي" : "Auto"}</span>
              </button>
            )}

            {/* Minimize to preview */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary flex items-center gap-1 text-[11px] font-bold text-foreground transition-all active:scale-90"
              title={isAr ? "إخفاء لرؤية الفيديو" : "Minimize to view canvas"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{isAr ? "معاينة" : "Preview"}</span>
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

        {/* Framing / Fitting & Canvas Style Bar */}
        <div className="bg-secondary/30 rounded-2xl p-2.5 border border-border/50 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              {isAr ? "طريقة احتواء الفيديو في الإطار" : "Framing & Canvas Fit"}
            </span>

            {/* Safe Zone Toggle */}
            {onToggleSafeZones && currentRatioObj.hasSafeZones && (
              <button
                onClick={() => {
                  playSfx("click");
                  onToggleSafeZones(!showSafeZones);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                  showSafeZones
                    ? "bg-primary/20 border-primary text-primary shadow-xs"
                    : "bg-background/80 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>{isAr ? "منطقة الأمان (Safe Zones)" : "Safe Zones Guide"}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                playSfx("click");
                onFitModeChange?.("contain");
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                fitMode === "contain"
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card/70 border-border/80 text-foreground hover:bg-secondary"
              }`}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>{isAr ? "احتواء كامل (Fit)" : "Fit Entire"}</span>
            </button>

            <button
              onClick={() => {
                playSfx("click");
                onFitModeChange?.("cover");
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                fitMode === "cover"
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card/70 border-border/80 text-foreground hover:bg-secondary"
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{isAr ? "ملء الإطار (Fill)" : "Fill Canvas"}</span>
            </button>

            <button
              onClick={() => {
                playSfx("click");
                onFitModeChange?.("blur");
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                fitMode === "blur"
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card/70 border-border/80 text-foreground hover:bg-secondary"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAr ? "خلفية بلور (Blur)" : "Blurred Mirror"}</span>
            </button>
          </div>
        </div>

        {/* Framing & Transform Quick Tools (Flip, Rotate, Crop) */}
        <div className="grid grid-cols-4 gap-2">
          {/* Flip Horizontal */}
          <button
            onClick={handleFlipH}
            disabled={!activeClip}
            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
              activeClip?.flipH ? "border-primary bg-primary/10 text-primary font-bold" : "bg-card border-border text-foreground hover:border-primary/40"
            }`}
          >
            <FlipHorizontal className="w-4 h-4" />
            <span className="text-[10px] font-bold">{isAr ? "انعكاس أفقي" : "Flip H"}</span>
          </button>

          {/* Flip Vertical */}
          <button
            onClick={handleFlipV}
            disabled={!activeClip}
            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
              activeClip?.flipV ? "border-primary bg-primary/10 text-primary font-bold" : "bg-card border-border text-foreground hover:border-primary/40"
            }`}
          >
            <FlipVertical className="w-4 h-4" />
            <span className="text-[10px] font-bold">{isAr ? "انعكاس رأسي" : "Flip V"}</span>
          </button>

          {/* Rotate 90° */}
          <button
            onClick={handleRotate}
            disabled={!activeClip}
            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
              (activeClip?.rotation || 0) % 360 !== 0 ? "border-primary bg-primary/10 text-primary font-bold" : "bg-card border-border text-foreground hover:border-primary/40"
            }`}
          >
            <RotateCw className="w-4 h-4" />
            <span className="text-[10px] font-bold">
              {isAr ? "تدوير" : "Rotate"} {activeClip?.rotation ? `${activeClip.rotation % 360}°` : "90°"}
            </span>
          </button>

          {/* Crop Tool */}
          <button
            onClick={() => {
              if (!activeClip) return;
              playSfx("click");
              onOpenCrop();
            }}
            disabled={!activeClip}
            className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-bold transition-all active:scale-95 disabled:opacity-40"
          >
            <Scissors className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-black">{isAr ? "قص حر" : "Crop"}</span>
          </button>
        </div>

        {/* Platform Categories Tab Bar */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    playSfx("click");
                    setSelectedCategory(cat.id);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Aspect Ratio Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filteredRatios.map((r) => {
              const originalIndex = ASPECT_RATIOS.findIndex((item) => item.id === r.id);
              const isActive = activeRatio === originalIndex;

              return (
                <button
                  key={r.id}
                  onClick={() => {
                    playSfx("click");
                    onRatioChange(originalIndex);
                  }}
                  className={`relative flex items-start gap-2.5 p-3 rounded-2xl border text-start transition-all active:scale-[0.98] ${
                    isActive
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/10 ring-2 ring-primary/40"
                      : "bg-card border-border hover:border-primary/30 hover:bg-secondary/40"
                  }`}
                >
                  {/* Miniature Ratio Shape Box */}
                  <div className="w-10 h-10 rounded-xl bg-black/40 border border-border flex items-center justify-center shrink-0 p-1">
                    <div
                      className={`rounded-xs transition-all ${
                        isActive ? "bg-primary" : "bg-muted-foreground/60"
                      }`}
                      style={{
                        width: r.w >= r.h ? "28px" : `${Math.max(10, Math.round(28 * (r.w / r.h)))}px`,
                        height: r.h >= r.w ? "28px" : `${Math.max(10, Math.round(28 * (r.h / r.w)))}px`,
                      }}
                    />
                  </div>

                  {/* Ratio Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-heading font-black text-sm text-foreground">
                        {r.label}
                      </span>
                      <span className="text-xs">{r.emoji}</span>
                    </div>

                    <p className="text-[11px] font-bold text-primary truncate">
                      {r.primaryPlatform}
                    </p>

                    <p className="text-[9px] text-muted-foreground truncate font-mono">
                      {r.resolutionLabel}
                    </p>
                  </div>

                  {/* Active Selected Checkmark */}
                  {isActive && (
                    <div className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                      <Check className="w-3 h-3 stroke-[3px]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
