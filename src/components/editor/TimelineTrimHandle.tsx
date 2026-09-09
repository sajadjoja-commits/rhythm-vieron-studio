import React from "react";

export type HandleVariant = "primary" | "amber" | "emerald" | "purple" | "cyan" | "pink" | "rose";

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
    glow: "shadow-[0_0_8px_rgba(59,130,246,0.5)]",
    border: "border-blue-300/40",
  },
  amber: {
    bg: "from-amber-400 via-amber-500 to-yellow-600",
    glow: "shadow-[0_0_8px_rgba(245,158,11,0.5)]",
    border: "border-amber-200/50",
  },
  emerald: {
    bg: "from-emerald-400 via-emerald-500 to-teal-600",
    glow: "shadow-[0_0_8px_rgba(160,185,129,0.5)]",
    border: "border-emerald-200/50",
  },
  purple: {
    bg: "from-purple-500 via-fuchsia-600 to-indigo-600",
    glow: "shadow-[0_0_8px_rgba(168,85,247,0.5)]",
    border: "border-purple-300/50",
  },
  cyan: {
    bg: "from-cyan-400 via-sky-500 to-blue-600",
    glow: "shadow-[0_0_8px_rgba(6,182,212,0.5)]",
    border: "border-cyan-200/50",
  },
  pink: {
    bg: "from-pink-500 via-rose-500 to-purple-600",
    glow: "shadow-[0_0_8px_rgba(236,72,153,0.5)]",
    border: "border-pink-300/50",
  },
  rose: {
    bg: "from-rose-500 via-pink-600 to-red-600",
    glow: "shadow-[0_0_8px_rgba(244,63,94,0.5)]",
    border: "border-rose-300/50",
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
  const theme = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;

  const isAbsolute = className.includes("absolute");
  const posClass = isAbsolute ? "" : "relative";

  return (
    <div
      data-no-scrub
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e);
      }}
      className={`${posClass} w-4 h-full cursor-ew-resize z-30 flex flex-shrink-0 items-center justify-center touch-none select-none transition-all duration-150 group ${
        isMaxReached
          ? "bg-gradient-to-b from-red-500 to-rose-700 shadow-[0_0_12px_rgba(239,68,68,0.9)] border-red-300 ring-2 ring-red-400"
          : `bg-gradient-to-b ${theme.bg} ${theme.glow} ${theme.border}`
      } ${
        isLeft ? "rounded-l-[inherit] border-r border-black/40" : "rounded-r-[inherit] border-l border-black/40"
      } ${className}`}
      style={{ touchAction: "none" }}
      title={isMaxReached ? "وصلت إلى نهاية مدة الفيديو الأصلي (ممنوع التمديد أكثر)" : "اسحب للقص والتعديل"}
    >
      {/* Expanded invisible touch hit-target (min 32px) for effortless mobile grabbing without false scrubbing */}
      <div
        data-no-scrub
        className={`absolute inset-y-0 ${
          isLeft ? "-left-3 -right-2" : "-left-2 -right-3"
        } w-8 z-20 touch-none pointer-events-auto cursor-ew-resize`}
        style={{ touchAction: "none" }}
        aria-hidden="true"
      />

      {/* Tactile Grip Bars */}
      <div className="flex flex-col items-center justify-center gap-0.5 pointer-events-none relative z-10">
        <div className={`w-0.5 h-2 rounded-full opacity-90 ${isMaxReached ? "bg-white" : "bg-white/90"}`} />
        <div className={`w-0.5 h-2 rounded-full opacity-90 ${isMaxReached ? "bg-white" : "bg-white/90"}`} />
      </div>

      {/* Active Touch Highlight */}
      <div className="absolute inset-0 bg-white/20 opacity-0 group-active:opacity-100 transition-opacity rounded-[inherit] pointer-events-none z-10" />
    </div>
  );
};

export default TimelineTrimHandle;
