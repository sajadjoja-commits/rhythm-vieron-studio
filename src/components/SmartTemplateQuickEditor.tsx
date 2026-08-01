import { useState, useEffect, useRef, useMemo } from "react";
import { 
  ArrowRight, Video, Image as ImageIcon, Download, Play, Pause, 
  Sparkles, RefreshCw, Type, Music, Lock, Check, Loader2, Volume2, VolumeX, 
  Plus, Trash2, Wand2, Sliders, Film, Share2, Layers, Zap, Clock, Disc
} from "lucide-react";
import { SMART_TEMPLATES, SmartTemplate } from "@/lib/smartTemplates";
import { BUILTIN_TRACKS, BuiltinTrack } from "@/lib/builtinMusic";
import { useMedia, Clip, MediaItem } from "@/context/MediaContext";
import { runAutoMontage, MontageResult } from "@/lib/autoMontage";
import ExportDialog from "@/components/editor/ExportDialog";
import PublishTemplateDialog from "@/components/editor/PublishTemplateDialog";
import { toast } from "sonner";
import { isRTL } from "@/lib/i18n";

interface Props {
  initialTemplate?: SmartTemplate | null;
  onBack: () => void;
  onOpenFullEditor?: () => void;
}

const aspectRatios = [
  { label: "9:16", w: 9, h: 16 },
  { label: "16:9", w: 16, h: 9 },
  { label: "1:1", w: 1, h: 1 },
  { label: "4:5", w: 4, h: 5 },
];

const durationOptions = [
  { value: 15, label: "15s", sub: "Reels / TikTok" },
  { value: 30, label: "30s", sub: "Standard" },
  { value: 45, label: "45s", sub: "Long Story" },
  { value: 60, label: "60s", sub: "Full Montage" },
];

