import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Wand2,
  Download,
  Share2,
  RefreshCw,
  Sliders,
  Image as ImageIcon,
  Crop,
  Layers,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Video,
  Eye,
  Zap,
  Flame,
  X,
  Plus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { aiRuntime } from "@/ai/runtime/AIRuntime";
import { ImageGenerationPayload, FluxImageResult, FluxOutputFormat } from "@/ai/types/ai";
import { PromptBuilder } from "@/ai/builder/PromptBuilder";
import { useMedia } from "@/context/MediaContext";
import { getLang, isRTL } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

export interface FluxImageCreatorProps {
  onClose?: () => void;
  onOpenPhotoEditor?: (imageUrl: string) => void;
  onOpenVideoEditor?: (imageUrl: string) => void;
}

const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1 Square", labelAr: "1:1 مربع", ratio: "1:1", icon: "⏹️" },
  { id: "16:9", label: "16:9 Landscape", labelAr: "16:9 أفقي", ratio: "16:9", icon: "🖥️" },
  { id: "9:16", label: "9:16 Story/Reels", labelAr: "9:16 ستوري/ريلز", ratio: "9:16", icon: "📱" },
  { id: "4:3", label: "4:3 Classic", labelAr: "4:3 كلاسيكي", ratio: "4:3", icon: "🖼️" },
  { id: "3:4", label: "3:4 Portrait", labelAr: "3:4 بورتريه", ratio: "3:4", icon: "📸" },
  { id: "21:9", label: "21:9 Ultrawide", labelAr: "21:9 عريض سينمائي", ratio: "21:9", icon: "🎬" },
];

const STYLE_PRESETS = [
  { id: "none", nameEn: "No Style Preset", nameAr: "بدون نمط محدد", promptSuffix: "" },
  { id: "cinematic", nameEn: "Cinematic Movie", nameAr: "سينمائي محترف", promptSuffix: ", 8k resolution, cinematic lighting, photorealistic, 35mm lens, masterpiece, movie still" },
  { id: "photorealistic", nameEn: "Ultra Realistic Photo", nameAr: "صورة واقعية فائقة", promptSuffix: ", hyperrealistic portrait photography, crisp focus, soft natural light, studio depth of field" },
  { id: "anime", nameEn: "Anime & Manga", nameAr: "أنمي ومانغا", promptSuffix: ", studio ghibli anime style, vibrant pastel colors, detailed digital illustration, sharp linework" },
  { id: "cyberpunk", nameEn: "Cyberpunk Neon", nameAr: "سايبربانك نيون", promptSuffix: ", cyberpunk night city, glowing neon lights, futuristic reflections, dark aesthetic, rainy streets" },
  { id: "3d-render", nameEn: "3D Pixar / Unreal", nameAr: "ثلاثي الأبعاد 3D", promptSuffix: ", 3D render, blender 3d masterpiece, soft clay lighting, octane render, smooth textures" },
  { id: "fantasy", nameEn: "Fantasy & Magic", nameAr: "خيال وسحر", promptSuffix: ", epic fantasy digital painting, glowing magical aura, intricate armor details, atmospheric fog" },
  { id: "calligraphy", nameEn: "Arabic Calligraphy Art", nameAr: "خط عربي وسحر شرقي", promptSuffix: ", luxury Arabic typography art, golden filigree details, deep dark background, illuminated manuscript" },
  { id: "vintage", nameEn: "Retro Vintage 80s", nameAr: "فينتاج ريترو", promptSuffix: ", retro 80s aesthetic, film grain, muted warm vintage colors, analog camera effect" },
];

const PROMPT_SUGGESTIONS = [
  { textEn: "A majestic golden falcon soaring above futuristic skyscraper towers at sunset", textAr: "صقر ذهبي مهيب يحلق فوق أبراج المستقبل عند الغروب" },
  { textEn: "Cinematic macro shot of a glowing crystal cybernetic butterfly on a neon rain flower", textAr: "لقطة سينمائية لفرشة نيون كريستالية على زهرة مبللة بالمطر" },
  { textEn: "Ultra-detailed portrait of an Arabic warrior queen with intricate gold armor", textAr: "بورتريه واقعي لملكة عربية محاربة بدرع ذهبي مزخرف" },
  { textEn: "A cozy aesthetic cafe interior with warm morning light streaming through large windows", textAr: "مقهى دافئ وهادئ تشرق فيه أشعة الشمس عبر النوافذ الكبيرة" },
];

