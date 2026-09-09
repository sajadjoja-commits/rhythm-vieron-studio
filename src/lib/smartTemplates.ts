// Smart Templates for Vireon AI — v3 with Deep AI Analysis
import type { FilterType, VfxType, TransitionType, CaptionAnimation } from "@/context/MediaContext";

export interface SmartTemplate {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  desc: string;
  descEn: string;
  category: "vlog" | "music" | "art" | "food" | "sport" | "travel" | "cinematic" | "social" | "ai-magic";
  accent: string;
  gradient: string;
  filters: { type: FilterType; intensity: number }[];
  vfx: { type: VfxType; intensity: number }[];
  transition: TransitionType;
  transitionDuration: number;
  caption: { font: string; size: number; color: string; bg: string; animation: CaptionAnimation; position: "top" | "center" | "bottom" };
  segmentSec: number;
  ai: {
    motionWeight: number;
    brightnessWeight: number;
    colorWeight: number;
    faceWeight: number;
    sceneChangeWeight: number;
    targetDuration: number;
    minClipSec: number;
    maxClipSec: number;
    speedRamp: boolean;
    musicSync: boolean;
    autoColorGrade: boolean;
    smartCrop: boolean;
    emotionAnalysis: boolean;
  };
  promo: { bgGradient: string; emoji: string; tagline: string; taglineEn: string };
}

