import { useEffect, useRef, useState } from "react";
import { Sparkles, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMedia } from "@/context/MediaContext";
import { getLang } from "@/lib/i18n";
import { MOTION_PRESETS, type MotionCategory } from "@/lib/motionGraphics";
import { analyzeTimelineEnergy, directMotion, type DirectorStyle } from "@/lib/motionDirector";
import MotionGraphicCanvas from "./MotionGraphicCanvas";
import { toast } from "sonner";

export default function MotionLibrary({ currentTime, selectedId, onSelect }: { currentTime: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const { clips, media, overlays, setOverlays, updateOverlay, totalDuration } = useMedia();
  const en = getLang() === "en";
  const [script, setScript] = useState("");
  const [style, setStyle] = useState<DirectorStyle>("auto");
  const [category, setCategory] = useState<MotionCategory>("text");
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const selected = overlays.find(o => o.id === selectedId && o.type === "motion");
  const categories: { id: MotionCategory; label: string }[] = [
    { id: "text", label: en ? "Text" : "نصوص" }, { id: "shape", label: en ? "Shapes" : "أشكال" },
    { id: "intro", label: en ? "Intros" : "مقدمات" }, { id: "3d", label: "3D" }, { id: "sticker", label: en ? "Stickers" : "ملصقات" },
  ];
  const generate = async () => {
    if (!script.trim() || !totalDuration || !clips.length || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller; setProgress(0);
    try {
      const timeline = clips.map(c => {
        const m = media.find(item => item.id === c.mediaId);
        if (!m) throw new Error("Missing source");
        return { url: c.useProcessed !== false ? c.processedUrl || m.processedUrl || m.url : c.originalUrl || m.originalUrl || m.url, type: m.type, in: c.in, out: c.out, speed: c.speed };
      });
      const energy = await analyzeTimelineEnergy(timeline, controller.signal, p => setProgress(Math.round(p * 90)));
      if (controller.signal.aborted) return;
      const items = directMotion({ script, duration: totalDuration, energy, style, idPrefix: `director-${Date.now()}` });
      setOverlays(prev => [...prev.filter(o => !o.id.startsWith("director-")), ...items]);
      if (items[0]) onSelect(items[0].id);
      toast.success(en ? `Created ${items.length} motion layers` : `تم إنشاء ${items.length} طبقة موشن`);
    } catch (error) {
      if (!controller.signal.aborted) toast.error(en ? "Video analysis failed. No layers were replaced; you can add effects manually." : "تعذر تحليل الفيديو؛ طبقاتك بقيت محفوظة وتكدر تضيف الحركات يدوياً.");
    } finally { abortRef.current = null; setProgress(null); }
  };
  return <div className="space-y-4">
    <div className="space-y-2">
      <label htmlFor="motion-script" className="text-xs font-semibold">{en ? "Script" : "السكربت"}</label>
      <Textarea id="motion-script" value={script} onChange={e => setScript(e.target.value)} maxLength={5000} disabled={progress !== null} className="min-h-20" />
      <label htmlFor="motion-style" className="text-xs">{en ? "Style" : "الأسلوب"}</label>
      <select id="motion-style" value={style} onChange={e => setStyle(e.target.value as DirectorStyle)} disabled={progress !== null} className="w-full rounded-md border border-input bg-background text-foreground p-2 text-xs">
        <option value="auto">{en ? "Automatic" : "تلقائي"}</option><option value="energetic">{en ? "Energetic" : "حماسي"}</option><option value="cinematic">{en ? "Cinematic" : "سينمائي"}</option><option value="minimal">{en ? "Minimal" : "بسيط"}</option>
      </select>
      <div className="flex gap-2">
        <Button onClick={generate} disabled={!script.trim() || !totalDuration || progress !== null} className="flex-1 text-xs"><Sparkles className="w-4 h-4 mr-1" />{progress !== null ? `${progress}%` : en ? "Analyze & create locally" : "تحليل وإنشاء محلي"}{progress !== null && <Loader2 className="w-4 h-4 animate-spin" />}</Button>
        {progress !== null && <Button variant="outline" size="icon" onClick={() => abortRef.current?.abort()} aria-label={en ? "Cancel" : "إلغاء"}><X className="w-4 h-4" /></Button>}
      </div>
    </div>
    <div className="flex gap-1 flex-wrap" role="tablist" aria-label={en ? "Motion category" : "نوع الموشن"}>{categories.map(c => <Button key={c.id} role="tab" aria-selected={category === c.id} variant={category === c.id ? "default" : "ghost"} size="sm" className="text-xs px-2" onClick={() => setCategory(c.id)}>{c.label}</Button>)}</div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{MOTION_PRESETS.filter(p => p.category === category).map(p => <Button key={p.id} variant="outline" className="h-auto min-h-14 text-xs justify-start whitespace-normal gap-2" disabled={!totalDuration} onClick={() => {
      const start = Math.min(currentTime, Math.max(0, totalDuration - 0.1));
      const id = `motion-${crypto.randomUUID()}`;
      setOverlays(prev => [...prev, { id, type: "motion", url: "", name: en ? p.nameEn : p.name, motion: { preset: p.id, ...p.defaults }, start, end: Math.min(totalDuration, start + p.defaultDuration), x: 50, y: 50, scale: 1, opacity: 1, rotation: 0, blend: "normal" }]);
      onSelect(id);
    }}><Plus className="w-3 h-3 shrink-0" />{en ? p.nameEn : p.name}</Button>)}</div>
    {selected?.motion && <div className="space-y-3 border-t border-border pt-3">
      <div className="flex justify-center overflow-hidden bg-secondary/30 rounded-md"><MotionGraphicCanvas overlay={selected} currentTime={Math.max(selected.start + 0.8, Math.min(currentTime, selected.end - 0.1))} /></div>
      <label className="block text-xs">{en ? "Text" : "النص"}<Input value={selected.motion.text ?? ""} onChange={e => updateOverlay(selected.id, { motion: { ...selected.motion, preset: selected.motion?.preset ?? "pop-title", text: e.target.value } })} /></label>
      <label className="block text-xs">{en ? "Secondary text" : "النص الفرعي"}<Input value={selected.motion.subText ?? ""} onChange={e => updateOverlay(selected.id, { motion: { ...selected.motion, preset: selected.motion?.preset ?? "pop-title", subText: e.target.value } })} /></label>
      <div className="flex gap-4">{(["color", "accent"] as const).map(key => <label key={key} className="flex items-center gap-2 text-xs">{key === "color" ? en ? "Text color" : "لون النص" : en ? "Accent" : "لون المؤثر"}<input type="color" aria-label={key === "color" ? en ? "Text color" : "لون النص" : en ? "Accent" : "لون المؤثر"} value={selected.motion?.[key] ?? (key === "color" ? "#ffffff" : "#ff3d71")} onChange={e => updateOverlay(selected.id, { motion: { ...selected.motion, preset: selected.motion?.preset ?? "pop-title", [key]: e.target.value } })} className="h-8 w-8 rounded border border-border bg-background" /></label>)}</div>
    </div>}
  </div>;
}