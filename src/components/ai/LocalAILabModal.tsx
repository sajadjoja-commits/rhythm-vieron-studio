import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Cpu,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Maximize2,
  ShieldCheck,
  Zap,
  Activity,
  ArrowRight,
  HardDrive,
  Sliders,
  Check,
  Layers,
  FileCheck
} from "lucide-react";
import { toast } from "sonner";
import { localModelPackManager } from "@/services/ai/LocalModelPackManager";
import { ModelManifest, InstalledModel, ModelDownloadProgress, ModelVerificationResult } from "@/services/ai/manifest/types";
import { installedModelStore } from "@/services/ai/manifest/InstalledModelStore";
import { imageUpscalerService, UpscaleResult } from "@/services/ai/ImageUpscalerService";
import { getLang, isRTL } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface LocalAILabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPhotoEditor?: (imageUrl?: string) => void;
}

export const LocalAILabModal: React.FC<LocalAILabModalProps> = ({
  isOpen,
  onClose,
  onOpenPhotoEditor,
}) => {
  const en = getLang() === "en";
  const rtl = isRTL();

  const [activeTab, setActiveTab] = useState<"models" | "upscaler">("models");
  const [manifests, setManifests] = useState<ModelManifest[]>([]);
  const [installedModels, setInstalledModels] = useState<Map<string, InstalledModel>>(new Map());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, ModelDownloadProgress>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, ModelVerificationResult>>({});
  const activeAbortControllers = useRef<Map<string, AbortController>>(new Map());

  // Upscaler Lab State
  const [testImage, setTestImage] = useState<string | null>(null);
  const [upscaleScale, setUpscaleScale] = useState<2 | 4>(2);
  const [sharpenStrength, setSharpenStrength] = useState<number>(0.35);
  const [denoiseStrength, setDenoiseStrength] = useState<number>(0.2);
  const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
  const [upscaleStage, setUpscaleStage] = useState<string>("");
  const [upscalePercent, setUpscalePercent] = useState<number>(0);
  const [upscaleResult, setUpscaleResult] = useState<UpscaleResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadModelData();
    }
  }, [isOpen]);

  const loadModelData = async () => {
    const allManifests = localModelPackManager.getManifests();
    setManifests(allManifests);

    const installed = await installedModelStore.getInstalledModels();
    const installedMap = new Map<string, InstalledModel>();
    for (const m of installed) {
      installedMap.set(m.id, m);
    }
    setInstalledModels(installedMap);
  };

  const handleDownload = async (manifest: ModelManifest) => {
    const controller = new AbortController();
    activeAbortControllers.current.set(manifest.id, controller);

    try {
      playSfx("tap");
      toast.info(en ? `Starting download for ${manifest.name}...` : `بدء تنزيل نموذج ${manifest.name}...`);

      await localModelPackManager.installModel(manifest.id, {
        signal: controller.signal,
        onProgress: (p) => {
          setDownloadProgress((prev) => ({
            ...prev,
            [manifest.id]: p,
          }));
        },
      });

      playSfx("success");
      toast.success(en ? `${manifest.name} installed successfully!` : `تم تثبيت ${manifest.name} بنجاح!`);
      await loadModelData();
    } catch (err: any) {
      if (controller.signal.aborted) {
        toast.info(en ? "Download cancelled." : "تم إلغاء التنزيل.");
      } else {
        playSfx("error");
        toast.error(err?.message || (en ? "Installation failed" : "فشل التثبيت"));
      }
    } finally {
      activeAbortControllers.current.delete(manifest.id);
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[manifest.id];
        return next;
      });
      await loadModelData();
    }
  };

  const handleCancelDownload = (manifestId: string) => {
    const controller = activeAbortControllers.current.get(manifestId);
    if (controller) {
      controller.abort();
      activeAbortControllers.current.delete(manifestId);
      playSfx("tap");
    }
  };

  const handleVerify = async (manifestId: string) => {
    setVerifyingId(manifestId);
    playSfx("tap");
    try {
      const result = await localModelPackManager.verifyModel(manifestId);
      setVerificationResults((prev) => ({
        ...prev,
        [manifestId]: result,
      }));

      if (result.isValid) {
        playSfx("success");
        toast.success(
          en
            ? `Cryptographic SHA-256 match: ${result.computedSha256.substring(0, 16)}...`
            : `تطابق التوقيع الرقمي SHA-256 بنجاح`
        );
      } else {
        playSfx("error");
        toast.error(
          result.errorCode === "MODEL_CHECKSUM_MISMATCH"
            ? (en ? "SHA-256 Checksum Mismatch! Corrupt model rejected." : "عدم تطابق الهاش! تم رفض النموذج التالف.")
            : (result.error || (en ? "Verification failed" : "فشل التحقق"))
        );
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (manifestId: string) => {
    playSfx("tap");
    const ok = await localModelPackManager.deleteModel(manifestId);
    if (ok) {
      toast.info(en ? "Model removed from local storage." : "تم حذف النموذج من الذاكرة المحلية.");
      await loadModelData();
    } else {
      toast.error(en ? "Cannot remove default offline bundle." : "لا يمكن حذف النموذج الأساسي المدمج.");
    }
  };

  // Upscaler Execution
  const handleSelectSample = () => {
    // Generate high-contrast geometric sample pattern for testing
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext("2d")!;

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, 320, 320);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#3b82f6");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 320);

    // High frequency geometric details
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    for (let r = 20; r < 140; r += 15) {
      ctx.beginPath();
      ctx.arc(160, 160, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 24px monospace";
    ctx.fillText("VIERON 2X", 95, 168);

    setTestImage(canvas.toDataURL("image/png"));
    setUpscaleResult(null);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setTestImage(ev.target?.result as string);
      setUpscaleResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRunUpscale = async () => {
    if (!testImage) return;

    setIsUpscaling(true);
    setUpscalePercent(5);
    setUpscaleStage(en ? "Initializing neural session..." : "تهيئة الجلسة العصبية...");
    playSfx("tap");

    try {
      const result = await imageUpscalerService.upscaleImage(testImage, {
        scale: upscaleScale,
        sharpenStrength,
        denoiseStrength,
        onProgress: (p) => {
          setUpscaleStage(p.message);
          setUpscalePercent(p.percent);
        },
      });

      setUpscaleResult(result);
      playSfx("success");
      toast.success(
        en
          ? `Upscaled to ${result.width}x${result.height} in ${result.timings.totalMs}ms!`
          : `تمت مضاعفة الدقة إلى ${result.width}x${result.height} خلال ${result.timings.totalMs}ms!`
      );
    } catch (err: any) {
      playSfx("error");
      toast.error(err.message || (en ? "Upscaling failed" : "فشلت المعالجة"));
    } finally {
      setIsUpscaling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir={rtl ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {en ? "Vieron Local AI Lab & Real Model Runtime" : "مختبر الذكاء الاصطناعي المحلي ونظام تشغيل النماذج"}
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {en ? "Phase 10: Real Engine" : "المرحلة 10: محرك حقيقي"}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {en
                  ? "Real on-device model execution, verified streaming downloads & cryptographic SHA-256 checks."
                  : "تشغيل محلي حقيقي للنماذج، وتنزيل تدفقي مباشر مع فحص تشفيري دقيق SHA-256."}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => {
              setActiveTab("models");
              playSfx("tap");
            }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "models"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HardDrive className="w-4 h-4" />
            {en ? "Model Packs & Integrity" : "حزم النماذج وفحص السلامة"}
          </button>

          <button
            onClick={() => {
              setActiveTab("upscaler");
              playSfx("tap");
            }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "upscaler"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            {en ? "Live 2x Super-Resolution Lab" : "مختبر رفع الدقة الفائق (2x)"}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "models" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    {en
                      ? "Zero fake hashes policy: models strictly verified with real SHA-256."
                      : "سياسة خلو الهاشات الوهمية: كل النماذج مفحوصة حاسوبياً بـ SHA-256 حقيقي."}
                  </span>
                </div>
                <div className="text-slate-400">
                  {en ? `${manifests.length} Catalogue Models` : `${manifests.length} نماذج في الكتالوج`}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {manifests.map((manifest) => {
                  const isInstalled = manifest.offlineDefault || installedModels.has(manifest.id);
                  const progress = downloadProgress[manifest.id];
                  const verification = verificationResults[manifest.id];
                  const isVerifying = verifyingId === manifest.id;

                  return (
                    <div
                      key={manifest.id}
                      className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between hover:border-slate-600 transition-all space-y-3"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-white text-sm">{manifest.name}</h3>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-700 text-slate-200">
                              {manifest.format}
                            </span>
                            {isInstalled ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" />
                                {en ? "Installed" : "مثبت"}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                {en ? "Available" : "متاح"}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{manifest.description}</p>

                        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-300">
                          <span className="bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/40">
                            {manifest.sizeBytes > 0
                              ? `${Math.round((manifest.sizeBytes / (1024 * 1024)) * 10) / 10} MB`
                              : "0 MB (Play Services)"}
                          </span>
                          <span className="bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/40">
                            {manifest.runtime}
                          </span>
                          <span className="bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/40">
                            RAM: {manifest.minRamMB}MB
                          </span>
                        </div>

                        {manifest.sha256 ? (
                          <div className="mt-2 text-[10px] font-mono text-slate-400 truncate bg-slate-950/50 p-1.5 rounded border border-slate-800">
                            SHA: {manifest.sha256.substring(0, 24)}...
                          </div>
                        ) : (
                          <div className="mt-2 text-[10px] text-amber-400/80 bg-amber-500/5 p-1 rounded border border-amber-500/20">
                            {en ? "Dynamic module / unverified" : "وحدة ديناميكية / غير مفحوصة"}
                          </div>
                        )}
                      </div>

                      {/* Download Progress */}
                      {progress && (
                        <div className="space-y-1.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-700">
                          <div className="flex justify-between text-xs text-slate-300">
                            <span className="capitalize">{progress.stage}</span>
                            <span className="font-semibold">{progress.percent}%</span>
                          </div>
                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full transition-all duration-200"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>{progress.speedMBps > 0 ? `${progress.speedMBps} MB/s` : ""}</span>
                            <span>{progress.etaSeconds > 0 ? `ETA: ${progress.etaSeconds}s` : ""}</span>
                          </div>
                        </div>
                      )}

                      {/* Verification Status Banner */}
                      {verification && (
                        <div
                          className={`p-2 rounded text-xs flex items-center gap-2 border ${
                            verification.isValid
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          {verification.isValid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span className="truncate">
                            {verification.isValid
                              ? en ? "Cryptographic SHA-256 Verified Match" : "تطابق تشفيري مؤكد بنسبة 100%"
                              : verification.error || "Integrity verification failed"}
                          </span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                        {progress ? (
                          <button
                            onClick={() => handleCancelDownload(manifest.id)}
                            className="flex-1 py-1.5 px-3 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            {en ? "Cancel" : "إلغاء"}
                          </button>
                        ) : !isInstalled ? (
                          <button
                            onClick={() => handleDownload(manifest)}
                            className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {en ? "Download & Install" : "تنزيل وتثبيت"}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleVerify(manifest.id)}
                              disabled={isVerifying}
                              className="flex-1 py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <FileCheck className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
                              {isVerifying ? (en ? "Calculating..." : "جارٍ الحساب...") : (en ? "Verify Hash" : "فحص الهاش")}
                            </button>

                            {!manifest.offlineDefault && manifest.format !== "native" && (
                              <button
                                onClick={() => handleDelete(manifest.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                                title={en ? "Delete model" : "حذف النموذج"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "upscaler" && (
            <div className="space-y-6">
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    {en ? "Vieron Neural Super-Resolution Engine (2x/4x)" : "محرك فيرون فائق الدقة (2x/4x)"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {en
                      ? "Executes sub-pixel convolutional inference on-device to restore sharp textures without cloud dependency."
                      : "ينفذ استدلالاً عصبياً دون الحاجة للإنترنت لإعادة بناء التفاصيل والحواف الحادة."}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectSample}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    {en ? "Load Test Pattern" : "نمط اختبار تجريبي"}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 rotate-180" />
                    {en ? "Upload Image" : "رفع صورة"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadFile}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    {en ? "Scale Factor" : "معامل التكبير"}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUpscaleScale(2)}
                      className={`flex-1 py-1 px-3 text-xs font-bold rounded-lg border transition-all ${
                        upscaleScale === 2
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300"
                      }`}
                    >
                      2x (Fast / Native)
                    </button>
                    <button
                      onClick={() => setUpscaleScale(4)}
                      className={`flex-1 py-1 px-3 text-xs font-bold rounded-lg border transition-all ${
                        upscaleScale === 4
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300"
                      }`}
                    >
                      4x (Ultra HD)
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>{en ? "Edge Sharpening" : "حدة الحواف"}</span>
                    <span>{Math.round(sharpenStrength * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sharpenStrength}
                    onChange={(e) => setSharpenStrength(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>{en ? "Texture Denoise" : "تنقية التحبيب"}</span>
                    <span>{Math.round(denoiseStrength * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={denoiseStrength}
                    onChange={(e) => setDenoiseStrength(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {/* Preview Comparison */}
              {testImage && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
                        <span>{en ? "Original Image" : "الصورة الأصلية"}</span>
                      </div>
                      <div className="aspect-square bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800/80">
                        <img src={testImage} alt="Original" className="max-w-full max-h-full object-contain" />
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center justify-between">
                        <span>{en ? "Super-Resolution Output" : "النتيجة الفائقة الدقة"}</span>
                        {upscaleResult && (
                          <span className="text-[11px] text-slate-400">
                            {upscaleResult.width}x{upscaleResult.height} ({upscaleResult.scale}x)
                          </span>
                        )}
                      </div>
                      <div className="aspect-square bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800/80 relative">
                        {upscaleResult ? (
                          <img
                            src={upscaleResult.outputDataUrl}
                            alt="Upscaled"
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : isUpscaling ? (
                          <div className="text-center p-4 space-y-2">
                            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
                            <p className="text-xs text-purple-300 font-semibold">{upscaleStage}</p>
                            <p className="text-[11px] text-slate-400">{upscalePercent}%</p>
                          </div>
                        ) : (
                          <div className="text-center p-4 text-xs text-slate-500">
                            {en ? "Click 'Run 2x Super-Resolution' below" : "اضغط على زر المعالجة أدناه للبدء"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Execution Metrics */}
                  {upscaleResult && (
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-[11px] text-slate-400">{en ? "Total Latency" : "الزمن الكلي"}</div>
                        <div className="text-base font-bold text-white mt-0.5">
                          {upscaleResult.timings.totalMs} ms
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">{en ? "Inference Kernel" : "زمن الاستدلال"}</div>
                        <div className="text-base font-bold text-emerald-400 mt-0.5">
                          {upscaleResult.timings.inferenceMs} ms
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">{en ? "Resolution Gain" : "مضاعفة البكسل"}</div>
                        <div className="text-base font-bold text-indigo-400 mt-0.5">
                          {upscaleResult.originalWidth}x{upscaleResult.originalHeight} → {upscaleResult.width}x{upscaleResult.height}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">{en ? "Peak Memory" : "استهلاك الذاكرة"}</div>
                        <div className="text-base font-bold text-purple-400 mt-0.5">
                          {upscaleResult.metrics.peakMemoryMB} MB
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={handleRunUpscale}
                      disabled={isUpscaling}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isUpscaling ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {isUpscaling
                        ? (en ? "Processing Tensor..." : "جارٍ معالجة التنسور...")
                        : (en ? `Execute ${upscaleScale}x Super-Resolution` : `تنفيذ رفع الدقة (${upscaleScale}x)`)}
                    </button>

                    {upscaleResult && onOpenPhotoEditor && (
                      <button
                        onClick={() => {
                          onOpenPhotoEditor(upscaleResult.outputDataUrl);
                          onClose();
                        }}
                        className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Sliders className="w-4 h-4" />
                        {en ? "Open in Photo Editor" : "فتح في محرر الصور"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
