import React from "react";

interface TimelineTrimHandleProps {
  side: "left" | "right";
  onPointerDown: (e: React.PointerEvent) => void;
  className?: string;
}

export const TimelineTrimHandle: React.FC<TimelineTrimHandleProps> = ({
  side,
  onPointerDown,
  className = "",
}) => {
  const isLeft = side === "left";
  return (
    <div
      data-no-scrub
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e);
      }}
      className={`w-3.5 h-full ${
        isLeft
          ? "bg-gradient-to-r from-primary to-primary/40 rounded-l"
          : "bg-gradient-to-l from-primary to-primary/40 rounded-r"
      } cursor-ew-resize z-20 flex flex-shrink-0 items-center justify-center touch-none select-none active:brightness-125 transition-all shadow-md ${className}`}
      style={{ touchAction: "none" }}
    >
      <div className="flex flex-col gap-0.5 pointer-events-none">
        <div className="w-0.5 h-1.5 bg-primary-foreground rounded-full opacity-90" />
        <div className="w-0.5 h-1.5 bg-primary-foreground rounded-full opacity-90" />
        <div className="w-0.5 h-1.5 bg-primary-foreground rounded-full opacity-90" />
      </div>
    </div>
  );
};

export default TimelineTrimHandle;
