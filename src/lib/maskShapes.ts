import { Ban, Circle, Square, Diamond, Star, Heart, PenTool, Sparkles, Maximize2, CornerUpRight } from "lucide-react";
import type { MaskShape, MaskConfig } from "./maskEngine";

export interface MaskShapeDefinition {
  id: MaskShape;
  labelAr: string;
  labelEn: string;
  icon: any;
  /**
   * Traces the shape into the provided 2D rendering context within bounding box [cx - sw/2, cy - sh/2, sw, sh].
   * May optionally return a Path2D object (e.g. for SVG path scaling).
   */
  draw: (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    cy: number,
    sw: number,
    sh: number,
    config: MaskConfig
  ) => Path2D | null;
}

/**
 * Converts normalized 0..100 freeform points into an SVG path string in a 0..100 coordinate box.
 */
export function pointsToSvgPath(points: Array<{ x: number; y: number }>, closed = true): string {
  if (!points || points.length === 0) return "";
  const cmds = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
  if (closed && points.length >= 3) cmds.push("Z");
  return cmds.join(" ");
}

/**
 * Extensible Mask Shape Library.
 * New shapes can be added to this array without modifying UI components or rendering loops.
 */
export const MASK_SHAPES: MaskShapeDefinition[] = [
  {
    id: "none",
    labelAr: "بدون",
    labelEn: "None",
    icon: Ban,
    draw: () => null,
  },
  {
    id: "circle",
    labelAr: "دائرة",
    labelEn: "Circle",
    icon: Circle,
    draw: (ctx, cx, cy, sw, sh) => {
      ctx.ellipse(cx, cy, Math.max(0.5, sw / 2), Math.max(0.5, sh / 2), 0, 0, Math.PI * 2);
      return null;
    },
  },
  {
    id: "rectangle",
    labelAr: "مستطيل",
    labelEn: "Rect",
    icon: Square,
    draw: (ctx, cx, cy, sw, sh) => {
      ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
      return null;
    },
  },
  {
    id: "rounded-rectangle",
    labelAr: "حواف دائرية",
    labelEn: "Rounded",
    icon: Diamond,
    draw: (ctx, cx, cy, sw, sh) => {
      const r = Math.min(sw, sh) * 0.18;
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, r);
      } else {
        ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
      }
      return null;
    },
  },
  {
    id: "star",
    labelAr: "نجمة",
    labelEn: "Star",
    icon: Star,
    draw: (ctx, cx, cy, sw, sh) => {
      const R = 1;
      const r = 0.42;
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : r;
        const px = cx + Math.cos(ang) * rad * (sw / 2);
        const py = cy + Math.sin(ang) * rad * (sh / 2) + sh * 0.05;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return null;
    },
  },
  {
    id: "heart",
    labelAr: "قلب",
    labelEn: "Heart",
    icon: Heart,
    draw: (ctx, cx, cy, sw, sh) => {
      const l = cx - sw / 2;
      const t = cy - sh / 2;
      const X = (v: number) => l + v * sw;
      const Y = (v: number) => t + v * sh;
      ctx.moveTo(X(0.5), Y(0.95));
      ctx.bezierCurveTo(X(0.1), Y(0.7), X(-0.05), Y(0.4), X(0.1), Y(0.2));
      ctx.bezierCurveTo(X(0.25), Y(0.02), X(0.45), Y(0.08), X(0.5), Y(0.28));
      ctx.bezierCurveTo(X(0.55), Y(0.08), X(0.75), Y(0.02), X(0.9), Y(0.2));
      ctx.bezierCurveTo(X(1.05), Y(0.4), X(0.9), Y(0.7), X(0.5), Y(0.95));
      ctx.closePath();
      return null;
    },
  },
  {
    id: "custom-path",
    labelAr: "رسم حر",
    labelEn: "Freeform",
    icon: PenTool,
    draw: (ctx, cx, cy, sw, sh, config) => {
      const l = cx - sw / 2;
      const t = cy - sh / 2;
      if (config.customPoints && config.customPoints.length >= 3) {
        config.customPoints.forEach((pt, idx) => {
          const px = l + (pt.x / 100) * sw;
          const py = t + (pt.y / 100) * sh;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        return null;
      }
      if (config.maskPath && typeof Path2D !== "undefined") {
        try {
          const m = new DOMMatrix().translate(l, t).scale(sw / 100, sh / 100);
          const p2 = new Path2D();
          p2.addPath(new Path2D(config.maskPath), m);
          return p2;
        } catch {
          // Fallback to rectangle if path is malformed
        }
      }
      ctx.rect(l, t, sw, sh);
      return null;
    },
  },
];

export interface MaskPresetDefinition {
  id: string;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  icon: any;
  config: MaskConfig;
}

/**
 * Ready-made 1-tap mask presets for common video/PIP/caption effects.
 */
export const MASK_PRESETS: MaskPresetDefinition[] = [
  {
    id: "circular-pip",
    labelAr: "دائرة PIP بالزاوية",
    labelEn: "Circular PIP Corner",
    descAr: "قناع دائري في الزاوية العلوية بأسلوب الكاميرا الأمامية",
    descEn: "Circular cutout in the corner for reaction/PIP style",
    icon: CornerUpRight,
    config: {
      maskShape: "circle",
      maskX: 76,
      maskY: 24,
      maskSize: 42,
      maskWidth: 100,
      maskHeight: 100,
      maskFeather: 2,
      maskInverted: false,
    },
  },
  {
    id: "center-spotlight",
    labelAr: "بؤرة تركيز بالمنتصف",
    labelEn: "Center Spotlight",
    descAr: "تركيز دائري ناعم الحواف في منتصف المشهد",
    descEn: "Soft-edged circular focus in the center of the frame",
    icon: Sparkles,
    config: {
      maskShape: "circle",
      maskX: 50,
      maskY: 50,
      maskSize: 78,
      maskWidth: 100,
      maskHeight: 100,
      maskFeather: 18,
      maskInverted: false,
    },
  },
  {
    id: "rounded-frame",
    labelAr: "إطار سينمائي دائري",
    labelEn: "Rounded Frame",
    descAr: "تأطير الطبقة بحواف دائرية أنيقة",
    descEn: "Clean rounded-rectangle frame around the layer",
    icon: Maximize2,
    config: {
      maskShape: "rounded-rectangle",
      maskX: 50,
      maskY: 50,
      maskSize: 90,
      maskWidth: 100,
      maskHeight: 100,
      maskFeather: 0,
      maskInverted: false,
    },
  },
  {
    id: "heart-focus",
    labelAr: "قالب القلب الناعم",
    labelEn: "Soft Heart Cutout",
    descAr: "قناع على شكل قلب مع تنعيم خفيف للحواف",
    descEn: "Heart-shaped mask with gentle edge feathering",
    icon: Heart,
    config: {
      maskShape: "heart",
      maskX: 50,
      maskY: 50,
      maskSize: 82,
      maskWidth: 100,
      maskHeight: 100,
      maskFeather: 6,
      maskInverted: false,
    },
  },
];
