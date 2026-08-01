import { useState, useEffect, useRef, useCallback } from "react";
import { useMedia, TransitionType } from "@/context/MediaContext";
import { X, Play, Pause, Repeat, Check, Eye, EyeOff, Wand2 } from "lucide-react";
import { t, getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

interface Props { open: boolean; clipId: string | null; onClose: () => void; }

const TRANSITIONS: { type: TransitionType; labelKey: string; emoji: string; color: string }[] = [
  { type: "none",     labelKey: "transition.none",    emoji: "⏹",  color: "#64748b" },
  { type: "fade",    labelKey: "transition.fade",    emoji: "🌅", color: "#3b82f6" },
  { type: "dissolve",labelKey: "transition.dissolve",emoji: "💧", color: "#06b6d4" },
  { type: "slide",   labelKey: "transition.slide",   emoji: "➡",  color: "#8b5cf6" },
  { type: "zoom",    labelKey: "transition.zoom",    emoji: "🔍", color: "#10b981" },
  { type: "wipe",    labelKey: "transition.wipe",    emoji: "🧹", color: "#f59e0b" },
  { type: "blur",    labelKey: "transition.blur",    emoji: "🌫", color: "#6366f1" },
  { type: "glitch",  labelKey: "transition.glitch",  emoji: "⚡", color: "#ec4899" },
  { type: "spin",    labelKey: "transition.spin",    emoji: "🔄", color: "#f97316" },
  { type: "flash",   labelKey: "transition.flash",   emoji: "💥", color: "#fbbf24" },
  { type: "shutter", labelKey: "transition.shutter", emoji: "📷", color: "#e11d48" },
  { type: "iris",    labelKey: "transition.iris",    emoji: "👁",  color: "#7c3aed" },
  { type: "split",   labelKey: "transition.split",   emoji: "♊",  color: "#f43f5e" },
  { type: "mosaic",  labelKey: "transition.mosaic",  emoji: "▧",  color: "#14b8a6" },
  { type: "ripple",  labelKey: "transition.ripple",  emoji: "≋",  color: "#3b82f6" },
  { type: "radar",   labelKey: "transition.radar",   emoji: "⎋",  color: "#a855f7" },
  { type: "whip-pan", labelKey: "transition.whipPan", emoji: "💨", color: "#38bdf8" },
  { type: "zoom-blur", labelKey: "transition.zoomBlur", emoji: "🌀", color: "#10b981" },
  { type: "glitch-slice", labelKey: "transition.glitchSlice", emoji: "⚡", color: "#f43f5e" },
  { type: "page-flip", labelKey: "transition.pageFlip", emoji: "📖", color: "#eab308" },
];

const W = 160, H = 90;

function renderFrame(ctx: CanvasRenderingContext2D, type: TransitionType, p: number) {
  ctx.clearRect(0, 0, W, H);
  const gradA = ctx.createLinearGradient(0, 0, W, H);
  gradA.addColorStop(0, "#1e3a8a"); gradA.addColorStop(0.5, "#3b82f6"); gradA.addColorStop(1, "#60a5fa");
  const gradB = ctx.createLinearGradient(0, 0, W, H);
  gradB.addColorStop(0, "#7c2d12"); gradB.addColorStop(0.5, "#ea580c"); gradB.addColorStop(1, "#fb923c");

  switch (type) {
    case "none": ctx.fillStyle = p < 0.5 ? gradA : gradB; ctx.fillRect(0, 0, W, H); break;
    case "fade":
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = p; ctx.fillStyle = gradB; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; break;
    case "dissolve": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      const sz = 4; ctx.fillStyle = gradB;
      for (let y = 0; y < H; y += sz) for (let x = 0; x < W; x += sz) {
        if (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) < p) ctx.fillRect(x, y, sz, sz);
      }
      break;
    }
    case "slide": {
      const off = W * p;
      ctx.fillStyle = gradA; ctx.fillRect(-off, 0, W, H);
      ctx.fillStyle = gradB; ctx.fillRect(W - off, 0, W, H); break;
    }
    case "zoom": {
      const eP = Math.min(1, p * 2);
      ctx.fillStyle = gradA; ctx.save(); ctx.translate(W/2, H/2); ctx.scale(1+eP*2, 1+eP*2); ctx.translate(-W/2, -H/2); ctx.fillRect(0,0,W,H); ctx.restore();
      ctx.globalAlpha = p; ctx.fillStyle = gradB; ctx.save(); ctx.translate(W/2, H/2); ctx.scale((1-p)+p, (1-p)+p); ctx.translate(-W/2, -H/2); ctx.fillRect(0,0,W,H); ctx.restore(); ctx.globalAlpha = 1; break;
    }
    case "wipe": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      const x = W * p; ctx.fillStyle = gradB; ctx.fillRect(0, 0, x, H);
      const g = ctx.createLinearGradient(x-6, 0, x+4, 0);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.3)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(x-6, 0, 10, H); break;
    }
    case "blur": {
      ctx.fillStyle = p < 0.5 ? gradA : gradB; ctx.fillRect(0, 0, W, H);
      const ba = Math.sin(p * Math.PI) * 8;
      if (ba > 0.5) { ctx.globalAlpha = 0.3; for (let i=0; i<3; i++) { ctx.fillStyle = p<0.5?gradA:gradB; ctx.fillRect(-ba+i*ba, -ba, W+ba*2, H+ba*2); } ctx.globalAlpha = 1; }
      break;
    }
    case "glitch": {
      ctx.fillStyle = p < 0.5 ? gradA : gradB; ctx.fillRect(0, 0, W, H);
      for (let i=0; i<6; i++) {
        const y=(H/6)*i, h=H/6, off=(Math.sin(i*3.7+p*20)*12)*Math.sin(p*Math.PI);
        ctx.save(); ctx.beginPath(); ctx.rect(0,y,W,h); ctx.clip();
        ctx.globalAlpha=0.6; ctx.globalCompositeOperation="screen";
        ctx.fillStyle="#ff0040"; ctx.fillRect(off*0.7,y,W,h);
        ctx.fillStyle="#00ffff"; ctx.fillRect(-off*0.5,y,W,h);
        ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; ctx.restore();
      }
      break;
    }
    case "spin": {
      ctx.fillStyle = gradA; ctx.fillRect(0,0,W,H);
      ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(p*Math.PI*2); ctx.scale(1-p,1-p); ctx.translate(-W/2,-H/2);
      ctx.fillStyle=gradB; ctx.fillRect(0,0,W,H); ctx.restore(); break;
    }
    case "flash": {
      const fP = p<0.15?p/0.15:p<0.85?1:(1-p)/0.15;
      ctx.fillStyle=gradA; ctx.fillRect(0,0,W,H);
      ctx.globalAlpha=fP; ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1;
      if (p>0.5) { ctx.globalAlpha=(p-0.5)*2; ctx.fillStyle=gradB; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; }
      break;
    }
    case "shutter": {
      ctx.fillStyle=gradA; ctx.fillRect(0,0,W,H);
      const bH=H*(1-p), bTop=(H-bH)/2;
      ctx.fillStyle=gradB; ctx.fillRect(0,0,W,bTop); ctx.fillRect(0,H-bTop,W,bTop); break;
    }
    case "iris": {
      ctx.fillStyle=gradA; ctx.fillRect(0,0,W,H);
      const r=p*Math.sqrt(W*W+H*H);
      ctx.save(); ctx.beginPath(); ctx.arc(W/2,H/2,r,0,Math.PI*2); ctx.clip();
      ctx.fillStyle=gradB; ctx.fillRect(0,0,W,H); ctx.restore(); break;
    }
    case "split": {
      ctx.fillStyle = gradB; ctx.fillRect(0, 0, W, H);
      const halfW = W / 2;
      const off = halfW * p;
      ctx.fillStyle = gradA;
      ctx.fillRect(-off, 0, halfW, H);
      ctx.fillRect(halfW + off, 0, halfW, H);
      break;
    }
    case "mosaic": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = p; ctx.fillStyle = gradB; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      const size = Math.max(1, Math.round((1 - p) * 16));
      if (size > 1) {
        ctx.fillStyle = p < 0.5 ? gradA : gradB;
        for (let y = 0; y < H; y += size) {
          for (let x = 0; x < W; x += size) {
            if (Math.random() > p) ctx.fillRect(x, y, size, size);
          }
        }
      }
      break;
    }
    case "ripple": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = p; ctx.fillStyle = gradB; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W/2, H/2, p * 60, 0, Math.PI*2);
      ctx.stroke();
      break;
    }
    case "radar": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(W/2, H/2);
      ctx.arc(W/2, H/2, Math.sqrt(W*W+H*H), -Math.PI/2, -Math.PI/2 + p*Math.PI*2);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = gradB;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    }
    case "whip-pan": {
      const shift = W * (p < 0.5 ? p * 2 : (1 - p) * 2);
      ctx.fillStyle = p < 0.5 ? gradA : gradB;
      ctx.fillRect(-shift, 0, W, H);
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }
    case "zoom-blur": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      const scale = 1 + p * 1.5;
      ctx.save(); ctx.translate(W/2, H/2); ctx.scale(scale, scale); ctx.translate(-W/2, -H/2);
      ctx.globalAlpha = p; ctx.fillStyle = gradB; ctx.fillRect(0, 0, W, H);
      ctx.restore(); ctx.globalAlpha = 1;
      break;
    }
    case "glitch-slice": {
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      const slices = 8;
      const h = H / slices;
      ctx.fillStyle = gradB;
      for (let i = 0; i < slices; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const xOff = (1 - p) * W * dir;
        ctx.fillRect(xOff, i * h, W, h);
      }
      break;
    }
    case "page-flip": {
      ctx.fillStyle = gradB; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W * (1 - p), H); ctx.clip();
      ctx.fillStyle = gradA; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    }
    default: ctx.fillStyle=gradA; ctx.fillRect(0,0,W,H);
  }
  if (type !== "none") {
    ctx.globalAlpha=0.03;
    for (let i=0;i<400;i++) { ctx.fillStyle=Math.random()>0.5?"#fff":"#000"; ctx.fillRect(Math.random()*W,Math.random()*H,1,1); }
    ctx.globalAlpha=1;
  }
}

