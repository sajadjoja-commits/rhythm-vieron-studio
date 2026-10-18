import type { TransitionMetadata } from "@/data/transitionsData";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useMedia, TransitionType } from "@/context/MediaContext";
import { 
  X, Check, Wand2, 
  Search, Compass, Layers, Clock, CheckCheck, Sliders
} from "lucide-react";
import { toast } from "sonner";
import { t, getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { 
  TRANSITIONS_DATA, 
  TRANSITION_CATEGORIES, 
  TransitionCategory 
} from "@/data/transitionsData";
import { renderGSAPTransitionFrame } from "@/lib/gsapTransitions";
import DraggableLibrarySheet from "./DraggableLibrarySheet";

interface Props { 
  open: boolean; 
  clipId: string | null; 
  onClose: () => void; 
}

const W = 200, H = 112;

// Shared preloaded image cache for smooth 60fps canvas transition demos
let cachedImgA: HTMLImageElement | null = null;
let cachedImgB: HTMLImageElement | null = null;

function getSampleImages() {
  if (!cachedImgA && typeof window !== "undefined") {
    cachedImgA = new Image();
    cachedImgA.crossOrigin = "anonymous";
    // Breathtaking Nature & Mountains landscape
    cachedImgA.src = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=320&q=75";
  }
  if (!cachedImgB && typeof window !== "undefined") {
    cachedImgB = new Image();
    cachedImgB.crossOrigin = "anonymous";
    // Cinematic Portrait Character
    cachedImgB.src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=320&q=75";
  }
  return {
    imgA: cachedImgA && cachedImgA.complete && cachedImgA.naturalWidth > 0 ? cachedImgA : null,
    imgB: cachedImgB && cachedImgB.complete && cachedImgB.naturalWidth > 0 ? cachedImgB : null,
  };
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, grad: CanvasGradient, w: number, h: number) {
  if (img) {
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch {
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  } else {
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function renderFrame(
  ctx: CanvasRenderingContext2D, 
  type: TransitionType, 
  p: number, 
  w: number = W, 
  h: number = H,
  customImgA?: HTMLImageElement | null,
  customImgB?: HTMLImageElement | null
) {
  ctx.clearRect(0, 0, w, h);
  
  const gradA = ctx.createLinearGradient(0, 0, w, h);
  gradA.addColorStop(0, "#0f172a"); 
  gradA.addColorStop(0.5, "#1e3a8a"); 
  gradA.addColorStop(1, "#0284c7");

  const gradB = ctx.createLinearGradient(0, 0, w, h);
  gradB.addColorStop(0, "#4a044e"); 
  gradB.addColorStop(0.5, "#c026d3"); 
  gradB.addColorStop(1, "#f43f5e");

  const { imgA: defA, imgB: defB } = getSampleImages();
  const imgA = customImgA !== undefined ? customImgA : defA;
  const imgB = customImgB !== undefined ? customImgB : defB;

  if (renderGSAPTransitionFrame(ctx, type, p, w, h, gradA, gradB)) {
    return;
  }

  switch (type) {
    case "none":
      if (p < 0.5) drawCover(ctx, imgA, gradA, w, h);
      else drawCover(ctx, imgB, gradB, w, h);
      break;

    case "fade":
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;
      break;

    case "dissolve": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      const sz = 6;
      for (let y = 0; y < h; y += sz) {
        for (let x = 0; x < w; x += sz) {
          const pseudoNoise = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
          if (pseudoNoise < p) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, sz, sz);
            ctx.clip();
            drawCover(ctx, imgB, gradB, w, h);
            ctx.restore();
          }
        }
      }
      ctx.restore();
      break;
    }

    case "slide": {
      const off = w * p;
      ctx.save();
      ctx.translate(-off, 0);
      drawCover(ctx, imgA, gradA, w, h);
      ctx.restore();

      ctx.save();
      ctx.translate(w - off, 0);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "zoom": {
      const scaleA = 1 + p * 1.8;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scaleA, scaleA);
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgA, gradA, w, h);
      ctx.restore();

      ctx.globalAlpha = p;
      const scaleB = 0.5 + p * 0.5;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scaleB, scaleB);
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }

    case "wipe": {
      drawCover(ctx, imgA, gradA, w, h);
      const x = w * p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, x, h);
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      // Glowing leading edge line
      const g = ctx.createLinearGradient(x - 8, 0, x + 6, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 8, 0, 14, h);
      break;
    }

    case "blur": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const blurAmt = Math.sin(p * Math.PI) * 10;
      if (blurAmt > 0.5) {
        ctx.globalAlpha = 0.35;
        for (let i = -1; i <= 1; i++) {
          ctx.drawImage(ctx.canvas, i * blurAmt, 0, w, h);
          ctx.drawImage(ctx.canvas, 0, i * blurAmt, w, h);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }

    case "glitch":
    case "glitch-slice": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const slices = 8;
      const sh = h / slices;
      for (let i = 0; i < slices; i++) {
        const y = i * sh;
        const offset = Math.sin(i * 4.2 + p * 15) * Math.sin(p * Math.PI) * 20;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, w, sh);
        ctx.clip();
        ctx.globalAlpha = 0.7;
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = "#ff0055";
        ctx.fillRect(offset * 0.8, y, w, sh);
        ctx.fillStyle = "#00f0ff";
        ctx.fillRect(-offset * 0.6, y, w, sh);
        ctx.restore();
      }
      break;
    }

    case "spin": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(p * Math.PI * 2);
      ctx.scale(p, p);
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "flash": {
      drawCover(ctx, imgA, gradA, w, h);
      if (p > 0.45) {
        drawCover(ctx, imgB, gradB, w, h);
      }
      const flashP = Math.sin(p * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashP * 0.95})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "shutter": {
      drawCover(ctx, imgB, gradB, w, h);
      const shH = (h / 2) * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, shH);
      ctx.rect(0, h - shH, w, shH);
      ctx.clip();
      drawCover(ctx, imgA, gradA, w, h);
      ctx.restore();
      break;
    }

    case "iris": {
      drawCover(ctx, imgA, gradA, w, h);
      const r = p * Math.sqrt(w * w + h * h) * 0.75;
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "split": {
      drawCover(ctx, imgB, gradB, w, h);
      const halfW = w / 2;
      const off = halfW * p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-off, 0, halfW, h);
      ctx.clip();
      drawCover(ctx, imgA, gradA, w, h);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(halfW + off, 0, halfW, h);
      ctx.clip();
      drawCover(ctx, imgA, gradA, w, h);
      ctx.restore();
      break;
    }

    case "mosaic": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;
      const size = Math.max(1, Math.round((1 - Math.abs(p - 0.5) * 2) * 18));
      if (size > 2) {
        ctx.fillStyle = p < 0.5 ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.2)";
        for (let y = 0; y < h; y += size) {
          for (let x = 0; x < w; x += size) {
            if (Math.sin(x + y) > 0) ctx.fillRect(x, y, size, size);
          }
        }
      }
      break;
    }

    case "ripple": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;

      // Concentric water ring ripples
      const maxR = Math.sqrt(w * w + h * h) * 0.6;
      ctx.strokeStyle = `rgba(186, 230, 253, ${Math.sin(p * Math.PI) * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, p * maxR, 0, Math.PI * 2);
      ctx.arc(w / 2, h / 2, Math.max(0, (p - 0.15) * maxR), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case "radar": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.arc(w / 2, h / 2, Math.sqrt(w * w + h * h), -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "whip-pan": {
      const shift = w * (p < 0.5 ? p * 2.5 : (1 - p) * 2.5);
      ctx.save();
      ctx.translate(-shift, 0);
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      ctx.restore();

      const motionFlash = Math.sin(p * Math.PI) * 0.5;
      ctx.fillStyle = `rgba(255, 255, 255, ${motionFlash})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "zoom-blur": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      const scale = 1 + p * 1.5;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }

    case "page-flip": {
      drawCover(ctx, imgB, gradB, w, h);
      const foldX = w * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, foldX, h);
      ctx.clip();
      drawCover(ctx, imgA, gradA, w, h);
      ctx.restore();

      // Page curl shadow
      const curlGrad = ctx.createLinearGradient(foldX - 20, 0, foldX + 15, 0);
      curlGrad.addColorStop(0, "rgba(0,0,0,0)");
      curlGrad.addColorStop(0.5, "rgba(0,0,0,0.6)");
      curlGrad.addColorStop(1, "rgba(255,255,255,0.4)");
      ctx.fillStyle = curlGrad;
      ctx.fillRect(foldX - 20, 0, 35, h);
      break;
    }

    case "sun-flare": {
      drawCover(ctx, imgA, gradA, w, h);
      if (p > 0.4) {
        ctx.globalAlpha = (p - 0.4) / 0.6;
        drawCover(ctx, imgB, gradB, w, h);
        ctx.globalAlpha = 1;
      }
      const flare = ctx.createRadialGradient(w * 0.8, h * 0.2, 0, w * 0.8, h * 0.2, w * 0.9);
      flare.addColorStop(0, `rgba(254, 240, 138, ${Math.sin(p * Math.PI) * 0.95})`);
      flare.addColorStop(0.4, `rgba(249, 115, 22, ${Math.sin(p * Math.PI) * 0.6})`);
      flare.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "light-leak": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;

      const leak = ctx.createLinearGradient(0, 0, w, h);
      leak.addColorStop(0, `rgba(244, 63, 94, ${Math.sin(p * Math.PI) * 0.6})`);
      leak.addColorStop(0.5, `rgba(251, 191, 36, ${Math.sin(p * Math.PI) * 0.7})`);
      leak.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leak;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "brush-paint": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.beginPath();
      const bands = 5;
      const bh = h / bands;
      for (let i = 0; i < bands; i++) {
        const bw = w * Math.min(1, Math.max(0, p * 1.5 - i * 0.1));
        ctx.rect(0, i * bh, bw, bh + 1);
      }
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "bokeh-blur": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;

      const bokehAlpha = Math.sin(p * Math.PI) * 0.5;
      if (bokehAlpha > 0.05) {
        ctx.fillStyle = `rgba(255, 182, 193, ${bokehAlpha})`;
        ctx.beginPath(); ctx.arc(w * 0.3, h * 0.4, 25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(254, 215, 170, ${bokehAlpha * 0.8})`;
        ctx.beginPath(); ctx.arc(w * 0.7, h * 0.6, 35, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }

    case "cinematic-bars": {
      drawCover(ctx, imgB, gradB, w, h);
      const barH = (h / 3) * (1 - p);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, barH);
      ctx.fillRect(0, h - barH, w, barH);
      break;
    }

    case "cube-rotate": {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);
      const angle = p * (Math.PI / 2);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cosA, 1 - sinA * 0.15);
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      ctx.restore();
      break;
    }

    case "color-flow": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;

      const flow = ctx.createLinearGradient(0, 0, w, h);
      flow.addColorStop(0, `rgba(168, 85, 247, ${Math.sin(p * Math.PI) * 0.6})`);
      flow.addColorStop(0.5, `rgba(236, 72, 153, ${Math.sin(p * Math.PI) * 0.6})`);
      flow.addColorStop(1, `rgba(6, 182, 212, ${Math.sin(p * Math.PI) * 0.6})`);
      ctx.fillStyle = flow;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "retro-pixel": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.globalAlpha = 1;

      const pixelSize = Math.max(1, Math.round(Math.sin(p * Math.PI) * 20));
      if (pixelSize > 2) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
        for (let y = 0; y < h; y += pixelSize) {
          for (let x = 0; x < w; x += pixelSize) {
            if ((x + y) % (pixelSize * 2) === 0) ctx.fillRect(x, y, pixelSize, pixelSize);
          }
        }
      }
      break;
    }

    case "star-warp": {
      drawCover(ctx, imgA, gradA, w, h);
      const starR = p * Math.sqrt(w * w + h * h) * 0.8;
      ctx.save();
      ctx.beginPath();
      // Draw 5-pointed star clipping mask
      const cx = w / 2, cy = h / 2, spikes = 5;
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? starR : starR * 0.5;
        const currAngle = (i * Math.PI) / spikes - Math.PI / 2;
        const x = cx + Math.cos(currAngle) * radius;
        const y = cy + Math.sin(currAngle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "liquid-melt": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      const dripProgress = Math.min(1, p * 1.25);
      const baseY = h * dripProgress;
      for (let x = w; x >= 0; x -= 4) {
        const wave = Math.sin(x * 0.08 + p * 10) * 12 * (1 - dripProgress * 0.5);
        ctx.lineTo(x, Math.min(h, baseY + wave));
      }
      ctx.closePath();
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      if (p < 0.9) {
        ctx.strokeStyle = "rgba(6, 182, 212, 0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        const bY = h * Math.min(1, p * 1.25);
        for (let x = 0; x <= w; x += 4) {
          const wY = bY + Math.sin(x * 0.08 + p * 10) * 12;
          if (x === 0) ctx.moveTo(x, wY);
          else ctx.lineTo(x, wY);
        }
        ctx.stroke();
      }
      break;
    }

    case "cross-zoom": {
      if (p < 0.5) {
        const zP = p * 2;
        const scale = 1 + zP * 1.5;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-w / 2, -h / 2);
        drawCover(ctx, imgA, gradA, w, h);
        ctx.restore();
      } else {
        const zP = (p - 0.5) * 2;
        const scale = 2.5 - zP * 1.5;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-w / 2, -h / 2);
        drawCover(ctx, imgB, gradB, w, h);
        ctx.restore();
      }
      const flashAlpha = Math.sin(p * Math.PI) * 0.85;
      if (flashAlpha > 0.02) {
        const rad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
        rad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
        rad.addColorStop(0.5, `rgba(245, 158, 11, ${flashAlpha * 0.5})`);
        rad.addColorStop(1, "transparent");
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "glitch-rgb-shatter": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const intensity = Math.sin(p * Math.PI);
      if (intensity > 0.05) {
        const slices = 6;
        for (let i = 0; i < slices; i++) {
          const sy = (h / slices) * i;
          const sh = h / slices;
          const shift = (Math.sin(i * 3 + p * 20) * 18) * intensity;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, sy, w, sh);
          ctx.clip();
          ctx.translate(shift, 0);
          drawCover(ctx, imgB, gradB, w, h);
          ctx.restore();
        }
        ctx.fillStyle = `rgba(239, 68, 68, ${intensity * 0.3})`;
        ctx.fillRect(0, h * 0.25, w, 8);
        ctx.fillStyle = `rgba(6, 182, 212, ${intensity * 0.3})`;
        ctx.fillRect(0, h * 0.65, w, 8);
      }
      break;
    }

    case "burn-film": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      const burnProgress = Math.min(1, p * 1.3);
      const burnR = burnProgress * Math.sqrt(w * w + h * h) * 0.7;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, burnR, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      const edgeAlpha = Math.sin(p * Math.PI) * 0.9;
      if (edgeAlpha > 0.05) {
        ctx.strokeStyle = `rgba(249, 115, 22, ${edgeAlpha})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(1, burnR), 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(1, burnR), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case "kaleido-spin": {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      const angle = p * Math.PI;
      const segments = 6;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      for (let s = 0; s < segments; s++) {
        ctx.save();
        ctx.rotate(angle + (s * (Math.PI * 2)) / segments);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w, h / 2);
        ctx.closePath();
        ctx.clip();
        ctx.translate(-w / 2, -h / 2);
        drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
        ctx.restore();
      }
      ctx.restore();
      break;
    }

    case "heart-zoom": {
      drawCover(ctx, imgA, gradA, w, h);
      const scale = p * 1.6;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-12, -12);
      ctx.beginPath();
      const heartPath = new Path2D("M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z");
      ctx.clip(heartPath);
      ctx.translate(12, 12);
      ctx.scale(1 / (scale || 0.001), 1 / (scale || 0.001));
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      const heartAlpha = Math.sin(p * Math.PI) * 0.8;
      if (heartAlpha > 0.05) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-12, -12);
        ctx.strokeStyle = `rgba(236, 72, 153, ${heartAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke(heartPath);
        ctx.restore();
      }
      break;
    }

    case "gsap-vortex-portal": {
      drawCover(ctx, imgA, gradA, w, h);
      const rad = p * Math.hypot(w, h) * 0.65;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((1 - p) * Math.PI * 1.5);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, rad), 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.max(2, rad), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case "gsap-whip-pan-blur": {
      const shift = p * w;
      ctx.save();
      ctx.translate(-shift, 0);
      drawCover(ctx, imgA, gradA, w, h);
      ctx.translate(w, 0);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      const streak = Math.sin(p * Math.PI) * 0.7;
      if (streak > 0.05) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.5, `rgba(245, 158, 11, ${streak})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "gsap-shatter-prism": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const flash = Math.sin(p * Math.PI);
      ctx.strokeStyle = `rgba(56, 189, 248, ${flash * 0.9})`;
      ctx.lineWidth = 2;
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI * 2) / 6 + p;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * w, cy + Math.sin(ang) * h);
        ctx.stroke();
      }
      break;
    }

    case "diagonal-blade-split": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w * Math.min(1, p * 1.4), 0);
      ctx.lineTo(0, h * Math.min(1, p * 1.4));
      ctx.closePath();
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();

      if (p > 0.05 && p < 0.95) {
        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * Math.min(1, p * 1.4), 0);
        ctx.lineTo(0, h * Math.min(1, p * 1.4));
        ctx.stroke();
      }
      break;
    }

    case "supernova-burst": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const burst = Math.sin(p * Math.PI);
      const rad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.75);
      rad.addColorStop(0, `rgba(255, 255, 255, ${burst})`);
      rad.addColorStop(0.4, `rgba(234, 179, 8, ${burst * 0.85})`);
      rad.addColorStop(1, "transparent");
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "cyber-datamosh-glitch": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const mosh = Math.sin(p * Math.PI);
      for (let i = 0; i < 8; i++) {
        const bx = ((i * 23 + p * 60) % (w - 16));
        const by = ((i * 17) % (h - 10));
        ctx.fillStyle = i % 2 === 0 ? `rgba(16, 185, 129, ${mosh * 0.65})` : `rgba(168, 85, 247, ${mosh * 0.65})`;
        ctx.fillRect(bx, by, 18, 10);
      }
      break;
    }

    case "gsap-pendulum-swing": {
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.translate(w / 2, 0);
      ctx.rotate((1 - p) * 0.9);
      ctx.translate(-w / 2, 0);
      ctx.globalAlpha = p;
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }

    case "shutter-blinds-wipe": {
      drawCover(ctx, imgA, gradA, w, h);
      const slats = 6;
      const sh = h / slats;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < slats; i++) {
        ctx.rect(0, i * sh, w, sh * p);
      }
      ctx.clip();
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    case "vhs-rewind-snap": {
      drawCover(ctx, p < 0.5 ? imgA : imgB, p < 0.5 ? gradA : gradB, w, h);
      const track = Math.sin(p * Math.PI);
      ctx.fillStyle = `rgba(239, 68, 68, ${track * 0.45})`;
      ctx.fillRect(0, (p * h) % h, w, 6);
      ctx.fillStyle = `rgba(255, 255, 255, ${track * 0.6})`;
      ctx.fillRect(0, ((1 - p) * h) % h, w, 3);
      break;
    }

    case "origami-fold-3d": {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);
      drawCover(ctx, imgA, gradA, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(p, 0.7 + p * 0.3);
      ctx.translate(-w / 2, -h / 2);
      drawCover(ctx, imgB, gradB, w, h);
      ctx.restore();
      break;
    }

    default:
      drawCover(ctx, imgA, gradA, w, h);
      break;
  }
}

