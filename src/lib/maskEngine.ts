// Shared mask engine — used identically by the live preview and the export loop (WYSIWYG).
// All coordinates are relative to the layer box: maskX/maskY are % of the layer's width/height,
// maskSize is % of the layer's smaller side (100 = shape fits the layer).

import { MASK_SHAPES } from "./maskShapes";
import { interpolateKeyframes, type Keyframe } from "@/context/MediaContext";

export type MaskShape =
  | "none"
  | "circle"
  | "rectangle"
  | "rounded-rectangle"
  | "star"
  | "heart"
  | "custom-path";

export interface MaskKeyframe {
  time: number;
  x: number;
  y: number;
  size: number;
  width?: number;
  height?: number;
  feather?: number;
}

export interface MaskConfig {
  maskShape?: MaskShape;
  maskX?: number;
  maskY?: number;
  maskSize?: number;
  maskWidth?: number; // % multiplier of width (100 = default)
  maskHeight?: number; // % multiplier of height
  maskFeather?: number; // 0..50 px (in layer/preview pixel space)
  maskInverted?: boolean;
  maskKeyframes?: MaskKeyframe[];
  maskPath?: string; // SVG path in a 0..100 box, for custom-path
  customPoints?: Array<{ x: number; y: number }>; // Normalized 0..100 freeform polygon points
}

/**
 * Normalizes a layer object (Clip, OverlayItem, Caption, or MaskConfig) into a unified MaskConfig.
 * Supports both `layer.mask` (shared MaskConfig field) and legacy top-level properties on OverlayItem.
 */
export function getEffectiveMask(
  item?: ({ mask?: MaskConfig } & Partial<MaskConfig>) | null
): MaskConfig | undefined {
  if (!item) return undefined;
  if (item.mask && item.mask.maskShape && item.mask.maskShape !== "none") {
    return item.mask;
  }
  if (item.maskShape && item.maskShape !== "none") {
    return {
      maskShape: item.maskShape,
      maskX: item.maskX,
      maskY: item.maskY,
      maskSize: item.maskSize,
      maskWidth: item.maskWidth,
      maskHeight: item.maskHeight,
      maskFeather: item.maskFeather,
      maskInverted: item.maskInverted,
      maskKeyframes: item.maskKeyframes,
      maskPath: item.maskPath,
      customPoints: item.customPoints,
    };
  }
  return item.mask;
}

export const hasMask = (
  item?: ({ mask?: MaskConfig } & Partial<MaskConfig>) | null
): boolean => {
  const m = getEffectiveMask(item);
  return !!m && !!m.maskShape && m.maskShape !== "none";
};

/**
 * Interpolates mask position/size/stretch/feather at a time relative to the layer start.
 * Reuses the standard `interpolateKeyframes` system (used by captions/clips/overlays)
 * and also supports `maskKeyframes` for full compatibility.
 */
