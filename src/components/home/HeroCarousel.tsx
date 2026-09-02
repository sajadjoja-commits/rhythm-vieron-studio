import React, { useState, useEffect, useRef } from "react";
import { Sparkles, ArrowRight, Wand2, Plus, Scissors, Image as ImageIcon, Volume2, Video, Music, Layers } from "lucide-react";
import MediaPicker from "@/components/MediaPicker";

interface HeroCarouselProps {
  onNavigate: (tab: string) => void;
  onStartEditor: () => void;
  newProject: () => void;
  en: boolean;
}

interface BannerSlide {
  id: string;
  badgeEn: string;
  badgeAr: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  ctaEn: string;
  ctaAr: string;
  gradient: string;
  glowColor: string;
  icon: any;
  actionType: "newProject" | "aiStudio" | "templates";
  characterImg: string;
  characterAlt: string;
}

const SLIDES: BannerSlide[] = [
  {
    id: "bg_removal",
    badgeEn: "AI VISION",
    badgeAr: "رؤية عصبية",
    titleEn: "AI Background Remover",
    titleAr: "إزالة الخلفية بضغطة زر",
    descEn: "Remove image & video backgrounds instantly with edge-aware precision",
    descAr: "عزل خلفيات الصور والفيديو فوراً بذكاء اصطناعي فائق الدقة",
    ctaEn: "Try Removal",
    ctaAr: "جرب العزل الآن",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%)",
    glowColor: "rgba(37, 99, 235, 0.45)",
    icon: Scissors,
    actionType: "aiStudio",
    characterImg: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
    characterAlt: "AI Background Cut",
  },
  {
    id: "image_enhancement",
    badgeEn: "AI ENHANCE",
    badgeAr: "تحسين فائق",
    titleEn: "Enhance Photo Quality",
    titleAr: "تحسين جودة الصور والوجوه",
    descEn: "Restore clarity, enhance facial features, sharpen details, and remove noise",
    descAr: "استعادة تفاصيل الملامح، تنقية التشويش، وتوضيح الألوان بذكاء اصطناعي",
    ctaEn: "Enhance Photo",
    ctaAr: "تحسين صورة",
    gradient: "linear-gradient(135deg, #1e1b4b 0%, #5b21b6 50%, #7c3aed 100%)",
    glowColor: "rgba(124, 58, 237, 0.45)",
    icon: ImageIcon,
    actionType: "aiStudio",
    characterImg: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    characterAlt: "Photo Enhancer",
  },
  {
    id: "video_4k",
    badgeEn: "PRO VIDEO",
    badgeAr: "فيديو 4K احترافي",
    titleEn: "AI Video Enhancement 4K",
    titleAr: "رفع جودة الفيديو حتى 4K 60FPS",
    descEn: "Frame interpolation, color grading, and crisp 4K detail restoration",
    descAr: "سلاسة في الحركة، تحسين الألوان، وتوليد تفاصيل 4K عالية النقاء",
    ctaEn: "Enhance Video",
    ctaAr: "تحسين فيديو",
    gradient: "linear-gradient(135deg, #0f2b3c 0%, #0891b2 50%, #06b6d4 100%)",
    glowColor: "rgba(6, 182, 212, 0.45)",
    icon: Video,
    actionType: "newProject",
    characterImg: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80",
    characterAlt: "4K Video Filmmaker",
  },
  {
    id: "denoise",
    badgeEn: "AUDIO ENGINE",
    badgeAr: "تنقية الصوت",
    titleEn: "AI Noise Removal",
    titleAr: "إزالة الضوضاء والتشويش",
    descEn: "Isolate vocals and eliminate background hums, wind, or echo",
    descAr: "عزل الأصوات وتنقية التسجيلات من أي تشويش خارجي",
    ctaEn: "Clean Audio",
    ctaAr: "تنقية الصوت",
    gradient: "linear-gradient(135deg, #064e3b 0%, #059669 50%, #10b981 100%)",
    glowColor: "rgba(16, 185, 129, 0.45)",
    icon: Volume2,
    actionType: "aiStudio",
    characterImg: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=600&q=80",
    characterAlt: "Podcast Audio Host",
  },
  {
    id: "vocal_isolation",
    badgeEn: "AI SEPARATION",
    badgeAr: "عزل صوتي",
    titleEn: "Music & Vocal Separator",
    titleAr: "فصل الموسيقى عن الصوت",
    descEn: "Separate a cappella vocals from instrumental music tracks cleanly",
    descAr: "استخراج صوت المغني أو الموسيقى بشكل مستقل بجودة عالية",
    ctaEn: "Isolate Audio",
    ctaAr: "فصل الصوت",
    gradient: "linear-gradient(135deg, #831843 0%, #db2777 50%, #f43f5e 100%)",
    glowColor: "rgba(244, 63, 94, 0.45)",
    icon: Music,
    actionType: "aiStudio",
    characterImg: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80",
    characterAlt: "Vocalist Musician",
  },
  {
    id: "auto_caption",
    badgeEn: "AUTO SUBTITLES",
    badgeAr: "ترجمة كابشن",
    titleEn: "Viral Auto Captions",
    titleAr: "كابشن تلقائي بالفصحى والعامية",
    descEn: "Generate animated captions synchronized to speech for Reels & TikTok",
    descAr: "إنشاء نصوص متحركة متوافقة تماماً مع الحديث للمقاطع القصيرة",
    ctaEn: "Add Captions",
    ctaAr: "إنشاء كابشن",
    gradient: "linear-gradient(135deg, #701a75 0%, #c026d3 50%, #e879f9 100%)",
    glowColor: "rgba(232, 121, 249, 0.45)",
    icon: Wand2,
    actionType: "newProject",
    characterImg: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=600&q=80",
    characterAlt: "Content Creator Captions",
  },
  {
    id: "flux_studio",
    badgeEn: "FLUX.1 STUDIO",
    badgeAr: "استوديو FLUX.1",
    titleEn: "AI Image Generation",
    titleAr: "إنشاء صور خيالية بـ FLUX.1",
    descEn: "Synthesize hyper-realistic graphics from Arabic or English prompts",
    descAr: "توليد صور واقعية وفنية فائقة الدقة من وصف نصي",
    ctaEn: "Create Image",
    ctaAr: "إنشاء صورة",
    gradient: "linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #8b5cf6 100%)",
    glowColor: "rgba(139, 92, 246, 0.45)",
    icon: Sparkles,
    actionType: "aiStudio",
    characterImg: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80",
    characterAlt: "FLUX AI Art Avatar",
  },
  {
    id: "smart_templates",
    badgeEn: "VIRAL TEMPLATES",
    badgeAr: "قوالب انتشار",
    titleEn: "Pro Smart Templates",
    titleAr: "قوالب ذكية جاهزة للنشر",
    descEn: "One-click templates for Instagram, TikTok, Shorts & Podcasts",
    descAr: "قوالب جاهزة متناسقة مع الموسيقى والمؤثرات بنقرة واحدة",
    ctaEn: "Explore Templates",
    ctaAr: "استكشف القوالب",
    gradient: "linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #f97316 100%)",
    glowColor: "rgba(249, 115, 22, 0.45)",
    icon: Layers,
    actionType: "templates",
    characterImg: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=600&q=80",
    characterAlt: "Viral Creators Group",
  },
];

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  onNavigate,
  onStartEditor,
  newProject,
  en,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
      }
    }
    setTimeout(() => setIsPaused(false), 2000);
  };

  const currentSlide = SLIDES[currentIndex];
  const IconComponent = currentSlide.icon;

  const handleAction = () => {
    if (currentSlide.actionType === "aiStudio") {
      onNavigate("aistudio");
    } else if (currentSlide.actionType === "templates") {
      onNavigate("templates");
    } else {
      newProject();
      onStartEditor();
    }
  };

  const handleCreateNewProjectDirectly = () => {
    console.log("[NewProject] NEW_PROJECT_CLICKED");
    console.log("[NewProject] STEP 1: click received");
    console.log("[NewProject] STEP 2: create project started");
    newProject();
    console.log("[NewProject] STEP 3: project object created");
    console.log("[NewProject] STEP 4: project saved");
    console.log("[NewProject] STEP 5: navigation started");
    onStartEditor();
    console.log("[NewProject] STEP 6: navigation completed");
  };

  return (
    <div
      className="relative rounded-3xl overflow-hidden mb-6 shadow-2xl transition-all duration-500 border border-white/15 select-none group"
      style={{
        background: currentSlide.gradient,
        boxShadow: `0 20px 45px -15px ${currentSlide.glowColor}`,
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      dir={en ? "ltr" : "rtl"}
    >
      {/* Background Animated Ambient Light & Backdrop Character Image */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-35 blur-3xl transition-all duration-700"
          style={{ background: currentSlide.glowColor }}
        />
        <div
          className="absolute -bottom-12 -left-12 w-52 h-52 rounded-full opacity-30 blur-3xl transition-all duration-700"
          style={{ background: currentSlide.glowColor }}
        />
      </div>

      {/* Main Slide Layout with Character Poster Artwork */}
      <div className="relative p-5 sm:p-6 flex flex-col justify-between min-h-[225px] z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-white text-[10px] font-extrabold tracking-wider uppercase shadow-sm">
                <IconComponent className="w-3.5 h-3.5 text-white animate-pulse" />
                {en ? currentSlide.badgeEn : currentSlide.badgeAr}
              </span>
              <span className="text-[10px] text-white/70 font-mono">
                {currentIndex + 1} / {SLIDES.length}
              </span>
            </div>

            {/* Heading */}
            <h2 className="font-heading text-lg sm:text-2xl font-bold text-white mb-2 leading-snug drop-shadow-md">
              {en ? currentSlide.titleEn : currentSlide.titleAr}
            </h2>

            {/* Subtitle */}
            <p className="text-xs text-white/85 max-w-sm leading-relaxed mb-4 line-clamp-2">
              {en ? currentSlide.descEn : currentSlide.descAr}
            </p>
          </div>

          {/* Character Promotional Poster Image */}
          <div className="relative w-24 h-28 sm:w-32 sm:h-36 flex-shrink-0 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl group-hover:scale-105 transition-transform duration-500">
            <img
              src={currentSlide.characterImg}
              alt={currentSlide.characterAlt}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-center">
              <span className="text-[8px] font-extrabold text-white px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 uppercase tracking-widest truncate">
                Vireon AI
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Create Project Button */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/15">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary Action Button */}
            {currentSlide.actionType === "newProject" ? (
              <MediaPicker
                isNewProject
                accept="both"
                multiple
                onPicked={onStartEditor}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white text-gray-950 font-extrabold text-xs shadow-lg hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-gray-950" />
                <span>{en ? currentSlide.ctaEn : currentSlide.ctaAr}</span>
                <ArrowRight className={`w-3.5 h-3.5 text-gray-950 ${en ? "" : "rotate-180"}`} />
              </MediaPicker>
            ) : (
              <button
                onClick={handleAction}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white text-gray-950 font-extrabold text-xs shadow-lg hover:bg-white/90 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4 text-gray-950" />
                <span>{en ? currentSlide.ctaEn : currentSlide.ctaAr}</span>
                <ArrowRight className={`w-3.5 h-3.5 text-gray-950 ${en ? "" : "rotate-180"}`} />
              </button>
            )}

            {/* Create Project Button (زر إنشاء مشروع) -> Picks media, creates new project and opens editor */}
            <MediaPicker
              isNewProject
              accept="both"
              multiple
              onPicked={onStartEditor}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-primary text-primary-foreground font-extrabold text-xs shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{en ? "New Project" : "إنشاء مشروع"}</span>
            </MediaPicker>

            {/* AI Studio Link */}
            <button
              onClick={() => onNavigate("aistudio")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-black/35 hover:bg-black/50 text-white font-semibold text-xs backdrop-blur-md border border-white/20 active:scale-95 transition-all"
            >
              <Wand2 className="w-3.5 h-3.5 text-blue-300" />
              <span>{en ? "AI Studio" : "استوديو AI"}</span>
            </button>
          </div>

          {/* Carousel Dots */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? "w-6 bg-white shadow-md"
                    : "w-1.5 bg-white/40 hover:bg-white/70"
                }`}
                title={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroCarousel;
