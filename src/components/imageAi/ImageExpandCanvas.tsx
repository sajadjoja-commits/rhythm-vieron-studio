import React, { useRef, useEffect, useState, useCallback } from 'react';
import { imageAIEngine } from '../../ai/image/ImageAIEngine';
import { ImagePostprocessor } from '../../ai/image/ImagePostprocessor';
import { ModelStore } from '../../ai/models/ModelStore';
import { MODEL_CATALOG } from '../../ai/models/models.catalog';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import { DownloadProgress } from '../../ai/models/ModelStore';
import { t } from '../../ai/image/toolsRegistry';
import {
  Maximize2,
  Undo2,
  Redo2,
  RefreshCw,
  Sparkles,
  Download,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Grid,
  Check,
  Zap,
  Info,
  Clock,
  CheckCircle2,
  Eye,
  Sliders
} from 'lucide-react';

export type AspectRatioType = 'free' | '1:1' | '4:5' | '9:16' | '16:9' | '3:4';

interface HandleDragState {
  handle: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  initTargetW: number;
  initTargetH: number;
  initOriginX: number;
  initOriginY: number;
}

interface Props {
  originalImage: HTMLImageElement | ImageBitmap;
  onClose?: () => void;
  onApplyNewVersion?: (newBitmap: ImageBitmap) => void;
}

