import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  Eye,
  Layers,
  Sparkles,
  Check,
  Download,
} from "lucide-react";
import { playSfx } from "@/lib/soundFx";

export interface ImagePreviewEngineProps {
  originalImage: string;
  processedImage: string;
  originalWidth?: number;
  originalHeight?: number;
  showCheckerboard?: boolean;
  onCheckerboardChange?: (show: boolean) => void;
  aspectRatio?: string;
  className?: string;
  isCutout?: boolean;
  customBgColor?: string;
  customBgImageUrl?: string | null;
  onExportClick?: () => void;
}

export type PreviewMode = "slider" | "processed" | "original" | "side-by-side";

export const ImagePreviewEngine: React.FC<ImagePreviewEngineProps> = ({
  originalImage,
  processedImage,
  originalWidth,
  originalHeight,
  showCheckerboard = true,
  onCheckerboardChange,
  aspectRatio = "4/3",
  className = "",
  isCutout = false,
  customBgColor,
  customBgImageUrl,
  onExportClick,
}) => {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("slider");
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);

  // Zoom & Pan
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);

  // Reset zoom & pan
  const handleResetZoom = useCallback(() => {
    playSfx("click");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Quick preset zooms
  const handleSetZoomLevel = (level: number) => {
    playSfx("click");
    setZoom(level);
    if (level === 1) setPan({ x: 0, y: 0 });
  };

  // Slider dragging logic
  const handleSliderMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  }, []);

  // Touch and Pointer Event Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If double tap
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Toggle 1x -> 2.5x -> 1x
      playSfx("click");
      if (zoom > 1.2) {
        handleResetZoom();
      } else {
        setZoom(2.5);
      }
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      if (previewMode === "slider" && zoom === 1) {
        // If clicking near slider divider
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const clickPercent = ((e.clientX - rect.left) / rect.width) * 100;
          if (Math.abs(clickPercent - sliderPosition) < 8 || e.pointerType === "touch") {
            setIsDraggingSlider(true);
            handleSliderMove(e.clientX);
            return;
          }
        }
      }
      // Otherwise start pan if zoomed
      if (zoom > 1) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    } else if (activePointersRef.current.size === 2) {
      // Pinch to zoom start
      setIsDraggingSlider(false);
      setIsPanning(false);
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      initialPinchDistRef.current = dist;
      initialZoomRef.current = zoom;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2 && initialPinchDistRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const scale = dist / initialPinchDistRef.current;
      const newZoom = Math.min(Math.max(initialZoomRef.current * scale, 1), 5);
      setZoom(newZoom);
      return;
    }

    if (isDraggingSlider) {
      handleSliderMove(e.clientX);
    } else if (isPanning && zoom > 1) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      initialPinchDistRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      setIsDraggingSlider(false);
      setIsPanning(false);
    }
  };

  const checkerboardStyle: React.CSSProperties = showCheckerboard
    ? {
        backgroundImage: `
          linear-gradient(45deg, #1e293b 25%, transparent 25%),
          linear-gradient(-45deg, #1e293b 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #1e293b 75%),
          linear-gradient(-45deg, transparent 75%, #1e293b 75%)
        `,
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        backgroundColor: "#0f172a",
      }
    : customBgColor
    ? { backgroundColor: customBgColor }
    : { backgroundColor: "#090d16" };

  return (
    <div className={`flex flex-col w-full h-full select-none ${className}`}>
      {/* 1. Top Controls Bar: Mode Switcher & Zoom Controls */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md rounded-t-2xl flex-shrink-0">
        {/* View Mode Pills */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setPreviewMode("slider");
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
              previewMode === "slider"
                ? "bg-primary text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            مقارنة (قبل/بعد)
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setPreviewMode("processed");
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
              previewMode === "processed"
                ? "bg-primary text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            النتيجة
          </button>
          <button
            type="button"
            onClick={() => {
              playSfx("click");
              setPreviewMode("original");
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
              previewMode === "original"
                ? "bg-primary text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            الأصل
          </button>
        </div>

        {/* Zoom & Checkerboard Utilities */}
        <div className="flex items-center gap-1.5">
          {isCutout && onCheckerboardChange && (
            <button
              type="button"
              onClick={() => {
                playSfx("click");
                onCheckerboardChange(!showCheckerboard);
              }}
              className={`p-1.5 rounded-lg border transition ${
                showCheckerboard
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
              title="تفعيل خلفية الشفافية (Checkerboard)"
            >
              <Layers className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800/80 text-xs">
            <button
              type="button"
              onClick={() => handleSetZoomLevel(1)}
              className={`px-1.5 py-0.5 rounded font-medium transition ${
                zoom === 1 ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => handleSetZoomLevel(2)}
              className={`px-1.5 py-0.5 rounded font-medium transition ${
                zoom === 2 ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              2x
            </button>
            <button
              type="button"
              onClick={() => handleSetZoomLevel(4)}
              className={`px-1.5 py-0.5 rounded font-medium transition ${
                zoom === 4 ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              4x
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 text-slate-400 hover:text-white"
                title="إعادة تعيين"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Interactive Canvas / Image Display Viewport */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative flex-1 w-full min-h-0 overflow-hidden touch-none cursor-crosshair flex items-center justify-center"
        style={checkerboardStyle}
      >
        {/* Custom background image preview if specified */}
        {customBgImageUrl && isCutout && (
          <img
            src={customBgImageUrl}
            alt="Custom BG"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90"
          />
        )}

        {/* Viewport Transform Layer (Handles Zoom & Pan) */}
        <div
          className="relative w-full h-full flex items-center justify-center transition-transform duration-75"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {/* A. Slider Mode */}
          {previewMode === "slider" && (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* After / Processed Image (Full bottom layer) */}
              <img
                src={processedImage}
                alt="Processed"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />

              {/* Before / Original Image (Clipped overlay) */}
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ width: `${sliderPosition}%` }}
              >
                <img
                  src={originalImage}
                  alt="Original"
                  className="w-full h-full object-contain max-w-none pointer-events-none"
                  style={{
                    width: containerRef.current ? `${containerRef.current.clientWidth}px` : "100%",
                    height: containerRef.current ? `${containerRef.current.clientHeight}px` : "100%",
                  }}
                  draggable={false}
                />
              </div>

              {/* Divider Line & Touch Handle */}
              <div
                className="absolute top-0 bottom-0 z-20 flex items-center justify-center pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="w-0.5 h-full bg-gradient-to-b from-blue-400 via-primary to-purple-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                <div className="absolute w-8 h-8 rounded-full bg-white text-slate-900 border-2 border-primary shadow-xl flex items-center justify-center transform -translate-x-1/2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
            </div>
          )}

          {/* B. Processed Only Mode */}
          {previewMode === "processed" && (
            <img
              src={processedImage}
              alt="Processed"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          )}

          {/* C. Original Only Mode */}
          {previewMode === "original" && (
            <img
              src={originalImage}
              alt="Original"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          )}
        </div>

        {/* Labels Overlay */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between pointer-events-none z-10 text-[11px] font-bold">
          {previewMode === "slider" ? (
            <>
              <span className="px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-slate-300 backdrop-blur-md">
                الأصل (قبل)
              </span>
              <span className="px-2 py-0.5 rounded-md bg-primary/80 border border-primary/40 text-white backdrop-blur-md">
                النتيجة (بعد)
              </span>
            </>
          ) : (
            <span className="px-2.5 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-slate-300 backdrop-blur-md">
              {previewMode === "processed" ? "النتيجة المعالجة بالذكاء الاصطناعي" : "الصورة الأصلية"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewEngine;
