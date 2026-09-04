import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Scissors,
  Sparkles,
  Maximize2,
  Smile,
  Trash2,
  X,
  Play,
  RotateCcw,
  Download,
  Check,
  Cpu,
  Layers,
  Zap,
  Sliders,
  AlertCircle,
  Eye,
  ShieldCheck,
  Undo2,
  Brush,
  Eraser,
  RefreshCw,
  Share2,
  Copy,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  Maximize,
  AlertTriangle,
  StopCircle,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import {
  ImageAITaskType,
  ImageAIOptions,
  ImageAIResult,
  ImageCapabilityProfile,
  FaceDetectionResult,
} from "@/ai/image/types";
import { imageAIEngine } from "@/ai/image/ImageAIEngine";
import {
  ImageProcessingResourceManager,
  MemoryAssessment,
} from "@/ai/image/ImageProcessingResourceManager";
import { BeforeAfterSlider } from "@/components/ui/BeforeAfterSlider";
import { MaskEditorCanvas } from "./MaskEditorCanvas";
import { BackgroundRemovalResult } from "./BackgroundRemovalResult";
import { isRTL, getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface ImageAIToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onApplyResult: (resultDataUrl: string) => void;
  initialTask?: ImageAITaskType;
}

interface ToolTab {
  id: ImageAITaskType;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: React.ElementType;
  badge: string;
  accentColor: string;
}

const TOOLS_CONFIG: ToolTab[] = [
  {
    id: "remove-background",
    titleAr: "إزالة الخلفية",
    titleEn: "Remove BG",
    descAr: "عزل وتفريغ الخلفيات بنقاء عالي مع معالجة حواف الشعر والملابس",
    descEn: "Neural foreground cutout & edge-refined transparent alpha",
    icon: Scissors,
    badge: "MediaPipe Neural",
    accentColor: "#3b82f6",
  },
  {
    id: "enhance",
    titleAr: "تحسين وتوضيح",
    titleEn: "AI Enhance",
    descAr: "إزالة التشويش والتحبيب مع تحسين التباين وترميم تفاصيل الوجوه",
    descEn: "Bilateral denoise, dynamic HDR contrast & BlazeFace feature restoration",
    icon: Sparkles,
    badge: "Neural Enhance",
    accentColor: "#8b5cf6",
  },
];

