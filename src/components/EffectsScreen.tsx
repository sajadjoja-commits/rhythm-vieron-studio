import { useRef, useEffect, useCallback, useState } from "react";
import { Sparkles, Palette, Zap } from "lucide-react";
import { getLang } from "@/lib/i18n";

type FilterId = "warm"|"cool"|"dramatic"|"vintage"|"noir"|"dream"|"neon"|"sepia"|"duotone"|"grayscale"|"sepia-blue"|"fade-edge";
type VfxId = "glitch"|"shake"|"zoom-pulse"|"vhs"|"rgb-split"|"film-grain"|"light-leak"|"particles"|"chromatic"|"pixelate";

const W = 100, H = 62;

function drawBase(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, "#1e3a8a"); sky.addColorStop(1, "#3b82f6");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.6);
  ctx.fillStyle = "#0f172a"; ctx.fillRect(0, H * 0.6, W, H * 0.4);
  [[8,25,16,37],[26,15,16,47],[44,30,14,32],[60,20,18,42],[80,28,16,34]].forEach(([x,y,w,h]) => {
    ctx.fillStyle="#0f172a"; ctx.fillRect(x,y,w,h);
    ctx.fillStyle="#fbbf2466";
    for(let wy=y+4;wy<y+h-4;wy+=6) for(let wx=x+3;wx<x+w-3;wx+=5) if(Math.random()>0.3) ctx.fillRect(wx,wy,3,3);
  });
  ctx.fillStyle="#fef3c7"; ctx.beginPath(); ctx.arc(W*0.85,15,8,0,Math.PI*2); ctx.fill();
}

function renderFilterPreview(ctx: CanvasRenderingContext2D, type: FilterId, t: number) {
  ctx.clearRect(0,0,W,H); drawBase(ctx);
  ctx.globalCompositeOperation = "color";
  switch(type) {
    case "warm": ctx.fillStyle=`rgba(251,146,60,${0.35})`; ctx.fillRect(0,0,W,H); break;
    case "cool": ctx.fillStyle=`rgba(34,211,238,${0.35})`; ctx.fillRect(0,0,W,H); break;
    case "dramatic": ctx.fillStyle=`rgba(239,68,68,${0.25})`; ctx.fillRect(0,0,W,H); break;
    case "vintage": ctx.fillStyle=`rgba(167,139,250,0.3)`; ctx.fillRect(0,0,W,H); break;
    case "noir": ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(0,0,W,H); break;
    case "dream": ctx.fillStyle=`rgba(240,171,252,0.4)`; ctx.fillRect(0,0,W,H); break;
    case "neon": ctx.fillStyle=`rgba(34,211,238,0.45)`; ctx.fillRect(0,0,W,H); break;
    case "sepia": ctx.fillStyle=`rgba(217,119,6,0.45)`; ctx.fillRect(0,0,W,H); break;
    case "sepia-blue": ctx.fillStyle=`rgba(59,130,246,0.4)`; ctx.fillRect(0,0,W,H); break;
    case "duotone": ctx.fillStyle=`rgba(124,58,237,0.4)`; ctx.fillRect(0,0,W,H); break;
    case "grayscale": ctx.fillStyle="rgba(128,128,128,1)"; ctx.fillRect(0,0,W,H); break;
    case "fade-edge":
      ctx.globalCompositeOperation="source-over";
      const g=ctx.createRadialGradient(W/2,H/2,H*0.25,W/2,H/2,H*0.7);
      g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,0.7)");
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  ctx.globalCompositeOperation="source-over";
  ctx.globalAlpha=0.04; for(let i=0;i<300;i++){ctx.fillStyle=Math.random()>.5?"#fff":"#000";ctx.fillRect(Math.random()*W,Math.random()*H,1,1);}
  ctx.globalAlpha=1;
}

