import { useState, useEffect, useRef } from "react";
import { useMedia, Caption, CaptionAnimation, CaptionTemplate } from "@/context/MediaContext";
import { useAdGate } from "@/context/AdGateContext";
import { X, Plus, Trash2, Type, Languages, Sparkles, Loader2, Palette, Eye, EyeOff, Check, Music, AlertTriangle, CheckCircle2, RotateCw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { extractAudioBase64 } from "@/lib/audioExtract";
import { localTranscribe } from "@/lib/localTranscribe";
import { analyzeAudioTrack } from "@/lib/beatDetector";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";


interface Props {
  open: boolean;
  onClose: () => void;
  currentTime: number;
}

const FONTS = [
  "Cairo",
  "Tajawal",
  "Almarai",
  "Amiri",
  "Changa",
  "El Messiri",
  "Reem Kufi",
  "Lalezar",
  "Aref Ruqaa",
  "Rakkas",
  "Markazi Text",
  "Kufam",
  "Lemonada",
  "Mada",
  "Harmattan",
  "Marhey",
  "Alexandria",
  "IBM Plex Sans Arabic",
  "Noto Sans Arabic",
  "Vibes",
  "Plus Jakarta Sans",
  "Syne",
  "Inter",
  "Bebas Neue",
  "Archivo Black",
  "Space Grotesk",
  "Montserrat",
  "Oswald",
  "Outfit",
  "Playfair Display",
  "Fira Code",
  "JetBrains Mono",
  "Sacramento",
  "Fredoka",
  "Cinzel"
];
const LANGS = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "tr", label: "Türkçe" },
  { code: "de", label: "Deutsch" },
];
const POSITIONS: Array<"top" | "center" | "bottom"> = ["top", "center", "bottom"];

const COLOR_SWATCHES = [
  "#ffffff",
  "#000000",
  "#fde047",
  "#f97316",
  "#ef4444",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

const BG_SWATCHES = [
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0.55)",
  "rgba(0,0,0,0.85)",
  "rgba(255,255,255,0.85)",
  "rgba(59,130,246,0.85)",
  "rgba(239,68,68,0.85)",
  "rgba(168,85,247,0.85)",
  "rgba(34,197,94,0.85)",
];

const ANIMATIONS: { id: CaptionAnimation; label: string; labelEn: string }[] = [
  { id: "none", label: "بدون", labelEn: "None" },
  { id: "fade", label: "تلاشي", labelEn: "Fade" },
  { id: "slide-up", label: "صعود", labelEn: "Slide Up" },
  { id: "slide-down", label: "نزول", labelEn: "Slide Down" },
  { id: "pop", label: "بوب", labelEn: "Pop" },
  { id: "typewriter", label: "آلة كاتبة", labelEn: "Typewriter" },
  { id: "bounce", label: "قفز حيوي", labelEn: "Bounce" },
  { id: "glitch", label: "جليتش", labelEn: "Glitch" },
  { id: "zoom-fade", label: "تلاشي زوم", labelEn: "Zoom Fade" },
  { id: "scale-up", label: "تمدد لأعلى", labelEn: "Scale Up" },
  { id: "rotate-in", label: "دوران أنيق", labelEn: "Rotate In" },
  { id: "blur-in", label: "تمويه سينمائي", labelEn: "Blur In" },
  { id: "elastic-drop", label: "سقوط مرن 🎈", labelEn: "Elastic Drop" },
  { id: "swing-in", label: "أرجوحة 3D 🎪", labelEn: "3D Swing In" },
  { id: "reveal-left", label: "كشف لليسار ⬅️", labelEn: "Reveal Left" },
  { id: "reveal-right", label: "كشف لليمين ➡️", labelEn: "Reveal Right" },
  { id: "heartbeat", label: "نبض القلب 💖", labelEn: "Heartbeat" },
  { id: "neon-flicker", label: "نيون ساطع ⚡", labelEn: "Neon Flicker" },
  { id: "3d-flip", label: "قلب 3D 🌀", labelEn: "3D Flip" },
  { id: "wave-bounce", label: "موجة 🌊", labelEn: "Wave Bounce" },
  { id: "curtain-reveal", label: "ستارة 🎭", labelEn: "Curtain Reveal" },
  { id: "shatter-pop", label: "انفجار 💥", labelEn: "Shatter Pop" },
];

