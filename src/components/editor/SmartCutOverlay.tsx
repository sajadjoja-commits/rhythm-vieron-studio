import { useEffect, useRef, useState } from "react";
import { Wand2, X, Check, AudioWaveform, Scissors, Volume2 } from "lucide-react";
import { useMedia, Clip } from "@/context/MediaContext";
import { useAdGate } from "@/context/AdGateContext";
import { detectSilenceCutPoints } from "@/lib/videoUtils";
import { requireOnline } from "@/lib/net";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Phase = "config" | "analyzing" | "cutting" | "done" | "error";

// Sensitivity presets — higher sensitivity detects quieter/shorter silences.
const SENS = [
  { id: "low", label: "منخفضة", thresholdDb: -34, minSilenceMs: 700 },
  { id: "med", label: "متوسطة", thresholdDb: -42, minSilenceMs: 450 },
  { id: "high", label: "عالية", thresholdDb: -50, minSilenceMs: 280 },
] as const;

const SmartCutOverlay = ({ open, onClose }: Props) => {
  const { clips, getMediaById, setClips } = useMedia();
  const { requestAccess } = useAdGate();
  const [phase, setPhase] = useState<Phase>("config");
  const [progress, setProgress] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [sens, setSens] = useState(1); // index into SENS
  const runningRef = useRef(false);

  useEffect(() => {
    if (!open) {
      runningRef.current = false;
      setPhase("config");
      setProgress(0);
      setFoundCount(0);
    }
  }, [open]);

  const run = async () => {
    if (runningRef.current) return;
    // Unique video media referenced by the timeline.
    const videoMediaIds = Array.from(new Set(clips.map((c) => c.mediaId))).filter((id) => {
      const m = getMediaById(id);
      return m && m.type === "video";
    });
    if (videoMediaIds.length === 0) {
      toast.error("أضف مقطع فيديو للتحليل");
      setPhase("error");
      return;
    }
    if (!(await requireOnline("القص الذكي"))) { onClose(); return; }
    const granted = await requestAccess("smart-cut", 5);
    if (!granted) { onClose(); return; }

    runningRef.current = true;
    setPhase("analyzing");
    setProgress(0);
    const timer = setInterval(() => setProgress((p) => Math.min(0.9, p + 0.03)), 120);
    const { thresholdDb, minSilenceMs } = SENS[sens];

    try {
      // Analyze every unique video clip and remember its silence points.
      const cutsByMedia = new Map<string, number[]>();
      for (const mediaId of videoMediaIds) {
        const media = getMediaById(mediaId);
        if (!media?.file) continue;
        try {
          const cuts = await detectSilenceCutPoints(media.file, { thresholdDb, minSilenceMs });
          cutsByMedia.set(mediaId, cuts);
        } catch {
          cutsByMedia.set(mediaId, []);
        }
      }
      clearInterval(timer);
      setPhase("cutting");
      setProgress(0.95);

      let total = 0;
      setClips((prev) => {
        const next: Clip[] = [];
        for (const c of prev) {
          const cuts = cutsByMedia.get(c.mediaId);
          if (!cuts || cuts.length === 0) { next.push(c); continue; }
          const inner = cuts.filter((cu) => cu > c.in + 0.1 && cu < c.out - 0.1).sort((a, b) => a - b);
          if (inner.length === 0) { next.push(c); continue; }
          let prevPoint = c.in;
          for (const cu of inner) {
            next.push({ id: uid(), mediaId: c.mediaId, in: prevPoint, out: cu });
            prevPoint = cu;
            total++;
          }
          next.push({ id: uid(), mediaId: c.mediaId, in: prevPoint, out: c.out });
        }
        return next;
      });

      setFoundCount(total);
      setProgress(1);
      setPhase("done");
      try { navigator.vibrate?.(20); } catch { /* ignore */ }
      if (total > 0) toast.success(`تم اكتشاف ${total} نقطة صمت وتقطيع الفيديو`);
      else toast.info("لم يتم اكتشاف فترات صمت كافية");
    } catch (e) {
      clearInterval(timer);
      console.error(e);
      setPhase("error");
      toast.error("فشل تحليل الصوت");
    } finally {
      runningRef.current = false;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-8" dir="rtl">
      <button onClick={onClose} className="absolute top-5 left-5 w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
        <X className="w-5 h-5 text-foreground" />
      </button>

      {/* Icon pulse */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center glow-primary">
          {phase === "done" ? (
            <Check className="w-10 h-10 text-primary-foreground" />
          ) : phase === "config" ? (
            <Scissors className="w-10 h-10 text-primary-foreground" />
          ) : (
            <AudioWaveform className="w-10 h-10 text-primary-foreground animate-pulse" />
          )}
        </div>
        {phase !== "done" && phase !== "error" && phase !== "config" && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
            <span className="absolute -inset-3 rounded-full border border-primary/20 animate-ping" style={{ animationDelay: "300ms" }} />
          </>
        )}
      </div>

      <h3 className="font-heading font-bold text-lg text-foreground mb-1">
        {phase === "config" && "القص الذكي"}
        {phase === "analyzing" && "جارٍ تحليل الصوت..."}
        {phase === "cutting" && "إزالة مناطق الصمت..."}
        {phase === "done" && "اكتمل القص الذكي"}
        {phase === "error" && "تعذّر التحليل"}
      </h3>
      <p className="text-xs text-muted-foreground mb-6 text-center max-w-xs">
        {phase === "done"
          ? foundCount > 0 ? `تم تقطيع الفيديو على ${foundCount} نقطة صمت` : "لا توجد فترات صمت كافية"
          : "يكتشف الذكاء الاصطناعي لحظات الصمت في كل المقاطع ويقطعها تلقائياً"}
      </p>

      {/* Config: sensitivity picker */}
      {phase === "config" && (
        <div className="w-full max-w-xs space-y-4 mb-6">
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-primary" /> حساسية اكتشاف الصمت
            </p>
            <div className="flex gap-2">
              {SENS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setSens(i)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                    sens === i ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              الحساسية الأعلى تقطع فترات صمت أقصر وأخف.
            </p>
          </div>
          <button
            onClick={run}
            className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm glow-primary flex items-center justify-center gap-2"
          >
            <Wand2 className="w-4 h-4" /> بدء القص الذكي
          </button>
        </div>
      )}

      {/* Equalizer bars while working */}
      {(phase === "analyzing" || phase === "cutting") && (
        <div className="flex items-end gap-1 h-10 mb-6">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full gradient-primary"
              style={{
                height: `${20 + Math.abs(Math.sin((i + 1) * 1.3)) * 80}%`,
                animation: `pulse 0.8s ease-in-out ${i * 60}ms infinite alternate`,
              }}
            />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {(phase === "analyzing" || phase === "cutting") && (
        <div className="w-full max-w-xs h-2 rounded-full bg-secondary overflow-hidden mb-6">
          <div className="h-full gradient-primary rounded-full transition-all duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {(phase === "done" || phase === "error") && (
        <button onClick={onClose} className="px-8 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm glow-primary flex items-center gap-2">
          <Wand2 className="w-4 h-4" /> تم
        </button>
      )}
    </div>
  );
};

export default SmartCutOverlay;