function renderVfxPreview(ctx: CanvasRenderingContext2D, type: VfxId, t: number) {
  ctx.clearRect(0,0,W,H);
  const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#0f172a"); bg.addColorStop(1,"#1e293b");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1.5; ctx.strokeRect(6,8,W-12,H-16);
  const s=Math.sin(t*Math.PI*2);
  switch(type) {
    case "glitch": for(let i=0;i<5;i++){const y=(H/5)*i,xo=Math.sin(i*2.1+t*15)*8*t;ctx.globalAlpha=0.5;ctx.fillStyle="#ff004066";ctx.fillRect(6+xo,y,W-12,H/5);ctx.fillStyle="#00ffff66";ctx.fillRect(6-xo*.6,y,W-12,H/5);ctx.globalAlpha=1;} break;
    case "shake": ctx.save();ctx.translate(s*5*t,0);ctx.fillStyle="#3b82f644";ctx.fillRect(6,8,W-12,H-16);ctx.strokeStyle="#f97316";ctx.lineWidth=1.5;ctx.strokeRect(6,8,W-12,H-16);ctx.restore(); break;
    case "zoom-pulse": {const sc=1+Math.sin(t*Math.PI*2)*.1;ctx.save();ctx.translate(W/2,H/2);ctx.scale(sc,sc);ctx.translate(-W/2,-H/2);ctx.fillStyle="#10b98155";ctx.fillRect(6,8,W-12,H-16);ctx.strokeStyle="#10b981";ctx.lineWidth=2;ctx.strokeRect(6,8,W-12,H-16);ctx.restore();} break;
    case "vhs": for(let y=0;y<H;y+=2){const n=(Math.sin(y*.4+t*8)*.5+.5)*.25;ctx.fillStyle=`rgba(255,255,255,${n})`;ctx.fillRect(0,y,W,1);}ctx.fillStyle="#a855f733";ctx.fillRect(0,H*.3,W,H*.1); break;
    case "rgb-split": ctx.globalAlpha=.5;ctx.fillStyle="#ff004066";ctx.fillRect(6+t*5,8,W-12,H-16);ctx.fillStyle="#00ff0066";ctx.fillRect(6,8,W-12,H-16);ctx.fillStyle="#0000ff66";ctx.fillRect(6-t*5,8,W-12,H-16);ctx.globalAlpha=1; break;
    case "film-grain": ctx.fillStyle="#78716c33";ctx.fillRect(6,8,W-12,H-16);for(let i=0;i<300;i++){ctx.fillStyle=Math.random()>.5?"#fff":"#000";ctx.globalAlpha=Math.random()*.35;ctx.fillRect(6+Math.random()*(W-12),8+Math.random()*(H-16),1,1);}ctx.globalAlpha=1; break;
    case "light-leak": {const g=ctx.createRadialGradient(W*t,H*.3,0,W*t,H*.3,W*.5);g.addColorStop(0,"#fb923ccc");g.addColorStop(.5,"#fb923c44");g.addColorStop(1,"transparent");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);} break;
    case "particles": for(let i=0;i<10;i++){const ang=(i/10)*Math.PI*2+t*2,r=10+t*14;ctx.fillStyle="#fbbf24";ctx.globalAlpha=.8-t*.5;ctx.beginPath();ctx.arc(W/2+Math.cos(ang)*r,H/2+Math.sin(ang)*r,1.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1; break;
    case "chromatic": ctx.globalAlpha=.5;ctx.fillStyle="#ff000066";ctx.fillRect(6+s*3,8,W-12,H-16);ctx.fillStyle="#00ff0066";ctx.fillRect(6,8,W-12,H-16);ctx.fillStyle="#0000ff66";ctx.fillRect(6-s*3,8,W-12,H-16);ctx.globalAlpha=1; break;
    case "pixelate": {const sz=Math.max(2,Math.round((1-t)*8+2));for(let y=8;y<H-8;y+=sz)for(let x=6;x<W-6;x+=sz){ctx.fillStyle=`hsl(${(x+y)*2},70%,40%)`;ctx.globalAlpha=.3+t*.4;ctx.fillRect(x,y,sz-1,sz-1);}ctx.globalAlpha=1;} break;
  }
  ctx.strokeStyle="#3b82f6";ctx.lineWidth=1;ctx.globalAlpha=.3;ctx.strokeRect(1,1,W-2,H-2);ctx.globalAlpha=1;
}

const CanvasCard = ({ type, isFilter, label, emoji, color }: { type: string; isFilter: boolean; label: string; emoji: string; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0); const startRef = useRef<number>(0); const D = 2000;
  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext("2d"); if(!ctx) return;
    if(!startRef.current) startRef.current = ts;
    const e=(ts-startRef.current)%(D*2); const raw=e<D?e/D:1-(e-D)/D;
    const p=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;
    if(isFilter) renderFilterPreview(ctx,type as FilterId,p);
    else renderVfxPreview(ctx,type as VfxId,p);
    rafRef.current = requestAnimationFrame(animate);
  }, [type, isFilter]);
  useEffect(() => { startRef.current=0; rafRef.current=requestAnimationFrame(animate); return ()=>cancelAnimationFrame(rafRef.current); }, [animate]);
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card hover:border-primary/50 cursor-pointer active:scale-[0.97] transition-all">
      <canvas ref={canvasRef} width={W} height={H} className="w-full" />
      <div className="p-2 flex items-center gap-1.5">
        <span className="text-xs">{emoji}</span>
        <span className="text-[10px] font-bold text-foreground">{label}</span>
        <div className="ml-auto w-2 h-2 rounded-full" style={{ background: color }} />
      </div>
    </div>
  );
};

