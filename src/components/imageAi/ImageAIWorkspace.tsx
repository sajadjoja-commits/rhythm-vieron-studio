import React, { useState } from 'react';
import { ImageAITaskType, IMAGE_AI_TOOLS_REGISTRY, t } from '../../ai/image/toolsRegistry';
import { BackgroundRemovalResult } from './BackgroundRemovalResult';
import { MaskEditorCanvas } from './MaskEditorCanvas';
import { ImageExpandCanvas } from './ImageExpandCanvas';
import { InferenceResult } from '../../ai/image/ImageInferenceEngine';
import { Sparkles, Wand2, Maximize2, Layers } from 'lucide-react';

interface Props {
  selectedImage: HTMLImageElement | ImageBitmap;
  activeTask: ImageAITaskType;
  onTaskChange: (task: ImageAITaskType) => void;
  backgroundRemovalResult: InferenceResult | null;
  onResetImage: () => void;
  onNewVersionProduced?: (bitmap: ImageBitmap) => void;
}

export const ImageAIWorkspace: React.FC<Props> = ({
  selectedImage,
  activeTask,
  onTaskChange,
  backgroundRemovalResult,
  onResetImage,
  onNewVersionProduced
}) => {
  return (
    <div className="w-full flex-1 flex flex-col space-y-4">
      {/* Tool Navigation Switcher Tabs */}
      <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl p-2.5 shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Outpaint tool */}
          <button
            type="button"
            onClick={() => onTaskChange('outpaint')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[44px] ${
              activeTask === 'outpaint'
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Maximize2 className="w-4 h-4 text-cyan-300" />
            <span>{t('imageAi.tools.outpaint.title')}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
              محلي 100%
            </span>
          </button>

          {/* Inpaint tool */}
          <button
            type="button"
            onClick={() => onTaskChange('inpaint')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[44px] ${
              activeTask === 'inpaint'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Wand2 className="w-4 h-4 text-indigo-300" />
            <span>{t('imageAi.tools.inpaint.title')}</span>
          </button>

          {/* Remove background tool */}
          <button
            type="button"
            onClick={() => onTaskChange('remove-bg')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[44px] ${
              activeTask === 'remove-bg'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-pink-300" />
            <span>{t('imageAi.tools.removeBg.title')}</span>
          </button>
        </div>

        {/* Action to change photo */}
        <button
          type="button"
          onClick={onResetImage}
          className="text-xs text-neutral-400 hover:text-white px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-800 transition-colors cursor-pointer min-h-[44px]"
        >
          تغيير الصورة
        </button>
      </div>

      {/* Active Studio View */}
      <div className="flex-1 w-full">
        {activeTask === 'outpaint' && (
          <ImageExpandCanvas
            originalImage={selectedImage}
            onClose={onResetImage}
            onApplyNewVersion={onNewVersionProduced}
          />
        )}

        {activeTask === 'inpaint' && (
          <MaskEditorCanvas
            originalImage={selectedImage}
            onClose={onResetImage}
            onApplyNewVersion={onNewVersionProduced}
          />
        )}

        {activeTask === 'remove-bg' && backgroundRemovalResult && (
          <BackgroundRemovalResult
            originalImage={selectedImage}
            initialResult={backgroundRemovalResult}
            onReset={onResetImage}
          />
        )}

        {activeTask === 'remove-bg' && !backgroundRemovalResult && (
          <div className="p-12 text-center text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl">
            جاري معالجة عزل الخلفية...
          </div>
        )}
      </div>
    </div>
  );
};
