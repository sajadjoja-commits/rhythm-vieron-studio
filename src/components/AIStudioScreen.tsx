import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Video,
  Music,
  Scissors,
  Layers,
  Cpu,
  Smartphone,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Download,
  Upload,
  Sliders,
  Zap,
  ArrowLeft,
  X,
  Eye,
  Activity,
  Maximize2,
  ShieldCheck,
  Flame,
  Volume2,
  VolumeX,
  Brush,
} from "lucide-react";
import { toast } from "sonner";
import { aiRuntime } from "@/ai/runtime/AIRuntime";
import { aiPlugins } from "@/ai/plugins";
import { AIJobProgress, DeviceResourceProfile } from "@/ai/runtime/types";
import { getLang, isRTL } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { PayloadValidator } from "@/ai/utils/PayloadValidator";
import { FluxImageCreator } from "@/components/ai/FluxImageCreator";
import { BeforeAfterSlider } from "@/components/ui/BeforeAfterSlider";
import { ImagePreviewEngine } from "@/components/imageAi/ImagePreviewEngine";
import { AILoadingOverlay } from "@/components/ui/AILoadingOverlay";
import { BackgroundRemovalResult } from "@/components/imageAi/BackgroundRemovalResult";
import { VideoJobManager, VideoJobRecord } from "@/ai/video";

export interface AIToolConfig {
  id: string;
  category: "image" | "video" | "audio";
  pluginId: string;
  actionName: string;
  taskType: "background-removal" | "enhance-media" | "noise-reduction" | "vocal-isolation";
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  executionModeLabel: "Local" | "Hybrid" | "Cloud";
  accept: "image" | "video" | "audio";
}

export const AI_STUDIO_TOOLS: AIToolConfig[] = [
  // --- AI IMAGE TOOLS ---
  {
    id: "img-bg-removal",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "remove-background",
    taskType: "background-removal",
    nameAr: "إزالة الخلفية (Smart AI Segmentation)",
    nameEn: "AI Background Removal (ML Subject Segmentation)",
    descAr: "عزل دقيق للعناصر وتفريغ الخلفيات بجودة عالية وقناع ذكي قابل للتعديل",
    descEn: "High-accuracy foreground extraction & background removal with smart mask editing",
    icon: Scissors,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "image",
  },
  {
    id: "img-enhance",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "enhance",
    taskType: "enhance-media",
    nameAr: "تحسين وتوضيح الصور (AI Image Enhance)",
    nameEn: "AI Image Enhance (Denoise, HDR & Face Polish)",
    descAr: "تنقية التحبيب والضوضاء، تحسين التباين وديناميكية الألوان، وترميم تفاصيل الوجوه",
    descEn: "Bilateral adaptive denoise, dynamic HDR range contrast, and BlazeFace detail restoration",
    icon: Sparkles,
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.12)",
    executionModeLabel: "Local",
    accept: "image",
  },

  // --- AI VIDEO TOOLS ---
  {
    id: "vid-enhance",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "composite-video-enhance",
    taskType: "enhance-media",
    nameAr: "تحسين ومعالجة الفيديو (AI Video Enhance)",
    nameEn: "AI Video Enhance (Auto Color & Clarity)",
    descAr: "معالجة وتحسين ألوان وإطارات الفيديو وموازنة التباين وتنقية النويز عبر الإطارات",
    descEn: "Adaptive multi-scale CLAHE video enhancement, dynamic HDR color & bilateral denoise",
    icon: Video,
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "video",
  },
  {
    id: "vid-bg-removal",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "video-bg-removal",
    taskType: "background-removal",
    nameAr: "تفريغ وعزل خلفية الفيديو (AI Video Cutout)",
    nameEn: "AI Video Background Removal (Neural Matting)",
    descAr: "عزل الأشخاص والعناصر من الفيديو وتفريغ الخلفية بذكاء مع تثبيت الحواف عبر الإطارات",
    descEn: "Real-time AI video background matting and alpha cutout with temporal stabilization",
    icon: Wand2,
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "video",
  },

  // --- AI AUDIO TOOLS ---
  {
    id: "aud-enhance",
    category: "audio",
    pluginId: "plugin-audio-enhancement",
    actionName: "audio-enhance-composite",
    taskType: "enhance-media",
    nameAr: "تنقية وعزل الصوت (AI Audio Enhance)",
    nameEn: "AI Audio Enhance (DeepFilterNet & Isolation)",
    descAr: "تنقية ضوضاء الخلفية، إزالة الصدى، وتحسين نقاء الأصوات والكلام البشري",
    descEn: "Neural speech enhancement, DeepFilterNet background denoise & vocal clarity",
    icon: Volume2,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "audio",
  },
];