export function resolveMaskState(
  c: MaskConfig,
  localTime: number,
  layerKeyframes?: Keyframe[]
) {
  let x = c.maskX ?? 50;
  let y = c.maskY ?? 50;
  let size = c.maskSize ?? 100;
  let width = c.maskWidth ?? 100;
  let height = c.maskHeight ?? 100;
  let feather = c.maskFeather ?? 0;

  // 1. Check standard layerKeyframes (shared keyframe system used for captions/clips/overlays)
  if (layerKeyframes && layerKeyframes.length > 0) {
    const hasProp = (prop: string) => layerKeyframes.some((k) => k.property === prop);
    if (hasProp("maskX")) x = interpolateKeyframes({ keyframes: layerKeyframes }, "maskX", localTime, x);
    if (hasProp("maskY")) y = interpolateKeyframes({ keyframes: layerKeyframes }, "maskY", localTime, y);
    if (hasProp("maskSize")) size = interpolateKeyframes({ keyframes: layerKeyframes }, "maskSize", localTime, size);
    if (hasProp("maskWidth")) width = interpolateKeyframes({ keyframes: layerKeyframes }, "maskWidth", localTime, width);
    if (hasProp("maskHeight")) height = interpolateKeyframes({ keyframes: layerKeyframes }, "maskHeight", localTime, height);
    if (hasProp("maskFeather")) feather = interpolateKeyframes({ keyframes: layerKeyframes }, "maskFeather", localTime, feather);
  }

  // 2. Also support dedicated maskKeyframes array if present
  const kfs = [...(c.maskKeyframes || [])].sort((a, b) => a.time - b.time);
  if (kfs.length > 0) {
    if (localTime <= kfs[0].time) {
      x = kfs[0].x;
      y = kfs[0].y;
      size = kfs[0].size;
      if (kfs[0].width !== undefined) width = kfs[0].width;
      if (kfs[0].height !== undefined) height = kfs[0].height;
      if (kfs[0].feather !== undefined) feather = kfs[0].feather;
    } else if (localTime >= kfs[kfs.length - 1].time) {
      const last = kfs[kfs.length - 1];
      x = last.x;
      y = last.y;
      size = last.size;
      if (last.width !== undefined) width = last.width;
      if (last.height !== undefined) height = last.height;
      if (last.feather !== undefined) feather = last.feather;
    } else {
      for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        if (localTime >= a.time && localTime <= b.time) {
          const t = b.time - a.time > 0 ? (localTime - a.time) / (b.time - a.time) : 1;
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
          x = a.x + (b.x - a.x) * e;
          y = a.y + (b.y - a.y) * e;
          size = a.size + (b.size - a.size) * e;
          if (a.width !== undefined && b.width !== undefined) width = a.width + (b.width - a.width) * e;
          if (a.height !== undefined && b.height !== undefined) height = a.height + (b.height - a.height) * e;
          if (a.feather !== undefined && b.feather !== undefined) feather = a.feather + (b.feather - a.feather) * e;
          break;
        }
      }
    }
  }

  return { x, y, size, width, height, feather };
}

/** Builds the mask shape path on ctx for a layer box of w×h (origin top-left). */
export function traceMaskPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  c: MaskConfig,
  localTime: number,
  w: number,
  h: number,
  layerKeyframes?: Keyframe[]
): Path2D | null {
  const { x, y, size, width, height } = resolveMaskState(c, localTime, layerKeyframes);
  const cx = (x / 100) * w;
  const cy = (y / 100) * h;
  const base = (Math.min(w, h) * size) / 100;
  const sw = Math.max(1, base * (width / 100));
  const sh = Math.max(1, base * (height / 100));

  ctx.beginPath();
  const shapeDef = MASK_SHAPES.find((s) => s.id === c.maskShape);
  if (shapeDef) {
    return shapeDef.draw(ctx, cx, cy, sw, sh, c);
  }
  return null;
}

/** Renders the alpha mask (white = visible) into a canvas of w×h. featherPx is in the same pixel space as w/h. */
export function renderMaskCanvas(
  c: MaskConfig,
  localTime: number,
  w: number,
  h: number,
  featherPx?: number,
  layerKeyframes?: Keyframe[]
): HTMLCanvasElement {
  const resolved = resolveMaskState(c, localTime, layerKeyframes);
  const effectiveFeather = featherPx !== undefined ? featherPx : resolved.feather;

  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const m = cv.getContext("2d")!;

  if (c.maskInverted) {
    m.fillStyle = "#fff";
    m.fillRect(0, 0, cv.width, cv.height);
    m.globalCompositeOperation = "destination-out";
  }
  if (effectiveFeather > 0) {
    m.filter = `blur(${effectiveFeather}px)`;
  }
  m.fillStyle = "#fff";
  const p = traceMaskPath(m, c, localTime, cv.width, cv.height, layerKeyframes);
  if (p) {
    m.fill(p);
  } else {
    m.fill();
  }
  return cv;
}

/**
 * Applies hard-edge clipping (`ctx.clip()`) directly onto `ctx` before drawing content.
 * Ideal when feather === 0 and maskInverted === false.
 */