const TEMPLATES: (CaptionTemplate & { nameEn: string })[] = [
  {
    id: "classic",
    name: "كلاسيكي",
    nameEn: "Classic",
    font: "Plus Jakarta Sans",
    size: 18,
    color: "#ffffff",
    bg: "rgba(0,0,0,0.55)",
    animation: "fade",
  },
  {
    id: "anime-punch",
    name: "أنمي حماسي ⚡",
    nameEn: "Anime Punch ⚡",
    font: "Cairo",
    size: 24,
    color: "#facc15",
    bg: "rgba(0,0,0,0.0)",
    animation: "bounce",
  },
  {
    id: "neon",
    name: "نيون توهج",
    nameEn: "Neon Glow",
    font: "Bebas Neue",
    size: 26,
    color: "#fde047",
    bg: "rgba(0,0,0,0.85)",
    animation: "pop",
  },
  {
    id: "vhs-glitch",
    name: "جليتش ريترو 📼",
    nameEn: "VHS Glitch 📼",
    font: "JetBrains Mono",
    size: 20,
    color: "#22d3ee",
    bg: "rgba(0,0,0,0.85)",
    animation: "glitch",
  },
  {
    id: "tiktok",
    name: "تيك توك",
    nameEn: "TikTok",
    font: "Archivo Black",
    size: 22,
    color: "#ffffff",
    bg: "rgba(0,0,0,0.0)",
    animation: "slide-up",
  },
  {
    id: "dreamy-blur",
    name: "تمويه حالم 🌸",
    nameEn: "Dreamy Blur 🌸",
    font: "Outfit",
    size: 22,
    color: "#ffffff",
    bg: "rgba(168,85,247,0.3)",
    animation: "blur-in",
  },
  {
    id: "elegant",
    name: "أنيق سينمائي",
    nameEn: "Elegant Cine",
    font: "Syne",
    size: 20,
    color: "#ffffff",
    bg: "rgba(59,130,246,0.85)",
    animation: "fade",
  },
  {
    id: "cinematic-zoom",
    name: "سينمائي زووم 🎬",
    nameEn: "Cinematic Zoom 🎬",
    font: "Playfair Display",
    size: 24,
    color: "#ffffff",
    bg: "rgba(0,0,0,0.0)",
    animation: "zoom-fade",
  },
  {
    id: "bold-red",
    name: "أحمر جريء",
    nameEn: "Bold Red",
    font: "Archivo Black",
    size: 24,
    color: "#ffffff",
    bg: "rgba(239,68,68,0.9)",
    animation: "pop",
  },
  {
    id: "subtitle",
    name: "ترجمة كلاسيكية",
    nameEn: "Classic Subtitle",
    font: "Cairo",
    size: 16,
    color: "#ffffff",
    bg: "rgba(0,0,0,0.7)",
    animation: "fade",
  },
  {
    id: "retro-vhs",
    name: "ريترو VHS",
    nameEn: "Retro VHS",
    font: "JetBrains Mono",
    size: 17,
    color: "#22d3ee",
    bg: "rgba(15,23,42,0.85)",
    animation: "typewriter",
  },
  {
    id: "outline-yellow",
    name: "محدد بالأصفر",
    nameEn: "Yellow Outline",
    font: "Fredoka",
    size: 23,
    color: "#facc15",
    bg: "rgba(0,0,0,0.8)",
    animation: "pop",
  },
  {
    id: "royal-gold",
    name: "ذهبي ملكي",
    nameEn: "Royal Gold",
    font: "Cairo",
    size: 21,
    color: "#fbbf24",
    bg: "rgba(45,0,0,0.75)",
    animation: "fade",
  },
  {
    id: "sweet-pink",
    name: "وردي ناعم",
    nameEn: "Sweet Pink",
    font: "Sacramento",
    size: 28,
    color: "#f472b6",
    bg: "rgba(24,24,27,0.7)",
    animation: "pop",
  },
  {
    id: "outline-emerald",
    name: "زمردي محدد",
    nameEn: "Emerald Outline",
    font: "Outfit",
    size: 22,
    color: "#10b981",
    bg: "rgba(0,0,0,0.85)",
    animation: "slide-up",
  },
  {
    id: "arabian-vibes",
    name: "سحر الشرقي ✨",
    nameEn: "Arabian Vibes ✨",
    font: "Vibes",
    size: 28,
    color: "#fbbf24",
    bg: "rgba(88,28,135,0.7)",
    animation: "swing-in",
  },
  {
    id: "playful-marhey",
    name: "مرح كرتوني 🎈",
    nameEn: "Playful Marhey 🎈",
    font: "Marhey",
    size: 25,
    color: "#ffffff",
    bg: "rgba(249,115,22,0.85)",
    animation: "elastic-drop",
  },
  {
    id: "modern-alexandria",
    name: "أليكس المودرن 💎",
    nameEn: "Modern Alex 💎",
    font: "Alexandria",
    size: 21,
    color: "#22d3ee",
    bg: "rgba(15,23,42,0.9)",
    animation: "reveal-left",
  },
  {
    id: "corporate-ibm",
    name: "احترافي متميز 👔",
    nameEn: "Professional IBM 👔",
    font: "IBM Plex Sans Arabic",
    size: 20,
    color: "#ffffff",
    bg: "rgba(30,58,138,0.85)",
    animation: "reveal-right",
  },
  {
    id: "cyber-glow",
    name: "سايبر نيون ⚡",
    nameEn: "Cyber Glow ⚡",
    font: "Space Grotesk",
    size: 24,
    color: "#22d3ee",
    bg: "rgba(6,182,212,0.25)",
    animation: "neon-flicker",
  },
  {
    id: "gradient-sunset",
    name: "غروب الشمس 🌅",
    nameEn: "Sunset Glow 🌅",
    font: "Tajawal",
    size: 23,
    color: "#f97316",
    bg: "rgba(124,45,18,0.75)",
    animation: "wave-bounce",
  },
  {
    id: "bold-journal",
    name: "عنوان جريء 📰",
    nameEn: "Bold Header 📰",
    font: "Archivo Black",
    size: 25,
    color: "#ffffff",
    bg: "rgba(0,0,0,0.95)",
    animation: "shatter-pop",
  },
  {
    id: "cinema-gold",
    name: "سينما ذهبية 🏆",
    nameEn: "Cinema Gold 🏆",
    font: "Cinzel",
    size: 22,
    color: "#f59e0b",
    bg: "rgba(0,0,0,0.8)",
    animation: "curtain-reveal",
  },
  {
    id: "comic-pop",
    name: "كوميكس حركي 💥",
    nameEn: "Comic Pop 💥",
    font: "Fredoka",
    size: 26,
    color: "#fde047",
    bg: "rgba(220,38,38,0.9)",
    animation: "3d-flip",
  },
  {
    id: "minimal-glass",
    name: "زجاجي ناعم 💎",
    nameEn: "Minimal Glass 💎",
    font: "Outfit",
    size: 21,
    color: "#ffffff",
    bg: "rgba(255,255,255,0.2)",
    animation: "fade",
  }
];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CaptionPanel = ({ open, onClose, currentTime }: Props) => {
  const { captions, setCaptions, captionStyle, setCaptionStyle, totalDuration, media } = useMedia();
  const { requestAccess } = useAdGate();
  const [editingText, setEditingText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractMsg, setExtractMsg] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [tab, setTab] = useState<"templates" | "style" | "list">("templates");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const en = getLang() === "en";

  const clearCacheAndRetry = async () => {
    try {
      if (typeof window !== "undefined" && "caches" in window) {
        await window.caches.delete("transformers-cache");
        console.log("Cleared transformers-cache manually on retry");
      }
    } catch (err) {
      console.error("Failed to clear cache:", err);
    }
    autoExtract();
  };

  const getProgressBarColor = (progress: number) => {
    // From Indigo (79, 70, 229) to Emerald (16, 185, 129)
    const r = Math.round(79 + (16 - 79) * (progress / 100));
    const g = Math.round(70 + (185 - 70) * (progress / 100));
    const b = Math.round(229 + (129 - 229) * (progress / 100));
    return `rgb(${r}, ${g}, ${b})`;
  };

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open) return null;

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active Captions:" : "مسارات الكابشن:"}</span>
            <span className="text-primary font-extrabold">{captions.length}</span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {en ? "Show Library" : "إظهار المكتبة"}
          </button>
          <button 
            onClick={() => { playSfx("success"); onClose(); }}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90"
            title={en ? "Confirm" : "تأكيد"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button 
            onClick={() => { playSfx("click"); onClose(); }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const addCaption = () => {
    if (!editingText.trim()) {
      toast.error(en ? "Write some text first" : "اكتب نص الكابشن أولاً");
      return;
    }
    const start = currentTime;
    const end = Math.min(totalDuration, currentTime + 2.5);
    const cap: Caption = {
      id: uid(),
      start,
      end,
      text: editingText.trim(),
      animation: captionStyle.animation,
    };
    setCaptions((prev) => [...prev, cap].sort((a, b) => a.start - b.start));
    setEditingText("");
    toast.success(en ? "Added" : "تمت الإضافة");
  };

  const removeCap = (id: string) => setCaptions((prev) => prev.filter((c) => c.id !== id));

  const updateCap = (id: string, patch: Partial<Caption>) =>
    setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const applyTemplate = (t: CaptionTemplate) => {
    setCaptionStyle((s) => ({
      ...s,
      font: t.font,
      size: t.size,
      color: t.color,
      bg: t.bg,
      animation: t.animation,
    }));
    // Also wipe per-caption overrides so the new template shows on existing captions
    setCaptions((prev) =>
      prev.map((c) => ({
        ...c,
        font: undefined,
        size: undefined,
        color: undefined,
        bg: undefined,
        animation: t.animation,
      })),
    );
    toast.success(en ? `Applied template ${(t as any).nameEn || t.name}` : `تم تطبيق قالب ${t.name}`);
  };

  const autoExtract = async () => {
    // Check video or audio item in media library
    const mediaItem = media.find((m) => m.type === "video" || m.type === "audio");
    
    if (!mediaItem && audioTracks.length === 0) {
      toast.error(en ? "No video or audio file found to extract speech from" : "لا يوجد ملف فيديو أو صوت لاستخراج الكلام منه");
      return;
    }

    setExtractError(null);
    setExtracting(true);
    setExtractProgress(0);
    const cleanMsg = en ? "Extracting speech..." : "جاري استخراج الكلام...";
    setExtractMsg(cleanMsg);

    let progressVal = 0;
    let currentPhase: "loading" | "processing" | "done" = "loading";

    const interval = setInterval(() => {
      if (currentPhase === "loading") {
        if (progressVal < 45) {
          progressVal += 3;
        }
      } else if (currentPhase === "processing") {
        if (progressVal < 50) {
          progressVal = 50;
        } else if (progressVal < 95) {
          progressVal += 2;
        }
      }
      setExtractProgress(Math.min(100, progressVal));
    }, 100);

    try {
      // 1. Extract audio from media file or audio track
      const targetFile = mediaItem?.file;
      if (!targetFile) {
        throw new Error(en ? "Source media file unavailable" : "ملف الوسائط المصدر غير متوفر");
      }

      const { base64 } = await extractAudioBase64(targetFile);
      
      currentPhase = "processing";

      // 2. Transcribe speech cleanly
      const items = await localTranscribe(
        base64, 
        captionStyle.language, 
        (_msg, progress) => {
          setExtractMsg(cleanMsg);
          if (progress !== undefined && progress > 0) {
            setExtractProgress(progress);
          }
        }
      );

      currentPhase = "done";
      progressVal = 100;
      setExtractProgress(100);

      if (items.length === 0) {
        clearInterval(interval);
        toast.error(en ? "No speech detected in media" : "لم يتم العثور على كلام في المقطع");
        setExtracting(false);
        setExtractProgress(0);
        setExtractMsg("");
        return;
      }

      const newCaps: Caption[] = items.map((c: any) => ({
        id: uid(),
        start: Math.max(0, Number(c.start) || 0),
        end: Math.min(totalDuration, Number(c.end) || 0),
        text: String(c.text || "").trim(),
        confidence: typeof c.confidence === "number" ? c.confidence : (c.text?.trim().length < 3 ? 0.62 : 0.92),
        animation: captionStyle.animation,
      }));

      setCaptions((prev) => [...prev, ...newCaps].sort((a, b) => a.start - b.start));
      playSfx("success");
      toast.success(en ? `Extracted ${newCaps.length} captions successfully` : `تم استخراج ${newCaps.length} كابشن بنجاح`);

      // Jump to list tab and focus first caption text field automatically for fast editing
      setTab("list");
      setTimeout(() => {
        firstInputRef.current?.focus();
        firstInputRef.current?.select();
      }, 450);

      setTimeout(() => {
        clearInterval(interval);
        setExtracting(false);
        setExtractProgress(0);
        setExtractMsg("");
      }, 800);

    } catch (e: any) {
      clearInterval(interval);
      console.error("AutoExtract Error:", e);
      setExtractError(e.message || (en ? "Failed to extract speech" : "فشل استخراج الكلام"));
      toast.error(
        e.message || (en ? "Failed to extract speech" : "فشل استخراج الكلام"),
        {
          duration: 8000,
        }
      );
      setExtracting(false);
      setExtractProgress(0);
      setExtractMsg("");
    }
  };

  const regenerateSegment = async (capId: string, start: number, end: number) => {
    const videoItem = media.find((m) => m.type === "video");
    if (!videoItem) {
      toast.error(en ? "No video found to extract audio from" : "لا يوجد فيديو لاستخراج الصوت منه");
      return;
    }

    setRegeneratingId(capId);
    toast.info(en ? "Re-transcribing segment..." : "جارٍ إعادة استخراج المقطع المحدد فقط...");

    try {
      const { base64 } = await extractAudioBase64(videoItem.file, start, end);
      const items = await localTranscribe(base64, captionStyle.language);

      if (items && items.length > 0) {
        const newText = items.map((i: any) => i.text).join(" ").trim();
        const newConf = typeof items[0]?.confidence === "number" ? items[0].confidence : 0.95;
        updateCap(capId, { text: newText, confidence: newConf });
        playSfx("success");
        toast.success(en ? "Segment re-transcribed successfully!" : "تمت إعادة استخراج المقطع بنجاح!");
      } else {
        toast.warning(en ? "No speech detected in this segment" : "لم يتم التعرف على كلام في هذا المقطع القصير");
      }
    } catch (err: any) {
      console.error("Segment re-transcription error:", err);
      toast.error(en ? "Failed to re-transcribe segment" : "فشلت إعادة استخراج الجزء المحدد");
    } finally {
      setRegeneratingId(null);
    }
  };

  const autoSyncWithMusic = async () => {
    if (captions.length === 0) {
      toast.error(en ? "No captions to sync" : "لا يوجد كابشن للمزامنة");
      return;
    }

    const musicTrack = audioTracks.find((a) => a.kind === "music") || audioTracks[0];
    if (!musicTrack) {
      toast.error(en ? "Add a music track first to sync beat" : "أضف مقطع موسيقى أولاً لمزامنة الإيقاع");
      return;
    }

    toast.info(en ? "Analyzing music beat..." : "جارٍ تحليل إيقاع الموسيقى...");
    try {
      const beatData = await analyzeAudioTrack(musicTrack.url);
      if (!beatData || !beatData.beatTimes.length) {
        toast.error(en ? "Failed to detect beat rhythm" : "لم يتم العثور على إيقاع واضح في الموسيقى");
        return;
      }

      const beats = beatData.beatTimes;
      let syncCount = 0;

      const syncedCaps = captions.map((c) => {
        let closestStart = c.start;
        let minStartDiff = 0.4;

        for (const b of beats) {
          const diff = Math.abs(b - c.start);
          if (diff < minStartDiff) {
            minStartDiff = diff;
            closestStart = b;
          }
        }

        let closestEnd = c.end;
        let minEndDiff = 0.4;
        for (const b of beats) {
          const diff = Math.abs(b - c.end);
          if (diff < minEndDiff && b > closestStart + 0.3) {
            minEndDiff = diff;
            closestEnd = b;
          }
        }

        if (closestStart !== c.start || closestEnd !== c.end) {
          syncCount++;
        }

        return {
          ...c,
          start: closestStart,
          end: Math.max(closestStart + 0.5, closestEnd),
        };
      });

      setCaptions(syncedCaps.sort((a, b) => a.start - b.start));
      playSfx("success");
      toast.success(
        en
          ? `Synced ${syncCount} captions with BPM: ${beatData.bpm}!`
          : `تمت مزامنة ${syncCount} كابشن مع إيقاع الموسيقى (BPM: ${beatData.bpm})!`
      );
    } catch (e: any) {
      console.error("Auto Sync Error:", e);
      toast.error(en ? "Failed to sync captions with music" : "فشلت مزامنة الكابشن مع الموسيقى");
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={en ? "ltr" : "rtl"}>
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[72vh] overflow-y-auto no-scrollbar pb-6">
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Type className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            <span>{en ? "Auto Captions & Subtitles" : "نصوص الشاشة التلقائية والكابشن"}</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Collapse to see work button */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90"
              title={en ? "Minimize library to preview work" : "إخفاء لرؤية العمل"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            <button 
              onClick={() => { playSfx("success"); onClose(); }} 
              className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
              title={en ? "Confirm Selection" : "تأكيد الاختيار"}
            >
              <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
            </button>
            <button onClick={() => { playSfx("click"); onClose(); }} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-all active:scale-90">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* AI extract */}
        {extracting ? (
          <div className="w-full mb-3 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative h-12 flex flex-col items-center justify-center px-4">
            {/* Animated Background Progress Filler */}
            <div 
              className="absolute top-0 bottom-0 left-0 transition-all duration-300 ease-out"
              style={{ 
                width: `${extractProgress}%`,
                backgroundColor: getProgressBarColor(extractProgress),
                opacity: 0.95
              }}
            />
            {/* Content layer */}
            <div className="relative z-10 flex flex-col items-center justify-center w-full text-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-2 font-mono text-xs font-black">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white stroke-[3px]" />
                <span>{Math.round(extractProgress)}%</span>
              </div>
              <span className="text-[11px] font-bold text-white/95 font-sans mt-0.5 truncate max-w-full text-center">
                {en ? "Extracting speech..." : "جاري استخراج الكلام..."}
              </span>
            </div>
          </div>
        ) : extractError ? (
          <div className="w-full mb-3 p-3 bg-destructive/15 border border-destructive/30 rounded-xl flex flex-col items-center gap-2 text-center animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-[11px] font-bold text-destructive">
              {en ? "Download/extraction failed. It might be due to a network interruption or partial/corrupted cache." : "فشل التحميل أو الاستخراج. قد يكون بسبب انقطاع الشبكة أو ملف تالف مؤقتاً."}
            </p>
            <p className="text-[10px] text-muted-foreground line-clamp-2 max-w-md bg-black/20 p-1.5 rounded-lg border border-border/20 font-mono">
              {extractError}
            </p>
            <button
              onClick={clearCacheAndRetry}
              className="px-4 py-2 rounded-xl bg-destructive text-white text-xs font-bold hover:bg-destructive/90 active:scale-95 transition-all flex items-center gap-1.5 shadow-md shadow-destructive/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-white" />
              <span>{en ? "Clear Cache & Retry Cleanly" : "مسح الملفات التالفة وإعادة المحاولة"}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={autoExtract}
            className="w-full mb-3 py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-300 gradient-primary text-primary-foreground hover:opacity-95 active:scale-[0.99] cursor-pointer glow-primary-sm"
          >
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
            <span className="tracking-wide">
              {en ? "Auto-Extract Speech" : "استخراج تلقائي للكلام"}
            </span>
          </button>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-3 bg-secondary/50 p-1 rounded-lg">
          {([
            ["templates", en ? "Templates" : "قوالب"],
            ["style", en ? "Style" : "تنسيق"],
            ["list", en ? `List (${captions.length})` : `قائمة (${captions.length})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition ${
                tab === id ? "gradient-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "templates" && (
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="rounded-xl border border-border bg-black/40 p-3 flex flex-col items-center justify-center h-20 hover:border-primary transition"
              >
                <span
                  style={{
                    fontFamily: t.font,
                    color: t.color,
                    background: t.bg,
                    fontSize: Math.min(16, t.size),
                    padding: "3px 8px",
                    borderRadius: 6,
                  }}
                >
                  {en ? "Aa Style" : "Aa نموذج"}
                </span>
                <span className="text-[10px] text-muted-foreground mt-2">{en ? (t as any).nameEn || t.name : t.name}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "style" && (
          <div className="space-y-3">
            {/* Font Library & Language Library */}
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-2 font-medium">{en ? "Fonts Library" : "مكتبة الخطوط"}</label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1.5 px-0.5" style={{ scrollSnapType: "x mandatory" }}>
                  {FONTS.map((f) => {
                    const isSelected = captionStyle.font === f;
                    return (
                      <button
                        key={f}
                        onClick={() => setCaptionStyle((s) => ({ ...s, font: f }))}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all flex flex-col items-center justify-center min-w-[95px] h-[58px] ${
                          isSelected 
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30 scale-[1.03]" 
                            : "border-border bg-black/40 hover:border-muted-foreground/30"
                        }`}
                        style={{ scrollSnapAlign: "start" }}
                      >
                        <span style={{ fontFamily: f }} className="text-sm font-bold text-foreground">Aa</span>
                        <span className="text-[9px] text-muted-foreground mt-1 select-none truncate max-w-full font-sans leading-none">{f}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1 font-medium">
                  <Languages className="w-3.5 h-3.5 text-primary" /> {en ? "Caption Language" : "لغة الكابشن"}
                </label>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {LANGS.map((l) => {
                    const isSelected = captionStyle.language === l.code;
                    return (
                      <button
                        key={l.code}
                        onClick={() => setCaptionStyle((s) => ({ ...s, language: l.code }))}
                        className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                          isSelected 
                            ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105" 
                            : "border-border bg-black/40 text-muted-foreground hover:border-muted-foreground/30"
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Size + Position */}
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">
                {en ? "Size" : "الحجم"} ({captionStyle.size}px)
              </label>
              <input
                type="range"
                min={10}
                max={48}
                value={captionStyle.size}
                onChange={(e) => setCaptionStyle((s) => ({ ...s, size: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Default Position" : "الموقع الافتراضي"}</label>
              <div className="flex gap-1">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setCaptionStyle((s) => ({ ...s, position: p }))}
                    className={`flex-1 py-1.5 rounded text-[10px] font-bold ${
                      captionStyle.position === p
                        ? "gradient-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {p === "top" ? (en ? "Top" : "أعلى") : p === "center" ? (en ? "Center" : "وسط") : (en ? "Bottom" : "أسفل")}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">
                {en ? "💡 You can drag the caption on the video preview to manually reposition it" : "💡 يمكن سحب الكابشن على المعاينة لتغيير موقعه يدوياً"}
              </p>
            </div>

            {/* Text color */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Palette className="w-3 h-3" /> {en ? "Text Color" : "لون النص"}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCaptionStyle((s) => ({ ...s, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 ${
                      captionStyle.color === c ? "border-primary scale-110" : "border-border"
                    } transition-transform`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={captionStyle.color}
                  onChange={(e) => setCaptionStyle((s) => ({ ...s, color: e.target.value }))}
                  className="w-7 h-7 rounded-full bg-transparent border-2 border-border cursor-pointer"
                />
              </div>
            </div>

            {/* Background */}
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Background" : "الخلفية"}</label>
              <div className="flex flex-wrap gap-1.5">
                {BG_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCaptionStyle((s) => ({ ...s, bg: c }))}
                    className={`w-7 h-7 rounded-md border-2 ${
                      captionStyle.bg === c ? "border-primary scale-110" : "border-border"
                    } transition-transform relative overflow-hidden`}
                    style={{
                      background:
                        c === "rgba(0,0,0,0)"
                          ? "repeating-conic-gradient(#666 0% 25%, #aaa 0% 50%) 50% / 8px 8px"
                          : c,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Animation Library */}
            <div>
              <label className="text-[10px] text-muted-foreground block mb-2 font-medium">{en ? "Entrance Animation" : "حركة ظهور الكابشن"}</label>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                {ANIMATIONS.map((a) => {
                  const isSelected = captionStyle.animation === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setCaptionStyle((s) => ({ ...s, animation: a.id }))}
                      className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                          : "border-border bg-black/40 text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      {en ? a.labelEn : a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Apply to all captions */}
            <button
              onClick={() => {
                setCaptions((prev) =>
                  prev.map((c) => ({
                    ...c,
                    font: captionStyle.font,
                    size: captionStyle.size,
                    color: captionStyle.color,
                    bg: captionStyle.bg,
                    animation: captionStyle.animation,
                  }))
                );
                toast.success(en ? "Styling applied to all captions" : "تم تطبيق التنسيق على جميع الكابشنات");
              }}
              className="w-full py-2 rounded-xl bg-secondary text-foreground text-xs font-bold border border-border hover:border-primary transition-all"
            >
              {en ? "Apply styling to all captions" : "تطبيق التنسيق على جميع الكابشنات"}
            </button>
          </div>
        )}

        {tab === "list" && (
          <>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCaption()}
                placeholder={en ? `New text at ${currentTime.toFixed(1)}s` : `نص جديد عند ${currentTime.toFixed(1)}s`}
                className="flex-1 bg-secondary text-foreground text-xs rounded-lg px-3 py-2 border border-border"
              />
              <button onClick={addCaption} className="px-3 rounded-lg gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {captions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4 bg-secondary/30 rounded-xl border border-dashed border-border">
                  {en ? "No captions added. Add some text or extract auto AI subtitles" : "لا يوجد كابشن. أضف نص أو استخرج تلقائياً"}
                </p>
              ) : (
                captions.map((c, idx) => {
                  const isLowConfidence = c.confidence !== undefined && c.confidence < 0.75;
                  const isRegenerating = regeneratingId === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`flex items-center gap-1.5 bg-secondary/70 hover:bg-secondary/90 rounded-xl p-2 border transition-all ${
                        isLowConfidence
                          ? "border-amber-500/60 bg-amber-500/10 dark:bg-amber-950/20 shadow-sm"
                          : "border-border/60 hover:border-border"
                      }`}
                    >
                      <input
                        type="number"
                        step={0.1}
                        value={c.start.toFixed(1)}
                        onChange={(e) => updateCap(c.id, { start: Number(e.target.value) })}
                        className="w-12 bg-background text-foreground text-[10px] rounded-lg px-1.5 py-1 font-mono text-center border border-border/50"
                        title={en ? "Start time (s)" : "وقت البداية (ثواني)"}
                      />
                      <span className="text-[10px] text-muted-foreground font-mono">-</span>
                      <input
                        type="number"
                        step={0.1}
                        value={c.end.toFixed(1)}
                        onChange={(e) => updateCap(c.id, { end: Number(e.target.value) })}
                        className="w-12 bg-background text-foreground text-[10px] rounded-lg px-1.5 py-1 font-mono text-center border border-border/50"
                        title={en ? "End time (s)" : "وقت النهاية (ثواني)"}
                      />

                      <div className="relative flex-1 flex items-center">
                        <input
                          ref={idx === 0 ? firstInputRef : undefined}
                          type="text"
                          value={c.text}
                          onChange={(e) => updateCap(c.id, { text: e.target.value })}
                          className={`w-full bg-background text-foreground text-xs rounded-lg px-2.5 py-1.5 border transition-all ${
                            isLowConfidence
                              ? "border-amber-500/70 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 font-medium pr-14"
                              : "border-border/60 focus:border-primary"
                          }`}
                        />
                        {/* Confidence Indicator Badge */}
                        {c.confidence !== undefined && (
                          <div
                            className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none"
                            dir="ltr"
                          >
                            {isLowConfidence ? (
                              <span
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/40 text-[9px] font-bold"
                                title={en ? "Low confidence transcription - double check text" : "درجة ثقة منخفضة - يُفضل المراجعة اليدوية"}
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>{Math.round(c.confidence * 100)}%</span>
                              </span>
                            ) : (
                              <span
                                className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[9px] font-bold opacity-75"
                                title={en ? "High confidence transcription" : "دقة وثقة عالية"}
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Regenerate Segment Only Button */}
                      <button
                        onClick={() => regenerateSegment(c.id, c.start, c.end)}
                        disabled={isRegenerating || extracting}
                        className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all active:scale-90 disabled:opacity-50"
                        title={en ? "Re-transcribe this segment only" : "إعادة استخراج هذا المقطع فقط"}
                      >
                        {isRegenerating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : (
                          <RotateCw className="w-3.5 h-3.5 text-primary" />
                        )}
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => removeCap(c.id)}
                        className="p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-all active:scale-90"
                        title={en ? "Delete caption" : "حذف الكابشن"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CaptionPanel;