export const SMART_TEMPLATES: SmartTemplate[] = [
  { 
    id: "ai-dream", 
    name: "سحر الذكاء الاصطناعي ✨", 
    nameEn: "AI Dream Magic ✨", 
    emoji: "🪄", 
    desc: "تحليل ذكي للمشاهد واختيار تلقائي لأفضل اللقطات مع تصحيح ألوان احترافي", 
    descEn: "Smart scene analysis and auto-selection with pro color grading", 
    category: "ai-magic", 
    accent: "#6366f1", 
    gradient: "linear-gradient(135deg, #4338ca, #6366f1, #818cf8)", 
    filters: [{ type: "dramatic", intensity: 0.8 }, { type: "brightness", intensity: 0.1 }], 
    vfx: [{ type: "light-leak", intensity: 0.4 }], 
    transition: "zoom", 
    transitionDuration: 0.6, 
    caption: { font: "Alexandria", size: 22, color: "#ffffff", bg: "rgba(99,102,241,0.6)", animation: "blur-in", position: "bottom" }, 
    segmentSec: 3, 
    ai: { 
      motionWeight: 0.7, 
      brightnessWeight: 0.6, 
      colorWeight: 0.8, 
      faceWeight: 0.9, 
      sceneChangeWeight: 0.8, 
      targetDuration: 30, 
      minClipSec: 1.5, 
      maxClipSec: 4, 
      speedRamp: true, 
      musicSync: true,
      autoColorGrade: true,
      smartCrop: true,
      emotionAnalysis: true
    }, 
    promo: { bgGradient: "linear-gradient(135deg, #4338ca, #6366f1, #818cf8)", emoji: "✨", tagline: "ذكاء اصطناعي كامل", taglineEn: "Full AI Integration" } 
  },
  { id: "cinematic", name: "سينمائي", nameEn: "Cinematic", emoji: "🎬", desc: "تدرج لوني درامي وانتقالات ناعمة مع قص سينمائي", descEn: "Dramatic color grade, smooth transitions, cinematic cuts", category: "cinematic", accent: "#a855f7", gradient: "linear-gradient(135deg, #1e1b4b, #4c1d95, #6d28d9)", filters: [{ type: "dramatic", intensity: 0.7 }, { type: "contrast", intensity: 0.4 }, { type: "cool", intensity: 0.3 }], vfx: [{ type: "light-leak", intensity: 0.3 }], transition: "fade", transitionDuration: 0.7, caption: { font: "Syne", size: 20, color: "#ffffff", bg: "rgba(0,0,0,0.0)", animation: "fade", position: "bottom" }, segmentSec: 4, ai: { motionWeight: 0.5, brightnessWeight: 0.6, colorWeight: 0.4, faceWeight: 0.3, sceneChangeWeight: 0.7, targetDuration: 30, minClipSec: 2.5, maxClipSec: 6, speedRamp: true, musicSync: true, autoColorGrade: true, smartCrop: false, emotionAnalysis: false }, promo: { bgGradient: "linear-gradient(135deg, #1e1b4b, #4c1d95, #6d28d9)", emoji: "🎬", tagline: "مونتاج سينمائي احترافي", taglineEn: "Pro cinematic montage" } },
  { id: "music-beat", name: "إيقاع موسيقي", nameEn: "Music Beat", emoji: "🎵", desc: "قص سريع على الإيقاع مع مؤثرات نابضة", descEn: "Fast beat-synced cuts with pulsing effects", category: "music", accent: "#ec4899", gradient: "linear-gradient(135deg, #831843, #be185d, #ec4899)", filters: [{ type: "saturate", intensity: 0.5 }, { type: "contrast", intensity: 0.3 }], vfx: [{ type: "zoom-pulse", intensity: 0.6 }, { type: "rgb-split", intensity: 0.3 }], transition: "zoom", transitionDuration: 0.3, caption: { font: "Archivo Black", size: 24, color: "#ffffff", bg: "rgba(0,0,0,0.0)", animation: "pop", position: "center" }, segmentSec: 1.5, ai: { motionWeight: 0.8, brightnessWeight: 0.4, colorWeight: 0.5, faceWeight: 0.3, sceneChangeWeight: 0.9, targetDuration: 20, minClipSec: 0.8, maxClipSec: 2.5, speedRamp: false, musicSync: true, autoColorGrade: false, smartCrop: true, emotionAnalysis: false }, promo: { bgGradient: "linear-gradient(135deg, #831843, #be185d, #ec4899)", emoji: "🎵", tagline: "قص على الإيقاع", taglineEn: "Cut to the beat" } },
  { id: "vlog", name: "فلوق يومي", nameEn: "Daily Vlog", emoji: "📹", desc: "ألوان دافئة وكابشن واضح وقطع سلسة", descEn: "Warm colors, clear captions, smooth cuts", category: "vlog", accent: "#f59e0b", gradient: "linear-gradient(135deg, #78350f, #b45309, #f59e0b)", filters: [{ type: "warm", intensity: 0.5 }, { type: "brightness", intensity: 0.2 }], vfx: [], transition: "slide", transitionDuration: 0.4, caption: { font: "Cairo", size: 18, color: "#ffffff", bg: "rgba(0,0,0,0.55)", animation: "slide-up", position: "bottom" }, segmentSec: 5, ai: { motionWeight: 0.4, brightnessWeight: 0.7, colorWeight: 0.3, faceWeight: 0.6, sceneChangeWeight: 0.5, targetDuration: 45, minClipSec: 3, maxClipSec: 8, speedRamp: false, musicSync: false, autoColorGrade: true, smartCrop: true, emotionAnalysis: true }, promo: { bgGradient: "linear-gradient(135deg, #78350f, #d97706, #fbbf24)", emoji: "📹", tagline: "فلوق احترافي بنقرة", taglineEn: "Pro vlog in one tap" } },
  { id: "food", name: "طبخ وطعام", nameEn: "Food & Cooking", emoji: "🍳", desc: "ألوان شهية ولقطات قريبة وانتقالات ذائبة", descEn: "Appetizing colors, close-ups, dissolve transitions", category: "food", accent: "#f97316", gradient: "linear-gradient(135deg, #7c2d12, #c2410c, #f97316)", filters: [{ type: "warm", intensity: 0.4 }, { type: "saturate", intensity: 0.6 }, { type: "contrast", intensity: 0.25 }], vfx: [], transition: "dissolve", transitionDuration: 0.6, caption: { font: "Tajawal", size: 20, color: "#ffffff", bg: "rgba(239,68,68,0.85)", animation: "pop", position: "top" }, segmentSec: 3, ai: { motionWeight: 0.3, brightnessWeight: 0.8, colorWeight: 0.7, faceWeight: 0.1, sceneChangeWeight: 0.6, targetDuration: 25, minClipSec: 1.5, maxClipSec: 4, speedRamp: true, musicSync: true, autoColorGrade: true, smartCrop: true, emotionAnalysis: false }, promo: { bgGradient: "linear-gradient(135deg, #7c2d12, #ea580c, #fb923c)", emoji: "🍳", tagline: "فيديو طعام شهي", taglineEn: "Tasty food video" } },
  { id: "sport", name: "رياضة وحركة", nameEn: "Sports & Action", emoji: "⚡", desc: "طاقة عالية واهتزاز وفلاش وقص سريع", descEn: "High energy, shake & flash, fast cuts", category: "sport", accent: "#06b6d4", gradient: "linear-gradient(135deg, #164e63, #0891b2, #06b6d4)", filters: [{ type: "contrast", intensity: 0.5 }, { type: "cool", intensity: 0.4 }, { type: "saturate", intensity: 0.4 }], vfx: [{ type: "shake", intensity: 0.4 }, { type: "flash", intensity: 0.3 }], transition: "wipe", transitionDuration: 0.25, caption: { font: "Bebas Neue", size: 26, color: "#fde047", bg: "rgba(0,0,0,0.0)", animation: "pop", position: "center" }, segmentSec: 1.2, ai: { motionWeight: 0.9, brightnessWeight: 0.5, colorWeight: 0.3, faceWeight: 0.2, sceneChangeWeight: 0.8, targetDuration: 20, minClipSec: 0.5, maxClipSec: 2, speedRamp: true, musicSync: true, autoColorGrade: false, smartCrop: true, emotionAnalysis: false }, promo: { bgGradient: "linear-gradient(135deg, #164e63, #0891b2, #22d3ee)", emoji: "⚡", tagline: "أكشن رياضي عالي الطاقة", taglineEn: "High-energy sports action" } },
  { id: "travel", name: "سفر ومغامرة", nameEn: "Travel & Adventure", emoji: "✈️", desc: "ألوان زاهية وانتقالات سلسة ولقطات واسعة", descEn: "Vivid colors, smooth transitions, wide shots", category: "travel", accent: "#10b981", gradient: "linear-gradient(135deg, #064e3b, #047857, #10b981)", filters: [{ type: "saturate", intensity: 0.5 }, { type: "warm", intensity: 0.3 }, { type: "brightness", intensity: 0.15 }], vfx: [{ type: "light-leak", intensity: 0.25 }], transition: "zoom", transitionDuration: 0.5, caption: { font: "Plus Jakarta Sans", size: 20, color: "#ffffff", bg: "rgba(59,130,246,0.85)", animation: "slide-down", position: "bottom" }, segmentSec: 3.5, ai: { motionWeight: 0.6, brightnessWeight: 0.7, colorWeight: 0.8, faceWeight: 0.1, sceneChangeWeight: 0.7, targetDuration: 35, minClipSec: 2, maxClipSec: 5, speedRamp: true, musicSync: true, autoColorGrade: true, smartCrop: true, emotionAnalysis: true }, promo: { bgGradient: "linear-gradient(135deg, #064e3b, #059669, #34d399)", emoji: "✈️", tagline: "مونتاج سفر سينمائي", taglineEn: "Cinematic travel montage" } },
  { id: "retro", name: "ريترو VHS", nameEn: "Retro VHS", emoji: "📼", desc: "إحساس قديم بشريط فيديو وحبيبات فيلم", descEn: "Old-school VHS vibe with film grain", category: "art", accent: "#a855f7", gradient: "linear-gradient(135deg, #581c87, #7e22ce, #a855f7)", filters: [{ type: "vintage", intensity: 0.7 }, { type: "sepia", intensity: 0.3 }], vfx: [{ type: "vhs", intensity: 0.6 }, { type: "film-grain", intensity: 0.4 }, { type: "scan-lines", intensity: 0.3 }], transition: "glitch", transitionDuration: 0.4, caption: { font: "Space Grotesk", size: 20, color: "#fde047", bg: "rgba(0,0,0,0.55)", animation: "typewriter", position: "bottom" }, segmentSec: 4, ai: { motionWeight: 0.5, brightnessWeight: 0.4, colorWeight: 0.3, faceWeight: 0.3, sceneChangeWeight: 0.6, targetDuration: 30, minClipSec: 2, maxClipSec: 6, speedRamp: false, musicSync: false, autoColorGrade: false, smartCrop: false, emotionAnalysis: false }, promo: { bgGradient: "linear-gradient(135deg, #581c87, #9333ea, #c084fc)", emoji: "📼", tagline: "ستايل ريترو 90s", taglineEn: "90s retro style" } },
  { id: "social-reels", name: "ريلز وتيك توك", nameEn: "Reels & TikTok", emoji: "📱", desc: "قص سريع 0.5-1.5ث مع كابشن كبير ونيون", descEn: "Fast 0.5-1.5s cuts with big neon captions", category: "social", accent: "#f43f5e", gradient: "linear-gradient(135deg, #881337, #e11d48, #f43f5e)", filters: [{ type: "saturate", intensity: 0.4 }, { type: "contrast", intensity: 0.35 }], vfx: [{ type: "zoom-pulse", intensity: 0.5 }, { type: "shake", intensity: 0.2 }], transition: "flash", transitionDuration: 0.2, caption: { font: "Archivo Black", size: 28, color: "#ffffff", bg: "rgba(0,0,0,0.0)", animation: "pop", position: "center" }, segmentSec: 1, ai: { motionWeight: 0.85, brightnessWeight: 0.5, colorWeight: 0.6, faceWeight: 0.5, sceneChangeWeight: 0.9, targetDuration: 15, minClipSec: 0.4, maxClipSec: 1.5, speedRamp: true, musicSync: true, autoColorGrade: true, smartCrop: true, emotionAnalysis: true }, promo: { bgGradient: "linear-gradient(135deg, #881337, #e11d48, #fb7185)", emoji: "📱", tagline: "ريلز فيرال بنقرة", taglineEn: "Viral reels in one tap" } }
];

export const TEMPLATE_CATEGORIES = [
  { id: "all", labelKey: "templates.all" },
  { id: "ai-magic", label: "🪄", labelEn: "AI Magic" },
  { id: "cinematic", label: "🎬", labelEn: "Cinematic" },
  { id: "music", label: "🎵", labelEn: "Music" },
  { id: "vlog", label: "📹", labelEn: "Vlog" },
  { id: "food", label: "🍳", labelEn: "Food" },
  { id: "sport", label: "⚡", labelEn: "Sports" },
  { id: "travel", label: "✈️", labelEn: "Travel" },
  { id: "art", label: "🎨", labelEn: "Art" },
  { id: "social", label: "📱", labelEn: "Social" },
];
