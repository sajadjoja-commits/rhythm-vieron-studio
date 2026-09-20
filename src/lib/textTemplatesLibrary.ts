import { Caption, CaptionAnimation, Keyframe } from "@/context/MediaContext";
import {
  TextTemplate,
  TextTemplateCategory,
  TextTemplateEasing,
  WordAnimationConfig,
  CharacterAnimationConfig,
} from "@/types/textTemplate";

// UID Generator
const uid = () => `k_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;

// Mathematical Easing Function Evaluator
export function evaluateEasing(easing: TextTemplateEasing = "easeOut", t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "linear":
      return clamped;
    case "easeIn":
      return clamped * clamped * clamped;
    case "easeOut": {
      const f = clamped - 1;
      return f * f * f + 1;
    }
    case "easeInOut":
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : (clamped - 1) * (2 * clamped - 2) * (2 * clamped - 2) + 1;
    case "back": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2);
    }
    case "elastic": {
      if (clamped === 0) return 0;
      if (clamped === 1) return 1;
      const p = 0.3;
      const s = p / 4;
      return Math.pow(2, -10 * clamped) * Math.sin(((clamped - s) * (2 * Math.PI)) / p) + 1;
    }
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let x = clamped;
      if (x < 1 / d1) {
        return n1 * x * x;
      } else if (x < 2 / d1) {
        x -= 1.5 / d1;
        return n1 * x * x + 0.75;
      } else if (x < 2.5 / d1) {
        x -= 2.25 / d1;
        return n1 * x * x + 0.9375;
      } else {
        x -= 2.625 / d1;
        return n1 * x * x + 0.984375;
      }
    }
    default:
      return clamped;
  }
}

/**
 * Generate standard Keyframes for a Text Template
 * Integrates natively with interpolateKeyframes() in MediaContext!
 */
export function generateKeyframesForTemplate(template: TextTemplate, duration: number): Keyframe[] {
  const keyframes: Keyframe[] = [];
  const total = Math.max(duration, 0.6);
  const entranceDur = Math.min(template.entrance.duration || 0.4, total * 0.4);
  const exitDur = Math.min(template.exit?.duration || 0.3, total * 0.3);
  const exitStart = Math.max(entranceDur + 0.1, total - exitDur);

  const baseScale = template.layout.scale ?? 1;
  const baseRot = template.layout.rotation ?? 0;
  const baseY = template.layout.yPercent ?? (template.layout.position === "top" ? 10 : template.layout.position === "center" ? 50 : 88);
  const baseX = template.layout.xPercent ?? 50;

  // Entrance Keyframes
  const entAnim = template.entrance.animation;
  const entEasing = template.entrance.easing || "easeOut";

  if (entAnim === "pop" || entAnim === "scale-up" || entAnim === "shatter-pop") {
    keyframes.push(
      { id: uid(), time: 0, property: "scale", value: 0.1, easing: entEasing },
      { id: uid(), time: entranceDur * 0.7, property: "scale", value: baseScale * 1.15, easing: "easeOut" },
      { id: uid(), time: entranceDur, property: "scale", value: baseScale, easing: "easeInOut" },
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "easeOut" },
      { id: uid(), time: entranceDur * 0.5, property: "opacity", value: 1, easing: "linear" }
    );
  } else if (entAnim === "slide-up") {
    keyframes.push(
      { id: uid(), time: 0, property: "yPercent", value: Math.min(100, baseY + 12), easing: entEasing },
      { id: uid(), time: entranceDur, property: "yPercent", value: baseY, easing: "easeOut" },
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "easeOut" },
      { id: uid(), time: entranceDur * 0.6, property: "opacity", value: 1, easing: "linear" }
    );
  } else if (entAnim === "slide-down") {
    keyframes.push(
      { id: uid(), time: 0, property: "yPercent", value: Math.max(0, baseY - 12), easing: entEasing },
      { id: uid(), time: entranceDur, property: "yPercent", value: baseY, easing: "easeOut" },
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "easeOut" },
      { id: uid(), time: entranceDur * 0.6, property: "opacity", value: 1, easing: "linear" }
    );
  } else if (entAnim === "elastic-drop" || entAnim === "bounce") {
    keyframes.push(
      { id: uid(), time: 0, property: "yPercent", value: Math.max(0, baseY - 18), easing: "easeIn" },
      { id: uid(), time: entranceDur * 0.55, property: "yPercent", value: baseY + 3, easing: "easeOut" },
      { id: uid(), time: entranceDur * 0.8, property: "yPercent", value: baseY - 1.5, easing: "easeInOut" },
      { id: uid(), time: entranceDur, property: "yPercent", value: baseY, easing: "easeOut" },
      { id: uid(), time: 0, property: "scale", value: baseScale * 0.6, easing: "linear" },
      { id: uid(), time: entranceDur, property: "scale", value: baseScale, easing: "easeOut" },
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "linear" },
      { id: uid(), time: entranceDur * 0.4, property: "opacity", value: 1, easing: "linear" }
    );
  } else if (entAnim === "3d-flip" || entAnim === "rotate-in") {
    keyframes.push(
      { id: uid(), time: 0, property: "rotation", value: baseRot - 25, easing: entEasing },
      { id: uid(), time: entranceDur * 0.75, property: "rotation", value: baseRot + 5, easing: "easeOut" },
      { id: uid(), time: entranceDur, property: "rotation", value: baseRot, easing: "easeInOut" },
      { id: uid(), time: 0, property: "scale", value: baseScale * 0.4, easing: "easeOut" },
      { id: uid(), time: entranceDur, property: "scale", value: baseScale, easing: "easeOut" },
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "linear" },
      { id: uid(), time: entranceDur * 0.5, property: "opacity", value: 1, easing: "linear" }
    );
  } else if (entAnim === "zoom-fade") {
    keyframes.push(
      { id: uid(), time: 0, property: "scale", value: baseScale * 1.6, easing: entEasing },
      { id: uid(), time: entranceDur, property: "scale", value: baseScale, easing: "easeOut" },
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "easeIn" },
      { id: uid(), time: entranceDur * 0.7, property: "opacity", value: 1, easing: "linear" }
    );
  } else {
    // Standard Fade / Clean
    keyframes.push(
      { id: uid(), time: 0, property: "opacity", value: 0, easing: "easeOut" },
      { id: uid(), time: entranceDur, property: "opacity", value: 1, easing: "linear" }
    );
  }

  // Emphasis Keyframes (during the middle duration)
  if (template.emphasis?.enabled) {
    const emphAnim = template.emphasis.animation;
    const midStart = entranceDur + 0.1;
    const midEnd = exitStart - 0.1;
    if (midEnd > midStart) {
      if (emphAnim === "pulse" || emphAnim === "beat") {
        const midPoint = (midStart + midEnd) / 2;
        keyframes.push(
          { id: uid(), time: midStart, property: "scale", value: baseScale, easing: "easeInOut" },
          { id: uid(), time: midPoint, property: "scale", value: baseScale * 1.08, easing: "easeInOut" },
          { id: uid(), time: midEnd, property: "scale", value: baseScale, easing: "easeInOut" }
        );
      } else if (emphAnim === "shake") {
        const step = (midEnd - midStart) / 4;
        keyframes.push(
          { id: uid(), time: midStart + step, property: "rotation", value: baseRot - 2.5, easing: "easeInOut" },
          { id: uid(), time: midStart + step * 2, property: "rotation", value: baseRot + 2.5, easing: "easeInOut" },
          { id: uid(), time: midStart + step * 3, property: "rotation", value: baseRot - 1, easing: "easeInOut" },
          { id: uid(), time: midEnd, property: "rotation", value: baseRot, easing: "easeOut" }
        );
      }
    }
  }

  // Exit Keyframes
  if (template.exit && template.exit.animation !== "none" && exitStart < total) {
    const exitAnim = template.exit.animation;
    const exitEasing = (template.exit.easing as TextTemplateEasing) || "easeIn";

    if (exitAnim === "zoom" || exitAnim === "shrink") {
      keyframes.push(
        { id: uid(), time: exitStart, property: "scale", value: baseScale, easing: exitEasing },
        { id: uid(), time: total, property: "scale", value: exitAnim === "zoom" ? baseScale * 1.3 : baseScale * 0.2, easing: "easeIn" },
        { id: uid(), time: exitStart, property: "opacity", value: 1, easing: "linear" },
        { id: uid(), time: total, property: "opacity", value: 0, easing: "easeIn" }
      );
    } else if (exitAnim === "slide" || exitAnim === "drop") {
      keyframes.push(
        { id: uid(), time: exitStart, property: "yPercent", value: baseY, easing: exitEasing },
        { id: uid(), time: total, property: "yPercent", value: Math.min(100, baseY + 10), easing: "easeIn" },
        { id: uid(), time: exitStart, property: "opacity", value: 1, easing: "linear" },
        { id: uid(), time: total, property: "opacity", value: 0, easing: "easeIn" }
      );
    } else {
      // Fade out
      keyframes.push(
        { id: uid(), time: exitStart, property: "opacity", value: 1, easing: "linear" },
        { id: uid(), time: total, property: "opacity", value: 0, easing: exitEasing }
      );
    }
  }

  return keyframes;
}

/**
 * Word Animation State Calculator
 * Computes individual word visibility, highlight, scale, and opacity at localTime.
 * Works seamlessly in both React DOM (CaptionOverlay) and Canvas (ExportDialog).
 */
export function computeWordState(
  wordIndex: number,
  totalWords: number,
  localTime: number,
  totalDuration: number,
  config?: WordAnimationConfig
): {
  isVisible: boolean;
  isActive: boolean;
  opacity: number;
  scale: number;
  translateY: number;
  highlightColor?: string;
  highlightBg?: string;
} {
  if (!config || !config.enabled || totalWords <= 1) {
    return { isVisible: true, isActive: true, opacity: 1, scale: 1, translateY: 0 };
  }

  const stagger = config.stagger || 0.12;
  const wordDuration = config.duration || 0.25;
  const wordStart = wordIndex * stagger;

  // Has the word entered yet?
  if (localTime < wordStart) {
    return {
      isVisible: false,
      isActive: false,
      opacity: 0,
      scale: 0.8,
      translateY: 6,
    };
  }

  const elapsedSinceStart = localTime - wordStart;
  const isEntering = elapsedSinceStart < wordDuration;

  // Active window (when the word is currently the spoken/highlighted focus)
  const isCurrentlyActive =
    elapsedSinceStart >= 0 &&
    (wordIndex === totalWords - 1 || localTime < (wordIndex + 1) * stagger);

  let opacity = 1;
  let scale = 1;
  let translateY = 0;

  if (isEntering) {
    const progress = Math.min(1, elapsedSinceStart / wordDuration);
    const eased = evaluateEasing(config.easing || "easeOut", progress);
    opacity = eased;

    if (config.animation === "pop" || config.animation === "bounce" || config.animation === "scale") {
      scale = 0.5 + eased * 0.5;
    } else if (config.animation === "rise" || config.animation === "slide") {
      translateY = (1 - eased) * 10;
    }
  }

  if (isCurrentlyActive) {
    scale = (config.activeScale || 1.1) * scale;
  }

  return {
    isVisible: true,
    isActive: isCurrentlyActive,
    opacity,
    scale,
    translateY,
    highlightColor: isCurrentlyActive ? config.activeColor : undefined,
    highlightBg: isCurrentlyActive ? config.activeBg : undefined,
  };
}

/**
 * Character Reveal Calculator (for Typewriter or Wave)
 */
export function computeCharacterReveal(
  text: string,
  localTime: number,
  totalDuration: number,
  config?: CharacterAnimationConfig
): {
  visibleText: string;
  isFinished: boolean;
  progress: number;
} {
  if (!config || !config.enabled) {
    return { visibleText: text, isFinished: true, progress: 1 };
  }

  const stagger = config.stagger || 0.04;
  const totalChars = text.length;
  const duration = Math.min(totalDuration * 0.8, totalChars * stagger);
  const progress = Math.min(1, Math.max(0, localTime / duration));
  const charsToShow = Math.floor(progress * totalChars);

  return {
    visibleText: text.slice(0, Math.max(1, charsToShow)),
    isFinished: charsToShow >= totalChars,
    progress,
  };
}

/**
 * Local Storage Persistence for Custom User Templates
 */
const CUSTOM_TEMPLATES_KEY = "rv_custom_text_templates";

export function loadCustomTemplates(): TextTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to load custom text templates:", err);
    return [];
  }
}

export function saveCustomTemplate(template: TextTemplate): void {
  try {
    const existing = loadCustomTemplates().filter((t) => t.id !== template.id);
    const updated = [template, ...existing];
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to save custom text template:", err);
  }
}

export function deleteCustomTemplate(templateId: string): void {
  try {
    const existing = loadCustomTemplates().filter((t) => t.id !== templateId);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(existing));
  } catch (err) {
    console.warn("Failed to delete custom text template:", err);
  }
}

/**
 * 35+ Production-Grade Curated Text Templates
 * Masterfully crafted across all key creative categories
 */
export const TEXT_TEMPLATES: TextTemplate[] = [
  // ===================== VIRAL & REELS =====================
  {
    id: "viral-pop",
    name: "فايرل بوب 🔥",
    nameEn: "Viral Pop 🔥",
    category: "viral",
    version: 1,
    typography: {
      fontFamily: "Archivo Black",
      fontSize: 26,
      letterSpacing: 0.5,
      textAlign: "center",
      textTransform: "uppercase",
    },
    fill: { color: "#facc15" },
    stroke: { enabled: true, color: "#000000", width: 2.5 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.9)", blur: 10, offsetX: 0, offsetY: 3 },
    background: { enabled: true, color: "rgba(0,0,0,0.85)", radius: 14, padding: 10 },
    layout: { position: "bottom", scale: 1, rotation: 0, yPercent: 82 },
    entrance: { animation: "pop", duration: 0.35, easing: "back" },
    emphasis: { enabled: true, animation: "beat", duration: 0.5 },
    exit: { animation: "zoom", duration: 0.25 },
    wordAnimation: {
      enabled: true,
      animation: "pop",
      stagger: 0.12,
      duration: 0.22,
      activeColor: "#22d3ee",
      activeScale: 1.15,
      easing: "back",
    },
    sampleTextAr: "هذا السر سيغير كل شيء! 🔥",
    sampleTextEn: "THIS SECRET CHANGES EVERYTHING! 🔥",
  },
  {
    id: "word-punch",
    name: "بانش الكلمات 🥊",
    nameEn: "Word Punch 🥊",
    category: "viral",
    version: 1,
    typography: {
      fontFamily: "Bebas Neue",
      fontSize: 28,
      letterSpacing: 1,
      textAlign: "center",
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: true, color: "#dc2626", width: 2 },
    shadow: { enabled: true, color: "rgba(220,38,38,0.7)", blur: 12, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(15,23,42,0.9)", radius: 12, padding: 8 },
    layout: { position: "center", scale: 1.05, yPercent: 50 },
    entrance: { animation: "scale-up", duration: 0.3, easing: "elastic" },
    emphasis: { enabled: true, animation: "pulse", duration: 0.4 },
    exit: { animation: "fade", duration: 0.2 },
    wordAnimation: {
      enabled: true,
      animation: "bounce",
      stagger: 0.1,
      duration: 0.2,
      activeColor: "#facc15",
      activeBg: "rgba(220,38,38,0.9)",
      activeScale: 1.2,
      easing: "back",
    },
    sampleTextAr: "قوة، سرعة، احتراف 🥊",
    sampleTextEn: "POWER, SPEED, IMPACT 🥊",
  },
  {
    id: "kinetic-beast",
    name: "كينتك بيست ⚡",
    nameEn: "Kinetic Beast ⚡",
    category: "viral",
    version: 1,
    typography: {
      fontFamily: "Syne",
      fontSize: 24,
      letterSpacing: 0.5,
      fontWeight: 800,
    },
    fill: { color: "#06b6d4" },
    stroke: { enabled: true, color: "#000000", width: 2 },
    shadow: { enabled: true, color: "rgba(6,182,212,0.6)", blur: 14, offsetX: 0, offsetY: 0 },
    background: { enabled: true, color: "rgba(0,0,0,0.9)", radius: 16, padding: 10 },
    layout: { position: "bottom", yPercent: 80 },
    entrance: { animation: "slide-up", duration: 0.4, easing: "back" },
    exit: { animation: "slide", duration: 0.25 },
    wordAnimation: {
      enabled: true,
      animation: "rise",
      stagger: 0.09,
      duration: 0.25,
      activeColor: "#f43f5e",
      activeScale: 1.12,
    },
    sampleTextAr: "حركة سريعة ومبهرة ⚡",
    sampleTextEn: "KINETIC ENERGY UNLEASHED ⚡",
  },
  {
    id: "high-hook",
    name: "هوك عالي 🎣",
    nameEn: "High Hook 🎣",
    category: "viral",
    version: 1,
    typography: {
      fontFamily: "Changa",
      fontSize: 25,
      letterSpacing: 0.5,
      fontWeight: 700,
    },
    fill: { color: "#000000" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(250,204,21,0.5)", blur: 8, offsetX: 0, offsetY: 3 },
    background: { enabled: true, color: "#facc15", radius: 8, padding: 12 },
    layout: { position: "top", yPercent: 12 },
    entrance: { animation: "pop", duration: 0.3, easing: "bounce" },
    exit: { animation: "fade", duration: 0.2 },
    sampleTextAr: "انتظر حتى النهاية! 😱",
    sampleTextEn: "WAIT TILL THE END! 😱",
  },
  {
    id: "capcut-karaoke",
    name: "كاراوكي كاب كات 🎤",
    nameEn: "CapCut Karaoke 🎤",
    category: "reels",
    version: 1,
    typography: {
      fontFamily: "Cairo",
      fontSize: 24,
      fontWeight: 800,
      textAlign: "center",
    },
    fill: { color: "#94a3b8" },
    stroke: { enabled: true, color: "#000000", width: 1.5 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.8)", blur: 8, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(0,0,0,0.75)", radius: 20, padding: 12 },
    layout: { position: "bottom", yPercent: 82 },
    entrance: { animation: "fade", duration: 0.3 },
    wordAnimation: {
      enabled: true,
      animation: "highlight",
      stagger: 0.15,
      duration: 0.25,
      activeColor: "#38bdf8",
      activeScale: 1.18,
      activeBg: "rgba(56,189,248,0.25)",
      easing: "easeOut",
    },
    sampleTextAr: "الكلمات تضيء كلمة بكلمة تلقائياً 🎤",
    sampleTextEn: "Word by word karaoke highlighting 🎤",
  },

  // ===================== MINIMAL & SUBTITLES =====================
  {
    id: "clean-fade",
    name: "تلاشي ناعم ✨",
    nameEn: "Clean Fade ✨",
    category: "minimal",
    version: 1,
    typography: {
      fontFamily: "Cairo",
      fontSize: 18,
      letterSpacing: 0.2,
      fontWeight: 600,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.85)", blur: 6, offsetX: 0, offsetY: 1.5 },
    background: { enabled: true, color: "rgba(0,0,0,0.65)", radius: 10, padding: 8 },
    layout: { position: "bottom", yPercent: 88 },
    entrance: { animation: "fade", duration: 0.35, easing: "easeOut" },
    exit: { animation: "fade", duration: 0.25 },
    sampleTextAr: "بساطة التصميم تعطي الفيديو فخامة",
    sampleTextEn: "Minimal design enhances every frame",
  },
  {
    id: "minimal-lower-third",
    name: "ثلث سفلي هادئ 📋",
    nameEn: "Minimal Lower Third 📋",
    category: "minimal",
    version: 1,
    typography: {
      fontFamily: "Tajawal",
      fontSize: 19,
      letterSpacing: 0.4,
      fontWeight: 600,
    },
    fill: { color: "#f8fafc" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.6)", blur: 4, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(15,23,42,0.85)", radius: 6, padding: 10 },
    layout: { position: "bottom", yPercent: 85, xPercent: 50 },
    entrance: { animation: "slide-up", duration: 0.35, easing: "easeOut" },
    exit: { animation: "slide", duration: 0.2 },
    sampleTextAr: "تصميم أنيق ومناسب للشروحات والبودكاست",
    sampleTextEn: "Elegant lower third for tutorials & vlogs",
  },
  {
    id: "swiss-clean",
    name: "سويسري نقي 📐",
    nameEn: "Swiss Clean 📐",
    category: "minimal",
    version: 1,
    typography: {
      fontFamily: "Space Grotesk",
      fontSize: 22,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      fontWeight: 700,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: true, color: "#000000", width: 1 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 4, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "#000000", radius: 4, padding: 8 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "fade", duration: 0.25 },
    exit: { animation: "fade", duration: 0.2 },
    sampleTextAr: "دقة وهندسة الطباعة الحديثة",
    sampleTextEn: "PRECISION & MODERN TYPOGRAPHY",
  },
  {
    id: "typewriter-code",
    name: "آلة كاتبة تقنية 💻",
    nameEn: "Tech Typewriter 💻",
    category: "minimal",
    version: 1,
    typography: {
      fontFamily: "JetBrains Mono",
      fontSize: 18,
      letterSpacing: 0.8,
    },
    fill: { color: "#22c55e" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(34,197,94,0.5)", blur: 8, offsetX: 0, offsetY: 0 },
    background: { enabled: true, color: "rgba(0,0,0,0.9)", radius: 8, padding: 8 },
    layout: { position: "bottom", yPercent: 86 },
    entrance: { animation: "typewriter", duration: 0.4 },
    characterAnimation: {
      enabled: true,
      animation: "typewriter",
      stagger: 0.045,
      duration: 0.8,
    },
    sampleTextAr: "> جارٍ تنفيذ الأمر بنجاح...",
    sampleTextEn: "> npm run build: production ready.",
  },

  // ===================== CINEMATIC =====================
  {
    id: "cinematic-title",
    name: "عنوان سينمائي فاخر 🎬",
    nameEn: "Cinematic Title 🎬",
    category: "cinematic",
    version: 1,
    typography: {
      fontFamily: "Playfair Display",
      fontSize: 26,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.9)", blur: 16, offsetX: 0, offsetY: 4 },
    background: { enabled: false, color: "transparent", radius: 0, padding: 0 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "zoom-fade", duration: 0.8, easing: "easeOut" },
    exit: { animation: "fade", duration: 0.5 },
    sampleTextAr: "البداية السينمائية الملحمية",
    sampleTextEn: "THE CINEMATIC MASTERPIECE",
  },
  {
    id: "golden-luxury",
    name: "ذهب ملكي 👑",
    nameEn: "Royal Gold 👑",
    category: "cinematic",
    version: 1,
    typography: {
      fontFamily: "Cinzel",
      fontSize: 25,
      letterSpacing: 2.5,
      textTransform: "uppercase",
    },
    fill: { color: "#fef08a" },
    stroke: { enabled: true, color: "#854d0e", width: 1.5 },
    shadow: { enabled: true, color: "rgba(234,179,8,0.7)", blur: 18, offsetX: 0, offsetY: 3 },
    background: { enabled: true, color: "rgba(0,0,0,0.85)", radius: 12, padding: 12 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "3d-flip", duration: 0.6, easing: "back" },
    exit: { animation: "zoom", duration: 0.4 },
    sampleTextAr: "فخامة وأناقة ملكية 👑",
    sampleTextEn: "TIMELESS LUXURY & ELEGANCE 👑",
  },
  {
    id: "blur-reveal",
    name: "تمويه ضبابي سينمائي 🌫️",
    nameEn: "Cinematic Blur Reveal 🌫️",
    category: "cinematic",
    version: 1,
    typography: {
      fontFamily: "Outfit",
      fontSize: 24,
      letterSpacing: 1,
      fontWeight: 600,
    },
    fill: { color: "#f8fafc" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.8)", blur: 12, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(30,41,59,0.7)", radius: 16, padding: 10 },
    layout: { position: "bottom", yPercent: 82 },
    entrance: { animation: "blur-in", duration: 0.5, easing: "easeOut" },
    exit: { animation: "fade", duration: 0.3 },
    sampleTextAr: "ظهور سلس مع ضبابية بصرية راقية",
    sampleTextEn: "Smooth atmospheric blur entrance",
  },

  // ===================== MUSIC & RHYTHM =====================
  {
    id: "beat-bounce",
    name: "نبض الإيقاع 🎵",
    nameEn: "Beat Bounce 🎵",
    category: "music",
    version: 1,
    typography: {
      fontFamily: "Changa",
      fontSize: 26,
      letterSpacing: 0.5,
      fontWeight: 700,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: true, color: "#a855f7", width: 2 },
    shadow: { enabled: true, color: "rgba(168,85,247,0.7)", blur: 14, offsetX: 0, offsetY: 0 },
    background: { enabled: true, color: "rgba(15,23,42,0.9)", radius: 18, padding: 10 },
    layout: { position: "bottom", yPercent: 80 },
    entrance: { animation: "bounce", duration: 0.4, easing: "elastic" },
    emphasis: { enabled: true, animation: "beat", duration: 0.35 },
    wordAnimation: {
      enabled: true,
      animation: "bounce",
      stagger: 0.12,
      duration: 0.25,
      activeColor: "#ec4899",
      activeScale: 1.25,
      easing: "bounce",
    },
    sampleTextAr: "تناغم الكلمات مع النغمات الموسيقية 🎵",
    sampleTextEn: "Rhythmic synchronization with beats 🎵",
  },
  {
    id: "neon-pulse",
    name: "نبض نيون كهربائي ⚡",
    nameEn: "Cyber Neon Pulse ⚡",
    category: "neon",
    version: 1,
    typography: {
      fontFamily: "Space Grotesk",
      fontSize: 25,
      letterSpacing: 1,
      fontWeight: 700,
    },
    fill: { color: "#22d3ee" },
    stroke: { enabled: true, color: "#0891b2", width: 1.5 },
    shadow: { enabled: true, color: "rgba(34,211,238,0.9)", blur: 16, offsetX: 0, offsetY: 0 },
    background: { enabled: true, color: "rgba(15,23,42,0.95)", radius: 14, padding: 10 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "neon-flicker", duration: 0.45 },
    emphasis: { enabled: true, animation: "pulse", duration: 0.4 },
    exit: { animation: "fade", duration: 0.2 },
    sampleTextAr: "توهج نيون مستقبلي ساطع ⚡",
    sampleTextEn: "FUTURISTIC NEON GLOW ⚡",
  },
  {
    id: "bass-drop",
    name: "انفجار الباس 🔊",
    nameEn: "Bass Drop Impact 🔊",
    category: "music",
    version: 1,
    typography: {
      fontFamily: "Archivo Black",
      fontSize: 27,
      letterSpacing: 0.5,
    },
    fill: { color: "#ef4444" },
    stroke: { enabled: true, color: "#ffffff", width: 2 },
    shadow: { enabled: true, color: "rgba(239,68,68,0.8)", blur: 16, offsetX: 0, offsetY: 4 },
    background: { enabled: true, color: "rgba(0,0,0,0.9)", radius: 10, padding: 10 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "shatter-pop", duration: 0.4, easing: "back" },
    emphasis: { enabled: true, animation: "shake", duration: 0.3 },
    sampleTextAr: "ضربة قوية وانفجار إيقاعي 🔊",
    sampleTextEn: "BASS DROP EXPLOSION 🔊",
  },

  // ===================== GAMING & MEME =====================
  {
    id: "gaming-impact",
    name: "ضربة ألعاب حماسية 🎮",
    nameEn: "Gaming Impact 🎮",
    category: "gaming",
    version: 1,
    typography: {
      fontFamily: "Archivo Black",
      fontSize: 26,
      letterSpacing: 0.8,
    },
    fill: { color: "#fde047" },
    stroke: { enabled: true, color: "#dc2626", width: 3 },
    shadow: { enabled: true, color: "rgba(220,38,38,0.8)", blur: 14, offsetX: 0, offsetY: 4 },
    background: { enabled: true, color: "rgba(0,0,0,0.9)", radius: 12, padding: 10 },
    layout: { position: "bottom", yPercent: 78, rotation: -2 },
    entrance: { animation: "swing-in", duration: 0.4, easing: "back" },
    emphasis: { enabled: true, animation: "shake", duration: 0.3 },
    wordAnimation: {
      enabled: true,
      animation: "scale",
      stagger: 0.1,
      duration: 0.2,
      activeColor: "#ef4444",
      activeScale: 1.25,
    },
    sampleTextAr: "لقطة أسطورية وانتصار ساحق! 🎮",
    sampleTextEn: "LEGENDARY PLAY & VICTORY! 🎮",
  },
  {
    id: "comic-pop",
    name: "كوميك بوب 💥",
    nameEn: "Comic Pop 💥",
    category: "meme",
    version: 1,
    typography: {
      fontFamily: "Fredoka",
      fontSize: 25,
      fontWeight: 700,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: true, color: "#000000", width: 3 },
    shadow: { enabled: true, color: "#000000", blur: 0, offsetX: 4, offsetY: 4 },
    background: { enabled: true, color: "#ec4899", radius: 16, padding: 12 },
    layout: { position: "center", yPercent: 48, rotation: 3 },
    entrance: { animation: "pop", duration: 0.3, easing: "bounce" },
    sampleTextAr: "وااااو! غير معقول 💥",
    sampleTextEn: "BOOM! UNBELIEVABLE 💥",
  },
  {
    id: "rgb-glitch",
    name: "جليتش مصفوفة 👾",
    nameEn: "Matrix RGB Glitch 👾",
    category: "glitch",
    version: 1,
    typography: {
      fontFamily: "Fira Code",
      fontSize: 22,
      letterSpacing: 1,
    },
    fill: { color: "#22d3ee" },
    stroke: { enabled: true, color: "#ec4899", width: 1.5 },
    shadow: { enabled: true, color: "rgba(34,211,238,0.8)", blur: 12, offsetX: -2, offsetY: 2 },
    background: { enabled: true, color: "rgba(0,0,0,0.9)", radius: 8, padding: 8 },
    layout: { position: "bottom", yPercent: 82 },
    entrance: { animation: "glitch", duration: 0.4 },
    sampleTextAr: "خطأ في النظام البرمجي 👾",
    sampleTextEn: "SYSTEM CORRUPTED_ERROR 👾",
  },

  // ===================== PODCAST & TALKING =====================
  {
    id: "podcast-clean",
    name: "بودكاست راقي 🎙️",
    nameEn: "Clean Podcast 🎙️",
    category: "podcast",
    version: 1,
    typography: {
      fontFamily: "Alexandria",
      fontSize: 20,
      letterSpacing: 0.3,
      fontWeight: 600,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.7)", blur: 6, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(30,41,59,0.9)", radius: 24, padding: 10 },
    layout: { position: "bottom", yPercent: 84 },
    entrance: { animation: "slide-up", duration: 0.35, easing: "easeOut" },
    badgeIcon: "mic",
    sampleTextAr: "حوار هادف، فكرة عميقة، ومحادثة ملهمة 🎙️",
    sampleTextEn: "Inspiring dialogues and deep thoughts 🎙️",
  },
  {
    id: "host-quote",
    name: "اقتباس المتحدث 💬",
    nameEn: "Speaker Quote 💬",
    category: "podcast",
    version: 1,
    typography: {
      fontFamily: "Tajawal",
      fontSize: 20,
      fontWeight: 600,
      textAlign: "center",
    },
    fill: { color: "#f8fafc" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.8)", blur: 8, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(15,23,42,0.88)", radius: 14, padding: 12 },
    layout: { position: "bottom", yPercent: 80 },
    entrance: { animation: "fade", duration: 0.3 },
    badgeIcon: "quote",
    sampleTextAr: "«النجاح لا يأتي بالصدفة بل بالإصرار المستمر»",
    sampleTextEn: "“Success is not accidental, but intentional”",
  },

  // ===================== NEWS & SPORTS =====================
  {
    id: "breaking-news-bar",
    name: "شريط خبر عاجل 🔴",
    nameEn: "Breaking News Bar 🔴",
    category: "news",
    version: 1,
    typography: {
      fontFamily: "Almarai",
      fontSize: 20,
      letterSpacing: 0.4,
      fontWeight: 700,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: true, color: "#ffffff", width: 0.5 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.9)", blur: 6, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(185,28,28,0.95)", radius: 4, padding: 10 },
    layout: { position: "bottom", yPercent: 90 },
    entrance: { animation: "reveal-left", duration: 0.4, easing: "easeOut" },
    badgeIcon: "news",
    sampleTextAr: "عاجل | تفاصيل هامة ومتابعة مستمرة للأحداث",
    sampleTextEn: "BREAKING | Live updates and developing story",
  },
  {
    id: "sports-score-bar",
    name: "شريط رياضي حماسي ⚽",
    nameEn: "Sports Impact Bar ⚽",
    category: "sports",
    version: 1,
    typography: {
      fontFamily: "Bebas Neue",
      fontSize: 24,
      letterSpacing: 1,
    },
    fill: { color: "#facc15" },
    stroke: { enabled: true, color: "#000000", width: 1.5 },
    shadow: { enabled: true, color: "rgba(0,0,0,0.8)", blur: 8, offsetX: 0, offsetY: 3 },
    background: { enabled: true, color: "rgba(22,101,52,0.95)", radius: 8, padding: 10 },
    layout: { position: "top", yPercent: 12 },
    entrance: { animation: "slide-down", duration: 0.35, easing: "bounce" },
    badgeIcon: "award",
    sampleTextAr: "هدف الحسم في الدقيقة الأخيرة! ⚽",
    sampleTextEn: "MATCH POINT & CHAMPIONSHIP GOAL! ⚽",
  },

  // ===================== 3D & ELEGANT =====================
  {
    id: "3d-flip-card",
    name: "بطاقة 3D 🌀",
    nameEn: "3D Flip Card 🌀",
    category: "3d",
    version: 1,
    typography: {
      fontFamily: "Syne",
      fontSize: 23,
      fontWeight: 700,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: true, color: "#3b82f6", width: 1.5 },
    shadow: { enabled: true, color: "rgba(59,130,246,0.6)", blur: 14, offsetX: 0, offsetY: 4 },
    background: { enabled: true, color: "rgba(15,23,42,0.95)", radius: 18, padding: 12 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "3d-flip", duration: 0.55, easing: "back" },
    exit: { animation: "zoom", duration: 0.3 },
    sampleTextAr: "انعطاف ثلاثي الأبعاد جذاب 🌀",
    sampleTextEn: "DYNAMIC 3D PERSPECTIVE FLIP 🌀",
  },
  {
    id: "elastic-bubble",
    name: "فقاعة مطاطية 🎈",
    nameEn: "Elastic Bubble 🎈",
    category: "social",
    version: 1,
    typography: {
      fontFamily: "Marhey",
      fontSize: 24,
      fontWeight: 700,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(249,115,22,0.6)", blur: 12, offsetX: 0, offsetY: 4 },
    background: { enabled: true, color: "rgba(249,115,22,0.95)", radius: 24, padding: 12 },
    layout: { position: "center", yPercent: 50 },
    entrance: { animation: "elastic-drop", duration: 0.6, easing: "elastic" },
    exit: { animation: "shrink", duration: 0.25 },
    sampleTextAr: "مرح وحيوي يقفز في الشاشة 🎈",
    sampleTextEn: "BOUNCY PLAYFUL BUBBLE 🎈",
  },
  {
    id: "retro-vhs-80s",
    name: "ريترو شريط في إتش إس 📼",
    nameEn: "Retro VHS 80s 📼",
    category: "retro",
    version: 1,
    typography: {
      fontFamily: "JetBrains Mono",
      fontSize: 20,
      letterSpacing: 1,
    },
    fill: { color: "#22d3ee" },
    stroke: { enabled: true, color: "#f43f5e", width: 1.5 },
    shadow: { enabled: true, color: "rgba(244,63,94,0.8)", blur: 10, offsetX: 2, offsetY: 2 },
    background: { enabled: true, color: "rgba(0,0,0,0.85)", radius: 4, padding: 8 },
    layout: { position: "top", yPercent: 12 },
    entrance: { animation: "glitch", duration: 0.4 },
    badgeIcon: "radio",
    sampleTextAr: "REC ● 00:24:19 PLAY 📼",
    sampleTextEn: "REC ● 00:24:19 PLAY 📼",
  },
  {
    id: "social-location-badge",
    name: "شعار الموقع 📍",
    nameEn: "Location Badge 📍",
    category: "social",
    version: 1,
    typography: {
      fontFamily: "Tajawal",
      fontSize: 18,
      fontWeight: 600,
    },
    fill: { color: "#e0f2fe" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(56,189,248,0.4)", blur: 8, offsetX: 0, offsetY: 2 },
    background: { enabled: true, color: "rgba(15,23,42,0.9)", radius: 24, padding: 8 },
    layout: { position: "top", yPercent: 10 },
    entrance: { animation: "pop", duration: 0.35, easing: "bounce" },
    badgeIcon: "location",
    sampleTextAr: "دبي، الإمارات العربية المتحدة 🇦🇪",
    sampleTextEn: "Dubai, United Arab Emirates 🇦🇪",
  },
  {
    id: "instagram-creator",
    name: "معرّف انستغرام 📸",
    nameEn: "Instagram Creator 📸",
    category: "social",
    version: 1,
    typography: {
      fontFamily: "Outfit",
      fontSize: 19,
      fontWeight: 600,
    },
    fill: { color: "#ffffff" },
    stroke: { enabled: false, color: "#000", width: 0 },
    shadow: { enabled: true, color: "rgba(236,72,153,0.5)", blur: 10, offsetX: 0, offsetY: 3 },
    background: { enabled: true, color: "rgba(236,72,153,0.95)", radius: 18, padding: 8 },
    layout: { position: "bottom", yPercent: 82 },
    entrance: { animation: "slide-up", duration: 0.35, easing: "back" },
    badgeIcon: "instagram",
    sampleTextAr: "@creator_official 📸",
    sampleTextEn: "@creator_official 📸",
  },
];

/**
 * Apply a TextTemplate to an existing Caption or create a new Caption with the template.
 */
export function applyTemplateToCaption(
  template: TextTemplate,
  caption: Partial<Caption>,
  duration: number
): Caption {
  // Templates have automatic built-in motion (entrance animation, word animation, character animation)
  // They do not force artificial timeline keyframes onto the caption.
  return {
    id: caption.id || `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    start: caption.start ?? 0,
    end: caption.end ?? (caption.start ? caption.start + duration : duration),
    text: caption.text || template.sampleTextAr,
    font: template.typography.fontFamily,
    size: template.typography.fontSize,
    color: template.fill.color,
    bg: template.background?.enabled ? template.background.color : "rgba(0,0,0,0)",
    bgRadius: template.background?.radius,
    bgPadding: template.background?.padding,
    strokeColor: template.stroke?.enabled ? template.stroke.color : undefined,
    strokeWidth: template.stroke?.enabled ? template.stroke.width : 0,
    shadowColor: template.shadow?.enabled ? template.shadow.color : undefined,
    shadowBlur: template.shadow?.enabled ? template.shadow.blur : 0,
    shadowOffsetX: template.shadow?.enabled ? template.shadow.offsetX : 0,
    shadowOffsetY: template.shadow?.enabled ? template.shadow.offsetY : 0,
    letterSpacing: template.typography.letterSpacing,
    lineHeight: template.typography.lineHeight,
    textTransform: template.typography.textTransform,
    animation: (template.entrance?.animation as CaptionAnimation) || "none",
    badgeIcon: template.badgeIcon,
    badgePosition: template.badgePosition,
    presetCategory: template.category,
    templateId: template.id,
    wordAnimation: template.wordAnimation,
    characterAnimation: template.characterAnimation,
    keyframes: undefined,
    yPercent: caption.yPercent ?? template.layout.yPercent,
    xPercent: caption.xPercent ?? template.layout.xPercent,
    scale: caption.scale ?? template.layout.scale,
    rotation: caption.rotation ?? template.layout.rotation,
  };
}