// Visual Card Live Canvas Mini-Preview Component
const TransitionCardPreview = ({ 
  item, 
  isActive, 
  isHovered 
}: { 
  item: TransitionMetadata; 
  isActive: boolean; 
  isHovered: boolean; 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!startRef.current) startRef.current = ts;
    const duration = 1400;
    const elapsed = (ts - startRef.current) % (duration * 2);
    const raw = elapsed < duration ? elapsed / duration : 1 - (elapsed - duration) / duration;
    const p = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;

    renderFrame(ctx, item.id, p, W, H);
    rafRef.current = requestAnimationFrame(animate);
  }, [item.id]);

  useEffect(() => {
    // Only run continuous canvas animation when card is active or hovered to save CPU/GPU
    if (isActive || isHovered) {
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      // Draw static first frame
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) renderFrame(ctx, item.id, 0, W, H);
      }
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate, isActive, isHovered, item.id]);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 border border-white/10 shadow-inner group">
      {/* Background Poster Cover Image */}
      <img 
        src={item.coverImage} 
        alt={item.labelEn}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          isActive || isHovered ? "opacity-0" : "opacity-90 group-hover:scale-105"
        }`}
        loading="lazy"
      />

      {/* Live Canvas Animated Transition */}
      <canvas 
        ref={canvasRef} 
        width={W} 
        height={H} 
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isActive || isHovered ? "opacity-100" : "opacity-0"
        }`} 
      />

      {/* Gradient Vignette Overlay for Title Contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

      {/* Category Tag Badge on Top Corner */}
      <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
        <span 
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white backdrop-blur-md shadow-sm border border-white/15"
          style={{ backgroundColor: `${item.color}cc` }}
        >
          {getLang() === "en" ? item.badgeEn : item.badgeAr}
        </span>
      </div>

      {/* Live Indicator Icon */}
      {(isActive || isHovered) && (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[8px] font-mono text-emerald-300 font-bold uppercase">LIVE</span>
        </div>
      )}
    </div>
  );
};

