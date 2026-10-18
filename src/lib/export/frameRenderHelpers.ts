import type { FilterItem } from "@/context/MediaContext";

/**
 * Computes optimal video seek tolerance in seconds based on export FPS and optional source FPS.
 * Half a frame duration (0.5 / effectiveFps) prevents skipping frames at 30fps/60fps
 * while avoiding redundant seeks when rendering a 30fps source into a 60fps export.
 */
export function computeSeekTolerance(exportFps: number, sourceFps?: number): number {
  const effectiveFps =
    sourceFps && Number.isFinite(sourceFps) && sourceFps > 0
      ? Math.min(exportFps > 0 ? exportFps : 30, sourceFps)
      : exportFps > 0 && Number.isFinite(exportFps)
      ? exportFps
      : 30;
  return 0.5 / Math.max(1, effectiveFps);
}

/**
 * Computes aspect-contain draw dimensions inside a target canvas.
 */
export function getContainSize(
  mediaW: number,
  mediaH: number,
  canvasW: number,
  canvasH: number
): { drawW: number; drawH: number } {
  const safeMediaW = mediaW > 0 ? mediaW : canvasW;
  const safeMediaH = mediaH > 0 ? mediaH : canvasH;
  const mediaRatio = safeMediaW / safeMediaH;
  const canvasRatio = canvasW / canvasH;
  let drawW = canvasW;
  let drawH = canvasH;
  if (mediaRatio > canvasRatio) {
    drawH = canvasW / mediaRatio;
  } else {
    drawW = canvasH * mediaRatio;
  }
  return { drawW, drawH };
}

/**
 * Computes active CSS filter string at a given timeline timestamp.
 */
