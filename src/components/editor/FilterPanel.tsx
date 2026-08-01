import { useState, useEffect, useMemo, memo, useRef, useCallback } from "react";
import { useMedia, FilterType, FilterItem } from "@/context/MediaContext";
import { 
  X, Palette, Trash2, Sliders, Sparkles, Check, Flame, 
  Tv, Film, Sun, Compass, RotateCw, Megaphone, HelpCircle, Eye, EyeOff 
} from "lucide-react";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

interface Props { open: boolean; onClose: () => void; currentTime: number; }

// Lightweight dynamic color swatch grid showing how each filter shifts standard colors in real-time
const ColorSwatchGrid = memo(({ cssFilter }: { cssFilter: string }) => {
  return (
    <div 
      className="absolute inset-0 transition-all duration-300"
      style={{ 
        background: "linear-gradient(135deg, #f0a98b 0%, #38bdf8 33%, #f59e0b 66%, #22c55e 100%)",
        filter: cssFilter,
        transform: "translate3d(0,0,0)",
        willChange: "filter"
      }}
    />
  );
});

// Upgraded Filter Library metadata with premium badges, labels, and beautiful color theme configs (Optimized WebP thumbnails)
const FILTER_LIB: { 
  type: FilterType; 
  label: string; 
  labelEn: string; 
  color: string; 
  preview: string; 
  icon: string;
  badge?: string;
  badgeEn?: string;
  characterImg?: string;
  cssFilter: string;
}[] = [
  { 
    type: "warm",       
    label: "سينمائي دافئ",  
    labelEn: "Cinema Warm",  
    color: "#f97316", 
    preview: "linear-gradient(135deg, #fb923c, #f97316)", 
    icon: "🌅", 
    badge: "شائع", 
    badgeEn: "TRENDING",
    characterImg: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "sepia(0.35) saturate(1.25) contrast(1.1) brightness(1.02)"
  },
  { 
    type: "cool",       
    label: "جليد بارد",    
    labelEn: "Cool Arctic",  
    color: "#06b6d4", 
    preview: "linear-gradient(135deg, #0ea5e9, #06b6d4)", 
    icon: "❄️", 
    badge: "عصري", 
    badgeEn: "NEW",
    characterImg: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "saturate(0.85) hue-rotate(180deg) brightness(1.08)"
  },
  { 
    type: "dramatic",   
    label: "دراما هوليوود", 
    labelEn: "Cine Dramatic",
    color: "#ef4444", 
    preview: "linear-gradient(135deg, #ef4444, #7f1d1d)", 
    icon: "🎬", 
    badge: "سينما", 
    badgeEn: "PRO",
    characterImg: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "contrast(1.35) saturate(1.1) brightness(0.92)"
  },
  { 
    type: "vintage",    
    label: "فينتج كلاسيك",  
    labelEn: "Classic Film", 
    color: "#a78bfa", 
    preview: "linear-gradient(135deg, #a78bfa, #581c87)", 
    icon: "📷", 
    badge: "عتيق", 
    badgeEn: "RETRO",
    characterImg: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "sepia(0.45) contrast(0.95) brightness(0.92)"
  },
  { 
    type: "noir",       
    label: "سينما نوار",   
    labelEn: "Noir Retro",   
    color: "#374151", 
    preview: "linear-gradient(135deg, #4b5563, #111827)", 
    icon: "🎭", 
    badge: "أسود/أبيض", 
    badgeEn: "CLASSIC",
    characterImg: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "grayscale(1) contrast(1.25) brightness(0.95)"
  },
  { 
    type: "dream",      
    label: "خيال حالم",    
    labelEn: "Dreamy Glow",  
    color: "#f0abfc", 
    preview: "linear-gradient(135deg, #f0abfc, #a21caf)", 
    icon: "🔮", 
    badge: "حالم", 
    badgeEn: "SOFT",
    characterImg: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "blur(0.6px) brightness(1.12) saturate(1.15)"
  },
  { 
    type: "neon",       
    label: "طوكيو نيون",   
    labelEn: "Tokyo Neon",   
    color: "#22d3ee", 
    preview: "linear-gradient(135deg, #22d3ee, #d946ef)", 
    icon: "🏙️", 
    badge: "سايبر", 
    badgeEn: "NEON",
    characterImg: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "hue-rotate(275deg) saturate(1.5) contrast(1.15)"
  },
  { 
    type: "sepia",      
    label: "سيبيا كلاسيكي", 
    labelEn: "Sepia Vintage",
    color: "#d97706", 
    preview: "linear-gradient(135deg, #d97706, #78350f)", 
    icon: "🍂", 
    badge: "مفضل", 
    badgeEn: "BEST",
    characterImg: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "sepia(0.85) contrast(1.05) brightness(0.95)"
  },
  { 
    type: "sepia-blue", label: "سيبيا زرقاء",   
    labelEn: "Sepia Sapphire",
    color: "#3b82f6", 
    preview: "linear-gradient(135deg, #3b82f6, #1e3a8a)", 
    icon: "🔵", 
    badge: "فريد", 
    badgeEn: "COOL",
    characterImg: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "sepia(0.6) hue-rotate(135deg) contrast(1.1) brightness(0.98)"
  },
  { 
    type: "duotone",    
    label: "ثنائي اللون",   
    labelEn: "Duotone FX",   
    color: "#8b5cf6", 
    preview: "linear-gradient(135deg, #7c2d12, #8b5cf6)", 
    icon: "🎨", 
    badge: "تأثير", 
    badgeEn: "ART",
    characterImg: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "contrast(1.4) grayscale(1) sepia(0.4) hue-rotate(215deg) brightness(1.02)"
  },
  { 
    type: "grayscale",  
    label: "رمادي فاخر",    
    labelEn: "Lux B&W",      
    color: "#9ca3af", 
    preview: "linear-gradient(135deg, #9ca3af, #374151)", 
    icon: "⬜", 
    badge: "كلاسيك", 
    badgeEn: "MONO",
    characterImg: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "grayscale(1) contrast(1.15) brightness(0.98)"
  },
  { 
    type: "fade-edge",  
    label: "حواف ناعمة",   
    labelEn: "Fade Vignette",
    color: "#fbbf24", 
    preview: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.85))", 
    icon: "🔲", 
    badge: "حواف", 
    badgeEn: "VIGNETTE",
    characterImg: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "brightness(0.88) contrast(1.12)"
  },
  { 
    type: "brightness", label: "إضاءة ساطعة",   
    labelEn: "High Light",   
    color: "#f59e0b", 
    preview: "linear-gradient(135deg, #fbbf24, #f59e0b)", 
    icon: "☀️", 
    badge: "تعديل", 
    badgeEn: "ADJUST",
    characterImg: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "brightness(1.28)"
  },
  { 
    type: "contrast",   
    label: "تباين قوي",    
    labelEn: "Strong Contrast",
    color: "#6366f1", 
    preview: "linear-gradient(135deg, #818cf8, #6366f1)", 
    icon: "🔳", 
    badge: "تباين", 
    badgeEn: "CONTRAST",
    characterImg: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "contrast(1.42)"
  },
  { 
    type: "saturate",   
    label: "تشبع ألوان",    
    labelEn: "Vivid Color",  
    color: "#ec4899", 
    preview: "linear-gradient(135deg, #f472b6, #ec4899)", 
    icon: "🌈", 
    badge: "ألوان", 
    badgeEn: "VIBRANT",
    characterImg: "https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "saturate(1.75)"
  },
  { 
    type: "blur",       
    label: "عمق ضبابي",    
    labelEn: "Depth Blur",   
    color: "#818cf8", 
    preview: "linear-gradient(135deg, #c084fc, #818cf8)", 
    icon: "🌫️", 
    badge: "سينمائي", 
    badgeEn: "BLUR",
    characterImg: "https://images.unsplash.com/photo-1489980508314-941910ded1f4?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "blur(1.4px) contrast(1.05)"
  },
  { 
    type: "hue-rotate", label: "تدوير طيفي",   
    labelEn: "Hue Rotation", 
    color: "#10b981", 
    preview: "linear-gradient(135deg, #34d399, #10b981)", 
    icon: "🔄", 
    badge: "طيفي", 
    badgeEn: "SPECTRUM",
    characterImg: "https://images.unsplash.com/photo-1554151228-14d9def656e4?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "hue-rotate(115deg) contrast(1.05)"
  },
  { 
    type: "invert",     
    label: "ألوان معكوسة",  
    labelEn: "Invert Film",  
    color: "#d946ef", 
    preview: "linear-gradient(135deg, #e879f9, #d946ef)", 
    icon: "🔀", 
    badge: "فني", 
    badgeEn: "INVERT",
    characterImg: "https://images.unsplash.com/photo-1542206395-9feb3edaa68d?auto=format&fit=crop&w=100&q=40&fm=webp",
    cssFilter: "invert(1) contrast(1.1)"
  }
];

