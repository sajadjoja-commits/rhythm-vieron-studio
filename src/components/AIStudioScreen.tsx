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
} from "lucide-react";
import { toast } from "sonner";
import { aiRuntime } from "@/ai/runtime/AIRuntime";
import { aiPlugins } from "@/ai/plugins";
import { AIJobProgress, DeviceResourceProfile } from "@/ai/runtime/types";
import { getLang, isRTL } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

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
    nameAr: "إزالة خلفية الصور (RMBG-2.0)",
    nameEn: "AI Background Removal (RMBG-2.0)",
    descAr: "عزل دقيق للعناصر وتفريغ الخلفيات بدقة عالية باستخدام نموذج RMBG-2.0",
    descEn: "High-accuracy foreground extraction & background removal with RMBG-2.0",
    icon: Scissors,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "image",
  },
  {
    id: "img-upscale",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "upscale",
    taskType: "enhance-media",
    nameAr: "تكبير وتحسين الصور (Real-ESRGAN)",
    nameEn: "Super Resolution Upscaling (Real-ESRGAN)",
    descAr: "مضاعفة دقة وتفاصيل الصور x2 / x4 مع تحسين الحواف وإزالة الضبابية",
    descEn: "Enhance image resolution x2/x4 & clarify fine textures with Real-ESRGAN",
    icon: Maximize2,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    executionModeLabel: "Local",
    accept: "image",
  },
  {
    id: "img-face-restore",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "face-enhance",
    taskType: "enhance-media",
    nameAr: "ترميم وتوضيح الوجوه (GFPGAN v1.4)",
    nameEn: "Face Restoration & Polish (GFPGAN)",
    descAr: "إعادة بناء ملامح الوجوه المشوشة أو القديمة وتوضيح تفاصيل العينين والبشرة",
    descEn: "Restore blurry facial details & restore eyes/skin texture with GFPGAN v1.4",
    icon: Sparkles,
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "image",
  },
  {
    id: "img-object-remove",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "object-remove",
    taskType: "background-removal",
    nameAr: "إزالة العناصر والنصوص (LaMa Inpainting)",
    nameEn: "Object & Text Removal (LaMa)",
    descAr: "إزالة الأشخاص أو الكتابات غير المرغوب بها من الصور مع ملء ذكي للخلفية",
    descEn: "Seamlessly remove unwanted objects or text from photos using LaMa",
    icon: Wand2,
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    executionModeLabel: "Local",
    accept: "image",
  },
  {
    id: "img-denoise",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "denoise",
    taskType: "noise-reduction",
    nameAr: "إزالة التحبيب والتشويش (SCUNet)",
    nameEn: "Image Denoising & Clarity (SCUNet)",
    descAr: "تنظيف النويز والحبيبات الرقمية من الصور الليلية والمنخفضة الإضاءة",
    descEn: "Clean noise & digital artifacts from low-light photos with SCUNet",
    icon: Sliders,
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.12)",
    executionModeLabel: "Local",
    accept: "image",
  },
  {
    id: "img-composite",
    category: "image",
    pluginId: "plugin-image-enhancement",
    actionName: "composite-enhance",
    taskType: "enhance-media",
    nameAr: "معالجة شاملة فائقة للصورة (Pipeline)",
    nameEn: "Ultra Composite Image Pipeline",
    descAr: "سلسلة معالجة متكاملة تجمع بين التنظيف والترميم والتكبير لنتيجة سينمائية",
    descEn: "Full pipeline sequence: Denoise -> Face Restore -> Real-ESRGAN Upscale",
    icon: Flame,
    color: "#06b6d4",
    bg: "rgba(6, 182, 212, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "image",
  },

  // --- AI VIDEO TOOLS ---
  {
    id: "vid-upscale",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "video-upscale",
    taskType: "enhance-media",
    nameAr: "ترقية دقة الفيديو 4K (Real-ESRGAN Video)",
    nameEn: "AI Video Upscaling (Real-ESRGAN)",
    descAr: "تحسين جودة مقاطع الفيديو وتكبير الإطارات حتى دقة 4K فائقة الوضوح",
    descEn: "Enhance video frame details & upscale resolution up to 4K",
    icon: Video,
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "video",
  },
  {
    id: "vid-interpolation",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "frame-interpolation",
    taskType: "enhance-media",
    nameAr: "مضاعفة سلاسة الحركة (RIFE 60fps/120fps)",
    nameEn: "Motion Smooth Interpolation (RIFE)",
    descAr: "توليد إطارات بينية ذكية لتحويل الفيديوهات العادية إلى حركة فائقة السلاسة",
    descEn: "Generate intermediate motion frames for ultra-fluid 60fps/120fps playback",
    icon: Activity,
    color: "#14b8a6",
    bg: "rgba(20, 184, 166, 0.12)",
    executionModeLabel: "Local",
    accept: "video",
  },
  {
    id: "vid-bg-removal",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "video-bg-removal",
    taskType: "background-removal",
    nameAr: "إزالة خلفية الفيديو (Robust Video Matting)",
    nameEn: "Video Background Matting (RVM)",
    descAr: "عزل الأشخاص من الفيديو وحذف الخلفية بدون شاشة خضراء (Green Screen)",
    descEn: "Real-time background removal for video clips without a green screen",
    icon: Layers,
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "video",
  },
  {
    id: "vid-denoise",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "video-denoise",
    taskType: "noise-reduction",
    nameAr: "تنقية نويز الفيديو (FastDVDnet)",
    nameEn: "Video Denoising (FastDVDnet)",
    descAr: "إزالة التشويش الحركي ونويز الكاميرا في الإضاءة المنخفضة عبر الإطارات",
    descEn: "Spatial-temporal video noise filter for crisp low-light footage",
    icon: ShieldCheck,
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    executionModeLabel: "Local",
    accept: "video",
  },
  {
    id: "vid-stabilize",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "video-stabilize",
    taskType: "enhance-media",
    nameAr: "تثبيت الاهتزاز والحركة (Optical Flow)",
    nameEn: "Optical Flow Video Stabilization",
    descAr: "معالجة اهتزاز الكاميرا اليدوية وجعل التصوير ثابتاً ومستقراً",
    descEn: "Smooth shaky handheld footage using AI optical flow motion tracking",
    icon: Zap,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    executionModeLabel: "Local",
    accept: "video",
  },
  {
    id: "vid-auto-color",
    category: "video",
    pluginId: "plugin-video-enhancement",
    actionName: "auto-color-enhance",
    taskType: "enhance-media",
    nameAr: "توازن الألوان الديناميكي (AI Auto Color HDR)",
    nameEn: "AI Dynamic Color & HDR Enhancer",
    descAr: "تعديل السطوع، التباين والألوان تلقائياً لمنح الفيديو طابعاً سينمائياً",
    descEn: "Auto balance exposure, saturation, and contrast for HDR dynamic range",
    icon: Sparkles,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    executionModeLabel: "Local",
    accept: "video",
  },

  // --- AI AUDIO TOOLS ---
  {
    id: "aud-denoise",
    category: "audio",
    pluginId: "plugin-audio-enhancement",
    actionName: "denoise",
    taskType: "noise-reduction",
    nameAr: "تنقية وزيادة وضوح الصوت (DeepFilterNet)",
    nameEn: "AI Audio Denoise (DeepFilterNet)",
    descAr: "إزالة الضوضاء المحيطة، الصدى، وضجيج الرياح من التسجيلات الصوتية",
    descEn: "Remove background noise, hum & room echo with DeepFilterNet AI",
    icon: Volume2,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "audio",
  },
  {
    id: "aud-separate",
    category: "audio",
    pluginId: "plugin-audio-enhancement",
    actionName: "separate",
    taskType: "vocal-isolation",
    nameAr: "فصل الصوت عن الموسيقى (Demucs v4)",
    nameEn: "AI Stem Separation (Demucs v4)",
    descAr: "عزل صوت الغناء/الكلام عن الموسيقى والمؤثرات واستخراج كل مسار مستقل",
    descEn: "Isolate vocals from music instrumentals into clean individual stems",
    icon: Music,
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "audio",
  },
  {
    id: "aud-composite",
    category: "audio",
    pluginId: "plugin-audio-enhancement",
    actionName: "audio-enhance-composite",
    taskType: "enhance-media",
    nameAr: "معالجة صوتية احترافية شاملة (Composite Audio)",
    nameEn: "Full AI Audio Master Pipeline",
    descAr: "دمج بين تنظيف النويز وعزل الكلام وموزنة الترددات لنقاء صوت استوديو",
    descEn: "Unified pipeline: DeepFilterNet noise gate -> Demucs vocal isolation",
    icon: VolumeX,
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.12)",
    executionModeLabel: "Hybrid",
    accept: "audio",
  },
];

