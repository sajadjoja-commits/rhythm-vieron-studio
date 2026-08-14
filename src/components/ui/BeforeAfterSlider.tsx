import React, { useState, useRef, useCallback, useEffect } from "react";
import { SlidersHorizontal } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  aspectRatio?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeImage,
  afterImage,
  beforeLabel = "قبل / Before",
  afterLabel = "بعد / After",
  className = "",
  aspectRatio = "16/9",
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    },
    [isDragging, handleMove]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handlePointerUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handlePointerUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [isDragging, handleMouseMove, handlePointerUp, handleTouchMove]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl select-none group touch-none border border-border/60 shadow-xl bg-black ${className}`}
      style={{ aspectRatio }}
      onMouseDown={(e) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      {/* After Image (Background layer) */}
      <img
        src={afterImage}
        alt="After"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-500/80 backdrop-blur-md text-[10px] font-bold text-white shadow-lg z-10 pointer-events-none">
        {afterLabel}
      </div>

      {/* Before Image (Clipped overlay) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeImage}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover max-w-none"
          style={{ width: containerRef.current?.clientWidth || "100%" }}
          draggable={false}
        />
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white/90 border border-white/10 shadow-lg z-10 pointer-events-none">
          {beforeLabel}
        </div>
      </div>

      {/* Divider Bar & Handle */}
      <div
        className="absolute top-0 bottom-0 z-20 flex items-center justify-center pointer-events-none"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="w-0.5 h-full bg-gradient-to-b from-blue-400 via-primary to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
        <div className="absolute w-8 h-8 rounded-full bg-white text-gray-900 border-2 border-primary shadow-2xl flex items-center justify-center transform -translate-x-1/2 group-hover:scale-110 active:scale-95 transition-transform">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
        </div>
      </div>
    </div>
  );
};

export default BeforeAfterSlider;
