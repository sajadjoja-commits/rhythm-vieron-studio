import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Undo2,
  Redo2,
  RotateCcw,
  Sliders,
  Sparkles,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Layers,
  Palette,
  Eraser,
  Brush,
  Scissors,
  Wand2,
  StopCircle,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { t, isRTL } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { ImageAITaskType, ImageAIResult } from "@/ai/image/types";
import { getToolDefinition, ImageAIToolDefinition } from "@/ai/image/toolsRegistry";
import { imageAIEngine } from "@/ai/image/ImageAIEngine";
import { BeforeAfterSlider } from "@/components/ui/BeforeAfterSlider";
import { MaskEditor } from "./MaskEditor";
import { BackgroundPreviewBar, BgPreviewMode } from "./BackgroundPreviewBar";

interface ImageAIWorkspaceProps {
  taskId: ImageAITaskType;
  imageUrl: string;
  onApply: (resultUrl: string) => void;
  onCancel: () => void;
  onBackToHub: () => void;
  className?: string;
}

export const ImageAIWorkspace: React.FC<ImageAIWorkspaceProps> = ({
  taskId,
  imageUrl,
  onApply,
  onCancel,
  onBackToHub,
  className = "",
}) => {
  const toolDef = getToolDefinition(taskId);

  // Layout responsiveness: detect landscape or compact height (< 500px)
  const [isCompactHeight, setIsCompactHeight] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [optionsCollapsed, setOptionsCollapsed] = useState(false);

  useEffect(() => {
    const checkDimensions = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      setIsCompactHeight(h < 500);
      setIsLandscape(w > h && w >= 600);
    };
    checkDimensions();
    window.addEventListener("resize", checkDimensions);
    return () => window.removeEventListener("resize", checkDimensions);
  }, []);

  // Execution & Progress State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Result state
  const [currentResultUrl, setCurrentResultUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"slider" | "result" | "original">("slider");

  // Options state
  const [edgeRefinement, setEdgeRefinement] = useState(true);
  const [featherRadius, setFeatherRadius] = useState(2);
  const [denoiseStrength, setDenoiseStrength] = useState(0.7);
  const [contrastBoost, setContrastBoost] = useState(0.5);
  const [faceRestoreLevel, setFaceRestoreLevel] = useState(0.85);
  const [scaleFactor, setScaleFactor] = useState<2 | 4>(2);

  // Object-removal brush & inpaint canvas state
  const [inpaintBrushSize, setInpaintBrushSize] = useState(30);
  const [inpaintTool, setInpaintTool] = useState<"brush" | "eraser">("brush");
  const [hasInpaintMask, setHasInpaintMask] = useState(false);
  const inpaintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inpaintImgContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPaintingInpaint, setIsPaintingInpaint] = useState(false);
  const lastInpaintCoordRef = useRef<{ x: number; y: number } | null>(null);

  // History stack within workspace (for brush strokes or inpainting edits)
  const inpaintHistoryRef = useRef<ImageData[]>([]);
  const inpaintHistIdxRef = useRef(-1);
  const [canUndoStroke, setCanUndoStroke] = useState(false);
  const [canRedoStroke, setCanRedoStroke] = useState(false);

  // Touch and pointer tracking for 2-finger zoom/pan and 1-finger draw with elevated indicator
  const [touchCursor, setTouchCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Background Preview for Cutout mode
  const [bgPreviewMode, setBgPreviewMode] = useState<BgPreviewMode>("transparent");
  const [customBgColor, setCustomBgColor] = useState("#3b82f6");
  const [customBgImageUrl, setCustomBgImageUrl] = useState<string | null>(null);

  // Cancel running job
  const handleCancelExecution = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgressPct(0);
    setProgressMessage("");
  }, []);

  // Execute AI Tool Task
  const handleExecuteTool = async () => {
    handleCancelExecution();
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    setIsProcessing(true);
    setProgressPct(5);
    setProgressMessage(t("imageAi.processing"));
    playSfx("click");

    try {
      let res: ImageAIResult;
      const onProgress = (p: any) => {
        if (p?.progress != null) setProgressPct(Math.round(p.progress * 100));
        if (p?.message) setProgressMessage(p.message);
      };

      if (taskId === "remove-background") {
        res = await imageAIEngine.removeBackground(imageUrl, {
          edgeRefinement,
          featherRadius,
          signal: abortCtrl.signal,
          onProgress,
        });
      } else if (taskId === "enhance") {
        res = await imageAIEngine.enhanceImage(imageUrl, {
          denoiseIntensity: denoiseStrength,
          contrastBoost,
          signal: abortCtrl.signal,
          onProgress,
        });
      } else if (taskId === "face-enhance") {
        res = await imageAIEngine.enhanceFace(imageUrl, {
          enhanceFaceLevel: faceRestoreLevel,
          signal: abortCtrl.signal,
          onProgress,
        });
      } else if (taskId === "upscale") {
        res = await imageAIEngine.upscaleImage(imageUrl, scaleFactor, {
          denoiseIntensity: denoiseStrength,
          signal: abortCtrl.signal,
          onProgress,
        });
      } else if (taskId === "object-remove") {
        // Build mask data URL from inpaintCanvas
        const maskCanvas = inpaintCanvasRef.current;
        if (!maskCanvas) throw new Error("Inpaint canvas not ready");
        const maskDataUrl = maskCanvas.toDataURL("image/png");
        res = await imageAIEngine.removeObject(imageUrl, maskDataUrl, {
          signal: abortCtrl.signal,
          onProgress,
        });
      } else {
        throw new Error(`Unsupported task: ${taskId}`);
      }

      if (abortCtrl.signal.aborted) return;

      if (res && res.outputDataUrl) {
        setCurrentResultUrl(res.outputDataUrl);
        setViewMode("slider");
        playSfx("success");
      }
    } catch (err: any) {
      if (abortCtrl.signal.aborted) {
        toast.info(t("imageAi.cancel"));
        return;
      }
      console.error("[ImageAIWorkspace] Execution failed:", err);
      toast.error(err?.message || "AI execution failed");
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // Run automatically for single-click tools if not yet executed
  useEffect(() => {
    if (taskId !== "object-remove" && !currentResultUrl && !isProcessing) {
      handleExecuteTool();
    }
  }, [taskId]);

  // Init inpaint canvas for object-remove
  useEffect(() => {
    if (taskId !== "object-remove") return;
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth || img.width || 800;
      canvas.height = img.naturalHeight || img.height || 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const initial = ctx.getImageData(0, 0, canvas.width, canvas.height);
        inpaintHistoryRef.current = [initial];
        inpaintHistIdxRef.current = 0;
        setCanUndoStroke(false);
        setCanRedoStroke(false);
      }
    };
    img.src = imageUrl;
  }, [taskId, imageUrl]);

  // Drawing handlers for inpaint canvas
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      domX: clientX - rect.left,
      domY: clientY - rect.top,
    };
  };

  const drawInpaintLine = (x0: number, y0: number, x1: number, y1: number) => {
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaledBrush = inpaintBrushSize * scale;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = scaledBrush;

    if (inpaintTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(244, 63, 94, 0.75)"; // semi-transparent pink/red mask
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
    setHasInpaintMask(true);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      // 1 finger = draw
      setIsPaintingInpaint(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (coords) {
        lastInpaintCoordRef.current = { x: coords.x, y: coords.y };
        drawInpaintLine(coords.x, coords.y, coords.x, coords.y);
        setTouchCursor({
          x: coords.domX,
          y: coords.domY - 45, // elevated above finger by 45px
          visible: true,
        });
      }
    } else if (activePointersRef.current.size === 2) {
      // 2 fingers = pinch zoom / pan
      setIsPaintingInpaint(false);
      lastInpaintCoordRef.current = null;
      setTouchCursor((prev) => ({ ...prev, visible: false }));
      const pts = Array.from(activePointersRef.current.values());
      pinchStartDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2 && pinchStartDistRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = currentDist / pinchStartDistRef.current;
      setZoom((z) => Math.min(3.5, Math.max(1, z * factor)));
      pinchStartDistRef.current = currentDist;
      return;
    }

    if (!isPaintingInpaint || activePointersRef.current.size > 1) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (coords && lastInpaintCoordRef.current) {
      drawInpaintLine(
        lastInpaintCoordRef.current.x,
        lastInpaintCoordRef.current.y,
        coords.x,
        coords.y
      );
      lastInpaintCoordRef.current = { x: coords.x, y: coords.y };
      setTouchCursor({
        x: coords.domX,
        y: coords.domY - 45, // elevated above touch point
        visible: true,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) {
      setIsPaintingInpaint(false);
      lastInpaintCoordRef.current = null;
      setTouchCursor((prev) => ({ ...prev, visible: false }));

      // Push history state
      const canvas = inpaintCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const nextIdx = inpaintHistIdxRef.current + 1;
          const newHist = inpaintHistoryRef.current.slice(0, nextIdx);
          newHist.push(snap);
          if (newHist.length > 20) newHist.shift();
          inpaintHistoryRef.current = newHist;
          inpaintHistIdxRef.current = newHist.length - 1;
          setCanUndoStroke(inpaintHistIdxRef.current > 0);
          setCanRedoStroke(false);
        }
      }
    }
  };

  const handleUndoStroke = () => {
    if (inpaintHistIdxRef.current > 0) {
      inpaintHistIdxRef.current--;
      const canvas = inpaintCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const snap = inpaintHistoryRef.current[inpaintHistIdxRef.current];
        if (ctx && snap) ctx.putImageData(snap, 0, 0);
      }
      setCanUndoStroke(inpaintHistIdxRef.current > 0);
      setCanRedoStroke(true);
      playSfx("click");
    }
  };

  const handleRedoStroke = () => {
    if (inpaintHistIdxRef.current < inpaintHistoryRef.current.length - 1) {
      inpaintHistIdxRef.current++;
      const canvas = inpaintCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const snap = inpaintHistoryRef.current[inpaintHistIdxRef.current];
        if (ctx && snap) ctx.putImageData(snap, 0, 0);
      }
      setCanUndoStroke(true);
      setCanRedoStroke(inpaintHistIdxRef.current < inpaintHistoryRef.current.length - 1);
      playSfx("click");
    }
  };

  const isSideBySideLayout = isLandscape || isCompactHeight;

  return (
    <div
      className={`flex ${isSideBySideLayout ? "flex-row" : "flex-col"} w-full h-full bg-[#0a0d14] text-foreground overflow-hidden ${className}`}
      dir="rtl"
    >
      {/* 1. Image Viewport: Guarantees >= 50% available height on vertical mobile */}
      <div
        className={`relative ${
          isSideBySideLayout ? "flex-1 w-2/3 h-full" : "min-h-[50%] flex-1 w-full"
        } flex items-center justify-center p-2.5 bg-[#07090e] overflow-hidden select-none`}
      >
        {/* Main View Area */}
        {taskId === "object-remove" && !currentResultUrl ? (
          /* Object Inpaint Editor Canvas */
          <div
            ref={inpaintImgContainerRef}
            className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl border border-white/10"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          >
            <img
              src={imageUrl}
              alt="Source"
              className="max-w-full max-h-[70dvh] object-contain select-none pointer-events-none rounded-2xl"
              draggable={false}
            />
            {/* Draw Canvas overlaid on exact image rectangle */}
            <canvas
              ref={inpaintCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 w-full h-full object-contain touch-none cursor-crosshair rounded-2xl"
            />
            {/* Touch brush visual cursor raised 45px above finger */}
            {touchCursor.visible && (
              <div
                className="absolute pointer-events-none rounded-full border-2 border-rose-400 bg-rose-500/25 shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-opacity"
                style={{
                  left: touchCursor.x,
                  top: touchCursor.y,
                  width: inpaintBrushSize,
                  height: inpaintBrushSize,
                }}
              />
            )}
          </div>
        ) : currentResultUrl ? (
          viewMode === "slider" ? (
            <div className="w-full h-full max-h-[75dvh] flex items-center justify-center p-1">
              <BeforeAfterSlider
                beforeImage={imageUrl}
                afterImage={currentResultUrl}
                beforeLabel={t("imageAi.before")}
                afterLabel={t("imageAi.after")}
                aspectRatio="auto"
                className="w-full h-full max-h-[70dvh]"
              />
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center p-2">
              <img
                src={viewMode === "original" ? imageUrl : currentResultUrl}
                alt="Preview"
                className="max-w-full max-h-[70dvh] object-contain rounded-2xl shadow-2xl border border-white/10"
                draggable={false}
              />
            </div>
          )
        ) : (
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Base"
              className="max-w-full max-h-[70dvh] object-contain rounded-2xl shadow-xl border border-white/10"
              draggable={false}
            />
          </div>
        )}

        {/* View Mode Switcher pill (when result is available) */}
        {currentResultUrl && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1 p-1 bg-black/70 backdrop-blur-md rounded-xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("slider")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                viewMode === "slider" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("imageAi.slider")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("result")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                viewMode === "result" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("imageAi.result")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("original")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                viewMode === "original" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("imageAi.original")}
            </button>
          </div>
        )}

        {/* Processing Indicator Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center animate-pulse shadow-xl">
                <Sparkles className="w-8 h-8 text-white animate-spin" style={{ animationDuration: "3s" }} />
              </div>
            </div>
            <h4 className="text-sm font-bold text-slate-100 mb-1">
              {progressMessage || t("imageAi.processing")}
            </h4>
            <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden mb-3 border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200"
                style={{ width: `${Math.max(10, progressPct)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={handleCancelExecution}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition active:scale-95"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>{t("imageAi.processingCancel")}</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Collapsible Options Panel */}
      <div
        className={`${
          isSideBySideLayout
            ? "w-1/3 min-w-[280px] max-w-sm h-full border-r border-white/10"
            : "w-full border-t border-white/10"
        } bg-[#10141f] flex flex-col flex-shrink-0 z-10 transition-all`}
      >
        {/* Panel Header & Toggle */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.02] border-b border-white/5">
          <div className="flex items-center gap-2">
            {toolDef && (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                style={{ backgroundColor: `${toolDef.accentColor}25`, color: toolDef.accentColor }}
              >
                <toolDef.icon className="w-3.5 h-3.5" />
              </div>
            )}
            <div>
              <span className="text-xs font-bold text-slate-200 block truncate">
                {toolDef ? t(toolDef.titleKey) : taskId}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {toolDef?.isClassical ? t("imageAi.tools.enhance.title") : t("imageAi.options")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {!isSideBySideLayout && (
              <button
                type="button"
                onClick={() => setOptionsCollapsed(!optionsCollapsed)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
                title={optionsCollapsed ? t("imageAi.expandOptions") : t("imageAi.collapseOptions")}
              >
                {optionsCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Options Body (Scrollable, collapsible) */}
        {(!optionsCollapsed || isSideBySideLayout) && (
          <div className="p-3 space-y-3 overflow-y-auto max-h-[32dvh] sm:max-h-[40dvh] flex-1 min-h-0">
            {/* Task: remove-background */}
            {taskId === "remove-background" && (
              <div className="space-y-2.5">
                <label className="flex items-center justify-between text-xs text-slate-300">
                  <span>{t("imageAi.edgeRefinement")}</span>
                  <input
                    type="checkbox"
                    checked={edgeRefinement}
                    onChange={(e) => setEdgeRefinement(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </label>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("imageAi.featherRadius")}</span>
                    <span className="font-mono text-slate-200">{featherRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="1"
                    value={featherRadius}
                    onChange={(e) => setFeatherRadius(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Task: object-remove options */}
            {taskId === "object-remove" && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInpaintTool("brush")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold border transition min-h-[44px] ${
                      inpaintTool === "brush"
                        ? "bg-rose-600 text-white border-rose-500 shadow-md"
                        : "bg-white/5 text-slate-400 border-white/5 hover:text-white"
                    }`}
                  >
                    <Brush className="w-4 h-4" />
                    <span>{t("imageAi.inpaintBrush")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInpaintTool("eraser")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold border transition min-h-[44px] ${
                      inpaintTool === "eraser"
                        ? "bg-rose-600 text-white border-rose-500 shadow-md"
                        : "bg-white/5 text-slate-400 border-white/5 hover:text-white"
                    }`}
                  >
                    <Eraser className="w-4 h-4" />
                    <span>{t("imageAi.eraseMode")}</span>
                  </button>
                </div>

                {/* Brush size slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("imageAi.brushSize")}</span>
                    <span className="font-mono text-slate-200">{inpaintBrushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={inpaintBrushSize}
                    onChange={(e) => setInpaintBrushSize(Number(e.target.value))}
                    className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Undo / Redo for brush strokes */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUndoStroke}
                      disabled={!canUndoStroke}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title={t("imageAi.undo")}
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedoStroke}
                      disabled={!canRedoStroke}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title={t("imageAi.redo")}
                    >
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </div>

                  <span className="text-[10px] text-slate-400">
                    {t("imageAi.touchHint")}
                  </span>
                </div>
              </div>
            )}

            {/* Task: enhance */}
            {taskId === "enhance" && (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("imageAi.denoiseStrength")}</span>
                    <span className="font-mono text-slate-200">{Math.round(denoiseStrength * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={denoiseStrength}
                    onChange={(e) => setDenoiseStrength(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("imageAi.contrastBoost")}</span>
                    <span className="font-mono text-slate-200">{Math.round(contrastBoost * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.0"
                    step="0.05"
                    value={contrastBoost}
                    onChange={(e) => setContrastBoost(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Task: face-enhance */}
            {taskId === "face-enhance" && (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("imageAi.tools.faceEnhance.title")}</span>
                    <span className="font-mono text-slate-200">{Math.round(faceRestoreLevel * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={faceRestoreLevel}
                    onChange={(e) => setFaceRestoreLevel(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Task: upscale */}
            {taskId === "upscale" && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScaleFactor(2)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition min-h-[44px] ${
                      scaleFactor === 2
                        ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md"
                        : "bg-white/5 text-slate-400 border-white/5 hover:text-white"
                    }`}
                  >
                    2X Super Resolution
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleFactor(4)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition min-h-[44px] ${
                      scaleFactor === 4
                        ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md"
                        : "bg-white/5 text-slate-400 border-white/5 hover:text-white"
                    }`}
                  >
                    4X Ultra Resolution
                  </button>
                </div>
              </div>
            )}

            {/* Reprocess / Process button in options */}
            <button
              type="button"
              onClick={handleExecuteTool}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition disabled:opacity-40 min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" />
              <span>{currentResultUrl ? t("imageAi.reprocess") : t("imageAi.processAction")}</span>
            </button>
          </div>
        )}

        {/* 3. Fixed Action Bar (Apply / Cancel / Back to Hub) */}
        <div
          className="flex items-center justify-between gap-2 p-3 bg-[#0c0f16] border-t border-white/10 flex-shrink-0"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {t("imageAi.cancel")}
            </button>
            <button
              type="button"
              onClick={onBackToHub}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-xs font-medium transition min-h-[44px] flex items-center justify-center"
            >
              {t("imageAi.title")}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (currentResultUrl) {
                onApply(currentResultUrl);
              } else {
                toast.info(t("imageAi.processing"));
              }
            }}
            disabled={!currentResultUrl || isProcessing}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl gradient-primary text-white text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition disabled:opacity-40 min-h-[44px]"
          >
            <Check className="w-4 h-4" />
            <span>{t("imageAi.apply")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageAIWorkspace;
