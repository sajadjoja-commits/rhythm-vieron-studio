import { useEffect, useRef, useState, memo } from "react";
import { Search, Sparkles, Wand2, Lock, Loader2, Film, Zap, Scissors, Palette, Clock, Play, Pause, Upload, Check, Trash2, X, Share2, Copy } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMedia } from "@/context/MediaContext";
import { useAdGate } from "@/context/AdGateContext";
import { SMART_TEMPLATES, SmartTemplate, TEMPLATE_CATEGORIES } from "@/lib/smartTemplates";
import { runAutoMontage } from "@/lib/autoMontage";
import { getUsage } from "@/lib/adManager";
import { toast } from "sonner";
import { t, getLang } from "@/lib/i18n";
import { BUILTIN_TRACKS, BuiltinTrack, getSavedLibraryTracks } from "@/lib/builtinMusic";
import { fetchPublishedTemplates, generateTemplateShareUrl, deletePublishedTemplate } from "@/services/templateService";
import { PublishedTemplate } from "@/types/template";

interface TemplatesScreenProps { 
  onStartEditor: () => void;
  onSelectPublishedTemplate?: (template: PublishedTemplate) => void;
  onSelectSmartTemplateQuick?: (template: SmartTemplate) => void;
}
const FREE_LIMIT = 5;

const TemplatePromoCard = memo(({ tpl, onClick, en }: { tpl: SmartTemplate; onClick: () => void; en: boolean }) => {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="group relative rounded-2xl overflow-hidden border border-border hover:border-primary/50 transition-all active:scale-[0.98] text-start w-full" dir={en ? "ltr" : "rtl"}>
      <div className="relative h-32 overflow-hidden" style={{ background: tpl.promo.bgGradient }}>
        <div className="absolute inset-0 flex items-center justify-center text-5xl transition-transform duration-500" style={{ transform: hover ? "scale(1.2) rotate(5deg)" : "scale(1)" }}>{tpl.promo.emoji}</div>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)", backgroundSize: "200% 100%", animation: hover ? "shimmer 1.5s linear infinite" : "none" }} />
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm"><span className="text-[9px] font-bold text-white/90 uppercase">{en ? tpl.nameEn : tpl.name}</span></div>
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/80 backdrop-blur-sm"><Sparkles className="w-2.5 h-2.5 text-white" /><span className="text-[8px] font-bold text-white">AI</span></div>
      </div>
      <div className="p-3 bg-card">
        <h3 className="font-heading font-bold text-sm text-foreground">{en ? tpl.nameEn : tpl.name}</h3>
        <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{en ? tpl.descEn : tpl.desc}</p>
        <div className="flex items-center gap-2 mt-2">
          {tpl.ai.musicSync && <div className="flex items-center gap-0.5 text-[8px] text-primary"><Zap className="w-2.5 h-2.5" />{en ? "Beat sync" : "على الإيقاع"}</div>}
          {tpl.ai.speedRamp && <div className="flex items-center gap-0.5 text-[8px] text-accent"><Film className="w-2.5 h-2.5" />{en ? "Slow-mo" : "سلومو"}</div>}
          {tpl.ai.targetDuration > 0 && <div className="flex items-center gap-0.5 text-[8px] text-muted-foreground"><Clock className="w-2.5 h-2.5" />{tpl.ai.targetDuration}s</div>}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1 py-1.5 rounded-lg gradient-primary text-primary-foreground text-[10px] font-bold"><Wand2 className="w-3 h-3" />{t("templates.apply")}</div>
      </div>
    </button>
  );
});
TemplatePromoCard.displayName = "TemplatePromoCard";