interface AIStudioScreenProps {
  onBack?: () => void;
  onOpenPhotoEditor?: (imageUrl?: string) => void;
  onOpenVideoEditor?: (imageUrl?: string) => void;
}

const AIStudioScreen: React.FC<AIStudioScreenProps> = ({ onBack, onOpenPhotoEditor, onOpenVideoEditor }) => {
  const en = getLang() === "en";
  const rtl = isRTL();

  const [activeTab, setActiveTab] = useState<"all" | "creator" | "image" | "video" | "audio">("all");
  const [showFluxCreator, setShowFluxCreator] = useState(false);
  const [deviceProfile, setDeviceProfile] = useState<DeviceResourceProfile | null>(null);

  // Tool modal state
  const [selectedTool, setSelectedTool] = useState<AIToolConfig | null>(null);
  const [inputMedia, setInputMedia] = useState<{ url: string; file?: File; name: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<AIJobProgress | null>(null);
  const [resultData, setResultData] = useState<any | null>(null);
  const [upscaleFactor, setUpscaleFactor] = useState<number>(2);
  const [denoiseIntensity, setDenoiseIntensity] = useState<number>(0.75);
  const [contrastBoost, setContrastBoost] = useState<number>(0.6);
  const [detailSharpen, setDetailSharpen] = useState<number>(0.5);
  const [enableFaceRestore, setEnableFaceRestore] = useState<boolean>(true);
  const [showMaskEditorModal, setShowMaskEditorModal] = useState<boolean>(false);
  const [activeVideoJob, setActiveVideoJob] = useState<VideoJobRecord | null>(null);
  const [videoBgMode, setVideoBgMode] = useState<"checkerboard" | "black" | "green" | "white">("checkerboard");

  useEffect(() => {
    try {
      const profile = aiRuntime.getDeviceProfile();
      setDeviceProfile(profile);
    } catch {
      // Fallback
    }

    // Subscribe to background video jobs to support navigation survival
    const unsubscribeVideoJob = VideoJobManager.getInstance().subscribeActive((job) => {
      setActiveVideoJob(job);
      if (job) {
        setProcessing(true);
        setCurrentProgress({
          jobId: job.id,
          percentage: job.progress,
          currentStage: job.stageMessage || `${job.status} (${job.currentFrame}/${job.totalFrames})`,
          status: "processing",
        });

        // Ensure matching video tool is selected if none
        setSelectedTool((prev) => {
          if (prev) return prev;
          return AI_STUDIO_TOOLS.find(
            (t) => t.id === job.toolId || t.actionName === job.actionName || (t.category === "video" && job.taskType.includes("video"))
          ) || null;
        });

        if (job.inputMediaUrl) {
          setInputMedia((prev) => prev || { url: job.inputMediaUrl, name: job.inputMediaName || "video_clip.mp4" });
        }
      } else {
        // If not running, check if we need to release processing state
        setProcessing(false);
      }
    });

    // Check if there was a completed job from this session
    const latestCompleted = VideoJobManager.getInstance().getLatestCompletedJob();
    if (latestCompleted && latestCompleted.result) {
      const matchingTool = AI_STUDIO_TOOLS.find(
        (t) => t.id === latestCompleted.toolId || t.actionName === latestCompleted.actionName || (t.category === "video" && latestCompleted.taskType.includes("video"))
      );
      if (matchingTool) {
        setSelectedTool((prev) => prev || matchingTool);
        setInputMedia((prev) => prev || { url: latestCompleted.inputMediaUrl, name: latestCompleted.inputMediaName || "video_clip.mp4" });
        setResultData((prev: any) => prev || {
          outputVideoBase64OrUrl: latestCompleted.result?.outputUrl,
          mimeType: latestCompleted.result?.mimeType,
          width: latestCompleted.result?.width,
          height: latestCompleted.result?.height,
          durationSeconds: latestCompleted.result?.durationSeconds,
          fps: latestCompleted.result?.fps,
          executionTimeMs: latestCompleted.result?.executionTimeMs,
          appliedEngine: latestCompleted.result?.appliedEngine,
        });
      }
    }

    return () => {
      unsubscribeVideoJob();
    };
  }, []);

  const filteredTools = AI_STUDIO_TOOLS.filter((t) => activeTab === "all" || t.category === activeTab);

  // Helper to trigger tool execution via AI Runtime & Plugin System / VideoJobManager
  const handleRunTool = async () => {
    if (!selectedTool) return;
    if (!inputMedia) {
      toast.error(en ? "Please upload or select an input media file first" : "يرجى اختيار أو رفع ملف وسائط أولاً");
      return;
    }

    if (selectedTool.category === "video" && (!inputMedia.url || inputMedia.url.startsWith("data:image/"))) {
      toast.error(
        en
          ? "Please upload a valid video file (MP4, WEBM, MOV) to use Video AI."
          : "يرجى رفع ملف فيديو حقيقي (MP4, WEBM, MOV) لاستخدام أدوات فيديو AI."
      );
      return;
    }

    playSfx("pop");
    setProcessing(true);
    setResultData(null);
    setCurrentProgress({
      jobId: "pending",
      percentage: 10,
      currentStage: en ? "Preparing AI Engine..." : "جاري تحضير محرك الذكاء الاصطناعي...",
      status: "queued",
    });

    try {
      if (selectedTool.category === "video") {
        const videoTaskType = selectedTool.actionName === "video-bg-removal" ? "remove-video-background" : "enhance-video";
        const res = await VideoJobManager.getInstance().startJob({
          taskType: videoTaskType,
          videoInput: inputMedia.url,
          toolId: selectedTool.id,
          actionName: selectedTool.actionName,
          inputMediaUrl: inputMedia.url,
          inputMediaName: inputMedia.name,
          options: {
            denoiseIntensity,
            sharpnessIntensity: detailSharpen,
            claheClipLimit: contrastBoost * 2.5,
            colorVibrance: 0.3,
            preserveAudio: true,
          },
        });

        if (res && res.outputUrl) {
          setResultData({
            outputVideoBase64OrUrl: res.outputUrl,
            mimeType: res.mimeType,
            width: res.width,
            height: res.height,
            durationSeconds: res.durationSeconds,
            fps: res.fps,
            executionTimeMs: res.executionTimeMs,
            appliedEngine: res.appliedEngine,
          });
          playSfx("success");
          toast.success(en ? "AI video task completed successfully!" : "تمت معالجة الفيديو بنجاح!");
        } else {
          throw new Error("No output generated");
        }
      } else {
        const plugin = aiPlugins.getPlugin(selectedTool.pluginId);
        if (!plugin) {
          throw new Error(`Plugin ${selectedTool.pluginId} not registered in AI Runtime`);
        }

        // Build payload based on tool category
        let rawPayload: any = {
          toolId: selectedTool.id,
          pluginId: selectedTool.pluginId,
          historyId: `hist_${Date.now()}`,
          projectId: "default_project",
        };
        if (selectedTool.category === "image") {
          rawPayload = {
            ...rawPayload,
            imageBase64OrUrl: inputMedia.url,
            action: selectedTool.actionName,
            upscaleFactor,
            denoiseIntensity,
            contrastBoost,
            detailSharpen,
            enhanceFace: enableFaceRestore,
          };
        } else if (selectedTool.category === "audio") {
          rawPayload = {
            ...rawPayload,
            audioBase64OrUrl: inputMedia.url,
            action: selectedTool.actionName,
            denoiseIntensity,
            separationMode: "extract-vocals",
          };
        }

        const payload = PayloadValidator.normalize(rawPayload);

        // Subscribe to live real-time progress updates during model execution
        const unsubscribeProgress = aiRuntime.progressManager.subscribeGlobal((p) => {
          setCurrentProgress(p);
        });

        let response;
        try {
          response = await aiRuntime.runTask(
            selectedTool.taskType,
            payload,
            {
              executionMode: selectedTool.executionModeLabel === "Local" ? "local" : "auto",
              onProgress: (p) => setCurrentProgress(p),
            }
          );
        } finally {
          unsubscribeProgress();
        }

        if (response.success && response.data) {
          setResultData(response.data);
          playSfx("success");
          toast.success(en ? "AI task completed successfully!" : "تمت معالجة المهمة بنجاح!");
        } else {
          const errorMsg = response.error?.message || (en ? "Execution failed" : "فشلت عملية المعالجة");
          toast.error(errorMsg);
        }
      }
    } catch (err: any) {
      if (err?.message?.includes("إلغاء") || err?.message?.includes("cancel")) {
        // User cancelled, quiet
      } else {
        console.error("AI Studio execution error:", err);
        toast.error(err.message || (en ? "An error occurred during AI processing" : "حدث خطأ أثناء معالجة الذكاء الاصطناعي"));
      }
    } finally {
      setProcessing(false);
    }
  };

  // Helper to load sample media for easy 1-click testing
  const handleLoadSampleMedia = (type: "image" | "video" | "audio") => {
    playSfx("click");
    if (type === "image") {
      // High-quality SVG/Canvas sample image
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 600, 600);
        grad.addColorStop(0, "#1e1b4b");
        grad.addColorStop(0.5, "#4c1d95");
        grad.addColorStop(1, "#831843");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 600, 600);

        ctx.fillStyle = "#f43f5e";
        ctx.beginPath();
        ctx.arc(300, 300, 140, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Vireon AI Studio Sample", 300, 310);
      }
      const dataUrl = canvas.toDataURL("image/png");
      setInputMedia({ url: dataUrl, name: "Sample_Photo.png" });
      toast.info(en ? "Sample media loaded for testing" : "تم تحميل ملف وسائط تجريبي للاختبار");
    } else if (type === "audio") {
      // Sample audio
      setInputMedia({
        url: "https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg",
        name: "Sample_Audio_Recording.wav",
      });
      toast.info(en ? "Sample audio loaded for testing" : "تم تحميل ملف صوتي تجريبي للاختبار");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setInputMedia({ url, file, name: file.name });
    toast.success(en ? `File ${file.name} ready` : `الملف ${file.name} جاهز للمعالجة`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 px-4 pt-6 select-none" dir={rtl ? "rtl" : "ltr"}>
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={() => {
                playSfx("click");
                onBack();
              }}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
            >
              <ArrowLeft className={`w-5 h-5 ${rtl ? "rotate-180" : ""}`} />
            </button>
          )}
          <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center shadow-md shadow-primary/20">
            <Wand2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg font-bold text-foreground">
                {en ? "AI Studio" : "استوديو الذكاء الاصطناعي"}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-extrabold tracking-wider uppercase">
                Runtime v1.0
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {en ? "Professional Unified AI Processing Engines" : "أدوات معالجة الصوت والفيديو والصور بالذكاء الاصطناعي"}
            </p>
          </div>
        </div>
      </div>

      {/* Featured AI Image Creator (FLUX.1) Hero Banner */}
      <div className="mb-6 rounded-3xl bg-gradient-to-r from-purple-950/80 via-indigo-900/60 to-slate-900/80 border border-purple-500/40 p-5 shadow-xl relative overflow-hidden group">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-400 flex items-center justify-center shadow-lg shadow-purple-500/30 flex-shrink-0">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold text-[10px] tracking-wider uppercase border border-amber-400/30">
                  {en ? "Featured Feature" : "الميزة الأساسية الجديدة"}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-extrabold text-[10px] tracking-wider uppercase border border-purple-500/30">
                  FLUX.1 Engine
                </span>
              </div>
              <h2 className="font-heading text-base sm:text-lg font-bold text-white mt-1">
                {en ? "AI Image Creator (FLUX.1)" : "صانع الصور الذكي (FLUX.1 AI Creator)"}
              </h2>
              <p className="text-xs text-purple-200/80 max-w-lg mt-0.5">
                {en
                  ? "Generate hyperrealistic artwork, designs & portraits via official Black Forest Labs FLUX.1 API"
                  : "توليد صور وديكورات وبورتريهات فائقة الجودة بدقة متناهية باستخدام محرك FLUX.1 الرسمي"}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playSfx("pop");
              setShowFluxCreator(true);
            }}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500 hover:from-purple-600 hover:to-amber-600 text-white font-extrabold text-xs shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-transform active:scale-95 whitespace-nowrap"
          >
            <Wand2 className="w-4 h-4 text-amber-100" />
            <span>{en ? "Launch FLUX Creator" : "افتح صانع الصور FLUX.1"}</span>
          </button>
        </div>
      </div>

      {/* Category Tabs Filter */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: "all", labelAr: "الكل", labelEn: "All Tools", count: AI_STUDIO_TOOLS.length },
          {
            id: "creator",
            labelAr: "صانع FLUX.1",
            labelEn: "FLUX.1 Creator",
            icon: Sparkles,
            count: 1,
          },
          {
            id: "image",
            labelAr: "معالجة الصور",
            labelEn: "Photo Polish",
            icon: ImageIcon,
            count: AI_STUDIO_TOOLS.filter((t) => t.category === "image").length,
          },
          {
            id: "video",
            labelAr: "فيديو AI",
            labelEn: "AI Video",
            icon: Video,
            count: AI_STUDIO_TOOLS.filter((t) => t.category === "video").length,
          },
          {
            id: "audio",
            labelAr: "صوت AI",
            labelEn: "AI Audio",
            icon: Music,
            count: AI_STUDIO_TOOLS.filter((t) => t.category === "audio").length,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                playSfx("click");
                setActiveTab(tab.id as any);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md glow-primary-sm"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{en ? tab.labelEn : tab.labelAr}</span>
              <span
                className={`px-1.5 py-0.2 text-[9px] rounded-full font-extrabold ${
                  isActive ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Show FLUX.1 Creator inline if tab selected or modal overlay if button clicked */}
      {(showFluxCreator || activeTab === "creator") && (
        <div className="mb-8 animate-fade-in">
          <FluxImageCreator
            onClose={() => {
              setShowFluxCreator(false);
              if (activeTab === "creator") setActiveTab("all");
            }}
            onOpenPhotoEditor={onOpenPhotoEditor}
            onOpenVideoEditor={onOpenVideoEditor}
          />
        </div>
      )}

      {/* Tools Cards Grid */}
      {activeTab !== "creator" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredTools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <div
              key={tool.id}
              onClick={() => {
                playSfx("pop");
                setSelectedTool(tool);
                setInputMedia(null);
                setResultData(null);
              }}
              className="group relative rounded-2xl bg-card border border-border hover:border-primary/50 p-4 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-primary/5 flex flex-col justify-between active:scale-[0.99]"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ background: tool.bg }}
                  >
                    <IconComponent className="w-5 h-5" style={{ color: tool.color }} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                        tool.executionModeLabel === "Local"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : tool.executionModeLabel === "Hybrid"
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      }`}
                    >
                      {tool.executionModeLabel}
                    </span>
                  </div>
                </div>

                <h3 className="font-heading text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {en ? tool.nameEn : tool.nameAr}
                </h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                  {en ? tool.descEn : tool.descAr}
                </p>

                {/* Additional Hardware & Engine Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground text-[9px] font-mono border border-border/50">
                    RAM: ~120MB
                  </span>
                  <span className="px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground text-[9px] font-mono border border-border/50">
                    Est: ~0.4s
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] font-bold border border-emerald-500/20">
                    Model Ready
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border/50 text-[11px] font-bold text-primary">
                <span className="flex items-center gap-1">
                  <Wand2 className="w-3.5 h-3.5" />
                  {en ? "Launch Tool" : "تشغيل الأداة"}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                  {tool.category}
                </span>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Tool Execution Dialog Modal */}
      {selectedTool && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!processing) {
              setSelectedTool(null);
              setInputMedia(null);
              setResultData(null);
            }
          }}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-3xl bg-card border border-border p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            dir={rtl ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: selectedTool.bg }}
                >
                  <selectedTool.icon className="w-6 h-6" style={{ color: selectedTool.color }} />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">
                    {en ? selectedTool.nameEn : selectedTool.nameAr}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Plugin: {selectedTool.pluginId}
                    </span>
                    <span className="px-2 py-0.2 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
                      {selectedTool.executionModeLabel} Execution
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!processing) {
                    setSelectedTool(null);
                    setInputMedia(null);
                    setResultData(null);
                  }
                }}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              {en ? selectedTool.descEn : selectedTool.descAr}
            </p>

            {/* Input Selection Section */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-foreground mb-2">
                {en ? "1. Select Source Media" : "1. اختر ملف الوسائط المصدر"}
              </label>

              {inputMedia ? (
                <div className="relative rounded-2xl border border-border bg-secondary/50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate">
                    {selectedTool.category === "image" ? (
                      <img
                        src={inputMedia.url}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        className="w-12 h-12 rounded-xl object-cover border"
                      />
                    ) : selectedTool.category === "video" ? (
                      <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                        <Video className="w-6 h-6 text-primary" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                        <Music className="w-6 h-6 text-purple-500" />
                      </div>
                    )}
                    <div className="truncate">
                      <p className="text-xs font-bold text-foreground truncate">{inputMedia.name}</p>
                      <p className="text-[10px] text-emerald-500 font-semibold">
                        {en ? "Ready for AI Engine" : "جاهز للمعالجة بالذكاء الاصطناعي"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInputMedia(null)}
                    className="p-1.5 rounded-lg bg-background hover:bg-secondary text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className={selectedTool.category === "video" ? "grid grid-cols-1" : "grid grid-cols-2 gap-2.5"}>
                  <label className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 cursor-pointer transition-colors text-center">
                    <Upload className="w-6 h-6 text-primary mb-1.5" />
                    <span className="text-xs font-bold text-foreground">{en ? "Upload Real Video File" : "رفع ملف فيديو حقيقي"}</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      {selectedTool.category === "image"
                        ? "PNG, JPG, WEBP"
                        : selectedTool.category === "video"
                        ? "MP4, WEBM, MOV"
                        : "WAV, MP3, M4A"}
                    </span>
                    <input
                      type="file"
                      accept={
                        selectedTool.category === "image"
                          ? "image/*"
                          : selectedTool.category === "video"
                          ? "video/*"
                          : "audio/*"
                      }
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {selectedTool.category !== "video" && (
                    <button
                      onClick={() => handleLoadSampleMedia(selectedTool.category)}
                      className="flex flex-col items-center justify-center p-4 rounded-2xl border border-border hover:border-primary/50 bg-card hover:bg-secondary/40 transition-colors text-center"
                    >
                      <Sparkles className="w-6 h-6 text-amber-500 mb-1.5" />
                      <span className="text-xs font-bold text-foreground">{en ? "Use Sample" : "ملف تجريبي"}</span>
                      <span className="text-[9px] text-muted-foreground mt-0.5">
                        {en ? "Quick 1-click test" : "تجربة فورية بنقرة واحدة"}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tool Specific Config Options */}
            {selectedTool.actionName === "upscale" && (
              <div className="mb-5 p-3 rounded-2xl bg-secondary/30 border border-border">
                <label className="block text-xs font-bold text-foreground mb-2">
                  {en ? "Upscale Factor:" : "معامل التكبير:"}
                </label>
                <div className="flex gap-2">
                  {[2, 4].map((factor) => (
                    <button
                      key={factor}
                      onClick={() => setUpscaleFactor(factor)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        upscaleFactor === factor
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {factor}x Resolution
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTool.actionName === "enhance" && (
              <div className="mb-5 p-3.5 rounded-2xl bg-secondary/30 border border-border space-y-3.5">
                {/* Denoise slider */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-foreground mb-1.5">
                    <span>{en ? "Adaptive Bilateral Denoise:" : "تنقية النويز والحبيبات:"}</span>
                    <span className="font-mono text-primary">{Math.round(denoiseIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={denoiseIntensity}
                    onChange={(e) => setDenoiseIntensity(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                {/* Dynamic Contrast slider */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-foreground mb-1.5">
                    <span>{en ? "Dynamic Contrast & HDR:" : "التباين وديناميكية الألوان:"}</span>
                    <span className="font-mono text-primary">{Math.round(contrastBoost * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={contrastBoost}
                    onChange={(e) => setContrastBoost(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                {/* Detail Sharpening slider */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-foreground mb-1.5">
                    <span>{en ? "Detail & Texture Sharpening:" : "توضيح التفاصيل والحواف:"}</span>
                    <span className="font-mono text-primary">{Math.round(detailSharpen * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={detailSharpen}
                    onChange={(e) => setDetailSharpen(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                {/* Face Restoration toggle */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <div>
                    <span className="text-xs font-bold text-foreground block">
                      {en ? "Facial Detail Polish (BlazeFace)" : "ترميم ملامح الوجوه (BlazeFace)"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {en ? "Auto detect portrait faces & refine features" : "كشف الوجوه تلقائياً وتوضيح الملامح"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableFaceRestore(!enableFaceRestore)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      enableFaceRestore ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        enableFaceRestore ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Progress Container powered by AIProgressManager & VideoJobManager */}
            {processing && currentProgress && (
              <div className="mb-5 p-4 rounded-2xl bg-secondary border border-border animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs font-bold text-foreground">
                      {currentProgress.currentStage || (en ? "Processing..." : "جاري المعالجة...")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-extrabold text-primary">
                      {currentProgress.percentage}%
                    </span>
                    {selectedTool?.category === "video" && (
                      <button
                        type="button"
                        onClick={() => {
                          VideoJobManager.getInstance().cancelActiveJob();
                          setProcessing(false);
                          toast(en ? "Video processing cancelled" : "تم إلغاء معالجة الفيديو");
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[11px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{en ? "Cancel" : "إلغاء"}</span>
                      </button>
                    )}
                  </div>
                </div>
                {activeVideoJob && activeVideoJob.totalFrames > 0 && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2">
                    <span>
                      {en ? "Frame:" : "الإطار:"} {activeVideoJob.currentFrame} / {activeVideoJob.totalFrames} ({activeVideoJob.fps} fps)
                    </span>
                    <span>
                      {en ? "ETA:" : "المتبقي:"} ~{activeVideoJob.etaSeconds}s
                    </span>
                  </div>
                )}
                <div className="w-full h-2 rounded-full bg-background overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all duration-300"
                    style={{ width: `${currentProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Result Preview Section */}
            {resultData && (
              <div className="mb-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-xs font-bold">{en ? "Processing Completed!" : "تمت المعالجة بنجاح!"}</span>
                  </div>
                  {resultData.executionTimeMs !== undefined && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Time: {resultData.executionTimeMs}ms
                    </span>
                  )}
                </div>

                {/* Preview Outputs */}
                {resultData.outputImageBase64OrUrl && (
                  <div className="space-y-3">
                    {inputMedia?.url ? (
                      <div className="h-72 rounded-2xl overflow-hidden border border-border">
                        <ImagePreviewEngine
                          originalUrl={inputMedia.url}
                          processedUrl={resultData.outputImageBase64OrUrl}
                          isTransparent={selectedTool.actionName === "remove-background"}
                          className="h-full w-full"
                        />
                      </div>
                    ) : (
                      <div className="relative rounded-xl overflow-hidden border border-border max-h-60 flex items-center justify-center bg-black/40">
                        <img
                          src={resultData.outputImageBase64OrUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="max-h-60 object-contain"
                        />
                      </div>
                    )}
                    {selectedTool.actionName === "remove-background" && (
                      <button
                        type="button"
                        onClick={() => setShowMaskEditorModal(true)}
                        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                      >
                        <Brush className="w-4 h-4" />
                        <span>{en ? "Open Smart Mask Editor & Backgrounds" : "فتح محرر القناع وتخصيص الخلفيات"}</span>
                      </button>
                    )}
                    <a
                      href={resultData.outputImageBase64OrUrl}
                      download={`Vireon_AI_${selectedTool.actionName}.png`}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                    >
                      <Download className="w-4 h-4" />
                      {en ? "Download Processed Image" : "تنزيل الصورة المعالجة"}
                    </a>
                  </div>
                )}

                {resultData.outputVideoBase64OrUrl && (
                  <div className="space-y-3">
                    {/* Background selector for video cutout */}
                    {selectedTool.actionName === "video-bg-removal" && (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-secondary/50 border border-border">
                        <span className="text-[11px] font-bold text-foreground">
                          {en ? "Preview Background:" : "خلفية المعاينة:"}
                        </span>
                        <div className="flex gap-1.5">
                          {[
                            { id: "checkerboard", label: en ? "Grid" : "شبكة", icon: "🏁" },
                            { id: "black", label: en ? "Black" : "أسود", color: "#000" },
                            { id: "green", label: en ? "Green" : "كروما", color: "#00ff00" },
                            { id: "white", label: en ? "White" : "أبيض", color: "#fff" },
                          ].map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setVideoBgMode(b.id as any)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                videoBgMode === b.id
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Real Video Player Container */}
                    <div
                      className={`relative rounded-2xl overflow-hidden border border-border flex items-center justify-center min-h-[200px] ${
                        videoBgMode === "checkerboard"
                          ? "bg-[linear-gradient(45deg,#202020_25%,transparent_25%),linear-gradient(-45deg,#202020_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#202020_75%),linear-gradient(-45deg,transparent_75%,#202020_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-slate-900"
                          : videoBgMode === "green"
                          ? "bg-[#00ff00]"
                          : videoBgMode === "white"
                          ? "bg-white"
                          : "bg-black"
                      }`}
                    >
                      <video
                        src={resultData.outputVideoBase64OrUrl}
                        controls
                        playsInline
                        className="w-full max-h-72 object-contain"
                      />
                    </div>

                    {/* Stats pills */}
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground">
                      {resultData.width && resultData.height && (
                        <span className="px-2 py-0.5 rounded-md bg-secondary border border-border">
                          📐 {resultData.width}x{resultData.height}
                        </span>
                      )}
                      {resultData.fps && (
                        <span className="px-2 py-0.5 rounded-md bg-secondary border border-border">
                          ⚡ {resultData.fps} FPS
                        </span>
                      )}
                      {resultData.durationSeconds && (
                        <span className="px-2 py-0.5 rounded-md bg-secondary border border-border">
                          ⏱️ {resultData.durationSeconds.toFixed(1)}s
                        </span>
                      )}
                      {resultData.appliedEngine && (
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                          ⚙️ {resultData.appliedEngine}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <a
                        href={resultData.outputVideoBase64OrUrl}
                        download={`Vireon_AI_${selectedTool.actionName}.${
                          resultData.mimeType?.includes("webm") ? "webm" : "mp4"
                        }`}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                      >
                        <Download className="w-4 h-4" />
                        {en ? "Download Processed Video" : "تنزيل الفيديو المعالج"}
                      </a>

                      {onOpenVideoEditor && (
                        <button
                          type="button"
                          onClick={() => onOpenVideoEditor(resultData.outputVideoBase64OrUrl)}
                          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                        >
                          <Video className="w-4 h-4" />
                          <span>{en ? "Open in Editor" : "فتح في المحرر"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {resultData.enhancedAudioUrlOrBase64 && (
                  <div className="space-y-2">
                    <audio src={resultData.enhancedAudioUrlOrBase64} controls className="w-full" />
                    <a
                      href={resultData.enhancedAudioUrlOrBase64}
                      download={`Vireon_AI_${selectedTool.actionName}.wav`}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                    >
                      <Download className="w-4 h-4" />
                      {en ? "Download Enhanced Audio" : "تنزيل الصوت المنقى"}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleRunTool}
                disabled={processing || !inputMedia}
                className="flex-1 py-3 rounded-2xl gradient-primary text-primary-foreground font-bold text-xs shadow-lg glow-primary-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{en ? "Processing..." : "جاري المعالجة بالذكاء الاصطناعي..."}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>{en ? "Run AI Tool" : "بدء المعالجة بالذكاء الاصطناعي"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Removal Full Mask Editor Modal */}
      {showMaskEditorModal && resultData?.outputImageBase64OrUrl && inputMedia?.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-5xl h-[94vh] sm:h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden">
            <BackgroundRemovalResult
              originalImageUrl={inputMedia.url}
              resultDataUrl={resultData.outputImageBase64OrUrl}
              originalWidth={resultData.width || 1080}
              originalHeight={resultData.height || 1080}
              executionTimeMs={resultData.executionTimeMs}
              onApply={(finalDataUrl) => {
                setResultData((prev: any) => ({
                  ...prev,
                  outputImageBase64OrUrl: finalDataUrl,
                }));
                setShowMaskEditorModal(false);
                toast.success(en ? "Mask changes applied!" : "تم اعتماد تعديلات القناع بنجاح!");
              }}
              onClose={() => setShowMaskEditorModal(false)}
            />
          </div>
        </div>
      )}
      {/* Background Active Video Job Floating Banner */}
      {activeVideoJob && !selectedTool && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-lg p-3.5 rounded-2xl bg-card/95 border border-primary/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate">
                {activeVideoJob.stageMessage || (en ? "Processing Video AI in Background..." : "جاري معالجة الفيديو بالخلفية...")}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {activeVideoJob.progress}% ({activeVideoJob.currentFrame}/{activeVideoJob.totalFrames} frames) ~{activeVideoJob.etaSeconds}s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const tool = AI_STUDIO_TOOLS.find(
                  (t) => t.id === activeVideoJob.toolId || t.actionName === activeVideoJob.actionName || (t.category === "video" && activeVideoJob.taskType.includes("video"))
                );
                if (tool) {
                  setSelectedTool(tool);
                  if (activeVideoJob.inputMediaUrl) {
                    setInputMedia({ url: activeVideoJob.inputMediaUrl, name: activeVideoJob.inputMediaName || "video_input.mp4" });
                  }
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              {en ? "View" : "عرض"}
            </button>
            <button
              onClick={() => {
                VideoJobManager.getInstance().cancelActiveJob();
                toast(en ? "Video job cancelled" : "تم إلغاء مهمة الفيديو");
              }}
              className="p-1.5 rounded-xl bg-muted hover:bg-rose-500/20 text-muted-foreground hover:text-rose-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIStudioScreen;