export const ImageAIToolsModal: React.FC<ImageAIToolsModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onApplyResult,
  initialTask = "remove-background",
}) => {
  const isArabic = getLang() === "ar";
  const [activeTask, setActiveTask] = useState<ImageAITaskType>(initialTask);
  const [capability, setCapability] = useState<ImageCapabilityProfile | null>(null);

  // Execution & Progress State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [tileProgress, setTileProgress] = useState<{ current: number; total: number; eta?: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Result & View States
  const [result, setResult] = useState<ImageAIResult | null>(null);
  const [activeView, setActiveView] = useState<"slider" | "result" | "original" | "mask-editor">("slider");
  const [activeResultUrl, setActiveResultUrl] = useState<string>("");

  // Input Image Dimensions & Memory Assessment
  const [origDimensions, setOrigDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [memoryAssessment, setMemoryAssessment] = useState<MemoryAssessment | null>(null);

  // Zoom & Pan Preview Controls
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = 100%, 2 = 200%, 4 = 400%
  const [fitToScreen, setFitToScreen] = useState<boolean>(true);

  // Tool Specific Options
  const [scaleFactor, setScaleFactor] = useState<2 | 4>(2);
  const [outputFormat, setOutputFormat] = useState<"image/png" | "image/jpeg" | "image/webp">("image/png");
  const [outputQuality, setOutputQuality] = useState<number>(0.95);
  const [edgeRefinement, setEdgeRefinement] = useState<boolean>(true);
  const [featherRadius, setFeatherRadius] = useState<number>(1);
  const [denoiseLevel, setDenoiseLevel] = useState<number>(0.75);
  const [contrastBoost, setContrastBoost] = useState<number>(0.6);
  const [faceRestoreLevel, setFaceRestoreLevel] = useState<number>(0.85);

  // Inpaint Brush State
  const inpaintCanvasRef = useRef<HTMLCanvasElement>(null);
  const [inpaintBrushSize, setInpaintBrushSize] = useState<number>(25);
  const [isPaintingInpaint, setIsPaintingInpaint] = useState(false);
  const [hasInpaintMask, setHasInpaintMask] = useState(false);

  // Load Device Profile & Image Info
  useEffect(() => {
    if (!isOpen) return;

    imageAIEngine.getCapabilities().then(setCapability);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setOrigDimensions({ width: img.width, height: img.height });
      initInpaintCanvas(img.width, img.height);
      evaluateMemory(img.width, img.height, scaleFactor);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl, scaleFactor]);

  // Re-evaluate memory whenever scaleFactor or task changes
  useEffect(() => {
    if (origDimensions.width > 0 && origDimensions.height > 0) {
      evaluateMemory(origDimensions.width, origDimensions.height, scaleFactor);
    }
  }, [scaleFactor, activeTask, origDimensions]);

  const evaluateMemory = async (w: number, h: number, scale: 2 | 4) => {
    try {
      const assessment = await ImageProcessingResourceManager.getInstance().assessImageSafety(
        w,
        h,
        scale
      );
      setMemoryAssessment(assessment);
    } catch (e) {
      console.warn("Memory assessment error:", e);
    }
  };

  // Reset Task when switching
  useEffect(() => {
    setActiveTask(initialTask);
    setResult(null);
    setActiveResultUrl("");
    setActiveView("slider");
  }, [initialTask, isOpen]);

  const initInpaintCanvas = (w: number, h: number) => {
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, w, h);
    }
    setHasInpaintMask(false);
  };

  const handleTaskSwitch = (taskId: ImageAITaskType) => {
    playSfx("click");
    setActiveTask(taskId);
    setResult(null);
    setActiveResultUrl("");
    setActiveView("slider");
  };

  // --------------------------------------------------------------------------
  // Cancel Processing
  // --------------------------------------------------------------------------
  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgressPct(0);
    setTileProgress(null);
    playSfx("click");
    toast.info(isArabic ? "تم إلغاء المعالجة" : "Processing cancelled");
  };

  // --------------------------------------------------------------------------
  // Execute AI Pipeline
  // --------------------------------------------------------------------------
  const handleRunProcessing = async () => {
    if (isProcessing) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsProcessing(true);
    setProgressPct(0.05);
    setProgressStage("preparing");
    setProgressMessage(isArabic ? "جاري تهيئة المعالجة العصبية..." : "Initializing neural inference...");
    setTileProgress(null);
    playSfx("click");

    const options: ImageAIOptions = {
      scaleFactor,
      format: outputFormat,
      quality: outputQuality,
      edgeRefinement,
      featherRadius,
      denoiseIntensity: denoiseLevel,
      contrastBoost,
      enhanceFaceLevel: faceRestoreLevel,
      signal: controller.signal,
      onProgress: (p) => {
        setProgressStage(p.stage);
        setProgressPct(p.progress);
        setProgressMessage(p.message);
        if (p.etaSeconds !== undefined) {
          // Track tile progress
          const match = p.message.match(/tile\s+(\d+)\/(\d+)/i) || p.message.match(/(\d+)\/(\d+)/);
          if (match) {
            setTileProgress({
              current: parseInt(match[1], 10),
              total: parseInt(match[2], 10),
              eta: p.etaSeconds,
            });
          }
        }
      },
    };

    try {
      let aiResult: ImageAIResult;

      switch (activeTask) {
        case "remove-background":
          aiResult = await imageAIEngine.removeBackground(imageUrl, options);
          break;
        case "enhance":
          aiResult = await imageAIEngine.enhanceImage(imageUrl, options);
          break;
        case "face-enhance":
          aiResult = await imageAIEngine.enhanceFace(imageUrl, options);
          break;
        case "object-remove":
          if (!hasInpaintMask || !inpaintCanvasRef.current) {
            throw new Error(isArabic ? "يرجى التحديد بالفرشاة على الجزء المطلوب إزالته أولاً" : "Please paint over the object to remove first");
          }
          const maskDataUrl = inpaintCanvasRef.current.toDataURL("image/png");
          aiResult = await imageAIEngine.removeObject(imageUrl, maskDataUrl, options);
          break;
        default:
          throw new Error("نوع المهمة غير مدعوم");
      }

      setResult(aiResult);
      setActiveResultUrl(aiResult.outputDataUrl);
      setActiveView("slider");
      playSfx("success");
      toast.success(isArabic ? "اكتملت المعالجة بنجاح!" : "AI Processing completed successfully!");
    } catch (err: any) {
      if (controller.signal.aborted) {
        console.log("[ImageAIToolsModal] Processing cancelled by user");
      } else {
        console.error("[ImageAIToolsModal] Processing failed:", err);
        playSfx("error");
        toast.error(err?.message || (isArabic ? "فشلت المعالجة العصبية" : "Neural processing failed"));
      }
    } finally {
      setIsProcessing(false);
      setProgressPct(0);
      setTileProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Inpaint Canvas Stroke Handlers
  const handleInpaintPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsPaintingInpaint(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    paintInpaintStroke(e.clientX, e.clientY);
  };

  const handleInpaintPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingInpaint) return;
    paintInpaintStroke(e.clientX, e.clientY);
  };

  const handleInpaintPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsPaintingInpaint(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const paintInpaintStroke = (clientX: number, clientY: number) => {
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "rgba(236, 72, 153, 0.75)";
    ctx.beginPath();
    ctx.arc(x, y, (inpaintBrushSize * scaleX) / 2, 0, Math.PI * 2);
    ctx.fill();
    setHasInpaintMask(true);
  };

  const handleClearInpaintMask = () => {
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInpaintMask(false);
  };

  // Export / Apply
  const handleApply = () => {
    if (!activeResultUrl) return;
    playSfx("pop");
    onApplyResult(activeResultUrl);
    onClose();
  };

  const handleDownload = () => {
    if (!activeResultUrl) return;
    const link = document.createElement("a");
    link.href = activeResultUrl;
    link.download = `ai_${activeTask}_${Date.now()}.${outputFormat === "image/jpeg" ? "jpg" : outputFormat === "image/webp" ? "webp" : "png"}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(isArabic ? "تم تنزيل الصورة المعالجة" : "Image downloaded successfully");
  };

  const handleCopy = async () => {
    if (!activeResultUrl) return;
    try {
      const blob = await (await fetch(activeResultUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast.success(isArabic ? "تم نسخ الصورة إلى الحافظة" : "Copied to clipboard");
    } catch {
      toast.error(isArabic ? "تعذر نسخ الصورة مباشرة" : "Could not copy image directly");
    }
  };

  if (!isOpen) return null;

  const currentTool = TOOLS_CONFIG.find((t) => t.id === activeTask) || TOOLS_CONFIG[0];
  const targetW = origDimensions.width * (activeTask === "upscale" ? scaleFactor : 1);
  const targetH = origDimensions.height * (activeTask === "upscale" ? scaleFactor : 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="relative flex flex-col w-full max-w-5xl h-[95vh] sm:h-[90vh] max-h-[920px] bg-slate-950 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl text-white shadow-lg"
              style={{ backgroundColor: currentTool.accentColor }}
            >
              <currentTool.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">
                  {isArabic ? currentTool.titleAr : currentTool.titleEn}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {currentTool.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                {isArabic ? currentTool.descAr : currentTool.descEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {capability && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-850 border border-slate-800 text-[11px] text-slate-400">
                <Cpu className="w-3.5 h-3.5 text-primary" />
                <span>{capability.preferredProvider.toUpperCase()}</span>
                <span className="text-slate-600">|</span>
                <span>{capability.deviceTier}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Task Tabs Bar (Mobile Scrollable) */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/80 bg-slate-900/30 overflow-x-auto no-scrollbar">
          {TOOLS_CONFIG.map((tool) => {
            const isActive = activeTask === tool.id;
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => handleTaskSwitch(tool.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 min-h-[40px] ${
                  isActive
                    ? "bg-slate-800 text-white shadow-md border border-slate-700"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-850"
                }`}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: isActive ? tool.accentColor : "inherit" }}
                />
                <span>{isArabic ? tool.titleAr : tool.titleEn}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        {activeTask === "remove-background" && activeResultUrl && result && !isProcessing ? (
          <div className="flex-1 w-full h-full overflow-hidden">
            <BackgroundRemovalResult
              originalImageUrl={imageUrl}
              resultDataUrl={activeResultUrl}
              originalWidth={origDimensions.width}
              originalHeight={origDimensions.height}
              executionTimeMs={result.executionTimeMs}
              onApply={(finalDataUrl) => {
                onApplyResult(finalDataUrl);
                onClose();
              }}
              onClose={onClose}
              onReProcess={() => {
                setResult(null);
                setActiveResultUrl("");
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Viewport Center (Image Preview & Controls) */}
            <div className="flex-1 flex flex-col p-3 sm:p-5 overflow-y-auto bg-slate-950/60">
            {/* View Mode & Zoom Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {activeResultUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveView("slider")}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                        activeView === "slider"
                          ? "bg-primary text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isArabic ? "مقارنة (قبل / بعد)" : "Before / After"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView("result")}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                        activeView === "result"
                          ? "bg-primary text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isArabic ? "النتيجة المعالجة" : "Result"}
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-bold text-slate-300 px-2">
                    {isArabic ? "معاينة الإدخال" : "Input Preview"}
                  </span>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition ${
                    zoomLevel === 1 ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"
                  }`}
                  title="100%"
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(2)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition ${
                    zoomLevel === 2 ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"
                  }`}
                  title="200%"
                >
                  2x
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(4)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition ${
                    zoomLevel === 4 ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"
                  }`}
                  title="400%"
                >
                  4x
                </button>
                <div className="text-[11px] font-bold text-slate-400 px-2 hidden sm:block border-l border-slate-700">
                  {targetW} × {targetH} px
                </div>
              </div>
            </div>

            {/* Display Stage */}
            <div className="flex-1 min-h-[260px] flex items-center justify-center relative rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-900/40">
              {activeTask === "object-remove" && !activeResultUrl ? (
                // Inpaint Brush Drawing Stage
                <div className="relative w-full h-full flex items-center justify-center select-none cursor-crosshair">
                  <img
                    src={imageUrl}
                    alt="Source"
                    className="max-w-full max-h-full object-contain pointer-events-none"
                  />
                  <canvas
                    ref={inpaintCanvasRef}
                    onPointerDown={handleInpaintPointerDown}
                    onPointerMove={handleInpaintPointerMove}
                    onPointerUp={handleInpaintPointerUp}
                    onPointerCancel={handleInpaintPointerUp}
                    className="absolute inset-0 w-full h-full object-contain touch-none"
                  />
                  {hasInpaintMask && (
                    <button
                      type="button"
                      onClick={handleClearInpaintMask}
                      className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 text-xs font-bold text-rose-300 border border-rose-500/30 hover:bg-rose-950/80 transition"
                    >
                      مسح التحديد
                    </button>
                  )}
                </div>
              ) : activeResultUrl ? (
                activeView === "slider" ? (
                  <div className="w-full h-full flex items-center justify-center overflow-auto">
                    <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center", transition: "transform 0.2s" }} className="w-full h-full flex items-center justify-center">
                      <BeforeAfterSlider
                        beforeImage={imageUrl}
                        afterImage={activeResultUrl}
                        beforeLabel={isArabic ? "الأصلية" : "Original"}
                        afterLabel={isArabic ? "المعالجة بالذكاء الاصطناعي" : "AI Result"}
                        aspectRatio="16/9"
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center p-2 overflow-auto">
                    <img
                      src={activeView === "original" ? imageUrl : activeResultUrl}
                      alt="Preview"
                      style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center", transition: "transform 0.2s" }}
                      className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                    />
                  </div>
                )
              ) : (
                // Initial Image Preview before processing
                <div className="relative w-full h-full flex items-center justify-center p-3 overflow-auto">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center", transition: "transform 0.2s" }}
                    className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-bold text-slate-300 border border-white/10">
                    {origDimensions.width} × {origDimensions.height} px
                  </div>
                </div>
              )}

              {/* Live Processing Overlay with Cancel Option */}
              {isProcessing && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 text-center animate-in fade-in">
                  <div className="relative flex items-center justify-center mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-primary animate-spin" />
                    <Sparkles className="absolute w-6 h-6 text-primary animate-pulse" />
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">
                    {isArabic ? "جاري المعالجة العصبية المباشرة..." : "Neural Processing in progress..."}
                  </h3>
                  <p className="text-xs text-slate-300 max-w-sm mb-3">
                    {progressMessage || (isArabic ? "يتم تشغيل النموذج محلياً عبر العتاد..." : "Running inference locally...")}
                  </p>

                  {tileProgress && tileProgress.total > 1 && (
                    <div className="text-[11px] font-bold text-emerald-400 mb-2">
                      {isArabic ? `الشرائح: ${tileProgress.current} من ${tileProgress.total}` : `Tile ${tileProgress.current} / ${tileProgress.total}`}
                      {tileProgress.eta ? ` • ${isArabic ? `المتبقي: ~${tileProgress.eta} ث` : `ETA: ~${tileProgress.eta}s`}` : ""}
                    </div>
                  )}

                  <div className="w-64 max-w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-2 border border-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 via-emerald-400 to-primary rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(progressPct * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary mb-4">
                    {Math.round(progressPct * 100)}%
                  </span>

                  <button
                    type="button"
                    onClick={handleCancelProcessing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>{isArabic ? "إلغاء المعالجة" : "Cancel"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Result Metadata Badge (When ready) */}
            {result && !isProcessing && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-500 block">الأبعاد:</span>
                  <span className="font-bold text-slate-200">{result.width} × {result.height} px</span>
                </div>
                <div>
                  <span className="text-slate-500 block">زمن المعالجة:</span>
                  <span className="font-bold text-emerald-400">{result.executionTimeMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-500 block">المحرك:</span>
                  <span className="font-bold text-slate-200 truncate block" title={result.engineName}>
                    {result.engineName.split("(")[0]}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">المنفذ:</span>
                  <span className="font-bold text-primary">{result.executionProvider.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Options & Settings Sidebar / Bottom Sheet */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/40 p-4 flex flex-col gap-4 overflow-y-auto max-h-72 md:max-h-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>خيارات التخصيص</span>
              </span>
            </div>

            {/* Memory & Dimension Pre-Check Card for Upscale */}
            {activeTask === "upscale" && memoryAssessment && (
              <div className={`p-3 rounded-xl border text-xs ${
                memoryAssessment.riskLevel === "critical"
                  ? "bg-rose-950/40 border-rose-700/60 text-rose-200"
                  : memoryAssessment.riskLevel === "high"
                  ? "bg-amber-950/40 border-amber-700/60 text-amber-200"
                  : "bg-slate-900/80 border-slate-800 text-slate-300"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>تقييم الذاكرة والأبعاد</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    memoryAssessment.riskLevel === "low"
                      ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                      : memoryAssessment.riskLevel === "medium"
                      ? "bg-blue-900/60 text-blue-300 border border-blue-700/50"
                      : "bg-rose-900/60 text-rose-300 border border-rose-700/50"
                  }`}>
                    {memoryAssessment.riskLevel.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] opacity-90">
                  <div className="flex justify-between">
                    <span>دقة الإخراج المتوقعة:</span>
                    <span className="font-bold">{memoryAssessment.outputWidth} × {memoryAssessment.outputHeight} px</span>
                  </div>
                  <div className="flex justify-between">
                    <span>تقدير استهلاك الذاكرة:</span>
                    <span className="font-bold">~{memoryAssessment.estimatedPeakMemoryMB} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>عدد الشرائح المعالجة:</span>
                    <span className="font-bold">{memoryAssessment.estimatedTileCount} Tile</span>
                  </div>
                </div>

                {/* Safety Warning & Suggestions */}
                {!memoryAssessment.isSafe && (
                  <div className="mt-2.5 pt-2 border-t border-current/20">
                    <div className="flex items-start gap-1.5 text-xs font-semibold text-rose-300 mb-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{isArabic ? memoryAssessment.recommendations.reasonAr : memoryAssessment.recommendations.reasonEn}</span>
                    </div>

                    {memoryAssessment.recommendations.suggest2XInsteadOf4X && (
                      <button
                        type="button"
                        onClick={() => setScaleFactor(2)}
                        className="w-full py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold transition"
                      >
                        {isArabic ? "الانتقال إلى 2x للعمل الآمن" : "Switch to 2X for safe execution"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Task Specific Controls */}
            {activeTask === "remove-background" && (
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">تحسين حواف الشعر والملابس</span>
                  <input
                    type="checkbox"
                    checked={edgeRefinement}
                    onChange={(e) => setEdgeRefinement(e.target.checked)}
                    className="w-4 h-4 rounded text-primary accent-primary"
                  />
                </label>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-300">تنعيم الحواف (Feather)</span>
                    <span className="text-xs font-bold text-primary">{featherRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={featherRadius}
                    onChange={(e) => setFeatherRadius(parseInt(e.target.value, 10))}
                    className="w-full accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeTask === "enhance" && (
              <div className="flex flex-col gap-3">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-300">إزالة التشويش (Denoise)</span>
                    <span className="text-xs font-bold text-primary">{Math.round(denoiseLevel * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={denoiseLevel}
                    onChange={(e) => setDenoiseLevel(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-300">تعزيز التباين والديناميكية</span>
                    <span className="text-xs font-bold text-primary">{Math.round(contrastBoost * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={contrastBoost}
                    onChange={(e) => setContrastBoost(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-300">ترميم ملامح الوجه (BlazeFace)</span>
                    <span className="text-xs font-bold text-primary">{Math.round(faceRestoreLevel * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={faceRestoreLevel}
                    onChange={(e) => setFaceRestoreLevel(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeTask === "face-enhance" && (
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300">قوة ترميم الملامح</span>
                  <span className="text-xs font-bold text-primary">{Math.round(faceRestoreLevel * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.0"
                  step="0.05"
                  value={faceRestoreLevel}
                  onChange={(e) => setFaceRestoreLevel(parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {activeTask === "object-remove" && (
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300">حجم فرشاة التحديد</span>
                  <span className="text-xs font-bold text-primary">{inpaintBrushSize}px</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="2"
                  value={inpaintBrushSize}
                  onChange={(e) => setInpaintBrushSize(parseInt(e.target.value, 10))}
                  className="w-full accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Output Format Picker */}
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs font-semibold text-slate-300 block mb-2">صيغة الملف الناتج</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["image/png", "image/jpeg", "image/webp"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setOutputFormat(fmt)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition ${
                      outputFormat === fmt
                        ? "bg-slate-800 text-primary border border-primary/50"
                        : "bg-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {fmt.split("/")[1].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Fixed Action Bar (Mobile-First 48px+ Targets) */}
        <div className="flex items-center justify-between gap-2 p-3 sm:px-6 sm:py-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {activeResultUrl && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold transition border border-slate-700 min-h-[44px]"
                  title="تنزيل الصورة"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">تنزيل</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 transition border border-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="نسخ الصورة"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunProcessing}
              disabled={isProcessing || (memoryAssessment ? !memoryAssessment.isSafe && memoryAssessment.riskLevel === "critical" : false)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-lg transition min-h-[48px] ${
                isProcessing || (memoryAssessment && !memoryAssessment.isSafe && memoryAssessment.riskLevel === "critical")
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 text-white shadow-primary/30"
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isArabic ? "جاري المعالجة..." : "Processing..."}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {activeResultUrl
                      ? isArabic
                        ? "إعادة المعالجة"
                        : "Re-Process"
                      : isArabic
                      ? "بدء المعالجة بالذكاء الاصطناعي"
                      : "Run AI Processing"}
                  </span>
                </>
              )}
            </button>

            {activeResultUrl && (
              <button
                type="button"
                onClick={handleApply}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-900/30 transition min-h-[48px]"
              >
                <Check className="w-4 h-4" />
                <span>{isArabic ? "اعتماد في المشروع" : "Apply to Project"}</span>
              </button>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default ImageAIToolsModal;
