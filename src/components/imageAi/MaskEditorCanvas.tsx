import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Brush,
  Eraser,
  Sparkles,
  Undo2,
  Redo2,
  RotateCcw,
  Eye,
  Sliders,
  ZoomIn,
  ZoomOut,
  Maximize,
  Palette,
  Image as ImageIcon,
  Check,
  Layers,
  Wand2,
} from "lucide-react";
import { ImagePostprocessor } from "@/ai/image/ImagePostprocessor";

export type MaskBrushMode = "add" | "remove" | "smooth" | "hair";
export type BgPreviewType = "transparent" | "white" | "black" | "custom-color" | "custom-image";

interface MaskEditorCanvasProps {
  originalImageUrl: string;
  initialMaskDataUrl?: string;
  onMaskUpdated: (updatedResultDataUrl: string) => void;
  className?: string;
}

export const MaskEditorCanvas: React.FC<MaskEditorCanvasProps> = ({
  originalImageUrl,
  initialMaskDataUrl,
  onMaskUpdated,
  className = "",
}) => {
  const [brushMode, setBrushMode] = useState<MaskBrushMode>("add");
  const [brushSize, setBrushSize] = useState<number>(32);
  const [featherAmount, setFeatherAmount] = useState<number>(20); // 0 - 100
  const [viewMode, setViewMode] = useState<"cutout" | "mask" | "original">("cutout");
  const [bgPreview, setBgPreview] = useState<BgPreviewType>("transparent");
  const [customBgColor, setCustomBgColor] = useState<string>("#3b82f6");
  const [customBgImageUrl, setCustomBgImageUrl] = useState<string | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const customBgImageRef = useRef<HTMLImageElement | null>(null);
  const currentMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History stack for Undo / Redo
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const postprocessor = ImagePostprocessor.getInstance();

  const updateHistoryButtons = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback((imageData: ImageData) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height));
    if (newHistory.length > 25) {
      newHistory.shift();
    }
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    updateHistoryButtons();
  }, [updateHistoryButtons]);

  // Render composite onto display canvas
  const renderComposite = useCallback(() => {
    const displayCanvas = canvasRef.current;
    const srcImg = sourceImageRef.current;
    const maskCanvas = currentMaskCanvasRef.current;
    if (!displayCanvas || !srcImg || !maskCanvas) return;

    displayCanvas.width = srcImg.width;
    displayCanvas.height = srcImg.height;
    const ctx = displayCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

    if (viewMode === "original") {
      ctx.drawImage(srcImg, 0, 0);
      return;
    }

    if (viewMode === "mask") {
      ctx.drawImage(maskCanvas, 0, 0);
      return;
    }

    // Cutout Mode: Render Background layer first if chosen
    if (bgPreview === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    } else if (bgPreview === "black") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    } else if (bgPreview === "custom-color") {
      ctx.fillStyle = customBgColor;
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    } else if (bgPreview === "custom-image" && customBgImageRef.current) {
      ctx.drawImage(customBgImageRef.current, 0, 0, displayCanvas.width, displayCanvas.height);
    }

    // Prepare Cutout Foreground
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = srcImg.width;
    tempCanvas.height = srcImg.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.drawImage(srcImg, 0, 0);
    tempCtx.globalCompositeOperation = "destination-in";
    tempCtx.drawImage(maskCanvas, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0);
  }, [viewMode, bgPreview, customBgColor]);

  // Initialize Canvas & Image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      sourceImageRef.current = img;
      const w = img.width;
      const h = img.height;

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!maskCtx) return;

      if (initialMaskDataUrl) {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
          // If initial mask is an RGBA cutout, extract its alpha channel to build mask
          maskCtx.drawImage(maskImg, 0, 0, w, h);
          const cutoutData = maskCtx.getImageData(0, 0, w, h);
          const alphaMaskData = maskCtx.createImageData(w, h);
          for (let i = 0; i < cutoutData.data.length; i += 4) {
            const alpha = cutoutData.data[i + 3];
            alphaMaskData.data[i] = alpha;
            alphaMaskData.data[i + 1] = alpha;
            alphaMaskData.data[i + 2] = alpha;
            alphaMaskData.data[i + 3] = 255;
          }
          maskCtx.putImageData(alphaMaskData, 0, 0);
          currentMaskCanvasRef.current = maskCanvas;
          pushHistory(alphaMaskData);
          renderComposite();
        };
        maskImg.src = initialMaskDataUrl;
      } else {
        // Solid white mask (everything visible)
        maskCtx.fillStyle = "#ffffff";
        maskCtx.fillRect(0, 0, w, h);
        currentMaskCanvasRef.current = maskCanvas;
        const initialData = maskCtx.getImageData(0, 0, w, h);
        pushHistory(initialData);
        renderComposite();
      }
    };
    img.src = originalImageUrl;
  }, [originalImageUrl, initialMaskDataUrl, pushHistory, renderComposite]);

  // Load custom background image
  useEffect(() => {
    if (!customBgImageUrl) {
      customBgImageRef.current = null;
      renderComposite();
      return;
    }
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.onload = () => {
      customBgImageRef.current = bgImg;
      renderComposite();
    };
    bgImg.src = customBgImageUrl;
  }, [customBgImageUrl, renderComposite]);

  useEffect(() => {
    renderComposite();
  }, [viewMode, bgPreview, customBgColor, renderComposite]);

  const emitUpdatedResult = useCallback(() => {
    const srcImg = sourceImageRef.current;
    const maskCanvas = currentMaskCanvasRef.current;
    if (!srcImg || !maskCanvas) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = srcImg.width;
    exportCanvas.height = srcImg.height;
    const expCtx = exportCanvas.getContext("2d");
    if (!expCtx) return;

    // Output transparent RGBA PNG
    expCtx.drawImage(srcImg, 0, 0);
    expCtx.globalCompositeOperation = "destination-in";
    expCtx.drawImage(maskCanvas, 0, 0);

    const resultDataUrl = exportCanvas.toDataURL("image/png");
    onMaskUpdated(resultDataUrl);
  }, [onMaskUpdated]);

  // Apply Full Edge Smoothing
  const handleAutoSmoothEdges = () => {
    const maskCanvas = currentMaskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const w = maskCanvas.width;
    const h = maskCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const rawMask = new Float32Array(w * h);

    for (let i = 0; i < rawMask.length; i++) {
      rawMask[i] = imgData.data[i * 4] / 255.0;
    }

    // Box blur radius computed from featherAmount (0-100 -> 1-5px)
    const blurRadius = Math.max(1, Math.round((featherAmount / 100) * 4));
    const smoothed = postprocessor.boxBlur1D(rawMask, w, h, blurRadius);

    for (let i = 0; i < rawMask.length; i++) {
      const v = Math.round(smoothed[i] * 255);
      imgData.data[i * 4] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    pushHistory(imgData);
    renderComposite();
    emitUpdatedResult();
  };

  // Stroke Drawing Operations
  const drawStroke = useCallback(
    (clientX: number, clientY: number) => {
      const displayCanvas = canvasRef.current;
      const maskCanvas = currentMaskCanvasRef.current;
      if (!displayCanvas || !maskCanvas) return;

      const rect = displayCanvas.getBoundingClientRect();
      const scaleX = maskCanvas.width / rect.width;
      const scaleY = maskCanvas.height / rect.height;

      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!maskCtx) return;

      maskCtx.save();
      maskCtx.beginPath();
      maskCtx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2);

      if (brushMode === "add") {
        maskCtx.fillStyle = "#ffffff";
        maskCtx.globalAlpha = 1.0;
        maskCtx.fill();
      } else if (brushMode === "remove") {
        maskCtx.fillStyle = "#000000";
        maskCtx.globalAlpha = 1.0;
        maskCtx.fill();
      } else if (brushMode === "smooth" || brushMode === "hair") {
        const strokeRadius = Math.round((brushSize * scaleX) / 2);
        const cropX = Math.max(0, Math.floor(x - strokeRadius));
        const cropY = Math.max(0, Math.floor(y - strokeRadius));
        const cropW = Math.min(maskCanvas.width - cropX, strokeRadius * 2);
        const cropH = Math.min(maskCanvas.height - cropY, strokeRadius * 2);

        if (cropW > 0 && cropH > 0) {
          const regionData = maskCtx.getImageData(cropX, cropY, cropW, cropH);
          const rawMask = new Float32Array(cropW * cropH);
          for (let i = 0; i < rawMask.length; i++) {
            rawMask[i] = regionData.data[i * 4] / 255.0;
          }

          const blurRadius = brushMode === "hair" ? 2 : Math.max(1, Math.round((featherAmount / 100) * 5));
          const blurred = postprocessor.boxBlur1D(rawMask, cropW, cropH, blurRadius);

          for (let i = 0; i < rawMask.length; i++) {
            const v = Math.round(blurred[i] * 255);
            regionData.data[i * 4] = v;
            regionData.data[i * 4 + 1] = v;
            regionData.data[i * 4 + 2] = v;
            regionData.data[i * 4 + 3] = 255;
          }
          maskCtx.putImageData(regionData, cropX, cropY);
        }
      }
      maskCtx.restore();

      renderComposite();
    },
    [brushMode, brushSize, featherAmount, postprocessor, renderComposite]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.shiftKey) {
      // Middle click or shift = pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }
    setIsDrawing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawStroke(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        visible: true,
      });
    }

    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (!isDrawing) return;
    drawStroke(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (!isDrawing) return;
    setIsDrawing(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const maskCanvas = currentMaskCanvasRef.current;
    if (maskCanvas) {
      const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (maskCtx) {
        pushHistory(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
      }
    }
    emitUpdatedResult();
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const maskCanvas = currentMaskCanvasRef.current;
      if (maskCanvas) {
        const maskCtx = maskCanvas.getContext("2d");
        if (maskCtx) {
          maskCtx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
          renderComposite();
          emitUpdatedResult();
        }
      }
      updateHistoryButtons();
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const maskCanvas = currentMaskCanvasRef.current;
      if (maskCanvas) {
        const maskCtx = maskCanvas.getContext("2d");
        if (maskCtx) {
          maskCtx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
          renderComposite();
          emitUpdatedResult();
        }
      }
      updateHistoryButtons();
    }
  };

  const handleResetMask = () => {
    if (historyRef.current.length > 0) {
      historyIndexRef.current = 0;
      const maskCanvas = currentMaskCanvasRef.current;
      if (maskCanvas) {
        const maskCtx = maskCanvas.getContext("2d");
        if (maskCtx) {
          maskCtx.putImageData(historyRef.current[0], 0, 0);
          renderComposite();
          emitUpdatedResult();
        }
      }
      updateHistoryButtons();
    }
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomBgImageUrl(url);
      setBgPreview("custom-image");
    }
  };

  const checkerboardStyle: React.CSSProperties = {
    backgroundImage: `
      linear-gradient(45deg, #1e293b 25%, transparent 25%),
      linear-gradient(-45deg, #1e293b 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #1e293b 75%),
      linear-gradient(-45deg, transparent 75%, #1e293b 75%)
    `,
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
    backgroundColor: "#0f172a",
  };

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {/* Editor Main Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md">
        {/* Brush Modes: Restore / Erase / Smooth / Hair */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setBrushMode("add")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              brushMode === "add"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="إعادة واستعادة الجزء (Restore / Add)"
          >
            <Brush className="w-3.5 h-3.5" />
            <span>استعادة</span>
          </button>

          <button
            type="button"
            onClick={() => setBrushMode("remove")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              brushMode === "remove"
                ? "bg-rose-600 text-white shadow-md shadow-rose-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="مسح وحذف الزوائد (Erase / Remove)"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>مسح</span>
          </button>

          <button
            type="button"
            onClick={() => setBrushMode("hair")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              brushMode === "hair"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="تنعيم حواف الشعر الدقيقة (Hair Edge)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>حواف الشعر</span>
          </button>
        </div>

        {/* Brush Preset Sizes & Slider */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/60 rounded-lg border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">الحجم:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBrushSize(12)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                brushSize === 12 ? "bg-primary text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              صغير
            </button>
            <button
              type="button"
              onClick={() => setBrushSize(32)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                brushSize === 32 ? "bg-primary text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              وسط
            </button>
            <button
              type="button"
              onClick={() => setBrushSize(64)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                brushSize === 64 ? "bg-primary text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              كبير
            </button>
          </div>
          <input
            type="range"
            min="6"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
            className="w-16 sm:w-20 accent-primary h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />
          <span className="text-[11px] font-bold text-slate-300 w-5 text-center">{brushSize}</span>
        </div>

        {/* Feather & Edge Smooth Auto Action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium">تنعيم (Feather):</span>
            <input
              type="range"
              min="0"
              max="100"
              value={featherAmount}
              onChange={(e) => setFeatherAmount(parseInt(e.target.value, 10))}
              className="w-14 sm:w-16 accent-indigo-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-bold text-indigo-400 w-6 text-center">{featherAmount}%</span>
          </div>

          <button
            type="button"
            onClick={handleAutoSmoothEdges}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 text-xs font-semibold transition"
            title="تنعيم حواف القناع تلقائياً"
          >
            <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">تنعيم تلقائي</span>
          </button>
        </div>

        {/* Undo / Redo / Reset */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
            title="تراجع (Undo)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
            title="إعادة (Redo)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetMask}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-rose-400 hover:bg-slate-700 transition"
            title="إعادة تعيين القناع الأصلي"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Secondary Bar: Background Preview Selector & View Modes */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
        {/* Background Preview Options: Transparent, White, Black, Custom Color, Custom Image */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>معاينة الخلفية:</span>
          </span>

          <button
            type="button"
            onClick={() => setBgPreview("transparent")}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
              bgPreview === "transparent"
                ? "bg-primary text-white shadow"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            شفافة
          </button>

          <button
            type="button"
            onClick={() => setBgPreview("white")}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
              bgPreview === "white"
                ? "bg-white text-slate-950 font-bold shadow"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            بيضاء
          </button>

          <button
            type="button"
            onClick={() => setBgPreview("black")}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
              bgPreview === "black"
                ? "bg-slate-950 text-white border border-slate-700 shadow"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            سوداء
          </button>

          {/* Color Picker Background */}
          <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded">
            <input
              type="color"
              value={customBgColor}
              onChange={(e) => {
                setCustomBgColor(e.target.value);
                setBgPreview("custom-color");
              }}
              className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent"
              title="اختر لون مخصص"
            />
            <button
              type="button"
              onClick={() => setBgPreview("custom-color")}
              className={`text-[11px] font-semibold ${
                bgPreview === "custom-color" ? "text-primary" : "text-slate-300"
              }`}
            >
              لون
            </button>
          </div>

          {/* Image Background Upload */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBgImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition ${
                bgPreview === "custom-image"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>صورة</span>
            </button>
          </div>
        </div>

        {/* View Mode: Cutout / Mask / Original */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode("cutout")}
            className={`px-2 py-0.5 text-[11px] rounded font-medium ${
              viewMode === "cutout" ? "bg-primary text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            المفرغة
          </button>
          <button
            type="button"
            onClick={() => setViewMode("mask")}
            className={`px-2 py-0.5 text-[11px] rounded font-medium ${
              viewMode === "mask" ? "bg-primary text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            القناع
          </button>
          <button
            type="button"
            onClick={() => setViewMode("original")}
            className={`px-2 py-0.5 text-[11px] rounded font-medium ${
              viewMode === "original" ? "bg-primary text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            الأصلية
          </button>
        </div>
      </div>

      {/* Interactive Canvas Viewport */}
      <div
        ref={containerRef}
        className="relative w-full h-80 sm:h-[420px] rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner select-none cursor-crosshair"
        style={bgPreview === "transparent" ? checkerboardStyle : {}}
        onPointerLeave={() => setCursorPos((p) => ({ ...p, visible: false }))}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="max-w-full max-h-full object-contain touch-none shadow-2xl rounded-lg"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transition: isDrawing || isPanning ? "none" : "transform 0.1s ease-out",
          }}
        />

        {/* Visual Brush Size Indicator on Cursor */}
        {cursorPos.visible && !isPanning && (
          <div
            className="pointer-events-none absolute rounded-full border-2 transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              width: brushSize,
              height: brushSize,
              borderColor:
                brushMode === "add"
                  ? "rgba(16, 185, 129, 0.9)"
                  : brushMode === "remove"
                  ? "rgba(244, 63, 94, 0.9)"
                  : "rgba(99, 102, 241, 0.9)",
              backgroundColor:
                brushMode === "add"
                  ? "rgba(16, 185, 129, 0.15)"
                  : brushMode === "remove"
                  ? "rgba(244, 63, 94, 0.15)"
                  : "rgba(99, 102, 241, 0.15)",
            }}
          />
        )}

        {/* Zoom & Reset Pan Controls */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="p-1 rounded text-slate-300 hover:text-white"
            title="تكبير"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-slate-400 px-1">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))}
            className="p-1 rounded text-slate-300 hover:text-white"
            title="تصغير"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          {(zoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="p-1 rounded text-slate-300 hover:text-white"
              title="إعادة الحجم الافتراضي"
            >
              <Maximize className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaskEditorCanvas;