const FILTER_ITEMS: { type: FilterId; label: string; labelEn: string; emoji: string; color: string }[] = [
  { type:"warm",       label:"\u062f\u0627\u0641\u0626",        labelEn:"Warm",      emoji:"\ud83c\udf05", color:"#fb923c" },
  { type:"cool",       label:"\u0628\u0627\u0631\u062f",         labelEn:"Cool",      emoji:"\u2744\ufe0f", color:"#22d3ee" },
  { type:"dramatic",   label:"\u062f\u0631\u0627\u0645\u064a",        labelEn:"Dramatic",  emoji:"\ud83c\udfac", color:"#ef4444" },
  { type:"vintage",    label:"\u0641\u064a\u0646\u062a\u062c",        labelEn:"Vintage",   emoji:"\ud83d\udcf7", color:"#a78bfa" },
  { type:"noir",       label:"\u0646\u0648\u0627\u0631",         labelEn:"Noir",      emoji:"\ud83c\udfad", color:"#374151" },
  { type:"dream",      label:"\u062d\u0644\u0645\u064a",         labelEn:"Dream",     emoji:"\ud83d\udc9c", color:"#f0abfc" },
  { type:"neon",       label:"\u0646\u064a\u0648\u0646",         labelEn:"Neon",      emoji:"\ud83c\udfd9", color:"#22d3ee" },
  { type:"sepia",      label:"\u0633\u064a\u0628\u064a\u0627",        labelEn:"Sepia",     emoji:"\ud83d\udfe7", color:"#d97706" },
  { type:"duotone",    label:"\u062b\u0646\u0627\u0626\u064a",        labelEn:"Duotone",   emoji:"\ud83c\udfa8", color:"#8b5cf6" },
  { type:"grayscale",  label:"\u0623\u0628\u064a\u0636 \u0648\u0623\u0633\u0648\u062f",  labelEn:"B&W",       emoji:"\u2b1c", color:"#9ca3af" },
  { type:"sepia-blue", label:"\u0633\u064a\u0628\u064a\u0627 \u0623\u0632\u0631\u0642",  labelEn:"Sepia Blue",emoji:"\ud83d\udd35", color:"#3b82f6" },
  { type:"fade-edge",  label:"\u062d\u0648\u0627\u0641 \u0646\u0627\u0639\u0645\u0629",  labelEn:"Fade Edge", emoji:"\ud83d\udd32", color:"#fbbf24" },
];

