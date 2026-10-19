import React from 'react';
import { ModelManifest } from '../../ai/models/rmbg2.manifest';
import { DownloadProgress } from '../../ai/models/ModelStore';
import { Download, AlertTriangle, ShieldCheck, XCircle, HardDrive } from 'lucide-react';

interface Props {
  manifest: ModelManifest;
  isOpen: boolean;
  onConfirmDownload: () => void;
  onCancel: () => void;
  progress: DownloadProgress | null;
  isDownloading: boolean;
}

export const ModelDownloadDialog: React.FC<Props> = ({
  manifest,
  isOpen,
  onConfirmDownload,
  onCancel,
  progress,
  isDownloading
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-neutral-100 space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{manifest.name}</h3>
              <p className="text-xs text-neutral-400">{manifest.description}</p>
            </div>
          </div>
          {!isDownloading && (
            <button
              onClick={onCancel}
              className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Specs Table */}
        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-neutral-800/50">
            <span className="text-neutral-400">حجم الملف (قبل التنزيل):</span>
            <span className="font-mono font-bold text-cyan-400">{manifest.sizeFormatted}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-neutral-800/50">
            <span className="text-neutral-400">الترخيص البرمجي:</span>
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300 font-semibold">{manifest.license}</span>
            </div>
          </div>

          <div className="flex justify-between py-1 border-b border-neutral-800/50">
            <span className="text-neutral-400">مكان التخزين المحلي:</span>
            <div className="flex items-center gap-1 text-neutral-300">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>نظام الملفات الخاص (OPFS / Cache)</span>
            </div>
          </div>

          <div className="flex flex-col py-1 gap-1">
            <span className="text-neutral-400">فحص النزاهة (SHA-256):</span>
            <span className="font-mono text-[10px] text-neutral-400 break-all bg-neutral-900 p-1.5 rounded border border-neutral-800">
              {manifest.sha256 || 'غير متوفر'}
            </span>
          </div>
        </div>

        {/* Progress or Note */}
        {isDownloading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-300 font-medium">
                {progress?.status === 'verifying'
                  ? 'جاري التحقق من بصمة SHA-256...'
                  : progress?.status === 'ready'
                  ? 'اكتمل التنزيل بنجاح!'
                  : 'جاري التنزيل المتدفق مع استئناف (Range)...'}
              </span>
              <span className="font-mono text-indigo-400 font-bold">{progress?.percent || 0}%</span>
            </div>

            <div className="w-full bg-neutral-950 rounded-full h-2.5 overflow-hidden border border-neutral-800">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>{((progress?.bytesLoaded || 0) / (1024 * 1024)).toFixed(2)} MB محمل</span>
              <span>السرعة: {(progress?.speedMBps || 0).toFixed(2)} MB/s</span>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-neutral-950/50 border border-neutral-800/60 text-xs text-neutral-400">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              لن يتم تحميل النموذج إلى الذاكرة قبل أول استخدام فعلي. تُحفظ الملفات في OPFS وتُفرغ الذاكرة بعد 60 ثانية من الخمول تلقائياً.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          {isDownloading ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold cursor-pointer transition-colors"
            >
              إلغاء التنزيل
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={onConfirmDownload}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>تنزيل النموذج وحفظه محلياً</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
