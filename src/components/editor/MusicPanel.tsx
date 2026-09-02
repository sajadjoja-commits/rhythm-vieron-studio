import { useRef, useState, useEffect, useMemo } from "react";
import { useMedia, AudioFxType } from "@/context/MediaContext";
import { Upload, Music2, Sparkles, Mic, Wand2, X, Loader2, Activity, Scissors, Plus, Check, Eye, EyeOff, Play, Pause, Trash2, Image as ImageIcon, Link, Film, Clock } from "lucide-react";
import { toast } from "sonner";
import { extractVideoAudioFile } from "@/lib/extractVideoAudio";
import { analyzeBeats, analyzeBeatsFromUrl } from "@/lib/audioAnalysis";
import { BUILTIN_SFX, buildBuiltinSfx, BuiltinSfxName } from "@/lib/audioFx";
import { BUILTIN_TRACKS, BuiltinTrack, getSavedLibraryTracks, saveLibraryTrack, removeLibraryTrack, getGenreCoverImage, fetchSupabaseMusicTracks, generateSvgCoverFallback } from "@/lib/builtinMusic";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { AIToolsPanel } from "@/components/editor/AIToolsPanel";
import { runSmartBeatMontage } from "@/lib/autoMontage";

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
  const { media, audioTracks, setClips, addFiles, addAudioTrack, updateAudioTrack, splitClipsAtBeats, audioBeats, setAudioBeats, selectedAudioTrackId, setSelectedAudioTrackId, videoMuted, setVideoMuted, videoVolume, setVideoVolume, videoAudioFx, setVideoAudioFx, totalDuration } = useMedia();
  const [tab, setTab] = useState<"music" | "sfx" | "fx" | "beat" | "ai">("music");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [beatProgress, setBeatProgress] = useState(0);
  const [beatProgressText, setBeatProgressText] = useState("");
  const [beatDensity, setBeatDensity] = useState<1 | 2 | 4>(1);
  const [beatThreshold, setBeatThreshold] = useState<number>(3);
  const [beatMode, setBeatMode] = useState<"grid" | "raw">("grid");
  const [beatDurationPreset, setBeatDurationPreset] = useState<"auto" | "15" | "30" | "60" | "custom">("auto");
  const [customBeatDuration, setCustomBeatDuration] = useState<number>(30);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const en = getLang() === "en";

  // Filter video and photo media for multi-media beat selection
  const videoAndImageMedia = media.filter((m) => m.type === "video" || m.type === "image");
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);

  const activeAudioTrack = (selectedAudioTrackId ? audioTracks.find((t) => t.id === selectedAudioTrackId) : null) || audioTracks[0];

  // Selected media footage duration and active music track duration
  const targetMedia = videoAndImageMedia.filter((m) => selectedMediaIds.includes(m.id));
  const totalSelectedFootageDuration = targetMedia.reduce((acc, m) => acc + (m.duration || 5), 0);
  const activeMusicDuration = activeAudioTrack?.duration || 0;

  // Auto-calculated duration based on music length vs footage length:
  // if music is shorter than combined footage, use music's full duration;
  // if music is longer than available footage, use the shorter of the two.
  const autoCalculatedDuration = useMemo(() => {
    if (activeMusicDuration > 0 && totalSelectedFootageDuration > 0) {
      if (activeMusicDuration <= totalSelectedFootageDuration) {
        return activeMusicDuration;
      }
      return Math.min(activeMusicDuration, totalSelectedFootageDuration);
    }
    return activeMusicDuration > 0 ? activeMusicDuration : (totalSelectedFootageDuration > 0 ? totalSelectedFootageDuration : 15);
  }, [activeMusicDuration, totalSelectedFootageDuration]);

  const effectiveTargetDuration = useMemo(() => {
    if (beatDurationPreset === "auto") return autoCalculatedDuration;
    if (beatDurationPreset === "15") return 15;
    if (beatDurationPreset === "30") return 30;
    if (beatDurationPreset === "60") return 60;
    if (beatDurationPreset === "custom") return Math.max(3, customBeatDuration);
    return autoCalculatedDuration;
  }, [beatDurationPreset, autoCalculatedDuration, customBeatDuration]);

  // Estimated beat count within effective target duration
  const estimatedBeatsInTarget = useMemo(() => {
    const beatsList = activeAudioTrack?.beats || audioBeats || [];
    if (beatsList.length === 0) return 0;
    return beatsList.filter((b) => b <= effectiveTargetDuration).length;
  }, [activeAudioTrack?.beats, audioBeats, effectiveTargetDuration]);

  // Auto-sync selectedMediaIds when media items change
  useEffect(() => {
    const videoAndImg = media.filter((m) => m.type === "video" || m.type === "image");
    if (videoAndImg.length > 0) {
      setSelectedMediaIds((prev) => {
        const validPrev = prev.filter((id) => videoAndImg.some((m) => m.id === id));
        if (validPrev.length === 0) {
          return videoAndImg.map((m) => m.id);
        }
        return validPrev;
      });
    } else {
      setSelectedMediaIds([]);
    }
  }, [media]);

  // Music library state with iconic genre covers and audio preview player
  const [libraryTracks, setLibraryTracks] = useState<BuiltinTrack[]>(() => [
    ...getSavedLibraryTracks(),
    ...BUILTIN_TRACKS,
  ]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchSupabaseMusicTracks().then((supabaseTracks) => {
      if (active) {
        const saved = getSavedLibraryTracks();
        const map = new Map<string, BuiltinTrack>();
        [...supabaseTracks, ...saved].forEach((t) => map.set(t.id, t));
        setLibraryTracks(Array.from(map.values()));
      }
    });

    return () => {
      active = false;
      audioPreviewRef.current?.pause();
    };
  }, []);

  const togglePreview = (tr: BuiltinTrack) => {
    playSfx("click");
    if (previewingId === tr.id) {
      audioPreviewRef.current?.pause();
      setPreviewingId(null);
      return;
    }

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }

    const a = new Audio(tr.url);
    a.volume = 0.85;
    a.onended = () => setPreviewingId(null);
    a.onerror = () => {
      toast.error(en ? "Failed to play audio preview" : "تعذر تشغيل الصوت المعاين");
      setPreviewingId(null);
    };
    audioPreviewRef.current = a;
    void a.play().then(() => setPreviewingId(tr.id)).catch(() => setPreviewingId(null));
  };

  const onCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPendingCoverUrl(url);
    toast.success(en ? "Cover image attached" : "تمت إضافة صورة الغلاف للموسيثى");
  };

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
      const cleanTitle = f.name.replace(/\.[^/.]+$/, "");
      
      const iconicCover = getGenreCoverImage("other", cleanTitle);
      
      const newTrack: BuiltinTrack = {
        id: `track-${Date.now()}`,
        title: cleanTitle,
        titleEn: cleanTitle,
        artist: en ? "Uploaded Track" : "أغنية مضافة",
        url,
        coverUrl: iconicCover,
        bpm: 120,
        duration: dur,
        genre: "other",
        color: "#a855f7",
      };

      saveLibraryTrack(newTrack);
      setLibraryTracks([...getSavedLibraryTracks(), ...BUILTIN_TRACKS]);

      addAudioTrack({
        name: cleanTitle,
        url,
        file: f,
        coverUrl: iconicCover,
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
      toast.success(en ? "Saved track to library and added to timeline" : "تمت إضافة الموسيقى للمكتبة والشريط الزمني");
    } catch (err) {
      console.error(err);
      toast.error(en ? "Failed to upload audio file" : "فشل تحميل ملف الصوت");
    } finally { setBusy(false); }
  };

  const onAddBuiltin = async (track: BuiltinTrack) => {
    setBusy(true);
    try {
      const dur = await getAudioDuration(track.url);
      const coverUrl = track.coverUrl || getGenreCoverImage(track.genre, track.title);
      addAudioTrack({
        name: getLang() === "en" ? track.titleEn : track.title,
        url: track.url,
        coverUrl,
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

  // Helper to run beat analysis on the active/selected audio track
  const analyzeCurrentAudioTrack = async () => {
    const t = activeAudioTrack;
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

    // Save beats and bpm specifically to this track
    updateAudioTrack(t.id, { beats: beatsOnTimeline, bpm: info.bpm });

    return { info, beatsOnTimeline, track: t };
  };

  // 1. Detect & Show Beats on Timeline ONLY (No cutting)
  const onDetectBeatsOnly = async () => {
    const en = getLang() === "en";
    const t = activeAudioTrack;
    if (!t) { toast.error(en ? "Add music first" : "أضف موسيقى أولاً"); return; }
    setBusy(true);
    setBeatProgress(5);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const res = await analyzeCurrentAudioTrack();
      if (res) {
        setAudioBeats(res.beatsOnTimeline);
        setSelectedAudioTrackId(res.track.id);
        toast.success(
          en
            ? `[${res.track.name}] BPM ≈ ${res.info.bpm} — ${res.beatsOnTimeline.length} beats mapped to selected track`
            : `[${res.track.name}] BPM ≈ ${res.info.bpm} — تم كشف ${res.beatsOnTimeline.length} ضربة وإظهارها على المسار المحدد فقط`
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

  // 2. Cut Selected Video Clips at Detected Beats with AI Smart Scene Selection
  const onCutAtBeats = async () => {
    const en = getLang() === "en";
    const t = activeAudioTrack;
    if (!t) { toast.error(en ? "Add music first" : "أضف موسيقى أولاً"); return; }

    const targetMedia = videoAndImageMedia.filter((m) => selectedMediaIds.includes(m.id));
    if (targetMedia.length === 0) {
      toast.error(en ? "Please select at least 1 video or photo clip" : "يرجى اختيار مقطع ميديا واحد على الأقل للتقطيع");
      return;
    }

    setBusy(true);
    setBeatProgress(5);
    setBeatProgressText(en ? "Starting AI moment analysis..." : "بدء تحليل المشاهد الذكي...");
    await new Promise((r) => setTimeout(r, 60));
    try {
      let targetBeats = t.beats || audioBeats;
      if (!targetBeats || targetBeats.length === 0) {
        setBeatProgressText(en ? "Detecting audio rhythm beats..." : "كشف إيقاع الموسيقى...");
        const res = await analyzeCurrentAudioTrack();
        if (res) {
          targetBeats = res.beatsOnTimeline;
          setAudioBeats(targetBeats);
        }
      }
      if (targetBeats && targetBeats.length > 0) {
        const res = await runSmartBeatMontage({
          media: targetMedia,
          beatTimes: targetBeats,
          targetDuration: effectiveTargetDuration,
          fastMode: true,
          onProgress: (info) => {
            setBeatProgress(info.percent);
            setBeatProgressText(en ? info.messageEn : info.messageAr);
          },
        });

        if (res.clips.length > 0) {
          setClips(res.clips);
          playSfx("success");
          toast.success(
            en
              ? `Smart Cut complete! ${res.clips.length} cuts synchronized across ${targetMedia.length} clips (${res.totalDuration.toFixed(1)}s).`
              : `تم التقطيع الذكي! ${res.clips.length} قطع متزامن عبر ${targetMedia.length} مقاطع بطول (${res.totalDuration.toFixed(1)} ثانية).`
          );
        } else {
          toast.error(en ? "No valid segments generated" : "لم يتم توليد مقاطع صالحة");
        }
      } else {
        toast.error(en ? "No beats found to cut" : "لم يتم العثور على إيقاعات للتقطيع");
      }
    } catch (e) {
      console.error(e);
      toast.error(en ? "Auto-cut failed" : "فشل التقطيع التلقائي");
    } finally {
      setBusy(false);
      setBeatProgress(0);
      setBeatProgressText("");
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
          { id: "ai", label: en ? "AI Audio" : "أدوات AI", Icon: Sparkles },
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
        {tab === "ai" && (
          <AIToolsPanel
            open={tab === "ai"}
            onClose={() => setTab("music")}
            mediaType="audio"
            currentMediaUrlOrBase64={audioTracks[0]?.url || undefined}
            onApplyResult={(resData) => {
              if (resData?.outputAudioBase64OrUrl) {
                addAudioTrack({
                  name: en ? "AI Processed Audio" : "صوت معالج بالذكاء الاصطناعي",
                  url: resData.outputAudioBase64OrUrl,
                  start: currentTime,
                  offset: 0,
                  duration: totalDuration || 10,
                  sourceDuration: totalDuration || 10,
                  volume: 1.0,
                  muted: false,
                  fx: "none",
                  color: "#8b5cf6",
                  kind: "music",
                });
                toast.success(en ? "Added AI Audio Track!" : "تمت إضافة مسار الصوت المعالج بالذكاء الاصطناعي!");
              }
            }}
          />
        )}
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

            {/* Upload Section */}
            <button
              disabled={busy}
              onClick={onUploadClick}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-card border border-border hover:border-primary/50 shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl gradient-primary text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                  <Upload className="w-4 h-4 text-white" />
                </div>
                <div className="text-start">
                  <p className="text-xs font-bold text-foreground">{en ? "Upload Music / Song" : "رفع أغنية أو موسيقى"}</p>
                  <p className="text-[10px] text-muted-foreground">MP3 / WAV / AAC / M4A</p>
                </div>
              </div>
              {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </button>
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onUpload} />

            <button
              disabled={busy}
              onClick={onExtractFromVideo}
              className="w-full flex items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all"
            >
              <Mic className="w-4 h-4 text-emerald-400" />
              <div className="flex-1 text-right">
                <p className="text-xs font-bold text-foreground">{en ? "Extract audio from video" : "استخراج صوت من الفيديو"}</p>
                <p className="text-[10px] text-muted-foreground">{en ? "Adds original video audio track on timeline" : "يضيف الصوت كمسار قابل للتحرير"}</p>
              </div>
              {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </button>

            {/* Music & Songs Library */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-primary" />
                  <span>{en ? "Music & Songs Library" : "مكتبة الموسيقى والأغاني"}</span>
                </p>
                <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-secondary">
                  {libraryTracks.length} {en ? "tracks" : "مقطع"}
                </span>
              </div>

              <div className="space-y-2">
                {libraryTracks.map((tr) => {
                  const coverSrc = tr.coverUrl || getGenreCoverImage(tr.genre, tr.title);
                  return (
                    <div
                      key={tr.id}
                      className={`p-2.5 rounded-2xl border transition-all ${
                        previewingId === tr.id
                          ? "bg-primary/10 border-primary/50 shadow-md"
                          : "bg-card border-border/80 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Iconic Genre Cover Image + Overlaid Play Preview Button */}
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-secondary border border-border/60 shrink-0 group shadow-inner flex items-center justify-center">
                          <img
                            src={coverSrc}
                            alt={tr.title}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = generateSvgCoverFallback(tr.title, tr.genre);
                            }}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />

                          {/* Overlaid Play/Pause button for instant preview */}
                          <button
                            onClick={() => togglePreview(tr)}
                            className="absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center transition-all opacity-90 group-hover:opacity-100"
                            title={en ? "Listen preview" : "الاستماع والتجربة قبل الإضافة"}
                          >
                            {previewingId === tr.id ? (
                              <Pause className="w-5 h-5 text-white animate-pulse" />
                            ) : (
                              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                            )}
                          </button>
                        </div>

                        {/* Info & Track Path */}
                        <div className="flex-1 min-w-0 text-start space-y-0.5">
                          <p className="text-xs font-bold text-foreground truncate">
                            {en ? tr.titleEn || tr.title : tr.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">{tr.artist || (en ? "Audio Track" : "مقطع صوتي")}</p>
                        </div>

                        {/* Controls: Add to timeline button */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            disabled={busy}
                            onClick={() => onAddBuiltin(tr)}
                            className="px-2.5 py-1.5 rounded-xl gradient-primary text-white text-[10px] font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                            title={en ? "Add to Timeline" : "إضافة إلى الشريط الزمني"}
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>{en ? "Add" : "إضافة"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Preview status indicator bar */}
                      {previewingId === tr.id && (
                        <div className="mt-2 flex items-center justify-between px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold animate-pulse">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                            {en ? "Listening to preview..." : "جاري الاستماع والمعاينة قبل الإضافة..."}
                          </span>
                          <button onClick={() => togglePreview(tr)} className="underline text-[9px] hover:text-primary-foreground">
                            {en ? "Stop" : "إيقاف"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {libraryTracks.length === 0 && (
                  <div className="text-center py-8 px-4 rounded-2xl bg-card/50 border border-dashed border-border space-y-2">
                    <Music2 className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                    <p className="text-xs font-semibold text-foreground">
                      {en ? "No music tracks in library" : "لا توجد أغاني أو موسيقى حالياً بالمكتبة"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {en ? "Upload your MP3/WAV tracks above with cover art to build your music library." : "قم برفع ملفاتك الصوتية والأغاني أعلاه مع إضافة صورة غلاف لبناء مكتبتك الخاصة."}
                    </p>
                  </div>
                )}
              </div>
            </div>


            {/* Original video volume control */}
            <div className="p-3 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">{en ? "Original Video Audio" : "صوت الفيديو الأصلي"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-primary px-2 py-0.5 rounded-full bg-primary/10">
                    {Math.round(videoVolume * 100)}
                  </span>
                  <button
                    onClick={() => setVideoMuted(!videoMuted)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold ${videoMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"}`}
                  >
                    {videoMuted ? (en ? "Muted" : "مكتوم") : (en ? "Mute" : "كتم")}
                  </button>
                </div>
              </div>
              <input
                type="range" min={0} max={1000} step={1} value={Math.round(videoVolume * 100)}
                onChange={(e) => setVideoVolume(parseFloat(e.target.value) / 100)}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
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
                  type="range" min={0} max={1000} step={1} value={Math.round(videoVolume * 100)}
                  onChange={(e) => setVideoVolume(parseFloat(e.target.value) / 100)}
                  className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-[10px] font-extrabold text-primary w-10 text-end">{Math.round(videoVolume * 100)}</span>
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
                {audioTracks.map((t) => {
                  return (
                    <div key={t.id} className="p-3 rounded-xl bg-card border border-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-foreground truncate min-w-0 flex-1">{t.name}</p>
                        <span className="text-[9px] font-extrabold text-primary px-2 py-0.5 rounded-full bg-primary/10 shrink-0">
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
                            type="range" min={0} max={1000} step={1} value={Math.round((t.volume ?? 1) * 100)}
                            onChange={(e) => updateAudioTrack(t.id, { volume: parseFloat(e.target.value) / 100 })}
                            className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                          <span className="text-[10px] font-extrabold text-primary w-10 text-end">{Math.round((t.volume ?? 1) * 100)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {tab === "beat" && (
          <div className="space-y-3.5 bg-secondary/20 p-3 rounded-2xl border border-border/40">
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {getLang() === "en"
                ? "Analyzes music beats for the selected audio track and syncs video moments to its rhythm"
                : "يحلل إيقاع مسار الموسيقى المحدد ويزامن لقطات الفيديو مع ضرباته بدقة"}
            </p>

            {/* 0. Audio Track Selector (when multiple tracks exist or to confirm target track) */}
            <div className="space-y-2 bg-card/75 p-2.5 rounded-xl border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {getLang() === "en" ? "Selected Audio Track" : "المسار الصوتي المستهدف للتحليل"}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {audioTracks.length} {getLang() === "en" ? "tracks" : "مسارات"}
                </span>
              </div>

              {audioTracks.length === 0 ? (
                <div className="p-3 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center gap-1 text-center bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground">
                    {getLang() === "en" ? "No audio track added yet" : "لم يتم إضافة أي مقطع صوتي أو موسيقي بعد"}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="px-3 py-1 rounded-lg gradient-primary text-primary-foreground text-[10px] font-bold shadow-sm transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{getLang() === "en" ? "Upload Audio" : "رفع موسيقى"}</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {audioTracks.map((t) => {
                    const isSelected = activeAudioTrack?.id === t.id;
                    const trackBeatCount = t.beats?.length ?? 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedAudioTrackId(t.id);
                          if (t.beats && t.beats.length > 0) {
                            setAudioBeats(t.beats);
                          }
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-all text-start ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                            : "border-border/60 bg-secondary/40 hover:bg-secondary/70 opacity-70"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color || "#6366f1" }}
                          />
                          <div className="min-w-0 flex flex-col">
                            <span className="text-[11px] font-bold text-foreground truncate max-w-[160px]">
                              {t.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              {Math.round(t.duration)}s {t.bpm ? `• BPM ${t.bpm}` : ""}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {trackBeatCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 text-[9px] font-mono font-bold">
                              {trackBeatCount} {getLang() === "en" ? "beats" : "ضربة"}
                            </span>
                          )}
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                              isSelected ? "gradient-primary text-primary-foreground shadow-sm" : "bg-muted text-transparent"
                            }`}
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 1. Multi-Media Selection Gallery */}
            <div className="space-y-2 bg-card/75 p-2.5 rounded-xl border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {getLang() === "en"
                      ? `Select Clips for Beat Cut (${selectedMediaIds.length}/${videoAndImageMedia.length})`
                      : `اختر المقاطع للتقطيع (${selectedMediaIds.length}/${videoAndImageMedia.length})`}
                  </span>
                </span>
                {videoAndImageMedia.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedMediaIds.length === videoAndImageMedia.length) {
                        setSelectedMediaIds([]);
                      } else {
                        setSelectedMediaIds(videoAndImageMedia.map((m) => m.id));
                      }
                    }}
                    className="text-[10px] font-bold text-primary hover:underline transition-all"
                  >
                    {selectedMediaIds.length === videoAndImageMedia.length
                      ? (getLang() === "en" ? "Deselect All" : "إلغاء التحديد")
                      : (getLang() === "en" ? "Select All" : "تحديد الكل")}
                  </button>
                )}
              </div>

              {videoAndImageMedia.length === 0 ? (
                <div className="p-3 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center gap-1.5 text-center bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground">
                    {getLang() === "en" ? "No video or photo clips in project" : "لا توجد فيديوهات أو صور في المشروع بعد"}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="px-3 py-1 rounded-lg gradient-primary text-primary-foreground text-[10px] font-bold shadow-sm transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{getLang() === "en" ? "Upload Media" : "رفع مقاطع فيديو/صور"}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {videoAndImageMedia.map((m) => {
                    const isSelected = selectedMediaIds.includes(m.id);
                    const isVideo = m.type === "video";
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMediaIds((prev) =>
                            prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                          );
                        }}
                        className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/40 scale-105 shadow-md"
                            : "border-border/60 opacity-50 hover:opacity-90"
                        }`}
                        title={m.name}
                      >
                        {m.thumbnail || m.url ? (
                          <img
                            src={m.thumbnail || m.url}
                            alt={m.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                            <Film className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}

                        <div
                          className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                            isSelected ? "gradient-primary text-primary-foreground shadow-sm" : "bg-black/60 text-white/50"
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>

                        <div className="absolute bottom-0.5 inset-x-0.5 px-1 py-0.5 rounded bg-black/80 text-[8px] font-mono font-bold text-white flex items-center justify-between">
                          <span>{isVideo ? "VID" : "IMG"}</span>
                          <span>{m.duration ? `${Math.round(m.duration)}s` : ""}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Target Output Duration / Length Control */}
            <div className="space-y-2 bg-card/75 p-2.5 rounded-xl border border-border/60">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>{getLang() === "en" ? "Target Output Duration" : "مدة الفيديو المستهدفة للقص"}</span>
                </p>
                <span className="text-[10px] font-extrabold text-primary px-2 py-0.5 rounded-full bg-primary/10 font-mono">
                  {effectiveTargetDuration.toFixed(1)}s
                </span>
              </div>

              {/* Preset Buttons */}
              <div className="grid grid-cols-5 gap-1">
                {[
                  { id: "auto" as const, labelAr: "تلقائي ذكي", labelEn: "Auto", descAr: "وفق المسار", descEn: "Smart" },
                  { id: "15" as const, labelAr: "15 ثانية", labelEn: "15s", descAr: "Shorts", descEn: "Stories" },
                  { id: "30" as const, labelAr: "30 ثانية", labelEn: "30s", descAr: "Reels", descEn: "Reels" },
                  { id: "60" as const, labelAr: "60 ثانية", labelEn: "60s", descAr: "مونتاج", descEn: "Montage" },
                  { id: "custom" as const, labelAr: "مخصص", labelEn: "Custom", descAr: "يدوي", descEn: "Custom" },
                ].map((p) => {
                  const isSelected = beatDurationPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { playSfx("click"); setBeatDurationPreset(p.id); }}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-center border transition-all ${
                        isSelected
                          ? "gradient-primary text-primary-foreground border-primary shadow-sm ring-1 ring-primary/40 font-bold"
                          : "bg-secondary/40 border-border/60 text-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <span className="text-[10px] leading-tight font-extrabold">{getLang() === "en" ? p.labelEn : p.labelAr}</span>
                      <span className={`text-[8px] leading-tight mt-0.5 opacity-80 ${isSelected ? "text-white/90" : "text-muted-foreground"}`}>
                        {getLang() === "en" ? p.descEn : p.descAr}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Duration Slider */}
              {beatDurationPreset === "custom" && (
                <div className="pt-2 border-t border-border/40 space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground font-semibold">
                      {getLang() === "en" ? "Custom Length:" : "تحديد المدة يدوياً:"}
                    </span>
                    <span className="font-mono font-bold text-primary text-xs">
                      {customBeatDuration} {getLang() === "en" ? "seconds" : "ثانية"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={180}
                    step={1}
                    value={customBeatDuration}
                    onChange={(e) => setCustomBeatDuration(Number(e.target.value))}
                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[8px] text-muted-foreground font-mono">
                    <span>5s</span>
                    <span>30s</span>
                    <span>60s</span>
                    <span>120s</span>
                    <span>180s</span>
                  </div>
                </div>
              )}

              {/* Calculated Duration & Footage Information Card */}
              <div className="p-2 rounded-lg bg-secondary/30 border border-border/50 space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Music2 className="w-3 h-3 text-cyan-400" />
                    <span>{getLang() === "en" ? "Music Duration:" : "مدة مسار الموسيقى:"}</span>
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {activeMusicDuration > 0 ? `${activeMusicDuration.toFixed(1)}s` : (getLang() === "en" ? "Not added" : "غير محدد")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Film className="w-3 h-3 text-amber-400" />
                    <span>{getLang() === "en" ? "Combined Footage:" : "إجمالي مدة المقاطع المحددة:"}</span>
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {totalSelectedFootageDuration.toFixed(1)}s ({targetMedia.length} {getLang() === "en" ? "clips" : "مقاطع"})
                  </span>
                </div>
                <div className="h-px bg-border/40" />
                <div className="flex items-center justify-between text-primary font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span>{getLang() === "en" ? "Final Video Output Length:" : "طول الفيديو النهائي الناتج:"}</span>
                  </span>
                  <span className="font-mono text-xs font-black text-primary">
                    {effectiveTargetDuration.toFixed(1)}s
                    {beatDurationPreset === "auto" && ` (${getLang() === "en" ? "Auto-Fit" : "ملاءمة تلقائية"})`}
                  </span>
                </div>
                {estimatedBeatsInTarget > 0 && (
                  <div className="flex items-center justify-between text-[9px] text-emerald-400">
                    <span>{getLang() === "en" ? "Estimated beat-cuts in duration:" : "عدد القطعات المتوقعة على الإيقاع:"}</span>
                    <span className="font-mono font-bold">~{estimatedBeatsInTarget} {getLang() === "en" ? "cuts" : "قطعة"}</span>
                  </div>
                )}
              </div>
            </div>

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
              {totalSelectedFootageDuration > 180 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-500 font-medium">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0 animate-pulse text-amber-400" />
                  <span>
                    {getLang() === "en"
                      ? `Long footage (${Math.round(totalSelectedFootageDuration)}s) detected: using adaptive turbo analysis.`
                      : `مقاطع طويلة (${Math.round(totalSelectedFootageDuration)} ثانية): سيتم تطبيق التحليل السريع الذكي لتفادي البطء.`}
                  </span>
                </div>
              )}

              {busy && (
                <div className="p-3 rounded-xl bg-card border border-primary/30 flex flex-col gap-2 shadow-inner animate-pulse">
                  <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>{beatProgressText || (getLang() === "en" ? "Analyzing in background..." : "جاري التحليل في الخلفية...")}</span>
                    </span>
                    <span className="font-mono text-primary font-extrabold">{beatProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full gradient-primary transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(5, Math.min(100, beatProgress))}%` }}
                    />
                  </div>
                </div>
              )}

              {audioBeats && audioBeats.length > 0 && (
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary">
                  <span>
                    {getLang() === "en"
                      ? `${audioBeats.length} beat points active on timeline`
                      : `نقاط الإيقاع المضيئة على المسار: ${audioBeats.length} ضربة`}
                  </span>
                  <button
                    onClick={() => {
                      if (activeAudioTrack) {
                        updateAudioTrack(activeAudioTrack.id, { beats: [] });
                      }
                      setAudioBeats([]);
                    }}
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
