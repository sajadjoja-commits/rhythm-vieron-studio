import React, { useState, useEffect, useRef } from "react";
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
import { BeforeAfterSlider } from "@/components/ui/BeforeAfterSlider";
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
    badge: "MediaPipe Vision",
    accentColor: "#3b82f6",
  },
  {
    id: "enhance",
    titleAr: "تحسين وتوضيح",
    titleEn: "AI Enhance",
    descAr: "إزالة التشويش والتحبيب الرقمي مع تحسين التباين ودقة الألوان",
    descEn: "Bilateral neural denoise, contrast boost & detail sharpening",
    icon: Sparkles,
    badge: "Neural Denoise",
    accentColor: "#8b5cf6",
  },
  {
    id: "upscale",
    titleAr: "ترقية الدقة",
    titleEn: "AI Upscale",
    descAr: "مضاعفة دقة وتفاصيل الصورة x2 / x4 مع معالجة الحواف الفائقة",
    descEn: "Super-Resolution neural tile scaling with seam correction",
    icon: Maximize2,
    badge: "Super Resolution",
    accentColor: "#10b981",
  },
  {
    id: "face-enhance",
    titleAr: "ترميم الوجوه",
    titleEn: "Face Restore",
    descAr: "كشف الوجوه تلقائياً وترميم ملامح العيون والجلد وتفاصيل البورتريه",
    descEn: "BlazeFace detection & neural facial feature detail restoration",
    icon: Smile,
    badge: "Face Detection",
    accentColor: "#f59e0b",
  },
  {
    id: "object-remove",
    titleAr: "إزالة العناصر",
    titleEn: "Object Inpaint",
    descAr: "التحديد بالفرشاة لإزالة أي عنصر أو نص غير مرغوب فيه بذكاء",
    descEn: "Harmonic diffusion inpainting on user-painted brush mask",
    icon: Trash2,
    badge: "FFC Inpaint",
    accentColor: "#ec4899",
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

  // Task Options
  const [scaleFactor, setScaleFactor] = useState<2 | 4>(2);
  const [denoiseLevel, setDenoiseLevel] = useState(0.7);
  const [faceEnhanceLevel, setFaceEnhanceLevel] = useState(0.85);
  const [brushSize, setBrushSize] = useState(30);

  // Inpainting Canvas & Mask
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [maskHistory, setMaskHistory] = useState<ImageData[]>([]);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState("");
  const [progressRatio, setProgressRatio] = useState(0);
  const [progressDetails, setProgressDetails] = useState<string>("");
  const [result, setResult] = useState<ImageAIResult | null>(null);
  const [detectedFaces, setDetectedFaces] = useState<FaceDetectionResult | null>(null);

  // Abort controller ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize capabilities
  useEffect(() => {
    if (isOpen) {
      imageAIEngine.getCapabilities().then(setCapability);
      setResult(null);
      setHasMask(false);
      setMaskHistory([]);
      setActiveTask(initialTask);

      // If Face tool, run background face detection
      if (initialTask === "face-enhance" && imageUrl) {
        checkFaces(imageUrl);
      }
    }
  }, [isOpen, imageUrl, initialTask]);

  const checkFaces = async (src: string) => {
    try {
      const faceRes = await imageAIEngine.detectFaces(src);
      setDetectedFaces(faceRes);
    } catch {
      setDetectedFaces(null);
    }
  };

  const handleTaskChange = (task: ImageAITaskType) => {
    if (isProcessing) return;
    setActiveTask(task);
    setResult(null);
    if (task === "face-enhance" && imageUrl && !detectedFaces) {
      checkFaces(imageUrl);
    }
  };

  // ---------------- Inpainting Brush Logic ----------------
  const initMaskCanvas = (imgElement: HTMLImageElement) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Save history for undo
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setMaskHistory((prev) => [...prev.slice(-10), currentData]);

    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.fillStyle = "rgba(236, 72, 153, 0.7)";
    ctx.strokeStyle = "rgba(236, 72, 153, 0.7)";
    ctx.lineWidth = brushSize * (canvas.width / 500);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.arc(x, y, (brushSize * (canvas.width / 500)) / 2, 0, Math.PI * 2);
    ctx.fill();
    setHasMask(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = maskCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.beginPath();
    }
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
    setMaskHistory([]);
  };

  const undoMask = () => {
    if (maskHistory.length === 0) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prevData = maskHistory[maskHistory.length - 1];
    ctx.putImageData(prevData, 0, 0);
    setMaskHistory((prev) => prev.slice(0, -1));
  };

  // ---------------- Run AI Inference ----------------
  const handleExecute = async () => {
    if (!imageUrl) {
      toast.error(isArabic ? "لا توجد صورة محددة" : "No image selected");
      return;
    }

    setIsProcessing(true);
    setProgressRatio(0.05);
    setProgressStage(isArabic ? "جاري التحضير..." : "Preparing...");
    setProgressDetails("");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const handleProgress = (prog: any) => {
      setProgressRatio(prog.progress || 0.1);
      setProgressStage(prog.message || "");
      if (prog.speedMBps) {
        setProgressDetails(`${prog.speedMBps} MB/s ${prog.etaSeconds ? `(${prog.etaSeconds}s)` : ""}`);
      }
    };

    try {
      let res: ImageAIResult;
      const opts: ImageAIOptions = {
        scaleFactor,
        denoiseIntensity: denoiseLevel,
        enhanceFaceLevel,
        signal: abortController.signal,
        onProgress: handleProgress,
      };

      playSfx("click");

      switch (activeTask) {
        case "remove-background":
          res = await imageAIEngine.removeBackground(imageUrl, opts);
          break;

        case "upscale":
          res = await imageAIEngine.upscale(imageUrl, scaleFactor, opts);
          break;

        case "face-enhance":
          res = await imageAIEngine.enhanceFace(imageUrl, opts);
          break;

        case "enhance":
          res = await imageAIEngine.enhanceImage(imageUrl, opts);
          break;

        case "object-remove": {
          const maskCanvas = maskCanvasRef.current;
          if (!maskCanvas || !hasMask) {
            throw new Error(isArabic ? "يرجى تظليل العنصر المراد حذفه بالفرشاة أولاً" : "Please paint over the object you want to remove");
          }
          const maskDataUrl = maskCanvas.toDataURL("image/png");
          res = await imageAIEngine.removeObject(imageUrl, maskDataUrl, opts);
          break;
        }

        default:
          throw new Error("Unsupported task");
      }

      setResult(res);
      playSfx("success");
      toast.success(
        isArabic
          ? `تمت المعالجة بنجاح (${res.executionTimeMs} ms)`
          : `Processed successfully (${res.executionTimeMs} ms)`
      );
    } catch (err: any) {
      if (err?.name === "AbortError" || abortController.signal.aborted) {
        toast.info(isArabic ? "تم إلغاء المعالجة" : "Processing cancelled");
      } else {
        console.error("[ImageAIToolsModal] Error:", err);
        toast.error(err?.message || (isArabic ? "فشلت المعالجة بالذكاء الاصطناعي" : "AI Processing failed"));
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleApply = () => {
    if (result && result.outputDataUrl) {
      onApplyResult(result.outputDataUrl);
      onClose();
      toast.success(isArabic ? "تم تطبيق التعديلات على المحرر" : "Applied to editor");
    }
  };

  const handleDownload = () => {
    if (!result?.outputDataUrl) return;
    const a = document.createElement("a");
    a.href = result.outputDataUrl;
    a.download = `vireon_ai_${activeTask}_${Date.now()}.${result.mimeType === "image/jpeg" ? "jpg" : "png"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  const currentTool = TOOLS_CONFIG.find((t) => t.id === activeTask) || TOOLS_CONFIG[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div
        className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden text-neutral-100 animate-in fade-in zoom-in-95 duration-200"
        dir={isArabic ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: `${currentTool.accentColor}25`, color: currentTool.accentColor }}
            >
              <currentTool.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-100">
                  {isArabic ? currentTool.titleAr : currentTool.titleEn}
                </h2>
                <span
                  className="px-2 py-0.5 text-[11px] font-semibold rounded-full border"
                  style={{
                    backgroundColor: `${currentTool.accentColor}15`,
                    borderColor: `${currentTool.accentColor}40`,
                    color: currentTool.accentColor,
                  }}
                >
                  {currentTool.badge}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {isArabic ? currentTool.descAr : currentTool.descEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {capability && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-neutral-800/80 rounded-lg border border-neutral-700/60 text-xs text-neutral-300">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-mono">{capability.preferredProvider.toUpperCase()}</span>
                <span className="text-neutral-500">•</span>
                <span>{capability.deviceTier} TIER</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tool Category Selector Bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-950/40 border-b border-neutral-800/60 overflow-x-auto scrollbar-none">
          {TOOLS_CONFIG.map((tool) => {
            const Icon = tool.icon;
            const isSelected = activeTask === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => handleTaskChange(tool.id)}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40 border border-transparent"
                }`}
                style={isSelected ? { borderColor: `${tool.accentColor}60` } : {}}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: isSelected ? tool.accentColor : undefined }}
                />
                <span>{isArabic ? tool.titleAr : tool.titleEn}</span>
              </button>
            );
          })}
        </div>

        {/* Main Canvas & Preview Area */}
        <div className="flex-1 min-h-[340px] max-h-[58vh] bg-neutral-950 p-4 flex items-center justify-center relative overflow-hidden">
          {/* Transparent Grid Pattern for Cutout Preview */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          />

          {result ? (
            <div className="w-full h-full max-w-3xl flex items-center justify-center">
              <BeforeAfterSlider
                beforeImage={imageUrl}
                afterImage={result.outputDataUrl}
                beforeLabel={isArabic ? "قبل المعالجة" : "Original"}
                afterLabel={isArabic ? "بعد الذكاء الاصطناعي" : "AI Result"}
                className="max-h-[54vh] w-auto aspect-auto rounded-xl shadow-2xl overflow-hidden border border-neutral-800"
              />
            </div>
          ) : activeTask === "object-remove" ? (
            <div className="relative max-h-[54vh] max-w-full flex items-center justify-center">
              <img
                src={imageUrl}
                alt="Source"
                className="max-h-[54vh] max-w-full rounded-xl object-contain shadow-lg"
                onLoad={(e) => initMaskCanvas(e.currentTarget)}
              />
              <canvas
                ref={maskCanvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="absolute inset-0 w-full h-full cursor-crosshair touch-none rounded-xl"
              />
            </div>
          ) : (
            <div className="relative max-h-[54vh] max-w-full flex items-center justify-center">
              <img
                src={imageUrl}
                alt="Source"
                className="max-h-[54vh] max-w-full rounded-xl object-contain shadow-lg border border-neutral-800/80"
              />
              {activeTask === "face-enhance" && detectedFaces && detectedFaces.facesFound > 0 && (
                <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/75 backdrop-blur-md rounded-lg border border-amber-500/40 text-amber-300 text-xs flex items-center gap-1.5 shadow-lg">
                  <Smile className="w-3.5 h-3.5" />
                  <span>
                    {isArabic
                      ? `تم اكتشاف ${detectedFaces.facesFound} وجه جاهز للترميم`
                      : `${detectedFaces.facesFound} face(s) ready for enhancement`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Real Multi-Stage Progress Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20">
              <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center text-center">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 animate-pulse shadow-xl"
                  style={{ backgroundColor: `${currentTool.accentColor}25`, color: currentTool.accentColor }}
                >
                  <currentTool.icon className="w-7 h-7 animate-spin" />
                </div>

                <h3 className="text-base font-bold text-white mb-1">
                  {isArabic ? "معالجة الصورة بالذكاء الاصطناعي..." : "Processing with Image AI..."}
                </h3>
                <p className="text-xs text-neutral-400 mb-4 h-5">{progressStage}</p>

                {/* Progress Bar */}
                <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${Math.round(progressRatio * 100)}%`,
                      backgroundColor: currentTool.accentColor,
                    }}
                  />
                </div>

                <div className="w-full flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                  <span>{Math.round(progressRatio * 100)}%</span>
                  <span>{progressDetails}</span>
                </div>

                <button
                  onClick={handleCancelExecution}
                  className="mt-5 px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-colors"
                >
                  {isArabic ? "إلغاء العملية" : "Cancel"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Task Control Parameters Bar */}
        <div className="px-5 py-3 bg-neutral-900 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-4">
          {/* Controls per tool */}
          <div className="flex items-center flex-wrap gap-4 text-xs">
            {activeTask === "upscale" && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">{isArabic ? "معامل التكبير:" : "Scale Factor:"}</span>
                <div className="flex bg-neutral-800 p-0.5 rounded-lg border border-neutral-700">
                  <button
                    onClick={() => setScaleFactor(2)}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      scaleFactor === 2 ? "bg-emerald-600 text-white shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    2x (HD)
                  </button>
                  <button
                    onClick={() => setScaleFactor(4)}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      scaleFactor === 4 ? "bg-emerald-600 text-white shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    4x (Ultra 4K)
                  </button>
                </div>
              </div>
            )}

            {activeTask === "enhance" && (
              <div className="flex items-center gap-3">
                <span className="text-neutral-400">{isArabic ? "شدة التنقية:" : "Denoise Intensity:"}</span>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={denoiseLevel}
                  onChange={(e) => setDenoiseLevel(parseFloat(e.target.value))}
                  className="w-28 accent-purple-500"
                />
                <span className="font-mono text-purple-400">{Math.round(denoiseLevel * 100)}%</span>
              </div>
            )}

            {activeTask === "face-enhance" && (
              <div className="flex items-center gap-3">
                <span className="text-neutral-400">{isArabic ? "مستوى توضيح الملامح:" : "Face Clarity:"}</span>
                <input
                  type="range"
                  min="0.3"
                  max="1.0"
                  step="0.05"
                  value={faceEnhanceLevel}
                  onChange={(e) => setFaceEnhanceLevel(parseFloat(e.target.value))}
                  className="w-28 accent-amber-500"
                />
                <span className="font-mono text-amber-400">{Math.round(faceEnhanceLevel * 100)}%</span>
              </div>
            )}

            {activeTask === "object-remove" && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Brush className="w-3.5 h-3.5 text-pink-400" />
                  <span className="text-neutral-400">{isArabic ? "حجم الفرشاة:" : "Brush Size:"}</span>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-24 accent-pink-500"
                  />
                  <span className="font-mono text-pink-400">{brushSize}px</span>
                </div>

                <div className="flex items-center gap-1.5 border-s border-neutral-800 ps-3">
                  <button
                    onClick={undoMask}
                    disabled={maskHistory.length === 0}
                    className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-40 rounded-lg hover:bg-neutral-800 transition-colors"
                    title={isArabic ? "تراجع" : "Undo"}
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={clearMask}
                    disabled={!hasMask}
                    className="p-1.5 text-neutral-400 hover:text-rose-400 disabled:opacity-40 rounded-lg hover:bg-neutral-800 transition-colors"
                    title={isArabic ? "مسح القناع" : "Clear Mask"}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div className="flex items-center gap-3 text-xs text-neutral-400 border-s border-neutral-800 ps-3">
                <span>
                  {result.width} × {result.height} px
                </span>
                <span className="text-neutral-600">•</span>
                <span className="text-emerald-400 font-mono">{result.executionTimeMs} ms</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 ms-auto">
            {result ? (
              <>
                <button
                  onClick={() => setResult(null)}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isArabic ? "إعادة المعالجة" : "Re-process"}</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isArabic ? "تنزيل" : "Download"}</span>
                </button>
                <button
                  onClick={handleApply}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>{isArabic ? "تطبيق على الصورة" : "Apply to Image"}</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleExecute}
                disabled={isProcessing}
                className="px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-white shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: currentTool.accentColor }}
              >
                <Play className="w-4 h-4 fill-white" />
                <span>
                  {isArabic
                    ? `بدء ${currentTool.titleAr}`
                    : `Run ${currentTool.titleEn}`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