export function clipContextWithMask(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  c: MaskConfig,
  localTime: number,
  w: number,
  h: number,
  layerKeyframes?: Keyframe[]
) {
  const p = traceMaskPath(ctx, c, localTime, w, h, layerKeyframes);
  if (p) {
    ctx.clip(p);
  } else {
    ctx.clip();
  }
}

/**
 * Shared `applyMaskToContext(ctx, maskConfig, currentTime)` utility used identically
 * by live preview and ExportDialog.tsx's export loop for guaranteed WYSIWYG consistency.
 * Supports:
 * - Hard-edge clipping (`ctx.clip()` when `drawContent` callback is supplied and feather === 0 & !inverted,
 *   or crisp destination-in path when content is already drawn on `ctx`).
 * - Soft-edge feathering & inverted masks (offscreen canvas + `destination-in` composite).
 */
export function applyMaskToContext(
  ctx: CanvasRenderingContext2D,
  maskInput: ({ mask?: MaskConfig } & Partial<MaskConfig>) | null | undefined,
  localTime: number,
  w?: number,
  h?: number,
  featherPx?: number,
  layerKeyframes?: Keyframe[],
  drawContent?: (targetCtx: CanvasRenderingContext2D) => void
) {
  const c = getEffectiveMask(maskInput);
  if (!c || !hasMask(c)) {
    if (drawContent) drawContent(ctx);
    return;
  }

  const width = w ?? ctx.canvas.width;
  const height = h ?? ctx.canvas.height;
  const resolved = resolveMaskState(c, localTime, layerKeyframes);
  const effectiveFeather = featherPx !== undefined ? featherPx : resolved.feather;

  // Mode A: Caller passes a `drawContent` callback — use direct `ctx.clip()` for hard-edge non-inverted masks,
  // or offscreen canvas + destination-in for soft-edge / inverted masks.
  if (drawContent) {
    if (effectiveFeather <= 0 && !c.maskInverted) {
      ctx.save();
      clipContextWithMask(ctx, c, localTime, width, height, layerKeyframes);
      drawContent(ctx);
      ctx.restore();
    } else {
      const layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.round(width));
      layer.height = Math.max(1, Math.round(height));
      const lctx = layer.getContext("2d")!;
      drawContent(lctx);
      const mask = renderMaskCanvas(c, localTime, layer.width, layer.height, effectiveFeather, layerKeyframes);
      lctx.save();
      lctx.globalCompositeOperation = "destination-in";
      lctx.drawImage(mask, 0, 0, layer.width, layer.height);
      lctx.restore();
      ctx.drawImage(layer, 0, 0, width, height);
    }
    return;
  }

  // Mode B: Content is already drawn on `ctx` at (0, 0, width, height).
  const mask = renderMaskCanvas(c, localTime, width, height, effectiveFeather, layerKeyframes);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, width, height);
  ctx.restore();
}

/** Data-URL mask for CSS `mask-image` in the live preview — generated by the exact same renderMaskCanvas / applyMaskToContext logic. */
export function maskDataUrl(
  maskInput: ({ mask?: MaskConfig } & Partial<MaskConfig>) | null | undefined,
  localTime: number,
  w: number,
  h: number,
  layerKeyframes?: Keyframe[]
): string | null {
  const c = getEffectiveMask(maskInput);
  if (!c || !hasMask(c) || w <= 0 || h <= 0) return null;
  // Cap mask resolution for fast real-time preview updates while preserving crisp edges & accurate feather ratio
  const maxSide = 480;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const mw = Math.max(1, Math.round(w * scale));
  const mh = Math.max(1, Math.round(h * scale));
  const resolved = resolveMaskState(c, localTime, layerKeyframes);
  const scaledFeather = resolved.feather * scale;
  return renderMaskCanvas(c, localTime, mw, mh, scaledFeather, layerKeyframes).toDataURL("image/png");
}
