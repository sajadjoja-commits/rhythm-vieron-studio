import React from "react";
import { VfxItem, interpolateKeyframes } from "@/context/MediaContext";

export interface VfxEngineState {
  transform: string;
  filter: string;
  overlayStyle: React.CSSProperties | null;
  imageStyle: React.CSSProperties | null;
  applyClipTransforms: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  getCSSFilterString: () => string;
  drawOverlays: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export function computeVfxState(
  vfxList: VfxItem[],
  currentTime: number,
  scaleFactorX: number = 1,
  scaleFactorY: number = 1
): VfxEngineState {
  const active = vfxList.filter((v) => currentTime >= v.start && currentTime <= v.end);

  if (!active.length) {
    return {
      transform: "",
      filter: "",
      overlayStyle: null,
      imageStyle: null,
      applyClipTransforms: () => {},
      getCSSFilterString: () => "",
      drawOverlays: () => {},
    };
  }

  const domTransforms: string[] = [];
  const domFilters: string[] = [];
  let overlayStyle: React.CSSProperties | null = null;
  let imageStyle: React.CSSProperties | null = null;

  type TransformFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  type OverlayFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

  const canvasTransforms: TransformFn[] = [];
  const canvasOverlays: OverlayFn[] = [];

  for (const v of active) {
    const localTime = currentTime - v.start;
    const duration = Math.max(0.05, v.end - v.start);
    const progress = Math.min(1, Math.max(0, localTime / duration));
    const i = interpolateKeyframes(v, "intensity", localTime, v.intensity ?? 1);

    switch (v.type) {
      case "shake": {
        const sx = Math.sin(currentTime * 50) * i * 6;
        const sy = Math.cos(currentTime * 40) * i * 4;
        domTransforms.push(`translate(${sx}px, ${sy}px)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(sx * scaleFactorX, sy * scaleFactorY);
        });
        break;
      }
      case "shake-v": {
        const sy = Math.sin(currentTime * 45) * i * 8;
        domTransforms.push(`translate(0, ${sy}px)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(0, sy * scaleFactorY);
        });
        break;
      }
      case "bounce": {
        const by = Math.abs(Math.sin(currentTime * 6)) * i * 20;
        domTransforms.push(`translateY(${by}px)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(0, by * scaleFactorY);
        });
        break;
      }
      case "swing": {
        const deg = Math.sin(currentTime * 3) * i * 12;
        domTransforms.push(`rotate(${deg}deg)`);
        canvasTransforms.push((ctx) => {
          ctx.rotate((deg * Math.PI) / 180);
        });
        break;
      }
      case "heartbeat": {
        const scale = 1 + Math.abs(Math.sin(currentTime * 5)) * i * 0.12;
        domTransforms.push(`scale(${scale})`);
        canvasTransforms.push((ctx) => {
          ctx.scale(scale, scale);
        });
        break;
      }
      case "zoom-pulse": {
        const scale = 1 + Math.sin(currentTime * 8) * i * 0.15;
        domTransforms.push(`scale(${scale})`);
        canvasTransforms.push((ctx) => {
          ctx.scale(scale, scale);
        });
        break;
      }
      case "rotate-3d": {
        const deg = Math.sin(currentTime * 3) * i * 20;
        domTransforms.push(`perspective(400px) rotateY(${deg}deg)`);
        canvasTransforms.push((ctx) => {
          const cos = Math.cos((deg * Math.PI) / 180);
          ctx.scale(Math.max(0.1, cos), 1);
        });
        break;
      }
      case "prism": {
        const hue = currentTime * 120;
        domFilters.push(`hue-rotate(${hue}deg)`);
        canvasOverlays.push((ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, "rgba(217, 70, 239, 0.12)");
          grad.addColorStop(0.5, "rgba(34, 211, 238, 0.12)");
          grad.addColorStop(1, "rgba(251, 146, 60, 0.12)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "chromatic": {
        overlayStyle = { backgroundColor: `rgba(255,0,0,${i * 0.15})` };
        const sx = Math.sin(currentTime * 20) * i * 3;
        domTransforms.push(`translateX(${sx}px)`);
        const hr = Math.sin(currentTime * 5) * i * 30;
        domFilters.push(`hue-rotate(${hr}deg)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(sx * scaleFactorX, 0);
        });
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(255, 0, 0, ${i * 0.15})`;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "flash": {
        const flashAlpha = Math.max(0, Math.sin(currentTime * 12) * i * 0.7);
        overlayStyle = { backgroundColor: `rgba(255,255,255,${flashAlpha})` };
        canvasOverlays.push((ctx, w, h) => {
          if (flashAlpha > 0.005) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, w, h);
          }
        });
        break;
      }
      case "light-leak": {
        const lx = 50 + Math.sin(currentTime * 2) * 20;
        const ly = 30 + Math.cos(currentTime * 3) * 15;
        overlayStyle = {
          background: `radial-gradient(circle at ${lx}% ${ly}%, rgba(249,115,22,${i * 0.45}) 0%, rgba(236,72,153,${i * 0.2}) 40%, transparent 75%)`,
        };
        canvasOverlays.push((ctx, w, h) => {
          const cx = (lx / 100) * w;
          const cy = (ly / 100) * h;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
          grad.addColorStop(0, `rgba(249, 115, 22, ${i * 0.45})`);
          grad.addColorStop(0.4, `rgba(236, 72, 153, ${i * 0.2})`);
          grad.addColorStop(0.75, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "glitch": {
        const gx = Math.random() * i * 8 - i * 4;
        const skew = Math.random() * i * 4 - i * 2;
        domTransforms.push(`translate(${gx}px, 0) skewX(${skew}deg)`);
        domFilters.push(`hue-rotate(${Math.random() * i * 180}deg) contrast(1.2)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(gx * scaleFactorX, 0);
          ctx.transform(1, 0, Math.tan((skew * Math.PI) / 180), 1, 0, 0);
        });
        canvasOverlays.push((ctx, w, h) => {
          if (Math.random() < 0.6) {
            const bh = Math.random() * (h * 0.04) + 6;
            const by = Math.random() * h;
            ctx.fillStyle = `rgba(236, 72, 153, ${0.25 * i})`;
            ctx.fillRect(Math.random() * 20 - 10, by, w, bh);
            ctx.fillStyle = `rgba(6, 182, 212, ${0.25 * i})`;
            ctx.fillRect(Math.random() * 20 - 10, by + 2, w, bh);
          }
        });
        break;
      }
      case "rgb-split": {
        const dropDist = i * 6 * Math.sin(currentTime * 15);
        domFilters.push(
          `drop-shadow(${dropDist}px 0px 0px rgba(255,0,0,0.7)) drop-shadow(${-dropDist}px 0px 0px rgba(0,255,255,0.7))`
        );
        break;
      }
      case "vhs": {
        overlayStyle = {
          background:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 255, 0, 0.06))",
          backgroundSize: "100% 4px, 6px 100%",
          pointerEvents: "none",
        };
        domFilters.push("contrast(1.1) brightness(1.05) saturate(1.25)");
        const vy = (Math.random() - 0.5) * i * 1.5;
        const vScale = 1 + i * 0.015;
        domTransforms.push(`translateY(${vy}px) scale(${vScale})`);
        canvasTransforms.push((ctx) => {
          ctx.translate(0, vy * scaleFactorY);
          ctx.scale(vScale, vScale);
        });
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * i})`;
          for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 2);
          }
          ctx.fillStyle = `rgba(0, 0, 0, ${0.28 * i})`;
          ctx.fillRect(0, h - 24 * scaleFactorY, w, 12 * scaleFactorY);
        });
        break;
      }
      case "scan-lines": {
        overlayStyle = {
          background: `repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,${0.18 * i}) 2px, rgba(0,0,0,0) 4px)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.18 * i})`;
          for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 2);
          }
        });
        break;
      }
      case "pixelate": {
        domFilters.push("contrast(1.2) saturate(1.35) brightness(1.05)");
        imageStyle = { imageRendering: "pixelated" };
        break;
      }
      case "film-grain": {
        overlayStyle = {
          background: "radial-gradient(circle, transparent 50%, rgba(0,0,0,0.1) 100%)",
          opacity: 0.5,
          pointerEvents: "none",
        };
        domFilters.push(`contrast(${1 + i * 0.15 + Math.sin(currentTime * 30) * 0.05 * i})`);
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.06 * i})`;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "particles": {
        overlayStyle = {
          background: "radial-gradient(circle at center, transparent 30%, rgba(251,191,36,0.15) 100%)",
          pointerEvents: "none",
        };
        domFilters.push(`saturate(${1 + i * 0.3})`);
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(245, 158, 11, ${0.65 * i})`;
          for (let pIdx = 0; pIdx < 20; pIdx++) {
            const px = ((pIdx * 137.5 + currentTime * 50) % w);
            const py = ((pIdx * 211.3 - currentTime * 80 + h * 2) % h);
            const pr = ((pIdx % 3) + 2) * scaleFactorX;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        break;
      }
      case "water-ripple": {
        const wx = Math.sin(currentTime * 6) * i * 8;
        const wy = Math.cos(currentTime * 8) * i * 5;
        const wskew = Math.sin(currentTime * 4) * i * 3;
        domTransforms.push(`translate(${wx}px, ${wy}px) skewX(${wskew}deg)`);
        overlayStyle = {
          background: `radial-gradient(circle at ${50 + Math.sin(currentTime * 3) * 20}% ${50 + Math.cos(currentTime * 4) * 20}%, rgba(6, 182, 212, ${i * 0.25}) 0%, transparent 70%), repeating-radial-gradient(circle at center, rgba(6,182,212,0.1) 0px, transparent 15px, rgba(255,255,255,0.05) 30px)`,
          pointerEvents: "none",
        };
        domFilters.push(`hue-rotate(${Math.sin(currentTime * 2) * i * 15}deg) saturate(${1 + i * 0.2})`);
        canvasTransforms.push((ctx) => {
          ctx.translate(wx * scaleFactorX, wy * scaleFactorY);
        });
        break;
      }
      case "vintage-8mm": {
        domFilters.push(
          `sepia(${0.6 * i}) contrast(${1 + 0.25 * i}) brightness(${0.92 + Math.sin(currentTime * 25) * 0.04 * i})`
        );
        const vy = Math.sin(currentTime * 35) * i * 2;
        domTransforms.push(`translateY(${vy}px)`);
        overlayStyle = {
          background: `radial-gradient(circle, transparent 40%, rgba(30,15,5,${0.6 * i}) 100%), linear-gradient(rgba(0,0,0,${0.1 * i}) 50%, transparent 50%)`,
          pointerEvents: "none",
        };
        canvasTransforms.push((ctx) => {
          ctx.translate(0, vy * scaleFactorY);
        });
        canvasOverlays.push((ctx, w, h) => {
          const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `rgba(30, 15, 5, ${0.6 * i})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "old-vhs-tape": {
        domFilters.push(
          `contrast(${1.15 + i * 0.1}) saturate(${1.3 + i * 0.2}) drop-shadow(2px 0 0 rgba(255,0,0,0.5)) drop-shadow(-2px 0 0 rgba(0,255,255,0.5))`
        );
        const ox = (Math.random() - 0.5) * i * 3;
        const oy = (Math.random() - 0.5) * i * 2;
        domTransforms.push(`translate(${ox}px, ${oy}px)`);
        const scanPos = (currentTime * 30) % 100;
        overlayStyle = {
          background: `repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,${0.2 * i}) 2px, rgba(0,0,0,0) 4px), linear-gradient(to bottom, transparent ${scanPos}%, rgba(192,38,211,0.2) ${scanPos + 2}%, transparent ${scanPos + 4}%)`,
          pointerEvents: "none",
        };
        canvasTransforms.push((ctx) => {
          ctx.translate(ox * scaleFactorX, oy * scaleFactorY);
        });
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.16 * i})`;
          for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 2);
          }
          const barY = (scanPos / 100) * h;
          ctx.fillStyle = `rgba(192, 38, 211, ${0.25 * i})`;
          ctx.fillRect(0, barY, w, 6 * scaleFactorY);
        });
        break;
      }
      case "retro-sepia-grain": {
        domFilters.push(`sepia(${0.85 * i}) contrast(${1.1 + i * 0.2}) brightness(${0.9 + i * 0.05})`);
        overlayStyle = {
          background: `radial-gradient(circle, transparent 50%, rgba(40, 20, 0, ${0.4 * i}) 100%)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.7);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `rgba(40, 20, 0, ${0.45 * i})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "crt-tv-retro": {
        domFilters.push(`contrast(${1.2 + i * 0.1}) brightness(1.05) saturate(1.2)`);
        overlayStyle = {
          background: `repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,${0.25 * i}) 3px, rgba(0,0,0,0) 6px), radial-gradient(circle at center, transparent 60%, rgba(0,0,0,${0.7 * i}) 100%)`,
          pointerEvents: "none",
        };
        const cScale = 1 - i * 0.02;
        domTransforms.push(`perspective(500px) scale(${cScale})`);
        canvasTransforms.push((ctx) => {
          ctx.scale(cScale, cScale);
        });
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.2 * i})`;
          for (let y = 0; y < h; y += 6) {
            ctx.fillRect(0, y, w, 3);
          }
          const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.45, w / 2, h / 2, w * 0.75);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `rgba(0, 0, 0, ${0.7 * i})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }

      // ================= 🎬 INTRO & OPENERS =================
      case "cinematic-opener": {
        const barHeightPercent = Math.max(0, (1 - progress) * 50 * i);
        overlayStyle = {
          background: `linear-gradient(to bottom, #000 0%, #000 ${barHeightPercent}%, transparent ${barHeightPercent}%, transparent ${100 - barHeightPercent}%, #000 ${100 - barHeightPercent}%, #000 100%), radial-gradient(circle at center, rgba(255,255,255,${(1 - progress) * 0.3 * i}) 0%, transparent 70%)`,
          pointerEvents: "none",
        };
        domFilters.push(
          `brightness(${1 + (1 - progress) * 0.4 * i}) contrast(${1 + (1 - progress) * 0.2 * i})`
        );
        canvasOverlays.push((ctx, w, h) => {
          const barH = (barHeightPercent / 100) * h;
          if (barH > 0) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, w, barH);
            ctx.fillRect(0, h - barH, w, barH);
          }
          if (progress < 0.95) {
            const bloom = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
            bloom.addColorStop(0, `rgba(255, 255, 255, ${(1 - progress) * 0.3 * i})`);
            bloom.addColorStop(1, "transparent");
            ctx.fillStyle = bloom;
            ctx.fillRect(0, 0, w, h);
          }
        });
        break;
      }
      case "spotlight-reveal": {
        const rad = 20 + progress * 70;
        overlayStyle = {
          background: `radial-gradient(circle at center, transparent ${rad * 0.7}%, rgba(0,0,0,${0.9 * i * (1 - progress * 0.5)}) ${rad}%)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          const rInner = (rad * 0.7 * Math.max(w, h)) / 100;
          const rOuter = (rad * Math.max(w, h)) / 100;
          const grad = ctx.createRadialGradient(w / 2, h / 2, rInner, w / 2, h / 2, rOuter);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `rgba(0, 0, 0, ${0.9 * i * (1 - progress * 0.5)})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "epic-zoom-in": {
        const zoom = 1 + (1 - progress) * 0.45 * i;
        domTransforms.push(`scale(${zoom})`);
        domFilters.push(`contrast(${1 + (1 - progress) * 0.2 * i})`);
        canvasTransforms.push((ctx) => {
          ctx.scale(zoom, zoom);
        });
        break;
      }
      case "neon-glow-entry": {
        const flash = Math.max(0, (1 - progress) * i);
        overlayStyle = {
          background: `radial-gradient(circle at center, rgba(236,72,153,${flash * 0.45}) 0%, rgba(59,130,246,${flash * 0.2}) 50%, transparent 80%)`,
          boxShadow: `inset 0 0 ${40 * flash}px rgba(236,72,153,0.8)`,
          pointerEvents: "none",
        };
        domFilters.push(`saturate(${1 + flash * 0.8}) contrast(${1 + flash * 0.3})`);
        canvasOverlays.push((ctx, w, h) => {
          if (flash > 0.01) {
            const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
            grad.addColorStop(0, `rgba(236, 72, 153, ${flash * 0.45})`);
            grad.addColorStop(0.5, `rgba(59, 130, 246, ${flash * 0.2})`);
            grad.addColorStop(0.8, "transparent");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
          }
        });
        break;
      }
      case "film-countdown": {
        const sweep = (currentTime * 360) % 360;
        overlayStyle = {
          background: `conic-gradient(from ${sweep}deg at 50% 50%, rgba(255,255,255,${0.2 * i}) 0deg, transparent 60deg, transparent 360deg), radial-gradient(circle, transparent 40%, rgba(0,0,0,${0.6 * i}) 80%)`,
          pointerEvents: "none",
        };
        domFilters.push(`sepia(${0.5 * i}) contrast(${1 + 0.3 * i})`);
        const ox = (Math.random() - 0.5) * 2 * i;
        const oy = (Math.random() - 0.5) * 2 * i;
        domTransforms.push(`translate(${ox}px, ${oy}px)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(ox * scaleFactorX, oy * scaleFactorY);
        });
        canvasOverlays.push((ctx, w, h) => {
          const num = 3 - Math.floor(progress * 3);
          ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * i})`;
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * i})`;
          ctx.lineWidth = 4 * scaleFactorX;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, h * 0.15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(h * 0.1)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(num > 0 ? String(num) : "1", w / 2, h / 2);
        });
        break;
      }
      case "tv-power-on": {
        const hScale = Math.min(1, progress * 2.5);
        const vScale = progress < 0.3 ? 0.03 : Math.min(1, (progress - 0.3) / 0.7);
        domTransforms.push(`scale(${hScale}, ${Math.max(0.01, vScale)})`);
        if (progress < 0.4) {
          domFilters.push(`brightness(${2.5 * i}) contrast(2)`);
        }
        canvasTransforms.push((ctx) => {
          ctx.scale(hScale, Math.max(0.01, vScale));
        });
        break;
      }
      case "curtain-rise": {
        const rise = progress * 100;
        overlayStyle = {
          background: `linear-gradient(to top, transparent ${rise}%, rgba(136,19,55,${0.9 * i}) ${rise}%, rgba(88,28,135,${0.95 * i}) 100%)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          const currentRise = (rise / 100) * h;
          if (currentRise < h) {
            ctx.fillStyle = `rgba(136, 19, 55, ${0.95 * i})`;
            ctx.fillRect(0, 0, w, h - currentRise);
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 3 * scaleFactorX;
            ctx.beginPath();
            ctx.moveTo(0, h - currentRise);
            ctx.lineTo(w, h - currentRise);
            ctx.stroke();
          }
        });
        break;
      }

      // ================= 🌧️ WEATHER & NATURE =================
      case "rain-storm": {
        const yOff = (currentTime * 400) % 100;
        overlayStyle = {
          background: `repeating-linear-gradient(105deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 12px, rgba(186,230,253,${0.25 * i}) 13px, rgba(186,230,253,${0.35 * i}) 14px, rgba(255,255,255,0) 16px), radial-gradient(circle at bottom, rgba(14,165,233,${0.2 * i}) 0%, transparent 60%)`,
          backgroundPosition: `0px ${yOff}px`,
          pointerEvents: "none",
        };
        domFilters.push(`contrast(${1.05 + i * 0.1}) saturate(${0.9 + i * 0.1})`);
        canvasOverlays.push((ctx, w, h) => {
          ctx.strokeStyle = `rgba(186, 230, 253, ${0.4 * i})`;
          ctx.lineWidth = 1.5 * scaleFactorX;
          for (let ri = 0; ri < 35; ri++) {
            const rx = ((ri * 47 + currentTime * 300) % w);
            const ry = ((ri * 61 + currentTime * 700) % h);
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx - 8 * scaleFactorX, ry + 22 * scaleFactorY);
            ctx.stroke();
          }
        });
        break;
      }
      case "snow-blizzard": {
        const sOff = (currentTime * 80) % 100;
        overlayStyle = {
          background: `radial-gradient(circle at 20% 30%, rgba(255,255,255,${0.6 * i}) 2px, transparent 4px), radial-gradient(circle at 60% 70%, rgba(255,255,255,${0.7 * i}) 3px, transparent 5px), radial-gradient(circle at 80% 20%, rgba(255,255,255,${0.5 * i}) 2.5px, transparent 4.5px), radial-gradient(circle at 40% 80%, rgba(255,255,255,${0.6 * i}) 2px, transparent 4px), radial-gradient(circle at center, transparent 50%, rgba(186,230,253,${0.2 * i}) 100%)`,
          backgroundPosition: `${Math.sin(currentTime * 2) * 20}px ${sOff}px`,
          pointerEvents: "none",
        };
        domFilters.push(`brightness(${1 + i * 0.08})`);
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * i})`;
          for (let si = 0; si < 40; si++) {
            const sx = ((si * 37 + Math.sin(currentTime * 3 + si) * 20 + currentTime * 50) % w);
            const sy = ((si * 43 + currentTime * 100) % h);
            const sr = ((si % 4) + 1.5) * scaleFactorX;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        break;
      }
      case "fire-embers": {
        const fOff = (currentTime * 100) % 100;
        overlayStyle = {
          background: `radial-gradient(circle at 30% 60%, rgba(249,115,22,${0.7 * i}) 2px, transparent 5px), radial-gradient(circle at 70% 40%, rgba(251,191,36,${0.8 * i}) 3px, transparent 6px), radial-gradient(circle at 50% 80%, rgba(239,68,68,${0.7 * i}) 2px, transparent 4px), linear-gradient(to top, rgba(249,115,22,${0.35 * i}) 0%, transparent 60%)`,
          backgroundPosition: `${Math.sin(currentTime * 3) * 15}px -${fOff}px`,
          pointerEvents: "none",
        };
        domFilters.push(`sepia(${0.25 * i}) saturate(${1 + 0.35 * i})`);
        canvasOverlays.push((ctx, w, h) => {
          for (let fi = 0; fi < 30; fi++) {
            const fx = ((fi * 41 + Math.sin(currentTime * 4 + fi) * 25) % w);
            const fy = h - ((fi * 37 + currentTime * 150) % h);
            const fr = ((fi % 3) + 2) * scaleFactorX;
            ctx.fillStyle = fi % 2 === 0 ? `rgba(249, 115, 22, ${0.85 * i})` : `rgba(251, 191, 36, ${0.9 * i})`;
            ctx.beginPath();
            ctx.arc(fx, fy, fr, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        break;
      }
      case "fog-smoke": {
        const fogX = Math.sin(currentTime * 1.5) * 30;
        overlayStyle = {
          background: `radial-gradient(circle at ${50 + fogX}% 60%, rgba(226,232,240,${0.45 * i}) 0%, rgba(148,163,184,${0.25 * i}) 40%, transparent 75%)`,
          pointerEvents: "none",
        };
        domFilters.push(`contrast(${1 - 0.15 * i}) brightness(${1 + 0.05 * i})`);
        canvasOverlays.push((ctx, w, h) => {
          const cx = ((50 + fogX) / 100) * w;
          const cy = 0.6 * h;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
          grad.addColorStop(0, `rgba(226, 232, 240, ${0.45 * i})`);
          grad.addColorStop(0.4, `rgba(148, 163, 184, ${0.25 * i})`);
          grad.addColorStop(0.75, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "thunder-lightning": {
        const flash = Math.sin(currentTime * 16) > 0.65 ? 0.7 * i : 0;
        overlayStyle = {
          backgroundColor: `rgba(255,255,255,${flash})`,
          pointerEvents: "none",
        };
        if (flash > 0) {
          domFilters.push("brightness(1.5) contrast(1.4)");
        }
        canvasOverlays.push((ctx, w, h) => {
          if (flash > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "#fef08a";
            ctx.lineWidth = 4 * scaleFactorX;
            ctx.beginPath();
            ctx.moveTo(w * 0.5, 0);
            ctx.lineTo(w * 0.46, h * 0.35);
            ctx.lineTo(w * 0.54, h * 0.4);
            ctx.lineTo(w * 0.48, h);
            ctx.stroke();
          }
        });
        break;
      }
      case "sparkles-stars": {
        const sparkle = Math.abs(Math.sin(currentTime * 8));
        overlayStyle = {
          background: `radial-gradient(circle at 25% 25%, rgba(251,191,36,${sparkle * i * 0.8}) 2px, transparent 8px), radial-gradient(circle at 75% 35%, rgba(255,255,255,${(1 - sparkle) * i * 0.9}) 3px, transparent 10px), radial-gradient(circle at 50% 70%, rgba(251,191,36,${sparkle * i * 0.7}) 2.5px, transparent 9px)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          for (let spi = 0; spi < 15; spi++) {
            const spx = ((spi * 71 + currentTime * 30) % w);
            const spy = ((spi * 59 + currentTime * 20) % h);
            const sps = (Math.abs(Math.sin(currentTime * 6 + spi)) * 8 * i + 2) * scaleFactorX;
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 2 * scaleFactorX;
            ctx.beginPath();
            ctx.moveTo(spx - sps, spy);
            ctx.lineTo(spx + sps, spy);
            ctx.moveTo(spx, spy - sps);
            ctx.lineTo(spx, spy + sps);
            ctx.stroke();
          }
        });
        break;
      }
      case "bubbles-floating": {
        const bOff = (currentTime * 60) % 100;
        overlayStyle = {
          background: `radial-gradient(circle at 20% 70%, rgba(56,189,248,${0.4 * i}) 4px, transparent 10px), radial-gradient(circle at 80% 50%, rgba(168,85,247,${0.35 * i}) 6px, transparent 12px), radial-gradient(circle at 45% 30%, rgba(34,211,238,${0.4 * i}) 5px, transparent 11px)`,
          backgroundPosition: `0px -${bOff}px`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          for (let bi = 0; bi < 20; bi++) {
            const bx = ((bi * 47 + Math.sin(currentTime * 2 + bi) * 20) % w);
            const by = h - ((bi * 37 + currentTime * 90) % h);
            const br = ((bi % 4) + 6) * scaleFactorX;
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.75 * i})`;
            ctx.lineWidth = 2 * scaleFactorX;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        break;
      }

      // ================= 🪩 DANCE & PARTY =================
      case "disco-strobe": {
        const strobe = Math.sin(currentTime * 20);
        const hue = (currentTime * 280) % 360;
        overlayStyle = {
          background: `radial-gradient(circle at ${50 + Math.sin(currentTime * 6) * 30}% ${50 + Math.cos(currentTime * 5) * 30}%, hsla(${hue}, 100%, 60%, ${Math.max(0, strobe) * 0.45 * i}) 0%, transparent 70%)`,
          pointerEvents: "none",
        };
        const dScale = 1 + Math.abs(strobe) * 0.05 * i;
        domTransforms.push(`scale(${dScale})`);
        domFilters.push(`contrast(${1 + 0.3 * i}) saturate(${1 + 0.5 * i})`);
        canvasTransforms.push((ctx) => {
          ctx.scale(dScale, dScale);
        });
        canvasOverlays.push((ctx, w, h) => {
          const dColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#d946ef", "#06b6d4"];
          const dcIdx = Math.floor((currentTime * 10) % dColors.length);
          ctx.fillStyle = dColors[dcIdx];
          ctx.globalAlpha = 0.25 * i;
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        });
        break;
      }
      case "bass-shake-pulse": {
        const beat = Math.abs(Math.sin(currentTime * 10));
        const bx = Math.sin(currentTime * 60) * 4 * beat * i;
        const by = Math.cos(currentTime * 50) * 3 * beat * i;
        const bScale = 1 + beat * 0.08 * i;
        domTransforms.push(`scale(${bScale}) translate(${bx}px, ${by}px)`);
        overlayStyle = {
          boxShadow: `inset 0 0 ${30 * beat * i}px rgba(239,68,68,${0.6 * i})`,
          pointerEvents: "none",
        };
        domFilters.push(`contrast(${1 + beat * 0.2 * i})`);
        canvasTransforms.push((ctx) => {
          ctx.scale(bScale, bScale);
          ctx.translate(bx * scaleFactorX, by * scaleFactorY);
        });
        canvasOverlays.push((ctx, w, h) => {
          const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.4, w / 2, h / 2, w * 0.75);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `rgba(239, 68, 68, ${0.45 * beat * i})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "neon-equalizer": {
        overlayStyle = {
          background: `linear-gradient(to top, rgba(6,182,212,${0.35 * i}) 0%, rgba(236,72,153,${0.2 * i}) 25%, transparent 60%)`,
          boxShadow: `inset 0 -${20 * i}px 25px rgba(6,182,212,0.5)`,
          pointerEvents: "none",
        };
        domFilters.push(`saturate(${1 + 0.4 * i}) brightness(${1 + 0.1 * i})`);
        canvasOverlays.push((ctx, w, h) => {
          const numBars = 16;
          const barW = (w / numBars) * 0.7;
          const gap = (w / numBars) * 0.3;
          ctx.fillStyle = `rgba(6, 182, 212, ${0.6 * i})`;
          for (let bi = 0; bi < numBars; bi++) {
            const barH = (Math.abs(Math.sin(currentTime * 8 + bi * 0.5)) * 0.25 * h + 10) * i;
            const bx = bi * (barW + gap) + gap / 2;
            ctx.fillRect(bx, h - barH, barW, barH);
          }
        });
        break;
      }
      case "rgb-rave": {
        const rHue = (currentTime * 360) % 360;
        domFilters.push(`hue-rotate(${rHue}deg) saturate(${1.3 + i * 0.4}) contrast(${1.15 + i * 0.2})`);
        const rx = Math.sin(currentTime * 25) * 4 * i;
        domTransforms.push(`translate(${rx}px, 0)`);
        canvasTransforms.push((ctx) => {
          ctx.translate(rx * scaleFactorX, 0);
        });
        break;
      }
      case "laser-beams": {
        overlayStyle = {
          background: `repeating-linear-gradient(${currentTime * 45}deg, transparent 0px, transparent 40px, rgba(34,197,94,${0.45 * i}) 41px, transparent 44px, transparent 80px, rgba(236,72,153,${0.4 * i}) 81px, transparent 84px)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          const lColors = ["#22c55e", "#ef4444", "#06b6d4", "#ec4899"];
          ctx.lineWidth = 3 * scaleFactorX;
          for (let li = 0; li < 4; li++) {
            ctx.strokeStyle = lColors[li];
            ctx.globalAlpha = 0.5 * i;
            ctx.beginPath();
            ctx.moveTo(0, (li * h) / 4);
            ctx.lineTo(w, h - (li * h) / 4 + Math.sin(currentTime * 4 + li) * 40 * scaleFactorY);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        break;
      }
      case "kaleidoscope-dance": {
        const kRot = Math.sin(currentTime * 4) * 6 * i;
        const kScale = 1 + Math.sin(currentTime * 6) * 0.06 * i;
        domTransforms.push(`rotate(${kRot}deg) scale(${kScale})`);
        overlayStyle = {
          background: `radial-gradient(circle at center, transparent 30%, rgba(236,72,153,${0.2 * i}) 60%, rgba(139,92,246,${0.25 * i}) 100%)`,
          pointerEvents: "none",
        };
        domFilters.push(`hue-rotate(${currentTime * 60}deg)`);
        canvasTransforms.push((ctx) => {
          ctx.rotate((kRot * Math.PI) / 180);
          ctx.scale(kScale, kScale);
        });
        break;
      }
      case "crt-scanner": {
        const scanY = (currentTime * 60) % 100;
        overlayStyle = {
          background: `linear-gradient(to bottom, transparent ${scanY}%, rgba(0,255,204,${0.35 * i}) ${scanY + 2}%, transparent ${scanY + 4}%), repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,${0.2 * i}) 2px, rgba(0,0,0,0) 4px)`,
          pointerEvents: "none",
        };
        domFilters.push("contrast(1.15) brightness(1.05)");
        canvasOverlays.push((ctx, w, h) => {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * i})`;
          for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 2);
          }
          const sy = (scanY / 100) * h;
          ctx.fillStyle = `rgba(0, 255, 204, ${0.4 * i})`;
          ctx.fillRect(0, sy, w, 4 * scaleFactorY);
        });
        break;
      }
      case "radial-lens-flare": {
        const flareX = 50 + Math.sin(currentTime * 2) * 30;
        overlayStyle = {
          background: `radial-gradient(circle at ${flareX}% 35%, rgba(255,255,255,${0.7 * i}) 0%, rgba(255,170,0,${0.4 * i}) 25%, rgba(255,0,170,${0.2 * i}) 50%, transparent 75%)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          const cx = (flareX / 100) * w;
          const cy = 0.35 * h;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
          grad.addColorStop(0, `rgba(255, 255, 255, ${0.7 * i})`);
          grad.addColorStop(0.25, `rgba(255, 170, 0, ${0.4 * i})`);
          grad.addColorStop(0.5, `rgba(255, 0, 170, ${0.2 * i})`);
          grad.addColorStop(0.75, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case "motion-blur-streak": {
        const mScale = 1 + Math.sin(currentTime * 8) * 0.08 * i;
        domTransforms.push(`scale(${mScale})`);
        domFilters.push(`blur(${Math.abs(Math.sin(currentTime * 8)) * 3 * i}px) contrast(1.1)`);
        canvasTransforms.push((ctx) => {
          ctx.scale(mScale, mScale);
        });
        break;
      }
      case "vintage-sepia-bloom": {
        domFilters.push(`sepia(${0.6 * i}) contrast(${1 + 0.15 * i}) brightness(${1.05 + 0.1 * i})`);
        overlayStyle = {
          background: `radial-gradient(circle at center, rgba(245,158,11,${0.25 * i}) 0%, transparent 80%)`,
          pointerEvents: "none",
        };
        canvasOverlays.push((ctx, w, h) => {
          const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.8);
          grad.addColorStop(0, `rgba(245, 158, 11, ${0.25 * i})`);
          grad.addColorStop(0.8, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      default:
        break;
    }
  }

  return {
    transform: domTransforms.join(" "),
    filter: domFilters.join(" "),
    overlayStyle,
    imageStyle,
    applyClipTransforms: (ctx: CanvasRenderingContext2D) => {
      for (const fn of canvasTransforms) {
        fn(ctx, 0, 0);
      }
    },
    getCSSFilterString: () => domFilters.join(" "),
    drawOverlays: (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.save();
      for (const fn of canvasOverlays) {
        fn(ctx, width, height);
      }
      ctx.restore();
    },
  };
}
