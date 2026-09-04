import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Gauge, X, Check, Eye, EyeOff, Plus, Trash2, RotateCcw, Activity, HelpCircle, Sliders } from "lucide-react";
import { useMedia } from "@/context/MediaContext";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface Props { open: boolean; onClose: () => void; currentTime: number; }

const SPEEDS = [
  { val: 0.25, label: "0.25×", emoji: "🐢", color: "#22d3ee", desc: "Slower Slo-Mo / سلومو أبطأ" },
  { val: 0.5,  label: "0.5×",  emoji: "🐌", color: "#3b82f6", desc: "Slo-Mo / سلومو" },
  { val: 1,    label: "1×",    emoji: "▶️", color: "#10b981", desc: "Normal / طبيعي" },
  { val: 1.5,  label: "1.5×",  emoji: "🚀", color: "#f59e0b", desc: "Fast / سريع" },
  { val: 2,    label: "2×",    emoji: "⚡", color: "#f97316", desc: "Faster / تسريع" },
  { val: 4,    label: "4×",    emoji: "💥", color: "#ef4444", desc: "Hyper Fast / تسريع فائق" },
];

const CURVE_PRESETS = [
  {
    id: "hero",
    labelEn: "Hero Velocity",
    labelAr: "منحنى تسارع البطل",
    descEn: "CapCut style fast entry, slow middle, and fast exit.",
    descAr: "دخول سريع، منتصف بطيء مذهل، وخروج سريع.",
    points: [
      { id: "1", timePct: 0, value: 1.0 },
      { id: "2", timePct: 25, value: 2.5 },
      { id: "3", timePct: 60, value: 0.35 },
      { id: "4", timePct: 100, value: 1.0 }
    ]
  },
  {
    id: "smooth-in",
    labelEn: "Accelerate",
    labelAr: "تسارع تدريجي",
    descEn: "Starts slow and gradually ramps up to top speed.",
    descAr: "يبدأ ببطء ويتسارع تدريجياً لسرعة قصوى.",
    points: [
      { id: "1", timePct: 0, value: 0.5 },
      { id: "2", timePct: 50, value: 1.5 },
      { id: "3", timePct: 100, value: 3.0 }
    ]
  },
  {
    id: "smooth-out",
    labelEn: "Decelerate",
    labelAr: "تباطؤ تدريجي",
    descEn: "Starts fast and slowly eases down to slo-mo.",
    descAr: "يبدأ سريعاً جداً ويتباطأ تدريجياً لسلومو.",
    points: [
      { id: "1", timePct: 0, value: 3.0 },
      { id: "2", timePct: 50, value: 1.5 },
      { id: "3", timePct: 100, value: 0.5 }
    ]
  },
  {
    id: "bullet",
    labelEn: "Bullet Time",
    labelAr: "تأثير الرصاصة",
    descEn: "Extreme highlight deceleration in the dead-center.",
    descAr: "تباطؤ فائق لزمن رصاصة الماتريكس في المنتصف.",
    points: [
      { id: "1", timePct: 0, value: 1.0 },
      { id: "2", timePct: 40, value: 1.0 },
      { id: "3", timePct: 50, value: 0.25 },
      { id: "4", timePct: 60, value: 1.0 },
      { id: "5", timePct: 100, value: 1.0 }
    ]
  }
];

const W = 80, H = 40;

function renderSpeedPreview(ctx: CanvasRenderingContext2D, speed: number, p: number, color: string) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f172a"); bg.addColorStop(1, "#1e293b");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const blurLines = speed < 1 ? 2 : speed > 2 ? 8 : Math.round(speed * 3);
  const spacing = W / blurLines;
  for (let i = 0; i < blurLines; i++) {
    const x = (p * W * speed + i * spacing) % W;
    ctx.fillStyle = color; ctx.globalAlpha = speed < 1 ? 0.15 : 0.3;
    ctx.fillRect(x - 1, 0, speed < 1 ? 4 : 2, H);
  }
  ctx.globalAlpha = 1;
  const ph = (p % 1) * W;
  ctx.fillStyle = color; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.roundRect(ph - 3, H/2 - 8, 6, 16, 2); ctx.fill();
  ctx.globalAlpha = 1;
  const dotCount = Math.min(6, Math.round(speed * 2)); const dotSpacing = W / (dotCount + 1);
  for (let i = 0; i < dotCount; i++) {
    ctx.fillStyle = color; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(dotSpacing * (i + 1), H - 6, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
  ctx.strokeRect(1, 1, W - 2, H - 2); ctx.globalAlpha = 1;
}

const SpeedPreview = ({ speed, color, isActive }: { speed: number; color: string; isActive: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0); const startRef = useRef<number>(0);
  const D = isActive ? 1200 / speed : 2000 / speed;
  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (!startRef.current) startRef.current = ts;
    renderSpeedPreview(ctx, speed, ((ts - startRef.current) % D) / D, color);
    rafRef.current = requestAnimationFrame(animate);
  }, [speed, color, D]);
  useEffect(() => { startRef.current = 0; rafRef.current = requestAnimationFrame(animate); return () => cancelAnimationFrame(rafRef.current); }, [animate]);
  return <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" />;
};

