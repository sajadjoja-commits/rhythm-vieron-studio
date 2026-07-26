import { useState, useRef, useEffect } from "react";
import { X, Check, RotateCcw, Maximize, RefreshCw, Scissors } from "lucide-react";
import { Clip, MediaItem } from "@/context/MediaContext";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface CropOverlayProps {
  open: boolean;
  onClose: () => void;
  clip: Clip | null;
  mediaItem: MediaItem | null;
  onApplyCrop: (crop: { x: number; y: number; w: number; h: number }) => void;
}

type DragType = "move" | "tl" | "tr" | "bl" | "br" | null;

export default function CropOverlay({ open, onClose, clip, mediaItem, onApplyCrop }: CropOverlayProps) {
  const isAr = getLang() === "ar";
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  // Crop values represent percentages (0 to 100)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [dragState, setDragState] = useState<{
    type: DragType;
    startX: number;
    startY: number;
    startCrop: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // Initialize crop from clip
  useEffect(() => {
    if (open && clip) {
      setCrop({
        x: clip.cropX ?? 0,
        y: clip.cropY ?? 0,
        w: clip.cropW ?? 100,
        h: clip.cropH ?? 100,
      });
    }
  }, [open, clip]);

  const handleStartDrag = (type: DragType, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setDragState({
      type,
      startX: clientX,
      startY: clientY,
      startCrop: { ...crop },
    });
    try { navigator.vibrate?.(5); } catch {}
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!dragState || !mediaRef.current) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const rect = mediaRef.current.getBoundingClientRect();
    const dx = ((clientX - dragState.startX) / rect.width) * 100;
    const dy = ((clientY - dragState.startY) / rect.height) * 100;

    let { x, y, w, h } = dragState.startCrop;

    if (dragState.type === "move") {
      x = Math.max(0, Math.min(100 - w, x + dx));
      y = Math.max(0, Math.min(100 - h, y + dy));
    } else if (dragState.type === "tl") {
      const newX = Math.max(0, Math.min(x + w - 10, x + dx));
      const newY = Math.max(0, Math.min(y + h - 10, y + dy));
      w = w + (x - newX);
      h = h + (y - newY);
      x = newX;
      y = newY;
    } else if (dragState.type === "tr") {
      w = Math.max(10, Math.min(100 - x, w + dx));
      const newY = Math.max(0, Math.min(y + h - 10, y + dy));
      h = h + (y - newY);
      y = newY;
    } else if (dragState.type === "bl") {
      const newX = Math.max(0, Math.min(x + w - 10, x + dx));
      w = w + (x - newX);
      x = newX;
      h = Math.max(10, Math.min(100 - y, h + dy));
    } else if (dragState.type === "br") {
      w = Math.max(10, Math.min(100 - x, w + dx));
      h = Math.max(10, Math.min(100 - y, h + dy));
    }

    setCrop({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
    });
  };

  const handleEndDrag = () => {
    setDragState(null);
  };

  // Set predefined crop ratio templates
  const applyRatioPreset = (ratioW: number, ratioH: number) => {
    playSfx("click");
    if (ratioW === 0) {
      // Freeform / Reset to 100%
      setCrop({ x: 0, y: 0, w: 100, h: 100 });
      return;
    }

    const currentRatio = ratioW / ratioH;
    let targetW = 100;
    let targetH = 100;

    // We assume the media aspect ratio is 16:9 for percentage cropping
    // But to be completely general: let's adjust percentages
    if (currentRatio > 1) {
      targetH = 100 / currentRatio;
    } else {
      targetW = 100 * currentRatio;
    }

    // Centering the box
    const x = Math.max(0, (100 - targetW) / 2);
    const y = Math.max(0, (100 - targetH) / 2);

    setCrop({
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(targetW),
      h: Math.round(targetH),
    });
  };

  // Setup drag event listeners
  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleEndDrag);
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("touchend", handleEndDrag);
    }
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleEndDrag);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleEndDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState]);

  const onDone = () => {
    playSfx("success");
    onApplyCrop(crop);
    onClose();
  };

  if (!open || !clip || !mediaItem) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col overflow-hidden text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-neutral-800 shrink-0 bg-neutral-900/50 backdrop-blur-md">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center active:scale-95 transition-all"
        >
          <X className="w-5 h-5 text-neutral-300" />
        </button>
        <span className="text-sm font-heading font-extrabold flex items-center gap-2">
          <Scissors className="w-4 h-4 text-primary animate-pulse" />
          {isAr ? "قص وقطع أبعاد الوسائط" : "Crop Media Dimensions"}
        </span>
        <button
          onClick={onDone}
          className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
        >
          <Check className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Workspace */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative flex items-center justify-center p-6 bg-radial-dark"
      >
        <div
          ref={mediaRef}
          className="relative max-w-full max-h-full aspect-video bg-neutral-900 rounded-lg overflow-hidden shadow-2xl border border-white/5"
          style={{
            width: "min(100%, 500px)",
            aspectRatio: "16/9",
          }}
        >
          {/* Real Clip Preview */}
          {mediaItem.type === "video" ? (
            <video
              src={mediaItem.url}
              className="w-full h-full object-cover pointer-events-none opacity-85"
              muted
              playsInline
              loop
              autoPlay
              poster="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>"
            />
          ) : (
            <img
              src={mediaItem.url}
              alt=""
              className="w-full h-full object-cover pointer-events-none opacity-85"
            />
          )}

          {/* Shading Overlays outside crop frame */}
          {/* Top Shading */}
          <div
            className="absolute inset-x-0 top-0 bg-black/75 pointer-events-none border-b border-white/10"
            style={{ height: `${crop.y}%` }}
          />
          {/* Bottom Shading */}
          <div
            className="absolute inset-x-0 bottom-0 bg-black/75 pointer-events-none border-t border-white/10"
            style={{ top: `${crop.y + crop.h}%`, height: `${100 - crop.y - crop.h}%` }}
          />
          {/* Left Shading */}
          <div
            className="absolute left-0 bg-black/75 pointer-events-none border-r border-white/10"
            style={{
              top: `${crop.y}%`,
              height: `${crop.h}%`,
              width: `${crop.x}%`,
            }}
          />
          {/* Right Shading */}
          <div
            className="absolute right-0 bg-black/75 pointer-events-none border-l border-white/10"
            style={{
              top: `${crop.y}%`,
              height: `${crop.h}%`,
              left: `${crop.x + crop.w}%`,
              width: `${100 - crop.x - crop.w}%`,
            }}
          />

          {/* Draggable Crop Frame Container */}
          <div
            onMouseDown={(e) => handleStartDrag("move", e)}
            onTouchStart={(e) => handleStartDrag("move", e)}
            className="absolute cursor-move border-2 border-emerald-400 shadow-xl group"
            style={{
              top: `${crop.y}%`,
              left: `${crop.x}%`,
              width: `${crop.w}%`,
              height: `${crop.h}%`,
              boxShadow: "0 0 24px rgba(16,185,129,0.3)",
            }}
          >
            {/* 3x3 Grid Overlay */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-white/20" />
              <div className="border-r border-white/20" />
              <div />
            </div>

            {/* Corner Drag Handles */}
            {/* Top Left */}
            <div
              onMouseDown={(e) => handleStartDrag("tl", e)}
              onTouchStart={(e) => handleStartDrag("tl", e)}
              className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white border-2 border-emerald-500 rounded-sm cursor-nwse-resize z-10 active:scale-125 transition-transform"
            />
            {/* Top Right */}
            <div
              onMouseDown={(e) => handleStartDrag("tr", e)}
              onTouchStart={(e) => handleStartDrag("tr", e)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-emerald-500 rounded-sm cursor-nesw-resize z-10 active:scale-125 transition-transform"
            />
            {/* Bottom Left */}
            <div
              onMouseDown={(e) => handleStartDrag("bl", e)}
              onTouchStart={(e) => handleStartDrag("bl", e)}
              className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white border-2 border-emerald-500 rounded-sm cursor-nesw-resize z-10 active:scale-125 transition-transform"
            />
            {/* Bottom Right */}
            <div
              onMouseDown={(e) => handleStartDrag("br", e)}
              onTouchStart={(e) => handleStartDrag("br", e)}
              className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-emerald-500 rounded-sm cursor-nwse-resize z-10 active:scale-125 transition-transform"
            />
          </div>
        </div>
      </div>

      {/* Control Console (Aspect ratio templates & tools) */}
      <div className="p-4 bg-neutral-900 border-t border-neutral-800 shrink-0 space-y-4">
        {/* Aspect Ratio Presets */}
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase mb-2 tracking-wider text-center">
            {isAr ? "نسب الاقتصاص الجاهزة" : "Crop Ratio Presets"}
          </p>
          <div className="flex justify-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {[
              { label: "Free", labelAr: "حر", w: 0, h: 0 },
              { label: "1:1", labelAr: "1:1 مربع", w: 1, h: 1 },
              { label: "16:9", labelAr: "16:9 عريض", w: 16, h: 9 },
              { label: "9:16", labelAr: "9:16 طولي", w: 9, h: 16 },
              { label: "4:3", labelAr: "4:3 شاشة", w: 4, h: 3 },
              { label: "2:3", labelAr: "2:3 بورتريه", w: 2, h: 3 },
            ].map((p, i) => (
              <button
                key={i}
                onClick={() => applyRatioPreset(p.w, p.h)}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-[10px] font-bold text-neutral-200 shrink-0 border border-neutral-700/50 transition-all"
              >
                {isAr ? p.labelAr : p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-800/60">
          <button
            onClick={() => {
              playSfx("click");
              setCrop({ x: 0, y: 0, w: 100, h: 100 });
              toast.success(isAr ? "تمت إعادة تعيين إطار القص" : "Reset crop frame successfully");
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-[10px] font-extrabold text-neutral-300 transition-all active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5 text-primary" />
            <span>{isAr ? "إعادة تعيين" : "Reset Crop"}</span>
          </button>

          <span className="text-[10px] font-mono text-neutral-500 font-bold">
            X: {Math.round(crop.x)}% · Y: {Math.round(crop.y)}% · W: {Math.round(crop.w)}% · H: {Math.round(crop.h)}%
          </span>

          <button
            onClick={onDone}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl gradient-primary text-primary-foreground text-[10px] font-extrabold transition-all active:scale-95 shadow-md"
          >
            <Check className="w-3.5 h-3.5 text-primary-foreground" />
            <span>{isAr ? "موافق (صح)" : "Apply Crop"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