export const TransitionPanel = ({ open, clipId, onClose }: Props) => {
  const en = getLang() === "en";
  const { clips, setTransition } = useMedia();
  const clip = clips.find((c) => c.id === clipId);

  const [selected, setSelected] = useState<TransitionType>("gsap-elastic-zoom");
  const [duration, setDuration] = useState(0.5);
  const [selectedCategory, setSelectedCategory] = useState<TransitionCategory | "all">("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredType, setHoveredType] = useState<TransitionType | null>(null);

  // Initialize sample images early for immediate snappy canvas rendering
  useEffect(() => {
    getSampleImages();
  }, []);

  const transitionType = clip?.transitionIn?.type;
  const transitionDur = clip?.transitionIn?.duration;

  useEffect(() => {
    if (clip?.transitionIn) {
      setSelected(clip.transitionIn.type);
      if (typeof clip.transitionIn.duration === "number" && clip.transitionIn.duration > 0) {
        setDuration(clip.transitionIn.duration);
      }
    } else {
      setSelected("gsap-elastic-zoom");
      setDuration(0.5);
    }
  }, [clipId, transitionType, transitionDur]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  const selectedMetadata = useMemo(() => {
    return TRANSITIONS_DATA.find((tr) => tr.id === selected) || TRANSITIONS_DATA[0];
  }, [selected]);

  const handleDurationChange = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    setDuration(rounded);
    if (clip && selected && selected !== "none") {
      setTransition(clip.id, { type: selected, duration: rounded });
    }
  };

  const applyToAllClips = () => {
    playSfx("success");
    clips.forEach((c) => {
      setTransition(c.id, { type: selected, duration });
    });
    toast.success(
      en
        ? `Applied "${selectedMetadata.labelEn}" (${duration}s) to all clips!`
        : `تم تطبيق انتقال "${selectedMetadata.labelAr}" (${duration} ثانية) على جميع المقاطع!`
    );
  };

  // Filter transitions based on selected category & search query
  const filteredTransitions = useMemo(() => {
    let list = TRANSITIONS_DATA;

    if (selectedCategory !== "all") {
      if (selectedCategory === "trending") {
        list = list.filter((tr) => tr.isTrending || tr.category === "trending");
      } else {
        list = list.filter((tr) => tr.category === selectedCategory);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((tr) => 
        tr.labelAr.toLowerCase().includes(q) ||
        tr.labelEn.toLowerCase().includes(q) ||
        tr.descAr.toLowerCase().includes(q) ||
        tr.descEn.toLowerCase().includes(q) ||
        tr.badgeAr.toLowerCase().includes(q) ||
        tr.badgeEn.toLowerCase().includes(q)
      );
    }

    return list;
  }, [selectedCategory, searchQuery]);

  if (!open || !clip) return null;

  const apply = (type: TransitionType) => {
    playSfx("click");
    setSelected(type);
    setTransition(clip.id, { type, duration });
  };

  return (
    <DraggableLibrarySheet
      id="transition-panel-root"
      open={open && Boolean(clip)}
      onClose={onClose}
      dir={en ? "ltr" : "rtl"}
      defaultVh={54}
      icon={<Wand2 className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />}
      title={t("transition.library")}
      headerActions={
        <button
          id="transition-apply-all-btn"
          onClick={applyToAllClips}
          className="h-7 px-2.5 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
          title={en ? "Apply this transition & duration to all clips" : "تطبيق هذا الانتقال والمدة على جميع المقاطع في المشروع"}
        >
          <CheckCheck className="w-3 h-3" />
          <span>{en ? "Apply All" : "تطبيق للكل"}</span>
        </button>
      }
      subHeader={
        <div className="space-y-1.5">
          {/* Compact Search + Categories Row */}
          <div className="flex items-center gap-1.5">
            <div className="relative w-28 sm:w-36 shrink-0">
              <Search className={`absolute ${en ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={en ? "Search..." : "بحث..."}
                className={`w-full h-7 ${en ? "pl-6 pr-5" : "pr-6 pl-5"} rounded-lg bg-secondary/50 border border-border/60 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className={`absolute ${en ? "right-1.5" : "left-1.5"} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[9px]`}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1">
              <button
                onClick={() => { playSfx("click"); setSelectedCategory("all"); }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap flex items-center gap-1 transition-all shrink-0 ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Compass className="w-3 h-3" />
                <span>{en ? "All" : "الكل"}</span>
              </button>

              {TRANSITION_CATEGORIES.map((cat) => {
                const isCatActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { playSfx("click"); setSelectedCategory(cat.id); }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap flex items-center gap-1 transition-all shrink-0 ${
                      isCatActive
                        ? "text-white shadow-xs"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                    style={isCatActive ? { backgroundColor: cat.color } : {}}
                  >
                    <span>{cat.icon}</span>
                    <span>{en ? cat.labelEn : cat.labelAr}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Duration Bar */}
          <div className="flex items-center gap-2 bg-secondary/35 border border-border/40 rounded-xl px-2.5 py-1.5">
            <Clock className="w-3 h-3 text-primary shrink-0" />
            <span className="text-[10px] font-black text-primary font-mono shrink-0">
              {duration.toFixed(1)}{en ? "s" : "ث"}
            </span>
            <input
              type="range"
              min="0.1"
              max={Math.min(3.0, Math.max(1.5, Math.round((clip?.duration || 4.0) * 10) / 10))}
              step="0.1"
              value={duration}
              onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 rounded-lg bg-background/90 accent-primary cursor-pointer"
            />
          </div>
        </div>
      }
    >

        {/* Transitions Grid */}
        {filteredTransitions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs flex flex-col items-center gap-2">
            <Layers className="w-8 h-8 text-muted-foreground/50" />
            <p>{t("transition.noResults")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filteredTransitions.map((tr) => {
              const isActive = selected === tr.id;
              const isHovered = hoveredType === tr.id;

              return (
                <button
                  key={tr.id}
                  onClick={() => apply(tr.id)}
                  onMouseEnter={() => setHoveredType(tr.id)}
                  onMouseLeave={() => setHoveredType(null)}
                  className={`group relative p-2 rounded-2xl border-2 text-start transition-all overflow-hidden flex flex-col justify-between ${
                    isActive
                      ? "border-primary bg-primary/10 shadow-xl scale-[1.02]"
                      : "border-border/80 bg-card hover:border-primary/50 hover:bg-secondary/30"
                  }`}
                  style={isActive ? { borderColor: tr.color, boxShadow: `0 0 16px ${tr.color}40` } : {}}
                >
                  {/* Visual Advertising Poster & Dynamic Live Canvas */}
                  <TransitionCardPreview 
                    item={tr} 
                    isActive={isActive} 
                    isHovered={isHovered} 
                  />

                  {/* Title & Metadata */}
                  <div className="mt-2 flex-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs shrink-0">{tr.emoji}</span>
                        <h4 className="text-xs font-bold text-foreground font-heading truncate">
                          {en ? tr.labelEn : tr.labelAr}
                        </h4>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug mb-1">
                      {en ? tr.descEn : tr.descAr}
                    </p>
                  </div>

                  {/* Active Selected Check Badge */}
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full gradient-primary flex items-center justify-center shadow-lg border border-white/40 z-20 animate-scale-in">
                      <Check className="w-3 h-3 text-white stroke-[3.5px]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

    </DraggableLibrarySheet>
  );
};

export default TransitionPanel;
