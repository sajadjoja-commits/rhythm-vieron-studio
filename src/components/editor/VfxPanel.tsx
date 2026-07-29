import { useState, useRef, useEffect, useCallback } from "react";
import { useMedia, VfxType } from "@/context/MediaContext";
import { X, Sparkles, Trash2, Plus, Check, Eye, EyeOff, Megaphone, Flame } from "lucide-react";
import { t, getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

interface Props { open: boolean; onClose: () => void; currentTime: number; }

const VFX_PROMOS = [
  {
    id: "neon-cyber",
    title: "مؤثرات النيون والسيبربنك الاحترافية 🧬",
    titleEn: "Cyberpunk Neon Overlay Pack",
    desc: "توهج نيون مستقبلي متفاعل مع ضربات الموسيقى بشكل ذكي وتلقائي",
    descEn: "Futuristic glow effects that pulse and react to your video track beat",
    color: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
    badge: "مميز ونادر",
    badgeEn: "FEATURED",
    characterImg: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=150&q=70&fm=webp",
    vfxType: "rgb-split" as VfxType
  },
  {
    id: "film-burn",
    title: "تأثيرات حرق شريط الأفلاف الكلاسيكية 🎞️",
    titleEn: "Vintage Film Burns & Light Leaks",
    desc: "توهج ضوئي وحروق دافئة حقيقية تضفي لمسة فنية دافئة على المونتاج",
    descEn: "Real light leaks & warm film burns captured on 35mm physical cameras",
    color: "linear-gradient(135deg, #f59e0b 0%, #e11d48 100%)",
    badge: "الأكثر مبيعاً",
    badgeEn: "BEST SELLER",
    characterImg: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=150&q=70&fm=webp",
    vfxType: "light-leak" as VfxType
  }
];

const VFX_LIB: { type: VfxType; label: string; labelEn: string; emoji: string; color: string; desc: string; descEn: string }[] = [
  { type: "glitch",     label: "خلل",          labelEn: "Glitch",       emoji: "⚡", color: "#ec4899", desc: "تشويش رقمي", descEn: "Digital distortion" },
  { type: "shake",      label: "اهتزاز",        labelEn: "Shake",        emoji: "📳", color: "#f97316", desc: "اهتزاز أفقي", descEn: "Horizontal shake" },
  { type: "flash",      label: "فلاش",          labelEn: "Flash",        emoji: "💥", color: "#fbbf24", desc: "ومضة ضوئية", descEn: "Light burst" },
  { type: "zoom-pulse", label: "نبض تكبير",     labelEn: "Zoom Pulse",   emoji: "🔍", color: "#10b981", desc: "نبضة تكبير", descEn: "Zoom beat pulse" },
  { type: "rgb-split",  label: "فصل ألوان",     labelEn: "RGB Split",    emoji: "🌈", color: "#8b5cf6", desc: "تشتت لوني", descEn: "Color aberration" },
  { type: "vhs",        label: "VHS",           labelEn: "VHS",          emoji: "📼", color: "#a855f7", desc: "شريط قديم", descEn: "Old tape effect" },
  { type: "scan-lines", label: "خطوط مسح",      labelEn: "Scan Lines",   emoji: "📺", color: "#64748b", desc: "شاشة CRT", descEn: "CRT screen lines" },
  { type: "pixelate",   label: "بكسلة",         labelEn: "Pixelate",     emoji: "🟦", color: "#3b82f6", desc: "تقطيع بكسل", descEn: "Pixel breakup" },
  { type: "rotate-3d",  label: "دوران 3D",      labelEn: "3D Rotate",    emoji: "🔄", color: "#06b6d4", desc: "دوران ثلاثي", descEn: "3D rotation" },
  { type: "particles",  label: "جزيئات",        labelEn: "Particles",    emoji: "✨", color: "#f59e0b", desc: "جسيمات متطايرة", descEn: "Flying particles" },
  { type: "light-leak", label: "تسريب ضوء",     labelEn: "Light Leak",   emoji: "🌅", color: "#fb923c", desc: "انتشار ضوئي", descEn: "Light leak effect" },
  { type: "film-grain", label: "حبيبات فيلم",   labelEn: "Film Grain",   emoji: "🎞️", color: "#78716c", desc: "حبيبات فيلم سينمائي", descEn: "Cinematic film grain" },
  { type: "chromatic",  label: "كروماتيك",      labelEn: "Chromatic",    emoji: "🎭", color: "#e11d48", desc: "انزياح كروماتيكي", descEn: "Chromatic aberration" },
  { type: "shake-v",    label: "اهتزاز عمودي",  labelEn: "V-Shake",      emoji: "↕️", color: "#f43f5e", desc: "اهتزاز رأسي", descEn: "Vertical shake" },
  { type: "bounce",     label: "ارتداد",        labelEn: "Bounce",       emoji: "🏀", color: "#22d3ee", desc: "حركة ارتداد", descEn: "Bounce motion" },
  { type: "swing",      label: "تأرجح",         labelEn: "Swing",        emoji: "🎡", color: "#84cc16", desc: "تأرجح إيقاعي", descEn: "Rhythmic swing" },
  { type: "heartbeat",  label: "نبض القلب",     labelEn: "Heartbeat",    emoji: "❤️", color: "#ef4444", desc: "نبض حيوي", descEn: "Vital heartbeat" },
  { type: "prism",      label: "منشور",         labelEn: "Prism",        emoji: "🔮", color: "#d946ef", desc: "تشتيت منشوري", descEn: "Prism dispersion" },
  { type: "crt-scanner", label: "شاشة CRT",      labelEn: "CRT Scan",     emoji: "📼", color: "#00ffcc", desc: "شاشة ريترو أنالوج", descEn: "Retro CRT phosphor mask" },
  { type: "radial-lens-flare", label: "وهج عدسة", labelEn: "Lens Flare",   emoji: "🌟", color: "#ffaa00", desc: "وهج سينمائي أنامورفيك", descEn: "Anamorphic lens flare" },
  { type: "motion-blur-streak", label: "سحب زوم", labelEn: "Zoom Blur",    emoji: "🌀", color: "#38bdf8", desc: "سحب حركي سينمائي", descEn: "Dynamic radial blur streak" },
  { type: "vintage-sepia-bloom", label: "بلوم سينمائي", labelEn: "Sepia Bloom", emoji: "🌇", color: "#f59e0b", desc: "بلوم دافئ بلمسة سينمائية", descEn: "Warm vintage bloom" },
];

const W = 72, H = 44;

function renderVfxFrame(ctx: CanvasRenderingContext2D, type: VfxType, p: number, color: string) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f172a"); bg.addColorStop(1, "#1e293b");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1e3a5f30"; ctx.fillRect(4, 8, W - 8, H - 16);
  const sin = Math.sin(p * Math.PI * 2);
  switch (type) {
    case "glitch": {
      for (let i = 0; i < 4; i++) {
        const y = (H / 4) * i; const xOff = Math.sin(i * 2.3 + p * 15) * 8 * p;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#ff004040"; ctx.fillRect(xOff + 2, y, W - 4, H / 4);
        ctx.fillStyle = "#00ffff40"; ctx.fillRect(-xOff + 2, y, W - 4, H / 4);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color; ctx.globalAlpha = 0.3 + p * 0.4;
      ctx.fillRect(W / 4, H / 4, W / 2, H / 2); ctx.globalAlpha = 1; break;
    }
    case "shake": {
      const offX = sin * 6 * p;
      ctx.save(); ctx.translate(offX, 0);
      ctx.fillStyle = color + "44"; ctx.fillRect(4, 8, W - 8, H - 16); ctx.restore();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5 + p * 0.5;
      ctx.strokeRect(4 + offX, 8, W - 8, H - 16); ctx.globalAlpha = 1; break;
    }
    case "flash": {
      ctx.fillStyle = "#ffffff"; ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; break;
    }
    case "zoom-pulse": {
      const scale = 1 + Math.sin(p * Math.PI * 2) * 0.15;
      ctx.save(); ctx.translate(W/2, H/2); ctx.scale(scale, scale); ctx.translate(-W/2, -H/2);
      ctx.fillStyle = color + "55"; ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore(); break;
    }
    case "rgb-split": {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#ff0040"; ctx.fillRect(4 + p * 6, 8, W - 8, H - 16);
      ctx.fillStyle = "#00ffff"; ctx.fillRect(4 - p * 6, 8, W - 8, H - 16);
      ctx.fillStyle = color + "40"; ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.globalAlpha = 1; break;
    }
    case "vhs": {
      for (let y = 0; y < H; y += 3) {
        const noise = (Math.sin(y * 0.3 + p * 10) * 0.5 + 0.5) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${noise})`; ctx.fillRect(0, y, W, 1);
      }
      ctx.fillStyle = color + "33"; ctx.fillRect(0, H * 0.3, W, H * 0.1); break;
    }
    case "scan-lines": {
      for (let y = 0; y < H; y += 2) { ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, y, W, 1); }
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
      ctx.strokeRect(2, 4, W - 4, H - 8); ctx.globalAlpha = 1; break;
    }
    case "pixelate": {
      const sz = Math.max(2, Math.round((1 - p) * 10 + 2));
      for (let y = 0; y < H; y += sz) for (let x = 0; x < W; x += sz) {
        ctx.fillStyle = color; ctx.globalAlpha = 0.2 + Math.random() * 0.5; ctx.fillRect(x, y, sz - 1, sz - 1);
      }
      ctx.globalAlpha = 1; break;
    }
    case "rotate-3d": {
      ctx.save(); ctx.translate(W/2, H/2); ctx.transform(1, 0, sin * 0.3, 1 - Math.abs(sin) * 0.2, 0, 0); ctx.translate(-W/2, -H/2);
      ctx.fillStyle = color + "66"; ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore(); break;
    }
    case "particles": {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + p * 3; const r = 10 + p * 12;
        ctx.fillStyle = color; ctx.globalAlpha = 0.7 - p * 0.5;
        ctx.beginPath(); ctx.arc(W/2 + Math.cos(ang)*r, H/2 + Math.sin(ang)*r, 1.5, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1; break;
    }
    case "light-leak": {
      const grad = ctx.createRadialGradient(W * p, H * 0.3, 0, W * p, H * 0.3, W * 0.6);
      grad.addColorStop(0, color + "cc"); grad.addColorStop(0.5, color + "44"); grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad; ctx.globalAlpha = 0.8; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; break;
    }
    case "film-grain": {
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000"; ctx.globalAlpha = Math.random() * 0.4;
        ctx.fillRect(Math.random()*W, Math.random()*H, 1, 1);
      }
      ctx.globalAlpha = 1; break;
    }
    case "chromatic": {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#ff000066"; ctx.fillRect(4 + sin * 4, 8, W - 8, H - 16);
      ctx.fillStyle = "#00ff0066"; ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.fillStyle = "#0000ff66"; ctx.fillRect(4 - sin * 4, 8, W - 8, H - 16);
      ctx.globalAlpha = 1; break;
    }
    case "shake-v": {
      const offY = sin * 6 * p;
      ctx.save(); ctx.translate(0, offY);
      ctx.fillStyle = color + "44"; ctx.fillRect(4, 8, W - 8, H - 16); ctx.restore();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5 + p * 0.5;
      ctx.strokeRect(4, 8 + offY, W - 8, H - 16); ctx.globalAlpha = 1; break;
    }
    case "bounce": {
      const bounce = Math.abs(sin) * 6;
      ctx.save(); ctx.translate(0, bounce);
      ctx.fillStyle = color + "55"; ctx.fillRect(4, 8 - bounce, W - 8, H - 16);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(4, 8 - bounce, W - 8, H - 16);
      ctx.restore(); break;
    }
    case "swing": {
      const angle = sin * 0.2;
      ctx.save(); ctx.translate(W/2, 4); ctx.rotate(angle); ctx.translate(-W/2, -4);
      ctx.fillStyle = color + "55"; ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore(); break;
    }
    case "heartbeat": {
      const pulse = 1 + (Math.sin(p * Math.PI * 4) > 0.7 ? 0.08 : 0) * p;
      ctx.save(); ctx.translate(W/2, H/2); ctx.scale(pulse, pulse); ctx.translate(-W/2, -H/2);
      ctx.fillStyle = color + "55"; ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore(); break;
    }
    case "prism": {
      const colors = ["#ff0040","#ff8c00","#ffd700","#00ff88","#00bfff","#8a2be2"];
      for (let i = 0; i < colors.length; i++) {
        ctx.globalAlpha = 0.4; ctx.fillStyle = colors[i];
        ctx.fillRect(4 + (i - 2.5) * 3 * p, 8, W - 8, H - 16);
      }
      ctx.globalAlpha = 1; break;
    }
    case "crt-scanner": {
      // Scanlines sweep
      ctx.fillStyle = "#00000044";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      const scanY = (p * H * 2) % H;
      ctx.fillStyle = "#00ffcc55";
      ctx.fillRect(0, scanY, W, 2);
      break;
    }
    case "radial-lens-flare": {
      const flareX = W * (0.2 + p * 0.6);
      const flareGrad = ctx.createRadialGradient(flareX, H * 0.4, 0, flareX, H * 0.4, W * 0.5);
      flareGrad.addColorStop(0, "#ffffff");
      flareGrad.addColorStop(0.3, "#ffaa0088");
      flareGrad.addColorStop(0.8, "#ff00aa33");
      flareGrad.addColorStop(1, "transparent");
      ctx.fillStyle = flareGrad;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "motion-blur-streak": {
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * p * 4;
        ctx.fillStyle = color;
        ctx.fillRect(4 + off, 8, W - 8, H - 16);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "vintage-sepia-bloom": {
      ctx.fillStyle = "#f59e0b33";
      ctx.fillRect(0, 0, W, H);
      const bloom = ctx.createRadialGradient(W/2, H/2, 2, W/2, H/2, W/2);
      bloom.addColorStop(0, "#ffffff66");
      bloom.addColorStop(1, "transparent");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.4 + p * 0.3;
  ctx.strokeRect(1, 1, W - 2, H - 2); ctx.globalAlpha = 1;
}

const VfxPreview = ({ type, color }: { type: VfxType; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0); const startRef = useRef<number>(0); const D = 1200;
  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (!startRef.current) startRef.current = ts;
    const e = (ts - startRef.current) % (D * 2);
    const raw = e < D ? e/D : 1-(e-D)/D;
    renderVfxFrame(ctx, type, raw, color);
    rafRef.current = requestAnimationFrame(animate);
  }, [type, color]);
  useEffect(() => { startRef.current = 0; rafRef.current = requestAnimationFrame(animate); return () => cancelAnimationFrame(rafRef.current); }, [animate]);
  return <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" />;
};

const VfxPanel = ({ open, onClose, currentTime }: Props) => {
  const en = getLang() === "en";
  const { addVfx, vfx, updateVfx, removeVfx, totalDuration } = useMedia();
  const [selected, setSelected] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  // Rotate ads automatically
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % VFX_PROMOS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [open]);

  if (!open) return null;

  const addNewVfx = (type: VfxType) => {
    playSfx("click");
    const start = Math.max(0, currentTime); 
    const existing = selected ? vfx.find((v) => v.id === selected) : null;
    if (existing) {
      updateVfx(existing.id, { type });
      toast.success(en ? "Replaced effect!" : "تم تغيير المؤثر البصري المحدد بنجاح!");
      return;
    }
    const end = Math.min(totalDuration, start + 2);
    addVfx({ type, start, end, intensity: 0.8 });
    toast.success(en ? "Added new effect track!" : "تم إضافة مصفوفة مؤثر بصري جديدة أسفله بنجاح!");
  };

  const handleApplyPromoAd = (promo: typeof VFX_PROMOS[0]) => {
    playSfx("success");
    addNewVfx(promo.vfxType);
    toast.success(en ? `Applied ${promo.titleEn}!` : `تم تطبيق مؤثر ${promo.title}!`);
  };

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir={en ? "ltr" : "rtl"}>
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active VFX tracks:" : "مسارات المؤثرات النشطة:"}</span>
            <span className="text-primary font-extrabold">{vfx.length}</span>
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
            onClick={() => { playSfx("click"); onClose(); }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const activePromo = VFX_PROMOS[currentAdIndex];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={en ? "ltr" : "rtl"}>
      <div className="bg-card border-t border-border rounded-t-3xl shadow-2xl max-h-[68vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
          <span className="text-sm font-bold text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            {en ? "Visual Effects Library" : "مكتبة المؤثرات البصرية والفلاتر الخاصة"}
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
              className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
              title={en ? "Confirm Selection" : "تأكيد الاختيار"}
            >
              <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
            </button>
            <button 
              onClick={() => { playSfx("click"); onClose(); }} 
              className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-all active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          
          {/* Promo Ads Campaign Slider (صور إعلانية للمؤثرات) */}
          <div className="relative rounded-2xl overflow-hidden shadow-lg border border-border/40 group transition-all duration-300 hover:scale-[1.01]">
            <div 
              className="p-4 flex flex-col justify-between min-h-[105px] relative text-white transition-all duration-500"
              style={{ background: activePromo.color }}
            >
              {/* Animated background highlights */}
              <div className="absolute right-0 bottom-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
              <div className="absolute left-12 top-0 w-20 h-20 bg-black/20 rounded-full blur-xl pointer-events-none" />

              <div className="flex justify-between items-stretch gap-4 z-10 w-full">
                {/* Promo Info */}
                <div className="flex flex-col justify-between flex-1 py-1">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white text-black tracking-widest animate-bounce">
                        {en ? activePromo.badgeEn : activePromo.badge}
                      </span>
                      <span className="text-[9px] text-white/80 font-bold flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded-full">
                        <Megaphone className="w-2.5 h-2.5 text-yellow-300 animate-pulse" />
                        {en ? "PROMO FEATURE" : "ميزة مروجة"}
                      </span>
                    </div>
                    <h4 className="text-xs font-extrabold font-heading text-white tracking-tight drop-shadow-sm">
                      {en ? activePromo.titleEn : activePromo.title}
                    </h4>
                    <p className="text-[10px] text-white/90 leading-relaxed mt-1 drop-shadow-sm max-w-[90%]">
                      {en ? activePromo.descEn : activePromo.desc}
                    </p>
                  </div>
                  
                  {/* Apply Button Inside Ad */}
                  <button 
                    onClick={() => handleApplyPromoAd(activePromo)}
                    className="px-3.5 py-1.5 rounded-full bg-white text-black hover:bg-black hover:text-white text-[9px] font-extrabold shadow-lg flex items-center gap-1 transition-all active:scale-95 duration-200 self-start mt-2"
                  >
                    <Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
                    <span>{en ? "Apply Instant" : "تطبيق فوري"}</span>
                  </button>
                </div>

                {/* Character Preview Image */}
                {activePromo.characterImg && (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden shadow-md border border-white/20 shrink-0 self-center hidden sm:block">
                    <img 
                      src={activePromo.characterImg} 
                      alt="Promo VFX concept" 
                      className="w-full h-full object-cover select-none"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute bottom-1 inset-x-0 text-center text-[7px] font-extrabold text-white tracking-wide uppercase bg-black/40">
                      {en ? "LIVE VFX" : "معاينة المؤثر"}
                    </span>
                  </div>
                )}
              </div>

              {/* Slider Dots Indicator */}
              <div className="flex justify-center gap-1 mt-2 z-10">
                {VFX_PROMOS.map((_, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => { playSfx("click"); setCurrentAdIndex(idx); }}
                    className={`h-1 rounded-full transition-all duration-300 ${idx === currentAdIndex ? "w-4 bg-white" : "w-1.5 bg-white/40"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Mode Indicator Banner */}
          {selected ? (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/30 px-3 py-2 rounded-2xl text-xs font-bold text-primary animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>{en ? "Replacing selected effect track..." : "جاري تعديل/استبدال المؤثر المحدد في المخطط الزمني"}</span>
              </div>
              <button
                onClick={() => { playSfx("click"); setSelected(null); }}
                className="px-3 py-1 rounded-xl bg-card hover:bg-secondary text-foreground text-[10px] font-extrabold border border-border/60 shadow-sm transition-all active:scale-95"
              >
                {en ? "Deselect (Add New)" : "إلغاء التحديد (إضافة جديد)"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-secondary/40 border border-border/40 px-3 py-2 rounded-2xl text-[11px] font-semibold text-muted-foreground">
              <span>{en ? "Click any effect to add a new layer track below" : "اضغط على أي مؤثر لإضافة مصفوفة جديدة أسفله بسهولة"}</span>
              <span className="text-primary font-bold text-[10px] bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                {vfx.length} {en ? "Layers" : "طبقات"}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {VFX_LIB.map((v) => (
              <button key={v.type} onClick={() => addNewVfx(v.type)}
                className="relative p-1.5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97] overflow-hidden group"
                style={{ borderColor: vfx.some((vx) => vx.type === v.type) ? v.color : undefined }}>
                <VfxPreview type={v.type} color={v.color} />
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[9px]">{v.emoji}</span>
                  <span className="text-[10px] font-bold text-foreground">{en ? v.labelEn : v.label}</span>
                </div>
                {vfx.some((vx) => vx.type === v.type) ? (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full gradient-primary flex items-center justify-center shadow-md animate-scale-in z-20 border border-white/20">
                    <Check className="w-2.5 h-2.5 text-white stroke-[3.5px]" />
                  </div>
                ) : (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow">
                    <Plus className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          {vfx.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground font-bold px-1">{en ? "Active Effects" : "مؤثرات نشطة"} ({vfx.length})</p>
              {vfx.map((v) => {
                const lib = VFX_LIB.find((l) => l.type === v.type);
                return (
                  <div key={v.id} onClick={() => setSelected(selected === v.id ? null : v.id)}
                    className={`p-3 rounded-xl bg-card border cursor-pointer transition-all ${selected === v.id ? "border-primary" : "border-border"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm" style={{ background: (lib?.color || "#3b82f6") + "22" }}>{lib?.emoji}</div>
                        <div><p className="text-[11px] font-bold text-foreground">{en ? lib?.labelEn : lib?.label}</p><p className="text-[9px] text-muted-foreground">{(v.end - v.start).toFixed(1)}s</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-primary">{Math.round(v.intensity * 100)}%</span>
                        <button onClick={(e) => { e.stopPropagation(); removeVfx(v.id); }} className="w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center"><Trash2 className="w-3 h-3 text-destructive" /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-muted-foreground shrink-0">{en ? "Intensity" : "القوة"}</span>
                      <input type="range" min={0} max={1} step={0.01} value={v.intensity}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateVfx(v.id, { intensity: parseFloat(e.target.value) })}
                        className="flex-1 accent-primary h-1" dir="ltr" style={{ accentColor: lib?.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom margin padding */}
          <div className="pt-2"></div>
        </div>
      </div>
    </div>
  );
};

export default VfxPanel;
