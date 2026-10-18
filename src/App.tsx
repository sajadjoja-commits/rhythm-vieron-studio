import React, { useState, useRef, useEffect } from 'react';
import { AIService } from './services/ai/AIService';
import { ImageModelManager } from './ai/image/ImageModelManager';
import { ModelStore, DownloadProgress } from './ai/models/ModelStore';
import { InferenceResult } from './ai/image/ImageInferenceEngine';
import { BackgroundRemovalResult } from './components/imageAi/BackgroundRemovalResult';
import { MaskEditorCanvas } from './components/imageAi/MaskEditorCanvas';
import { ModelDownloadDialog } from './components/imageAi/ModelDownloadDialog';
import { MODEL_CATALOG, getAllEvaluatedModels } from './ai/models/models.catalog';
import { ModelManifest } from './ai/models/rmbg2.manifest';
import { ImageAITaskType, t } from './ai/image/toolsRegistry';
import { ImageAIWorkspace } from './components/imageAi/ImageAIWorkspace';
import { ImageAIHub } from './components/imageAi/ImageAIHub';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  ShieldCheck,
  Cpu,
  Layers,
  HelpCircle,
  FileCheck2,
  XCircle,
  Zap,
  Info,
  Wand2,
  Maximize2,
  AlertTriangle
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ImageAITaskType>('outpaint');
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [appError, setAppError] = useState<string | null>(null);

  // Model selection
  const [preferredModel, setPreferredModel] = useState<'auto' | 'mediapipe-selfie' | 'u2netp-general'>('auto');

  // Model download modal
  const [downloadModalManifest, setDownloadModalManifest] = useState<ModelManifest | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Evaluation table modal
  const [showEvalTable, setShowEvalTable] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiService = AIService.getInstance();
  const modelManager = ImageModelManager.getInstance();
  const modelStore = ModelStore.getInstance();

  // Handle uploaded file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadImageFromFile(file);
    }
  };

  const loadImageFromFile = (file: File) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      setSelectedImage(img);
      setInferenceResult(null);
      if (activeTab === 'remove-bg') {
        triggerBackgroundRemoval(img);
      }
    };
    img.src = url;
  };

  // Preset sample images for quick testing
  const loadSample = (sampleType: 'portrait' | 'product' | 'pet') => {
    const canvas = document.createElement('canvas');
    canvas.width = sampleType === 'portrait' ? 1200 : 1600;
    canvas.height = sampleType === 'portrait' ? 1600 : 1200;
    const ctx = canvas.getContext('2d')!;

    // Create synthetic sample test image
    if (sampleType === 'portrait') {
      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 1200, 1600);
      bg.addColorStop(0, '#3b82f6');
      bg.addColorStop(1, '#1e293b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1200, 1600);

      // Person head & shoulders
      ctx.fillStyle = '#f87171'; // shirt
      ctx.beginPath();
      ctx.ellipse(600, 1400, 450, 400, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fbcfe8'; // neck & face
      ctx.beginPath();
      ctx.ellipse(600, 850, 220, 280, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#312e81'; // hair
      ctx.beginPath();
      ctx.ellipse(600, 680, 240, 180, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (sampleType === 'product') {
      // Product on table
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, 1600, 1200);

      // Camera body
      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.roundRect(500, 450, 600, 380, 24);
      ctx.fill();

      // Camera lens
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(800, 640, 140, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(800, 640, 90, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Pet on grass
      ctx.fillStyle = '#166534';
      ctx.fillRect(0, 0, 1600, 1200);

      // Pet body
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(800, 650, 350, 250, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(600, 500, 160, 0, Math.PI * 2);
      ctx.fill();
    }

    const img = new Image();
    img.onload = () => {
      setSelectedImage(img);
      setInferenceResult(null);
      if (activeTab === 'remove-bg') {
        triggerBackgroundRemoval(img);
      }
    };
    img.src = canvas.toDataURL('image/png');
  };

  const triggerBackgroundRemoval = async (img: HTMLImageElement) => {
    setIsProcessing(true);
    setProcessingStage('تجهيز الصورة واستدعاء النموذج...');
    setProcessingPercent(10);

    try {
      // Create ImageBitmap for zero dataURL transfer
      const bitmap = await createImageBitmap(img);

      const result = await aiService.removeBackground(
        bitmap,
        preferredModel,
        (stage, percent) => {
          setProcessingStage(stage);
          setProcessingPercent(percent);
        }
      );

      setInferenceResult(result);
    } catch (err: unknown) {
      console.error('Background removal error:', err);
      setAppError(`حدث خطأ أثناء العزل: ${(err as Error)?.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadConfirm = async () => {
    if (!downloadModalManifest) return;
    setIsDownloading(true);

    try {
      await modelStore.downloadModel(
        downloadModalManifest.id,
        downloadModalManifest.url!,
        downloadModalManifest.sha256,
        (p) => setDownloadProgress(p)
      );
      setDownloadModalManifest(null);
      setIsDownloading(false);
    } catch (err: unknown) {
      setAppError(`فشل التنزيل: ${(err as Error)?.message}`);
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white">Vireon AI Studio</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Full-Res Guided & ROI Inpaint
                </span>
              </div>
              <p className="text-xs text-neutral-400">إزالة العناصر الحقيقية وعزل الخلفية الذكي بدقة كاملة</p>
            </div>
          </div>

          {/* Module Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-950/80 rounded-xl border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('outpaint');
                setInferenceResult(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer min-h-[36px] ${
                activeTab === 'outpaint'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5 text-cyan-300" />
              <span>توسيع الصورة (Outpaint)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('inpaint');
                setInferenceResult(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer min-h-[36px] ${
                activeTab === 'inpaint'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-300" />
              <span>إزالة العناصر (Inpaint)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('remove-bg');
                if (selectedImage && !inferenceResult) {
                  triggerBackgroundRemoval(selectedImage);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer min-h-[36px] ${
                activeTab === 'remove-bg'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-300" />
              <span>عزل الخلفية</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEvalTable(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 hover:bg-neutral-800 text-xs text-neutral-300 transition-colors cursor-pointer"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>جدول النماذج والتراخيص</span>
            </button>
          </div>
        </div>
      </header>

      {/* Global error banner */}
      {appError && (
        <div className="max-w-7xl mx-auto px-4 mt-3 w-full">
          <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-2 shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{appError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAppError(null)}
              className="p-1 hover:bg-rose-900/50 rounded-lg text-rose-400 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full flex flex-col">
        {!selectedImage ? (
          <div className="max-w-3xl mx-auto w-full space-y-6 my-auto py-8">
            {/* Tool Selection Hub */}
            <ImageAIHub selectedTask={activeTab} onSelectTask={setActiveTab} />

            {/* Model Architecture Controls for Background Removal */}
            {activeTab === 'remove-bg' && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">إعدادات نموذج عزل الخلفية</span>
                  </div>
                  <span className="text-xs text-neutral-400">Web Worker + OPFS Streaming</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPreferredModel('auto')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      preferredModel === 'auto'
                        ? 'bg-indigo-950/40 border-indigo-500/60 ring-2 ring-indigo-500/20'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">تلقائي ذكي (موصى به)</span>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      يكشف الوجه لتشغيل Selfie الفائق (≤1ث)، أو U²-Netp للأجسام العامة
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferredModel('mediapipe-selfie')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      preferredModel === 'mediapipe-selfie'
                        ? 'bg-indigo-950/40 border-indigo-500/60 ring-2 ring-indigo-500/20'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">MediaPipe Selfie</span>
                      <span className="font-mono text-[10px] text-emerald-400">0.25 MB</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      أشخاص وبورتريه فقط • ترخيص Apache-2.0 • سريع جداً
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferredModel('u2netp-general')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      preferredModel === 'u2netp-general'
                        ? 'bg-indigo-950/40 border-indigo-500/60 ring-2 ring-indigo-500/20'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">U²-Netp (عام)</span>
                      <span className="font-mono text-[10px] text-cyan-400">4.7 MB</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      أجسام ومنتجات وحيوانات • ترخيص Apache-2.0 • أصغر من 50MB
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Inpaint Instructions Card */}
            {activeTab === 'inpaint' && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-white">إزالة العناصر الذكية (Inpainting بالدقة الأصلية)</span>
                </div>
                <p className="text-neutral-400 leading-relaxed">
                  حدد أي عنصر غير مرغوب فيه (أشخاص، أسلاك، عيوب، شوائب) بواسطة الفرشاة، اللاسو، أو اللمس التفاعلي (+/-).
                  تتم المعالجة على منطقة الاهتمام (ROI) مع تطابق بايت-ببايت للبكسلات المحيطة دون تصغير دقة الصورة.
                </p>
              </div>
            )}

            {/* Upload Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) loadImageFromFile(file);
              }}
              className="border-2 border-dashed border-neutral-800 hover:border-indigo-500/60 bg-neutral-900/40 hover:bg-neutral-900/80 rounded-3xl p-10 text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-4"
            >
              <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-indigo-400" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {activeTab === 'inpaint'
                    ? 'اسحب صورتك لبدء إزالة العناصر بالتحديد الحر'
                    : 'اسحب صورتك هنا لعزل الخلفية تلقائياً'}
                </h3>
                <p className="text-xs text-neutral-400">
                  يدعم صور حتى دقة 4K كاملة (4096px). لن يتم تصغير دقة الإخراج أبداً.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Quick Samples */}
            <div className="flex items-center justify-center gap-3 text-xs">
              <span className="text-neutral-500">أو جرب عينة سريعة:</span>
              <button
                type="button"
                onClick={() => loadSample('portrait')}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors cursor-pointer"
              >
                بورتريه شخصي
              </button>
              <button
                type="button"
                onClick={() => loadSample('product')}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors cursor-pointer"
              >
                منتج (كاميرا)
              </button>
              <button
                type="button"
                onClick={() => loadSample('pet')}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors cursor-pointer"
              >
                حيوان أليف
              </button>
            </div>

            {/* In-progress processing overlay for background removal */}
            {isProcessing && activeTab === 'remove-bg' && (
              <div className="p-5 bg-neutral-900/90 border border-indigo-500/30 rounded-2xl space-y-3 shadow-xl">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-300">{processingStage}</span>
                  <span className="font-mono text-indigo-400 font-bold">{processingPercent}%</span>
                </div>
                <div className="w-full bg-neutral-950 rounded-full h-2 overflow-hidden border border-neutral-800">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${processingPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Active Image AI Studio Workspace */
          <ImageAIWorkspace
            selectedImage={selectedImage}
            activeTask={activeTab}
            onTaskChange={(t) => {
              setActiveTab(t);
              if (t === 'remove-bg' && !inferenceResult) {
                triggerBackgroundRemoval(selectedImage);
              }
            }}
            backgroundRemovalResult={inferenceResult}
            onResetImage={() => {
              setInferenceResult(null);
              setSelectedImage(null);
            }}
            onNewVersionProduced={async (newBitmap) => {
              const canvas = document.createElement('canvas');
              canvas.width = newBitmap.width;
              canvas.height = newBitmap.height;
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(newBitmap, 0, 0);
              const img = new Image();
              img.src = canvas.toDataURL('image/png');
              await img.decode();
              setSelectedImage(img);
            }}
          />
        )}
      </main>

      {/* Model Download Modal */}
      {downloadModalManifest && (
        <ModelDownloadDialog
          manifest={downloadModalManifest}
          isOpen={true}
          onConfirmDownload={handleDownloadConfirm}
          onCancel={() => setDownloadModalManifest(null)}
          progress={downloadProgress}
          isDownloading={isDownloading}
        />
      )}

      {/* Technical Model Evaluation & Licensing Modal (Requirement 2 & 1) */}
      {showEvalTable && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl text-neutral-100 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  جدول تقييم النماذج العامة، التراخيص، والأحجام
                </h3>
              </div>
              <button
                onClick={() => setShowEvalTable(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 bg-neutral-950/50">
                    <th className="p-3">النموذج</th>
                    <th className="p-3">الحجم التقريبي</th>
                    <th className="p-3">الترخيص</th>
                    <th className="p-3">المصدر / المستودع الرسمي</th>
                    <th className="p-3">الحالة والقرار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {getAllEvaluatedModels().map((m) => (
                    <tr key={m.id} className={m.enabled ? 'bg-indigo-950/10' : 'opacity-70'}>
                      <td className="p-3 font-semibold text-neutral-200">
                        {m.name}
                        <div className="text-[10px] font-mono text-neutral-500">{m.id}</div>
                      </td>
                      <td className="p-3 font-mono text-neutral-300">{m.sizeFormatted}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            m.licenseType === 'Commercial-Friendly'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {m.license}
                        </span>
                      </td>
                      <td className="p-3 text-neutral-400 max-w-[200px] truncate" title={m.url || m.notes}>
                        {m.url ? (
                          <span className="font-mono text-[10px] text-cyan-400">{m.url}</span>
                        ) : (
                          <span className="text-neutral-500 text-[10px]">مستودع المؤلفين (PyTorch فقط)</span>
                        )}
                      </td>
                      <td className="p-3">
                        {m.enabled ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                            مُعتمد ومُفعّل
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                            معطّل ({m.notes})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                <Info className="w-4 h-4 text-indigo-400" />
                <span>ملخص التقييم والقرارات الفنية:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>
                  <strong>U²-Netp:</strong> الفائز كأصغر نموذج تقسيم عام بجودة عالية وحجم 4.7MB فقط (أقل بكثير من هدف ≤ 50MB) تحت ترخيص Apache 2.0 من المؤلفين الرسميين (Xuebin Qin).
                </li>
                <li>
                  <strong>MediaPipe Selfie:</strong> معتمد كمسار فائق السرعة للأشخاص والبورتريه (≤ 1 ثانية) بحجم 0.25MB فقط.
                </li>
                <li>
                  <strong>RMBG-2.0:</strong> معطّل خلف <code>ENABLE_RMBG = false</code> ومحذوف من الواجهات نظراً لترخيصه غير التجاري (CC BY-NC 4.0) وتضارب وزنه بين الملفات (176MB/348MB).
                </li>
                <li>
                  <strong>IS-Net & BiRefNet-lite:</strong> تركت <code>enabled: false</code> لعدم وجود ملفات ONNX ويب مستقلة موثقة بهاش معتمد مباشرة من مؤلفيها.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
