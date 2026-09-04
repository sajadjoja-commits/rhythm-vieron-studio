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
  Info
} from "lucide-react";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { PayloadValidator } from "@/ai/utils/PayloadValidator";
import { aiManager, aiRuntime, aiPlugins } from "@/ai";
import { AITaskType } from "@/ai/types/ai";
import { VideoJobManager } from "@/ai/video";

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
    titleAr: "تحسين ووضوح الفيديو (AI Clarity & HDR)",
    titleEn: "AI Video Clarity & HDR Enhance",
    descAr: "معالجة وتحسين ألوان وإطارات الفيديو وموازنة التباين وديناميكية HDR",
    descEn: "Adaptive CLAHE video dynamic range enhancement & detail sharpening",
    icon: Sparkles,
    badge: "HDR AI",
    payload: { isVideo: true },
  },
  {
    id: "video-bg-removal",
    mediaType: "video",
    taskType: "background-removal",
    pluginId: "plugin-video-enhancement",
    actionName: "video-bg-removal",
    titleAr: "إزالة خلفية الفيديو (Neural Cutout)",
    titleEn: "Video Background Removal",
    descAr: "عزل الأشخاص والعناصر من الفيديو وتفريغ الخلفية بذكاء مع تثبيت الحواف",
    descEn: "Isolate moving subjects with temporal stabilization & alpha cutout",
    icon: Wand2,
    badge: "AI CUTOUT",
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
    badge: "CLEAN AI",
    payload: { denoiseIntensity: 0.7 },
  },

  // ---------------- IMAGE AI TOOLS ----------------
  {
    id: "remove-background",
    mediaType: "image",
    taskType: "background-removal",
    pluginId: "plugin-image-enhancement",
    actionName: "remove-background",
    titleAr: "إزالة الخلفية (RMBG-2.0)",
    titleEn: "Remove Background (RMBG-2.0)",
    descAr: "عزل دقيق جداً للموضوع وحذف الخلفية بدقة فائقة",
    descEn: "High-precision AI foreground extraction & cutout",
    icon: Scissors,
    badge: "RMBG 2.0",
  },
  {
    id: "face-enhance",
    mediaType: "image",
    taskType: "enhance-media",
    pluginId: "plugin-image-enhancement",
    actionName: "face-enhance",
    titleAr: "تحسين الوجوه والبورتريه (GFPGAN)",
    titleEn: "Portrait & Face Restoration",
    descAr: "توضيح الوجوه ومعالجة تفاصيل العينين والجلد وتفاصيل البورتريه",
    descEn: "Restore facial details, eye sharpness & skin clarity",
    icon: Smile,
    badge: "FACE AI",
  },
  {
    id: "object-remove",
    mediaType: "image",
    taskType: "background-removal",
    pluginId: "plugin-image-enhancement",
    actionName: "object-remove",
    titleAr: "حذف العناصر غير المرغوبة (LaMa)",
    titleEn: "Object & Watermark Removal",
    descAr: "إزالة الشوائب والعناصر غير المرغوبة من الخلفية بذكاء",
    descEn: "Intelligent inpainting object & watermark removal",
    icon: Trash2,
    badge: "INPAINT",
  },
  {
    id: "denoise",
    mediaType: "image",
    taskType: "noise-reduction",
    pluginId: "plugin-image-enhancement",
    actionName: "denoise",
    titleAr: "تنقية التحبيب SCUNet Denoise",
    titleEn: "SCUNet Image Denoise",
    descAr: "إزالة الضوضاء وتنعيم الصورة بدون فقدان الحواف الحادة",
    descEn: "Remove digital grain preserving sharp boundaries",
    icon: ShieldCheck,
    badge: "DENOISE",
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
    badge: "MASTER",
  },

  // ---------------- AUDIO AI TOOLS ----------------
  {
    id: "audio-denoise",
    mediaType: "audio",
    taskType: "noise-reduction",
    pluginId: "plugin-audio-enhancement",
    actionName: "denoise",
    titleAr: "تنقية ضوضاء الغرفة (DeepFilterNet)",
    titleEn: "DeepFilterNet Noise Reduction",
    descAr: "عزل صوت المروحة والمحيط والصدى ناصعاً بنقاء تبيين الكلام",
    descEn: "Remove background hiss, fan noise & room reverberation",
    icon: Mic,
    badge: "CLEAN VOICE",
    payload: { denoiseIntensity: 0.85 },
  },
  {
    id: "separate-vocals",
    mediaType: "audio",
    taskType: "vocal-isolation",
    pluginId: "plugin-audio-enhancement",
    actionName: "separate",
    titleAr: "عزل صوت المتحدث (Demucs v4)",
    titleEn: "Vocal Isolation (Demucs v4)",
    descAr: "استخراج صوت المتحدث بنقاء وتصفية الخلفية الموسيقية",
    descEn: "Extract crystal clear vocal track from music",
    icon: Music2,
    badge: "VOCALS ONLY",
    payload: { mode: "extract-vocals" },
  },
  {
    id: "separate-music",
    mediaType: "audio",
    taskType: "music-removal",
    pluginId: "plugin-audio-enhancement",
    actionName: "separate",
    titleAr: "إزالة الموسيقى والخلفية",
    titleEn: "Music / Background Removal",
    descAr: "عزل الموسيقى أو حجب النغمات من المقطع الصوتي",
    descEn: "Isolate vocal dialogue by filtering out music tracks",
    icon: VolumeX,
    badge: "NO MUSIC",
    payload: { mode: "extract-music" },
  },
  {
    id: "audio-enhance-composite",
    mediaType: "audio",
    taskType: "enhance-media",
    pluginId: "plugin-audio-enhancement",
    actionName: "audio-enhance-composite",
    titleAr: "الماسترينغ والتنظيف الشامل الصوت",
    titleEn: "AI Audio Master Pipeline",
    descAr: "تنقية + توازن الصوت + مكس احترافي بالذكاء الاصطناعي",
    descEn: "Full audio mastering: Denoise + EQ + Volume Balancing",
    icon: Sparkles,
    badge: "MASTER AUDIO",
  },
  {
    id: "transcribe",
    mediaType: "audio",
    taskType: "speech-to-text",
    pluginId: "plugin-audio-enhancement",
    actionName: "transcribe",
    titleAr: "تفريغ الصوت إلى نص (Groq Whisper)",
    titleEn: "AI Speech-to-Text Transcription",
    descAr: "تحويل الحديث والنطق إلى نصوص وكابشن تلقائي دقيق",
    descEn: "Transcribe spoken audio into text captions using Groq Whisper",
    icon: FileText,
    badge: "WHISPER STT",
  },
];