export default function SmartTemplateQuickEditor({ initialTemplate, onBack, onOpenFullEditor }: Props) {
  const {
    media, clips, addFiles, setClips, setFilters, setVfx, setCaptions, setCaptionStyle,
    addAudioTrack, setAudioTracks, audioTracks, totalDuration, resolveTimelineTime,
    getMediaById, setProjectName
  } = useMedia();

  // Wizard Flow Step: "setup" (Steps 1-4) | "analyzing" | "result"
  const [step, setStep] = useState<"setup" | "analyzing" | "result">("setup");
  const [setupSubStep, setSetupSubStep] = useState<1 | 2 | 3 | 4>(1);

  // Selected Options
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(
    media.length > 0 ? media.map(m => m.id) : []
  );
  const [selectedTemplate, setSelectedTemplate] = useState<SmartTemplate>(
    initialTemplate || SMART_TEMPLATES[0]
  );
  const [selectedTrack, setSelectedTrack] = useState<BuiltinTrack | null>(BUILTIN_TRACKS[0]);
  const [targetDuration, setTargetDuration] = useState<number>(selectedTemplate.ai.targetDuration || 30);
  const [musicVolume, setMusicVolume] = useState<number>(0.8);
  const [videoAudioMuted, setVideoAudioMuted] = useState<boolean>(false);
  const [activeRatioIndex, setActiveRatioIndex] = useState<number>(0);

  // Analysis / Montage State
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [analysisStatusText, setAnalysisStatusText] = useState("");
  const [montageResult, setMontageResult] = useState<MontageResult | null>(null);

  // Playback & Dialogs
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [replacingClipId, setReplacingClipId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>();

  // Ensure newly added media items are selected
  useEffect(() => {
    if (media.length > 0 && selectedMediaIds.length === 0) {
      setSelectedMediaIds(media.map(m => m.id));
    }
  }, [media, selectedMediaIds.length]);

  // Sync title
  useEffect(() => {
    setProjectName(`Quick ${selectedTemplate.nameEn}`);
  }, [selectedTemplate, setProjectName]);

  // Handle Playhead
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setCurrentTime((t) => {
        const next = t + dt;
        if (next >= (totalDuration || targetDuration || 5)) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, totalDuration, targetDuration]);

  // Upload new files to media library
  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const newIds = await addFiles(Array.from(files));
      if (newIds && newIds.length > 0) {
        setSelectedMediaIds((prev) => [...prev, ...newIds]);
        toast.success(isRTL() ? `تم إضافة ${newIds.length} ملفات` : `Added ${newIds.length} files`);
      }
    } catch {
      toast.error(isRTL() ? "فشل رفع الملفات" : "Failed to upload files");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  // Toggle media selection
  const toggleMediaSelect = (id: string) => {
    setSelectedMediaIds((prev) => 
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Run Fast Auto Montage Engine
  const handleGenerateMontage = async () => {
    const itemsToProcess = media.filter((m) => selectedMediaIds.includes(m.id));
    if (itemsToProcess.length === 0) {
      toast.error(isRTL() ? "يرجى اختيار مقطع واحد على الأقل" : "Please select at least 1 video or photo");
      return;
    }

    setStep("analyzing");
    setAnalyzingProgress(15);
    setAnalysisStatusText(isRTL() ? "تحليل حركة الإطارات ومعالم المشاهد السريعة..." : "Fast analyzing motion & video keyframes...");

    try {
      await new Promise(r => setTimeout(r, 120));
      setAnalyzingProgress(45);
      setAnalysisStatusText(isRTL() ? "كشف الوجوه وتفاعل الحركة..." : "Detecting faces & key action points...");

      await new Promise(r => setTimeout(r, 150));
      setAnalyzingProgress(75);
      setAnalysisStatusText(isRTL() ? "تطابق القص على الإيقاع الموسيقي..." : "Syncing cuts to music beats...");

      const musicUrl = selectedTrack?.url || undefined;
      const res = await runAutoMontage(itemsToProcess, selectedTemplate, [], musicUrl, {
        fastMode: true,
        targetDuration
      });

      setAnalyzingProgress(100);
      setAnalysisStatusText(isRTL() ? "تم المونتاج بنجاح!" : "Montage generated!");

      // Update Media Context
      setClips(res.clips);
      setFilters(res.filters);
      setVfx(res.vfx);
      setCaptions(res.captions);
      if (res.captionStyle) setCaptionStyle(res.captionStyle);

      // Add Music Track
      if (selectedTrack) {
        setAudioTracks([{
          id: `track-${Date.now()}`,
          name: selectedTrack.titleEn,
          url: selectedTrack.url,
          start: 0,
          end: res.totalDuration,
          volume: musicVolume,
          audioIn: 0,
          audioOut: res.totalDuration
        }]);
      } else {
        setAudioTracks([]);
      }

      setMontageResult(res);
      setCurrentTime(0);
      setIsPlaying(true);
      setStep("result");
    } catch (err) {
      console.error(err);
      toast.error(isRTL() ? "حدث خطأ أثناء المونتاج الذكي" : "Failed to generate smart montage");
      setStep("setup");
    }
  };

  // Replace a specific clip slot media
  const handleTriggerReplace = (clipId: string) => {
    setReplacingClipId(clipId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingClipId) return;

    try {
      const mediaIds = await addFiles([file]);
      if (mediaIds && mediaIds.length > 0) {
        const newMediaId = mediaIds[0];
        setClips((prev) =>
          prev.map((c) => (c.id === replacingClipId ? { ...c, mediaId: newMediaId } : c))
        );
        toast.success(isRTL() ? "تم استبدال المقطع!" : "Clip replaced!");
      }
    } catch {
      toast.error(isRTL() ? "فشل استبدال المقطع" : "Failed to replace clip");
    } finally {
      setReplacingClipId(null);
      if (e.target) e.target.value = "";
    }
  };

  const ratio = aspectRatios[activeRatioIndex] || aspectRatios[0];
  const resolved = resolveTimelineTime(currentTime);
  const activeMedia = resolved ? getMediaById(resolved.clip.mediaId) : null;

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background text-foreground overflow-hidden select-none">
      {/* Hidden File Inputs */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        onChange={handleUploadFiles}
        className="hidden"
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="video/*,image/*"
        onChange={handleReplaceFileChange}
        className="hidden"
      />

      {/* Navigation Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
          >
            <ArrowRight className={`w-4 h-4 ${isRTL() ? "" : "rotate-180"}`} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-primary fill-primary/20" />
              <h1 className="font-heading font-bold text-sm text-foreground">
                {isRTL() ? "محرر القوالب الذكي (سريع)" : "Smart Templates Editor (Quick)"}
              </h1>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {step === "setup" 
                ? (isRTL() ? `خطوة ${setupSubStep} من 4` : `Step ${setupSubStep} of 4`)
                : step === "analyzing"
                ? (isRTL() ? "جاري المعالجة..." : "Processing...")
                : (isRTL() ? "معاينة المونتاج النهائي" : "Montage Preview & Touch-Up")}
            </p>
          </div>
        </div>

        {step === "result" && (
          <div className="flex items-center gap-2">
            {onOpenFullEditor && (
              <button
                onClick={onOpenFullEditor}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-bold transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>{isRTL() ? "المحرر الكامل" : "Full Editor"}</span>
              </button>
            )}

            <button
              onClick={() => setShowPublishModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>{isRTL() ? "نشر كقالب" : "Publish"}</span>
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground font-bold text-xs glow-primary-sm"
            >
              <Download className="w-4 h-4" />
              <span>{isRTL() ? "تصدير" : "Export"}</span>
            </button>
          </div>
        )}
      </div>

      {/* STEP 1: SETUP WIZARD (4 Steps) */}
      {step === "setup" && (
        <div className="flex-1 flex flex-col justify-between max-w-2xl mx-auto w-full p-4 overflow-y-auto">
          {/* Sub-step indicator pills */}
          <div className="flex items-center justify-between gap-2 mb-4 bg-secondary/30 p-1.5 rounded-2xl border border-border">
            {[
              { id: 1, label: isRTL() ? "الوسائط" : "Clips", icon: Video },
              { id: 2, label: isRTL() ? "الستايل" : "Style", icon: Sparkles },
              { id: 3, label: isRTL() ? "الموسيقى" : "Music", icon: Music },
              { id: 4, label: isRTL() ? "المدة" : "Duration", icon: Clock },
            ].map((s) => {
              const Icon = s.icon;
              const isActive = setupSubStep === s.id;
              const isDone = setupSubStep > s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSetupSubStep(s.id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? "gradient-primary text-primary-foreground shadow-sm"
                      : isDone
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* SUB-STEP 1: Select Media Clips */}
          {setupSubStep === 1 && (
            <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-heading font-bold text-sm text-foreground">
                    {isRTL() ? "1. اختر الفيديو والصور للمونتاج" : "1. Select Video Clips & Photos"}
                  </h2>
                  <button
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isRTL() ? "إضافة ملفات" : "Add Files"}</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {isRTL() ? "اختر المقاطع التي تريد تركيبها تلقائياً بالذكاء الاصطناعي" : "Choose the footage you want AI to automatically assemble"}
                </p>

                {media.length === 0 ? (
                  <div
                    onClick={() => mediaInputRef.current?.click()}
                    className="border-2 border-dashed border-border hover:border-primary/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-card/40"
                  >
                    <Video className="w-10 h-10 text-primary mb-2 opacity-60" />
                    <p className="font-heading font-bold text-sm text-foreground">{isRTL() ? "اضغط لرفع المقاطع والصور" : "Click to upload clips & photos"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{isRTL() ? "يدعم MP4, MOV, JPG, PNG" : "Supports MP4, MOV, JPG, PNG"}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto p-1">
                    {media.map((m) => {
                      const isSelected = selectedMediaIds.includes(m.id);
                      return (
                        <div
                          key={m.id}
                          onClick={() => toggleMediaSelect(m.id)}
                          className={`relative aspect-square rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/30 scale-[0.98]"
                              : "border-border opacity-60 hover:opacity-100"
                          }`}
                        >
                          {m.type === "video" ? (
                            <video src={m.url} className="w-full h-full object-cover" />
                          ) : (
                            <img src={m.url} alt="Media" className="w-full h-full object-cover" />
                          )}
                          <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSelected ? "gradient-primary text-primary-foreground" : "bg-black/50 text-white"
                          }`}>
                            {isSelected ? <Check className="w-3 h-3" /> : ""}
                          </div>
                          {m.duration > 0 && (
                            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] text-white font-mono">
                              {m.duration.toFixed(1)}s
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {isRTL() ? `تم تحديد ${selectedMediaIds.length} عنصر` : `${selectedMediaIds.length} items selected`}
                </span>
                <button
                  onClick={() => setSetupSubStep(2)}
                  disabled={selectedMediaIds.length === 0}
                  className="px-6 py-2.5 rounded-2xl gradient-primary text-primary-foreground font-bold text-xs disabled:opacity-40 shadow-sm"
                >
                  {isRTL() ? "التالي: الستايل" : "Next: Style"}
                </button>
              </div>
            </div>
          )}

          {/* SUB-STEP 2: Choose Template Style */}
          {setupSubStep === 2 && (
            <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
              <div>
                <h2 className="font-heading font-bold text-sm text-foreground mb-1">
                  {isRTL() ? "2. اختر نمط وستايل المونتاج" : "2. Choose Montage Style"}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {isRTL() ? "يحدد الستايل نوع الانتقالات، تصحيح الألوان، وسرعة القص" : "Determines transition types, color grading, and edit pace"}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-1">
                  {SMART_TEMPLATES.map((tpl) => {
                    const isSelected = selectedTemplate.id === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setSelectedTemplate(tpl)}
                        className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between relative overflow-hidden ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-md scale-[1.02]"
                            : "border-border bg-card/60 hover:border-border/80"
                        }`}
                        style={{ background: isSelected ? undefined : tpl.gradient + "15" }}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">{tpl.emoji}</span>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-[10px]">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <h3 className="font-heading font-bold text-xs text-foreground">{tpl.nameEn}</h3>
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{tpl.descEn}</p>
                        </div>

                        <div className="mt-3 flex items-center gap-1">
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-foreground font-semibold border border-border">
                            {tpl.transition}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => setSetupSubStep(1)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs"
                >
                  {isRTL() ? "السابق" : "Back"}
                </button>
                <button
                  onClick={() => setSetupSubStep(3)}
                  className="px-6 py-2.5 rounded-2xl gradient-primary text-primary-foreground font-bold text-xs shadow-sm"
                >
                  {isRTL() ? "التالي: الموسيقى" : "Next: Music"}
                </button>
              </div>
            </div>
          )}

          {/* SUB-STEP 3: Pick Music */}
          {setupSubStep === 3 && (
            <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
              <div>
                <h2 className="font-heading font-bold text-sm text-foreground mb-1">
                  {isRTL() ? "3. اختر الموسيقى الخلفية" : "3. Choose Background Music"}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {isRTL() ? "سيتم مزامنة قطع الفيديو تلقائياً مع بيتات الموسيقى" : "Video cuts will automatically align to music beats"}
                </p>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto p-1">
                  {BUILTIN_TRACKS.map((track) => {
                    const isSelected = selectedTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        onClick={() => setSelectedTrack(track)}
                        className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card/50 hover:bg-card"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                            style={{ backgroundColor: track.color }}
                          >
                            <Music className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-heading font-bold text-xs text-foreground">{track.titleEn}</p>
                            <p className="text-[10px] text-muted-foreground">{track.artist} • {track.bpm} BPM ({track.genre})</p>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="w-6 h-6 rounded-full gradient-primary text-primary-foreground flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => setSetupSubStep(2)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs"
                >
                  {isRTL() ? "السابق" : "Back"}
                </button>
                <button
                  onClick={() => setSetupSubStep(4)}
                  className="px-6 py-2.5 rounded-2xl gradient-primary text-primary-foreground font-bold text-xs shadow-sm"
                >
                  {isRTL() ? "التالي: المدة" : "Next: Duration"}
                </button>
              </div>
            </div>
          )}

          {/* SUB-STEP 4: Target Duration */}
          {setupSubStep === 4 && (
            <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
              <div>
                <h2 className="font-heading font-bold text-sm text-foreground mb-1">
                  {isRTL() ? "4. اختر المدة الكلية للفيديو" : "4. Pick Target Video Duration"}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {isRTL() ? "سيقوم الذكاء الاصطناعي باقتطاع أفضل اللقطات لتطابق هذه المدة" : "AI will trim and pick the best moments to fit this duration"}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {durationOptions.map((opt) => {
                    const isSelected = targetDuration === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setTargetDuration(opt.value)}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border bg-card/50 hover:bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-black text-xl text-foreground">{opt.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                        <span className="text-[11px] text-muted-foreground mt-2">{opt.sub}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => setSetupSubStep(3)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs"
                >
                  {isRTL() ? "السابق" : "Back"}
                </button>
                <button
                  onClick={handleGenerateMontage}
                  className="px-8 py-3 rounded-2xl gradient-primary text-primary-foreground font-bold text-xs glow-primary flex items-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>{isRTL() ? "إنشاء المونتاج الذكي 🚀" : "Auto-Generate Montage 🚀"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: HIGH-SPEED PROCESSING LOADER */}
      {step === "analyzing" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-background">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin flex items-center justify-center" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary animate-pulse" />
            </div>
          </div>

          <h2 className="font-heading font-bold text-base text-foreground mb-2">
            {isRTL() ? "جاري إنشاء المونتاج السريع..." : "Generating Fast Montage..."}
          </h2>
          <p className="text-xs text-muted-foreground max-w-xs mb-6">
            {analysisStatusText}
          </p>

          <div className="w-full max-w-xs bg-secondary h-2 rounded-full overflow-hidden border border-border">
            <div
              className="gradient-primary h-full transition-all duration-300"
              style={{ width: `${analyzingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* STEP 3: RESULT SCREEN (Immediate Playing + Touch-Up Controls ONLY) */}
      {step === "result" && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-background">
          {/* Video Preview Stage */}
          <div className="flex-1 bg-black/95 p-4 flex flex-col items-center justify-center relative min-h-[260px]">
            {/* Aspect Ratio Selector */}
            <div className="absolute top-3 left-3 z-10 flex gap-1 bg-black/60 p-1 rounded-xl backdrop-blur-md border border-white/10">
              {aspectRatios.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setActiveRatioIndex(i)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    activeRatioIndex === i ? "gradient-primary text-primary-foreground" : "text-white/70 hover:text-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div
              ref={previewRef}
              className="rounded-2xl bg-black overflow-hidden relative border border-border/80 shadow-2xl"
              style={{
                aspectRatio: `${ratio.w}/${ratio.h}`,
                maxHeight: "min(48vh, 380px)",
                maxWidth: "100%",
              }}
            >
              {activeMedia?.type === "video" ? (
                <video
                  ref={videoRef}
                  src={activeMedia.url}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  poster="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>"
                />
              ) : activeMedia?.type === "image" ? (
                <img src={activeMedia.url} alt="Media" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                  <Film className="w-8 h-8 opacity-40 mb-2" />
                  <span className="text-xs">{isRTL() ? "جاهز للمعاينة" : "Ready for Preview"}</span>
                </div>
              )}
            </div>

            {/* Scrubber & Controls */}
            <div className="w-full max-w-sm mt-3 flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-9 h-9 rounded-full gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-md"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <input
                type="range"
                min={0}
                max={totalDuration || targetDuration || 1}
                step={0.05}
                value={currentTime}
                onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                className="flex-1 accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
              />

              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                {currentTime.toFixed(1)}s / {(totalDuration || targetDuration || 0).toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Light Touch-Up Panel (NO Full Timeline / Layer Editing) */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-card p-4 overflow-y-auto space-y-5 shrink-0">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                {isRTL() ? "التعديلات السريعة الخفيفة" : "Light Touch-Ups"}
              </h3>
              <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 font-bold">
                Vireon Quick UX
              </span>
            </div>

            {/* Clip Slot Replacer */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Video className="w-3.5 h-3.5 text-primary" />
                  {isRTL() ? "المقاطع الحالية في الفيديو:" : "Clips in Montage:"}
                </span>
                <span className="text-[10px] text-muted-foreground">{clips.length} slots</span>
              </label>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {clips.map((clip, idx) => {
                  const m = getMediaById(clip.mediaId);
                  return (
                    <div
                      key={clip.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 border border-border/80 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-black overflow-hidden border border-border shrink-0 flex items-center justify-center">
                          {m?.url ? (
                            <img src={m.url} alt="Thumbnail" className="w-full h-full object-cover" />
                          ) : (
                            <Video className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">Slot {idx + 1}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {((clip.out - clip.in) / (clip.speed || 1)).toFixed(1)}s
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTriggerReplace(clip.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-primary" />
                        <span>{isRTL() ? "استبدال" : "Swap"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Audio Settings */}
            <div className="space-y-3 pt-3 border-t border-border">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Music className="w-3.5 h-3.5 text-primary" />
                {isRTL() ? "الموسيقى والصوت:" : "Music & Audio:"}
              </label>

              <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground truncate max-w-[150px]">
                    {selectedTrack ? selectedTrack.titleEn : "No Track"}
                  </span>
                  <button
                    onClick={() => {
                      setStep("setup");
                      setSetupSubStep(3);
                    }}
                    className="text-[10px] text-primary hover:underline font-semibold"
                  >
                    {isRTL() ? "تغيير" : "Change"}
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={musicVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setMusicVolume(v);
                      setAudioTracks((prev) => prev.map((t) => ({ ...t, volume: v })));
                    }}
                    className="flex-1 accent-primary h-1.5 bg-secondary rounded-lg"
                  />
                  <span className="text-[10px] text-muted-foreground w-8">{Math.round(musicVolume * 100)}%</span>
                </div>
              </div>
            </div>

            {/* Quick Regenerate Action */}
            <div className="pt-3 border-t border-border space-y-2">
              <button
                onClick={() => {
                  setStep("setup");
                  setSetupSubStep(2);
                }}
                className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{isRTL() ? "تغيير الستايل وإعادة المونتاج" : "Change Style & Regenerate"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render Export Pipeline Dialog */}
      <ExportDialog
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectName={`Quick_${selectedTemplate.nameEn}`}
        totalDuration={totalDuration || targetDuration || 5}
        previewRef={previewRef as any}
        videoRef={videoRef as any}
        onPlayForExport={() => setIsPlaying(true)}
        onStopPlay={() => setIsPlaying(false)}
        seekToStart={() => setCurrentTime(0)}
        activeRatio={activeRatioIndex}
      />

      {/* Render Publish Template Dialog */}
      <PublishTemplateDialog
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        previewRef={previewRef as any}
        videoRef={videoRef as any}
        activeRatio={activeRatioIndex}
      />
    </div>
  );
}
