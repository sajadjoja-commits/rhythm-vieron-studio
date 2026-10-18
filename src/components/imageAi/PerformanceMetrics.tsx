import React from 'react';
import { InferenceTiming } from '../../ai/image/ImageInferenceEngine';
import { Clock, Cpu, Download, Sparkles, Layers, CheckCircle2 } from 'lucide-react';

interface Props {
  timing: InferenceTiming;
  modelUsed: string;
}

export const PerformanceMetrics: React.FC<Props> = ({ timing, modelUsed }) => {
  const mp = ((timing.outputWidth * timing.outputHeight) / 1_000_000).toFixed(1);

  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 text-xs space-y-3 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-neutral-200">سجل الأداء الزمني والدقة</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{timing.outputWidth} × {timing.outputHeight} ({mp} MP)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {/* Download */}
        <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/50">
          <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>التنزيل (OPFS)</span>
          </div>
          <div className="text-sm font-bold font-mono text-neutral-200">
            {timing.downloadMs > 0 ? `${timing.downloadMs} ms` : 'مُخزّن مؤقتاً'}
          </div>
        </div>

        {/* Load */}
        <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/50">
          <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>تحميل الجلسة</span>
          </div>
          <div className="text-sm font-bold font-mono text-neutral-200">
            {timing.loadMs} ms
          </div>
        </div>

        {/* Inference */}
        <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/50">
          <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>الاستدلال (AI)</span>
          </div>
          <div className="text-sm font-bold font-mono text-neutral-200">
            {timing.inferenceMs} ms
          </div>
        </div>

        {/* Guided Filter & Composite */}
        <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/50">
          <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>المرشح الموجّه والتركيب</span>
          </div>
          <div className="text-sm font-bold font-mono text-neutral-200">
            {timing.compositeMs} ms
          </div>
        </div>

        {/* Total */}
        <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30">
          <div className="flex items-center gap-1.5 text-indigo-300 mb-1">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>الإجمالي</span>
          </div>
          <div className="text-sm font-bold font-mono text-indigo-200">
            {timing.totalMs} ms
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between text-[11px] text-neutral-400 pt-1">
        <span>النموذج المستخدم: <strong className="text-neutral-300 font-mono">{modelUsed}</strong></span>
        <span>تنفيذ كامل داخل Worker بدون حجب واجهة المستخدم (Zero DataURL)</span>
      </div>
    </div>
  );
};
