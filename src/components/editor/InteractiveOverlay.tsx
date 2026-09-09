import { useRef, memo, useCallback, useState } from "react";
import { OverlayItem } from "@/context/MediaContext";
import { RotateCw, Maximize2, Move } from "lucide-react";
import { snapPreviewTransform } from "@/lib/timelineSnap";

interface Props {
  overlay: OverlayItem;
  selected: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<OverlayItem>) => void;
}

const InteractiveOverlay = memo(({ overlay, selected, containerRef, onSelect, onUpdate }: Props) => {
  const gestureRef = useRef<{
    mode: "drag" | "scale" | "rotate" | null;
    startX: number;
    startY: number;
    startScale: number;
    startRotation: number;
    startXPercent: number;
    startYPercent: number;
    startDist: number;
    startAngle: number;
  } | null>(null);

  const [showHandles, setShowHandles] = useState(false);

  const getDistance = (touches: React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const getAngle = (touches: React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    onSelect(overlay.id);
    setShowHandles(true);

    const container = containerRef.current;
    if (!container) return;

    if (e.touches.length === 1) {
      // Single finger: drag
      const touch = e.touches[0];
      gestureRef.current = {
        mode: "drag",
        startX: touch.clientX,
        startY: touch.clientY,
        startScale: overlay.scale,
        startRotation: overlay.rotation ?? 0,
        startXPercent: overlay.x,
        startYPercent: overlay.y,
        startDist: 0,
        startAngle: 0,
      };
    } else if (e.touches.length === 2) {
      // Two fingers: scale and/or rotate
      const dist = getDistance(e.touches);
      const angle = getAngle(e.touches);
      gestureRef.current = {
        mode: "scale",
        startX: 0,
        startY: 0,
        startScale: overlay.scale,
        startRotation: overlay.rotation ?? 0,
        startXPercent: overlay.x,
        startYPercent: overlay.y,
        startDist: dist,
        startAngle: angle,
      };
    }
  }, [overlay, containerRef, onSelect]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const gesture = gestureRef.current;
    const container = containerRef.current;
    if (!gesture || !container) return;

    const rect = container.getBoundingClientRect();

    if (gesture.mode === "drag" && e.touches.length === 1) {
      // Drag: move the overlay
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;
      const rawX = Math.max(5, Math.min(95, gesture.startXPercent + (dx / rect.width) * 100));
      const rawY = Math.max(5, Math.min(95, gesture.startYPercent + (dy / rect.height) * 100));
      const snapped = snapPreviewTransform({ x: rawX, y: rawY, rotation: overlay.rotation });
      onUpdate(overlay.id, {
        x: snapped.x,
        y: snapped.y,
        rotation: snapped.rotation,
      });
    } else if (e.touches.length === 2) {
      // Scale and rotate with two fingers
      const dist = getDistance(e.touches);
      const angle = getAngle(e.touches);

      // Scale
      const scaleDelta = dist / gesture.startDist;
      const rawScale = Math.max(0.1, Math.min(3, gesture.startScale * scaleDelta));

      // Rotation
      const angleDelta = angle - gesture.startAngle;
      const rawRotation = gesture.startRotation + angleDelta;

      const snapped = snapPreviewTransform({
        x: overlay.x,
        y: overlay.y,
        rotation: rawRotation,
        scale: rawScale,
      });

      onUpdate(overlay.id, {
        scale: snapped.scale ?? rawScale,
        rotation: snapped.rotation ?? rawRotation,
      });
    }
  }, [overlay, containerRef, onUpdate]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    gestureRef.current = null;
    setTimeout(() => setShowHandles(false), 2000);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(overlay.id);
    setShowHandles(true);

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    gestureRef.current = {
      mode: "drag",
      startX: e.clientX,
      startY: e.clientY,
      startScale: overlay.scale,
      startRotation: overlay.rotation ?? 0,
      startXPercent: overlay.x,
      startYPercent: overlay.y,
      startDist: 0,
      startAngle: 0,
    };

    const moveHandler = (ev: MouseEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;

      const dx = ev.clientX - gesture.startX;
      const dy = ev.clientY - gesture.startY;
      const rawX = Math.max(5, Math.min(95, gesture.startXPercent + (dx / rect.width) * 100));
      const rawY = Math.max(5, Math.min(95, gesture.startYPercent + (dy / rect.height) * 100));
      const snapped = snapPreviewTransform({ x: rawX, y: rawY, rotation: overlay.rotation });
      onUpdate(overlay.id, {
        x: snapped.x,
        y: snapped.y,
        rotation: snapped.rotation,
      });
    };

    const upHandler = () => {
      gestureRef.current = null;
      window.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseup", upHandler);
      setTimeout(() => setShowHandles(false), 2000);
    };

    window.addEventListener("mousemove", moveHandler);
    window.addEventListener("mouseup", upHandler);
  }, [overlay, containerRef, onSelect, onUpdate]);

  // Mouse wheel for scaling
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.1, Math.min(3, overlay.scale + delta));
    onUpdate(overlay.id, { scale: newScale });
  }, [overlay, onUpdate]);

  return (
    <div
      className={`absolute z-10 transition-shadow ${selected ? "" : ""}`}
      style={{
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        transform: `translate(-50%, -50%) scale(${overlay.scale}) rotate(${overlay.rotation ?? 0}deg)`,
        opacity: overlay.opacity ?? 1,
        mixBlendMode: (overlay.blend as any) ?? "normal",
        filter: `brightness(${overlay.brightness ?? 1})`,
        touchAction: "none",
        cursor: "grab",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      data-interactive-overlay={overlay.id}
    >
      {/* Content */}
      {overlay.type === "image" ? (
        <img
          src={overlay.url}
          alt=""
          className="max-w-[200px] max-h-[200px] rounded pointer-events-none"
          draggable={false}
        />
      ) : (
        <video
          src={overlay.url}
          className="max-w-[200px] max-h-[200px] rounded pointer-events-none"
          autoPlay
          muted
          loop
          playsInline
        />
      )}

      {/* Selection handles */}
      {selected && (
        <>
          {/* Border frame */}
          <div className="absolute inset-0 border-2 border-primary rounded pointer-events-none" />

          {/* Corner handles for visual feedback */}
          <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg pointer-events-none" />
          <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg pointer-events-none" />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg pointer-events-none" />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg pointer-events-none" />

          {/* Rotate indicator */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-primary/90 px-2 py-0.5 rounded-full shadow-lg pointer-events-none">
            <RotateCw className="w-3 h-3 text-white" />
            <span className="text-[9px] text-white font-bold">{Math.round(overlay.rotation ?? 0)}°</span>
          </div>

          {/* Scale indicator */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-primary/90 px-2 py-0.5 rounded-full shadow-lg pointer-events-none">
            <Maximize2 className="w-3 h-3 text-white" />
            <span className="text-[9px] text-white font-bold">{Math.round(overlay.scale * 100)}%</span>
          </div>
        </>
      )}
    </div>
  );
});

InteractiveOverlay.displayName = "InteractiveOverlay";
export default InteractiveOverlay;
