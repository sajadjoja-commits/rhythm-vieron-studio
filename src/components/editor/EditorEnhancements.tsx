import { useMemo, useState } from "react";
import { Activity, Layers3, Music2, Sparkles, Wand2, X, Zap } from "lucide-react";
import { useMedia, VfxType } from "@/context/MediaContext";
import { toast } from "sonner";

const EFFECTS: Array<{ type: VfxType; label: string; side: "in" | "out" | "both" }> = [
  { type: "light-leak", label: "Light Leak", side: "in" },
  { type: "zoom-pulse", label: "Zoom Pulse", side: "both" },
  { type: "motion-blur-streak", label: "Motion Blur", side: "both" },
  { type: "flash", label: "Flash", side: "out" },
  { type: "glitch-slice", label: "Glitch Slice", side: "out" },
  { type: "vintage-sepia-bloom", label: "Sepia Bloom", side: "in" },
  { type: "shake", label: "Shake", side: "out" },
  { type: "prism", label: "Prism", side: "both" },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function EditorEnhancements() {
  const media = useMedia();
  const [open, setOpen] = useState(false);
  const [beatMode, setBeatMode] = useState<"all" | "every2" | "every4">("every2");
  const [effectDuration, setEffectDuration] = useState(0.45);

  if (typeof window !== "undefined" && window.location.pathname !== "/") return null;

  const beatCount = media.audioBeats?.length ?? 0;
  const usableBeats = useMemo(() => {
    const beats = (media.audioBeats ?? []).filter((b) => Number.isFinite(b) && b >= 0 && b <= media.totalDuration);
    const step = beatMode === "all" ? 1 : beatMode === "every4" ? 4 : 2;
    return beats.filter((_, index) => index % step === 0);
  }, [media.audioBeats, media.totalDuration, beatMode]);

  const splitOnBeats = () => {
    if (!usableBeats.length) {
      toast.error("حلّل الموسيقى أولاً حتى تظهر الإيقاعات.");
      return;
    }
    media.splitClipsAtBeats(usableBeats);
    toast.success(`تم ضبط التقطيع على ${usableBeats.length} إيقاع.`);
  };

  const addEffectToAllCuts = (type: VfxType, edge: "in" | "out") => {
    if (!media.clips.length) {
      toast.error("أضف مقاطع إلى الـ Timeline أولاً.");
      return;
    }
    let cursor = 0;
    let added = 0;
    for (const clip of media.clips) {
      const duration = Math.max(0, clip.out - clip.in) / (clip.speed && clip.speed > 0 ? clip.speed : 1);
      if (duration <= 0) continue;
      const d = clamp(effectDuration, 0.12, Math.min(1.5, duration));
      const start = edge === "in" ? cursor : Math.max(cursor, cursor + duration - d);
      const end = edge === "in" ? Math.min(cursor + duration, cursor + d) : cursor + duration;
      media.addVfx({ type, start, end, intensity: 0.75 });
      cursor += duration;
      added++;
    }
    toast.success(`تم تطبيق المؤثر على ${added} مقطع.`);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-24 right-3 z-[70] flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-xl" aria-label="Editor enhancements">
        <Wand2 className="h-4 w-4" /> أدوات ذكية
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-2 z-[70] w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /><b className="text-sm">Editor Toolkit</b></div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto p-3">
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2"><Music2 className="h-4 w-4" /><span className="text-sm font-semibold">Beat Cut</span><span className="ml-auto text-[10px] text-white/50">{beatCount} beats</span></div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["all", "every2", "every4"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setBeatMode(mode)} className={`rounded-lg px-2 py-2 text-[11px] ${beatMode === mode ? "bg-white text-black" : "bg-white/5 text-white/70"}`}>{mode === "all" ? "كل Beat" : mode === "every2" ? "كل 2" : "كل 4"}</button>
            ))}
          </div>
          <button type="button" onClick={splitOnBeats} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold hover:bg-indigo-400"><Zap className="h-4 w-4" /> تقطيع ذكي على الإيقاع</button>
          <p className="mt-2 text-[10px] leading-4 text-white/45">يستخدم الإيقاعات المحللة الموجودة أصلاً، بدون تحميل مكتبة صوت إضافية.</p>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2"><Layers3 className="h-4 w-4" /><span className="text-sm font-semibold">Entrance / Exit FX</span></div>
          <label className="mb-2 block text-[10px] text-white/50">مدة المؤثر: {effectDuration.toFixed(2)}s</label>
          <input className="mb-3 w-full" type="range" min="0.12" max="1.5" step="0.03" value={effectDuration} onChange={(e) => setEffectDuration(Number(e.target.value))} />
          <div className="grid grid-cols-2 gap-2">
            {EFFECTS.map((fx) => (
              <div key={fx.type} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <div className="mb-2 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /><span className="text-[11px]">{fx.label}</span></div>
                <div className="grid grid-cols-2 gap-1">
                  {(fx.side === "in" || fx.side === "both") && <button type="button" onClick={() => addEffectToAllCuts(fx.type, "in")} className="rounded bg-white/10 px-1 py-1 text-[9px]">دخول الكل</button>}
                  {(fx.side === "out" || fx.side === "both") && <button type="button" onClick={() => addEffectToAllCuts(fx.type, "out")} className="rounded bg-white/10 px-1 py-1 text-[9px]">خروج الكل</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[10px] leading-4 text-white/50">
          <div className="mb-1 flex items-center gap-1 text-white/80"><Wand2 className="h-3.5 w-3.5" /> بدون Assets ثقيلة</div>
          معاينات الانتقالات والمؤثرات تُرسم بـ Canvas/metadata داخل التطبيق، لذلك لا نضيف صور JPG/PNG لكل مؤثر ولا نكبّر حجم APK.
        </section>
      </div>
    </div>
  );
}