const CanvasPreview = ({ type, isActive }: { type: TransitionType; isActive: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const D = 1600;
  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (!startRef.current) startRef.current = ts;
    const e = (ts - startRef.current) % (D * 2);
    const raw = e < D ? e/D : 1-(e-D)/D;
    const p = raw < 0.5 ? 4*raw*raw*raw : 1-Math.pow(-2*raw+2,3)/2;
    renderFrame(ctx, type, p);
    rafRef.current = requestAnimationFrame(animate);
  }, [type]);
  useEffect(() => { startRef.current=0; rafRef.current=requestAnimationFrame(animate); return () => cancelAnimationFrame(rafRef.current); }, [animate, isActive]);
  return <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" />;
};

const LargePreview = ({ type }: { type: TransitionType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const D = 1200;
  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (!startRef.current) startRef.current = ts;
    const e = (ts - startRef.current) % (D * 2);
    const raw = e < D ? e/D : loop ? 1-(e-D)/D : 1;
    const p = raw < 0.5 ? 4*raw*raw*raw : 1-Math.pow(-2*raw+2,3)/2;
    renderFrame(ctx, type, p);
    rafRef.current = requestAnimationFrame(animate);
  }, [type, loop]);
  useEffect(() => {
    if (playing) { startRef.current=0; rafRef.current=requestAnimationFrame(animate); }
    else cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate, playing]);
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-black mb-3 relative">
      <canvas ref={canvasRef} width={W*2} height={H*2} className="w-full" />
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <button onClick={() => setPlaying(!playing)} className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
          {playing ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white" />}
        </button>
        <button onClick={() => setLoop(!loop)} className={`w-7 h-7 rounded-full backdrop-blur-sm flex items-center justify-center ${loop ? "bg-primary/70" : "bg-black/50"}`}>
          <Repeat className="w-3 h-3 text-white" />
        </button>
      </div>
    </div>
  );
};

