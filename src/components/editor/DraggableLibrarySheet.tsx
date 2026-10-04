import React, { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { playSfx } from "@/lib/soundFx";

export interface DraggableLibrarySheetProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  dir?: "rtl" | "ltr";
  icon?: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  headerActions?: React.ReactNode;
  subHeader?: React.ReactNode;
  defaultVh?: number;
  minVh?: number;
  maxVh?: number;
  children: React.ReactNode;
  bodyClassName?: string;
}

const SNAP_POINTS = [24, 52, 86];

export default function DraggableLibrarySheet({
  id,
  open,
  onClose,
  dir = "rtl",
  icon,
  title,
  badge,
  headerActions,
  subHeader,
  defaultVh = 52,
  minVh = 18,
  maxVh = 90,
  children,
  bodyClassName = "flex-1 min-h-0 overflow-y-auto no-scrollbar p-3.5 space-y-3",
}: DraggableLibrarySheetProps) {
  const [heightVh, setHeightVh] = useState<number>(defaultVh);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    startY: number;
    startVh: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setHeightVh(defaultVh);
    }
  }, [open, defaultVh]);

  const startResizeDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, allowTapCycle: boolean) => {
      // Do not start drag if user clicked on an interactive button or input inside the header
      const target = e.target as HTMLElement;
      if (target.closest("button, input, select, a")) return;

      e.stopPropagation();
      e.preventDefault();
      const startY = e.clientY;
      const startVh = heightVh;
      dragStateRef.current = { startY, startVh, moved: false };
      setIsDragging(true);

      const onPointerMove = (ev: PointerEvent) => {
        if (!dragStateRef.current) return;
        const dy = dragStateRef.current.startY - ev.clientY;
        if (Math.abs(dy) > 4) {
          dragStateRef.current.moved = true;
        }
        const viewportH = window.innerHeight || 800;
        const deltaVh = (dy / viewportH) * 100;
        const nextVh = dragStateRef.current.startVh + deltaVh;
        setHeightVh(Math.max(10, Math.min(maxVh, nextVh)));
      };

      const onPointerUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        setIsDragging(false);

        const state = dragStateRef.current;
        dragStateRef.current = null;
        if (!state) return;

        const dy = state.startY - ev.clientY;
        const viewportH = window.innerHeight || 800;
        const finalVh = state.startVh + (dy / viewportH) * 100;

        if (!state.moved) {
          if (allowTapCycle) {
            // Quick tap on the horizontal bar cycles smoothly: Half (52%) -> Full (86%) -> Compact (24%)
            playSfx("click");
            const currentIdx = SNAP_POINTS.reduce(
              (bestIdx, pt, idx) =>
                Math.abs(pt - state.startVh) < Math.abs(SNAP_POINTS[bestIdx] - state.startVh)
                  ? idx
                  : bestIdx,
              1
            );
            const nextIdx = (currentIdx + 1) % SNAP_POINTS.length;
            setHeightVh(SNAP_POINTS[nextIdx]);
          }
          return;
        }

        // If dragged all the way down near bottom edge, close the library
        if (finalVh < 13) {
          playSfx("click");
          onClose();
          return;
        }

        // Keep exact dragged height between minVh (less than half) and maxVh (covers preview)
        setHeightVh(Math.max(minVh, Math.min(maxVh, Math.round(finalVh))));
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [heightVh, maxVh, minVh, onClose]
  );

  if (!open) return null;

  return (
    <div
      id={id}
      className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-3 duration-200"
      dir={dir}
    >
      <div
        style={{ height: `${heightVh}dvh` }}
        className={`bg-card/98 backdrop-blur-2xl border-t border-border/80 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden pb-2 ${
          isDragging ? "transition-none" : "transition-[height] duration-200 ease-out"
        }`}
      >
        {/* Unified Sleek Top Header + Horizontal Drag Bar (الشرطة الأفقية للتحكم بارتفاع المكتبة) */}
        <div
          onPointerDown={(e) => startResizeDrag(e, false)}
          className="relative flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40 shrink-0 select-none touch-none cursor-ns-resize"
        >
          {/* Centered Interactive Horizontal Bar (الشرطة الأفقية) */}
          <div
            onPointerDown={(e) => startResizeDrag(e, true)}
            className="absolute inset-x-0 top-0 h-5 flex items-center justify-center cursor-ns-resize touch-none group"
            title="اسحب لأعلى أو لأسفل للتحكم في ارتفاع المكتبة أو اضغط للتبديل"
          >
            <div
              className={`h-1.5 rounded-full transition-all duration-150 ${
                isDragging
                  ? "w-16 bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.75)]"
                  : "w-11 bg-foreground/30 group-hover:bg-primary/75 group-hover:w-14"
              }`}
            />
          </div>

          {/* Title & Icon */}
          <div className="flex items-center gap-2 min-w-0 pt-0.5">
            {icon && (
              <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center shadow-xs shrink-0">
                {icon}
              </div>
            )}
            <span className="font-heading font-bold text-xs sm:text-sm text-foreground truncate">
              {title}
            </span>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>

          {/* Actions & Close Button (No Eye Button) */}
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {headerActions}
            <button
              type="button"
              onClick={() => {
                playSfx("click");
                onClose();
              }}
              className="w-7 h-7 rounded-lg bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-90"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Optional Fixed Sub-Header (Tabs / Search) */}
        {subHeader && (
          <div className="px-3.5 pt-2 pb-1.5 border-b border-border/40 shrink-0 bg-background/30">
            {subHeader}
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
