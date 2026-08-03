import { useState } from "react";
import {
  Sparkles, X, Wand2, Image as ImageIcon, Video, Music,
  Trash2, Sliders, Zap, Check, Loader2, Gauge,
  UserCircle, Scissors, Palette, Volume2, Shield
} from "lucide-react";
import { useMedia } from "@/context/MediaContext";
import { aiRuntime, AIToolId } from "@/services/ai/AIRuntime";
import { toast } from "sonner";
import { isRTL } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AITool {
  id: AIToolId;
  icon: any;
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
  category: "image" | "audio" | "video";
}

const TOOLS: AITool[] = [
  { id: "remove-background", icon: UserCircle, label: "إزالة الخلفية", labelEn: "Remove Background", desc: "إزالة خلفية الصور بدقة عالية", descEn: "High precision background removal", category: "image" },
  { id: "upscale-image", icon: Maximize2, label: "تحسين جودة الصور", labelEn: "Upscale Image", desc: "زيادة دقة الصور وتحسين تفاصيلها", descEn: "Increase resolution & enhance details", category: "image" },
  { id: "denoise-image", icon: Shield, label: "إزالة التشويش", labelEn: "Denoise Image", desc: "إزالة النويز والتشويش من الصور", descEn: "Clean noise & grain from photos", category: "image" },
  { id: "face-enhance", icon: Sparkles, label: "تحسين الوجه", labelEn: "Face Enhance", desc: "تجميل وترميم ملامح الوجه", descEn: "Beautify & restore face details", category: "image" },
  { id: "remove-object", icon: Trash2, label: "إزالة العناصر", labelEn: "Remove Object", desc: "مسح أي عنصر غير مرغوب فيه", descEn: "Erase unwanted objects with AI", category: "image" },
  { id: "audio-denoise", icon: Volume2, label: "إزالة ضوضاء الصوت", labelEn: "Denoise Audio", desc: "تنظيف الصوت من الضوضاء الخلفية", descEn: "Clean background noise from audio", category: "audio" },
  { id: "audio-enhance", icon: Wand2, label: "تحسين الصوت", labelEn: "Enhance Audio", desc: "جعل الصوت يبدو كأنه في استوديو", descEn: "Studio quality vocal enhancement", category: "audio" },
  { id: "vocal-separation", icon: Music, label: "فصل الصوت", labelEn: "Vocal Separation", desc: "فصل الصوت عن الموسيقى", descEn: "Separate vocals from background music", category: "audio" },
  { id: "video-denoise", icon: Video, label: "إزالة ضوضاء الفيديو", labelEn: "Denoise Video", desc: "تحسين نقاء لقطات الفيديو", descEn: "Improve video clarity & reduce grain", category: "video" },
  { id: "video-upscale", icon: Gauge, label: "تحسين جودة الفيديو", labelEn: "Upscale Video", desc: "زيادة دقة الفيديو إلى 4K", descEn: "Upscale video resolution to 4K", category: "video" },
  { id: "video-stabilize", icon: Zap, label: "تثبيت الفيديو", labelEn: "Stabilize Video", desc: "تقليل اهتزاز الكاميرا", descEn: "Reduce camera shake & jitters", category: "video" },
  { id: "color-enhance", icon: Palette, label: "تحسين الألوان", labelEn: "Color Enhance", desc: "تصحيح ألوان سينمائي تلقائي", descEn: "Auto cinematic color correction", category: "video" },
];

import { Maximize2 } from "lucide-react"; // Re-import for specific usage

export default function AIToolsPanel({ open, onClose }: Props) {
  const { media, clips, addFiles, updateMedia } = useMedia();
  const [processing, setProcessing] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");
  const ar = isRTL();

  const handleRunTool = async (tool: AITool) => {
    if (processing) return;

    // Determine target media (current active or first)
    const targetMedia = media.length > 0 ? media[0] : null;
    if (!targetMedia) {
        toast.error(ar ? "يرجى إضافة وسائط أولاً!" : "Please add media first!");
        return;
    }

    setProcessing(tool.id);
    setProgress(0);
    setMsg(ar ? "جاري البدء..." : "Starting AI...");

    try {
      const result = await aiRuntime.runTool(tool.id, targetMedia.file, {
        onProgress: (p, m) => {
          setProgress(p * 100);
          setMsg(m);
        }
      });

      if (result.success && result.url) {
        toast.success(ar ? "تمت العملية بنجاح!" : "AI process completed!");
        // Logic to update the project with the new result
        // For now we add it as a new file
        if (result.blob) {
            const newFile = new File([result.blob], `ai_${tool.id}_${targetMedia.name}`, { type: result.blob.type });
            await addFiles([newFile]);
        }
      } else {
        toast.error(result.error || (ar ? "فشلت العملية" : "Process failed"));
      }
    } catch (err) {
      console.error(err);
      toast.error(ar ? "حدث خطأ غير متوقع" : "An unexpected error occurred");
    } finally {
      setProcessing(null);
      setProgress(0);
      setMsg("");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={ar ? "rtl" : "ltr"}>
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[75vh] overflow-y-auto no-scrollbar pb-10">
        <div className="flex items-center justify-between mb-5 sticky top-0 bg-card z-10 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-foreground">
                {ar ? "مختبر Vireon AI" : "Vireon AI Lab"}
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {ar ? "أدوات معالجة متقدمة مدعومة بالذكاء الاصطناعي" : "Advanced AI-powered media processing tools"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {processing && (
          <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-3 animate-pulse">
            <div className="flex items-center justify-between text-xs font-bold text-primary">
              <span>{ar ? `جاري تشغيل ${TOOLS.find(t => t.id === processing)?.label}...` : `Running ${TOOLS.find(t => t.id === processing)?.labelEn}...`}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full gradient-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-center text-muted-foreground">{msg}</p>
          </div>
        )}

        <div className="space-y-6">
          {(["video", "image", "audio"] as const).map((cat) => (
            <div key={cat} className="space-y-3">
              <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-widest px-1">
                {cat === "video" ? (ar ? "فيديو" : "Video") : cat === "image" ? (ar ? "صور" : "Images") : (ar ? "صوتيات" : "Audio")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TOOLS.filter(t => t.category === cat).map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => handleRunTool(tool)}
                    disabled={!!processing}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-start group active:scale-95 ${
                      processing === tool.id
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      processing === tool.id ? "bg-primary text-primary-foreground" : "bg-card text-primary group-hover:bg-primary/10"
                    }`}>
                      <tool.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{ar ? tool.label : tool.labelEn}</p>
                      <p className="text-[9px] text-muted-foreground line-clamp-1">{ar ? tool.desc : tool.descEn}</p>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Wand2 className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex gap-3 items-start">
          <Shield className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-amber-600">
              {ar ? "خصوصيتك محمية" : "Privacy Protected"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {ar ? "تتم معالجة معظم هذه الأدوات محلياً على جهازك. لا يتم إرسال بياناتك إلى أي خادم خارجي إلا عند الضرورة القصوى وبالتشفير الكامل." : "Most of these tools process locally on your device. Your data is not sent to external servers unless strictly necessary and with full encryption."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
