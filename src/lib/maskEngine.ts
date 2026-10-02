// Shared mask engine — used identically by the live preview and the export loop (WYSIWYG).
// All coordinates are relative to the layer box: maskX/maskY are % of the layer's width/height,
// maskSize is % of the layer's smaller side (100 = shape fits the layer).

export type MaskShape = "none" | "circle" | "rectangle" | "rounded-rectangle" | "star" | "heart" | "custom-path";

export interface MaskKeyframe { time: number; x: number; y: number; size: number; }

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
}

export const hasMask = (c?: MaskConfig | null) => !!c && !!c.maskShape && c.maskShape !== "none";

/** Interpolates position/size at a time relative to the layer start. */
export function resolveMaskState(c: MaskConfig, localTime: number) {
  let x = c.maskX ?? 50, y = c.maskY ?? 50, size = c.maskSize ?? 100;
  const kfs = [...(c.maskKeyframes || [])].sort((a, b) => a.time - b.time);
  if (kfs.length) {
    if (localTime <= kfs[0].time) ({ x, y, size } = kfs[0]);
    else if (localTime >= kfs[kfs.length - 1].time) ({ x, y, size } = kfs[kfs.length - 1]);
    else {
      for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i], b = kfs[i + 1];
        if (localTime >= a.time && localTime <= b.time) {
          const t = b.time - a.time > 0 ? (localTime - a.time) / (b.time - a.time) : 1;
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
          x = a.x + (b.x - a.x) * e; y = a.y + (b.y - a.y) * e; size = a.size + (b.size - a.size) * e;
          break;
        }
      }
    }
  }
  return { x, y, size };
}

/** Builds the mask shape path on ctx for a layer box of w×h (origin top-left). */
export function traceMaskPath(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, c: MaskConfig, localTime: number, w: number, h: number) {
  const { x, y, size } = resolveMaskState(c, localTime);
  const cx = (x / 100) * w, cy = (y / 100) * h;
  const base = (Math.min(w, h) * size) / 100;
  const sw = base * ((c.maskWidth ?? 100) / 100);
  const sh = base * ((c.maskHeight ?? 100) / 100);
  ctx.beginPath();
  switch (c.maskShape) {
    case "circle":
      ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      break;
    case "rectangle":
      ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
      break;
    case "rounded-rectangle":
      ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, Math.min(sw, sh) * 0.18);
      break;
    case "star": {
      const R = 1, r = 0.42;
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : r;
        const px = cx + Math.cos(ang) * rad * (sw / 2);
        const py = cy + Math.sin(ang) * rad * (sh / 2) + sh * 0.05;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "heart": {
      const l = cx - sw / 2, t = cy - sh / 2;
      const X = (v: number) => l + v * sw, Y = (v: number) => t + v * sh;
      ctx.moveTo(X(0.5), Y(0.95));
      ctx.bezierCurveTo(X(0.1), Y(0.7), X(-0.05), Y(0.4), X(0.1), Y(0.2));
      ctx.bezierCurveTo(X(0.25), Y(0.02), X(0.45), Y(0.08), X(0.5), Y(0.28));
      ctx.bezierCurveTo(X(0.55), Y(0.08), X(0.75), Y(0.02), X(0.9), Y(0.2));
      ctx.bezierCurveTo(X(1.05), Y(0.4), X(0.9), Y(0.7), X(0.5), Y(0.95));
      ctx.closePath();
      break;
    }
    case "custom-path":
      if (c.maskPath && typeof Path2D !== "undefined") {
        ctx.save();
        ctx.translate(cx - sw / 2, cy - sh / 2);
        ctx.scale(sw / 100, sh / 100);
        const p = new Path2D(c.maskPath);
        ctx.restore();
        ctx.beginPath();
        const m = new DOMMatrix().translate(cx - sw / 2, cy - sh / 2).scale(sw / 100, sh / 100);
        const p2 = new Path2D(); p2.addPath(p, m);
        return p2;
      }
      ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
      break;
  }
  return null;
}

/** Renders the alpha mask (white = visible) into a canvas of w×h. featherPx is in the same pixel space as w/h. */
export function renderMaskCanvas(c: MaskConfig, localTime: number, w: number, h: number, featherPx: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
  const m = cv.getContext("2d")!;
  if (c.maskInverted) { m.fillStyle = "#fff"; m.fillRect(0, 0, cv.width, cv.height); m.globalCompositeOperation = "destination-out"; }
  if (featherPx > 0) m.filter = `blur(${featherPx}px)`;
  m.fillStyle = "#fff";
  const p = traceMaskPath(m, c, localTime, cv.width, cv.height);
  p ? m.fill(p) : m.fill();
  return cv;
}

/**
 * Applies the mask to content already drawn in ctx at (0,0,w,h).
 * Hard edges → ctx.clip path; feather/invert → offscreen alpha mask + destination-in.
 */
export function applyMaskToContext(ctx: CanvasRenderingContext2D, c: MaskConfig, localTime: number, w: number, h: number, featherPx = c.maskFeather ?? 0) {
  if (!hasMask(c)) return;
  const mask = renderMaskCanvas(c, localTime, w, h, featherPx);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, w, h);
  ctx.restore();
}

/** Data-URL mask for CSS `mask-image` in the live preview — same pixels as the export path. */
export function maskDataUrl(c: MaskConfig, localTime: number, w: number, h: number): string | null {
  if (!hasMask(c) || w <= 0 || h <= 0) return null;
  return renderMaskCanvas(c, localTime, w, h, c.maskFeather ?? 0).toDataURL("image/png");
}
