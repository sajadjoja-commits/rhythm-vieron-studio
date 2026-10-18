import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InferenceResult } from '../../ai/image/ImageInferenceEngine';
import { BackgroundPreviewBar, BackgroundConfig } from './BackgroundPreviewBar';
import { MaskBrushEditor, ToolMode } from './MaskBrushEditor';
import { PerformanceMetrics } from './PerformanceMetrics';
import { ImageWorkerManager } from '../../ai/image/ImageWorkerManager';
import { ImagePostprocessor } from '../../ai/image/ImagePostprocessor';
import { AIService } from '../../services/ai/AIService';
import { Download, RefreshCw, ZoomIn, ZoomOut, Maximize2, SplitSquareVertical } from 'lucide-react';

interface Props {
  originalImage: HTMLImageElement | ImageBitmap;
  initialResult: InferenceResult;
  onReset: () => void;
}

export const BackgroundRemovalResult: React.FC<Props> = ({
  originalImage,
  initialResult,
  onReset
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiService = AIService.getInstance();
  const workerManager = ImageWorkerManager.getInstance();

  // Mask state & history for Undo/Redo
  const [currentMask, setCurrentMask] = useState<Float32Array>(initialResult.mask);
  const [history, setHistory] = useState<Float32Array[]>([initialResult.mask]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Background configuration state
  const [bgConfig, setBgConfig] = useState<BackgroundConfig>({ type: 'transparent' });

  // Tool & Brush state
  const [activeTool, setActiveTool] = useState<ToolMode>('none');
  const [brushRadius, setBrushRadius] = useState(25);
  const [brushHardness, setBrushHardness] = useState(0.7);
  const [isDrawing, setIsDrawing] = useState(false);
  const strokePointsRef = useRef<Array<{ x: number; y: number }>>([]);

  // View & Comparison state
  const [zoom, setZoom] = useState(1);
  const [splitPosition, setSplitPosition] = useState(50); // Split comparison percentage
  const [showSplit, setShowSplit] = useState(false);
  const [showOriginalOverlay, setShowOriginalOverlay] = useState(false);
  const [previewMode, setPreviewMode] = useState<'checkerboard' | 'solid-black' | 'solid-white'>('checkerboard');

  // Stored original RGBA for fast compositing
  const origRgbaRef = useRef<Uint8ClampedArray | null>(null);
  const width = initialResult.width;
  const height = initialResult.height;

  // Extract original RGBA once
  useEffect(() => {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (offCtx) {
      offCtx.drawImage(originalImage as CanvasImageSource, 0, 0, width, height);
      origRgbaRef.current = offCtx.getImageData(0, 0, width, height).data;
    }
  }, [originalImage, width, height]);

  // Re-render canvas whenever mask, background config, or split changes
  const renderComposite = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !origRgbaRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // 1. Draw Background
    if (bgConfig.type === 'color' && bgConfig.color) {
      ctx.fillStyle = bgConfig.color;
      ctx.fillRect(0, 0, width, height);
    } else if (bgConfig.type === 'gradient' && bgConfig.gradient) {
      const g = bgConfig.gradient;
      const angleRad = (g.angle * Math.PI) / 180;
      const x1 = width / 2 - Math.cos(angleRad) * (width / 2);
      const y1 = height / 2 - Math.sin(angleRad) * (height / 2);
      const x2 = width / 2 + Math.cos(angleRad) * (width / 2);
      const y2 = height / 2 + Math.sin(angleRad) * (height / 2);

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, g.from);
      grad.addColorStop(1, g.to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (bgConfig.type === 'bokeh') {
      // Blurred original image as background
      ctx.save();
      ctx.filter = `blur(${bgConfig.blurRadius || 18}px)`;
      ctx.drawImage(originalImage as CanvasImageSource, -20, -20, width + 40, height + 40);
      ctx.restore();
    } else if (bgConfig.type === 'image' && bgConfig.customImageUrl) {
      const img = new Image();
      img.src = bgConfig.customImageUrl;
      if (img.complete) {
        ctx.drawImage(img, 0, 0, width, height);
      }
    } else {
      // Transparent (Clear rect)
      ctx.clearRect(0, 0, width, height);
    }

    // 2. Render Decontaminated Foreground using currentMask
    const cleanRgba = ImagePostprocessor.decontaminate(origRgbaRef.current, currentMask, width, height);
    const fgImageData = new ImageData(cleanRgba as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);

    // Temp canvas for foreground layer
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = width;
    fgCanvas.height = height;
    const fgCtx = fgCanvas.getContext('2d')!;
    fgCtx.putImageData(fgImageData, 0, 0);

    if (showSplit) {
      // Split mode: Left side original, right side removed background
      const splitX = Math.round((width * splitPosition) / 100);
      ctx.drawImage(fgCanvas, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, height);
      ctx.clip();
      ctx.drawImage(originalImage as CanvasImageSource, 0, 0, width, height);
      ctx.restore();

      // Divider line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, height);
      ctx.stroke();
    } else if (showOriginalOverlay) {
      // Semi-transparent original overlay for alignment check
      ctx.drawImage(fgCanvas, 0, 0);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(originalImage as CanvasImageSource, 0, 0, width, height);
      ctx.globalAlpha = 1.0;
    } else {
      ctx.drawImage(fgCanvas, 0, 0);
    }
  }, [width, height, bgConfig, currentMask, showSplit, splitPosition, showOriginalOverlay, originalImage]);

  useEffect(() => {
    renderComposite();
  }, [renderComposite]);

  // Push new mask state to history stack
  const pushMaskState = (newMask: Float32Array) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newMask);
    if (nextHistory.length > 20) nextHistory.shift(); // Max 20 undo steps
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setCurrentMask(newMask);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentMask(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentMask(history[historyIndex + 1]);
    }
  };

  // Convert canvas mouse/touch event coordinates to native image pixel coordinates
  const getImageCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, normX: 0, normY: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const imgX = Math.round(clientX * scaleX);
    const imgY = Math.round(clientY * scaleY);
    return {
      x: Math.max(0, Math.min(width - 1, imgX)),
      y: Math.max(0, Math.min(height - 1, imgY)),
      normX: Math.max(0, Math.min(1, clientX / rect.width)),
      normY: Math.max(0, Math.min(1, clientY / rect.height))
    };
  };

  // Pointer Handlers for Manual Brush and Magic Touch
  const handlePointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, normX, normY } = getImageCoordinates(e);

    if (activeTool === 'magic-touch') {
      // Magic Touch: Interactive segmenter tap
      try {
        const touchRes = await aiService.segmentObjectAtPoint(
          canvasRef.current!,
          normX,
          normY
        );
        if (touchRes && touchRes.mask) {
          const upscaled = ImagePostprocessor.upscaleMaskBilinear(
            touchRes.mask,
            touchRes.width,
            touchRes.height,
            width,
            height
          );
          pushMaskState(upscaled);
        }
      } catch (err) {
        console.warn('Interactive segmenter error:', err);
      }
      return;
    }

    if (activeTool === 'brush-add' || activeTool === 'brush-erase') {
      setIsDrawing(true);
      strokePointsRef.current = [{ x, y }];
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getImageCoordinates(e);
    strokePointsRef.current.push({ x, y });

    // Live stroke application on current mask
    if (strokePointsRef.current.length % 3 === 0) {
      applyCurrentStroke(false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing) {
      setIsDrawing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      applyCurrentStroke(true);
      strokePointsRef.current = [];
    }
  };

  const applyCurrentStroke = (commitToHistory: boolean) => {
    if (strokePointsRef.current.length === 0) return;
    const mode = activeTool === 'brush-add' ? 'add' : 'erase';

    // Apply fast local brush modification
    const updated = new Float32Array(currentMask);
    const r = brushRadius;
    const rSq = r * r;
    const targetVal = mode === 'add' ? 1.0 : 0.0;
    const innerRSq = rSq * Math.max(0, brushHardness * brushHardness);

    for (const pt of strokePointsRef.current) {
      const xMin = Math.max(0, Math.floor(pt.x - r));
      const xMax = Math.min(width - 1, Math.ceil(pt.x + r));
      const yMin = Math.max(0, Math.floor(pt.y - r));
      const yMax = Math.min(height - 1, Math.ceil(pt.y + r));

      for (let y = yMin; y <= yMax; y++) {
        const row = y * width;
        for (let x = xMin; x <= xMax; x++) {
          const dSq = (x - pt.x) * (x - pt.x) + (y - pt.y) * (y - pt.y);
          if (dSq <= rSq) {
            const idx = row + x;
            let factor = 1.0;
            if (dSq > innerRSq && rSq > innerRSq) {
              factor = 1.0 - (dSq - innerRSq) / (rSq - innerRSq);
            }
            const cur = updated[idx];
            updated[idx] = cur + (targetVal - cur) * factor;
          }
        }
      }
    }

    if (commitToHistory) {
      pushMaskState(updated);
    } else {
      setCurrentMask(updated);
    }
  };

  // High Resolution Export Handler (Zero DataURL Memory Spikes)
  const handleExport = async (format: 'png' | 'webp' | 'jpeg') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `vireon_bg_removed_${width}x${height}.${format === 'jpeg' ? 'jpg' : format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      },
      format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg',
      0.95
    );
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto w-full">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-xs text-neutral-300 font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>صورة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSplit(!showSplit)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              showSplit
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'border-neutral-800 hover:bg-neutral-800 text-neutral-300'
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>مقارنة منقسمة (قبل/بعد)</span>
          </button>
        </div>

        {/* Zoom & Canvas controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-neutral-950/70 border border-neutral-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
              className="p-1 text-neutral-400 hover:text-white rounded"
              title="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-neutral-300 px-1 text-[11px]">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              className="p-1 text-neutral-400 hover:text-white rounded"
              title="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 text-neutral-400 hover:text-white rounded"
              title="إعادة ضبط"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleExport('png')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
            >
              <Download className="w-4 h-4" />
              <span>تصدير PNG شفاف ({width}×{height})</span>
            </button>
            <button
              onClick={() => handleExport('jpeg')}
              className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium cursor-pointer transition-colors"
            >
              JPG
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-2xl border border-neutral-800/80 min-h-[460px] flex items-center justify-center p-4 select-none ${
          previewMode === 'checkerboard'
            ? 'bg-checkerboard'
            : previewMode === 'solid-white'
            ? 'bg-white'
            : 'bg-black'
        }`}
      >
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="transition-transform duration-75 relative"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`max-w-full max-h-[70vh] object-contain shadow-2xl rounded-lg touch-none ${
              activeTool === 'magic-touch'
                ? 'cursor-crosshair'
                : activeTool === 'brush-add' || activeTool === 'brush-erase'
                ? 'cursor-pointer'
                : 'cursor-default'
            }`}
          />
        </div>

        {/* Split comparison slider bar overlay */}
        {showSplit && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/90 border border-neutral-800 px-4 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md text-xs shadow-xl">
            <span className="text-neutral-400">تحكم بالانقسام:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={splitPosition}
              onChange={(e) => setSplitPosition(parseInt(e.target.value, 10))}
              className="w-40 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-neutral-200">{splitPosition}%</span>
          </div>
        )}
      </div>

      {/* Edge Brush & Manual Refinement Toolbar */}
      <MaskBrushEditor
        activeTool={activeTool}
        onToolChange={setActiveTool}
        brushRadius={brushRadius}
        onBrushRadiusChange={setBrushRadius}
        brushHardness={brushHardness}
        onBrushHardnessChange={setBrushHardness}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showOriginalOverlay={showOriginalOverlay}
        onToggleOverlay={() => setShowOriginalOverlay(!showOriginalOverlay)}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
      />

      {/* New Background Instant Replacements Bar */}
      <BackgroundPreviewBar config={bgConfig} onChange={setBgConfig} />

      {/* Real-time Performance & Timing Metrics */}
      <PerformanceMetrics timing={initialResult.timing} modelUsed={initialResult.modelUsed} />
    </div>
  );
};
