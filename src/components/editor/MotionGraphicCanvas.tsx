import { useEffect, useRef } from "react";
import type { OverlayItem } from "@/context/MediaContext";
import { motionBaseSize } from "@/lib/motionGraphics";
import { drawMotionLayer } from "@/lib/motionLayer";

export default function MotionGraphicCanvas({ overlay, currentTime }: { overlay: OverlayItem; currentTime: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = motionBaseSize(overlay.motion);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * ratio);
    canvas.height = Math.round(size.h * ratio);
    ctx.scale(ratio, ratio);
    drawMotionLayer(ctx, overlay, currentTime, size.w, size.h);
  }, [overlay, currentTime, size.w, size.h]);
  return <canvas ref={ref} width={size.w} height={size.h} style={{ width: size.w, height: size.h }} className="pointer-events-none" aria-label={overlay.name || "Motion graphic"} data-motion-canvas={overlay.motion?.preset} />;
}