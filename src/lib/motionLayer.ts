import type { OverlayItem } from "@/context/MediaContext";
import { drawMotionGraphic, motionBaseSize } from "./motionGraphics";
import { applyMaskToContext, getEffectiveMask, hasMask } from "./maskEngine";

/** Draw in local layer coordinates; positioning/compositing belong to the caller. */
export function drawMotionLayer(
  ctx: CanvasRenderingContext2D,
  overlay: OverlayItem,
  timelineTime: number,
  width: number,
  height: number,
) {
  if (!overlay.motion || timelineTime < overlay.start || timelineTime >= overlay.end) return;
  const localTime = timelineTime - overlay.start;
  const draw = (target: CanvasRenderingContext2D) => {
    if (overlay.motion) drawMotionGraphic(target, overlay.motion, localTime, overlay.end - overlay.start, width, height);
  };
  ctx.save();
  try {
    if (hasMask(overlay)) {
      const base = motionBaseSize(overlay.motion);
      const feather = (getEffectiveMask(overlay)?.maskFeather ?? 0) * width / base.w;
      applyMaskToContext(ctx, overlay, localTime, width, height, feather, overlay.keyframes, draw);
    } else draw(ctx);
  } finally { ctx.restore(); }
}