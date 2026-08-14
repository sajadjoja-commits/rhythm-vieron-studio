import React, { useState } from "react";
import { Scissors, Volume2, Sparkles, Video, Mic, Wand2, ChevronDown, ChevronUp } from "lucide-react";

interface RecommendedAIToolsProps {
  onNavigate: (tab: string) => void;
  onStartEditor: () => void;
  newProject: () => void;
  en: boolean;
}

interface ToolItem {
  id: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  icon: any;
  color: string;
  bg: string;
  badge: "Local" | "Hybrid" | "Cloud";
  targetTab: "aistudio" | "editor" | "templates";
}

const RECOMMENDED_TOOLS: ToolItem[] = [
  {
    id: "bg_remover",
    nameEn: "Background Removal",
    nameAr: "إزالة الخلفية الفورية",
    descEn: "Remove image backgrounds with high edge fidelity",
    descAr: "عزل الخلفية بدقة عالية للصور والفيديو",
    icon: Scissors,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    badge: "Local",
    targetTab: "aistudio",
  },
  {
    id: "vocal_cleaner",
    nameEn: "Music & Vocal Isolation",
    nameAr: "عزل الموسيقى عن الكلام",
    descEn: "Separate voice tracks from background tracks",
    descAr: "فصل صوت المغني أو الكلام عن الخلفية الموسيقية",
    icon: Volume2,
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    badge: "Hybrid",
    targetTab: "aistudio",
  },
  {
    id: "flux_creator",
    nameEn: "FLUX Image Generator",
    nameAr: "توليد صور بـ FLUX.1",
    descEn: "Synthesize photorealistic visuals from prompts",
    descAr: "توليد صور واقعية وفنية من وصف نصي",
    icon: Sparkles,
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.12)",
    badge: "Cloud",
    targetTab: "aistudio",
  },
  {
    id: "video_enhancer",
    nameEn: "4K Video Enhancer",
    nameAr: "تحسين جودة الفيديو 4K",
    descEn: "Frame interpolation & 4K color restoration",
    descAr: "رفع الدقة وسلاسة الإطارات وتعديل الألوان",
    icon: Video,
    color: "#06b6d4",
    bg: "rgba(6, 182, 212, 0.12)",
    badge: "Hybrid",
    targetTab: "editor",
  },
  {
    id: "noise_remover",
    nameEn: "Noise Cleaner",
    nameAr: "تنقية التشويش والضوضاء",
    descEn: "Clean background hums & mic noise",
    descAr: "إزالة صوت الرياح والضوضاء المحيطة",
    icon: Mic,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    badge: "Local",
    targetTab: "aistudio",
  },
  {
    id: "auto_caption",
    nameEn: "Smart Auto Captions",
    nameAr: "كابشن احترافي تلقائي",
    descEn: "Speech-to-text subtitles for social reels",
    descAr: "ترجمة وتحويل الصوت إلى نصوص متحركة",
    icon: Wand2,
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    badge: "Hybrid",
    targetTab: "editor",
  },
];

export const RecommendedAITools: React.FC<RecommendedAIToolsProps> = ({
  onNavigate,
  onStartEditor,
  newProject,
  en,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLaunch = (tool: ToolItem) => {
    if (tool.targetTab === "aistudio") {
      onNavigate("aistudio");
    } else if (tool.targetTab === "templates") {
      onNavigate("templates");
    } else {
      newProject();
      onStartEditor();
    }
  };

  // Only show the first row (2 items) unless expanded
  const visibleTools = isExpanded ? RECOMMENDED_TOOLS : RECOMMENDED_TOOLS.slice(0, 2);

  return (
    <div className="mb-6 select-none animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-heading text-base font-bold text-foreground">
            {en ? "Recommended AI Tools" : "الأدوات المقترحة بالذكاء الاصطناعي"}
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {en ? "Most used AI engines based on activity" : "الأدوات الأكثر استخداماً بناءً على النشاط"}
          </p>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-xs text-primary font-bold transition-all active:scale-95"
        >
          <span>{isExpanded ? (en ? "Show Less" : "عرض أقل") : (en ? "View All" : "عرض الكل")}</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 transition-transform" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 transition-transform" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleTools.map((tool) => {
          const IconComp = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => handleLaunch(tool)}
              className="group relative flex items-start gap-3 p-3.5 rounded-2xl bg-card border border-border/80 hover:border-primary/50 hover:shadow-lg transition-all text-start active:scale-[0.98] overflow-hidden animate-fade-in"
            >
              {/* Glowing hover backdrop */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(circle at 10% 50%, ${tool.bg}, transparent 70%)` }}
              />

              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-110"
                style={{ background: tool.bg }}
              >
                <IconComp className="w-5.5 h-5.5" style={{ color: tool.color }} />
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <h3 className="font-heading font-bold text-xs text-foreground truncate">
                    {en ? tool.nameEn : tool.nameAr}
                  </h3>
                  <span
                    className={`text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      tool.badge === "Local"
                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                        : tool.badge === "Hybrid"
                        ? "bg-cyan-500/15 text-cyan-500 border border-cyan-500/30"
                        : "bg-purple-500/15 text-purple-500 border border-purple-500/30"
                    }`}
                  >
                    {tool.badge}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-1 leading-snug">
                  {en ? tool.descEn : tool.descAr}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {!isExpanded && RECOMMENDED_TOOLS.length > 2 && (
        <div className="mt-2.5 text-center">
          <button
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
          >
            <span>{en ? `+${RECOMMENDED_TOOLS.length - 2} more tools available` : `+${RECOMMENDED_TOOLS.length - 2} أدوات إضافية متاحة`}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default RecommendedAITools;