interface AIStudioScreenProps {
  onBack?: () => void;
}

const AIStudioScreen: React.FC<AIStudioScreenProps> = ({ onBack }) => {
  const en = getLang() === "en";
  const rtl = isRTL();

  const [activeTab, setActiveTab] = useState<"all" | "image" | "video" | "audio">("all");
  const [deviceProfile, setDeviceProfile] = useState<DeviceResourceProfile | null>(null);

  // Tool modal state
  const [selectedTool, setSelectedTool] = useState<AIToolConfig | null>(null);
  const [inputMedia, setInputMedia] = useState<{ url: string; file?: File; name: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<AIJobProgress | null>(null);
  const [resultData, setResultData] = useState<any | null>(null);
  const [upscaleFactor, setUpscaleFactor] = useState<number>(2);
  const [denoiseIntensity, setDenoiseIntensity] = useState<number>(0.8);

  useEffect(() => {
    try {
      const profile = aiRuntime.getDeviceProfile();
      setDeviceProfile(profile);
    } catch {
      // Fallback
    }
  }, []);

  const filteredTools = AI_STUDIO_TOOLS.filter((t) => activeTab === "all" || t.category === activeTab);

  // Helper to trigger tool execution via AI Runtime & Plugin System
  const handleRunTool = async () => {
    if (!selectedTool) return;
    if (!inputMedia) {
      toast.error(en ? "Please upload or select an input media file first" : "يرجى اختيار أو رفع ملف وسائط أولاً");
      return;
    }

    playSfx("pop");
    setProcessing(true);
    setResultData(null);
    setCurrentProgress({
      jobId: "pending",
      percentage: 10,
      currentStage: en ? "Preparing AI Plugin..." : "جاري تحضير ملحق الذكاء الاصطناعي...",
      status: "queued",
    });

    try {
      const plugin = aiPlugins.getPlugin(selectedTool.pluginId);
      if (!plugin) {
        throw new Error(`Plugin ${selectedTool.pluginId} not registered in AI Runtime`);
      }

      // Build payload based on tool category
      let payload: any = {};
      if (selectedTool.category === "image") {
        payload = {
          imageBase64OrUrl: inputMedia.url,
          action: selectedTool.actionName,
          upscaleFactor,
          denoiseIntensity,
        };
      } else if (selectedTool.category === "video") {
        payload = {
          videoBase64OrUrl: inputMedia.url,
          action: selectedTool.actionName,
          upscaleFactor,
          targetFps: 60,
          denoiseIntensity,
        };
      } else if (selectedTool.category === "audio") {
        payload = {
          audioBase64OrUrl: inputMedia.url,
          action: selectedTool.actionName,
          denoiseIntensity,
          separationMode: "extract-vocals",
        };
      }

      // Execute via AIRuntime unified task endpoint
      const response = await aiRuntime.runTask(
        selectedTool.taskType,
        payload,
        {
          executionMode: selectedTool.executionModeLabel === "Local" ? "local" : "auto",
        }
      );

      // Subscribe to live progress manager
      const simulatedJobId = `job_${Date.now()}`;
      const unsubscribe = aiRuntime.subscribeProgress(simulatedJobId, (p) => {
        setCurrentProgress(p);
      });

      // Update progress state
      aiRuntime.progressManager.createProgress(simulatedJobId, en ? "Processing AI model..." : "جاري المعالجة...");
      aiRuntime.progressManager.updateProgress(simulatedJobId, 60, en ? "Applying Neural Model..." : "تطبيق النموذج العصبوني...", "processing");

      setTimeout(() => {
        aiRuntime.progressManager.updateProgress(simulatedJobId, 100, en ? "Completed" : "مكتمل", "completed");
        unsubscribe();
      }, 400);

      if (response.success && response.data) {
        setResultData(response.data);
        playSfx("success");
        toast.success(en ? "AI task completed successfully!" : "تمت معالجة المهمة بنجاح!");
      } else {
        const errorMsg = response.error?.message || (en ? "Execution failed" : "فشلت عملية المعالجة");
        toast.error(errorMsg);
      }
    } catch (err: any) {
      console.error("AI Studio execution error:", err);
      toast.error(err.message || (en ? "An error occurred during AI processing" : "حدث خطأ أثناء معالجة الذكاء الاصطناعي"));
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
    } else if (type === "video") {
      // Sample video placeholder
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Vireon AI Sample Video", 320, 180);
      }
      const dataUrl = canvas.toDataURL("image/png");
      setInputMedia({ url: dataUrl, name: "Sample_Video_Clip.mp4" });
    } else {
      // Sample audio placeholder
      setInputMedia({
        url: "https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg",
        name: "Sample_Audio_Recording.wav",
      });
    }
    toast.info(en ? "Sample media loaded for testing" : "تم تحميل ملف وسائط تجريبي للاختبار");
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

      {/* Device Runtime Profile Status Card */}
      {deviceProfile && (
        <div className="mb-6 rounded-2xl bg-card border border-border p-3.5 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              {deviceProfile.isAndroid ? (
                <Smartphone className="w-4 h-4 text-primary" />
              ) : (
                <Globe className="w-4 h-4 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  {deviceProfile.isAndroid ? "Android App Environment" : "Web Engine Environment"}
                </span>
                <span className="px-1.5 py-0.2 text-[9px] rounded bg-emerald-500/15 text-emerald-500 font-bold border border-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                RAM: ~{deviceProfile.availableRAMMB}MB | WASM: {deviceProfile.hasWASM ? "Ready" : "Disabled"} | WebGL:{" "}
                {deviceProfile.hasWebGL ? "Enabled" : "Off"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-secondary text-[10px] font-semibold text-muted-foreground">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            <span>AI Runtime</span>
          </div>
        </div>
      )}

      {/* Category Tabs Filter */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: "all", labelAr: "الكل", labelEn: "All Tools", count: AI_STUDIO_TOOLS.length },
          {
            id: "image",
            labelAr: "صور AI",
            labelEn: "AI Image",
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

      {/* Tools Cards Grid */}
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
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                  {en ? tool.descEn : tool.descAr}
                </p>
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
                      <img src={inputMedia.url} alt="" className="w-12 h-12 rounded-xl object-cover border" />
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
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 cursor-pointer transition-colors text-center">
                    <Upload className="w-6 h-6 text-primary mb-1.5" />
                    <span className="text-xs font-bold text-foreground">{en ? "Upload File" : "رفع ملف"}</span>
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
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${
                        upscaleFactor === factor
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground"
                      }`}
                    >
                      {factor}x Resolution
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTool.actionName === "denoise" && (
              <div className="mb-5 p-3 rounded-2xl bg-secondary/30 border border-border">
                <div className="flex justify-between text-xs font-bold text-foreground mb-1.5">
                  <span>{en ? "Noise Reduction Intensity:" : "قوة تنقية النويز:"}</span>
                  <span>{Math.round(denoiseIntensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.1"
                  value={denoiseIntensity}
                  onChange={(e) => setDenoiseIntensity(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            )}

            {/* Progress Container powered by AIProgressManager */}
            {processing && currentProgress && (
              <div className="mb-5 p-4 rounded-2xl bg-secondary border border-border animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs font-bold text-foreground">
                      {currentProgress.currentStage || (en ? "Processing..." : "جاري المعالجة...")}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-extrabold text-primary">
                    {currentProgress.percentage}%
                  </span>
                </div>
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
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-border max-h-60 flex items-center justify-center bg-black/40">
                      <img src={resultData.outputImageBase64OrUrl} alt="" className="max-h-60 object-contain" />
                    </div>
                    <a
                      href={resultData.outputImageBase64OrUrl}
                      download={`Vireon_AI_${selectedTool.actionName}.png`}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                    >
                      <Download className="w-4 h-4" />
                      {en ? "Download Processed Image" : "تنزيل الصورة المعالجة"}
                    </a>
                  </div>
                )}

                {resultData.outputVideoBase64OrUrl && (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-border bg-black">
                      <video src={resultData.outputVideoBase64OrUrl} controls className="w-full max-h-60" />
                    </div>
                    <a
                      href={resultData.outputVideoBase64OrUrl}
                      download={`Vireon_AI_${selectedTool.actionName}.mp4`}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                    >
                      <Download className="w-4 h-4" />
                      {en ? "Download Processed Video" : "تنزيل الفيديو المعالج"}
                    </a>
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
    </div>
  );
};

export default AIStudioScreen;