interface AIToolsPanelProps {
  open: boolean;
  onClose: () => void;
  mediaType: "video" | "image" | "audio";
  currentMediaUrlOrBase64?: string;
  onApplyResult?: (resultData: any) => void | Promise<void | boolean>;
}

export const AIToolsPanel = ({
  open,
  onClose,
  mediaType,
  currentMediaUrlOrBase64,
  onApplyResult,
}: AIToolsPanelProps) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [executingProgress, setExecutingProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);

  const en = getLang() === "en";

  // Filter ONLY tools matching the active media type
  const availableTools = useMemo(() => {
    return AI_TOOLS_CATALOG.filter((tool) => tool.mediaType === mediaType);
  }, [mediaType]);

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

    const rawPayload: Record<string, any> = {
      ...(toolConfig.payload || {}),
      action: toolConfig.actionName,
      inputMediaType: targetMediaType,
      mediaType: targetMediaType,
      domain: targetMediaType,
      mediaUrlOrBase64: mediaInput,
      imageBase64OrUrl: targetMediaType === "image" ? mediaInput : undefined,
      videoBase64OrUrl: targetMediaType === "video" ? mediaInput : undefined,
      audioBase64OrUrl: targetMediaType === "audio" ? mediaInput : undefined,
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
          outputVideoBase64OrUrl: videoResult.outputUrl,
          blob: videoResult.blob,
          outputBlob: videoResult.blob,
          mimeType: videoResult.mimeType,
          width: videoResult.width,
          height: videoResult.height,
          durationSeconds: videoResult.durationSeconds,
          fps: videoResult.fps,
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

    if (cachedData) {
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
          await onApplyResult(response.data);
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
      unsubscribeJob();
      activeAbortRef.current = null;
      setIsExecuting(false);
      setActiveToolId(null);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 bg-card/95 backdrop-blur-2xl border-t border-primary/20 shadow-2xl rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
      dir={en ? "ltr" : "rtl"}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-white shadow-md shadow-primary/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              {mediaType === "video"
                ? en
                  ? "AI Video Tools"
                  : "أدوات الذكاء الاصطناعي للفيديو"
                : mediaType === "image"
                ? en
                  ? "AI Image Tools"
                  : "أدوات الذكاء الاصطناعي للصور"
                : en
                ? "AI Audio Tools"
                : "أدوات الذكاء الاصطناعي للصوت"}
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/20 text-primary border border-primary/30">
                AI Manager
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {en
                ? "Powered by AI Plugins, Cache & History"
                : "مدعوم بواسطة المحرك الذكي والتخزين المؤقت"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              playSfx("click");
              setShowHistory(!showHistory);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              showHistory
                ? "bg-primary text-white"
                : "bg-secondary hover:bg-secondary/80 text-foreground"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{en ? "History" : "السجل"}</span>
            {historyRecords.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary-foreground text-primary text-[10px] font-bold flex items-center justify-center">
                {historyRecords.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              playSfx("click");
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Execution Progress Bar Overlay */}
      {isExecuting && (
        <div className="px-5 py-3.5 bg-primary/10 border-b border-primary/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-bold text-primary mb-2">
            <span className="flex items-center gap-2 max-w-[70%] truncate">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <span className="truncate">{statusText || (en ? "Processing..." : "جاري المعالجة...")}</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm">{executingProgress}%</span>
              <button
                onClick={handleCancelExecution}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive font-medium border border-destructive/20 transition-all flex items-center gap-1"
                title={en ? "Cancel processing" : "إلغاء المعالجة"}
              >
                <X className="w-3 h-3" />
                <span>{en ? "Cancel" : "إلغاء"}</span>
              </button>
            </div>
          </div>
          <div className="w-full bg-secondary/80 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 rounded-full"
              style={{ width: `${executingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Last Error Notice */}
      {lastError && !isExecuting && (
        <div className="px-5 py-2.5 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center justify-between">
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
      <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
        {showHistory ? (
          /* History View */
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-primary" />
                {en ? "Recorded Operations (AIHistoryManager)" : "سجل العمليات المحفوظة"}
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
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-foreground leading-tight">
                          {en ? tool.titleEn : tool.titleAr}
                        </h4>
                        <span className="mt-0.5 inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                          {tool.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                    {en ? tool.descEn : tool.descAr}
                  </p>

                  <button
                    onClick={() => handleRunTool(tool)}
                    disabled={isExecuting}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                      isActive
                        ? "bg-primary text-white"
                        : "gradient-primary text-white hover:opacity-95 disabled:opacity-50"
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{en ? "Processing..." : "جاري المعالجة..."}</span>
                      </>
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
      <div className="px-5 py-2.5 border-t border-border/40 bg-secondary/20 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-primary" />
          {en
            ? "Results are automatically cached for fast reuse."
            : "يتم التخزين المؤقت للنتائج تلقائياً في AICache لإعادة الاستخدام السريع."}
        </span>
        <span className="font-mono text-primary font-bold">{mediaType.toUpperCase()} MODE</span>
      </div>
    </div>
  );
};
