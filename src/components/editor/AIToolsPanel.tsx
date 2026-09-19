import { useState, useMemo, useRef, useEffect } from "react";
import {
  Sparkles,
  Zap,
  Wand2,
  ShieldCheck,
  Sliders,
  Palette,
  Scissors,
  Smile,
  Trash2,
  Mic,
  Music2,
  VolumeX,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  History,
  HardDrive,
  Info,
  ArrowUpRight,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Video,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { PayloadValidator } from "@/ai/utils/PayloadValidator";
import { aiManager, aiRuntime, aiPlugins } from "@/ai";
import { AITaskType } from "@/ai/types/ai";
import { VideoJobManager } from "@/ai/video";
import { useMedia } from "@/context/MediaContext";
import { audioSourceResolver, ResolvedAudioSource } from "@/ai/audio/AudioSourceResolver";

export interface AIToolConfig {
  id: string;
  mediaType: "video" | "image" | "audio";
  taskType: AITaskType;
  pluginId: string;
  actionName: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: any;
  badge: string;
  badgeType?: "ready-dsp" | "ready-ml" | "heavy-render";
  payload?: Record<string, any>;
}

const AI_TOOLS_CATALOG: AIToolConfig[] = [
  // ---------------- VIDEO AI TOOLS ----------------
  {
    id: "vid-enhance",
    mediaType: "video",
    taskType: "enhance-media",
    pluginId: "plugin-video-enhancement",
    actionName: "composite-video-enhance",
    titleAr: "تحسين ووضوح الفيديو (HDR)",
    titleEn: "Video Clarity & HDR Enhance",
    descAr: "معالجة وتحسين ألوان وإطارات الفيديو وموازنة التباين وديناميكية HDR",
    descEn: "Adaptive CLAHE video dynamic range enhancement & detail sharpening",
    icon: Sparkles,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { isVideo: true },
  },
  {
    id: "video-bg-removal",
    mediaType: "video",
    taskType: "background-removal",
    pluginId: "plugin-video-enhancement",
    actionName: "video-bg-removal",
    titleAr: "عزل وتفريغ خلفية الفيديو",
    titleEn: "Smart Video Cutout",
    descAr: "عزل الأشخاص والعناصر من الفيديو وتفريغ الخلفية بذكاء مع تثبيت الحواف",
    descEn: "Isolate moving subjects with temporal stabilization & alpha cutout",
    icon: Wand2,
    badge: "READY (ML)",
    badgeType: "ready-ml",
    payload: { isVideo: true },
  },
  {
    id: "video-denoise",
    mediaType: "video",
    taskType: "noise-reduction",
    pluginId: "plugin-video-enhancement",
    actionName: "video-denoise",
    titleAr: "تنقية تشويش وتحبيب الفيديو",
    titleEn: "Spatial Video Denoise",
    descAr: "تنظيف تحبيب التصوير في الإضاءة المنخفضة والضوضاء البصرية بحفظ الحواف",
    descEn: "Clean low-light video noise & digital camera grain preserving edge sharpness",
    icon: ShieldCheck,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { denoiseIntensity: 0.7 },
  },
  {
    id: "video-autocolor",
    mediaType: "video",
    taskType: "enhance-media",
    pluginId: "plugin-video-enhancement",
    actionName: "composite-video-enhance",
    titleAr: "موازنة ألوان الفيديو والتباين",
    titleEn: "Auto Video Color & Dynamic Tone",
    descAr: "تصحيح الإضاءة وموازنة الألوان والتشبع تلقائياً بحفظ تدرجات البشرة",
    descEn: "Intelligent auto color grading, exposure balance & dynamic vibrance",
    icon: Palette,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { isVideo: true, autoColor: true },
  },

  // ---------------- IMAGE AI TOOLS ----------------
  {
    id: "remove-background",
    mediaType: "image",
    taskType: "background-removal",
    pluginId: "plugin-image-enhancement",
    actionName: "remove-background",
    titleAr: "عزل وتفريغ خلفية الصورة",
    titleEn: "Image Background Cutout",
    descAr: "عزل دقيق جداً للموضوع وحذف الخلفية بدقة فائقة",
    descEn: "High-precision AI foreground extraction & cutout",
    icon: Scissors,
    badge: "READY (ML)",
    badgeType: "ready-ml",
  },
  {
    id: "face-enhance",
    mediaType: "image",
    taskType: "enhance-media",
    pluginId: "plugin-image-enhancement",
    actionName: "face-enhance",
    titleAr: "تحسين ملامح الوجوه والبورتريه",
    titleEn: "Portrait & Face Detail Restore",
    descAr: "توضيح الوجوه ومعالجة تفاصيل العينين والجلد وتفاصيل البورتريه",
    descEn: "Restore facial details, eye sharpness & skin clarity",
    icon: Smile,
    badge: "READY (ML)",
    badgeType: "ready-ml",
  },
  {
    id: "object-remove",
    mediaType: "image",
    taskType: "background-removal",
    pluginId: "plugin-image-enhancement",
    actionName: "object-remove",
    titleAr: "حذف العناصر غير المرغوبة",
    titleEn: "Object & Watermark Inpaint",
    descAr: "إزالة الشوائب والعناصر غير المرغوبة من الخلفية بذكاء",
    descEn: "Intelligent inpainting object & watermark removal",
    icon: Trash2,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
  },
  {
    id: "denoise",
    mediaType: "image",
    taskType: "noise-reduction",
    pluginId: "plugin-image-enhancement",
    actionName: "denoise",
    titleAr: "تنقية التحبيب وتشويش الصورة",
    titleEn: "Bilateral Image Denoise",
    descAr: "إزالة الضوضاء وتنعيم الصورة بدون فقدان الحواف الحادة",
    descEn: "Remove digital grain preserving sharp boundaries",
    icon: ShieldCheck,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
  },
  {
    id: "composite-enhance",
    mediaType: "image",
    taskType: "enhance-media",
    pluginId: "plugin-image-enhancement",
    actionName: "composite-enhance",
    titleAr: "السلسلة الشاملة لتحسين الصورة",
    titleEn: "Full Master Enhancement",
    descAr: "تنظيف + تحسين الوجوه + موازنة التباين ووضوح التفاصيل دفعة واحدة",
    descEn: "Full pipeline: Denoise + Face Restore + Dynamic HDR Contrast",
    icon: Wand2,
    badge: "READY (MASTER)",
    badgeType: "ready-dsp",
  },

  // ---------------- AUDIO AI TOOLS ----------------
  {
    id: "audio-denoise",
    mediaType: "audio",
    taskType: "noise-reduction",
    pluginId: "plugin-audio-enhancement",
    actionName: "denoise",
    titleAr: "إزالة ضوضاء وتشويش الصوت",
    titleEn: "Voice & Audio Noise Reduction",
    descAr: "تنقية ضوضاء المروحة والمكيف والتشويش المباشر وتحديث المسار الصوتي",
    descEn: "Clean background hiss, hum, and noise directly on the selected audio track",
    icon: Mic,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { denoiseIntensity: 0.85 },
  },
  {
    id: "separate-vocals",
    mediaType: "audio",
    taskType: "vocal-isolation",
    pluginId: "plugin-audio-enhancement",
    actionName: "separate",
    titleAr: "عزل الصوت عن الموسيقى",
    titleEn: "Vocal & Music Isolation",
    descAr: "فصل الكلام البشري عن الموسيقى على المسار المحدد مع خيار التبديل",
    descEn: "Isolate vocals or instrumental directly on the selected track",
    icon: Music2,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { mode: "extract-vocals" },
  },
  {
    id: "vocals-only",
    mediaType: "audio",
    taskType: "vocal-isolation",
    pluginId: "plugin-audio-enhancement",
    actionName: "separate",
    titleAr: "استخراج الصوت البشري فقط",
    titleEn: "Vocals Only",
    descAr: "استخراج مسار الغناء والكلام البشري وحجب الآلات الموسيقية",
    descEn: "Isolate human speech and vocals while attenuating backing music",
    icon: Mic,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { mode: "extract-vocals" },
  },
  {
    id: "music-only",
    mediaType: "audio",
    taskType: "vocal-isolation",
    pluginId: "plugin-audio-enhancement",
    actionName: "separate",
    titleAr: "استخراج الموسيقى فقط",
    titleEn: "Instrumental Only",
    descAr: "حذف الصوت البشري تماماً والإبقاء على الموسيقى التصويرية والإيقاع",
    descEn: "Isolate backing music and instruments while removing human voice",
    icon: Music2,
    badge: "READY (DSP)",
    badgeType: "ready-dsp",
    payload: { mode: "extract-music" },
  },
];

interface AIToolsPanelProps {
  open: boolean;
  onClose: () => void;
  mediaType: "video" | "image" | "audio";
  currentMediaUrlOrBase64?: string;
  targetClipId?: string;
  targetMediaId?: string;
  onApplyResult?: (resultData: any) => void | Promise<void | boolean>;
  embedded?: boolean;
}

export const AIToolsPanel = ({
  open,
  onClose,
  mediaType,
  currentMediaUrlOrBase64,
  targetClipId,
  targetMediaId,
  onApplyResult,
  embedded = false,
}: AIToolsPanelProps) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [executingProgress, setExecutingProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isolationMode, setIsolationMode] = useState<"extract-vocals" | "extract-music">("extract-vocals");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "video" | "audio" | "image">(mediaType);
  const [isPeeking, setIsPeeking] = useState(false);
  const activeAbortRef = useRef<AbortController | null>(null);

  const en = getLang() === "en";

  useEffect(() => {
    setSelectedCategory(mediaType);
  }, [mediaType]);

  const {
    audioTracks,
    selectedAudioTrackId,
    clips,
    selectedClipId,
    media,
    overlays,
    selectedOverlayId,
    currentTime,
  } = useMedia();

  // Tools for the selected category tab or embedded media type
  const displayedTools = useMemo(() => {
    if (embedded) {
      return AI_TOOLS_CATALOG.filter((tool) => tool.mediaType === mediaType);
    }
    if (selectedCategory === "all") return AI_TOOLS_CATALOG;
    return AI_TOOLS_CATALOG.filter((tool) => tool.mediaType === selectedCategory);
  }, [selectedCategory, embedded, mediaType]);

  const availableTools = displayedTools;

  // Sync with active background video job if one exists
  useEffect(() => {
    const unsubscribe = VideoJobManager.getInstance().subscribeActive((activeJob) => {
      if (activeJob && activeJob.status !== "COMPLETED" && activeJob.status !== "FAILED" && activeJob.status !== "CANCELLED") {
        setIsExecuting(true);
        setActiveToolId(activeJob.toolId || null);
        setExecutingProgress(activeJob.progress);
        setStatusText(activeJob.stageMessage);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const historyRecords = useMemo(() => {
    return aiRuntime.historyManager.getHistory().filter((item) => {
      const toolMatch = availableTools.some((t) => t.taskType === item.taskType);
      return toolMatch;
    });
  }, [availableTools]);

  if (!open) return null;

  const handleExitAndBackground = () => {
    playSfx("click");
    toast.info(
      en
        ? "AI is continuing to process in the background. You can continue editing freely."
        : "يستمر الذكاء الاصطناعي في المعالجة بالخلفية. يمكنك متابعة العمل بحرية."
    );
    onClose();
  };

  const handleCancelExecution = () => {
    try {
      VideoJobManager.getInstance().cancelActiveJob();
    } catch {}

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    playSfx("click");
    toast(en ? "Operation cancelled" : "تم إلغاء العملية");
    setIsExecuting(false);
    setActiveToolId(null);
    setExecutingProgress(0);
    setStatusText("");
  };

  const handleRunTool = async (toolConfig: AIToolConfig) => {
    if (isExecuting) return;
    playSfx("click");

    setLastError(null);
    setIsExecuting(true);
    setActiveToolId(toolConfig.id);
    setExecutingProgress(0);
    setStatusText(en ? "Preparing AI Engine..." : "جاري فحص وتجهيز المعالج الذكي...");

    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    const mediaInput = currentMediaUrlOrBase64 || "";
    const targetMediaType = toolConfig.mediaType || mediaType || "image";

    if (targetMediaType === "video" && (!mediaInput || mediaInput.startsWith("data:image/"))) {
      setIsExecuting(false);
      setActiveToolId(null);
      activeAbortRef.current = null;
      toast.error(
        en
          ? "Please select a valid video clip or upload a video file to use this Video AI tool."
          : "يرجى تحديد مقطع فيديو صالح أو رفع ملف فيديو لاستخدام هذه الأداة."
      );
      return;
    }

    let finalAudioInput = mediaInput;
    let audioCleanupFn: (() => void) | null = null;
    let resolvedAudioInfo: ResolvedAudioSource | null = null;

    if (targetMediaType === "audio") {
      const resolved = audioSourceResolver.resolve({
        audioTracks,
        selectedAudioTrackId,
        clips,
        selectedClipId,
        media,
        overlays,
        selectedOverlayId,
        currentTime,
      });

      if (!resolved && !mediaInput) {
        setIsExecuting(false);
        setActiveToolId(null);
        activeAbortRef.current = null;
        toast.error(
          en
            ? "No audio source found. Please add an audio track or a video clip with audio."
            : "لم يتم العثور على أي مصدر صوتي. يرجى إضافة مسار صوتي أو مقطع فيديو يحتوي على صوت."
        );
        return;
      }

      if (resolved) {
        resolvedAudioInfo = resolved;
        try {
          setStatusText(en ? "Extracting audio stream..." : "جاري استخراج ودفق الصوت بدقة أصلية...");
          const prep = await audioSourceResolver.prepareAudioForProcessing(resolved);
          finalAudioInput = prep.audioUrl;
          audioCleanupFn = prep.cleanup;
        } catch (prepErr: any) {
          console.warn("Audio extraction fallback notice:", prepErr);
          if (!finalAudioInput) finalAudioInput = resolved.url;
        }
      }
    }

    const currentMode = toolConfig.id === "separate-vocals" ? isolationMode : toolConfig.payload?.mode || "extract-vocals";

    const rawPayload: Record<string, any> = {
      ...(toolConfig.payload || {}),
      mode: currentMode,
      separationMode: currentMode,
      action: toolConfig.actionName,
      inputMediaType: targetMediaType,
      mediaType: targetMediaType,
      domain: targetMediaType,
      mediaUrlOrBase64: targetMediaType === "audio" ? finalAudioInput : mediaInput,
      imageBase64OrUrl: targetMediaType === "image" ? mediaInput : undefined,
      videoBase64OrUrl: targetMediaType === "video" ? mediaInput : undefined,
      audioBase64OrUrl: targetMediaType === "audio" ? finalAudioInput : undefined,
      toolId: toolConfig.id,
      pluginId: toolConfig.pluginId,
      historyId: `hist_${Date.now()}`,
      projectId: "default_project",
      prompt: toolConfig.payload?.prompt || "",
      negativePrompt: toolConfig.payload?.negativePrompt || "",
    };

    const payload = PayloadValidator.normalize(rawPayload);

    // VIDEO AI ROUTE: Do NOT hit stale cache. Execute via VideoJobManager with full background lifecycle
    if (targetMediaType === "video") {
      const jobId = `video_job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      try {
        const videoResult = await VideoJobManager.getInstance().startJob({
          taskType: toolConfig.actionName === "video-bg-removal" ? "remove-video-background" : "enhance-video",
          toolId: toolConfig.id,
          actionName: toolConfig.actionName,
          targetClipId,
          targetMediaId,
          videoInput: mediaInput,
          options: {
            ...toolConfig.payload,
            jobId,
            abortSignal: abortController.signal,
            onProgress: (prog) => {
              if (abortController.signal.aborted) return;
              const pct = Math.min(100, Math.max(0, prog.progress));
              setExecutingProgress(pct);
              if (prog.message) setStatusText(prog.message);
            },
          },
          inputMediaUrl: mediaInput,
          inputMediaName: "editor-video",
        });

        if (!videoResult || (!videoResult.blob && !videoResult.outputUrl)) {
          throw new Error(en ? "Video AI failed to produce output" : "فشلت المعالجة الذكية في إنتاج الفيديو");
        }

        const resData = {
          jobId,
          outputVideoBase64OrUrl: videoResult.outputUrl,
          blob: videoResult.blob,
          outputBlob: videoResult.blob,
          mimeType: videoResult.mimeType,
          width: videoResult.width,
          height: videoResult.height,
          durationSeconds: videoResult.durationSeconds,
          fps: videoResult.fps,
          hasAlpha: videoResult.hasAlpha,
          targetClipId,
          targetMediaId,
        };

        if (onApplyResult) {
          const applied = await onApplyResult(resData);
          if (applied === false) {
            throw new Error(en ? "Failed to apply video to editor preview" : "فشل تطبيق الفيديو على نافذة المعاينة");
          }
        }

        setExecutingProgress(100);
        setStatusText(en ? "Completed Successfully!" : "اكتملت العملية وتحديث المعاينة بنجاح!");
        playSfx("success");
        toast.success(en ? `${toolConfig.titleEn} applied!` : `تم تطبيق ${toolConfig.titleAr} بنجاح!`);
      } catch (videoErr: any) {
        const errorMsg = videoErr?.message || "Execution failed";
        setLastError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setIsExecuting(false);
        setActiveToolId(null);
        activeAbortRef.current = null;
      }
      return;
    }

    // NON-VIDEO (IMAGE / AUDIO) ROUTE: Preserved completely intact
    const cacheKey = aiManager.cache.generateHash(toolConfig.taskType, payload);
    const cachedData = aiManager.cache.get<any>(cacheKey);

    // Stale check for audio: if cached output is identical to input, invalidate it
    const isAudioTool = targetMediaType === "audio";
    const cachedInputStr = String(payload?.audioBase64OrUrl || payload?.audioBase64 || "").trim();
    const cachedOutputStr = String(
      cachedData?.enhancedAudioUrlOrBase64 || cachedData?.processedAudioUrlOrBase64 || ""
    ).trim();

    if (isAudioTool && cachedData && cachedInputStr && cachedOutputStr && cachedInputStr === cachedOutputStr) {
      aiManager.cache.delete(cacheKey);
    } else if (cachedData) {
      aiRuntime.historyManager.recordJob(
        toolConfig.taskType,
        "AICache",
        0,
        cacheKey,
        true,
        toolConfig.titleAr,
        "Success (Cached)",
        cachedData
      );

      setIsExecuting(false);
      setActiveToolId(null);
      activeAbortRef.current = null;
      if (onApplyResult) {
        await onApplyResult(cachedData);
      } else {
        playSfx("success");
        toast.success(
          en
            ? "Result fetched instantly from AICache ⚡"
            : "تم استرجاع النتيجة فوراً من التخزين المؤقت (AICache) ⚡"
        );
      }
      return;
    }

    // Initialize job in AIProgressManager & global progress subscription
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    aiRuntime.progressManager.createProgress(jobId, en ? "Preparing AI Engine..." : "جاري تهيئة المعالج الذكي...");

    const unsubscribeJob = aiRuntime.progressManager.subscribe(jobId, (prog) => {
      setExecutingProgress(Math.min(100, Math.max(0, prog.percentage)));
      if (prog.currentStage) {
        setStatusText(prog.currentStage);
      }
    });

    const startTime = Date.now();

    try {
      const plugin = aiPlugins.getPlugin(toolConfig.pluginId);
      if (!plugin) {
        throw new Error(`Plugin ${toolConfig.pluginId} not registered`);
      }

      const response = await plugin.execute(toolConfig.actionName, payload, {
        enableCache: true,
        jobId,
        abortSignal: abortController.signal,
        onProgress: (prog) => {
          if (abortController.signal.aborted) return;
          const pct = Math.min(100, Math.max(0, Math.round(prog.progress * 100)));
          setExecutingProgress(pct);
          if (prog.message) {
            setStatusText(prog.message);
          }
          aiRuntime.progressManager.updateProgress(
            jobId,
            pct,
            prog.message || "Processing...",
            pct >= 100 ? "completed" : "processing"
          );
        },
      });

      const executionTimeMs = Date.now() - startTime;

      if (response.success && response.data) {
        // Save result in AICache
        aiManager.cache.set(
          cacheKey,
          toolConfig.taskType,
          response.data,
          24 * 3600 * 1000,
          response.providerUsed
        );

        // Record history entry in AIHistoryManager
        aiRuntime.historyManager.recordJob(
          toolConfig.taskType,
          response.providerUsed || toolConfig.pluginId,
          executionTimeMs,
          cacheKey,
          true,
          toolConfig.titleAr,
          "Success",
          response.data
        );

        aiRuntime.progressManager.updateProgress(
          jobId,
          100,
          en ? "Completed Successfully!" : "اكتملت العملية بنجاح!",
          "completed"
        );

        if (onApplyResult) {
          await onApplyResult({
            ...response.data,
            resolvedAudioSource: resolvedAudioInfo,
          });
        } else {
          playSfx("success");
          toast.success(
            en ? `${toolConfig.titleEn} completed!` : `تم تنفيذ ${toolConfig.titleAr} بنجاح!`
          );
        }
      } else {
        const errorMsg = response.error?.message || "Execution failed";
        setLastError(errorMsg);

        aiRuntime.historyManager.recordJob(
          toolConfig.taskType,
          toolConfig.pluginId,
          executionTimeMs,
          cacheKey,
          false,
          toolConfig.titleAr,
          `Failed: ${errorMsg}`
        );

        aiRuntime.progressManager.updateProgress(
          jobId,
          100,
          en ? "Execution Failed" : "فشلت المعالجة",
          "failed"
        );

        toast.error(errorMsg);
      }
    } catch (err: any) {
      if (abortController.signal.aborted) {
        return;
      }
      const errorMsg = err?.message || "Error running tool";
      setLastError(errorMsg);
      toast.error(errorMsg);
    } finally {
      audioCleanupFn?.();
      unsubscribeJob();
      activeAbortRef.current = null;
      setIsExecuting(false);
      setActiveToolId(null);
    }
  };

  if (isPeeking) {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card/95 border border-primary/40 rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl backdrop-blur-xl animate-in fade-in duration-200"
        dir={en ? "ltr" : "rtl"}
      >
        <button
          onClick={() => {
            playSfx("click");
            setIsPeeking(false);
          }}
          className="flex items-center gap-2 text-xs font-bold text-foreground hover:text-primary transition-colors active:scale-95"
        >
          <Eye className="w-4 h-4 text-primary animate-pulse" />
          <span>{en ? "Show AI Studio" : "إظهار لوحة الذكاء الاصطناعي"}</span>
        </button>
        {isExecuting && (
          <div className="flex items-center gap-2 pl-3 border-l border-border/50">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span className="text-xs font-mono font-bold text-primary">{executingProgress}%</span>
          </div>
        )}
        <button
          onClick={() => {
            playSfx("click");
            onClose();
          }}
          className="w-6 h-6 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
          title={en ? "Close panel" : "إغلاق الواجهة"}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Embedded mode for direct inline mounting inside other panels (e.g. MusicPanel)
  if (embedded) {
    return (
      <div className="space-y-3 w-full animate-in fade-in duration-200" dir={en ? "ltr" : "rtl"}>
        {/* Clean embedded header banner */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30 border border-border/40">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white shadow-xs shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 truncate">
                {en ? "Smart Audio AI Tools" : "أدوات الذكاء الاصطناعي للصوت"}
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-primary/20 text-primary border border-primary/30 uppercase">
                  DSP & AI
                </span>
              </h4>
              <p className="text-[10px] text-muted-foreground truncate">
                {en
                  ? "Vocal isolation, instrumental extraction & DSP noise removal"
                  : "عزل الصوت البشري، استخراج الموسيقى، وتنقية التشويش"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setShowHistory(!showHistory);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shrink-0 ${
              showHistory
                ? "bg-primary text-white"
                : "bg-secondary hover:bg-secondary/80 text-foreground"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{en ? "History" : "السجل"}</span>
            {historyRecords.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {historyRecords.length}
              </span>
            )}
          </button>
        </div>

        {/* Execution Progress Bar Overlay */}
        {isExecuting && (
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 backdrop-blur-md space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-primary">
              <span className="flex items-center gap-2 max-w-[65%] truncate">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                <span className="truncate">{statusText || (en ? "Processing..." : "جاري المعالجة...")}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black">{executingProgress}%</span>
                <button
                  onClick={handleCancelExecution}
                  className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-all flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="w-full bg-secondary/80 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${executingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Last Error Notice */}
        {lastError && !isExecuting && (
          <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
            <span className="truncate max-w-[85%]">{lastError}</span>
            <button
              onClick={() => setLastError(null)}
              className="p-1 hover:bg-destructive/20 rounded text-destructive/80 hover:text-destructive"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-2.5">
          {showHistory ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-primary" />
                  {en ? "Recorded Operations (AI History)" : "سجل العمليات المحفوظة"}
                </span>
              </div>
              {historyRecords.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground bg-secondary/30 rounded-2xl border border-border/30">
                  {en ? "No recorded operations yet." : "لا توجد عمليات سابقة ملقطة بالسجل حتى الآن."}
                </div>
              ) : (
                historyRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-2xl bg-secondary/40 border border-border/40 flex items-center justify-between hover:bg-secondary/60 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-foreground truncate">
                          {rec.payloadSummary || rec.taskType}
                        </h4>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                          <span>•</span>
                          <span>{rec.providerUsed}</span>
                          {rec.durationMs > 0 && (
                            <>
                              <span>•</span>
                              <span>{rec.durationMs}ms</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {rec.resultData && (
                      <button
                        onClick={() => {
                          playSfx("click");
                          if (onApplyResult) onApplyResult(rec.resultData);
                          toast.success(en ? "Applied historical result!" : "تم تطبيق النتيجة السابقة!");
                        }}
                        className="px-3 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold transition-all active:scale-95 shrink-0"
                      >
                        {en ? "Reuse" : "إعادة تطبيق"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableTools.map((tool) => {
                const IconComp = tool.icon;
                const isActive = activeToolId === tool.id;
                return (
                  <div
                    key={tool.id}
                    className={`relative p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      isActive
                        ? "bg-primary/15 border-primary ring-2 ring-primary/40 shadow-lg scale-[1.01]"
                        : "bg-secondary/30 border-border/50 hover:border-primary/40 hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                          <IconComp className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-extrabold text-foreground leading-snug truncate">
                            {en ? tool.titleEn : tool.titleAr}
                          </h4>
                          <span
                            className={`mt-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              tool.badgeType === "ready-dsp"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : tool.badgeType === "ready-ml"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                : "bg-primary/10 text-primary border-primary/20"
                            }`}
                          >
                            <bdi dir="ltr">{tool.badge}</bdi>
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                      {en ? tool.descEn : tool.descAr}
                    </p>
                    {tool.id === "separate-vocals" && (
                      <div className="mb-3 p-1 rounded-xl bg-background/70 border border-border/50 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            playSfx("click");
                            setIsolationMode("extract-vocals");
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all truncate text-center ${
                            isolationMode === "extract-vocals"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "hover:bg-secondary text-muted-foreground"
                          }`}
                        >
                          {en ? "Vocals Only" : "صوت بشري فقط"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSfx("click");
                            setIsolationMode("extract-music");
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all truncate text-center ${
                            isolationMode === "extract-music"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "hover:bg-secondary text-muted-foreground"
                          }`}
                        >
                          {en ? "Music Only" : "موسيقى فقط"}
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (isActive) {
                          handleExitAndBackground();
                        } else {
                          handleRunTool(tool);
                        }
                      }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm ${
                        isActive
                          ? "bg-primary text-white hover:bg-primary/90"
                          : "gradient-primary text-white hover:opacity-95 disabled:opacity-50"
                      }`}
                    >
                      {isActive ? (
                        <div className="flex items-center justify-between w-full px-1">
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{en ? "Processing..." : "جاري المعالجة..."}</span>
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExitAndBackground();
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-lg bg-white/25 hover:bg-white/35 flex items-center gap-1 font-bold cursor-pointer transition-all shadow-sm"
                            title={en ? "Exit & Wait in background" : "خروج والانتظار في الخلفية"}
                          >
                            <ArrowUpRight className="w-3 h-3" />
                            <span>{en ? "Exit & Wait" : "خروج والانتظار"}</span>
                          </span>
                        </div>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{en ? "Apply AI Tool" : "تشغيل الأداة الذكية"}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 bg-card/95 backdrop-blur-2xl border-t border-primary/20 shadow-2xl rounded-t-3xl max-h-[78vh] flex flex-col animate-in slide-in-from-bottom duration-300"
      dir={en ? "ltr" : "rtl"}
    >
      {/* Mobile Sheet Drag Handle */}
      <div className="w-10 h-1 rounded-full bg-border/80 mx-auto mt-2.5 shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white shadow-md shadow-primary/20 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-foreground flex items-center gap-1.5">
              {en ? "AI Creative Studio" : "استوديو الذكاء الاصطناعي"}
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-primary/20 text-primary border border-primary/30 uppercase">
                {selectedCategory === "all" ? (en ? "ALL" : "الكل") : selectedCategory}
              </span>
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {en
                ? "Fast neural segmentation & high-precision DSP"
                : "أدوات عزل وفصل ذكية ومعالجة عالية الدقة"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Peek / Preview Button */}
          <button
            onClick={() => {
              playSfx("click");
              setIsPeeking(true);
            }}
            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary/80 hover:bg-secondary text-foreground flex items-center gap-1 transition-all active:scale-95"
            title={en ? "Peek work & preview video" : "رؤية العمل ومعاينة الفيديو"}
          >
            <Eye className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">{en ? "See Work" : "رؤية العمل"}</span>
          </button>

          {/* History Button */}
          <button
            onClick={() => {
              playSfx("click");
              setShowHistory(!showHistory);
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              showHistory
                ? "bg-primary text-white"
                : "bg-secondary/80 hover:bg-secondary text-foreground"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{en ? "History" : "السجل"}</span>
            {historyRecords.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary-foreground text-primary text-[10px] font-bold flex items-center justify-center">
                {historyRecords.length}
              </span>
            )}
          </button>

          {/* Close Panel Button */}
          <button
            onClick={() => {
              playSfx("click");
              if (isExecuting) {
                toast.info(
                  en
                    ? "AI is continuing to process in the background."
                    : "الذكاء الاصطناعي مستمر بالمعالجة في الخلفية."
                );
              }
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
            title={en ? "Close panel" : "إغلاق الواجهة"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Execution Progress Bar Overlay */}
      {isExecuting && (
        <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-bold text-primary mb-1.5">
            <span className="flex items-center gap-2 max-w-[65%] truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              <span className="truncate">{statusText || (en ? "Processing..." : "جاري المعالجة...")}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black">{executingProgress}%</span>
              
              {/* Exit and Wait Button */}
              <button
                onClick={handleExitAndBackground}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
                title={en ? "Exit and continue working while AI processes in background" : "خروج والانتظار - المتابعة بالخلفية أثناء العمل في المحرر"}
              >
                <ArrowUpRight className="w-3 h-3" />
                <span>{en ? "Exit & Wait" : "خروج والانتظار"}</span>
              </button>

              {/* Optional Subtle Cancel if user wants to abort */}
              <button
                onClick={handleCancelExecution}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-all flex items-center justify-center"
                title={en ? "Cancel processing" : "إلغاء المعالجة"}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="w-full bg-secondary/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 rounded-full"
              style={{ width: `${executingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Category Tabs Bar */}
      {!showHistory && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/30 overflow-x-auto no-scrollbar bg-secondary/15 shrink-0">
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setSelectedCategory("all");
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedCategory === "all"
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                : "bg-secondary/60 hover:bg-secondary text-muted-foreground"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{en ? "All" : "الكل"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setSelectedCategory("video");
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedCategory === "video"
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                : "bg-secondary/60 hover:bg-secondary text-muted-foreground"
            }`}
          >
            <Video className="w-3 h-3" />
            <span>{en ? "Video AI" : "فيديو ذكي"}</span>
            <span className="text-[10px] opacity-75">4</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setSelectedCategory("audio");
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedCategory === "audio"
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                : "bg-secondary/60 hover:bg-secondary text-muted-foreground"
            }`}
          >
            <Music2 className="w-3 h-3" />
            <span>{en ? "Audio & Music" : "صوتيات وموسيقى"}</span>
            <span className="text-[10px] opacity-75">4</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setSelectedCategory("image");
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedCategory === "image"
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                : "bg-secondary/60 hover:bg-secondary text-muted-foreground"
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>{en ? "Images" : "صور وفوتو"}</span>
            <span className="text-[10px] opacity-75">5</span>
          </button>
        </div>
      )}

      {/* Last Error Notice */}
      {lastError && !isExecuting && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center justify-between">
          <span className="truncate max-w-[85%]">{lastError}</span>
          <button
            onClick={() => setLastError(null)}
            className="p-1 hover:bg-destructive/20 rounded text-destructive/80 hover:text-destructive"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="p-3.5 overflow-y-auto max-h-[55vh] space-y-2.5">
        {showHistory ? (
          /* History View */
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-primary" />
                {en ? "Recorded Operations (AI History)" : "سجل العمليات المحفوظة"}
              </span>
            </div>

            {historyRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground bg-secondary/30 rounded-2xl border border-border/30">
                {en ? "No recorded operations yet." : "لا توجد عمليات سابقة ملقطة بالسجل حتى الآن."}
              </div>
            ) : (
              historyRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-2xl bg-secondary/40 border border-border/40 flex items-center justify-between hover:bg-secondary/60 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        {rec.payloadSummary || rec.taskType}
                      </h4>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>{rec.providerUsed}</span>
                        {rec.durationMs > 0 && (
                          <>
                            <span>•</span>
                            <span>{rec.durationMs}ms</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {rec.resultData && (
                    <button
                      onClick={() => {
                        playSfx("click");
                        if (onApplyResult) onApplyResult(rec.resultData);
                        toast.success(en ? "Applied historical result!" : "تم تطبيق النتيجة السابقة!");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold transition-all active:scale-95"
                    >
                      {en ? "Reuse" : "إعادة تطبيق"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          /* Tools Catalog View */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {availableTools.map((tool) => {
              const IconComp = tool.icon;
              const isActive = activeToolId === tool.id;

              return (
                <div
                  key={tool.id}
                  className={`relative p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isActive
                      ? "bg-primary/15 border-primary ring-2 ring-primary/40 shadow-lg scale-[1.01]"
                      : "bg-secondary/30 border-border/50 hover:border-primary/40 hover:bg-secondary/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                        <IconComp className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-extrabold text-foreground leading-snug truncate">
                          {en ? tool.titleEn : tool.titleAr}
                        </h4>
                        <span
                          className={`mt-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            tool.badgeType === "ready-dsp"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : tool.badgeType === "ready-ml"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              : "bg-primary/10 text-primary border-primary/20"
                          }`}
                        >
                          <bdi dir="ltr">{tool.badge}</bdi>
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                    {en ? tool.descEn : tool.descAr}
                  </p>

                  {tool.id === "separate-vocals" && (
                    <div className="mb-3 p-1 rounded-xl bg-background/70 border border-border/50 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          playSfx("click");
                          setIsolationMode("extract-vocals");
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all truncate text-center ${
                          isolationMode === "extract-vocals"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        {en ? "Vocals Only" : "صوت بشري فقط"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playSfx("click");
                          setIsolationMode("extract-music");
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all truncate text-center ${
                          isolationMode === "extract-music"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        {en ? "Music Only" : "موسيقى فقط"}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (isActive) {
                        handleExitAndBackground();
                      } else {
                        handleRunTool(tool);
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                      isActive
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "gradient-primary text-white hover:opacity-95 disabled:opacity-50"
                    }`}
                  >
                    {isActive ? (
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{en ? "Processing..." : "جاري المعالجة..."}</span>
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExitAndBackground();
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-white/25 hover:bg-white/35 flex items-center gap-1 font-bold cursor-pointer transition-all shadow-sm"
                          title={en ? "Exit & Wait in background" : "خروج والانتظار في الخلفية"}
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{en ? "Exit & Wait" : "خروج والانتظار"}</span>
                        </span>
                      </div>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{en ? "Apply AI Tool" : "تشغيل الأداة الذكية"}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-border/40 bg-secondary/20 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5 text-primary font-medium">
          <Sparkles className="w-3 h-3" />
          {en ? "Background AI Processing Ready" : "المعالجة الذكية بالخلفية جاهزة ومفعلة"}
        </span>
        <span className="font-mono text-primary font-bold">{selectedCategory.toUpperCase()} MODE</span>
      </div>
    </div>
  );
};