const FilterPanel = ({ open, onClose, currentTime }: Props) => {
  const en = getLang() === "en";
  const { addFilter, filters = [], setFilters, updateFilter, removeFilter, totalDuration } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<"all" | "color" | "adjust" | "manual">("all");
  const [selectedManualTool, setSelectedManualTool] = useState<string>("brightness");
  const [adjustTab, setAdjustTab] = useState<"light" | "color" | "lens">("light");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [initialFilters, setInitialFilters] = useState<FilterItem[]>([]);

  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const manualTools = useMemo(() => [
    { id: "brightness", label: en ? "Brightness" : "درجة الإضاءة", icon: Sun, min: 0.5, max: 1.5, step: 0.01, isNegativePositive: true },
    { id: "contrast", label: en ? "Contrast" : "التباين", icon: Compass, min: 0.5, max: 1.5, step: 0.01, isNegativePositive: true },
    { id: "sharpness", label: en ? "Resolution" : "رفع الدقة / الحدة", icon: Sparkles, min: 0, max: 5, step: 0.1, isNegativePositive: false },
    { id: "hslHue", label: en ? "HSL Hue" : "صبغة الألوان", icon: Palette, min: -180, max: 180, step: 1, isNegativePositive: true },
    { id: "hslSaturation", label: en ? "HSL Saturation" : "تشبع HSL", icon: Flame, min: -100, max: 100, step: 1, isNegativePositive: true },
    { id: "hslLightness", label: en ? "HSL Lightness" : "سطوع HSL", icon: Sliders, min: -100, max: 100, step: 1, isNegativePositive: true },
  ], [en]);

  const getManualValue = useCallback((field: string) => {
    const active = filters.find((f) => currentTimeRef.current >= f.start && currentTimeRef.current <= f.end);
    if (!active) {
      if (field === "brightness" || field === "contrast") return 1;
      return 0;
    }
    const val = (active as any)[field];
    if (val === undefined) {
      if (field === "brightness" || field === "contrast") return 1;
      return 0;
    }
    return val;
  }, [filters]);

  const handleManualAdjustChange = useCallback((field: string, value: number) => {
    const active = filters.find((f) => currentTimeRef.current >= f.start && currentTimeRef.current <= f.end);
    if (active) {
      updateFilter(active.id, { [field]: value });
    } else {
      const start = Math.max(0, currentTimeRef.current);
      addFilter({
        type: "brightness" as FilterType,
        start,
        end: Math.min(totalDuration, start + 4),
        intensity: 0, // so the preset doesn't apply
        brightness: 1,
        contrast: 1,
        saturation: 1,
        blur: 0,
        hueRotate: 0,
        sharpness: 0,
        hslHue: 0,
        hslSaturation: 0,
        hslLightness: 0,
        [field]: value
      });
    }
  }, [filters, totalDuration, updateFilter, addFilter]);

  // Capture original filters snapshot on open to support "Cancel / Revert"
  useEffect(() => {
    if (open) {
      setInitialFilters(filters.map(f => ({ ...f })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCancel = () => {
    playSfx("click");
    setFilters(initialFilters);
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  // Find if there is an active filter at current time (computed fast)
  const activeFilter = filters.find((f) => currentTime >= f.start && currentTime <= f.end);

  // Add or update filter
  const addNewFilter = useCallback((type: FilterType, customParams?: Partial<any>) => {
    playSfx("click");
    const start = Math.max(0, currentTimeRef.current);
    const existing = selectedId ? filters.find((f) => f.id === selectedId) : null;
    
    const baseParams = {
      type,
      start: existing ? existing.start : start,
      end: existing ? existing.end : Math.min(totalDuration, start + 4),
      intensity: existing ? existing.intensity : 0.75,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      blur: 0,
      hueRotate: 0,
      ...customParams
    };

    if (existing) {
      updateFilter(existing.id, baseParams);
      toast.success(en ? "Replaced filter preset!" : "تم تغيير الفلتر اللوني المحدد بنجاح!");
      return;
    }

    addFilter(baseParams);
    toast.success(en ? "Added new custom filter track!" : "تمت إضافة مسار مصفوفة فلتر لوني جديد أسفله!");
  }, [selectedId, filters, totalDuration, updateFilter, addFilter, en]);

  const colorFilters = useMemo(() => ["warm", "cool", "dramatic", "vintage", "noir", "dream", "neon", "sepia", "sepia-blue", "duotone"], []);
  const shown = useMemo(() => {
    return FILTER_LIB.filter((f) => 
      activeCategory === "all" ? true : activeCategory === "color" ? colorFilters.includes(f.type) : !colorFilters.includes(f.type)
    );
  }, [activeCategory, colorFilters]);

  // Optimize Grid Layout with useMemo to prevent 60fps repaints during video play tick
  const renderedGrid = useMemo(() => {
    return (
      <div className="grid grid-cols-3 gap-2.5">
        {shown.map((f) => {
          const isActive = filters.some((af) => af.type === f.type);
          const badge = en ? f.badgeEn : f.badge;
          return (
            <button 
              key={f.type} 
              onClick={() => addNewFilter(f.type)}
              className={`relative aspect-square flex flex-col justify-end items-stretch rounded-2xl overflow-hidden border-2 transition-all duration-300 active:scale-95 hover:scale-[1.03] ${
                isActive 
                   ? "border-primary glow-primary-sm ring-1 ring-primary/20" 
                   : "border-border/40 hover:border-primary/40 bg-card"
              }`}
            >
              {/* Color Swatch Grid representing the filter effect dynamically! */}
              <ColorSwatchGrid cssFilter={f.cssFilter} />

              {/* Gradient Overlay for subtitle legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/5 pointer-events-none" />

              {/* Filter Icon & Emoji Style at top-right */}
              <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/75 flex items-center justify-center text-xs shadow-sm">
                {f.icon}
              </div>

              {/* Premium Tag Corner Badge */}
              {badge && (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-[4px] text-[7px] font-extrabold uppercase bg-black/85 text-white tracking-wider border border-white/5">
                  {badge}
                </span>
              )}

              {/* Active Checkmark overlay */}
              {isActive && (
                <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg gradient-primary flex items-center justify-center shadow-lg animate-scale-in z-20 border border-white/20">
                  <Check className="w-3.5 h-3.5 text-white stroke-[3.5px]" />
                </div>
              )}

              {/* Label */}
              <div className="relative px-2 py-1.5 text-center bg-black/80 border-t border-white/5">
                <p className="text-[9px] font-extrabold text-white leading-tight truncate">
                  {en ? f.labelEn : f.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }, [shown, filters, en, addNewFilter]);

  // Optimize Advanced Multi-Slider Customization Console with useMemo
  const renderedTuningConsole = useMemo(() => {
    if (filters.length === 0) return null;

    return (
      <div className="space-y-3 bg-secondary/20 rounded-2xl p-4 border border-border/40 animate-fade-in">
        <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-1">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary animate-pulse" />
            <p className="text-[11px] font-extrabold text-foreground">
              {en ? "Filter Tuning Console" : "وحدة التحكم والضبط الفائق للفلتر"} ({filters.length})
            </p>
          </div>
          <span className="text-[8px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-extrabold">
            {en ? "REALTIME ENGINE" : "تفاعل فوري"}
          </span>
        </div>

        {filters.map((f) => {
          const lib = FILTER_LIB.find((l) => l.type === f.type);
          const isFocused = selectedId === f.id;

          // Set defaults if not present
          const intensityVal = f.intensity;
          const brightnessVal = f.brightness !== undefined ? f.brightness : 1;
          const contrastVal = f.contrast !== undefined ? f.contrast : 1;
          const saturationVal = f.saturation !== undefined ? f.saturation : 1;
          const warmthVal = f.hueRotate !== undefined ? f.hueRotate : 0;
          const blurVal = f.blur !== undefined ? f.blur : 0;

          const applyPresetAdjuster = (preset: string) => {
            playSfx("click");
            if (preset === "reset") {
              updateFilter(f.id, { brightness: 1, contrast: 1, saturation: 1, hueRotate: 0, blur: 0, intensity: 0.75 });
              toast.success(en ? "Reset filter adjustments" : "تمت إعادة ضبط الفلتر للافتراضي");
            } else if (preset === "cine") {
              updateFilter(f.id, { brightness: 1.05, contrast: 1.2, saturation: 1.15, hueRotate: 5, blur: 0 });
              toast.success(en ? "Applied Cinematic preset adjustments" : "تم تطبيق مظهر السينما الاحترافي");
            } else if (preset === "dreamy") {
              updateFilter(f.id, { brightness: 1.15, contrast: 0.9, saturation: 1.05, hueRotate: -10, blur: 1.8 });
              toast.success(en ? "Applied Dreamy Soft preset adjustments" : "تم تطبيق التوهج الحالم الناعم");
            } else if (preset === "moody") {
              updateFilter(f.id, { brightness: 0.85, contrast: 1.35, saturation: 0.7, hueRotate: 15, blur: 0 });
              toast.success(en ? "Applied Dark Moody preset adjustments" : "تم تطبيق المظهر الدرامي القاتم");
            }
          };

          return (
            <div 
              key={f.id} 
              className={`p-3.5 rounded-2xl border transition-all duration-200 ${
                isFocused 
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-md" 
                  : "border-border bg-card/60 hover:bg-card/90"
              }`}
            >
              {/* Card Header & Compact Toggle */}
              <div 
                onClick={() => { playSfx("click"); setSelectedId(isFocused ? null : f.id); }}
                className="flex items-center justify-between cursor-pointer mb-2"
              >
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-9 h-9 rounded-xl overflow-hidden border border-border/50 flex items-center justify-center shadow" 
                    style={{ background: lib?.preview }}
                  >
                    <span className="text-lg">{lib?.icon}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold text-foreground">
                      {en ? lib?.labelEn : lib?.label}
                    </p>
                    <p className="text-[9px] text-muted-foreground/80 font-bold">
                      {(f.end - f.start).toFixed(1)}s · {en ? "Applied On Track" : "مطبّق على المسار"}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      playSfx("swipe"); 
                      removeFilter(f.id); 
                      if (selectedId === f.id) setSelectedId(null); 
                    }} 
                    className="w-7 h-7 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-all active:scale-90"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                  <span className="text-[9px] bg-secondary font-bold text-foreground px-2 py-0.5 rounded-md">
                    {isFocused ? (en ? "Collapse" : "طي") : (en ? "Expand" : "ضبط دقيق")}
                  </span>
                </div>
              </div>

              {/* Advanced Adjustments Controls Panel */}
              {isFocused && (
                <div className="space-y-3.5 pt-2 border-t border-border/40 mt-3 animate-fade-in">
                  
                  {/* 1. Filter General Intensity (القوة العامة) - Always Visible for Easy Tuning */}
                  <div className="space-y-1 bg-secondary/10 p-2 rounded-xl border border-border/20">
                    <div className="flex justify-between items-center text-[9px] font-extrabold text-muted-foreground">
                      <span className="flex items-center gap-1"><Sliders className="w-3 h-3 text-primary animate-pulse" /> {en ? "Filter Master Intensity" : "قوة التأثير العامة للفلتر"}</span>
                      <span className="text-primary font-mono">{Math.round(intensityVal * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range" min={0} max={1} step={0.01} value={intensityVal}
                        onChange={(e) => updateFilter(f.id, { intensity: parseFloat(e.target.value) })}
                        className="flex-1 h-1.5 accent-primary bg-secondary rounded-lg cursor-pointer" 
                        dir="ltr" 
                      />
                    </div>
                  </div>

                  {/* Category Selector Tabs for Fine-Tuning */}
                  <div className="flex gap-1 p-1 bg-black/25 rounded-xl border border-white/5">
                    {[
                      { id: "light", label: en ? "Lighting" : "الإضاءة", icon: Sun },
                      { id: "color", label: en ? "Color Tone" : "درجات الألوان", icon: Palette },
                      { id: "lens", label: en ? "Lens & Presets" : "مؤثرات العدسة", icon: Sparkles }
                    ].map((t) => {
                      const TabIcon = t.icon;
                      const isSelected = adjustTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => { playSfx("click"); setAdjustTab(t.id as any); }}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[9px] font-bold transition-all duration-150 ${
                            isSelected 
                              ? "bg-white text-black shadow-sm" 
                              : "text-muted-foreground hover:bg-white/5"
                          }`}
                        >
                          <TabIcon className="w-3 h-3" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sliders Content depending on the selected Tab */}
                  {adjustTab === "light" && (
                    <div className="space-y-3 animate-fade-in">
                      {/* 2. Brightness Adjustment Slider (السطوع الرقمي) */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-extrabold text-muted-foreground">
                          <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-amber-500" /> {en ? "Brightness" : "السطوع الرقمي"}</span>
                          <span className="font-mono">{Math.round((brightnessVal - 1) * 100)}%</span>
                        </div>
                        <input 
                          type="range" min={0.5} max={1.5} step={0.02} value={brightnessVal}
                          onChange={(e) => updateFilter(f.id, { brightness: parseFloat(e.target.value) })}
                          className="w-full h-1.5 accent-amber-500 bg-secondary rounded-lg cursor-pointer" 
                          dir="ltr" 
                        />
                      </div>

                      {/* 3. Contrast Adjustment Slider (تباين الإضاءة) */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-extrabold text-muted-foreground">
                          <span className="flex items-center gap-1"><Compass className="w-3 h-3 text-indigo-500" /> {en ? "Contrast" : "مستوى التباين"}</span>
                          <span className="font-mono">{Math.round((contrastVal - 1) * 100)}%</span>
                        </div>
                        <input 
                          type="range" min={0.5} max={1.5} step={0.02} value={contrastVal}
                          onChange={(e) => updateFilter(f.id, { contrast: parseFloat(e.target.value) })}
                          className="w-full h-1.5 accent-indigo-500 bg-secondary rounded-lg cursor-pointer" 
                          dir="ltr" 
                        />
                      </div>
                    </div>
                  )}

                  {adjustTab === "color" && (
                    <div className="space-y-3 animate-fade-in">
                      {/* 4. Saturation Adjustment Slider (تشبع اللون) */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-extrabold text-muted-foreground">
                          <span className="flex items-center gap-1"><Palette className="w-3 h-3 text-pink-500" /> {en ? "Saturation" : "درجة التشبع الفني"}</span>
                          <span className="font-mono">{Math.round(saturationVal * 100)}%</span>
                        </div>
                        <input 
                          type="range" min={0} max={2} step={0.02} value={saturationVal}
                          onChange={(e) => updateFilter(f.id, { saturation: parseFloat(e.target.value) })}
                          className="w-full h-1.5 accent-pink-500 bg-secondary rounded-lg cursor-pointer" 
                          dir="ltr" 
                        />
                      </div>

                      {/* 5. Temperature / Warmth Offset (حرارة اللون) */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-extrabold text-muted-foreground">
                          <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> {en ? "Warmth / Hue Shift" : "درجة حرارة اللون والصبغة"}</span>
                          <span className="font-mono">{warmthVal}°</span>
                        </div>
                        <input 
                          type="range" min={-90} max={90} step={1} value={warmthVal}
                          onChange={(e) => updateFilter(f.id, { hueRotate: parseInt(e.target.value) })}
                          className="w-full h-1.5 accent-orange-500 bg-secondary rounded-lg cursor-pointer" 
                          dir="ltr" 
                        />
                      </div>
                    </div>
                  )}

                  {adjustTab === "lens" && (
                    <div className="space-y-3 animate-fade-in">
                      {/* 6. Blur / Focus Adjuster (ضبابية المشهد) */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-extrabold text-muted-foreground">
                          <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3 text-purple-400" /> {en ? "Soft Blur" : "تنعيم المشهد / الضبابية"}</span>
                          <span className="font-mono">{blurVal.toFixed(1)}px</span>
                        </div>
                        <input 
                          type="range" min={0} max={6} step={0.1} value={blurVal}
                          onChange={(e) => updateFilter(f.id, { blur: parseFloat(e.target.value) })}
                          className="w-full h-1.5 accent-purple-400 bg-secondary rounded-lg cursor-pointer" 
                          dir="ltr" 
                        />
                      </div>

                      {/* Quick Tuning Preset Shortcuts */}
                      <div className="pt-2 border-t border-border/40">
                        <p className="text-[8px] font-bold text-muted-foreground uppercase mb-1.5">{en ? "Quick Tuning Style presets" : "أنماط سريعة للتوليف الفائق"}</p>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { id: "reset", label: en ? "Default" : "افتراضي إعادة ضبط" },
                            { id: "cine", label: en ? "Cinematic LUT" : "سينمائي ناصع" },
                            { id: "dreamy", label: en ? "Soft Dream" : "توهج حالم" },
                            { id: "moody", label: en ? "Moody Dark" : "دراما قاتمة" }
                          ].map((p) => (
                            <button
                              key={p.id}
                              onClick={() => applyPresetAdjuster(p.id)}
                              className="px-2 py-1 rounded bg-secondary hover:bg-secondary-hover text-[8px] font-extrabold text-foreground transition-all active:scale-95"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          );
        })}
      </div>
    );
  }, [filters, selectedId, adjustTab, en, removeFilter, updateFilter]);

  const renderedManualPanel = useMemo(() => {
    // Dynamic dependency to re-calculate sliders when active filter boundary changes
    const _activeId = activeFilter?.id;
    const selectedToolObj = manualTools.find((t) => t.id === selectedManualTool) || manualTools[0];
    const ToolIcon = selectedToolObj.icon;
    const currentVal = getManualValue(selectedToolObj.id);

    // Format current val display nicely
    let formattedVal = "";
    if (selectedToolObj.id === "brightness" || selectedToolObj.id === "contrast") {
      const diff = Math.round((currentVal - 1) * 100);
      formattedVal = diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0% (Default)";
    } else if (selectedToolObj.id === "sharpness") {
      formattedVal = currentVal > 0 ? `+${Math.round(currentVal * 20)}%` : "0% (Off)";
    } else if (selectedToolObj.id === "hslHue") {
      formattedVal = currentVal > 0 ? `+${currentVal}°` : currentVal < 0 ? `${currentVal}°` : "0°";
    } else {
      formattedVal = currentVal > 0 ? `+${currentVal}%` : currentVal < 0 ? `${currentVal}%` : "0%";
    }

    return (
      <div className="space-y-5 animate-fade-in">
        {/* Row of circular buttons */}
        <div className="flex justify-between items-center overflow-x-auto no-scrollbar gap-2 py-3 px-1">
          {manualTools.map((tool) => {
            const IsActive = selectedManualTool === tool.id;
            const IconComponent = tool.icon;
            const toolVal = getManualValue(tool.id);
            const isModified = tool.id === "brightness" || tool.id === "contrast" ? toolVal !== 1 : toolVal !== 0;

            return (
              <button
                key={tool.id}
                onClick={() => { playSfx("click"); setSelectedManualTool(tool.id); }}
                className="flex flex-col items-center gap-2 min-w-[70px] cursor-pointer shrink-0 group"
              >
                <div 
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 relative ${
                    IsActive 
                      ? "gradient-primary text-white scale-110 shadow-lg ring-4 ring-primary/20" 
                      : "bg-secondary text-muted-foreground border border-border/40 hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <IconComponent className={`w-6 h-6 transition-transform group-hover:scale-110`} />
                  
                  {/* Dot if modified */}
                  {isModified && !IsActive && (
                    <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-primary ring-2 ring-card animate-pulse" />
                  )}
                </div>
                <span className={`text-[10px] font-bold tracking-tight text-center truncate w-[72px] transition-colors ${
                  IsActive ? "text-primary font-extrabold" : "text-muted-foreground group-hover:text-foreground"
                }`}>
                  {tool.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected tool control card */}
        <div className="bg-secondary/20 rounded-2xl p-4 border border-border/40 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ToolIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-foreground">{selectedToolObj.label}</h4>
                <p className="text-[9px] text-muted-foreground">{en ? "Manual adjustment mode" : "وضع التعديل اليدوي المباشر"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-extrabold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                {formattedVal}
              </span>
              <button
                onClick={() => {
                  playSfx("click");
                  const defVal = selectedToolObj.id === "brightness" || selectedToolObj.id === "contrast" ? 1 : 0;
                  handleManualAdjustChange(selectedToolObj.id, defVal);
                }}
                className="text-[9px] font-extrabold text-muted-foreground hover:text-foreground bg-secondary px-2.5 py-1 rounded-lg transition-colors border border-border/30 active:scale-95"
              >
                {en ? "Reset" : "إعادة تعيين"}
              </button>
            </div>
          </div>

          {/* Slider input */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground font-bold">-</span>
              <input 
                type="range"
                min={selectedToolObj.min}
                max={selectedToolObj.max}
                step={selectedToolObj.step}
                value={currentVal}
                onChange={(e) => handleManualAdjustChange(selectedToolObj.id, parseFloat(e.target.value))}
                className="flex-1 h-2 accent-primary bg-secondary rounded-lg cursor-pointer transition-all hover:scale-[1.01]"
                dir="ltr"
              />
              <span className="text-[10px] text-muted-foreground font-bold">+</span>
            </div>
            
            {/* Visual zero/center point tick or meter */}
            {selectedToolObj.isNegativePositive && (
              <div className="relative h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 bottom-0 bg-primary/30 transition-all"
                  style={{
                    left: "50%",
                    right: selectedToolObj.id === "brightness" || selectedToolObj.id === "contrast" 
                      ? `${50 - (currentVal - 1) * 100}%`
                      : `${50 - (currentVal / (selectedToolObj.max * 2)) * 100}%`
                  }}
                />
                <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-border/80 z-10" />
              </div>
            )}
          </div>
          
          <p className="text-[9px] text-muted-foreground/80 leading-relaxed font-bold">
            {en 
              ? "All changes are applied in real-time to the current segment track and will be synchronized when exporting."
              : "يتم تطبيق جميع التعديلات في الوقت الفعلي على مسار المقطع المحدد وسيتم دمجها تلقائياً عند تصدير الفيديو."}
          </p>
        </div>
      </div>
    );
  }, [selectedManualTool, en, manualTools, getManualValue, handleManualAdjustChange, activeFilter]);

  if (!open) return null;

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active Filter:" : "الفلتر النشط:"}</span>
            <span className="text-primary font-extrabold">
              {activeFilter ? `${activeFilter.type.toUpperCase()}` : (en ? "None" : "لا يوجد")}
            </span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {en ? "Show Library" : "إظهار المكتبة"}
          </button>
          <button 
            onClick={() => { playSfx("success"); onClose(); }}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90"
            title={en ? "Confirm Selection" : "تأكيد الاختيار"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button 
            onClick={handleCancel}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
            title={en ? "Cancel Changes" : "تراجع وإلغاء"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-300" dir="rtl">
      <div className="bg-card border-t border-border/80 backdrop-blur-md rounded-t-3xl shadow-2xl max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Header Console */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <span className="text-sm font-bold text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Palette className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            {en ? "Professional Color Filters & LUTs" : "مؤثرات الفلاتر وتصحيح الألوان الاحترافي"}
          </span>
          <div className="flex items-center gap-2">
            {/* Collapse to see work button */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90"
              title={en ? "Minimize library to preview work" : "إخفاء لرؤية العمل"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            <button 
              onClick={() => { playSfx("success"); onClose(); }} 
              className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
              title={en ? "Confirm Selection" : "تأكيد الاختيار"}
            >
              <Check className="w-4 h-4 text-white stroke-[3px]" />
            </button>
            <button 
              onClick={handleCancel} 
              className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-all active:scale-90"
              title={en ? "Cancel Changes" : "تراجع وإلغاء"}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* Categories Selector */}
          <div className="flex gap-2 p-1 bg-secondary/50 rounded-2xl border border-border/40 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: en ? "All Filters" : "كل الفلاتر", icon: Compass },
              { id: "color", label: en ? "Presets" : "تدرجات لونية", icon: Film },
              { id: "adjust", label: en ? "Creative LUTs" : "فلاتر الإدخال", icon: Tv },
              { id: "manual", label: en ? "Manual Adjust" : "تعديل يدوي", icon: Sliders }
            ].map((c) => {
              const Icon = c.icon;
              const isSelected = activeCategory === c.id;
              return (
                <button 
                  key={c.id} 
                  onClick={() => { playSfx("click"); setActiveCategory(c.id as any); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                    isSelected ? "gradient-primary text-primary-foreground shadow-md" : "hover:bg-secondary text-muted-foreground bg-transparent"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mode Indicator Banner */}
          {selectedId ? (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/30 px-3 py-2 rounded-2xl text-xs font-bold text-primary animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 animate-spin" />
                <span>{en ? "Replacing selected filter preset..." : "جاري استبدال/تعديل الفلتر المحدد في المخطط الزمني"}</span>
              </div>
              <button
                onClick={() => { playSfx("click"); setSelectedId(null); }}
                className="px-3 py-1 rounded-xl bg-card hover:bg-secondary text-foreground text-[10px] font-extrabold border border-border/60 shadow-sm transition-all active:scale-95"
              >
                {en ? "Deselect (Add New)" : "إلغاء التحديد (إضافة جديد)"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-secondary/40 border border-border/40 px-3 py-2 rounded-2xl text-[11px] font-semibold text-muted-foreground">
              <span>{en ? "Click any filter to add a new preset layer track below" : "اضغط على أي فلتر لإضافة مصفوفة فلتر جديدة أسفله بسهولة"}</span>
              <span className="text-primary font-bold text-[10px] bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                {filters.length} {en ? "Filters" : "فلاتر"}
              </span>
            </div>
          )}

          {/* Quick Remove Active Filter Button */}
          {activeFilter && (
            <button
              onClick={() => {
                playSfx("swipe");
                removeFilter(activeFilter.id);
                toast.success(en ? "Removed active luts from current playhead!" : "تمت إزالة الفلتر النشط من موضع التشغيل الحالي!");
              }}
              className="w-full py-2.5 rounded-xl border border-dashed border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-500 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{en ? "Remove Active Filter at Playhead" : "إلغاء / حذف الفلتر من موضع التشغيل الحالي"}</span>
            </button>
          )}

          {activeCategory === "manual" ? (
            renderedManualPanel
          ) : (
            <>
              {/* Grid Layout with Premium Icons and Badges */}
              {renderedGrid}

              {/* Interactive Multi-Slider Customization Console */}
              {renderedTuningConsole}
            </>
          )}

          {/* Bottom margin padding */}
          <div className="pt-2"></div>

        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
