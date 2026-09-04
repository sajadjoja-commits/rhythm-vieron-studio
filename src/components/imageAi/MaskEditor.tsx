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
  Maximize2,
  Palette,
  Check,
  Layers,
  Wand2,
} from "lucide-react";
import { BgPreviewMode } from "./BackgroundPreviewBar";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

export type MaskBrushTool = "restore" | "erase";
export type MaskViewMode = "result" | "mask" | "original";

interface MaskEditorProps {
  originalImageUrl: string;
  initialMaskOrCutoutUrl: string;
  bgPreviewMode: BgPreviewMode;
  customBgColor: string;
  customBgImageUrl: string | null;
  onMaskUpdated: (updatedCutoutDataUrl: string) => void;
  className?: string;
}

export const MaskEditor: React.FC<MaskEditorProps> = ({
  originalImageUrl,
  initialMaskOrCutoutUrl,
  bgPreviewMode,
  customBgColor,
  customBgImageUrl,
  onMaskUpdated,
  className = "",
}) => {
  // Brush Configuration
  const [activeTool, setActiveTool] = useState<MaskBrushTool>("restore");
  const [brushSize, setBrushSize] = useState<number>(32);
  const [isSoftEdge, setIsSoftEdge] = useState<boolean>(true);
  const [featherAmount, setFeatherAmount] = useState<number>(20); // 0 - 100
  const [viewMode, setViewMode] = useState<MaskViewMode>("result");
  const [edgeSmoothingLevel, setEdgeSmoothingLevel] = useState<number>(25);

  // Zoom and Pan
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // History Stack
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const initialMaskImageDataRef = useRef<ImageData | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Canvas and Image References
  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const customBgImageRef = useRef<HTMLImageElement | null>(null);

  // Pointer & Touch Tracking
  const [isDrawing, setIsDrawing] = useState(false);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomOnPinchRef = useRef<number>(1);
  const lastTapTimeRef = useRef<number>(0);

  // Update Undo / Redo states
  const updateHistoryButtons = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback(
    (imageData: ImageData) => {
      const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      newHistory.push(
        new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
      );
      if (newHistory.length > 25) {
        newHistory.shift();
      }
      historyRef.current = newHistory;
      historyIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [updateHistoryButtons]
  );

  // Composite rendering on the display canvas
  const renderComposite = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const srcImg = sourceImageRef.current;
    const maskCanvas = maskCanvasRef.current;
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
      // Draw binary mask (White = Subject, Black = Background)
      ctx.drawImage(maskCanvas, 0, 0);
      return;
    }

    // Cutout / Result mode: Draw Background Preview first
    if (bgPreviewMode === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    } else if (bgPreviewMode === "black") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    } else if (bgPreviewMode === "custom-color") {
      ctx.fillStyle = customBgColor;
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    } else if (bgPreviewMode === "custom-image" && customBgImageRef.current) {
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
  }, [viewMode, bgPreviewMode, customBgColor]);

  // Emit updated transparent PNG result back to parent
  const emitUpdatedResult = useCallback(() => {
    const srcImg = sourceImageRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!srcImg || !maskCanvas) return;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = srcImg.width;
    outCanvas.height = srcImg.height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return;

    outCtx.drawImage(srcImg, 0, 0);
    outCtx.globalCompositeOperation = "destination-in";
    outCtx.drawImage(maskCanvas, 0, 0);

    const dataUrl = outCanvas.toDataURL("image/png");
    onMaskUpdated(dataUrl);
  }, [onMaskUpdated]);

  // Load Custom Background Image
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

  // Initialization: Load Source Image & Initial Mask
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

      if (initialMaskOrCutoutUrl) {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
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
          maskCanvasRef.current = maskCanvas;
          initialMaskImageDataRef.current = new ImageData(
            new Uint8ClampedArray(alphaMaskData.data),
            w,
            h
          );
          pushHistory(alphaMaskData);
          renderComposite();
        };
        maskImg.src = initialMaskOrCutoutUrl;
      } else {
        maskCtx.fillStyle = "#ffffff";
        maskCtx.fillRect(0, 0, w, h);
        maskCanvasRef.current = maskCanvas;
        const initialData = maskCtx.getImageData(0, 0, w, h);
        initialMaskImageDataRef.current = new ImageData(
          new Uint8ClampedArray(initialData.data),
          w,
          h
        );
        pushHistory(initialData);
        renderComposite();
      }
    };
    img.src = originalImageUrl;
  }, [originalImageUrl, initialMaskOrCutoutUrl, pushHistory, renderComposite]);

  useEffect(() => {
    renderComposite();
  }, [viewMode, bgPreviewMode, customBgColor, renderComposite]);

  // Brush Painting Implementation on Mask Canvas
  const paintOnMask = (canvasX: number, canvasY: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);

    if (isSoftEdge && featherAmount > 0) {
      const gradient = ctx.createRadialGradient(
        canvasX,
        canvasY,
        Math.max(0, (brushSize / 2) * (1 - featherAmount / 100)),
        canvasX,
        canvasY,
        brushSize / 2
      );

      if (activeTool === "restore") {
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      } else {
        gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      }

      ctx.fillStyle = gradient;
      ctx.fill();
    } else {
      ctx.fillStyle = activeTool === "restore" ? "#ffffff" : "#000000";
      ctx.fill();
    }

    ctx.restore();
    renderComposite();
  };

  // Convert Client coordinates to Canvas coordinates considering zoom and pan
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Pointer Event Handlers for Mobile & Desktop
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Handle Double Tap to Reset Zoom
    const now = Date.now();
    if (now - lastTapTimeRef.current < 300) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      lastTapTimeRef.current = 0;
      return;
    }
    lastTapTimeRef.current = now;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      if (e.shiftKey || e.button === 1 || e.button === 2) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      } else {
        setIsDrawing(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (coords) paintOnMask(coords.x, coords.y);
      }
    } else if (activePointersRef.current.size === 2) {
      // Pinch to Zoom start
      setIsDrawing(false);
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      initialPinchDistanceRef.current = dist;
      initialZoomOnPinchRef.current = zoom;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2 && initialPinchDistanceRef.current !== null) {
      // Pinch to Zoom active
      const points = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const factor = currentDist / initialPinchDistanceRef.current;
      const newZoom = Math.min(4, Math.max(1, initialZoomOnPinchRef.current * factor));
      setZoom(newZoom);
      return;
    }

    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (isDrawing) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (coords) paintOnMask(coords.x, coords.y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      initialPinchDistanceRef.current = null;
    }

    if (isDrawing) {
      setIsDrawing(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}

      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas) {
        const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
        if (maskCtx) {
          const updatedData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
          pushHistory(updatedData);
          emitUpdatedResult();
        }
      }
    }

    if (isPanning && activePointersRef.current.size === 0) {
      setIsPanning(false);
    }
  };

  // Undo / Redo Actions
  const handleUndo = () => {
    if (!canUndo || historyIndexRef.current <= 0) return;
    playSfx("click");
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    historyIndexRef.current -= 1;
    const prevData = historyRef.current[historyIndexRef.current];
    maskCtx.putImageData(prevData, 0, 0);
    updateHistoryButtons();
    renderComposite();
    emitUpdatedResult();
  };

  const handleRedo = () => {
    if (!canRedo || historyIndexRef.current >= historyRef.current.length - 1) return;
    playSfx("click");
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    historyIndexRef.current += 1;
    const nextData = historyRef.current[historyIndexRef.current];
    maskCtx.putImageData(nextData, 0, 0);
    updateHistoryButtons();
    renderComposite();
    emitUpdatedResult();
  };

  // Reset Mask to Initial AI State
  const handleResetMask = () => {
    if (!initialMaskImageDataRef.current) return;
    playSfx("click");
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    maskCtx.putImageData(initialMaskImageDataRef.current, 0, 0);
    pushHistory(initialMaskImageDataRef.current);
    renderComposite();
    emitUpdatedResult();
    toast.info("تمت إعادة ضبط القناع إلى حالة الذكاء الاصطناعي الأولية");
  };

  // Auto Edge Smoothing Filter on Mask
  const handleApplyEdgeSmoothing = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskCtx) return;

    playSfx("pop");
    const w = maskCanvas.width;
    const h = maskCanvas.height;
    const imgData = maskCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const radius = Math.max(1, Math.round((edgeSmoothingLevel / 100) * 3));

    // Simple Box blur smoothing on mask alpha
    const copy = new Uint8ClampedArray(data);
    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const idx = ((y + dy) * w + (x + dx)) * 4;
            sum += copy[idx];
            count++;
          }
        }
        const avg = sum / count;
        // Non-linear Sigmoid Sharpening
        const norm = avg / 255;
        const refined = norm > 0.5 ? Math.min(255, avg * 1.08) : Math.max(0, avg * 0.92);
        const targetIdx = (y * w + x) * 4;
        data[targetIdx] = refined;
        data[targetIdx + 1] = refined;
        data[targetIdx + 2] = refined;
      }
    }

    maskCtx.putImageData(imgData, 0, 0);
    pushHistory(imgData);
    renderComposite();
    emitUpdatedResult();
    toast.success("تم تطبيق تنعيم الحواف بنجاح");
  };

  return (
    <div
      className={`flex flex-col h-full w-full bg-slate-950 text-slate-100 select-none overflow-hidden ${className}`}
      dir="rtl"
    >
      {/* Top Toolbar: View Switcher & Undo/Redo/Zoom */}
      <div className="flex items-center justify-between gap-1.5 p-2 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md flex-shrink-0">
        {/* View Mode Buttons */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode("result")}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === "result"
                ? "bg-primary text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            النتيجة
          </button>
          <button
            type="button"
            onClick={() => setViewMode("mask")}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === "mask"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            القناع
          </button>
          <button
            type="button"
            onClick={() => setViewMode("original")}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              viewMode === "original"
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            الأصل
          </button>
        </div>

        {/* Undo / Redo / Reset & Zoom */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition border border-slate-700"
            title="تراجع"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition border border-slate-700"
            title="إعادة"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetMask}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-300 transition border border-slate-700"
            title="إعادة ضبط القناع"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-5 bg-slate-800 mx-0.5" />

          {/* Zoom Buttons */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 transition border border-slate-700"
            title="تكبير"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition ${
              zoom > 1
                ? "bg-primary text-white border-primary"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
            title="إعادة التكبير"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport Area */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden bg-slate-950/80 p-2 touch-none select-none"
        style={{
          backgroundImage:
            bgPreviewMode === "transparent" && viewMode === "result"
              ? `
                linear-gradient(45deg, #1e293b 25%, transparent 25%),
                linear-gradient(-45deg, #1e293b 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #1e293b 75%),
                linear-gradient(-45deg, transparent 75%, #1e293b 75%)
              `
              : "none",
          backgroundSize: "16px 16px",
          backgroundColor: "#090d16",
        }}
      >
        <canvas
          ref={displayCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-transform duration-75 cursor-crosshair touch-none"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        />

        {zoom > 1 && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-slate-300 border border-white/10 pointer-events-none">
            انقر مرتين لإعادة ضبط الحجم
          </div>
        )}
      </div>

      {/* Bottom Tool Controls (Brush Size, Feather, Tools) */}
      <div className="flex flex-col gap-2 p-2.5 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md flex-shrink-0">
        {/* Tool Selector & Presets */}
        <div className="flex items-center justify-between gap-2">
          {/* Tool: Restore / Erase */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                playSfx("click");
                setActiveTool("restore");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTool === "restore"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Brush className="w-3.5 h-3.5" />
              <span>استعادة</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playSfx("click");
                setActiveTool("erase");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTool === "erase"
                  ? "bg-rose-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>مسح</span>
            </button>
          </div>

          {/* Quick Brush Size Presets */}
          <div className="flex items-center gap-1">
            {[
              { label: "صغير", size: 12 },
              { label: "وسط", size: 32 },
              { label: "كبير", size: 64 },
            ].map((preset) => (
              <button
                key={preset.size}
                type="button"
                onClick={() => setBrushSize(preset.size)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition ${
                  brushSize === preset.size
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders: Brush Size & Feather & Edge Smooth */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* Brush Size Slider */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 whitespace-nowrap text-[11px]">حجم الفرشاة:</span>
            <input
              type="range"
              min="4"
              max="100"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="font-bold text-primary text-[11px] w-8 text-left">{brushSize}px</span>
          </div>

          {/* Feather / Softness Slider */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 whitespace-nowrap text-[11px]">نعومة الحواف:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={featherAmount}
              onChange={(e) => setFeatherAmount(parseInt(e.target.value, 10))}
              className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="font-bold text-emerald-400 text-[11px] w-8 text-left">
              {featherAmount}%
            </span>
          </div>
        </div>

        {/* Auto Edge Smoothing Bar */}
        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-xl bg-slate-950/40 border border-slate-800/80">
          <div className="flex items-center gap-2 flex-1">
            <Wand2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-[11px] text-slate-300">تنعيم تلقائي:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={edgeSmoothingLevel}
              onChange={(e) => setEdgeSmoothingLevel(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-bold text-slate-400">{edgeSmoothingLevel}%</span>
          </div>
          <button
            type="button"
            onClick={handleApplyEdgeSmoothing}
            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow transition flex-shrink-0"
          >
            تطبيق
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaskEditor;
