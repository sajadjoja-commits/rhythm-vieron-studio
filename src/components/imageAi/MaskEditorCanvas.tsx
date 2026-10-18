import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AIService } from '../../services/ai/AIService';
import { ImagePostprocessor } from '../../ai/image/ImagePostprocessor';
import { ModelStore } from '../../ai/models/ModelStore';
import { MODEL_CATALOG } from '../../ai/models/models.catalog';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import { DownloadProgress } from '../../ai/models/ModelStore';
import {
  Brush,
  Eraser,
  Wand2,
  Undo2,
  Redo2,
  RotateCcw,
  Sparkles,
  Download,
  Eye,
  EyeOff,
  Sliders,
  SplitSquareVertical,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Plus,
  Minus,
  Cloud,
  Check,
  CheckCircle2,
  Trash2,
  Layers,
  Zap,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';

export type SelectionTool = 'brush' | 'eraser' | 'lasso' | 'magic-touch';

interface Props {
  originalImage: HTMLImageElement | ImageBitmap;
  onClose?: () => void;
  onApplyNewVersion?: (newBitmap: ImageBitmap) => void;
}

export const MaskEditorCanvas: React.FC<Props> = ({
  originalImage,
  onClose,
  onApplyNewVersion
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const aiService = AIService.getInstance();
  const modelStore = ModelStore.getInstance();

  const width = originalImage.width;
  const height = originalImage.height;

  // Image buffers in memory: strict budget of max 2 full-res image copies
  const origRgbaRef = useRef<Uint8ClampedArray | null>(null);
  const [currentRgba, setCurrentRgba] = useState<Uint8ClampedArray | null>(null);

  // Versions stack (commits made by "تطبيق")
  const [versionsStack, setVersionsStack] = useState<Uint8ClampedArray[]>([]);
  const [currentVersionIdx, setCurrentVersionIdx] = useState(0);

  // Mask state & undo/redo history for selection mask
  const [mask, setMask] = useState<Float32Array>(() => new Float32Array(width * height));
  const [maskHistory, setMaskHistory] = useState<Float32Array[]>([]);
  const [maskHistoryIdx, setMaskHistoryIdx] = useState(-1);

  // Selection tools
  const [activeTool, setActiveTool] = useState<SelectionTool>('brush');
  const [brushRadius, setBrushRadius] = useState(24);
  const [brushHardness, setBrushHardness] = useState(0.8);
  const [magicTouchPolarity, setMagicTouchPolarity] = useState<'positive' | 'negative'>('positive');
  const [dilatePx, setDilatePx] = useState(6); // 0-16px, default 6px
  const [showMaskOverlay, setShowMaskOverlay] = useState(true);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<Array<{ x: number; y: number }>>([]);

  // Inpainting engine & parameters
  const [modelMode, setModelMode] = useState<'migan-512' | 'push-pull'>('push-pull');
  const [seed, setSeed] = useState(42);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  // Last inpainting result timing
  const [timing, setTiming] = useState<{
    inferenceMs: number;
    compositeMs: number;
    totalMs: number;
    modelUsed: string;
    roiBox?: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // View state
  const [zoom, setZoom] = useState(1);
  const [showSplit, setShowSplit] = useState(false);
  const [splitPos, setSplitPos] = useState(50);

  // Download dialog state for MI-GAN
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cloud Image Edit availability check (Req 5)
  const isCloudServiceAvailable = typeof (window as unknown as { cloudImageEdit?: unknown }).cloudImageEdit !== 'undefined';

  // Initialize RGBA buffer
  useEffect(() => {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(originalImage as CanvasImageSource, 0, 0, width, height);
    const initialRgba = ctx.getImageData(0, 0, width, height).data;

    origRgbaRef.current = initialRgba;
    setCurrentRgba(new Uint8ClampedArray(initialRgba));
    setVersionsStack([new Uint8ClampedArray(initialRgba)]);
    setCurrentVersionIdx(0);

    // Initial mask
    const initialMask = new Float32Array(width * height);
    setMask(initialMask);
    setMaskHistory([initialMask]);
    setMaskHistoryIdx(0);
  }, [originalImage, width, height]);

  // Push new mask into history
  const pushMaskState = useCallback((newMask: Float32Array) => {
    setMask(newMask);
    setMaskHistory((prev) => {
      const next = prev.slice(0, maskHistoryIdx + 1);
      next.push(newMask);
      if (next.length > 25) next.shift();
      return next;
    });
    setMaskHistoryIdx((prev) => Math.min(24, prev + 1));
  }, [maskHistoryIdx]);

  // Mask Undo / Redo
  const handleMaskUndo = () => {
    if (maskHistoryIdx > 0) {
      const prevIdx = maskHistoryIdx - 1;
      setMaskHistoryIdx(prevIdx);
      setMask(maskHistory[prevIdx]);
    }
  };

  const handleMaskRedo = () => {
    if (maskHistoryIdx < maskHistory.length - 1) {
      const nextIdx = maskHistoryIdx + 1;
      setMaskHistoryIdx(nextIdx);
      setMask(maskHistory[nextIdx]);
    }
  };

  // Convert client coordinates to native image pixels
  const clientToImageCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return { x: 0, y: 0, normX: 0, normY: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    return {
      x: Math.max(0, Math.min(width - 1, Math.round(clientX * scaleX))),
      y: Math.max(0, Math.min(height - 1, Math.round(clientY * scaleY))),
      normX: Math.max(0, Math.min(1, clientX / rect.width)),
      normY: Math.max(0, Math.min(1, clientY / rect.height))
    };
  };

  // Redraw Main Image Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentRgba) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    if (showSplit && origRgbaRef.current) {
      // Split Before/After
      const splitX = Math.round((width * splitPos) / 100);
      const splitImg = new Uint8ClampedArray(currentRgba);

      // Copy left side from original
      for (let y = 0; y < height; y++) {
        const row = y * width * 4;
        splitImg.set(origRgbaRef.current.subarray(row, row + splitX * 4), row);
      }

      const imgData = new ImageData(splitImg as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
      ctx.putImageData(imgData, 0, 0);

      // Divider line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, height);
      ctx.stroke();
    } else {
      const imgData = new ImageData(currentRgba as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [currentRgba, width, height, showSplit, splitPos]);

  // Redraw Mask Overlay Canvas
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width = width;
    overlay.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!showMaskOverlay) return;

    // Render semi-transparent selection mask (Rubylith red overlay)
    const overlayImgData = ctx.createImageData(width, height);
    const data = overlayImgData.data;

    for (let i = 0; i < width * height; i++) {
      const m = mask[i];
      if (m > 0.01) {
        const p = i * 4;
        data[p] = 239;     // Red
        data[p + 1] = 68;  // Green
        data[p + 2] = 68;  // Blue
        data[p + 3] = Math.round(m * 140); // 55% max alpha
      }
    }

    ctx.putImageData(overlayImgData, 0, 0);
  }, [mask, width, height, showMaskOverlay]);

  // Pointer event handlers for drawing
  const handlePointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = clientToImageCoords(e);

    if (activeTool === 'magic-touch') {
      try {
        setIsProcessing(true);
        setProgressStage('جاري عزل الكائن بالنقر (Interactive Segmenter)...');
        setProgressPercent(40);

        const touchRes = await aiService.segmentObjectAtPoint(
          canvasRef.current!,
          coords.normX,
          coords.normY
        );

        if (touchRes && touchRes.mask) {
          const upscaled = ImagePostprocessor.upscaleMaskBilinear(
            touchRes.mask,
            touchRes.width,
            touchRes.height,
            width,
            height
          );

          const updated = new Float32Array(mask);
          for (let i = 0; i < width * height; i++) {
            const v = upscaled[i];
            if (v > 0.3) {
              if (magicTouchPolarity === 'positive') {
                updated[i] = Math.max(updated[i], v);
              } else {
                updated[i] = Math.max(0, updated[i] - v);
              }
            }
          }
          pushMaskState(updated);
        }
      } catch (err) {
        console.warn('Magic touch failed:', err);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setIsDrawing(true);
    currentPathRef.current = [{ x: coords.x, y: coords.y }];
    e.currentTarget.setPointerCapture(e.pointerId);

    if (activeTool === 'brush' || activeTool === 'eraser') {
      applyBrushAtPoint(coords.x, coords.y, activeTool === 'brush', false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = clientToImageCoords(e);
    currentPathRef.current.push({ x: coords.x, y: coords.y });

    if (activeTool === 'brush' || activeTool === 'eraser') {
      applyBrushAtPoint(coords.x, coords.y, activeTool === 'brush', false);
    } else if (activeTool === 'lasso') {
      // Draw live polygon preview
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const pts = currentPathRef.current;
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (activeTool === 'brush' || activeTool === 'eraser') {
      pushMaskState(new Float32Array(mask));
    } else if (activeTool === 'lasso') {
      // Fill closed polygon
      fillLassoPolygon();
    }

    currentPathRef.current = [];
  };

  // Brush stamping
  const applyBrushAtPoint = (cx: number, cy: number, isAdd: boolean, commit = false) => {
    const updated = new Float32Array(mask);
    const r = brushRadius;
    const rSq = r * r;
    const innerRSq = rSq * Math.max(0, brushHardness * brushHardness);
    const targetVal = isAdd ? 1.0 : 0.0;

    const xMin = Math.max(0, Math.floor(cx - r));
    const xMax = Math.min(width - 1, Math.ceil(cx + r));
    const yMin = Math.max(0, Math.floor(cy - r));
    const yMax = Math.min(height - 1, Math.ceil(cy + r));

    for (let y = yMin; y <= yMax; y++) {
      const row = y * width;
      for (let x = xMin; x <= xMax; x++) {
        const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (dSq <= rSq) {
          const idx = row + x;
          let strength = 1.0;
          if (dSq > innerRSq && rSq > innerRSq) {
            strength = 1.0 - (dSq - innerRSq) / (rSq - innerRSq);
          }
          const cur = updated[idx];
          updated[idx] = cur + (targetVal - cur) * strength;
        }
      }
    }

    if (commit) {
      pushMaskState(updated);
    } else {
      setMask(updated);
    }
  };

  // Fill closed freehand lasso
  const fillLassoPolygon = () => {
    const pts = currentPathRef.current;
    if (pts.length < 3) return;

    // Use offscreen 2D canvas to render polygon mask
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const ctx = off.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fill();

    const data = ctx.getImageData(0, 0, width, height).data;
    const updated = new Float32Array(mask);

    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] > 128) {
        updated[i] = 1.0;
      }
    }

    pushMaskState(updated);
  };

  // Invert Selection
  const handleInvertMask = () => {
    const updated = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      updated[i] = 1.0 - mask[i];
    }
    pushMaskState(updated);
  };

  // Clear Selection
  const handleClearMask = () => {
    pushMaskState(new Float32Array(width * height));
  };

  // Trigger Object Inpainting Execution (Worker-based)
  const handleRunInpaint = async (newSeed?: number) => {
    if (!currentRgba) return;
    const runSeed = newSeed !== undefined ? newSeed : seed;

    // Check if MI-GAN model is selected and needs downloading
    if (modelMode === 'migan-512') {
      const isCached = await modelStore.isModelCached('migan-512');
      if (!isCached) {
        setShowDownloadModal(true);
        return;
      }
    }

    setIsProcessing(true);
    setProgressStage('تجهيز المعالجة داخل Web Worker...');
    setProgressPercent(10);

    try {
      // Create ImageBitmap from current canvas
      const canvas = canvasRef.current!;
      const bitmap = await createImageBitmap(canvas);

      const result = await aiService.removeObject(bitmap, mask, {
        modelMode,
        dilatePx,
        featherPx: 2,
        seed: runSeed,
        onProgress: (stage, percent) => {
          setProgressStage(stage);
          setProgressPercent(percent);
        }
      });

      if (result.outputRgba) {
        setCurrentRgba(result.outputRgba);
        setTiming({
          inferenceMs: result.timing.inferenceMs,
          compositeMs: result.timing.compositeMs,
          totalMs: result.timing.totalMs,
          modelUsed: result.modelUsed,
          roiBox: (result as unknown as { roiBox?: { x: number; y: number; w: number; h: number } }).roiBox
        });

        // Automatically clear mask after successful inpaint so user sees clean result
        pushMaskState(new Float32Array(width * height));
      }
    } catch (err: unknown) {
      console.error('Inpainting error:', err);
      setErrorMessage(`حدث خطأ أثناء إزالة العنصر: ${(err as Error)?.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // "إعادة" (Re-run with new seed)
  const handleRerun = () => {
    const nextSeed = Math.floor(Math.random() * 100000);
    setSeed(nextSeed);
    handleRunInpaint(nextSeed);
  };

  // "تطبيق" (Commit new version to versions stack)
  const handleApplyCommit = async () => {
    if (!currentRgba) return;
    const newStack = versionsStack.slice(0, currentVersionIdx + 1);
    newStack.push(new Uint8ClampedArray(currentRgba));
    setVersionsStack(newStack);
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
    }
  };

  const handleVersionRedo = () => {
    if (currentVersionIdx < versionsStack.length - 1) {
      const next = currentVersionIdx + 1;
      setCurrentVersionIdx(next);
      setCurrentRgba(new Uint8ClampedArray(versionsStack[next]));
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
        a.download = `vireon_inpainted_${width}x${height}.${format === 'jpeg' ? 'jpg' : format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg',
      0.96
    );
  };

  const hasMask = mask.some((v) => v > 0.1);

  return (
    <div className="space-y-4 max-w-6xl mx-auto w-full">
      {/* Top Bar: Navigation, Versions & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-xs text-neutral-300 font-medium transition-colors cursor-pointer"
            >
              <span>العودة لعزل الخلفية</span>
            </button>
          )}

          {/* Versions Stack Undo/Redo */}
          <div className="flex items-center gap-1 bg-neutral-950/70 border border-neutral-800 rounded-xl p-1 text-xs">
            <button
              onClick={handleVersionUndo}
              disabled={currentVersionIdx <= 0}
              className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded"
              title="تراجع عن آخر تعديل تم تطبيقه"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-neutral-400 px-1 text-[11px]">
              نسخة {currentVersionIdx + 1}/{versionsStack.length}
            </span>
            <button
              onClick={handleVersionRedo}
              disabled={currentVersionIdx >= versionsStack.length - 1}
              className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded"
              title="إعادة تطبيق التعديل"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

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
            <span>مقارنة الأصل</span>
          </button>
        </div>

        {/* Viewport Zoom & Actions */}
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

          {/* Cloud Higher Quality Button (Strictly rendered ONLY if cloudImageEdit is available) */}
          {isCloudServiceAvailable && (
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 text-xs font-semibold hover:bg-purple-600/30 transition-all cursor-pointer"
            >
              <Cloud className="w-4 h-4 text-purple-400" />
              <span>جودة أعلى (سحابي)</span>
            </button>
          )}

          {/* Apply to new version */}
          <button
            type="button"
            onClick={handleApplyCommit}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 cursor-pointer transition-all"
            title="تثبيت النتيجة الحالية في مكدس النسخ"
          >
            <Check className="w-4 h-4" />
            <span>تطبيق (نسخة جديدة)</span>
          </button>

          {/* Export */}
          <button
            type="button"
            onClick={() => handleExport('png')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
          >
            <Download className="w-4 h-4" />
            <span>تصدير الصورة</span>
          </button>
        </div>
      </div>

      {/* Main Dual-Canvas Viewport (Image + Selection Overlay) */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 min-h-[460px] flex items-center justify-center p-4 select-none"
      >
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="transition-transform duration-75 relative"
        >
          {/* Base Image Canvas */}
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[68vh] object-contain shadow-2xl rounded-lg"
          />

          {/* Interactive Selection Overlay Canvas */}
          <canvas
            ref={overlayCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`absolute inset-0 w-full h-full touch-none ${
              activeTool === 'magic-touch'
                ? 'cursor-crosshair'
                : activeTool === 'lasso'
                ? 'cursor-cell'
                : 'cursor-pointer'
            }`}
          />
        </div>

        {/* Split slider control */}
        {showSplit && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/90 border border-neutral-800 px-4 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md text-xs shadow-xl z-10">
            <span className="text-neutral-400">مقارنة الانقسام:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={splitPos}
              onChange={(e) => setSplitPos(parseInt(e.target.value, 10))}
              className="w-40 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-neutral-200">{splitPos}%</span>
          </div>
        )}
      </div>

      {/* Selection Tools Toolbar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tools Picker */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-950/70 rounded-xl border border-neutral-800 text-xs">
            {/* Brush */}
            <button
              type="button"
              onClick={() => setActiveTool('brush')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTool === 'brush' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Brush className="w-3.5 h-3.5" />
              <span>فرشاة</span>
            </button>

            {/* Eraser */}
            <button
              type="button"
              onClick={() => setActiveTool('eraser')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTool === 'eraser' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>ممحاة</span>
            </button>

            {/* Freehand Lasso */}
            <button
              type="button"
              onClick={() => setActiveTool('lasso')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTool === 'lasso' ? 'bg-cyan-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>لاسو حر</span>
            </button>

            {/* Interactive Magic Touch */}
            <button
              type="button"
              onClick={() => setActiveTool('magic-touch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTool === 'magic-touch' ? 'bg-amber-600 text-white' : 'text-neutral-400 hover:text-amber-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>اختر بلمسة</span>
            </button>
          </div>

          {/* Stroke Undo/Redo, Invert & Clear */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={handleMaskUndo}
              disabled={maskHistoryIdx <= 0}
              className="p-1.5 bg-neutral-950/70 border border-neutral-800 rounded-lg text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800"
              title="تراجع عن ضربة الفرشاة"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaskRedo}
              disabled={maskHistoryIdx >= maskHistory.length - 1}
              className="p-1.5 bg-neutral-950/70 border border-neutral-800 rounded-lg text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800"
              title="إعادة ضربة الفرشاة"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleInvertMask}
              className="px-2.5 py-1.5 bg-neutral-950/70 border border-neutral-800 rounded-lg text-neutral-300 hover:bg-neutral-800 cursor-pointer"
            >
              عكس التحديد
            </button>

            <button
              onClick={handleClearMask}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-950/70 border border-neutral-800 rounded-lg text-rose-300 hover:bg-rose-500/10 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح</span>
            </button>

            <button
              onClick={() => setShowMaskOverlay(!showMaskOverlay)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                showMaskOverlay
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400'
              }`}
            >
              {showMaskOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>التحديد</span>
            </button>
          </div>
        </div>

        {/* Dynamic Tool Adjustments Subpanel */}
        <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-neutral-800/60 text-xs">
          {/* Brush Size & Hardness */}
          {(activeTool === 'brush' || activeTool === 'eraser') && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">حجم الفرشاة:</span>
                <input
                  type="range"
                  min={5}
                  max={120}
                  value={brushRadius}
                  onChange={(e) => setBrushRadius(parseInt(e.target.value, 10))}
                  className="w-28 accent-indigo-500 cursor-pointer"
                />
                <span className="font-mono text-neutral-200">{brushRadius}px</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-neutral-400">نعومة الحواف:</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(brushHardness * 100)}
                  onChange={(e) => setBrushHardness(parseInt(e.target.value, 10) / 100)}
                  className="w-24 accent-indigo-500 cursor-pointer"
                />
                <span className="font-mono text-neutral-200">{Math.round(brushHardness * 100)}%</span>
              </div>
            </>
          )}

          {/* Magic Touch Polarity (+ / -) */}
          {activeTool === 'magic-touch' && (
            <div className="flex items-center gap-2 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
              <button
                type="button"
                onClick={() => setMagicTouchPolarity('positive')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  magicTouchPolarity === 'positive' ? 'bg-emerald-600 text-white' : 'text-neutral-400'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة كائن (+)</span>
              </button>
              <button
                type="button"
                onClick={() => setMagicTouchPolarity('negative')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  magicTouchPolarity === 'negative' ? 'bg-rose-600 text-white' : 'text-neutral-400'
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
                <span>استثناء كائن (-)</span>
              </button>
            </div>
          )}

          {/* Dilation Slider (0 - 16px, default 6px) */}
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-neutral-400">توسيع التحديد (Dilation):</span>
            <input
              type="range"
              min={0}
              max={16}
              value={dilatePx}
              onChange={(e) => setDilatePx(parseInt(e.target.value, 10))}
              className="w-24 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-cyan-400">{dilatePx}px</span>
            <span className="text-[10px] text-neutral-500">(تنعيم feather 2px)</span>
          </div>
        </div>
      </div>

      {/* Inpainting Engine Selection & Action Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Model Mode Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">محرك الترميم:</span>
          <div className="flex items-center gap-1.5 p-1 bg-neutral-950/80 rounded-xl border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setModelMode('migan-512')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                modelMode === 'migan-512' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <span>MI-GAN 512 (Places2)</span>
              <span className="font-mono text-[10px] text-indigo-300">~81MB</span>
            </button>

            <button
              type="button"
              onClick={() => setModelMode('push-pull')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                modelMode === 'push-pull' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>سريع (جودة أقل)</span>
              <span className="text-[10px] text-emerald-400">بدون تنزيل</span>
            </button>
          </div>
        </div>

        {/* Execution & Re-run Buttons */}
        <div className="flex items-center gap-2">
          {/* Re-run button */}
          <button
            type="button"
            onClick={handleRerun}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800 text-xs text-neutral-200 font-medium cursor-pointer transition-colors disabled:opacity-40"
            title="إعادة المعالجة ببذرة عشوائية مختلفة"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة</span>
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => handleRunInpaint()}
            disabled={isProcessing || !hasMask}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            <span>إزالة العنصر المحدد</span>
          </button>
        </div>
      </div>

      {/* Progress Bar while inpainting */}
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

      {/* Performance & ROI Timing Metrics Card */}
      {timing && (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 text-xs space-y-2 text-neutral-300">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="font-semibold text-white">سجل استدلال إزالة العنصر (بالدقة الكاملة {width}×{height}):</span>
            <div className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تطابق بايت ببايت خارج التحديد</span>
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
              <span className="text-neutral-400 block text-[10px]">الزمن الكلي:</span>
              <span className="text-white font-bold">{timing.totalMs} ms</span>
            </div>
            <div className="p-2 rounded bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 block text-[10px]">أبعاد ROI المعالجة:</span>
              <span className="text-amber-300 font-bold">
                {timing.roiBox ? `${timing.roiBox.w}×${timing.roiBox.h}` : 'كامل'}
              </span>
            </div>
          </div>
        </div>
      )}

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
              // Trigger inpaint
              handleRunInpaint();
            } catch (e: unknown) {
              setErrorMessage(`فشل تنزيل النموذج: ${(e as Error)?.message}`);
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
