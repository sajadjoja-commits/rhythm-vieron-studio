import React, { useState } from 'react';
import { Brush, Eraser, MousePointerClick, Undo2, Redo2, Eye, EyeOff } from 'lucide-react';

export type ToolMode = 'none' | 'brush-add' | 'brush-erase' | 'magic-touch';

interface Props {
  activeTool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  brushRadius: number;
  onBrushRadiusChange: (radius: number) => void;
  brushHardness: number;
  onBrushHardnessChange: (hardness: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showOriginalOverlay: boolean;
  onToggleOverlay: () => void;
  previewMode: 'checkerboard' | 'solid-black' | 'solid-white';
  onPreviewModeChange: (mode: 'checkerboard' | 'solid-black' | 'solid-white') => void;
}

export const MaskBrushEditor: React.FC<Props> = ({
  activeTool,
  onToolChange,
  brushRadius,
  onBrushRadiusChange,
  brushHardness,
  onBrushHardnessChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showOriginalOverlay,
  onToggleOverlay,
  previewMode,
  onPreviewModeChange
}) => {
  const [showSettings, setShowSettings] = useState(true);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 space-y-3">
      {/* Primary tool buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-1 bg-neutral-950/70 rounded-lg border border-neutral-800/80 text-xs">
          {/* Default view */}
          <button
            type="button"
            onClick={() => onToolChange('none')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
              activeTool === 'none'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            استعراض
          </button>

          {/* Brush Add */}
          <button
            type="button"
            onClick={() => onToolChange('brush-add')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
              activeTool === 'brush-add'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="فرشاة استرجاع (إضافة للقناع)"
          >
            <Brush className="w-3.5 h-3.5" />
            <span>إضافة (+)</span>
          </button>

          {/* Brush Erase */}
          <button
            type="button"
            onClick={() => onToolChange('brush-erase')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
              activeTool === 'brush-erase'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="فرشاة محو (حذف من القناع)"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>محو (-)</span>
          </button>

          {/* Magic Touch (Interactive Segmenter) */}
          <button
            type="button"
            onClick={() => onToolChange('magic-touch')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
              activeTool === 'magic-touch'
                ? 'bg-amber-600 text-white shadow-sm animate-pulse'
                : 'text-neutral-400 hover:text-amber-300'
            }`}
            title="اختر الكائن بلمسة (MediaPipe Interactive Segmenter Magic Touch)"
          >
            <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />
            <span>اختر الكائن بلمسة</span>
          </button>
        </div>

        {/* Undo / Redo & Mask Overlay */}
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="تراجع (Ctrl+Z)"
            className="p-1.5 rounded-lg bg-neutral-950/70 border border-neutral-800 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="إعادة (Ctrl+Y)"
            className="p-1.5 rounded-lg bg-neutral-950/70 border border-neutral-800 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800 transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-px bg-neutral-800 mx-1" />
          <button
            type="button"
            onClick={onToggleOverlay}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              showOriginalOverlay
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-neutral-950/70 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {showOriginalOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>إظهار الأصل المقارن</span>
          </button>
        </div>
      </div>

      {/* Brush Settings Subpanel */}
      {(activeTool === 'brush-add' || activeTool === 'brush-erase') && showSettings && (
        <div className="p-3 bg-neutral-950/50 rounded-lg border border-neutral-800/60 flex flex-wrap items-center gap-5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">حجم الفرشاة:</span>
            <input
              type="range"
              min={5}
              max={100}
              value={brushRadius}
              onChange={(e) => onBrushRadiusChange(parseInt(e.target.value, 10))}
              className="w-32 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-neutral-300">{brushRadius}px</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-neutral-400">الصلابة (Hardness):</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brushHardness * 100)}
              onChange={(e) => onBrushHardnessChange(parseInt(e.target.value, 10) / 100)}
              className="w-28 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-neutral-300">{Math.round(brushHardness * 100)}%</span>
          </div>

          <div className="flex items-center gap-1.5 mr-auto">
            <span className="text-neutral-400">معاينة الحواف على:</span>
            <button
              type="button"
              onClick={() => onPreviewModeChange('checkerboard')}
              className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                previewMode === 'checkerboard' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-neutral-800 text-neutral-400'
              }`}
            >
              شطرنج
            </button>
            <button
              type="button"
              onClick={() => onPreviewModeChange('solid-black')}
              className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                previewMode === 'solid-black' ? 'bg-neutral-800 border-neutral-600 text-white' : 'border-neutral-800 text-neutral-400'
              }`}
            >
              أسود
            </button>
            <button
              type="button"
              onClick={() => onPreviewModeChange('solid-white')}
              className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                previewMode === 'solid-white' ? 'bg-neutral-200 border-neutral-300 text-neutral-900' : 'border-neutral-800 text-neutral-400'
              }`}
            >
              أبيض
            </button>
          </div>
        </div>
      )}

      {activeTool === 'magic-touch' && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            انقر أو المس أي كائن في الصورة لعزله تلقائياً بواسطة نموذج <strong>magic_touch</strong> التفاعلي.
          </span>
        </div>
      )}
    </div>
  );
};
