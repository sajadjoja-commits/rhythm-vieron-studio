import { CaptionAnimation, Keyframe } from "@/context/MediaContext";

export type TextTemplateCategory =
  | "viral"
  | "minimal"
  | "cinematic"
  | "music"
  | "reels"
  | "shorts"
  | "gaming"
  | "meme"
  | "podcast"
  | "talking"
  | "sports"
  | "news"
  | "elegant"
  | "neon"
  | "retro"
  | "glitch"
  | "3d"
  | "social";

export type TextTemplateEasing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "back"
  | "elastic"
  | "bounce";

export interface WordAnimationConfig {
  enabled: boolean;
  animation: "pop" | "rise" | "fade" | "highlight" | "slide" | "bounce" | "scale" | "color-punch";
  stagger: number; // delay between words in seconds (e.g. 0.08 - 0.2)
  duration: number; // entrance duration for each individual word
  activeColor?: string; // color highlight when word is spoken / active
  activeBg?: string; // pill background highlight
  activeScale?: number; // zoom scale when word is active (e.g. 1.15)
  easing?: TextTemplateEasing;
}

export interface CharacterAnimationConfig {
  enabled: boolean;
  animation: "typewriter" | "fade" | "pop" | "wave" | "glitch";
  stagger: number; // seconds per char (e.g. 0.04)
  duration: number;
  easing?: TextTemplateEasing;
}

export interface TextTemplateTypography {
  fontFamily: string;
  fontSize: number;
  fontWeight?: string | number;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
}

export interface TextTemplateFill {
  color: string;
  gradient?: string;
}

export interface TextTemplateStroke {
  enabled: boolean;
  color: string;
  width: number;
}

export interface TextTemplateShadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity?: number;
}

export interface TextTemplateBackground {
  enabled: boolean;
  color: string;
  opacity?: number;
  radius: number;
  padding: number;
}

export interface TextTemplateLayout {
  position?: "top" | "center" | "bottom";
  xPercent?: number;
  yPercent?: number;
  scale?: number;
  rotation?: number;
  maxWidth?: number;
}

export interface TextTemplateEntrance {
  animation: CaptionAnimation | string;
  duration: number;
  easing?: TextTemplateEasing;
}

export interface TextTemplateEmphasis {
  enabled: boolean;
  animation: "pulse" | "beat" | "scale" | "shake" | "highlight" | "color-shift" | "none";
  duration: number;
  easing?: TextTemplateEasing;
}

export interface TextTemplateExit {
  animation: "fade" | "slide" | "zoom" | "blur" | "drop" | "shrink" | "none";
  duration: number;
  easing?: TextTemplateEasing;
}

export interface TextTemplateTiming {
  mode: "stretch" | "fixed-entrance" | "loop-emphasis";
  duration?: number;
}

export interface TextTemplate {
  id: string;
  name: string;
  nameEn: string;
  category: TextTemplateCategory;
  version: number;
  typography: TextTemplateTypography;
  fill: TextTemplateFill;
  stroke: TextTemplateStroke;
  shadow: TextTemplateShadow;
  background: TextTemplateBackground;
  layout: TextTemplateLayout;
  entrance: TextTemplateEntrance;
  emphasis?: TextTemplateEmphasis;
  exit?: TextTemplateExit;
  wordAnimation?: WordAnimationConfig;
  characterAnimation?: CharacterAnimationConfig;
  timing?: TextTemplateTiming;
  badgeIcon?: string;
  badgePosition?: "left" | "right" | "top";
  sampleTextAr: string;
  sampleTextEn: string;
  isCustom?: boolean;
}