const SpeedPanel = ({ open, onClose, currentTime }: Props) => {
  const en = getLang() === "en";
  const { resolveTimelineTime, setClipSpeed, setClips } = useMedia();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"constant" | "curve">("constant");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  const resolved = resolveTimelineTime(currentTime);
  const activeSpeed = resolved?.clip.speed ?? 1;

  // Find or initialize speed points
  const speedCurvePoints = useMemo(() => {
    if (!resolved?.clip) return [];
    if (resolved.clip.speedCurve && resolved.clip.speedCurve.length > 0) {
      return [...resolved.clip.speedCurve].sort((a, b) => a.timePct - b.timePct);
    }
    // Return standard flat line
    return [
      { id: "start", timePct: 0, value: resolved.clip.speed ?? 1 },
      { id: "end", timePct: 100, value: resolved.clip.speed ?? 1 }
    ];
  }, [resolved?.clip]);

  // SVG Coordinates constants
  const SVG_W = 500;
  const SVG_H = 220;
  const M_LEFT = 40;
  const M_RIGHT = 20;
  const M_TOP = 20;
  const M_BOTTOM = 30;
  
  const PLOT_W = SVG_W - M_LEFT - M_RIGHT;
  const PLOT_H = SVG_H - M_TOP - M_BOTTOM;

  const toX = useCallback((timePct: number) => M_LEFT + (timePct / 100) * PLOT_W, [PLOT_W]);
  const toY = useCallback((val: number) => {
    // value ranges from 0.25 to 4.0
    const ratio = (val - 0.25) / (4.0 - 0.25);
    return M_TOP + PLOT_H - ratio * PLOT_H;
  }, [PLOT_H]);

  const fromX = useCallback((x: number) => {
    const ratio = (x - M_LEFT) / PLOT_W;
    return Math.max(0, Math.min(100, ratio * 100));
  }, [PLOT_W]);

  const fromY = useCallback((y: number) => {
    const ratio = (M_TOP + PLOT_H - y) / PLOT_H;
    return Math.max(0.25, Math.min(4.0, 0.25 + ratio * (4.0 - 0.25)));
  }, [PLOT_H]);

  const applyConstantSpeed = useCallback((s: number) => {
    if (!resolved) { toast.error(en ? "Position cursor on a clip first" : "ضع المؤشر على مقطع أولاً"); return; }
    // Flatten curve and set constant speed
    setClips((prev) => prev.map((c) => {
      if (c.id !== resolved.clip.id) return c;
      return {
        ...c,
        speed: s,
        speedCurve: [
          { id: "start", timePct: 0, value: s },
          { id: "end", timePct: 100, value: s }
        ]
      };
    }));
    try { navigator.vibrate?.(10); } catch {}
    toast.success(en ? `Constant speed set to ${s}×` : `تم ضبط السرعة الثابتة إلى ${s}×`);
  }, [resolved, en, setClips]);

  const applyCurvePoints = useCallback((points: { id: string; timePct: number; value: number }[]) => {
    if (!resolved) return;
    const sorted = [...points].sort((a, b) => a.timePct - b.timePct);
    
    // Average speed determines clip's duration modification
    const avg = sorted.reduce((acc, p) => acc + p.value, 0) / sorted.length;
    const roundedAvg = Math.round(avg * 100) / 100;

    setClips((prev) => prev.map((c) => {
      if (c.id !== resolved.clip.id) return c;
      return {
        ...c,
        speed: roundedAvg,
        speedCurve: sorted
      };
    }));
  }, [resolved, setClips]);

  // Click on SVG line or canvas to add a control node
  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!resolved?.clip) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Convert coordinates in SVG viewBox units
    const svgX = (clientX / rect.width) * SVG_W;
    const svgY = (clientY / rect.height) * SVG_H;

    // Check if clicked near an existing node
    const clickedPoint = speedCurvePoints.find((p) => {
      const px = toX(p.timePct);
      const py = toY(p.value);
      return Math.hypot(svgX - px, svgY - py) < 14;
    });

    if (clickedPoint) {
      setSelectedPointId(clickedPoint.id);
      playSfx("click");
      return;
    }

    // Add a new node at click location
    const pct = Math.round(fromX(svgX));
    const val = Math.round(fromY(svgY) * 100) / 100;

    // Create new node id
    const newId = `pt-${Date.now()}`;
    const newPoint = { id: newId, timePct: pct, value: val };
    
    const updated = [...speedCurvePoints, newPoint];
    applyCurvePoints(updated);
    setSelectedPointId(newId);
    playSfx("success");
    toast.success(en ? `Added node at ${pct}% with speed ${val}×` : `تمت إضافة نقطة عند ${pct}% بسرعة ${val}×`);
  }, [resolved, speedCurvePoints, toX, toY, fromX, fromY, applyCurvePoints, en]);

  const handleSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!selectedPointId || !resolved?.clip) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const svgX = (clientX / rect.width) * SVG_W;
    const svgY = (clientY / rect.height) * SVG_H;

    const newPct = Math.round(fromX(svgX));
    const newVal = Math.round(fromY(svgY) * 100) / 100;

    const updated = speedCurvePoints.map((p) => {
      if (p.id !== selectedPointId) return p;
      // Maintain boundaries for start/end nodes
      const timePct = p.id === "start" ? 0 : p.id === "end" ? 100 : newPct;
      return {
        ...p,
        timePct,
        value: newVal
      };
    });

    applyCurvePoints(updated);
  }, [selectedPointId, resolved, speedCurvePoints, fromX, fromY, applyCurvePoints]);

  const handleSvgPointerUp = useCallback(() => {
    setSelectedPointId(null);
  }, []);

  const deletePoint = useCallback((id: string) => {
    if (id === "start" || id === "end") {
      toast.error(en ? "Cannot delete start or end points" : "لا يمكن حذف نقطتي البداية أو النهاية");
      return;
    }
    const filtered = speedCurvePoints.filter((p) => p.id !== id);
    applyCurvePoints(filtered);
    setSelectedPointId(null);
    playSfx("swipe");
    toast.success(en ? "Node deleted" : "تم حذف نقطة التحكم");
  }, [speedCurvePoints, applyCurvePoints, en]);

  const handleApplyPreset = useCallback((preset: typeof CURVE_PRESETS[0]) => {
    applyCurvePoints(preset.points);
    playSfx("success");
    toast.success(en ? `Applied ${preset.labelEn} template` : `تم تطبيق قالب ${preset.labelAr}`);
  }, [applyCurvePoints, en]);

  const resetToFlat = useCallback(() => {
    applyConstantSpeed(1.0);
    playSfx("click");
  }, [applyConstantSpeed]);

  // Generate SVG path for the curve
  const pathD = useMemo(() => {
    if (speedCurvePoints.length === 0) return "";
    return speedCurvePoints.reduce((acc, p, idx) => {
      const x = toX(p.timePct);
      const y = toY(p.value);
      return acc + `${idx === 0 ? "M" : "L"} ${x} ${y}`;
    }, "");
  }, [speedCurvePoints, toX, toY]);

  // EARLY RETURNS
  if (!open) return null;

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active Speed:" : "السرعة النشطة:"}</span>
            <span className="text-primary font-extrabold">{activeSpeed}×</span>
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
            title={en ? "Confirm" : "تأكيد"}
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
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl pb-6">
        
        {/* Header Title */}
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Gauge className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            <span>{en ? "Velocity Speed Controller" : "متحكم سرعة الفيديو المتطور"}</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Collapse button */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90"
              title={en ? "Minimize to preview work" : "إخفاء لرؤية العمل"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            {resolved && (
              <button 
                onClick={() => { playSfx("success"); onClose(); }} 
                className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
                title={en ? "Confirm Selection" : "تأكيد الاختيار"}
              >
                <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
              </button>
            )}
            <button onClick={() => { playSfx("click"); onClose(); }} className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 p-1 bg-secondary/50 rounded-2xl border border-border/40 mb-4">
          <button
            onClick={() => { playSfx("click"); setActiveTab("constant"); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "constant" ? "gradient-primary text-primary-foreground shadow-md" : "hover:bg-secondary text-muted-foreground bg-transparent"
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span>{en ? "Constant Speed" : "سرعة ثابتة"}</span>
          </button>
          <button
            onClick={() => { playSfx("click"); setActiveTab("curve"); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "curve" ? "gradient-primary text-primary-foreground shadow-md" : "hover:bg-secondary text-muted-foreground bg-transparent"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{en ? "Speed Curve (Ramp)" : "منحنى تسريع الفيديو"}</span>
          </button>
        </div>

        {!resolved ? (
          <div className="text-center py-8 bg-secondary/10 rounded-2xl border border-dashed border-border">
            <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-bounce" />
            <p className="text-xs text-foreground font-bold">
              {en ? "Please position the playhead indicator on a video segment track first." : "يرجى تحريك مؤشر التشغيل ووضعه فوق مقطع فيديو أولاً للتعديل."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* CONSTANT VIEW */}
            {activeTab === "constant" && (
              <>
                <p className="text-[11px] text-muted-foreground mb-3">
                  {en ? "Tap to instantly change the speed of the selected video segment." : "اختر السرعة المطلوبة لتطبيقها فورياً على المقطع المختار."}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {SPEEDS.map((s) => {
                    const isActive = Math.abs(activeSpeed - s.val) < 0.01;
                    return (
                      <button key={s.val} onClick={() => applyConstantSpeed(s.val)}
                        className={`relative flex flex-col items-center gap-1.5 p-1.5 rounded-xl border-2 transition-all active:scale-95 ${isActive ? "scale-[1.03] shadow-lg" : "border-border"}`}
                        style={isActive ? { borderColor: s.color, boxShadow: `0 0 12px ${s.color}60` } : {}}>
                        <SpeedPreview speed={s.val} color={s.color} isActive={isActive} />
                        <div className="flex items-center gap-1"><span className="text-sm">{s.emoji}</span><span className="text-[11px] font-bold text-foreground">{s.label}</span></div>
                        {isActive && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full gradient-primary flex items-center justify-center shadow-md animate-scale-in z-20 border border-white/20">
                            <Check className="w-2.5 h-2.5 text-white stroke-[3.5px]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* CURVE RAMP VIEW */}
            {activeTab === "curve" && (
              <div className="space-y-4 animate-fade-in">
                
                {/* SVG Curves Graph */}
                <div className="relative bg-black/40 rounded-2xl border border-border/50 overflow-hidden p-1">
                  
                  {/* Axis indicators */}
                  <div className="absolute top-2 left-2 text-[8px] font-mono font-bold text-red-500/80 bg-red-500/10 px-1.5 py-0.5 rounded">
                    4.0× {en ? "Fast" : "سريع جداً"}
                  </div>
                  <div className="absolute top-[45%] left-2 text-[8px] font-mono font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">
                    1.0× {en ? "Normal" : "طبيعي"}
                  </div>
                  <div className="absolute bottom-2 left-2 text-[8px] font-mono font-bold text-blue-500/80 bg-blue-500/10 px-1.5 py-0.5 rounded">
                    0.25× {en ? "Slow" : "سلومو"}
                  </div>

                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    className="w-full h-[200px] cursor-crosshair select-none touch-none"
                    onPointerDown={handleSvgPointerDown}
                    onPointerMove={handleSvgPointerMove}
                    onPointerUp={handleSvgPointerUp}
                    onPointerLeave={handleSvgPointerUp}
                  >
                    {/* Horizontal grid lines */}
                    <line x1={M_LEFT} y1={toY(4.0)} x2={SVG_W - M_RIGHT} y2={toY(4.0)} stroke="currentColor" strokeOpacity={0.07} strokeDasharray="3 3" />
                    <line x1={M_LEFT} y1={toY(3.0)} x2={SVG_W - M_RIGHT} y2={toY(3.0)} stroke="currentColor" strokeOpacity={0.07} strokeDasharray="3 3" />
                    <line x1={M_LEFT} y1={toY(2.0)} x2={SVG_W - M_RIGHT} y2={toY(2.0)} stroke="currentColor" strokeOpacity={0.07} strokeDasharray="3 3" />
                    <line x1={M_LEFT} y1={toY(1.0)} x2={SVG_W - M_RIGHT} y2={toY(1.0)} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" className="text-green-500" strokeWidth={1.5} />
                    <line x1={M_LEFT} y1={toY(0.5)} x2={SVG_W - M_RIGHT} y2={toY(0.5)} stroke="currentColor" strokeOpacity={0.07} strokeDasharray="3 3" />
                    <line x1={M_LEFT} y1={toY(0.25)} x2={SVG_W - M_RIGHT} y2={toY(0.25)} stroke="currentColor" strokeOpacity={0.07} strokeDasharray="3 3" />

                    {/* Timeline vertical reference intervals */}
                    <line x1={toX(25)} y1={M_TOP} x2={toX(25)} y2={SVG_H - M_BOTTOM} stroke="currentColor" strokeOpacity={0.05} />
                    <line x1={toX(50)} y1={M_TOP} x2={toX(50)} y2={SVG_H - M_BOTTOM} stroke="currentColor" strokeOpacity={0.1} />
                    <line x1={toX(75)} y1={M_TOP} x2={toX(75)} y2={SVG_H - M_BOTTOM} stroke="currentColor" strokeOpacity={0.05} />

                    {/* Background glow path */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="url(#glow-grad)"
                      strokeWidth={10}
                      strokeOpacity={0.15}
                    />

                    {/* Core curve path */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="url(#line-grad)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Interactive dots */}
                    {speedCurvePoints.map((pt) => {
                      const cx = toX(pt.timePct);
                      const cy = toY(pt.value);
                      const isSelected = pt.id === selectedPointId;

                      return (
                        <g key={pt.id} className="cursor-grab active:cursor-grabbing">
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 10 : 6}
                            fill={isSelected ? "#10b981" : "#3b82f6"}
                            stroke="#fff"
                            strokeWidth={2}
                            className="transition-all duration-150 drop-shadow-md"
                          />
                          <text
                            x={cx}
                            y={cy - 12}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize="8"
                            fontWeight="bold"
                            className="pointer-events-none drop-shadow-sm select-none"
                            {...({ dir: "ltr" } as any)}
                          >
                            {pt.value.toFixed(2)}×
                          </text>
                        </g>
                      );
                    })}

                    {/* SVG Gradients definitions */}
                    <defs>
                      <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                      <linearGradient id="glow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                {/* Guide help & node controls */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[70%] font-bold">
                    💡 {en 
                      ? "Click anywhere on the line to add control points. Drag points up to speed up, or down to decelerate."
                      : "انقر فوق أي جزء من الخط لإضافة نقاط تسريع. اسحب النقاط لأعلى للتسريع أو لأسفل لتبطيء المقطع."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={resetToFlat}
                      className="flex items-center gap-1 text-[10px] font-bold bg-secondary hover:bg-secondary/80 border border-border/40 text-foreground px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
                    >
                      <RotateCcw className="w-3 h-3 text-red-400" />
                      <span>{en ? "Reset" : "إعادة تعيين"}</span>
                    </button>
                  </div>
                </div>

                {/* Velocity Curve Presets List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    <span>{en ? "Velocity Ramp Templates" : "قوالب تسريع السرعة (تأثير المنحنى البصري)"}</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {CURVE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleApplyPreset(p)}
                        className="bg-secondary/20 hover:bg-secondary/40 border border-border/50 rounded-xl p-2.5 text-right transition-all hover:scale-[1.01] active:scale-95 flex flex-col justify-between h-[68px] cursor-pointer"
                      >
                        <span className="text-[10px] font-extrabold text-primary">{en ? p.labelEn : p.labelAr}</span>
                        <span className="text-[8px] text-muted-foreground leading-tight">{en ? p.descEn : p.descAr}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* Bottom space padding */}
        <div className="mt-2"></div>

      </div>
    </div>
  );
};

export default SpeedPanel;
