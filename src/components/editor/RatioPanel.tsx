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
  Wand2,
  Grid,
  Rows
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
  const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel");

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open) return null;

  const currentRatioObj = ASPECT_RATIOS[activeRatio] || ASPECT_RATIOS[0];

  // Minimized/Collapsed render mode so the user can easily preview video
  if (isCollapsed) {
    return (
      <div 
        id="ratio-panel-collapsed" 
        className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none" 
        dir={isAr ? "rtl" : "ltr"}
      >
        <div className="pointer-events-auto bg-card/95 backdrop-blur-2xl border border-primary/40 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-muted-foreground">{isAr ? "القياس:" : "Ratio:"}</span>
            <span className="text-primary font-black font-mono">{currentRatioObj.label}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              {currentRatioObj.primaryPlatform}
            </span>
          </span>
          <div className="h-4 w-px bg-border/80" />
          <button 
            id="ratio-restore-btn"
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isAr ? "تعديل الأبعاد" : "Edit Ratio"}</span>
          </button>
          <button 
            id="ratio-collapsed-confirm-btn"
            onClick={() => { playSfx("success"); onClose(); }}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90 shadow-sm"
            title={isAr ? "تأكيد" : "Confirm"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button 
            id="ratio-collapsed-close-btn"
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
    <div 
      id="ratio-panel-root"
      className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-3 duration-250" 
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Mobile-optimized bottom sheet with max height constraint to never swallow the preview */}
      <div className="bg-card/95 backdrop-blur-2xl border-t border-border/80 rounded-t-3xl shadow-2xl max-h-[50vh] sm:max-h-[52vh] flex flex-col overflow-hidden pb-4">
        
        {/* Subtle top drag handle */}
        <div className="w-9 h-1 rounded-full bg-border/80 mx-auto mt-2 shrink-0" />

        {/* Compact Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl gradient-primary flex items-center justify-center shadow-xs shrink-0">
              <Ratio className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-heading font-black text-xs sm:text-sm text-foreground truncate">
                  {isAr ? "القياس ونسبة الأبعاد" : "Aspect Ratio"}
                </h3>
                <span className="text-[10px] font-black font-mono text-primary px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 shrink-0">
                  {currentRatioObj.label}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate font-medium">
                {currentRatioObj.primaryPlatform} · {currentRatioObj.resolutionLabel}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Auto Detect Button */}
            {onAutoDetect && (
              <button
                id="ratio-autodetect-btn"
                onClick={() => {
                  playSfx("click");
                  onAutoDetect();
                }}
                className="h-7 px-2 rounded-lg bg-secondary/80 hover:bg-secondary text-[10px] font-bold text-foreground border border-border/60 flex items-center gap-1 transition-all active:scale-95"
                title={isAr ? "تلقائي من أبعاد المقطع الأصلي" : "Auto-detect from source video"}
              >
                <Wand2 className="w-3 h-3 text-primary" />
                <span className="hidden xs:inline">{isAr ? "تلقائي" : "Auto"}</span>
              </button>
            )}

            {/* Minimize to preview video */}
            <button 
              id="ratio-minimize-btn"
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="h-7 px-2 rounded-lg bg-secondary/80 hover:bg-secondary flex items-center gap-1 text-[10px] font-bold text-foreground transition-all active:scale-90 border border-border/60"
              title={isAr ? "إخفاء مؤقت لرؤية الفيديو كامل" : "Minimize to view canvas"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden xs:inline">{isAr ? "معاينة" : "Preview"}</span>
            </button>

            {/* Confirm */}
            <button 
              id="ratio-confirm-btn"
              onClick={() => { playSfx("success"); onClose(); }} 
              className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white shadow-sm active:scale-90 transition-all"
              title={isAr ? "تأكيد" : "Confirm"}
            >
              <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
            </button>

            {/* Close */}
            <button 
              id="ratio-close-btn"
              onClick={() => { playSfx("click"); onClose(); }} 
              className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 active:scale-90 transition-all text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body with Clean Hierarchy */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-3.5 py-2.5 space-y-2.5">
          
          {/* Row 1: Integrated Fit Mode + Safe Zone Strip */}
          <div className="flex items-center gap-2 bg-secondary/40 p-1 rounded-xl border border-border/50">
            {/* 3-Segment Fit Switcher */}
            <div className="flex-1 grid grid-cols-3 gap-1">
              <button
                id="ratio-fit-contain-btn"
                onClick={() => {
                  playSfx("click");
                  onFitModeChange?.("contain");
                }}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  fitMode === "contain"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Minimize2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{isAr ? "احتواء كامل" : "Fit"}</span>
              </button>

              <button
                id="ratio-fit-cover-btn"
                onClick={() => {
                  playSfx("click");
                  onFitModeChange?.("cover");
                }}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  fitMode === "cover"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Maximize2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{isAr ? "ملء الإطار" : "Fill"}</span>
              </button>

              <button
                id="ratio-fit-blur-btn"
                onClick={() => {
                  playSfx("click");
                  onFitModeChange?.("blur");
                }}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  fitMode === "blur"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate">{isAr ? "خلفية بلور" : "Blur"}</span>
              </button>
            </div>

            {/* Safe Zone Toggle (if applicable) */}
            {onToggleSafeZones && currentRatioObj.hasSafeZones && (
              <button
                id="ratio-safezones-toggle-btn"
                onClick={() => {
                  playSfx("click");
                  onToggleSafeZones(!showSafeZones);
                }}
                className={`h-7 px-2 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 shrink-0 ${
                  showSafeZones
                    ? "bg-primary/20 border-primary text-primary font-black"
                    : "bg-background/80 border-border text-muted-foreground hover:text-foreground"
                }`}
                title={isAr ? "تحديد مناطق الأمان للمنصة لمنع حجب النص" : "Toggle safe zone guide overlays"}
              >
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span className="hidden xs:inline">{isAr ? "الأمان" : "Safe"}</span>
              </button>
            )}
          </div>

          {/* Row 2: Streamlined Framing & Quick Transform Actions */}
          <div className="grid grid-cols-4 gap-1.5">
            {/* Free Crop */}
            <button
              id="ratio-crop-btn"
              onClick={() => {
                if (!activeClip) return;
                playSfx("click");
                onOpenCrop();
              }}
              disabled={!activeClip}
              className="flex items-center justify-center gap-1.5 h-8 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 font-bold transition-all active:scale-95 disabled:opacity-40"
            >
              <Scissors className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-black">{isAr ? "قص حر" : "Crop"}</span>
            </button>

            {/* Rotate 90° */}
            <button
              id="ratio-rotate-btn"
              onClick={handleRotate}
              disabled={!activeClip}
              className={`flex items-center justify-center gap-1.5 h-8 rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
                (activeClip?.rotation || 0) % 360 !== 0 
                  ? "border-primary bg-primary/15 text-primary font-black" 
                  : "bg-card border-border/70 text-foreground hover:border-primary/40"
              }`}
            >
              <RotateCw className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-bold">
                {isAr ? "تدوير" : "Rotate"} {activeClip?.rotation ? `${activeClip.rotation % 360}°` : "90°"}
              </span>
            </button>

            {/* Flip Horizontal */}
            <button
              id="ratio-fliph-btn"
              onClick={handleFlipH}
              disabled={!activeClip}
              className={`flex items-center justify-center gap-1.5 h-8 rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
                activeClip?.flipH 
                  ? "border-primary bg-primary/15 text-primary font-black" 
                  : "bg-card border-border/70 text-foreground hover:border-primary/40"
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-bold">{isAr ? "أفقي" : "Flip H"}</span>
            </button>

            {/* Flip Vertical */}
            <button
              id="ratio-flipv-btn"
              onClick={handleFlipV}
              disabled={!activeClip}
              className={`flex items-center justify-center gap-1.5 h-8 rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
                activeClip?.flipV 
                  ? "border-primary bg-primary/15 text-primary font-black" 
                  : "bg-card border-border/70 text-foreground hover:border-primary/40"
              }`}
            >
              <FlipVertical className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-bold">{isAr ? "رأسي" : "Flip V"}</span>
            </button>
          </div>

          {/* Row 3: Platform Categories & View Mode Switcher */}
          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1">
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
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                  </button>
                );
              })}
            </div>

            {/* View Mode Switcher (Carousel vs Grid) */}
            <div className="flex items-center bg-secondary/50 p-0.5 rounded-lg border border-border/50 shrink-0">
              <button
                onClick={() => { playSfx("click"); setViewMode("carousel"); }}
                className={`p-1 rounded-md transition-all ${viewMode === "carousel" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"}`}
                title={isAr ? "عرض شريط أفقي مدمج" : "Carousel view"}
              >
                <Rows className="w-3 h-3" />
              </button>
              <button
                onClick={() => { playSfx("click"); setViewMode("grid"); }}
                className={`p-1 rounded-md transition-all ${viewMode === "grid" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"}`}
                title={isAr ? "عرض شبكة موسعة" : "Grid view"}
              >
                <Grid className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Row 4: Aspect Ratio Cards (Carousel or Grid) */}
          {viewMode === "carousel" ? (
            /* Horizontal Carousel - Ultra clean, zero clutter, instant one-thumb navigation */
            <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
              {filteredRatios.map((r) => {
                const originalIndex = ASPECT_RATIOS.findIndex((item) => item.id === r.id);
                const isActive = activeRatio === originalIndex;

                return (
                  <button
                    key={r.id}
                    id={`ratio-item-${r.id}`}
                    onClick={() => {
                      playSfx("click");
                      onRatioChange(originalIndex);
                    }}
                    className={`relative min-w-[90px] max-w-[100px] shrink-0 p-2 rounded-2xl border text-center flex flex-col items-center justify-between gap-1 transition-all active:scale-[0.96] ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/30"
                        : "bg-card border-border/80 hover:border-primary/30 hover:bg-secondary/40"
                    }`}
                  >
                    {/* Miniature Ratio Shape Box */}
                    <div className="w-9 h-9 rounded-xl bg-black/40 border border-border/60 flex items-center justify-center p-1">
                      <div
                        className={`rounded-xs transition-all ${
                          isActive ? "bg-primary shadow-xs" : "bg-muted-foreground/60"
                        }`}
                        style={{
                          width: r.w >= r.h ? "24px" : `${Math.max(8, Math.round(24 * (r.w / r.h)))}px`,
                          height: r.h >= r.w ? "24px" : `${Math.max(8, Math.round(24 * (r.h / r.w)))}px`,
                        }}
                      />
                    </div>

                    {/* Ratio Label & Platform */}
                    <div className="w-full min-w-0">
                      <span className="font-heading font-black text-xs text-foreground block font-mono">
                        {r.label}
                      </span>
                      <p className="text-[9px] font-bold text-muted-foreground truncate leading-tight">
                        {r.primaryPlatform}
                      </p>
                    </div>

                    {/* Active Selected Checkmark */}
                    {isActive && (
                      <div className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                        <Check className="w-2.5 h-2.5 stroke-[3px]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Grid Mode - 3 or 4 Columns */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredRatios.map((r) => {
                const originalIndex = ASPECT_RATIOS.findIndex((item) => item.id === r.id);
                const isActive = activeRatio === originalIndex;

                return (
                  <button
                    key={r.id}
                    id={`ratio-item-grid-${r.id}`}
                    onClick={() => {
                      playSfx("click");
                      onRatioChange(originalIndex);
                    }}
                    className={`relative flex items-center gap-2 p-2 rounded-xl border text-start transition-all active:scale-[0.98] ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/30"
                        : "bg-card border-border/80 hover:border-primary/30 hover:bg-secondary/40"
                    }`}
                  >
                    {/* Miniature Ratio Shape Box */}
                    <div className="w-8 h-8 rounded-lg bg-black/40 border border-border/60 flex items-center justify-center shrink-0 p-1">
                      <div
                        className={`rounded-xs transition-all ${
                          isActive ? "bg-primary" : "bg-muted-foreground/60"
                        }`}
                        style={{
                          width: r.w >= r.h ? "20px" : `${Math.max(7, Math.round(20 * (r.w / r.h)))}px`,
                          height: r.h >= r.w ? "20px" : `${Math.max(7, Math.round(20 * (r.h / r.w)))}px`,
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-black text-xs text-foreground block font-mono">
                        {r.label}
                      </span>
                      <p className="text-[9px] font-bold text-muted-foreground truncate">
                        {r.primaryPlatform}
                      </p>
                    </div>

                    {isActive && (
                      <div className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[3px]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