const AnalysisOverlay = ({ open, template, progress, en }: { open: boolean; template: SmartTemplate | null; progress: number; en: boolean }) => {
  if (!open || !template) return null;
  const steps = [
    { icon: Film, label: en ? "Analyzing clips..." : "تحليل المقاطع...", threshold: 0.3 },
    { icon: Scissors, label: en ? "Selecting best moments..." : "اختيار أفضل اللحظات...", threshold: 0.6 },
    { icon: Palette, label: en ? "Applying color grade..." : "تطبيق التدرج اللوني...", threshold: 0.85 },
    { icon: Zap, label: en ? "Adding effects & transitions..." : "إضافة المؤثرات والانتقالات...", threshold: 1.0 },
  ];
  return (
    <div className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-md flex items-center justify-center p-6" dir={en ? "ltr" : "rtl"}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl glow-primary-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl animate-pulse">{template.promo.emoji}</div>
          <h3 className="font-heading font-bold text-lg text-foreground">{en ? template.nameEn : template.name}</h3>
          <p className="text-xs text-muted-foreground text-center">{en ? "AI is analyzing your videos and creating a montage" : "الذكاء الاصطناعي يحلل مقاطعك ويصنع المونتاج"}</p>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full gradient-primary transition-all duration-300" style={{ width: `${progress * 100}%` }} /></div>
          <div className="w-full space-y-2">
            {steps.map((step, i) => {
              const done = progress >= step.threshold;
              const current = progress < step.threshold && (i === 0 || progress >= steps[i - 1].threshold);
              return (
                <div key={i} className={`flex items-center gap-2 text-xs transition-opacity ${done ? "opacity-100" : current ? "opacity-80" : "opacity-30"}`}>
                  {done ? <div className="w-5 h-5 rounded-full gradient-primary flex items-center justify-center animate-scale-up"><Sparkles className="w-3 h-3 text-white" /></div> : current ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <step.icon className="w-5 h-5 text-muted-foreground" />}
                  <span className={done ? "text-foreground font-medium" : "text-muted-foreground"}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const TemplatesScreen = ({ onStartEditor, onSelectPublishedTemplate, onSelectSmartTemplateQuick }: TemplatesScreenProps) => {
  const en = getLang() === "en";
  const { clips, media, addFiles, applySmartTemplate, newProject, setClips, setFilters, setVfx, setCaptionStyle, setCaptions, addAudioTrack } = useMedia();
  const { requestAccess } = useAdGate();
  
  const [templateTabMode, setTemplateTabMode] = useState<"smart" | "published">("smart");
  const [publishedTemplates, setPublishedTemplates] = useState<PublishedTemplate[]>([]);
  const [loadingPublished, setLoadingPublished] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<PublishedTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState(0);
  const [activeCategory, setActiveCategory] = useState("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisTemplate, setAnalysisTemplate] = useState<SmartTemplate | null>(null);

  useEffect(() => {
    if (templateTabMode === "published") {
      setLoadingPublished(true);
      fetchPublishedTemplates().then((res) => {
        setPublishedTemplates(res);
        setLoadingPublished(false);
      });
    }
  }, [templateTabMode]);
  
  // Custom template configurations state
  const [selectedTplForConfig, setSelectedTplForConfig] = useState<SmartTemplate | null>(null);
  const [customDuration, setCustomDuration] = useState<number>(30);
  const [durationMode, setDurationMode] = useState<"15" | "30" | "60" | "custom">("30");
  const [customMusic, setCustomMusic] = useState<string>("none");
  const [customMusicFile, setCustomMusicFile] = useState<File | null>(null);
  const [customMusicName, setCustomMusicName] = useState<string>("");
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  
  const pendingConfigRef = useRef<{
    tpl: SmartTemplate;
    customDuration: number;
    customMusic: string;
    customMusicFile: File | null;
    customMusicName: string;
  } | null>(null);
  
  const fileRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setUsage(getUsage("smart-template")); }, []);

  useEffect(() => {
    // If pending template config is set and fresh clips have loaded from the new file picker
    if (pendingConfigRef.current && clips.length > 0) {
      const config = pendingConfigRef.current;
      pendingConfigRef.current = null;
      void runTemplate(config.tpl, config.customDuration, config.customMusic, config.customMusicFile, config.customMusicName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  useEffect(() => {
    // Cleanup preview audio on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const usesLeft = Math.max(0, FREE_LIMIT - usage);

  const togglePlayMusic = (trackId: string, url: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (playingMusicId === trackId) {
      audioRef.current?.pause();
      setPlayingMusicId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(url);
      audioRef.current.loop = true;
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch(err => console.log("Audio preview error", err));
      setPlayingMusicId(trackId);
    }
  };

  const runTemplate = async (
    tpl: SmartTemplate,
    duration: number,
    musicType: string,
    musicFile: File | null,
    musicName: string
  ) => {
    // Stop any preview music
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingMusicId(null);
    }

    // Override targetDuration with user choice
    const customizedTpl: SmartTemplate = {
      ...tpl,
      ai: {
        ...tpl.ai,
        targetDuration: duration
      }
    };

    setAnalysisTemplate(customizedTpl);
    setAnalyzing(true);
    setAnalysisProgress(0.05);
    
    try {
      let musicUrl: string | undefined;
      const allLibTracks = [...getSavedLibraryTracks(), ...BUILTIN_TRACKS];
      if (musicType === "custom-device" && musicFile) {
        musicUrl = URL.createObjectURL(musicFile);
      } else if (musicType !== "none") {
        musicUrl = allLibTracks.find((t) => t.id === musicType)?.url;
      }

      const result = await runAutoMontage(media, customizedTpl, clips, musicUrl, {
        fastMode: true,
        targetDuration: duration,
        onProgress: (info) => {
          setAnalysisProgress(info.percent / 100);
        },
      });
      if (result.clips.length > 0) {
        setClips(result.clips);
        setFilters(result.filters);
        setVfx(result.vfx);
        if (result.captionStyle) setCaptionStyle(result.captionStyle as any);
        if (result.captions) setCaptions(result.captions);
      } else {
        applySmartTemplate(customizedTpl);
      }

      // Automatically add selected music track to project timeline
      if (musicType !== "none") {
        if (musicType === "custom-device" && musicFile) {
          addAudioTrack({
            name: musicName || musicFile.name,
            url: URL.createObjectURL(musicFile),
            file: musicFile,
            start: 0,
            offset: 0,
            duration: result.totalDuration || duration,
            sourceDuration: 240,
            volume: 0.8,
            muted: false,
            fx: "none",
            color: "#ec4899",
            kind: "music"
          });
        } else {
          const track = allLibTracks.find((t) => t.id === musicType);
          if (track) {
            addAudioTrack({
              name: en ? track.titleEn : track.title,
              url: track.url,
              start: 0,
              offset: 0,
              duration: result.totalDuration || duration,
              sourceDuration: 180,
              volume: 0.8,
              muted: false,
              fx: "none",
              color: track.color,
              kind: "music"
            });
          }
        }
      }

      clearInterval(progressInterval);
      setAnalysisProgress(1);
      await new Promise((r) => setTimeout(r, 500));
      toast.success(en ? `AI montage complete! ${result.analysis.segmentsSelected} clips selected from ${result.analysis.segmentsAnalyzed} segments.` : `اكتمل المونتاج الذكي! ${result.analysis.segmentsSelected} لقطات تم اختيارها من ${result.analysis.segmentsAnalyzed} أجزاء.`);
      onStartEditor();
    } catch (err) {
      console.error(err);
      applySmartTemplate(customizedTpl);
      onStartEditor();
    } finally {
      clearInterval(progressInterval);
      setAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisTemplate(null);
    }
  };

  const handleDeleteTemplate = async (template: PublishedTemplate) => {
    setIsDeleting(true);
    try {
      const ok = await deletePublishedTemplate(template.id);
      if (ok) {
        setPublishedTemplates((prev) => prev.filter((t) => t.id !== template.id));
        toast.success(en ? "Template deleted successfully" : "تم حذف القالب بنجاح");
        setTemplateToDelete(null);
      } else {
        toast.error(en ? "Failed to delete template" : "حدث خطأ أثناء حذف القالب");
      }
    } catch {
      toast.error(en ? "Failed to delete template" : "حدث خطأ أثناء حذف القالب");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePick = async (tpl: SmartTemplate) => {
    const ok = await requestAccess("smart-template", FREE_LIMIT);
    if (!ok) return;
    setUsage(getUsage("smart-template"));
    
    // Stop any playing preview music
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingMusicId(null);
    }

    // Initialize custom config states
    setSelectedTplForConfig(tpl);
    setCustomDuration(tpl.ai.targetDuration > 0 ? tpl.ai.targetDuration : 30);
    setDurationMode(
      tpl.ai.targetDuration === 15 ? "15" :
      tpl.ai.targetDuration === 30 ? "30" :
      tpl.ai.targetDuration === 60 ? "60" : "custom"
    );
    setCustomMusic(tpl.id === "music-beat" ? "upbeat" : "none");
    setCustomMusicFile(null);
    setCustomMusicName("");
  };

  const triggerMediaFilePicker = () => {
    if (!selectedTplForConfig) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingMusicId(null);
    }

    // Set pending config
    pendingConfigRef.current = {
      tpl: selectedTplForConfig,
      customDuration,
      customMusic,
      customMusicFile,
      customMusicName
    };

    // ALWAYS clean slate first so we don't carry over any old projects!
    newProject();

    // Trigger phone gallery file input click
    fileRef.current?.click();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const items = await addFiles(files);
      if (items.length === 0) {
        pendingConfigRef.current = null;
        setSelectedTplForConfig(null);
      }
    } else {
      pendingConfigRef.current = null;
      setSelectedTplForConfig(null);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setCustomMusicFile(file);
      setCustomMusicName(file.name);
      setCustomMusic("custom-device");
      toast.success(en ? `Music loaded: ${file.name}` : `تم تحميل الموسيقى: ${file.name}`);
    }
    if (audioInputRef.current) audioInputRef.current.value = "";
  };

  const filtered = SMART_TEMPLATES.filter((tpl) => {
    const okCategory = activeCategory === "all" || tpl.category === activeCategory;
    const okQuery = !query || tpl.name.includes(query) || tpl.nameEn.toLowerCase().includes(query.toLowerCase()) || tpl.desc.includes(query) || tpl.descEn.toLowerCase().includes(query.toLowerCase());
    return okCategory && okQuery;
  });

  return (
    <div className="min-h-screen pb-24 px-4 pt-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-heading text-2xl font-bold text-foreground">{t("templates.title")}</h1>
        <span className="flex items-center gap-1 text-[11px] font-bold text-primary"><Sparkles className="w-3.5 h-3.5" /> AI</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("templates.subtitle")}</p>
      
      {/* Mode Switcher Tabs */}
      <div className="flex bg-secondary/50 p-1 rounded-2xl border border-border mb-4">
        <button
          onClick={() => setTemplateTabMode("smart")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            templateTabMode === "smart"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {en ? "AI Smart Templates" : "قوالب الذكاء الاصطناعي"}
        </button>
        <button
          onClick={() => setTemplateTabMode("published")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            templateTabMode === "published"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {en ? "Community Templates" : "قوالب صُنّاع المحتوى"}
        </button>
      </div>

      {templateTabMode === "smart" ? (
        <>
          <div className="mb-4 rounded-xl bg-card border border-border p-3 flex items-center gap-2 animate-fade-in">
            {usesLeft > 0 ? (
              <>
                <Wand2 className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                <p className="text-[11px] text-foreground">{t("templates.freeLeft", { n: String(usesLeft) })}</p>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-primary shrink-0" />
                <p className="text-[11px] text-foreground">{t("templates.noFree")}</p>
              </>
            )}
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeCategory === cat.id ? "gradient-primary text-primary-foreground glow-primary-sm scale-[1.03]" : "bg-card border border-border text-muted-foreground"}`}>
                {cat.id === "all" ? t(cat.labelKey) : (cat.label || cat.labelEn)}
              </button>
            ))}
          </div>

          <div className="relative mb-5">
            <Search className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("templates.search")}
              className={`w-full bg-card border border-border rounded-xl py-3 ${en ? "pl-10 pr-4" : "pr-10 pl-4"} text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {filtered.map((tpl) => (
              <TemplatePromoCard key={tpl.id} tpl={tpl} onClick={() => handlePick(tpl)} en={en} />
            ))}
          </div>
          
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">{t("templates.noMatch")}</p>}
        </>
      ) : (
        /* Community Published Templates Feed */
        <div>
          {loadingPublished ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">{en ? "Loading Community Templates..." : "جاري تحميل قوالب المحتوى..."}</p>
            </div>
          ) : publishedTemplates.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-2xl p-6">
              <Sparkles className="w-8 h-8 text-primary mx-auto mb-2 opacity-50" />
              <p className="font-heading font-bold text-sm text-foreground">{en ? "No Community Templates Yet" : "لا توجد قوالب منشورة بعد"}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {en ? "Create your custom montage in the editor and click 'Publish as Template' to share it with the world!" : "قم بإنشاء مونتاجك في المحرر واضغط 'نشر كقالب' لمشاركته مع المجتمع!"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {publishedTemplates.map((pubTpl) => (
                <div key={pubTpl.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors">
                  <div className="relative h-40 bg-black overflow-hidden">
                    {pubTpl.cover_url ? (
                      <img src={pubTpl.cover_url} alt={pubTpl.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-secondary/50">
                        <Film className="w-8 h-8 opacity-40 mb-1" />
                        <span className="text-[10px]">CapCut Template</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                      {pubTpl.project_data?.totalDuration ? `${pubTpl.project_data.totalDuration.toFixed(0)}s` : "Reel"}
                    </div>
                  </div>

                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-sm text-foreground line-clamp-1">{pubTpl.title}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {en ? "By: " : "بواسطة: "}<span className="text-foreground font-semibold">{pubTpl.creator_name}</span>
                      </p>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {pubTpl.hashtags?.map((tag, i) => (
                          <span key={i} className="text-[10px] text-primary font-medium">{tag}</span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-border mt-3">
                      <button
                        onClick={() => {
                          if (onSelectPublishedTemplate) {
                            onSelectPublishedTemplate(pubTpl);
                          }
                        }}
                        className="flex-1 py-2 px-2 rounded-xl gradient-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>{en ? "Use Template" : "استخدام القالب"}</span>
                      </button>

                      <button
                        onClick={() => {
                          const link = generateTemplateShareUrl(pubTpl.id);
                          navigator.clipboard.writeText(link);
                          toast.success(en ? "Template link copied!" : "تم نسخ رابط القالب!");
                        }}
                        className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors"
                        title={en ? "Copy Share Link" : "نسخ رابط المشاركة"}
                      >
                        <Share2 className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateToDelete(pubTpl);
                        }}
                        className="p-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-colors"
                        title={en ? "Delete Template" : "حذف القالب"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Beautiful Custom Template Configuration Modal --- */}
      <AnimatePresence>
        {selectedTplForConfig && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" dir={en ? "ltr" : "rtl"}>
            <motion.div 
              initial={{ opacity: 0, y: 150 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 150 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="w-full sm:max-w-md bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-y-auto shadow-2xl pb-6">
              
              {/* Modal Header */}
              <div className="relative p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card/90 backdrop-blur-sm z-10">
                <div className="flex items-center gap-2">
                  <div className="text-2xl">{selectedTplForConfig.promo.emoji}</div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-foreground">
                      {en ? selectedTplForConfig.nameEn : selectedTplForConfig.name}
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      {en ? "Configure template parameters" : "تخصيص خيارات القالب والمونتاج"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedTplForConfig(null);
                    if (audioRef.current) {
                      audioRef.current.pause();
                      setPlayingMusicId(null);
                    }
                  }} 
                  className="p-1.5 rounded-full hover:bg-secondary/80 transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-4 space-y-6">
                {/* 1. Target Duration selection */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-primary" />
                    {en ? "Montage Duration" : "مدة المونتاج المطلوبة"}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "15", label: en ? "15s (Reels)" : "15 ث (ريلز)", val: 15 },
                      { id: "30", label: en ? "30s (TikTok)" : "30 ث (تيكتوك)", val: 30 },
                      { id: "60", label: en ? "60s (Shorts)" : "60 ث (يوتيوب)", val: 60 },
                      { id: "custom", label: en ? "Custom" : "مخصص", val: customDuration }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setDurationMode(mode.id as any);
                          if (mode.id !== "custom") {
                            setCustomDuration(mode.val);
                          }
                        }}
                        className={`py-2 px-1 rounded-xl text-[10px] font-bold border transition-all ${
                          durationMode === mode.id 
                            ? "gradient-primary text-primary-foreground border-transparent shadow-md" 
                            : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/70"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {durationMode === "custom" && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: "auto" }}
                      className="pt-2"
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-muted-foreground mb-1">
                        <span>5 {en ? "sec" : "ثانية"}</span>
                        <span className="text-primary px-2 py-0.5 rounded bg-primary/10">{customDuration} {en ? "seconds" : "ثانية"}</span>
                        <span>120 {en ? "sec" : "ثانية"}</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="120" 
                        value={customDuration} 
                        onChange={(e) => setCustomDuration(Number(e.target.value))}
                        className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                      />
                    </motion.div>
                  )}
                </div>

                {/* 2. Soundtrack (Music) selection */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-accent" />
                    {en ? "Choose Music Soundtrack" : "اختر الموسيقى التصويرية"}
                  </label>
                  
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                    {/* None Option */}
                    <button
                      onClick={() => setCustomMusic("none")}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-start transition-all ${
                        customMusic === "none" 
                          ? "bg-primary/5 border-primary/40 shadow-sm" 
                          : "bg-secondary/20 border-border/60 hover:bg-secondary/40"
                      }`}
                    >
                      <span className="text-xs font-semibold text-foreground">
                        🚫 {en ? "No Background Music" : "بدون موسيقى خلفية"}
                      </span>
                      {customMusic === "none" && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>

                    {/* Builtin & library tracks */}
                    {[...getSavedLibraryTracks(), ...BUILTIN_TRACKS].map((track) => (
                      <div
                        key={track.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setCustomMusic(track.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setCustomMusic(track.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-start transition-all cursor-pointer ${
                          customMusic === track.id 
                            ? "bg-primary/5 border-primary/40 shadow-sm" 
                            : "bg-secondary/20 border-border/60 hover:bg-secondary/40"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => togglePlayMusic(track.id, track.url, e)}
                            className="w-7 h-7 rounded-full flex items-center justify-center bg-primary/15 text-primary hover:bg-primary/25 hover:scale-105 active:scale-95 transition-all shrink-0"
                          >
                            {playingMusicId === track.id ? (
                              <Pause className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current text-primary" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-foreground truncate">
                              {en ? track.titleEn : track.title}
                            </h4>
                            <p className="text-[9px] text-muted-foreground truncate">
                              {track.artist} • {track.bpm} BPM • {track.genre}
                            </p>
                          </div>
                        </div>
                        {customMusic === track.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                    ))}

                    {/* Custom device audio track */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => audioInputRef.current?.click()}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-dashed transition-all ${
                          customMusic === "custom-device"
                            ? "border-primary/50 bg-primary/5 text-primary"
                            : "border-border hover:border-primary/40 text-muted-foreground hover:bg-secondary/20"
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        <span className="text-xs font-bold truncate">
                          {customMusic === "custom-device" && customMusicName 
                            ? customMusicName 
                            : en ? "Choose music from phone files" : "اختيار موسيقى من ملفات هاتفك"}
                        </span>
                      </button>
                      <input 
                        ref={audioInputRef} 
                        type="file" 
                        accept="audio/*" 
                        onChange={handleAudioUpload} 
                        className="hidden" 
                      />
                    </div>
                  </div>
                </div>

                {/* Final Proceed/Start buttons */}
                <div className="pt-4 space-y-2">
                  {onSelectSmartTemplateQuick && (
                    <button
                      type="button"
                      onClick={() => {
                        const tpl = selectedTplForConfig;
                        setSelectedTplForConfig(null);
                        if (audioRef.current) {
                          audioRef.current.pause();
                          setPlayingMusicId(null);
                        }
                        onSelectSmartTemplateQuick(tpl);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl gradient-primary text-primary-foreground font-heading font-bold text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition-all glow-primary"
                    >
                      <Zap className="w-4 h-4 fill-current" />
                      {en ? "Fast Auto-Edit Editor" : "محرر المونتاج السريع"}
                    </button>
                  )}

                  <button
                    onClick={triggerMediaFilePicker}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-heading font-bold text-xs border border-border transition-all"
                  >
                    <Wand2 className="w-4 h-4 text-primary" />
                    {en ? "Full Editor Mode" : "وضع المحرر الكامل"}
                  </button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    {en 
                      ? "Fast mode auto-selects key moments instantly without complex timeline editing." 
                      : "الوضع السريع يختار أفضل اللقطات فوراً بدون تعقيدات الخط الزمني."}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Template Confirmation Modal */}
      <AnimatePresence>
        {templateToDelete && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir={en ? "ltr" : "rtl"}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-destructive">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-foreground">
                    {en ? "Delete Template" : "حذف القالب"}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {templateToDelete.title}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {en ? "Are you sure you want to delete this template? This action cannot be undone." : "هل أنت متأكد من رغبتك في حذف هذا القالب؟ لا يمكن التراجع عن هذا الإجراء."}
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setTemplateToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors"
                >
                  {en ? "Cancel" : "إلغاء"}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteTemplate(templateToDelete)}
                  className="flex-1 py-2.5 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{en ? "Delete" : "حذف"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnalysisOverlay open={analyzing} template={analysisTemplate} progress={analysisProgress} en={en} />
      
      {/* Hidden file picker for phone photo/video files */}
      <input 
        ref={fileRef} 
        type="file" 
        accept="video/*,image/*" 
        multiple 
        onChange={handleFiles} 
        className="hidden" 
      />
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
};

export default TemplatesScreen;
