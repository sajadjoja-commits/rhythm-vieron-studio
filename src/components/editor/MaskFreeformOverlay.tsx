import { useRef, useState, useEffect, useCallback } from "react";
import { PenTool, RotateCcw, Check, X } from "lucide-react";
import { pointsToSvgPath } from "@/lib/maskShapes";
import type { MaskConfig } from "@/lib/maskEngine";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

interface MaskFreeformOverlayProps {
  active: boolean;
  initialPoints?: Array<{ x: number; y: number }>;
  onApplyFreeform: (patch: Partial<MaskConfig>) => void;
  onClose: () => void;
}

export const MaskFreeformOverlay = ({
  active,
  initialPoints,
  onApplyFreeform,
  onClose,
}: MaskFreeformOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>(initialPoints || []);
  const [isDrawing, setIsDrawing] = useState(false);
  const en = getLang() === "en";

  useEffect(() => {
    if (active && initialPoints && initialPoints.length >= 3) {
      setPoints(initialPoints);
    }
  }, [active, initialPoints]);

  const drawCanvas = useCallback(
    (pts: Array<{ x: number; y: number }>, drawingNow: boolean) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(rect.width * dpr) || cv.height !== Math.round(rect.height * dpr)) {
        cv.width = Math.round(rect.width * dpr);
        cv.height = Math.round(rect.height * dpr);
      }

      const ctx = cv.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Subtle dark scrim when drawing
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (pts.length > 0) {
        // If closed (>2 points), punch out the inside slightly so user sees their masked area clearly
        if (pts.length >= 3) {
          ctx.save();
          ctx.beginPath();
          pts.forEach((p, idx) => {
            const px = (p.x / 100) * rect.width;
            const py = (p.y / 100) * rect.height;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fillStyle = "rgba(6, 182, 212, 0.18)";
          ctx.fill();
          ctx.restore();
        }

        // Main stroke path
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const px = (p.x / 100) * rect.width;
          const py = (p.y / 100) * rect.height;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (!drawingNow && pts.length >= 3) {
          ctx.closePath();
        }
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(34, 211, 238, 0.8)";
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Dashed closing line while actively dragging
        if (drawingNow && pts.length >= 3) {
          const first = pts[0];
          const last = pts[pts.length - 1];
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 5]);
          ctx.moveTo((last.x / 100) * rect.width, (last.y / 100) * rect.height);
          ctx.lineTo((first.x / 100) * rect.width, (first.y / 100) * rect.height);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        // Start point indicator dot
        const startPt = pts[0];
        ctx.beginPath();
        ctx.arc(
          (startPt.x / 100) * rect.width,
          (startPt.y / 100) * rect.height,
          5,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    },
    []
  );

  useEffect(() => {
    if (active) {
      drawCanvas(points, isDrawing);
    }
  }, [active, points, isDrawing, drawCanvas]);

  if (!active) return null;

  const getRelativePoint = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    setIsDrawing(true);
    setPoints([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    setPoints((prev) => {
      if (prev.length === 0) return [pt];
      const last = prev[prev.length - 1];
      const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
      if (dist < 1.2) return prev; // Decimate dense points for smooth SVG path
      return [...prev, pt];
    });
  };

  const commitPoints = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length < 3) {
      toast.error(
        en
          ? "Please draw a larger shape with your finger"
          : "يرجى رسم مسار أوسع بإصبعك لتشكيل القناع"
      );
      return;
    }
    const svgPath = pointsToSvgPath(pts, true);
    onApplyFreeform({
      maskShape: "custom-path",
      customPoints: pts,
      maskPath: svgPath,
      maskX: 50,
      maskY: 50,
      maskSize: 100,
      maskWidth: 100,
      maskHeight: 100,
    });
    playSfx("success");
    toast.success(
      en ? "Custom freeform mask applied!" : "تم تطبيق القناع المرسوم بنجاح!"
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDrawing(false);
    if (points.length >= 3) {
      commitPoints(points);
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 select-none"
      style={{ touchAction: "none" }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full cursor-crosshair"
        style={{ touchAction: "none" }}
      />

      {/* Top instruction & action bar */}
      <div
        className="absolute top-2 inset-x-2 flex items-center justify-between gap-2 bg-slate-950/90 backdrop-blur-md border border-cyan-400/50 rounded-2xl px-3 py-1.5 shadow-xl"
        dir="rtl"
      >
        <div className="flex items-center gap-1.5 text-cyan-300 text-[11px] font-bold">
          <PenTool className="w-3.5 h-3.5 shrink-0 animate-pulse" />
          <span>
            {en
              ? "Draw custom mask shape with your finger"
              : "ارسم شكل القناع الحر بإصبعك على المعاينة"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {points.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playSfx("click");
                setPoints([]);
              }}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{en ? "Clear" : "مسح"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playSfx("click");
              onClose();
            }}
            className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-extrabold flex items-center gap-1 shadow"
          >
            <Check className="w-3 h-3 stroke-[3]" />
            <span>{en ? "Done" : "تم"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaskFreeformOverlay;