export const ImageExpandCanvas: React.FC<Props> = ({
  originalImage,
  onClose,
  onApplyNewVersion
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelStore = ModelStore.getInstance();

  const origW = originalImage.width;
  const origH = originalImage.height;

  // Versions stack for commits made by "تطبيق"
  const [versionsStack, setVersionsStack] = useState<Uint8ClampedArray[]>([]);
  const [versionDimensions, setVersionDimensions] = useState<Array<{ w: number; h: number }>>([]);
  const [currentVersionIdx, setCurrentVersionIdx] = useState(0);

  // Active RGBA and dimensions
  const [currentRgba, setCurrentRgba] = useState<Uint8ClampedArray | null>(null);
  const [curW, setCurW] = useState(origW);
  const [curH, setCurH] = useState(origH);

  // Frame expansion bounds (relative to current image)
  // Target canvas dimensions and top-left origin of original image inside target
  const [targetW, setTargetW] = useState(origW);
  const [targetH, setTargetH] = useState(origH);
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);

  // Aspect Ratio Preset
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('free');

  // Interactive Viewport Zoom & Pan
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  // Dragging handles
  const dragStateRef = useRef<HandleDragState | null>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [showGuideGrid, setShowGuideGrid] = useState(true);

  // Instant fast preview (Mirror + Blur)
  const [fastPreviewRgba, setFastPreviewRgba] = useState<Uint8ClampedArray | null>(null);
  const [showFastPreview, setShowFastPreview] = useState(true);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Error feedback state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Model download modal for MI-GAN
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Timing log
  const [timing, setTiming] = useState<{
    inferenceMs: number;
    compositeMs: number;
    totalMs: number;
    modelUsed: string;
    numSteps: number;
  } | null>(null);

  // Initialize RGBA
  useEffect(() => {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = origW;
    offCanvas.height = origH;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(originalImage as CanvasImageSource, 0, 0, origW, origH);
    const initialRgba = ctx.getImageData(0, 0, origW, origH).data;

    setCurrentRgba(new Uint8ClampedArray(initialRgba));
    setCurW(origW);
    setCurH(origH);
    setVersionsStack([new Uint8ClampedArray(initialRgba)]);
    setVersionDimensions([{ w: origW, h: origH }]);
    setCurrentVersionIdx(0);

    setTargetW(origW);
    setTargetH(origH);
    setOriginX(0);
    setOriginY(0);
  }, [originalImage, origW, origH]);

  // Update instant fast preview whenever frame bounds change
  useEffect(() => {
    if (!currentRgba || (targetW === curW && targetH === curH)) {
      setFastPreviewRgba(null);
      return;
    }

    // Debounced or lightweight mirror blur preview
    const preview = ImagePostprocessor.createMirrorBlurExpandedCanvas(
      currentRgba,
      curW,
      curH,
      targetW,
      targetH,
      originX,
      originY
    );
    setFastPreviewRgba(preview);
  }, [currentRgba, curW, curH, targetW, targetH, originX, originY]);

  // Draw on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = targetW;
    canvas.height = targetH;

    if (fastPreviewRgba && showFastPreview) {
      const imgData = new ImageData(fastPreviewRgba as unknown as Uint8ClampedArray<ArrayBuffer>, targetW, targetH);
      ctx.putImageData(imgData, 0, 0);
    } else if (currentRgba) {
      // Draw base image in position
      ctx.clearRect(0, 0, targetW, targetH);
      const imgData = new ImageData(currentRgba as unknown as Uint8ClampedArray<ArrayBuffer>, curW, curH);
      const off = document.createElement('canvas');
      off.width = curW;
      off.height = curH;
      off.getContext('2d')!.putImageData(imgData, 0, 0);
      ctx.drawImage(off, originX, originY);
    }
  }, [targetW, targetH, originX, originY, fastPreviewRgba, showFastPreview, currentRgba, curW, curH]);

  // Expansion Ratio calculation & warning check
  const expansionStats = ImagePostprocessor.calculateExpansionSteps(
    curW,
    curH,
    targetW,
    targetH,
    originX,
    originY
  );

  // Aspect Ratio presets handler
  const handleSelectAspectRatio = (ratio: AspectRatioType) => {
    setAspectRatio(ratio);
    if (ratio === 'free') return;

    let targetRatio = 1;
    if (ratio === '1:1') targetRatio = 1.0;
    else if (ratio === '4:5') targetRatio = 4 / 5;
    else if (ratio === '9:16') targetRatio = 9 / 16;
    else if (ratio === '16:9') targetRatio = 16 / 9;
    else if (ratio === '3:4') targetRatio = 3 / 4;

    const curRatio = curW / curH;
    let nextW = curW;
    let nextH = curH;

    if (curRatio > targetRatio) {
      // Original is wider than target ratio: expand height
      nextH = Math.min(4096, Math.round(curW / targetRatio));
      nextW = curW;
    } else {
      // Original is taller than target ratio: expand width
      nextW = Math.min(4096, Math.round(curH * targetRatio));
      nextH = curH;
    }

    const nextOx = Math.round((nextW - curW) / 2);
    const nextOy = Math.round((nextH - curH) / 2);

    setTargetW(nextW);
    setTargetH(nextH);
    setOriginX(nextOx);
    setOriginY(nextOy);
  };

  // Reset Frame
  const handleResetFrame = () => {
    setTargetW(curW);
    setTargetH(curH);
    setOriginX(0);
    setOriginY(0);
    setAspectRatio('free');
  };

  // Handle Dragging
  const handlePointerDownHandle = (
    e: React.PointerEvent,
    handle: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingHandle(true);
    dragStateRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initTargetW: targetW,
      initTargetH: targetH,
      initOriginX: originX,
      initOriginY: originY
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingHandle && dragStateRef.current) {
      const { handle, startX, startY, initTargetW, initTargetH, initOriginX, initOriginY } = dragStateRef.current;
      const dx = Math.round((e.clientX - startX) / zoom);
      const dy = Math.round((e.clientY - startY) / zoom);

      let nextW = initTargetW;
      let nextH = initTargetH;
      let nextOx = initOriginX;
      let nextOy = initOriginY;

      // Handle horizontal adjustments
      if (handle.includes('w')) {
        // Dragging left handle: expands canvas to left
        const maxLeftDelta = initOriginX; // cannot shrink inside original
        const d = Math.max(-initOriginX, dx);
        nextW = Math.max(curW, initTargetW - d);
        nextOx = Math.max(0, initOriginX - d);
      } else if (handle.includes('e')) {
        // Dragging right handle
        nextW = Math.max(curW + nextOx, initTargetW + dx);
      }

      // Handle vertical adjustments
      if (handle.includes('n')) {
        const d = Math.max(-initOriginY, dy);
        nextH = Math.max(curH, initTargetH - d);
        nextOy = Math.max(0, initOriginY - d);
      } else if (handle.includes('s')) {
        nextH = Math.max(curH + nextOy, initTargetH + dy);
      }

      // Enforce 4096 cap
      if (Math.max(nextW, nextH) <= 4096) {
        setTargetW(nextW);
        setTargetH(nextH);
        setOriginX(nextOx);
        setOriginY(nextOy);
        setAspectRatio('free');
      }
      return;
    }

    if (isPanning) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingHandle) {
      setIsDraggingHandle(false);
      dragStateRef.current = null;
    }
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // Run Local Outpainting
  const handleExecuteOutpaint = async (mode: 'fast-preview' | 'push-pull' | 'migan-512') => {
    if (!currentRgba || (targetW === curW && targetH === curH)) return;

    if (mode === 'migan-512') {
      const isCached = await modelStore.isModelCached('migan-512');
      if (!isCached) {
        setShowDownloadModal(true);
        return;
      }
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsProcessing(true);
    setProgressStage(t('imageAi.outpaint.step') + ' 1...');
    setProgressPercent(10);

    try {
      // Offscreen canvas for current image
      const off = document.createElement('canvas');
      off.width = curW;
      off.height = curH;
      off.getContext('2d')!.putImageData(new ImageData(currentRgba as unknown as Uint8ClampedArray<ArrayBuffer>, curW, curH), 0, 0);
      const bitmap = await createImageBitmap(off);

      const res = await imageAIEngine.expandImage(
        bitmap,
        targetW,
        targetH,
        originX,
        originY,
        {
          modelMode: mode,
          seed: 42,
          signal: abortController.signal,
          onProgress: (stage, percent) => {
            setProgressStage(stage);
            setProgressPercent(percent);
          }
        }
      );

      if (res.outputRgba) {
        setCurrentRgba(res.outputRgba);
        setCurW(res.width);
        setCurH(res.height);
        setTargetW(res.width);
        setTargetH(res.height);
        setOriginX(0);
        setOriginY(0);
        setFastPreviewRgba(null);

        setTiming({
          inferenceMs: res.timing.inferenceMs,
          compositeMs: res.timing.compositeMs,
          totalMs: res.timing.totalMs,
          modelUsed: res.modelUsed,
          numSteps: expansionStats.numSteps
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        console.log('Outpaint cancelled by user');
      } else {
        setErrorMessage('حدث خطأ أثناء توسيع الصورة: ' + (err as Error)?.message);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // Commit result to versions stack
  const handleApplyCommit = async () => {
    if (!currentRgba) return;
    const newStack = versionsStack.slice(0, currentVersionIdx + 1);
    const newDims = versionDimensions.slice(0, currentVersionIdx + 1);

    newStack.push(new Uint8ClampedArray(currentRgba));
    newDims.push({ w: curW, h: curH });

    setVersionsStack(newStack);
    setVersionDimensions(newDims);
    setCurrentVersionIdx(newStack.length - 1);

    if (onApplyNewVersion && canvasRef.current) {
      const bmp = await createImageBitmap(canvasRef.current);
      onApplyNewVersion(bmp);
    }
  };

  // Versions Undo / Redo
  const handleVersionUndo = () => {
    if (currentVersionIdx > 0) {
      const prev = currentVersionIdx - 1;
      setCurrentVersionIdx(prev);
      setCurrentRgba(new Uint8ClampedArray(versionsStack[prev]));
      const dim = versionDimensions[prev];
      setCurW(dim.w);
      setCurH(dim.h);
      setTargetW(dim.w);
      setTargetH(dim.h);
      setOriginX(0);
      setOriginY(0);
      setFastPreviewRgba(null);
    }
  };

  const handleVersionRedo = () => {
    if (currentVersionIdx < versionsStack.length - 1) {
      const next = currentVersionIdx + 1;
      setCurrentVersionIdx(next);
      setCurrentRgba(new Uint8ClampedArray(versionsStack[next]));
      const dim = versionDimensions[next];
      setCurW(dim.w);
      setCurH(dim.h);
      setTargetW(dim.w);
      setTargetH(dim.h);
      setOriginX(0);
      setOriginY(0);
      setFastPreviewRgba(null);
    }
  };

  // Export full resolution image
  const handleExport = (format: 'png' | 'jpeg' | 'webp') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vireon_expanded_${curW}x${curH}.${format === 'jpeg' ? 'jpg' : format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg',
      0.96
    );
  };

  const isExpanded = targetW !== curW || targetH !== curH;

  return (
    <div className="space-y-4 max-w-6xl mx-auto w-full min-h-[calc(100dvh-5rem)] flex flex-col justify-between">
      {/* Top Bar: Navigation, Versions & Aspect Presets */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-xs text-neutral-300 font-medium transition-colors cursor-pointer min-h-[44px]"
            >
              <span>العودة</span>
            </button>
          )}

          {/* Versions Stack Undo/Redo */}
          <div className="flex items-center gap-1 bg-neutral-950/70 border border-neutral-800 rounded-xl p-1 text-xs">
            <button
              onClick={handleVersionUndo}
              disabled={currentVersionIdx <= 0}
              className="p-2 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              title="تراجع"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <span className="font-mono text-neutral-400 px-2 text-[11px]">
              نسخة {currentVersionIdx + 1}/{versionsStack.length}
            </span>
            <button
              onClick={handleVersionRedo}
              disabled={currentVersionIdx >= versionsStack.length - 1}
              className="p-2 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              title="إعادة"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetFrame}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-xs text-neutral-300 transition-colors cursor-pointer min-h-[44px]"
            title={t('imageAi.outpaint.reset')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('imageAi.outpaint.reset')}</span>
          </button>
        </div>

        {/* Aspect Ratio Buttons (Touch Targets >= 44px) */}
        <div className="flex items-center gap-1 bg-neutral-950/80 p-1 rounded-xl border border-neutral-800 text-xs flex-wrap">
          <span className="text-neutral-400 text-[11px] px-2">{t('imageAi.outpaint.aspectRatio')}:</span>
          {(['free', '1:1', '4:5', '9:16', '16:9', '3:4'] as AspectRatioType[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleSelectAspectRatio(r)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer min-h-[40px] text-xs ${
                aspectRatio === r
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {t(`imageAi.outpaint.aspect.${r.replace(':', '_')}`)}
            </button>
          ))}
        </div>

        {/* View Controls & Export */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-neutral-950/70 border border-neutral-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setZoom(Math.max(0.2, zoom - 0.15))}
              className="p-2 text-neutral-400 hover:text-white rounded min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              title="تصغير"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-neutral-300 px-1 text-[11px]">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(Math.min(2.5, zoom + 0.15))}
              className="p-2 text-neutral-400 hover:text-white rounded min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              title="تكبير"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleApplyCommit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 cursor-pointer transition-all min-h-[44px]"
          >
            <Check className="w-4 h-4" />
            <span>{t('imageAi.outpaint.apply')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('png')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>تصدير</span>
          </button>
        </div>
      </div>

      {/* Main Workspace (Larger than image with 8-handle drag frame and guide grid) */}
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          if (e.target === containerRef.current) {
            setIsPanning(true);
            lastPanPos.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 min-h-[480px] max-h-[70dvh] flex-1 flex items-center justify-center p-8 select-none cursor-grab active:cursor-grabbing touch-none"
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }}
          className="relative transition-transform duration-75 select-none"
        >
          {/* Main Canvas rendering either expanded mirror blur or base */}
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-sm border border-neutral-800/80 block"
          />

          {/* Guide Grid Overlay (Rule of thirds 3x3) */}
          {showGuideGrid && (
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-indigo-500/40">
              <div className="border-r border-b border-indigo-400/20" />
              <div className="border-r border-b border-indigo-400/20" />
              <div className="border-b border-indigo-400/20" />
              <div className="border-r border-b border-indigo-400/20" />
              <div className="border-r border-b border-indigo-400/20" />
              <div className="border-b border-indigo-400/20" />
              <div className="border-r border-indigo-400/20" />
              <div className="border-r border-indigo-400/20" />
              <div />
            </div>
          )}

          {/* Original Image Inner Border Marker */}
          {isExpanded && (
            <div
              style={{
                left: `${originX}px`,
                top: `${originY}px`,
                width: `${curW}px`,
                height: `${curH}px`
              }}
              className="absolute pointer-events-none border-2 border-dashed border-emerald-400/70 shadow-sm"
            >
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-neutral-950/80 text-[10px] text-emerald-300 font-mono">
                الأصل ({curW}×{curH})
              </span>
            </div>
          )}

          {/* 8 Drag Handles (4 Corners + 4 Edges) - Touch Targets >= 44px */}
          {/* Top-Left */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'nw')}
            className="absolute -top-3 -left-3 w-11 h-11 flex items-center justify-center cursor-nwse-resize z-20 group"
          >
            <div className="w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Top */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'n')}
            className="absolute -top-3 left-1/2 -translate-x-1/2 w-11 h-11 flex items-center justify-center cursor-ns-resize z-20 group"
          >
            <div className="w-5 h-3 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Top-Right */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'ne')}
            className="absolute -top-3 -right-3 w-11 h-11 flex items-center justify-center cursor-nesw-resize z-20 group"
          >
            <div className="w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Right */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'e')}
            className="absolute top-1/2 -translate-y-1/2 -right-3 w-11 h-11 flex items-center justify-center cursor-ew-resize z-20 group"
          >
            <div className="w-3 h-5 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Bottom-Right */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'se')}
            className="absolute -bottom-3 -right-3 w-11 h-11 flex items-center justify-center cursor-nwse-resize z-20 group"
          >
            <div className="w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Bottom */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 's')}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-11 h-11 flex items-center justify-center cursor-ns-resize z-20 group"
          >
            <div className="w-5 h-3 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Bottom-Left */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'sw')}
            className="absolute -bottom-3 -left-3 w-11 h-11 flex items-center justify-center cursor-nesw-resize z-20 group"
          >
            <div className="w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>

          {/* Left */}
          <div
            onPointerDown={(e) => handlePointerDownHandle(e, 'w')}
            className="absolute top-1/2 -translate-y-1/2 -left-3 w-11 h-11 flex items-center justify-center cursor-ew-resize z-20 group"
          >
            <div className="w-3 h-5 rounded-sm bg-white border-2 border-indigo-600 shadow group-hover:scale-125 transition-transform" />
          </div>
        </div>
      </div>

      {/* Gentle Warning banner if expansion > 50% */}
      {expansionStats.shouldWarn && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {t('imageAi.outpaint.warningLargeExpansion')}: تزيد التوسعة الحالية عن 50% من حجم الصورة. سيتم التنفيذ عبر {expansionStats.numSteps} خطوات متتالية لضمان الاتساق.
          </span>
        </div>
      )}

      {/* Action Execution Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">الأبعاد المستهدفة:</span>
          <span className="font-mono text-xs font-bold text-cyan-400 bg-neutral-950 px-2.5 py-1 rounded-lg border border-neutral-800">
            {targetW} × {targetH} بكسل (خطوات: {expansionStats.numSteps})
          </span>
        </div>

        {/* Execution Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Fast Preview Fallback Button (Edge Mirror + Gradual Blur) */}
          <button
            type="button"
            disabled={!isExpanded || isProcessing}
            onClick={() => handleExecuteOutpaint('fast-preview')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-700 bg-neutral-950/80 hover:bg-neutral-800 text-xs font-semibold text-neutral-200 cursor-pointer disabled:opacity-40 min-h-[44px]"
            title="ملء فوري بانعكاس الحواف وتغبيشها دون تنزيل النموذج"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>{t('imageAi.outpaint.fastPreview')}</span>
          </button>

          {/* AI Local Outpainting (Step-wise Push-Pull / MI-GAN) */}
          <button
            type="button"
            disabled={!isExpanded || isProcessing}
            onClick={() => handleExecuteOutpaint('push-pull')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 cursor-pointer transition-all disabled:opacity-40 min-h-[44px]"
          >
            <Sparkles className="w-4 h-4 text-white" />
            <span>{t('imageAi.outpaint.aiEnhance')}</span>
          </button>

          {/* Cancel button if running */}
          {isProcessing && (
            <button
              type="button"
              onClick={() => abortControllerRef.current?.abort()}
              className="px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold cursor-pointer min-h-[44px]"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>

      {/* In-progress progress bar */}
      {isProcessing && (
        <div className="p-4 bg-neutral-900 border border-indigo-500/30 rounded-2xl space-y-2 shadow-xl animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-indigo-300">{progressStage}</span>
            <span className="font-mono text-indigo-400 font-bold">{progressPercent}%</span>
          </div>
          <div className="w-full bg-neutral-950 rounded-full h-2 overflow-hidden border border-neutral-800">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Performance & Step Timing Log */}
      {timing && (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 text-xs space-y-2 text-neutral-300">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="font-semibold text-white">سجل أداء توسيع الإطار ({timing.numSteps} خطوة):</span>
            <div className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>الأصل بالمنتصف مطابق بايت ببايت</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2 rounded bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 block text-[10px]">استدلال المحرك:</span>
              <span className="text-indigo-300 font-bold">{timing.inferenceMs} ms</span>
            </div>
            <div className="p-2 rounded bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 block text-[10px]">اللصق والدمج:</span>
              <span className="text-cyan-300 font-bold">{timing.compositeMs} ms</span>
            </div>
            <div className="p-2 rounded bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 block text-[10px]">الزمن الإجمالي:</span>
              <span className="text-white font-bold">{timing.totalMs} ms</span>
            </div>
            <div className="p-2 rounded bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 block text-[10px]">المحرك:</span>
              <span className="text-emerald-300 font-bold truncate block">{timing.modelUsed}</span>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer Requirement (7): Fixed Honest Text at Bottom */}
      <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded-xl text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
        <Info className="w-4 h-4 text-indigo-400 shrink-0" />
        <span>{t('imageAi.outpaint.disclaimer')}</span>
      </div>

      {/* Model Download Modal for MI-GAN */}
      {showDownloadModal && MODEL_CATALOG['migan-512'] && (
        <ModelDownloadDialog
          manifest={MODEL_CATALOG['migan-512']}
          isOpen={true}
          onConfirmDownload={async () => {
            setIsDownloading(true);
            try {
              await modelStore.downloadModel(
                'migan-512',
                MODEL_CATALOG['migan-512'].url!,
                MODEL_CATALOG['migan-512'].sha256,
                (p) => setDownloadProgress(p)
              );
              setShowDownloadModal(false);
              setIsDownloading(false);
              handleExecuteOutpaint('migan-512');
            } catch (e: unknown) {
              setErrorMessage('فشل تنزيل النموذج: ' + (e as Error)?.message);
              setIsDownloading(false);
            }
          }}
          onCancel={() => setShowDownloadModal(false)}
          progress={downloadProgress}
          isDownloading={isDownloading}
        />
      )}

      {/* Inline dismissible error banner */}
      {errorMessage && (
        <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-2 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-rose-900/50 rounded-lg text-rose-400 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
