import React from "react";
import { Sparkles, ArrowLeft, Play, Flame } from "lucide-react";

interface SmartTemplatesSectionProps {
  onNavigate: (tab: string) => void;
  en: boolean;
}

interface TemplatePreset {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  ratio: string;
  gradient: string;
  icon: string;
}

const TEMPLATES: TemplatePreset[] = [
  {
    id: "reels",
    nameEn: "Instagram Reel",
    nameAr: "انستغرام ريلز",
    categoryEn: "Social Viral",
    categoryAr: "انتشار اجتماعي",
    ratio: "9:16",
    gradient: "linear-gradient(135deg, #831843 0%, #db2777 50%, #f43f5e 100%)",
    icon: "📸",
  },
  {
    id: "tiktok",
    nameEn: "TikTok Trends",
    nameAr: "تريند تيك توك",
    categoryEn: "Fast Cuts",
    categoryAr: "تقطيع سريع",
    ratio: "9:16",
    gradient: "linear-gradient(135deg, #0284c7 0%, #06b6d4 50%, #10b981 100%)",
    icon: "🎵",
  },
  {
    id: "youtube_shorts",
    nameEn: "YouTube Shorts",
    nameAr: "يوتيوب شورتس",
    categoryEn: "High Engagement",
    categoryAr: "تفاعل عالي",
    ratio: "9:16",
    gradient: "linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #f87171 100%)",
    icon: "▶️",
  },
  {
    id: "gaming",
    nameEn: "Gaming Highlights",
    nameAr: "ملخصات الجيمينج",
    categoryEn: "60 FPS FX",
    categoryAr: "مؤثرات 60 إطار",
    ratio: "16:9",
    gradient: "linear-gradient(135deg, #312e81 0%, #4f46e5 50%, #818cf8 100%)",
    icon: "🎮",
  },
  {
    id: "anime",
    nameEn: "Anime & Manga",
    nameAr: "أنمي ومانغا",
    categoryEn: "Stylized AI",
    categoryAr: "نمط أنمي بالـ AI",
    ratio: "9:16",
    gradient: "linear-gradient(135deg, #701a75 0%, #c026d3 50%, #f0abfc 100%)",
    icon: "🎌",
  },
  {
    id: "podcast",
    nameEn: "Podcast & Talk",
    nameAr: "بودكاست وحوارات",
    categoryEn: "Auto Captions",
    categoryAr: "كابشن تلقائي",
    ratio: "16:9",
    gradient: "linear-gradient(135deg, #14532d 0%, #16a34a 50%, #4ade80 100%)",
    icon: "🎙️",
  },
  {
    id: "cinematic",
    nameEn: "Cinematic Movie",
    nameAr: "سينمائي احترافي",
    categoryEn: "LUT Color Grade",
    categoryAr: "ألوان سينمائية",
    ratio: "21:9",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
    icon: "🎬",
  },
  {
    id: "story",
    nameEn: "Daily Story",
    nameAr: "ستوري يومية",
    categoryEn: "Aesthetic",
    categoryAr: "تصميم جمالي",
    ratio: "9:16",
    gradient: "linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fb923c 100%)",
    icon: "✨",
  },
  {
    id: "documentary",
    nameEn: "Documentary",
    nameAr: "وثائقي فاخر",
    categoryEn: "Deep Voiceover",
    categoryAr: "تعليق وثائقي",
    ratio: "16:9",
    gradient: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #6366f1 100%)",
    icon: "🎙️",
  },
];

export const SmartTemplatesSection: React.FC<SmartTemplatesSectionProps> = ({
  onNavigate,
  en,
}) => {
  return (
    <div className="mb-6 select-none animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-heading text-base font-bold text-foreground flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <span>{en ? "Smart AI Templates" : "القوالب الذكية الجاهزة"}</span>
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {en ? "Ready-to-publish viral video presets" : "قوالب انتشار معدّة ومزامنة مع الموسيقى"}
          </p>
        </div>

        <button
          onClick={() => onNavigate("templates")}
          className="flex items-center gap-1 text-xs text-primary font-bold hover:underline"
        >
          <span>{en ? "Explore All" : "تصفح القوالب"}</span>
          <ArrowLeft className={`w-3.5 h-3.5 ${en ? "" : "rotate-180"}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onNavigate("templates")}
            className="group relative h-28 rounded-2xl overflow-hidden border border-border hover:border-primary/50 transition-all active:scale-[0.98] p-3 flex flex-col justify-between text-start shadow-md"
          >
            <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" style={{ background: tpl.gradient }} />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />

            <div className="relative flex items-center justify-between z-10">
              <span className="text-2xl">{tpl.icon}</span>
              <span className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-[8px] font-extrabold text-white/90 border border-white/20">
                {tpl.ratio}
              </span>
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-1 text-[8px] font-bold text-blue-200 uppercase tracking-wider mb-0.5">
                <Sparkles className="w-2.5 h-2.5 text-blue-300" />
                <span>{en ? tpl.categoryEn : tpl.categoryAr}</span>
              </div>
              <h3 className="font-heading font-bold text-xs text-white drop-shadow-sm truncate">
                {en ? tpl.nameEn : tpl.nameAr}
              </h3>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SmartTemplatesSection;
