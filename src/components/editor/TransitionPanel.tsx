import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useMedia, TransitionType } from "@/context/MediaContext";
import { 
  X, Check, Eye, EyeOff, Wand2, 
  Search, Compass, Layers
} from "lucide-react";
import { t, getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { 
  TRANSITIONS_DATA, 
  TRANSITION_CATEGORIES, 
  TransitionCategory 
} from "@/data/transitionsData";
import { renderGSAPTransitionFrame } from "@/lib/gsapTransitions";

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
  const [duration] = useState(0.5);
  const [selectedCategory, setSelectedCategory] = useState<TransitionCategory | "all">("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredType, setHoveredType] = useState<TransitionType | null>(null);

  // Initialize sample images early for immediate snappy canvas rendering
  useEffect(() => {
    getSampleImages();
  }, []);

  useEffect(() => {
    if (clip?.transitionIn) {
      setSelected(clip.transitionIn.type);
    } else {
      setSelected("gsap-elastic-zoom");
    }
  }, [clipId, clip?.transitionIn]);

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
      setSearchQuery("");
    }
  }, [open]);

  const selectedMetadata = useMemo(() => {
    return TRANSITIONS_DATA.find((tr) => tr.id === selected) || TRANSITIONS_DATA[0];
  }, [selected]);

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

  // Minimized/Collapsed mode to preview timeline & work without blocking screen
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" dir={en ? "ltr" : "rtl"}>
        <div className="bg-card/95 backdrop-blur-xl border border-primary/40 rounded-full px-4 py-2.5 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Transition:" : "الانتقال:"}</span>
            <span className="text-primary font-extrabold flex items-center gap-1">
              <span>{selectedMetadata.emoji}</span>
              <span>{en ? selectedMetadata.labelEn : selectedMetadata.labelAr}</span>
            </span>
          </span>

          <div className="h-4 w-px bg-border" />

          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {en ? "Show Library" : "إظهار المكتبة"}
          </button>

          <button 
            onClick={() => { playSfx("success"); onClose(); }}
            className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90 shadow-md"
            title={en ? "Confirm Selection" : "تأكيد الاختيار"}
          >
            <Check className="w-4 h-4 text-white stroke-[3px]" />
          </button>

          <button 
            onClick={() => { playSfx("click"); onClose(); }}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-300" dir={en ? "ltr" : "rtl"}>
      <div className="bg-card/95 backdrop-blur-2xl border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[82vh] overflow-y-auto no-scrollbar pb-8 flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <Wand2 className="w-4 h-4 text-primary-foreground animate-pulse" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-sm text-foreground flex items-center gap-1.5">
                <span>{t("transition.library")}</span>
                <span className="text-[10px] text-primary px-2 py-0.5 rounded-full bg-primary/10 font-mono font-bold">
                  {TRANSITIONS_DATA.length} {en ? "fx" : "انتقال"}
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {en ? "Cinematic advertising transition library categorized for all video styles" : "مكتبة انتقالات سينمائية مصنفة لجميع أنواع الفيديوهات والإعلانات"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Collapse button to preview workspace */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90"
              title={en ? "Minimize library to preview work" : "إخفاء لرؤية العمل"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            {/* Confirm button */}
            <button 
              onClick={() => { playSfx("success"); onClose(); }} 
              className="px-3.5 py-1.5 rounded-full gradient-primary flex items-center gap-1.5 text-white text-xs font-bold shadow-md transition-all active:scale-90"
              title={en ? "Confirm Selection" : "تأكيد الاختيار"}
            >
              <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
              <span>{en ? "Done" : "تم"}</span>
            </button>

            <button 
              onClick={() => { playSfx("click"); onClose(); }} 
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-all active:scale-90"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("transition.search")}
            className={`w-full ${en ? "pl-9 pr-8" : "pr-9 pl-8"} py-2 rounded-xl bg-secondary/50 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className={`absolute ${en ? "right-2.5" : "left-2.5"} top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Categories Tab Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3">
          <button
            onClick={() => { playSfx("click"); setSelectedCategory("all"); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 ${
              selectedCategory === "all"
                ? "bg-foreground text-background shadow-md"
                : "bg-secondary/70 text-muted-foreground hover:text-foreground border border-border/50"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{en ? "All" : "الكل"} ({TRANSITIONS_DATA.length})</span>
          </button>

          {TRANSITION_CATEGORIES.map((cat) => {
            const isCatActive = selectedCategory === cat.id;
            const count = cat.id === "trending" 
              ? TRANSITIONS_DATA.filter((tr) => tr.isTrending || tr.category === "trending").length 
              : TRANSITIONS_DATA.filter((tr) => tr.category === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => { playSfx("click"); setSelectedCategory(cat.id); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 ${
                  isCatActive
                    ? "text-white shadow-md scale-[1.02]"
                    : "bg-secondary/70 text-muted-foreground hover:text-foreground border border-border/50"
                }`}
                style={isCatActive ? { backgroundColor: cat.color } : {}}
              >
                <span>{cat.icon}</span>
                <span>{en ? cat.labelEn : cat.labelAr}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isCatActive ? "bg-black/25 text-white" : "bg-background/80 text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

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

      </div>
    </div>
  );
};

export default TransitionPanel;