export const FluxImageCreator: React.FC<FluxImageCreatorProps> = ({
  onClose,
  onOpenPhotoEditor,
  onOpenVideoEditor,
}) => {
  const en = getLang() === "en";
  const rtl = isRTL();
  const { addFiles } = useMedia();

  // Form Controls State
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1024x1024");
  const [batchCount, setBatchCount] = useState<number>(1);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [guidanceScale, setGuidanceScale] = useState<number>(3.5);
  const [steps, setSteps] = useState<number>(28);
  const [safetyMode, setSafetyMode] = useState<number>(2);
  const [outputFormat, setOutputFormat] = useState<FluxOutputFormat>("jpeg");
  const [seed, setSeed] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Execution State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const [generatedResults, setGeneratedResults] = useState<FluxImageResult[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState<number>(0);

  // Handle generation via AI Runtime & AIManager -> FluxProvider
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(en ? "Please enter a descriptive prompt first" : "يرجى كتابة وصف الصورة أولاً");
      return;
    }

    playSfx("pop");
    setIsGenerating(true);
    setProgressPercent(10);
    setProgressStage(en ? "Connecting to FLUX.1 Engine..." : "جاري الاتصال بمحرك FLUX.1...");

    const styleObj = STYLE_PRESETS.find((s) => s.id === selectedStyle);
    const builtPrompt = PromptBuilder.build(prompt, styleObj ? styleObj.promptSuffix : "");

    const jobId = `job_flux_${Date.now()}`;
    const unsubscribe = aiRuntime.subscribeProgress(jobId, (p) => {
      setProgressPercent(p.percentage);
      if (p.currentStage) setProgressStage(p.currentStage);
    });

    aiRuntime.progressManager.createProgress(jobId, en ? "Initiating FLUX.1 generation..." : "بدء توليد FLUX.1...");

    try {
      const results: FluxImageResult[] = [];

      for (let i = 0; i < batchCount; i++) {
        const stepProgress = Math.round(15 + (i / batchCount) * 75);
        aiRuntime.progressManager.updateProgress(
          jobId,
          stepProgress,
          en ? `Generating Image ${i + 1} of ${batchCount}...` : `جاري توليد الصورة ${i + 1} من ${batchCount}...`,
          "processing"
        );

        const currentSeedNum = seed ? parseInt(seed, 10) + i : Math.floor(Math.random() * 1000000);

        const response = await aiRuntime.runTask<ImageGenerationPayload, FluxImageResult>(
          "image-generation",
          {
            prompt: builtPrompt.finalPrompt,
            rawPrompt: builtPrompt.rawPrompt,
            negativePrompt: negativePrompt.trim() || undefined,
            aspectRatio,
            imageSize: resolution,
            guidance: guidanceScale,
            steps,
            safetyMode,
            outputFormat,
            seed: currentSeedNum,
            model: "flux-pro-1.1",
            style: selectedStyle !== "none" ? selectedStyle : undefined,
          },
          {
            executionMode: "cloud",
            preferredProvider: "flux",
            enableCache: false,
          }
        );

        if (response.success && response.data) {
          const res = response.data;
          results.push(res);

          // Save into AIHistoryManager using recordJob
          aiRuntime.historyManager.recordJob(
            "image-generation",
            response.providerUsed || "flux",
            res.executionTimeMs || 2500,
            `hash_flux_${Date.now()}_${i}`,
            true,
            builtPrompt.finalPrompt.slice(0, 80),
            `FLUX.1 Image ${res.width || 1024}x${res.height || 1024}`,
            res
          );
        } else {
          throw new Error(response.error?.message || (en ? "FLUX.1 Generation Failed" : "فشل توليد الصورة"));
        }
      }

      aiRuntime.progressManager.updateProgress(jobId, 100, en ? "Generation Completed!" : "تم التوليد بنجاح!", "completed");
      setGeneratedResults(results);
      setActiveResultIndex(0);
      playSfx("success");
      toast.success(en ? `Successfully created ${results.length} FLUX.1 image(s)!` : `تم توليد ${results.length} صورة بنجاح!`);
    } catch (err: any) {
      console.error("[FluxImageCreator] Generation error:", err);
      toast.error(err?.message || (en ? "Failed to generate image with FLUX.1" : "حدث خطأ أثناء التوليد"));
    } finally {
      unsubscribe();
      setIsGenerating(false);
    }
  };

  // Helper to store generated image to App Media Library
  const saveToMediaLibrary = async (imageUrl: string, name: string = "FLUX_AI_Image.png") => {
    try {
      let blob: Blob;
      try {
        const resp = await fetch(imageUrl);
        blob = await resp.blob();
      } catch {
        // Proxy fallback if direct fetch hits CORS
        const proxyResp = await fetch(`https://corsproxy.io/?${encodeURIComponent(imageUrl)}`);
        blob = await proxyResp.blob();
      }
      const file = new File([blob], `${name}_${Date.now()}.${outputFormat}`, { type: blob.type || `image/${outputFormat}` });
      await addFiles([file]);
      return true;
    } catch (e) {
      console.error("Failed to add generated image to media context:", e);
      return false;
    }
  };

  // Action Handlers
  const handleUseInPhotoEditor = async (imageUrl: string) => {
    playSfx("pop");
    await saveToMediaLibrary(imageUrl, "FLUX_Photo_Edit");
    if (onOpenPhotoEditor) {
      onOpenPhotoEditor(imageUrl);
    } else {
      toast.info(en ? "Image added to Photo Editor gallery!" : "تمت إضافة الصورة لمعرض محرر الصور!");
    }
  };

  const handleUseInVideoEditor = async (imageUrl: string) => {
    playSfx("pop");
    const success = await saveToMediaLibrary(imageUrl, "FLUX_Video_Clip");
    if (success) {
      toast.success(en ? "Image added to Video Clip library!" : "تمت إضافة الصورة لمقاطع الفيديو!");
    }
    if (onOpenVideoEditor) {
      onOpenVideoEditor(imageUrl);
    }
  };

  const handleDownload = (imageUrl: string) => {
    playSfx("click");
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `Vireon_FLUX1_${Date.now()}.${outputFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(en ? "Image downloaded to your device!" : "تم تنزيل الصورة على جهازك!");
  };

  const handleShare = async (imageUrl: string) => {
    playSfx("click");
    if (navigator.share) {
      try {
        await navigator.share({
          title: "FLUX.1 AI Image",
          text: prompt || "Created with Vireon FLUX.1 AI Engine",
          url: imageUrl,
        });
        return;
      } catch {
        // Fallback
      }
    }
    try {
      await navigator.clipboard.writeText(imageUrl);
      toast.success(en ? "Image URL copied to clipboard!" : "تم نسخ رابط الصورة إلى الحافظة!");
    } catch {
      toast.error(en ? "Unable to share" : "تعذر المشاركة");
    }
  };

  const activeResult = generatedResults[activeResultIndex];

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl bg-card border border-border/80 p-5 shadow-2xl animate-fade-in" dir={rtl ? "rtl" : "ltr"}>
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-base font-bold text-foreground">
                {en ? "FLUX.1 AI Image Generator" : "منشئ الصور الذكي FLUX.1"}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-extrabold uppercase">
                BFL FLUX.1
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {en ? "High-fidelity Text-to-Image generation powered by Black Forest Labs" : "توليد صور فائقة الدقة والواقعية باستخدام محرك FLUX.1 الرسمية"}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={() => {
              playSfx("click");
              onClose();
            }}
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Grid: Left Controls, Right Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Inputs */}
        <div className="lg:col-span-7 space-y-4">
          {/* Prompt Input Box */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                <span>{en ? "Prompt Description" : "وصف الصورة (Prompt)"}</span>
              </label>
              <button
                type="button"
                onClick={() => setPrompt("")}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                {en ? "Clear" : "مسح النص"}
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                en
                  ? "Describe what you want to generate in detail (e.g. A hyperrealistic futuristic cybernetic tiger with glowing azure stripes in a dark neon rain forest)..."
                  : "صف ما تريد إنشاءه بالتفصيل (مثال: نمر سيبيري محارب بتفاصيل سينمائية تحت إضاءة القمر الذهبي)..."
              }
              rows={3}
              className="w-full rounded-2xl bg-secondary/50 border border-border p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-purple-500 transition-colors resize-none"
            />
          </div>

          {/* Quick Prompt Ideas */}
          <div>
            <span className="text-[10px] font-bold text-muted-foreground block mb-1">
              {en ? "💡 Click for Prompt Inspiration:" : "💡 افكار وصف جاهزة للاقتراح:"}
            </span>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {PROMPT_SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    playSfx("click");
                    setPrompt(en ? sug.textEn : sug.textAr);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-secondary/70 border border-border/80 text-[10px] text-muted-foreground hover:text-foreground hover:border-purple-500/50 transition-all whitespace-nowrap"
                >
                  ✨ {en ? sug.textEn.slice(0, 32) : sug.textAr.slice(0, 32)}...
                </button>
              ))}
            </div>
          </div>

          {/* Style Presets */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1.5">
              🎨 {en ? "Visual Style Preset" : "النمط والطابع البصري"}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {STYLE_PRESETS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    playSfx("click");
                    setSelectedStyle(st.id);
                  }}
                  className={`p-2 rounded-xl text-left border text-[11px] font-semibold transition-all truncate ${
                    selectedStyle === st.id
                      ? "bg-purple-500/15 border-purple-500 text-purple-400 font-bold"
                      : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {en ? st.nameEn : st.nameAr}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Selector */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1.5">
              📐 {en ? "Aspect Ratio & Dimensions" : "أبعاد الصورة ونسبة العرض"}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => {
                    playSfx("click");
                    setAspectRatio(ar.ratio);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-[10px] font-bold transition-all ${
                    aspectRatio === ar.ratio
                      ? "bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm"
                      : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-sm mb-0.5">{ar.icon}</span>
                  <span>{ar.ratio}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Batch Count Selection */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30 border border-border">
            <div>
              <span className="text-xs font-bold text-foreground block">{en ? "Image Generation Count" : "عدد الصور المتولدة"}</span>
              <span className="text-[10px] text-muted-foreground">{en ? "Generate multiple variations at once" : "توليد عدة تنويعات متزامنة"}</span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    playSfx("click");
                    setBatchCount(cnt);
                  }}
                  className={`w-8 h-8 rounded-xl font-bold text-xs border flex items-center justify-center transition-all ${
                    batchCount === cnt
                      ? "bg-purple-600 text-white border-purple-400 shadow-md"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle Advanced Controls */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                {showAdvanced
                  ? en ? "Hide Advanced Settings" : "إخفاء الإعدادات المتقدمة"
                  : en ? "Show Advanced Settings (Seed, Steps, Guidance)" : "عرض الإعدادات المتقدمة (الخطوات، الإرشادات)"}
              </span>
            </button>

            {showAdvanced && (
              <div className="mt-2.5 p-3.5 rounded-2xl bg-secondary/30 border border-border space-y-3 animate-fade-in">
                {/* Negative Prompt */}
                <div>
                  <label className="text-[11px] font-bold text-foreground block mb-1">
                    {en ? "Negative Prompt (What to exclude)" : "الوصف السلبي (استبعاد عناصر)"}
                  </label>
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder={en ? "e.g. blur, low quality, noise, watermark" : "مثال: تشويش، نص، جودة منخفضة"}
                    className="w-full rounded-xl bg-card border border-border px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Guidance & Steps Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-foreground mb-1">
                      <span>{en ? "Guidance Scale:" : "قوة التوجيه:"}</span>
                      <span className="text-purple-400">{guidanceScale}</span>
                    </div>
                    <input
                      type="range"
                      min="1.5"
                      max="10.0"
                      step="0.5"
                      value={guidanceScale}
                      onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-foreground mb-1">
                      <span>{en ? "Inference Steps:" : "عدد الخطوات:"}</span>
                      <span className="text-purple-400">{steps}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      step="1"
                      value={steps}
                      onChange={(e) => setSteps(parseInt(e.target.value, 10))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Output Format & Seed */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      {en ? "Output Format" : "صيغة الصورة"}
                    </label>
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value as FluxOutputFormat)}
                      className="w-full rounded-xl bg-card border border-border px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-purple-500"
                    >
                      <option value="jpeg">JPEG</option>
                      <option value="png">PNG</option>
                      <option value="webp">WEBP</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      {en ? "Seed (Optional)" : "بذرة التوليد Seed"}
                    </label>
                    <input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      placeholder={en ? "Random" : "عشوائي"}
                      className="w-full rounded-xl bg-card border border-border px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white font-extrabold text-xs shadow-xl shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{en ? "FLUX.1 Neural Synthesis..." : "جاري توليد الصورة بمحرك FLUX.1..."}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>{en ? `Generate FLUX.1 Image (${batchCount})` : `توليد الصور باستخدام FLUX.1 (${batchCount})`}</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Output Preview & Actions */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div className="flex flex-col h-full">
            <h3 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
              <span>{en ? "Generated Output & Canvas" : "نتيجة التوليد والأنشطة"}</span>
            </h3>

            {/* Progress Display */}
            {isGenerating && (
              <div className="flex-1 min-h-[260px] rounded-2xl bg-secondary/40 border border-border p-6 flex flex-col items-center justify-center text-center animate-pulse">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4">
                  <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                </div>
                <h4 className="font-bold text-sm text-foreground mb-1">
                  {progressStage || (en ? "Synthesizing FLUX.1 Latent Layers..." : "جاري المعالجة بواسطة FLUX.1...")}
                </h4>
                <p className="text-[11px] text-muted-foreground mb-4">
                  {en ? "Black Forest Labs FLUX.1 Neural Engine" : "معالجة عصبونية فائقة الجودة من Black Forest Labs"}
                </p>

                {/* Progress Bar */}
                <div className="w-full max-w-xs h-2 rounded-full bg-background overflow-hidden border border-border">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-amber-400 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono font-bold text-purple-400 mt-2">{progressPercent}%</span>
              </div>
            )}

            {/* Result Image View */}
            {!isGenerating && activeResult && (
              <div className="flex-1 flex flex-col justify-between space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-border bg-black/60 min-h-[260px] max-h-[380px] flex items-center justify-center group shadow-inner">
                  <img
                    src={activeResult.outputImageBase64OrUrl}
                    alt="FLUX Generated"
                    className="max-h-[380px] w-full object-contain"
                  />
                  <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-mono text-white border border-white/20">
                    {activeResult.width}x{activeResult.height} • {activeResult.executionTimeMs}ms
                  </div>
                </div>

                {/* Multiple Results Thumbnail Picker */}
                {generatedResults.length > 1 && (
                  <div className="flex gap-2 justify-center">
                    {generatedResults.map((res, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveResultIndex(idx)}
                        className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                          activeResultIndex === idx ? "border-purple-500 scale-105" : "border-transparent opacity-60"
                        }`}
                      >
                        <img src={res.outputImageBase64OrUrl} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Action Buttons Panel */}
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleUseInPhotoEditor(activeResult.outputImageBase64OrUrl)}
                      className="py-2.5 px-3 rounded-xl bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 text-blue-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>{en ? "Use in Photo Editor" : "محرر الصور"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUseInVideoEditor(activeResult.outputImageBase64OrUrl)}
                      className="py-2.5 px-3 rounded-xl bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>{en ? "Use in Video Editor" : "محرر الفيديو"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(activeResult.outputImageBase64OrUrl)}
                      className="py-2 px-2.5 rounded-xl bg-secondary border border-border hover:bg-secondary/80 text-foreground font-semibold text-[11px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{en ? "Save" : "حفظ"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShare(activeResult.outputImageBase64OrUrl)}
                      className="py-2 px-2.5 rounded-xl bg-secondary border border-border hover:bg-secondary/80 text-foreground font-semibold text-[11px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{en ? "Share" : "مشاركة"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="py-2 px-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-300 font-semibold text-[11px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{en ? "Retry" : "إعادة"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State placeholder */}
            {!isGenerating && !activeResult && (
              <div className="flex-1 min-h-[260px] rounded-2xl border-2 border-dashed border-border bg-secondary/20 p-6 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-3">
                  <Sparkles className="w-7 h-7 text-purple-400" />
                </div>
                <h4 className="font-bold text-xs text-foreground mb-1">
                  {en ? "Ready to Create with FLUX.1" : "جاهز للتوليد باستخدام FLUX.1"}
                </h4>
                <p className="text-[10px] text-muted-foreground max-w-xs">
                  {en
                    ? "Enter your text prompt on the left and hit generate to synthesize high-resolution images instantly."
                    : "اكتب وصف الصورة في الخانة اليسرى واضغط زر التوليد لبدء الإنتاج الفوري."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
