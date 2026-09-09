import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMedia, VfxType } from "@/context/MediaContext";
import { X, Sparkles, Trash2, Plus, Check, Eye, EyeOff, Search, Play, Clapperboard, Flame, CloudRain, Disc3, Zap, Sun, Film } from "lucide-react";
import { t, getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";
import { VFX_DATA, VFX_CATEGORIES, VfxCategory, VfxMetadata } from "@/data/vfxData";

interface Props {
  open: boolean;
  onClose: () => void;
  currentTime: number;
}

const W = 88, H = 54;

function renderVfxFrame(ctx: CanvasRenderingContext2D, type: VfxType, p: number, color: string) {
  ctx.clearRect(0, 0, W, H);
  
  // Base backdrop with subtle frame preview
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#090d16");
  bg.addColorStop(1, "#151e2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Background sample video dummy content (a hill and sun / abstract city)
  ctx.save();
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(W * 0.7, H * 0.45, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e3a5f";
  ctx.beginPath();
  ctx.moveTo(6, H - 10);
  ctx.lineTo(W * 0.4, H * 0.4);
  ctx.lineTo(W - 6, H - 10);
  ctx.fill();
  ctx.restore();

  const sin = Math.sin(p * Math.PI * 2);
  const cos = Math.cos(p * Math.PI * 2);

  switch (type) {
    // ================= 🎬 INTRO & OPENERS =================
    case "cinematic-opener": {
      const openRatio = Math.min(1, p * 1.3);
      const barH = (H / 2) * (1 - openRatio);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      
      const bloom = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      bloom.addColorStop(0, `rgba(255, 255, 255, ${0.4 * (1 - openRatio)})`);
      bloom.addColorStop(1, "transparent");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, W, H);
      break;
    }

    case "spotlight-reveal": {
      const radius = Math.max(4, p * W * 0.8);
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }

    case "epic-zoom-in": {
      const scale = 1.6 - p * 0.6;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -H / 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, 8, W - 16, H - 16);
      ctx.restore();
      // Shockwave lines
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4 * (1 - p);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, p * W * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }

    case "neon-glow-entry": {
      const flashAlpha = Math.max(0, 1 - p * 1.5);
      ctx.fillStyle = `rgba(236, 72, 153, ${flashAlpha * 0.7})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.shadowBlur = 0;
      break;
    }

    case "film-countdown": {
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Clock hand
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2);
      ctx.lineTo(W / 2 + Math.cos(p * Math.PI * 2) * 14, H / 2 + Math.sin(p * Math.PI * 2) * 14);
      ctx.stroke();
      const num = 3 - Math.floor(p * 3);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(num > 0 ? num.toString() : "1", W / 2, H / 2);
      break;
    }

    case "tv-power-on": {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
      if (p < 0.4) {
        const lineW = (p / 0.4) * (W - 12);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(W / 2 - lineW / 2, H / 2 - 1, lineW, 2);
      } else {
        const expandH = ((p - 0.4) / 0.6) * (H - 12);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(6, H / 2 - expandH / 2, W - 12, expandH);
      }
      break;
    }

    case "curtain-rise": {
      const rise = p * H;
      ctx.fillStyle = "#881337";
      ctx.fillRect(0, 0, W, H - rise);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, H - rise);
      ctx.lineTo(W, H - rise);
      ctx.stroke();
      break;
    }

    // ================= 🌧️ WEATHER & NATURE =================
    case "rain-storm": {
      ctx.fillStyle = "rgba(14, 165, 233, 0.15)";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(186, 230, 253, 0.7)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const rx = (i * 19 + p * 80) % W;
        const ry = (i * 23 + p * 120) % H;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 6);
        ctx.stroke();
      }
      // Splash ripple on bottom
      ctx.strokeStyle = "rgba(186, 230, 253, 0.4)";
      ctx.beginPath();
      ctx.ellipse((p * 150) % W, H - 4, 4, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case "snow-blizzard": {
      ctx.fillStyle = "rgba(186, 230, 253, 0.1)";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 20; i++) {
        const sx = (i * 17 + Math.sin(p * 4 + i) * 6 + p * 20) % W;
        const sy = (i * 21 + p * 40) % H;
        const sr = (i % 3) + 1;
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "fire-embers": {
      const grad = ctx.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, "rgba(249, 115, 22, 0.35)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 16; i++) {
        const fx = (i * 23 + Math.sin(p * 6 + i) * 8) % W;
        const fy = (H - ((i * 19 + p * 70) % H));
        const fr = (i % 2) + 1;
        ctx.fillStyle = i % 2 === 0 ? "#f97316" : "#fbbf24";
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "fog-smoke": {
      for (let i = 0; i < 3; i++) {
        const fx = (W * 0.3 + Math.sin(p * 2 + i) * 20 + i * 25) % W;
        const fy = H * 0.5 + Math.cos(p * 2 + i) * 10;
        const grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, 24);
        grad.addColorStop(0, "rgba(203, 213, 225, 0.35)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }

    case "thunder-lightning": {
      if (Math.sin(p * 12) > 0.4) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "#fef08a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W * 0.5, 0);
        ctx.lineTo(W * 0.45, H * 0.35);
        ctx.lineTo(W * 0.55, H * 0.4);
        ctx.lineTo(W * 0.48, H);
        ctx.stroke();
      }
      break;
    }

    case "sparkles-stars": {
      for (let i = 0; i < 8; i++) {
        const sx = (i * 29 + p * 15) % W;
        const sy = (i * 17 + p * 10) % H;
        const scale = Math.abs(Math.sin(p * 6 + i)) * 3 + 1;
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - scale, sy);
        ctx.lineTo(sx + scale, sy);
        ctx.moveTo(sx, sy - scale);
        ctx.lineTo(sx, sy + scale);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "bubbles-floating": {
      for (let i = 0; i < 10; i++) {
        const bx = (i * 21 + Math.sin(p * 3 + i) * 6) % W;
        const by = H - ((i * 15 + p * 45) % H);
        const br = (i % 3) + 2.5;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    // ================= 🪩 DANCE & PARTY =================
    case "disco-strobe": {
      const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#d946ef", "#06b6d4"];
      const cIdx = Math.floor((p * 12) % colors.length);
      ctx.fillStyle = colors[cIdx] + "44";
      ctx.fillRect(0, 0, W, H);
      // Sweeping light cones
      ctx.strokeStyle = colors[(cIdx + 2) % colors.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2 + sin * 30, H);
      ctx.stroke();
      break;
    }

    case "bass-shake-pulse": {
      const beat = Math.abs(Math.sin(p * 8));
      const offX = (Math.random() - 0.5) * 6 * beat;
      const offY = (Math.random() - 0.5) * 4 * beat;
      ctx.save();
      ctx.translate(offX, offY);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      // Subwoofer ripple rings
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, beat * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case "neon-equalizer": {
      const barCount = 12;
      const barW = (W - 16) / barCount;
      for (let i = 0; i < barCount; i++) {
        const barH = Math.abs(Math.sin(p * 10 + i * 0.8)) * (H - 16);
        ctx.fillStyle = `hsl(${180 + i * 15}, 100%, 60%)`;
        ctx.fillRect(8 + i * barW, H - 8 - barH, barW - 1.5, barH);
      }
      break;
    }

    case "rgb-rave": {
      const hue = (p * 360) % 360;
      ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.3)`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `hsl(${(hue + 180) % 360}, 100%, 60%)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(6 + sin * 4, 6, W - 12, H - 12);
      break;
    }

    case "laser-beams": {
      ctx.lineWidth = 1.5;
      const lColors = ["#22c55e", "#ef4444", "#06b6d4", "#ec4899"];
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = lColors[i];
        ctx.shadowColor = lColors[i];
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(0, (i * H) / 4);
        ctx.lineTo(W, H - (i * H) / 4 + sin * 12);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      break;
    }

    case "kaleidoscope-dance": {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      for (let i = 0; i < 6; i++) {
        ctx.rotate((Math.PI / 3));
        ctx.fillStyle = `hsla(${i * 60 + p * 120}, 90%, 60%, 0.4)`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, -6);
        ctx.lineTo(12, 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    // ================= ⚡ ACTION & MOTION =================
    case "glitch": {
      for (let i = 0; i < 4; i++) {
        const y = (H / 4) * i;
        const xOff = Math.sin(i * 2.3 + p * 15) * 8 * p;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#ff004040";
        ctx.fillRect(xOff + 2, y, W - 4, H / 4);
        ctx.fillStyle = "#00ffff40";
        ctx.fillRect(-xOff + 2, y, W - 4, H / 4);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + p * 0.4;
      ctx.fillRect(W / 4, H / 4, W / 2, H / 2);
      ctx.globalAlpha = 1;
      break;
    }

    case "shake": {
      const offX = sin * 6 * p;
      ctx.save();
      ctx.translate(offX, 0);
      ctx.fillStyle = color + "44";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + p * 0.5;
      ctx.strokeRect(4 + offX, 8, W - 8, H - 16);
      ctx.globalAlpha = 1;
      break;
    }

    case "shake-v": {
      const offY = sin * 6 * p;
      ctx.save();
      ctx.translate(0, offY);
      ctx.fillStyle = color + "44";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + p * 0.5;
      ctx.strokeRect(4, 8 + offY, W - 8, H - 16);
      ctx.globalAlpha = 1;
      break;
    }

    case "zoom-pulse": {
      const scale = 1 + Math.sin(p * Math.PI * 2) * 0.15;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = color + "55";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore();
      break;
    }

    case "bounce": {
      const bounce = Math.abs(sin) * 6;
      ctx.save();
      ctx.translate(0, bounce);
      ctx.fillStyle = color + "55";
      ctx.fillRect(4, 8 - bounce, W - 8, H - 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(4, 8 - bounce, W - 8, H - 16);
      ctx.restore();
      break;
    }

    case "swing": {
      const angle = sin * 0.2;
      ctx.save();
      ctx.translate(W / 2, 4);
      ctx.rotate(angle);
      ctx.translate(-W / 2, -4);
      ctx.fillStyle = color + "55";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore();
      break;
    }

    case "heartbeat": {
      const pulse = 1 + (Math.sin(p * Math.PI * 4) > 0.7 ? 0.08 : 0) * p;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(pulse, pulse);
      ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = color + "55";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore();
      break;
    }

    case "rotate-3d": {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.transform(1, 0, sin * 0.3, 1 - Math.abs(sin) * 0.2, 0, 0);
      ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = color + "66";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(4, 8, W - 8, H - 16);
      ctx.restore();
      break;
    }

    case "water-ripple": {
      ctx.fillStyle = "#06b6d433";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) {
        const rad = ((p * 20 + i * 8) % 22) + 2;
        ctx.strokeStyle = `rgba(6, 182, 212, ${1 - rad / 24})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    // ================= 🌈 LIGHT & GLOW =================
    case "flash": {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }

    case "light-leak": {
      const grad = ctx.createRadialGradient(W * p, H * 0.3, 0, W * p, H * 0.3, W * 0.6);
      grad.addColorStop(0, color + "cc");
      grad.addColorStop(0.5, color + "44");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }

    case "radial-lens-flare": {
      const flareX = W * (0.2 + p * 0.6);
      const flareGrad = ctx.createRadialGradient(flareX, H * 0.4, 0, flareX, H * 0.4, W * 0.5);
      flareGrad.addColorStop(0, "#ffffff");
      flareGrad.addColorStop(0.3, "#ffaa0088");
      flareGrad.addColorStop(0.8, "#ff00aa33");
      flareGrad.addColorStop(1, "transparent");
      ctx.fillStyle = flareGrad;
      ctx.fillRect(0, 0, W, H);
      break;
    }

    case "rgb-split": {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#ff0040";
      ctx.fillRect(4 + p * 6, 8, W - 8, H - 16);
      ctx.fillStyle = "#00ffff";
      ctx.fillRect(4 - p * 6, 8, W - 8, H - 16);
      ctx.fillStyle = color + "40";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.globalAlpha = 1;
      break;
    }

    case "chromatic": {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#ff000066";
      ctx.fillRect(4 + sin * 4, 8, W - 8, H - 16);
      ctx.fillStyle = "#00ff0066";
      ctx.fillRect(4, 8, W - 8, H - 16);
      ctx.fillStyle = "#0000ff66";
      ctx.fillRect(4 - sin * 4, 8, W - 8, H - 16);
      ctx.globalAlpha = 1;
      break;
    }

    case "prism": {
      const colors = ["#ff0040", "#ff8c00", "#ffd700", "#00ff88", "#00bfff", "#8a2be2"];
      for (let i = 0; i < colors.length; i++) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = colors[i];
        ctx.fillRect(4 + (i - 2.5) * 3 * p, 8, W - 8, H - 16);
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "motion-blur-streak": {
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * p * 4;
        ctx.fillStyle = color;
        ctx.fillRect(4 + off, 8, W - 8, H - 16);
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "vintage-sepia-bloom": {
      ctx.fillStyle = "#f59e0b33";
      ctx.fillRect(0, 0, W, H);
      const bloom = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
      bloom.addColorStop(0, "#ffffff66");
      bloom.addColorStop(1, "transparent");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, W, H);
      break;
    }

    case "particles": {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + p * 3;
        const r = 10 + p * 12;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7 - p * 0.5;
        ctx.beginPath();
        ctx.arc(W / 2 + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    // ================= 📼 CINEMA & RETRO =================
    case "vintage-8mm": {
      ctx.fillStyle = "#d9770633";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, 6, H);
      ctx.fillRect(W - 6, 0, 6, H);
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)";
        ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
      }
      break;
    }

    case "old-vhs-tape": {
      for (let y = 0; y < H; y += 2) {
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(0, y, W, 1);
      }
      const lineY = (p * H * 1.5) % H;
      ctx.fillStyle = "rgba(192, 38, 211, 0.5)";
      ctx.fillRect(0, lineY, W, 3);
      ctx.fillStyle = "#00ff00";
      ctx.font = "8px monospace";
      ctx.fillText("PLAY 00:00", 6, H - 6);
      break;
    }

    case "retro-sepia-grain": {
      ctx.fillStyle = "#b4530944";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 65; i++) {
        ctx.fillStyle = Math.random() > 0.4 ? "rgba(255,248,220,0.3)" : "rgba(60,40,10,0.4)";
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
      }
      break;
    }

    case "crt-tv-retro": {
      ctx.fillStyle = "#10b98122";
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(0, y, W, 1);
      }
      const g = ctx.createRadialGradient(W / 2, H / 2, 5, W / 2, H / 2, W / 2);
      g.addColorStop(0, "rgba(16,185,129,0.2)");
      g.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }

    case "vhs": {
      for (let y = 0; y < H; y += 3) {
        const noise = (Math.sin(y * 0.3 + p * 10) * 0.5 + 0.5) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${noise})`;
        ctx.fillRect(0, y, W, 1);
      }
      ctx.fillStyle = color + "33";
      ctx.fillRect(0, H * 0.3, W, H * 0.1);
      break;
    }

    case "scan-lines": {
      for (let y = 0; y < H; y += 2) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(0, y, W, 1);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.strokeRect(2, 4, W - 4, H - 8);
      ctx.globalAlpha = 1;
      break;
    }

    case "film-grain": {
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
        ctx.globalAlpha = Math.random() * 0.4;
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "pixelate": {
      const sz = Math.max(2, Math.round((1 - p) * 10 + 2));
      for (let y = 0; y < H; y += sz) {
        for (let x = 0; x < W; x += sz) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.2 + Math.random() * 0.5;
          ctx.fillRect(x, y, sz - 1, sz - 1);
        }
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "crt-scanner": {
      ctx.fillStyle = "#00000044";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      const scanY = (p * H * 2) % H;
      ctx.fillStyle = "#00ffcc55";
      ctx.fillRect(0, scanY, W, 2);
      break;
    }

    default:
      break;
  }

  // Accent edge border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4 + p * 0.3;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.globalAlpha = 1;
}

const VfxPreview = ({ type, color }: { type: VfxType; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const D = 1400;

  const animate = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!startRef.current) startRef.current = ts;
    const e = (ts - startRef.current) % (D * 2);
    const raw = e < D ? e / D : 1 - (e - D) / D;
    renderVfxFrame(ctx, type, raw, color);
    rafRef.current = requestAnimationFrame(animate);
  }, [type, color]);

  useEffect(() => {
    startRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return <canvas ref={canvasRef} width={W} height={H} className="w-full h-full object-cover rounded-lg" />;
};

const VfxPanel = ({ open, onClose, currentTime }: Props) => {
  const en = getLang() === "en";
  const { addVfx, vfx, updateVfx, removeVfx, totalDuration } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<VfxCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  // Filter VFX Items
  const filteredVfx = useMemo(() => {
    let list = VFX_DATA;
    if (activeCategory !== "all") {
      list = list.filter((item) => item.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.labelAr.toLowerCase().includes(q) ||
          item.labelEn.toLowerCase().includes(q) ||
          item.descAr.toLowerCase().includes(q) ||
          item.descEn.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeCategory, searchQuery]);

  if (!open) return null;

  // Add at current playhead position
  const handleAddVfxAtPlayhead = (meta: VfxMetadata) => {
    playSfx("click");
    const existing = selectedId ? vfx.find((v) => v.id === selectedId) : null;
    if (existing) {
      updateVfx(existing.id, { type: meta.id });
      toast.success(en ? `Replaced with ${meta.labelEn}!` : `تم تغيير المؤثر المحدد إلى ${meta.labelAr}!`);
      return;
    }
    const start = Math.max(0, currentTime);
    const duration = meta.defaultDuration || 3.0;
    const end = Math.min(totalDuration, start + duration);
    addVfx({
      type: meta.id,
      start,
      end,
      intensity: meta.defaultIntensity ?? 0.75,
    });
    toast.success(en ? `Added ${meta.labelEn} at current time!` : `تم إضافة مؤثر ${meta.labelAr} عند المؤشر الحالي!`);
  };

  // Add as Intro / Opener at 0.0s (Beginning of Video)
  const handleAddAsIntro = (meta: VfxMetadata) => {
    playSfx("success");
    const duration = meta.defaultDuration || (meta.isIntro ? 2.5 : 3.5);
    const end = Math.min(totalDuration, duration);
    addVfx({
      type: meta.id,
      start: 0,
      end,
      intensity: meta.defaultIntensity ?? 0.85,
    });
    toast.success(en ? `Added ${meta.labelEn} as video opener intro!` : `تمت إضافة ${meta.labelAr} كافتتاحية سينمائية للفيديو!`);
  };

  // Minimized / Collapsed Bar so user can preview their work clearly
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir={en ? "ltr" : "rtl"}>
        <div className="bg-card/95 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active VFX tracks:" : "المؤثرات البصرية النشطة:"}</span>
            <span className="text-primary font-extrabold">{vfx.length}</span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => {
              playSfx("click");
              setIsCollapsed(false);
            }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {en ? "Show Library" : "إظهار المكتبة"}
          </button>
          <button
            onClick={() => {
              playSfx("success");
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90"
            title={en ? "Confirm Selection" : "تأكيد والانتهاء"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button
            onClick={() => {
              playSfx("click");
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={en ? "ltr" : "rtl"}>
      <div className="bg-card border-t border-border rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0 bg-card/95 backdrop-blur-sm z-10 rounded-t-3xl">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-primary-foreground animate-pulse" />
            </div>
            <div>
              <span className="text-sm font-bold text-foreground">
                {en ? "Visual Effects Library" : "مكتبة المؤثرات البصرية (VFX)"}
              </span>
              <span className="text-[10px] text-muted-foreground block -mt-0.5">
                {en ? "Cinema Openers, Weather, Dance & Action" : "افتتاحيات سينمائية، طقس، رقص وأكشن"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Collapse button */}
            <button
              onClick={() => {
                playSfx("click");
                setIsCollapsed(true);
              }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1.5 text-xs font-bold text-foreground transition-all active:scale-90"
              title={en ? "Minimize to preview video" : "إخفاء لرؤية الفيديو"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            <button
              onClick={() => {
                playSfx("success");
                onClose();
              }}
              className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
              title={en ? "Done" : "تم"}
            >
              <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
            </button>
            <button
              onClick={() => {
                playSfx("click");
                onClose();
              }}
              className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-all active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Categories Tabs & Search */}
        <div className="px-4 pt-3 pb-2 space-y-2.5 border-b border-border/40 shrink-0 bg-background/50">
          
          {/* Search bar */}
          <div className="relative">
            <Search className={`w-3.5 h-3.5 absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-muted-foreground`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={en ? "Search effects (rain, snow, opener, dance, disco...)" : "بحث في المؤثرات (مطر، ثلج، افتتاحية، رقص، ديسكو...)"}
              className={`w-full ${en ? "pl-9 pr-3" : "pr-9 pl-3"} py-1.5 text-xs rounded-xl bg-card border border-border/80 focus:border-primary focus:outline-none text-foreground placeholder:text-muted-foreground`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className={`absolute ${en ? "right-2.5" : "left-2.5"} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs`}
              >
                ✕
              </button>
            )}
          </div>

          {/* Categories Pill Scroller */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {VFX_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    playSfx("click");
                    setActiveCategory(cat.id);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? "gradient-primary text-white shadow-sm scale-[1.02]"
                      : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                  }`}
                >
                  <span className="text-xs">{cat.icon}</span>
                  <span>{en ? cat.labelEn : cat.labelAr}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
          
          {/* Mode Indicator Banner */}
          {selectedId ? (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/30 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-primary animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>{en ? "Replacing selected effect track..." : "جاري استبدال وتعديل المؤثر المحدد في المخطط"}</span>
              </div>
              <button
                onClick={() => {
                  playSfx("click");
                  setSelectedId(null);
                }}
                className="px-3 py-1 rounded-xl bg-card hover:bg-secondary text-foreground text-[10px] font-extrabold border border-border/60 shadow-sm transition-all active:scale-95"
              >
                {en ? "Cancel (Add New)" : "إلغاء (إضافة جديد)"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-secondary/40 border border-border/40 px-3.5 py-2 rounded-2xl text-[11px] font-semibold text-muted-foreground">
              <span>{en ? "Click card to add at playhead, or use Intro button" : "اضغط على البطاقة للإضافة عند المؤشر، أو زر الافتتاحية"}</span>
              <span className="text-primary font-bold text-[10px] bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                {vfx.length} {en ? "Active" : "مؤثرات نشطة"}
              </span>
            </div>
          )}

          {/* Grid of Effects */}
          {filteredVfx.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <span className="text-2xl">🔍</span>
              <p className="text-xs font-semibold text-muted-foreground">
                {en ? "No matching visual effects found" : "لم يتم العثور على مؤثرات مطابقة"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredVfx.map((item) => {
                const isCurrentlyActive = vfx.some((v) => v.type === item.id);
                return (
                  <div
                    key={item.id}
                    className="relative flex flex-col rounded-2xl bg-card border border-border/80 hover:border-primary/60 transition-all p-2 gap-1.5 shadow-sm group hover:shadow-md"
                    style={{ borderColor: isCurrentlyActive ? item.color : undefined }}
                  >
                    {/* Animated Canvas Preview */}
                    <div
                      onClick={() => handleAddVfxAtPlayhead(item)}
                      className="relative h-20 w-full rounded-xl overflow-hidden cursor-pointer bg-slate-900 border border-border/40"
                    >
                      <VfxPreview type={item.id} color={item.color} />
                      
                      {/* Badge */}
                      <span
                        className="absolute top-1.5 right-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md text-white shadow-sm"
                        style={{ backgroundColor: item.color + "dd" }}
                      >
                        {en ? item.badgeEn : item.badgeAr}
                      </span>

                      {/* Active Checkmark */}
                      {isCurrentlyActive && (
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full gradient-primary flex items-center justify-center shadow-md animate-scale-in z-20 border border-white/20">
                          <Check className="w-2.5 h-2.5 text-white stroke-[3.5px]" />
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm shrink-0">{item.emoji}</span>
                        <span className="text-xs font-bold text-foreground truncate">
                          {en ? item.labelEn : item.labelAr}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground line-clamp-1 leading-tight">
                      {en ? item.descEn : item.descAr}
                    </p>

                    {/* Action Buttons: Add at Playhead & Add as Intro */}
                    <div className="flex items-center gap-1 pt-1 border-t border-border/40 mt-auto">
                      <button
                        onClick={() => handleAddVfxAtPlayhead(item)}
                        className="flex-1 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-foreground text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95"
                        title={en ? "Add at current time" : "إضافة عند المؤشر"}
                      >
                        <Plus className="w-3 h-3 text-primary" />
                        <span>{en ? "Add" : "إضافة"}</span>
                      </button>

                      {/* Intro Opener Button */}
                      <button
                        onClick={() => handleAddAsIntro(item)}
                        className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
                        title={en ? "Add as video opening intro (at 0.0s)" : "إضافة كافتتاحية أول الفيديو (عند البداية 0.0ث)"}
                      >
                        <Clapperboard className="w-3 h-3" />
                        <span>{en ? "Intro" : "افتتاحية"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active VFX Tracks Manager */}
          {vfx.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>{en ? "Active Effects in Timeline" : "المؤثرات النشطة في المخطط الزمني"}</span>
                  <span className="text-muted-foreground font-normal text-[11px]">({vfx.length})</span>
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {en ? "Adjust intensity & timing below" : "اضبط القوة والمدة لكل مؤثر"}
                </span>
              </div>

              <div className="space-y-2">
                {vfx.map((v) => {
                  const meta = VFX_DATA.find((l) => l.id === v.type);
                  const isSelected = selectedId === v.id;
                  const durationSec = (v.end - v.start).toFixed(1);
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedId(isSelected ? null : v.id)}
                      className={`p-3 rounded-2xl bg-card border cursor-pointer transition-all shadow-sm ${
                        isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-xl flex items-center justify-center text-sm shadow-sm"
                            style={{ background: (meta?.color || "#3b82f6") + "25", border: `1px solid ${(meta?.color || "#3b82f6")}44` }}
                          >
                            {meta?.emoji || "✨"}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">
                              {en ? meta?.labelEn || v.type : meta?.labelAr || v.type}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {v.start.toFixed(1)}s ➔ {v.end.toFixed(1)}s ({durationSec}s)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10">
                            {Math.round(v.intensity * 100)}%
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playSfx("click");
                              removeVfx(v.id);
                              toast.info(en ? "Removed VFX" : "تم حذف المؤثر البصري");
                            }}
                            className="w-7 h-7 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center transition-all active:scale-90"
                            title={en ? "Delete effect" : "حذف المؤثر"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Intensity Range Slider */}
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-[10px] text-muted-foreground font-bold shrink-0">
                          {en ? "Intensity:" : "القوة:"}
                        </span>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.01}
                          value={v.intensity}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateVfx(v.id, { intensity: parseFloat(e.target.value) })}
                          className="flex-1 accent-primary h-1.5 rounded-lg cursor-pointer"
                          dir="ltr"
                          style={{ accentColor: meta?.color || "#3b82f6" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-2"></div>
        </div>
      </div>
    </div>
  );
};

export default VfxPanel;
