import React from "react";

export type HandleVariant = "primary" | "amber" | "emerald" | "purple" | "cyan" | "pink" | "rose" | "white";

interface TimelineTrimHandleProps {
  side: "left" | "right";
  onPointerDown: (e: React.PointerEvent) => void;
  variant?: HandleVariant;
  isMaxReached?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<HandleVariant, { bg: string; glow: string; border: string }> = {
  primary: {
    bg: "from-blue-500 via-sky-500 to-indigo-600",
    glow: "shadow-[0_0_10px_rgba(59,130,246,0.6)]",
    border: "border-blue-300/60",
  },
  amber: {
    bg: "from-amber-400 via-amber-500 to-yellow-600",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.6)]",
    border: "border-amber-200/60",
  },
  emerald: {
    bg: "from-emerald-400 via-emerald-500 to-teal-600",
    glow: "shadow-[0_0_10px_rgba(16,185,129,0.6)]",
    border: "border-emerald-200/60",
  },
  purple: {
    bg: "from-purple-500 via-fuchsia-600 to-indigo-600",
    glow: "shadow-[0_0_10px_rgba(168,85,247,0.6)]",
    border: "border-purple-300/60",
  },
  cyan: {
    bg: "from-cyan-400 via-sky-500 to-blue-600",
    glow: "shadow-[0_0_10px_rgba(6,182,212,0.6)]",
    border: "border-cyan-200/60",
  },
  pink: {
    bg: "from-pink-500 via-rose-500 to-purple-600",
    glow: "shadow-[0_0_10px_rgba(236,72,153,0.6)]",
    border: "border-pink-300/60",
  },
  rose: {
    bg: "from-rose-500 via-pink-600 to-red-600",
    glow: "shadow-[0_0_10px_rgba(244,63,94,0.6)]",
    border: "border-rose-300/60",
  },
  white: {
    bg: "from-white via-slate-100 to-slate-200",
    glow: "shadow-md",
    border: "border-slate-300",
  },
};

export const TimelineTrimHandle: React.FC<TimelineTrimHandleProps> = ({
  side,
  onPointerDown,
  variant = "primary",
  isMaxReached = false,
  className = "",
}) => {
  const isLeft = side === "left";
  const isAbsolute = className.includes("absolute");
  const posClass = isAbsolute ? "" : "relative";
  const theme = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;

  return (
    <div
      data-no-scrub
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e);
      }}
      className={`${posClass} w-3.5 sm:w-4 h-full cursor-ew-resize z-30 flex flex-shrink-0 items-center justify-center touch-none select-none transition-all duration-150 group ${
        isMaxReached
          ? "bg-gradient-to-b from-red-500 to-rose-600 shadow-[0_0_12px_rgba(239,68,68,0.9)] text-white " + (isLeft ? "border-r border-red-300" : "border-l border-red-300")
          : `bg-gradient-to-b ${theme.bg} ${theme.glow} ` + (isLeft ? "border-r border-white/30" : "border-l border-white/30")
      } ${
        isLeft
          ? "rounded-l-[10px]"
          : "rounded-r-[10px]"
      } ${className}`}
      style={{ touchAction: "none" }}
      title={isMaxReached ? "وصلت إلى نهاية مدة الوسائط الأصلية (ممنوع التمديد أكثر)" : "اسحب للقص والتعديل"}
    >
      {/* Hit-target for smooth touch dragging with extended touch area */}
      <div
        data-no-scrub
        className="absolute inset-y-0 -inset-x-2.5 z-20 touch-none pointer-events-auto cursor-ew-resize"
        style={{ touchAction: "none" }}
        aria-hidden="true"
      />

      {/* Tactile Grip Bars — Crisp white dual notch */}
      <div className="flex flex-col items-center justify-center gap-0.5 pointer-events-none relative z-10">
        <div className="w-0.5 h-2.5 rounded-full bg-white shadow-xs" />
        <div className="w-0.5 h-2.5 rounded-full bg-white shadow-xs" />
      </div>

      {/* Active Touch / Press Highlight */}
      <div className="absolute inset-0 bg-white/20 opacity-0 group-active:opacity-100 transition-opacity rounded-[inherit] pointer-events-none z-10" />
    </div>
  );
};

export default TimelineTrimHandle;