const TransitionPanel = ({ open, clipId, onClose }: Props) => {
  const en = getLang() === "en";
  const { clips, setTransition } = useMedia();
  const clip = clips.find((c) => c.id === clipId);
  const [selected, setSelected] = useState<TransitionType>("fade");
  const [duration, setDuration] = useState(0.5);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (clip?.transitionIn) { setSelected(clip.transitionIn.type); setDuration(clip.transitionIn.duration); }
    else { setSelected("fade"); setDuration(0.5); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open || !clip) return null;

  const apply = (type: TransitionType) => { 
    setSelected(type); 
    setTransition(clip.id, { type, duration }); 
  };
  const onDuration = (d: number) => { 
    setDuration(d); 
    setTransition(clip.id, { type: selected, duration: d }); 
  };
  const selectedTr = TRANSITIONS.find((tr) => tr.type === selected);

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" dir={en ? "ltr" : "rtl"}>
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active Transition:" : "الانتقال النشط:"}</span>
            <span className="text-primary font-extrabold flex items-center gap-1">
              <span>{selectedTr?.emoji}</span>
              <span>{selectedTr ? t(selectedTr.labelKey) : selected}</span>
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
            onClick={() => { playSfx("click"); onClose(); }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={en ? "ltr" : "rtl"}>
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[72vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Wand2 className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
              <span>{t("transition.library")}</span>
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-secondary font-normal">
                {TRANSITIONS.length} {en ? "transitions" : "انتقال"}
              </span>
            </h3>
          </div>
          
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
              className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-all active:scale-90"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-muted-foreground">{t("transition.duration")}</span>
            <span className="text-[11px] font-mono text-primary font-bold">{duration.toFixed(2)}s</span>
          </div>
          <input type="range" min={0.1} max={2} step={0.05} value={duration} onChange={(e) => onDuration(Number(e.target.value))} className="w-full accent-primary h-1.5" dir="ltr" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TRANSITIONS.map((tr) => {
            const isActive = selected === tr.type;
            return (
              <button key={tr.type} onClick={() => apply(tr.type)}
                className={`relative p-1.5 rounded-xl border-2 transition-all ${isActive ? "scale-[1.03] shadow-lg" : "border-border hover:border-primary/40"}`}
                style={isActive ? { borderColor: tr.color, boxShadow: `0 0 12px ${tr.color}60` } : {}}>
                <CanvasPreview type={tr.type} isActive={isActive} />
                <div className="flex items-center justify-center gap-1 mt-1.5">
                  <span className="text-[9px]">{tr.emoji}</span>
                  <p className="text-[10px] font-bold text-foreground text-center leading-none">{t(tr.labelKey)}</p>
                </div>
                {isActive && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full gradient-primary flex items-center justify-center shadow-md animate-scale-in z-20 border border-white/20">
                    <Check className="w-2.5 h-2.5 text-white stroke-[3.5px]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom margin padding */}
        <div className="mt-2"></div>
      </div>
    </div>
  );
};

export default TransitionPanel;