export function getFilterCSSString(filters: readonly FilterItem[], time: number): string {
  if (!filters || filters.length === 0) return "";
  const parts: string[] = [];
  for (let idx = 0; idx < filters.length; idx++) {
    const f = filters[idx];
    if (time < f.start || time > f.end) continue;
    const i = f.intensity;
    switch (f.type) {
      case "brightness": parts.push(`brightness(${0.5 + i * 1.5})`); break;
      case "contrast": parts.push(`contrast(${0.5 + i * 1.5})`); break;
      case "saturate": parts.push(`saturate(${i * 3})`); break;
      case "grayscale": parts.push(`grayscale(${i})`); break;
      case "sepia": parts.push(`sepia(${i})`); break;
      case "blur": parts.push(`blur(${i * 8}px)`); break;
      case "hue-rotate": parts.push(`hue-rotate(${i * 360}deg)`); break;
      case "invert": parts.push(`invert(${i})`); break;
      case "vintage": parts.push(`sepia(${i * 0.6}) contrast(${0.8 + i * 0.4}) brightness(${0.9 + i * 0.2})`); break;
      case "warm": parts.push(`sepia(${i * 0.3}) saturate(${1 + i * 0.5}) brightness(${1 + i * 0.1})`); break;
      case "cool": parts.push(`hue-rotate(${i * 30}deg) saturate(${1 + i * 0.3})`); break;
      case "dramatic": parts.push(`contrast(${1 + i * 0.8}) brightness(${1 - i * 0.2}) saturate(${1 + i * 0.5})`); break;
      case "noir": parts.push(`grayscale(${i * 0.9 + 0.1}) contrast(${1 + i * 0.6}) brightness(${1 - i * 0.15})`); break;
      case "fade-edge": parts.push(`blur(${i * 0.5}px) brightness(${1 + i * 0.15}) saturate(${1 - i * 0.2})`); break;
      case "duotone": parts.push(`grayscale(${i * 0.8}) sepia(${i * 0.5}) hue-rotate(${i * 180}deg) contrast(${1 + i * 0.3})`); break;
      case "dream": parts.push(`blur(${i * 0.4}px) brightness(${1 + i * 0.15}) saturate(${1 + i * 0.3}) contrast(${1 - i * 0.1})`); break;
      case "neon": parts.push(`saturate(${1 + i * 0.8}) contrast(${1 + i * 0.4}) hue-rotate(${i * 60}deg) brightness(${1 + i * 0.1})`); break;
      case "sepia-blue": parts.push(`sepia(${i * 0.5}) hue-rotate(${i * 180}deg) saturate(${1 + i * 0.3})`); break;
      case "cyberpunk-teal-orange": parts.push(`contrast(${1 + i * 0.25}) saturate(${1 + i * 0.35}) hue-rotate(${-12 * i}deg) sepia(${i * 0.22})`); break;
      case "emerald-forest": parts.push(`hue-rotate(${25 * i}deg) saturate(${1 + i * 0.4}) contrast(${1 + i * 0.15}) brightness(${1 - i * 0.04})`); break;
      case "golden-hour": parts.push(`sepia(${i * 0.42}) saturate(${1 + i * 0.45}) contrast(${1 + i * 0.1}) brightness(${1 + i * 0.08})`); break;
      case "vaporwave-pastel": parts.push(`hue-rotate(${300 * i}deg) saturate(${1 + i * 0.35}) contrast(${1 + i * 0.08}) brightness(${1 + i * 0.06})`); break;
      case "polaroid-matte": parts.push(`contrast(${1 - i * 0.1}) brightness(${1 + i * 0.12}) sepia(${i * 0.2}) saturate(${1 - i * 0.15})`); break;
      case "monochrome-red": parts.push(`grayscale(${i * 0.75}) sepia(${i * 0.35}) hue-rotate(${320 * i}deg) contrast(${1 + i * 0.4}) brightness(${1 - i * 0.05})`); break;
      case "cinematic-2383": parts.push(`contrast(${1 + i * 0.3}) saturate(${1 + i * 0.18}) sepia(${i * 0.18}) brightness(${1 - i * 0.04})`); break;
      case "fuji-velvia": parts.push(`saturate(${1 + i * 0.6}) contrast(${1 + i * 0.18}) hue-rotate(${-6 * i}deg) brightness(${1 + i * 0.03})`); break;
      case "bleach-bypass": parts.push(`grayscale(${i * 0.55}) contrast(${1 + i * 0.45}) brightness(${1 - i * 0.06}) saturate(${1 - i * 0.35})`); break;
      case "sunset-miami": parts.push(`sepia(${i * 0.3}) saturate(${1 + i * 0.55}) hue-rotate(${315 * i}deg) contrast(${1 + i * 0.12}) brightness(${1 + i * 0.04})`); break;
      case "matrix-cyber-green": parts.push(`sepia(${i * 0.45}) hue-rotate(${75 * i}deg) saturate(${1 + i * 0.5}) contrast(${1 + i * 0.25}) brightness(${1 - i * 0.05})`); break;
      case "soft-peach-skin": parts.push(`brightness(${1 + i * 0.08}) contrast(${1 - i * 0.05}) saturate(${1 + i * 0.22}) sepia(${i * 0.15}) hue-rotate(${-8 * i}deg)`); break;
    }
    if (f.brightness !== undefined && f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
    if (f.contrast !== undefined && f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
    if (f.saturation !== undefined && f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
    if (f.blur !== undefined && f.blur > 0) parts.push(`blur(${f.blur}px)`);
    if (f.hueRotate !== undefined && f.hueRotate !== 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
    if (f.sharpness !== undefined && f.sharpness !== 0) {
      const cVal = 1 + f.sharpness * 0.15;
      const bVal = 1 + f.sharpness * 0.05;
      const sVal = 1 + f.sharpness * 0.05;
      parts.push(`contrast(${cVal}) brightness(${bVal}) saturate(${sVal})`);
    }
    if (f.hslHue !== undefined && f.hslHue !== 0) {
      parts.push(`hue-rotate(${f.hslHue}deg)`);
    }
    if (f.hslSaturation !== undefined && f.hslSaturation !== 0) {
      parts.push(`saturate(${1 + f.hslSaturation / 100})`);
    }
    if (f.hslLightness !== undefined && f.hslLightness !== 0) {
      parts.push(`brightness(${1 + f.hslLightness / 200})`);
    }
  }
  return parts.join(" ");
}
