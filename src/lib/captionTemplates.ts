import { CaptionStyle, CaptionAnimation } from "@/context/MediaContext";

export interface CaptionTemplate {
  id: string;
  name: string;
  nameEn: string;
  style: Partial<CaptionStyle>;
  previewBg: string;
  previewEmoji: string;
}

export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: "classic-subtitle",
    name: "ترجمة كلاسيكية",
    nameEn: "Classic Subtitle",
    style: {
      font: "Cairo",
      size: 20,
      color: "#ffffff",
      bg: "rgba(0,0,0,0.6)",
      animation: "fade",
      position: "bottom"
    },
    previewBg: "linear-gradient(135deg, #1e293b, #334155)",
    previewEmoji: "💬"
  },
  {
    id: "neon-glow",
    name: "توهج نيون",
    nameEn: "Neon Glow",
    style: {
      font: "Alexandria",
      size: 24,
      color: "#00f2ff",
      bg: "rgba(0,0,0,0)",
      animation: "neon-flicker",
      position: "center"
    },
    previewBg: "linear-gradient(135deg, #000000, #001a1a)",
    previewEmoji: "💡"
  },
  {
    id: "pop-yellow",
    name: "إيقاع أصفر",
    nameEn: "Pop Yellow",
    style: {
      font: "Archivo Black",
      size: 28,
      color: "#fde047",
      bg: "rgba(0,0,0,0.85)",
      animation: "pop",
      position: "center"
    },
    previewBg: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    previewEmoji: "⚡"
  },
  {
    id: "vlog-clean",
    name: "فلوق عصري",
    nameEn: "Modern Vlog",
    style: {
      font: "Plus Jakarta Sans",
      size: 18,
      color: "#ffffff",
      bg: "rgba(59,130,246,0.9)",
      animation: "slide-up",
      position: "bottom"
    },
    previewBg: "linear-gradient(135deg, #3b82f6, #2563eb)",
    previewEmoji: "🤳"
  },
  {
    id: "retro-vhs",
    name: "ريترو 90",
    nameEn: "Retro 90s",
    style: {
      font: "Space Grotesk",
      size: 22,
      color: "#ff00ff",
      bg: "rgba(0,0,0,0.5)",
      animation: "glitch",
      position: "bottom"
    },
    previewBg: "linear-gradient(135deg, #581c87, #7e22ce)",
    previewEmoji: "📼"
  },
  {
    id: "dynamic-bounce",
    name: "قفز حيوي",
    nameEn: "Dynamic Bounce",
    style: {
      font: "Bebas Neue",
      size: 32,
      color: "#ffffff",
      bg: "rgba(236,72,153,0.8)",
      animation: "bounce",
      position: "center"
    },
    previewBg: "linear-gradient(135deg, #ec4899, #db2777)",
    previewEmoji: "🏀"
  },
  {
    id: "elegant-serif",
    name: "أناقة كلاسيك",
    nameEn: "Elegant Serif",
    style: {
      font: "Amiri",
      size: 24,
      color: "#f8fafc",
      bg: "rgba(15,23,42,0.4)",
      animation: "blur-in",
      position: "bottom"
    },
    previewBg: "linear-gradient(135deg, #0f172a, #1e293b)",
    previewEmoji: "🖋️"
  },
  {
    id: "minimal-tag",
    name: "بسيط مدمج",
    nameEn: "Minimal Tag",
    style: {
      font: "Inter",
      size: 16,
      color: "#000000",
      bg: "#ffffff",
      animation: "fade",
      position: "top"
    },
    previewBg: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
    previewEmoji: "🏷️"
  }
];
