import React, { useRef, useCallback } from "react";

export interface CropBox {
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width: number; // percentage (0 - 100)
  height: number; // percentage (0 - 100)
}

interface PhotoCropOverlayProps {
  cropBox: CropBox;
  onChangeCropBox: (box: CropBox) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
  isCircle?: boolean;
}

export const PhotoCropOverlay: React.FC<PhotoCropOverlayProps> = ({
  cropBox,
  onChangeCropBox,
  containerRef,
  active,
  isCircle = false,
}) => {
  const dragStartRef = useRef<{
    handle: string;
    startX: number;
    startY: number;
    initialBox: CropBox;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragStartRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        initialBox: { ...cropBox },
      };
    },
    [cropBox]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;
      e.stopPropagation();

      const { handle, startX, startY, initialBox } = dragStartRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaX = ((e.clientX - startX) / rect.width) * 100;
      const deltaY = ((e.clientY - startY) / rect.height) * 100;

      let newX = initialBox.x;
      let newY = initialBox.y;
      let newW = initialBox.width;
      let newH = initialBox.height;

      const minSize = 10; // minimum 10%

      if (handle === "center") {
        newX = Math.max(0, Math.min(100 - initialBox.width, initialBox.x + deltaX));
        newY = Math.max(0, Math.min(100 - initialBox.height, initialBox.y + deltaY));
      } else {
        // Corner and Edge Handle Dragging
        if (handle.includes("w")) {
          const maxDeltaX = initialBox.width - minSize;
          const clampedDeltaX = Math.max(-initialBox.x, Math.min(maxDeltaX, deltaX));
          newX = initialBox.x + clampedDeltaX;
          newW = initialBox.width - clampedDeltaX;
        }
        if (handle.includes("e")) {
          const maxW = 100 - initialBox.x;
          newW = Math.max(minSize, Math.min(maxW, initialBox.width + deltaX));
        }
        if (handle.includes("n")) {
          const maxDeltaY = initialBox.height - minSize;
          const clampedDeltaY = Math.max(-initialBox.y, Math.min(maxDeltaY, deltaY));
          newY = initialBox.y + clampedDeltaY;
          newH = initialBox.height - clampedDeltaY;
        }
        if (handle.includes("s")) {
          const maxH = 100 - initialBox.y;
          newH = Math.max(minSize, Math.min(maxH, initialBox.height + deltaY));
        }
      }

      onChangeCropBox({
        x: Math.round(newX * 10) / 10,
        y: Math.round(newY * 10) / 10,
        width: Math.round(newW * 10) / 10,
        height: Math.round(newH * 10) / 10,
      });
    },
    [containerRef, onChangeCropBox]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  if (!active) return null;

  const { x, y, width, height } = cropBox;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-30">
      {/* Darkened semi-transparent overlay surrounding the crop area */}
      {/* Top mask */}
      <div
        className="absolute top-0 left-0 right-0 bg-black/65 backdrop-blur-[1px] transition-colors"
        style={{ height: `${y}%` }}
      />
      {/* Bottom mask */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-black/65 backdrop-blur-[1px] transition-colors"
        style={{ height: `${Math.max(0, 100 - y - height)}%` }}
      />
      {/* Left mask */}
      <div
        className="absolute bg-black/65 backdrop-blur-[1px] transition-colors"
        style={{
          top: `${y}%`,
          height: `${height}%`,
          left: 0,
          width: `${x}%`,
        }}
      />
      {/* Right mask */}
      <div
        className="absolute bg-black/65 backdrop-blur-[1px] transition-colors"
        style={{
          top: `${y}%`,
          height: `${height}%`,
          left: `${x + width}%`,
          right: 0,
        }}
      />

      {/* Interactive Crop Box Window */}
      <div
        className={`absolute pointer-events-auto cursor-move border-2 border-blue-400 shadow-[0_0_0_1px_rgba(255,255,255,0.4)] transition-shadow ${
          isCircle ? "rounded-full" : "rounded-none"
        }`}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
        onPointerDown={(e) => handlePointerDown(e, "center")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Rule-of-Thirds Grid Lines */}
        {!isCircle && (
          <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
            <div className="border-r border-b border-white/35" />
            <div className="border-r border-b border-white/35" />
            <div className="border-b border-white/35" />
            <div className="border-r border-b border-white/35" />
            <div className="border-r border-b border-white/35" />
            <div className="border-b border-white/35" />
            <div className="border-r border-white/35" />
            <div className="border-r border-white/35" />
            <div />
          </div>
        )}

        {/* Corner Grippers (L-shaped visual guides) */}
        {!isCircle && (
          <>
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-white pointer-events-none drop-shadow" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-white pointer-events-none drop-shadow" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-white pointer-events-none drop-shadow" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-white pointer-events-none drop-shadow" />
          </>
        )}

        {/* 8 Draggable Interactive Touch Handles */}
        {/* Corner NW */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "nw")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -top-3 -left-3 w-6 h-6 cursor-nwse-resize bg-blue-500 rounded-full border-2 border-white shadow-lg touch-none flex items-center justify-center hover:scale-125 transition-transform"
        />
        {/* Corner NE */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "ne")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -top-3 -right-3 w-6 h-6 cursor-nesw-resize bg-blue-500 rounded-full border-2 border-white shadow-lg touch-none flex items-center justify-center hover:scale-125 transition-transform"
        />
        {/* Corner SW */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "sw")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -bottom-3 -left-3 w-6 h-6 cursor-nesw-resize bg-blue-500 rounded-full border-2 border-white shadow-lg touch-none flex items-center justify-center hover:scale-125 transition-transform"
        />
        {/* Corner SE */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "se")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -bottom-3 -right-3 w-6 h-6 cursor-nwse-resize bg-blue-500 rounded-full border-2 border-white shadow-lg touch-none flex items-center justify-center hover:scale-125 transition-transform"
        />

        {/* Edge N */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "n")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-3.5 cursor-ns-resize bg-white/90 rounded-full border border-blue-500 shadow touch-none hover:scale-110 transition-transform"
        />
        {/* Edge S */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "s")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-3.5 cursor-ns-resize bg-white/90 rounded-full border border-blue-500 shadow touch-none hover:scale-110 transition-transform"
        />
        {/* Edge W */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "w")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute top-1/2 -translate-y-1/2 -left-2 w-3.5 h-8 cursor-ew-resize bg-white/90 rounded-full border border-blue-500 shadow touch-none hover:scale-110 transition-transform"
        />
        {/* Edge E */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "e")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute top-1/2 -translate-y-1/2 -right-2 w-3.5 h-8 cursor-ew-resize bg-white/90 rounded-full border border-blue-500 shadow touch-none hover:scale-110 transition-transform"
        />

        {/* Center Dimensions Badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-white text-[10px] font-mono font-bold pointer-events-none shadow border border-white/10">
          {Math.round(width)}% × {Math.round(height)}%
        </div>
      </div>
    </div>
  );
};
