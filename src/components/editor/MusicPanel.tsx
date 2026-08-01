import { useRef, useState, useEffect } from "react";
import { useMedia, AudioFxType } from "@/context/MediaContext";
import { Upload, Music2, Sparkles, Mic, Wand2, X, Loader2, Activity, Scissors, Plus, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { extractVideoAudioFile } from "@/lib/extractVideoAudio";
import { analyzeBeats, analyzeBeatsFromUrl } from "@/lib/audioAnalysis";
import { BUILTIN_SFX, buildBuiltinSfx, BuiltinSfxName } from "@/lib/audioFx";
import { BUILTIN_TRACKS, BuiltinTrack } from "@/lib/builtinMusic";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface Props {
  open: boolean;
  onClose: () => void;
  currentTime: number;
}

const ALL_FX_OPTIONS: { id: AudioFxType; label: string; labelEn: string; icon: string; descAr: string; descEn: string }[] = [
  { id: "none", label: "طبيعي", labelEn: "Normal", icon: "🎙️", descAr: "الصوت الأصلي بدون تغيير", descEn: "Original voice" },
  { id: "robot", label: "روبوت آلي", labelEn: "Robot", icon: "🤖", descAr: "صوت معدني مستقبلِي", descEn: "Futuristic robot" },
  { id: "chipmunk", label: "سنجاب حاد", labelEn: "Chipmunk", icon: "🐿️", descAr: "صوت كرتوني نبرة عالية", descEn: "High-pitched cartoon" },
  { id: "deep", label: "وحش عميق", labelEn: "Monster Deep", icon: "👹", descAr: "صوت ضخم وعميق جداً", descEn: "Heavy monster bass" },
  { id: "female", label: "أنثوي ناعم", labelEn: "Female Tone", icon: "👩", descAr: "نبرة ناعمة مرتفعة", descEn: "High-register soft tone" },
  { id: "male", label: "رجالي فخم", labelEn: "Male Tone", icon: "👨", descAr: "تضخيم النبرة والجهارة", descEn: "Warm male-register" },
  { id: "megaphone", label: "مكبر صوت", labelEn: "Megaphone", icon: "📢", descAr: "تأثير الميكروفون الميداني", descEn: "Loudspeaker horn" },
  { id: "alien", label: "فضائي غريب", labelEn: "Alien", icon: "👽", descAr: "ذبذبات فضائية غريبة", descEn: "Cosmic modulated" },
  { id: "underwater", label: "تحت الماء", labelEn: "Underwater", icon: "🌊", descAr: "صوت مكتوم مغمور", descEn: "Submerged audio" },
  { id: "echo", label: "صدى صوت", labelEn: "Echo Delay", icon: "🔊", descAr: "ترديد وتكرار بالصوت", descEn: "Rhythmic echo delay" },
  { id: "studio", label: "استديو نقاء", labelEn: "Studio Clarity", icon: "🎛️", descAr: "معالجة هادئة ونقاء", descEn: "Acoustic room clarity" },
  { id: "reverb", label: "قاعة صدى", labelEn: "Concert Hall", icon: "🏛️", descAr: "صوت قاعة واسعة", descEn: "Large hall echo" },
  { id: "telephone", label: "هاتف قديم", labelEn: "Telephone", icon: "📞", descAr: "تصفية صوت المكالمات", descEn: "Vintage phone call" },
];

const MusicPanel = ({ open, onClose, currentTime }: Props) => {
  const { media, audioTracks, addAudioTrack, updateAudioTrack, splitClipsAtBeats, audioBeats, setAudioBeats, videoMuted, setVideoMuted, videoVolume, setVideoVolume, videoAudioFx, setVideoAudioFx, totalDuration } = useMedia();
  const [tab, setTab] = useState<"music" | "sfx" | "fx" | "beat">("music");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [beatProgress, setBeatProgress] = useState(0);
  const [beatDensity, setBeatDensity] = useState<1 | 2 | 4>(1);
  const [beatThreshold, setBeatThreshold] = useState<number>(3);
  const [beatMode, setBeatMode] = useState<"grid" | "raw">("grid");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const en = getLang() === "en";

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open) return null;

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir={en ? "ltr" : "rtl"}>
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Audio Tracks:" : "مسارات الصوت:"}</span>
            <span className="text-primary font-extrabold">{audioTracks.length}</span>
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

  const onUploadClick = () => fileRef.current?.click();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setBusy(true);
    try {
      const url = URL.createObjectURL(f);
      const dur = await getAudioDuration(url);
      addAudioTrack({
        name: f.name,
        url,
        file: f,
        start: currentTime,
        offset: 0,
        duration: dur,
        sourceDuration: dur,
        volume: 0.8,
        muted: false,
        fx: "none",
        color: "#a855f7",
        kind: "music",
      });
    } catch (err) {
      console.error(err);
      toast.error(en ? "Failed to upload audio file" : "فشل تحميل ملف الصوت");
    } finally { setBusy(false); }
  };

  const onAddBuiltin = async (track: BuiltinTrack) => {
    setBusy(true);
    try {
      const dur = await getAudioDuration(track.url);
      addAudioTrack({
        name: getLang() === "en" ? track.titleEn : track.title,
        url: track.url,
        start: currentTime,
        offset: 0,
        duration: dur,
        sourceDuration: dur,
        volume: 0.8,
        muted: false,
        fx: "none",
        color: track.color,
        kind: "music",
      });
      toast.success(getLang() === "en" ? "Track added" : "تمت إضافة المقطع");
    } catch (e) {
      console.error(e);
      toast.error(getLang() === "en" ? "Failed to add track" : "فشل إضافة المقطع");
    } finally {
      setBusy(false);
    }
  };

  const onExtractFromVideo = async () => {
    const videos = media.filter((m) => m.type === "video");
    if (!videos.length) { toast.error(en ? "No videos found to extract audio from" : "لا يوجد فيديو لاستخراج صوته"); return; }
    setBusy(true);
    try {
      for (const v of videos) {
        const file = await extractVideoAudioFile(v.file, `${v.name}.audio.wav`);
        const url = URL.createObjectURL(file);
        const dur = await getAudioDuration(url);
        addAudioTrack({
          name: en ? `Audio ${v.name}` : `صوت ${v.name}`,
          url, file, start: 0, offset: 0,
          duration: dur, sourceDuration: dur,
          volume: 0.9, muted: false, fx: "none",
          color: "#10b981", kind: "video-audio",
        });
      }
      toast.success(en ? "Audio extracted successfully — feel free to mute the original video" : "تم استخراج الصوت — يمكنك حذف صوت الفيديو الأصلي إذا أردت");
    } catch (err) {
      console.error(err);
      toast.error(en ? "Failed to extract audio" : "فشل استخراج الصوت");
    } finally { setBusy(false); }
  };

  const onAddSfx = async (name: BuiltinSfxName, label: string, labelEn: string) => {
    setBusy(true);
    try {
      const { url, duration } = (await buildBuiltinSfx(name)) as any;
      addAudioTrack({
        name: en ? labelEn : label, url, start: currentTime, offset: 0,
        duration, sourceDuration: duration,
        volume: 0.8, muted: false, fx: "none",
        color: "#f59e0b", kind: "sfx",
      });
    } catch (e) { console.error(e); toast.error(en ? "Failed to add effect" : "فشل إضافة المؤثر"); }
    finally { setBusy(false); }
  };

  // Helper to run beat analysis on the current audio track
  const analyzeCurrentAudioTrack = async () => {
    const t = audioTracks[0];
    if (!t) return null;
    const info = t.file 
      ? await analyzeBeats(t.file, { threshold: beatThreshold, mode: beatMode }, (p) => setBeatProgress(Math.min(99, Math.round(p)))) 
      : await analyzeBeatsFromUrl(t.url, { threshold: beatThreshold, mode: beatMode }, (p) => setBeatProgress(Math.min(99, Math.round(p))));
    const step = beatDensity;
    const picked = info.beats.filter((_, i) => i % step === 0);
    const beatsOnTimeline = picked
      .filter((b) => b >= t.offset && b <= t.offset + t.duration)
      .map((b) => t.start + (b - t.offset))
      .filter((b) => b > 0 && b < totalDuration);
    return { info, beatsOnTimeline };
  };

  // 1. Detect & Show Beats on Timeline ONLY (No cutting)
  const onDetectBeatsOnly = async () => {
    const en = getLang() === "en";
    const t = audioTracks[0];
    if (!t) { toast.error(en ? "Add music first" : "أضف موسيقى أولاً"); return; }
    setBusy(true);
    setBeatProgress(5);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const res = await analyzeCurrentAudioTrack();
      if (res) {
        setAudioBeats(res.beatsOnTimeline);
        toast.success(
          en
            ? `BPM ≈ ${res.info.bpm} — ${res.beatsOnTimeline.length} beats shown on timeline`
            : `BPM ≈ ${res.info.bpm} — تم كشف ${res.beatsOnTimeline.length} ضربة وإظهارها على المسار`
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(en ? "Beat analysis failed" : "فشل تحليل الإيقاع");
    } finally {
      setBusy(false);
      setBeatProgress(0);
    }
  };

  // 2. Cut Video Clips at Detected Beats
  const onCutAtBeats = async () => {
    const en = getLang() === "en";
    const t = audioTracks[0];
    if (!t) { toast.error(en ? "Add music first" : "أضف موسيقى أولاً"); return; }
    setBusy(true);
    setBeatProgress(5);
    await new Promise((r) => setTimeout(r, 60));
    try {
      let targetBeats = audioBeats;
      if (!targetBeats || targetBeats.length === 0) {
        const res = await analyzeCurrentAudioTrack();
        if (res) {
          targetBeats = res.beatsOnTimeline;
          setAudioBeats(targetBeats);
        }
      }
      if (targetBeats && targetBeats.length > 0) {
        splitClipsAtBeats(targetBeats);
        toast.success(
          en
            ? `Video cut at ${targetBeats.length} beat points!`
            : `تم تقطيع الفيديو على ${targetBeats.length} نقطة إيقاع!`
        );
      } else {
        toast.error(en ? "No beats found to cut" : "لم يتم العثور على إيقاعات للتقطيع");
      }
    } catch (e) {
      console.error(e);
      toast.error(en ? "Auto-cut failed" : "فشل التقطيع التلقائي");
    } finally {
      setBusy(false);
      setBeatProgress(0);
    }
  };


  return (
    <div className="fixed inset-x-0 bottom-0 mx-2 rounded-t-3xl bg-popover border border-border border-b-0 shadow-2xl glass z-50 animate-scale-in" dir={en ? "ltr" : "rtl"}>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onUpload} />
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Music2 className="w-4 h-4 text-primary animate-pulse" />
          <span>{en ? "Audio & Music Library" : "مكتبة الصوت والموسيقى"}</span>
        </span>
        <div className="flex items-center gap-2">
          {/* Collapse to see work button */}
          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(true); }}
            className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-[10px] font-bold text-foreground transition-all active:scale-90"
            title={en ? "Minimize library to preview work" : "إخفاء لرؤية العمل"}
          >
            <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{en ? "See Work" : "رؤية العمل"}</span>
          </button>

          <button 
            onClick={() => { playSfx("success"); onClose(); }} 
            className="w-6 h-6 rounded-md gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
            title={en ? "Confirm Selection" : "تأكيد الاختيار"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button onClick={() => { playSfx("click"); onClose(); }} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto no-scrollbar">
        {[
          { id: "music", label: en ? "Music" : "موسيقى", Icon: Music2 },
          { id: "sfx", label: en ? "SFX" : "مؤثرات", Icon: Sparkles },
          { id: "fx", label: en ? "Voice Changer" : "تغيير الصوت", Icon: Wand2 },
          { id: "beat", label: en ? "Beat" : "إيقاع", Icon: Activity },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap ${
              tab === t.id ? "gradient-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <t.Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3 max-h-[40vh] overflow-y-auto">
        {tab === "music" && (
          <div className="space-y-2">
            {audioTracks.length > 0 && (
              <button
                disabled={busy}
                onClick={() => { playSfx("click"); setTab("beat"); }}
                className="w-full flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-indigo-500/15 via-primary/15 to-purple-500/15 border border-primary/40 hover:border-primary transition-all active:scale-[0.98] group"
              >
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0 shadow-md">
                  <Activity className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span>{en ? "Detect Music Beats & Auto Cut" : "كشف الإيقاعات والقص التلقائي"}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-extrabold">{audioTracks.length} {en ? "active" : "نشط"}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{en ? "Analyze audio BPM & match video cuts automatically" : "تحليل إيقاع الموسيقى وقص الفيديو تلقائياً على الضربة"}</p>
                </div>
                <Scissors className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:scale-110" />
              </button>
            )}

            <button
              disabled={busy}
              onClick={onUploadClick}
              className="w-full flex items-center gap-2 p-3 rounded-xl bg-card border border-dashed border-primary/50"
            >
              <Upload className="w-4 h-4 text-primary" />
              <div className="flex-1 text-right">
                <p className="text-xs font-bold text-foreground">{en ? "Upload music from device" : "رفع موسيقى من الجهاز"}</p>
                <p className="text-[10px] text-muted-foreground">MP3 / WAV / AAC</p>
              </div>
              {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </button>
            <button
              disabled={busy}
              onClick={onExtractFromVideo}
              className="w-full flex items-center gap-2 p-3 rounded-xl bg-card border border-border"
            >
              <Mic className="w-4 h-4 text-emerald-400" />
              <div className="flex-1 text-right">
                <p className="text-xs font-bold text-foreground">{en ? "Extract audio from video" : "استخراج صوت من الفيديو"}</p>
                <p className="text-[10px] text-muted-foreground">{en ? "Adds original video audio track on timeline" : "يضيف الصوت كمسار قابل للتحرير"}</p>
              </div>
              {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </button>

            {/* Built-in library */}
            <div className="pt-1">
              <p className="text-[11px] font-bold text-foreground mb-2">
                {getLang() === "en" ? "Built-in music" : "موسيقى مدمجة"}
              </p>
              <div className="space-y-1.5">
                {BUILTIN_TRACKS.map((tr) => (
                  <button
                    key={tr.id}
                    disabled={busy}
                    onClick={() => onAddBuiltin(tr)}
                    className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-card border border-border hover:border-primary/50 disabled:opacity-50"
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tr.color}22` }}>
                      <Music2 className="w-4 h-4" style={{ color: tr.color }} />
                    </span>
                    <div className="flex-1 text-start min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">
                        {getLang() === "en" ? tr.titleEn : tr.title}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{tr.bpm} BPM</p>
                    </div>
                    <Plus className="w-4 h-4 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            </div>


            {/* Original video volume control */}
            <div className="p-3 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">{en ? "Original Video Audio" : "صوت الفيديو الأصلي"}</span>
                <button
                  onClick={() => setVideoMuted(!videoMuted)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${videoMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"}`}
                >
                  {videoMuted ? (en ? "Muted" : "مكتوم") : (en ? "Mute" : "كتم")}
                </button>
              </div>
              <input
                type="range" min={0} max={1} step={0.01} value={videoVolume}
                onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        {tab === "sfx" && (
          <div className="grid grid-cols-3 gap-2">
            {BUILTIN_SFX.map((s) => (
              <button
                key={s.name}
                disabled={busy}
                onClick={() => onAddSfx(s.name, s.label, s.labelEn)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border hover:border-primary/50"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold text-foreground">{en ? s.labelEn : s.label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "fx" && (
          <div className="space-y-4">
            {/* Main Video Voice Changer Section (Always Available) */}
            <div className="p-3.5 rounded-2xl bg-card border border-primary/30 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white shadow-sm">
                    <Mic className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>{en ? "Original Video Voice Changer" : "مؤثرات وتغيير صوت الفيديو الأصلي"}</span>
                      {videoAudioFx !== "none" && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-black animate-pulse">
                          {en ? "Active" : "مُفعّل"}
                        </span>
                      )}
                    </h4>
                    <p className="text-[9px] text-muted-foreground">
                      {en ? "Applies voice filter directly to the video track audio" : "يغير نبرة وصوت الفيديو الأصلي حتى بدون إضافة موسيقى"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => { playSfx("click"); setVideoMuted(!videoMuted); }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 ${
                    videoMuted ? "bg-destructive/20 text-destructive border border-destructive/30" : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  {videoMuted ? (en ? "Unmute Video" : "إلغاء الكتم") : (en ? "Mute Video" : "كتم الفيديو")}
                </button>
              </div>

              {/* Volume Slider for Video Audio */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-bold text-muted-foreground w-14 shrink-0">{en ? "Volume:" : "مستوى الصوت:"}</span>
                <input
                  type="range" min={0} max={1} step={0.01} value={videoVolume}
                  onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-[10px] font-extrabold text-primary w-8 text-end">{Math.round(videoVolume * 100)}%</span>
              </div>

              {/* Voice Effect Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {ALL_FX_OPTIONS.map((fx) => {
                  const active = videoAudioFx === fx.id;
                  return (
                    <button
                      key={fx.id}
                      onClick={() => {
                        playSfx("click");
                        setVideoAudioFx(fx.id);
                        toast.success(
                          en 
                            ? `Video voice set to: ${fx.labelEn}` 
                            : `تم تغيير صوت الفيديو إلى: ${fx.label}`
                        );
                      }}
                      className={`flex flex-col items-start p-2.5 rounded-xl border text-start transition-all active:scale-[0.97] relative group ${
                        active
                          ? "bg-primary/15 border-primary shadow-md ring-1 ring-primary/40"
                          : "bg-secondary/40 border-border/60 hover:bg-secondary/80 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">{fx.icon}</span>
                        {active && (
                          <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-foreground leading-tight">
                        {en ? fx.labelEn : fx.label}
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">
                        {en ? fx.descEn : fx.descAr}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Additional Timeline Audio Tracks (If present) */}
            {audioTracks.length > 0 && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-[11px] font-bold text-foreground px-1 flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-primary" />
                  <span>{en ? "Added Audio & Music Tracks" : "مسارات الصوت والموسيقى المضافة"}</span>
                </p>
                {audioTracks.map((t) => (
                  <div key={t.id} className="p-3 rounded-xl bg-card border border-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-foreground truncate">{t.name}</p>
                      <span className="text-[9px] font-extrabold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                        {ALL_FX_OPTIONS.find((f) => f.id === t.fx)?.[en ? "labelEn" : "label"] || t.fx}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {ALL_FX_OPTIONS.map((fx) => (
                        <button
                          key={fx.id}
                          onClick={() => {
                            playSfx("click");
                            updateAudioTrack(t.id, { fx: fx.id });
                          }}
                          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                            t.fx === fx.id ? "gradient-primary text-white shadow-sm" : "bg-secondary text-foreground hover:bg-secondary/80"
                          }`}
                        >
                          <span className="text-xs">{fx.icon}</span>
                          <span className="truncate">{en ? fx.labelEn : fx.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-muted-foreground w-12">{en ? "Volume" : "المستوى"}</span>
                      <input
                        type="range" min={0} max={1} step={0.01} value={t.volume}
                        onChange={(e) => updateAudioTrack(t.id, { volume: parseFloat(e.target.value) })}
                        className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="text-[10px] font-extrabold text-primary w-8 text-end">{Math.round((t.volume ?? 1) * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "beat" && (
          <div className="space-y-3.5 bg-secondary/20 p-3 rounded-2xl border border-border/40">
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {getLang() === "en"
                ? "Analyzes the first music track and automatically cuts video clips matching the beats"
                : "يحلل المسار الموسيقي الأول ويقص مقاطع الفيديو تلقائياً لتتطابق مع ضربات الإيقاع"}
            </p>

            {/* Detection Mode */}
            <div>
              <p className="text-[11px] font-bold text-foreground mb-1.5">
                {getLang() === "en" ? "Detection Mode" : "وضع الكشف عن الإيقاع"}
              </p>
              <div className="flex gap-1.5">
                {[
                  { id: "grid" as const, ar: "شبكة منتظمة (BPM)", en: "Steady Grid (BPM)" },
                  { id: "raw" as const, ar: "نقرات حقيقية (Transients)", en: "Dynamic Transients" }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setBeatMode(mode.id)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all duration-150 ${
                      beatMode === mode.id ? "gradient-primary text-primary-foreground shadow-md" : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {getLang() === "en" ? mode.en : mode.ar}
                  </button>
                ))}
              </div>
            </div>

            {/* Sensitivity Threshold */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-bold text-foreground">
                  {getLang() === "en" ? "Detection Sensitivity" : "قوة وحساسية الكشف"}
                </p>
                <span className="text-[10px] font-extrabold text-primary">
                  {beatThreshold === 1 && (getLang() === "en" ? "Very Sensitive" : "حساس جداً (كل نقرة)")}
                  {beatThreshold === 2 && (getLang() === "en" ? "Sensitive" : "حساس")}
                  {beatThreshold === 3 && (getLang() === "en" ? "Standard" : "متوسط متزن")}
                  {beatThreshold === 4 && (getLang() === "en" ? "Strict" : "صارم")}
                  {beatThreshold === 5 && (getLang() === "en" ? "Heavy Beats Only" : "الضربات القوية فقط")}
                </span>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setBeatThreshold(lvl)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      beatThreshold === lvl ? "gradient-primary text-primary-foreground scale-105" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Density */}
            <div>
              <p className="text-[11px] font-bold text-foreground mb-1.5">
                {getLang() === "en" ? "Cut frequency" : "معدل تكرار القص"}
              </p>
              <div className="flex gap-1.5">
                {([
                  { v: 1 as const, ar: "كل ضربة", en: "Every beat" },
                  { v: 2 as const, ar: "كل ضربتين", en: "Every 2nd beat" },
                  { v: 4 as const, ar: "كل 4 ضربات", en: "Every 4th beat" },
                ]).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setBeatDensity(o.v)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${
                      beatDensity === o.v ? "gradient-primary text-primary-foreground shadow-sm" : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {getLang() === "en" ? o.en : o.ar}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons: Separate Beat Detection vs Auto-Cut */}
            <div className="flex flex-col gap-2 pt-1">
              {audioBeats && audioBeats.length > 0 && (
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary">
                  <span>
                    {getLang() === "en"
                      ? `${audioBeats.length} beat points active on timeline`
                      : `نقاط الإيقاع المضيئة على المسار: ${audioBeats.length} ضربة`}
                  </span>
                  <button
                    onClick={() => setAudioBeats([])}
                    className="text-muted-foreground hover:text-destructive text-[9px] underline"
                  >
                    {getLang() === "en" ? "Clear" : "إخفاء Points"}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onDetectBeatsOnly}
                  disabled={busy || !audioTracks.length}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl bg-secondary hover:bg-secondary/80 border border-primary/30 text-foreground text-xs font-bold disabled:opacity-40 transition-transform active:scale-[0.98] shadow-sm"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <Activity className="w-4 h-4 text-primary animate-pulse" />
                  )}
                  <span className="truncate">
                    {getLang() === "en" ? "1. Detect Beats Only" : "1. كشف وإظهار الإيقاع"}
                  </span>
                </button>

                <button
                  onClick={onCutAtBeats}
                  disabled={busy || !audioTracks.length}
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl gradient-primary text-primary-foreground text-xs font-bold disabled:opacity-40 transition-transform active:scale-[0.98] shadow-md"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Scissors className="w-4 h-4" />
                  )}
                  <span className="truncate">
                    {getLang() === "en" ? "2. Auto-Cut Video" : "2. قص الفيديو على الضربة"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom margin padding */}
        <div className="pt-2"></div>
      </div>
    </div>
  );
};

const getAudioDuration = (url: string): Promise<number> =>
  new Promise((res) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => res(a.duration || 0);
    a.onerror = () => res(0);
    a.src = url;
  });

export default MusicPanel;
