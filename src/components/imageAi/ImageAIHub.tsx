import React from 'react';
import {
  ImageAITaskType,
  IMAGE_AI_TOOLS_REGISTRY,
  t
} from '../../ai/image/toolsRegistry';
import { Sparkles, Wand2, Maximize2, ShieldCheck, CheckCircle2, Download } from 'lucide-react';

interface Props {
  onSelectTask: (task: ImageAITaskType) => void;
  selectedTask: ImageAITaskType;
}

export const ImageAIHub: React.FC<Props> = ({ onSelectTask, selectedTask }) => {
  const tools = Object.values(IMAGE_AI_TOOLS_REGISTRY);

  const getIcon = (name: string) => {
    switch (name) {
      case 'Sparkles':
        return <Sparkles className="w-5 h-5 text-indigo-400" />;
      case 'Wand2':
        return <Wand2 className="w-5 h-5 text-purple-400" />;
      case 'Maximize2':
        return <Maximize2 className="w-5 h-5 text-cyan-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
      {tools.map((tool) => {
        const isSelected = selectedTask === tool.id;
        return (
          <div
            key={tool.id}
            onClick={() => onSelectTask(tool.id)}
            className={`p-4 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between group min-h-[110px] ${
              isSelected
                ? 'bg-indigo-950/40 border-indigo-500/60 ring-2 ring-indigo-500/30'
                : 'bg-neutral-900/70 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 group-hover:scale-105 transition-transform">
                    {getIcon(tool.iconName)}
                  </div>
                  <h4 className="text-xs font-bold text-white">{t(tool.titleKey)}</h4>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    tool.badge === 'ready'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  }`}
                >
                  {tool.badge === 'ready' ? t('imageAi.badge.ready') : t('imageAi.badge.needsDownload')}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {t(tool.descKey)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