const VFX_ITEMS: { type: VfxId; label: string; labelEn: string; emoji: string; color: string }[] = [
  { type:"glitch",     label:"\u062e\u0644\u0644",          labelEn:"Glitch",    emoji:"\u26a1", color:"#ec4899" },
  { type:"shake",      label:"\u0627\u0647\u062a\u0632\u0627\u0632",        labelEn:"Shake",     emoji:"\ud83d\udcf3", color:"#f97316" },
  { type:"zoom-pulse", label:"\u0646\u0628\u0636 \u062a\u0643\u0628\u064a\u0631",     labelEn:"Zoom Pulse",emoji:"\ud83d\udd0d", color:"#10b981" },
  { type:"vhs",        label:"VHS",           labelEn:"VHS",       emoji:"\ud83d\udcfc", color:"#a855f7" },
  { type:"rgb-split",  label:"\u0641\u0635\u0644 \u0623\u0644\u0648\u0627\u0646",     labelEn:"RGB Split", emoji:"\ud83c\udf08", color:"#8b5cf6" },
  { type:"film-grain", label:"\u062d\u0628\u064a\u0628\u0627\u062a",        labelEn:"Film Grain",emoji:"\ud83c\udf9e\ufe0f", color:"#78716c" },
  { type:"light-leak", label:"\u062a\u0633\u0631\u064a\u0628 \u0636\u0648\u0621",     labelEn:"Light Leak",emoji:"\ud83c\udf05", color:"#fb923c" },
  { type:"particles",  label:"\u062c\u0632\u064a\u0626\u0627\u062a",        labelEn:"Particles", emoji:"\u2728", color:"#fbbf24" },
  { type:"chromatic",  label:"\u0643\u0631\u0648\u0645\u0627\u062a\u064a\u0643",      labelEn:"Chromatic", emoji:"\ud83c\udfad", color:"#e11d48" },
  { type:"pixelate",   label:"\u0628\u0643\u0633\u0644\u0629",        labelEn:"Pixelate",  emoji:"\ud83d\udfe6", color:"#3b82f6" },
];

const EffectsScreen = () => {
  const en = getLang() === "en";
  const [tab, setTab] = useState<"filters"|"vfx">("filters");
  return (
    <div className="min-h-screen pb-24 px-4 pt-6" dir={en?"ltr":"rtl"}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl gradient-primary glow-primary-sm flex items-center justify-center"><Sparkles className="w-5 h-5 text-primary-foreground" /></div>
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">{en?"Effects Library":"\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0645\u0624\u062b\u0631\u0627\u062a"}</h1>
          <p className="text-[11px] text-muted-foreground">{en?"Live previews of all effects":"\u0645\u0639\u0627\u064a\u0646\u0629 \u062d\u064a\u0629 \u0644\u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0624\u062b\u0631\u0627\u062a"}</p>
        </div>
      </div>
      <div className="mb-5 p-4 rounded-2xl bg-card border border-border flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Zap className="w-4 h-4 text-primary" /></div>
        <div>
          <p className="text-xs font-bold text-foreground mb-0.5">{en?"Apply in Editor":"\u0623\u0636\u0641 \u0641\u064a \u0627\u0644\u0645\u062d\u0631\u0631"}</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{en?"Open a project in the editor, then use the Filters or Effects tools to apply these to your clips.":"\u0627\u0641\u062a\u062d \u0645\u0634\u0631\u0648\u0639\u0627\u064b \u0641\u064a \u0627\u0644\u0645\u062d\u0631\u0631\u060c \u062b\u0645 \u0627\u0633\u062a\u062e\u062f\u0645 \u0623\u062f\u0648\u0627\u062a \u0627\u0644\u0641\u0644\u0627\u062a\u0631 \u0623\u0648 \u0627\u0644\u0645\u0624\u062b\u0631\u0627\u062a \u0644\u062a\u0637\u0628\u064a\u0642\u0647\u0627."}</p>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={()=>setTab("filters")} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab==="filters"?"gradient-primary text-primary-foreground glow-primary-sm":"bg-card border border-border text-muted-foreground"}`}><Palette className="w-4 h-4" /> {en?"Filters":"\u0641\u0644\u0627\u062a\u0631"}</button>
        <button onClick={()=>setTab("vfx")} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab==="vfx"?"gradient-primary text-primary-foreground glow-primary-sm":"bg-card border border-border text-muted-foreground"}`}><Sparkles className="w-4 h-4" /> {en?"VFX":"\u0645\u0624\u062b\u0631\u0627\u062a"}</button>
      </div>
      {tab==="filters" && <div className="grid grid-cols-2 gap-3">{FILTER_ITEMS.map((f)=><CanvasCard key={f.type} type={f.type} isFilter={true} label={en?f.labelEn:f.label} emoji={f.emoji} color={f.color} />)}</div>}
      {tab==="vfx" && <div className="grid grid-cols-2 gap-3">{VFX_ITEMS.map((v)=><CanvasCard key={v.type} type={v.type} isFilter={false} label={en?v.labelEn:v.label} emoji={v.emoji} color={v.color} />)}</div>}
    </div>
  );
};

export default EffectsScreen;
