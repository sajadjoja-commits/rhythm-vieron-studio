import { useRef, useState, memo } from "react";
import { useMedia, FilterItem } from "@/context/MediaContext";
import { packLanes } from "@/lib/lanes";
import { Palette, Trash2, Plus } from "lucide-react";
import { t, getLang } from "@/lib/i18n";
import TimelineTrimHandle from "./TimelineTrimHandle";
import { snapTimelineTime } from "@/lib/timelineSnap";

interface Props {
  currentTime: number;
  pxPerSec: number;
  containerW: number;
  isPlaying?: boolean;
  focused?: boolean;
  onSeek?: (t: number) => void;
  onAddClick?: () => void;
  onFocus?: () => void;
}

const FilterTimeline = memo(({ currentTime, pxPerSec, containerW, isPlaying, focused, onSeek, onAddClick, onFocus }: Props) => {
  const { filters, updateFilter, removeFilter, totalDuration } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<any>(null);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Auto-scrolling state & handlers
  const scrollIntervalRef = useRef<number | null>(null);
  const lastPointerXRef = useRef<number>(0);

  const startAutoScroll = (onScrollTick: (deltaSec: number, speed: number) => void) => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    let lastTime = performance.now();

    scrollIntervalRef.current = window.setInterval(() => {
      const pointerX = lastPointerXRef.current;
      const screenW = window.innerWidth;

      let speed = 0;
      if (pointerX < 50) {
        const factor = (50 - Math.max(0, pointerX)) / 50;
        speed = -4 * factor;
      } else if (pointerX > screenW - 50) {
        const factor = (50 - Math.max(0, screenW - pointerX)) / 50;
        speed = 4 * factor;
      }

      if (speed !== 0 && onSeek) {
        const now = performance.now();
        const deltaSec = (now - lastTime) / 1000;
        lastTime = now;

        const nextTime = Math.max(0, Math.min(totalDuration, currentTimeRef.current + speed * deltaSec));
        if (nextTime !== currentTimeRef.current) {
          onSeek(nextTime);
          onScrollTick(deltaSec, speed);
        }
      } else {
        lastTime = performance.now();
      }
    }, 16);
  };

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const halfW = containerW / 2;
  const totalPx = Math.max(totalDuration, 0.001) * pxPerSec;
  const translateX = halfW - currentTime * pxPerSec;

  if (!filters.length) return null;

  const onDown = (e: React.PointerEvent, f: FilterItem, mode: "move" | "left" | "right") => {
    e.stopPropagation();
    onFocus?.();
    let startXAdjusted = e.clientX;
    lastPointerXRef.current = e.clientX;
    dragRef.current = { id: f.id, mode, startX: e.clientX, origStart: f.start, origEnd: f.end };
    let moved = false;

    const snapTargets = [0, currentTime, totalDuration, ...filters.filter((x) => x.id !== f.id).flatMap((x) => [x.start, x.end])];

    const updateAction = (currentX: number) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (currentX - startXAdjusted) / pxPerSec;
      let s = d.origStart, en = d.origEnd;
      if (d.mode === "move") {
        const len = d.origEnd - d.origStart;
        const rawStart = Math.max(0, Math.min(totalDuration - len, d.origStart + dx));
        const snapped = snapTimelineTime(rawStart, { pxPerSec, targets: snapTargets });
        s = Math.max(0, Math.min(totalDuration - len, snapped.time));
        en = s + len;
      } else if (d.mode === "left") {
        const rawStart = Math.max(0, Math.min(d.origEnd - 0.2, d.origStart + dx));
        const snapped = snapTimelineTime(rawStart, { pxPerSec, targets: snapTargets });
        s = Math.max(0, Math.min(d.origEnd - 0.2, snapped.time));
      } else {
        const rawEnd = Math.max(d.origStart + 0.2, Math.min(totalDuration, d.origEnd + dx));
        const snapped = snapTimelineTime(rawEnd, { pxPerSec, targets: snapTargets });
        en = Math.max(d.origStart + 0.2, Math.min(totalDuration, snapped.time));
      }
      updateFilter(d.id, { start: s, end: en });
    };

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      lastPointerXRef.current = ev.clientX;
      if (Math.abs(ev.clientX - d.startX) > 4) {
        moved = true;
      }
      updateAction(ev.clientX);
    };

    const up = () => {
      stopAutoScroll();
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (mode === "move" && !moved && onSeek) {
        if (currentTime > f.end) {
          onSeek(f.end);
          try { navigator.vibrate?.(10); } catch {}
        } else if (currentTime < f.start) {
          onSeek(f.start);
          try { navigator.vibrate?.(10); } catch {}
        }
      }
    };

    startAutoScroll((deltaSec, speed) => {
      const scrolledPx = speed * deltaSec * pxPerSec;
      startXAdjusted -= scrolledPx;
      updateAction(lastPointerXRef.current);
    });

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const packed = packLanes(filters);
  const lanes = Math.max(1, ...packed.map((p) => p.lane + 1));
  const ROW = 28;
  const trackH = (focused ? lanes : 1) * ROW + 4;

  const isEn = getLang() === "en";

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-scrub]") || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const localXToTime = (clientX: number) => {
      const pointerX = clientX - rect.left;
      const delta = (pointerX - halfW) / pxPerSec;
      return Math.max(0, Math.min(totalDuration, currentTimeRef.current + delta));
    };
    if (onSeek) onSeek(localXToTime(startX));

    let scrubbing = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!scrubbing && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        return;
      }
      if (Math.abs(dx) > 3) scrubbing = true;
      if (onSeek && scrubbing) onSeek(localXToTime(ev.clientX));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="bg-card/30 border-t border-border/50" dir="ltr">
      <div 
        className="relative overflow-hidden touch-pan-y" 
        style={{ height: Math.max(32, trackH), touchAction: "pan-y" }}
        onPointerDown={handleTrackPointerDown}
      >
        <div className="absolute top-0 left-0 h-full" style={{
          width: totalPx, transform: `translate3d(${translateX}px, 0, 0)`,
          transition: isPlaying ? "none" : "transform 80ms linear", willChange: "transform",
        }}>
          {/* Left Track Icon Header: Filter Track */}
          <div 
            data-no-scrub
            className="absolute left-0 top-0 bottom-0 w-9 -ml-12 flex items-center justify-center z-30"
          >
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onAddClick) onAddClick();
                }}
                className="w-[28px] h-[28px] rounded-md bg-cyan-500/20 border border-cyan-400/60 flex items-center justify-center shadow-md text-cyan-400 transition-all duration-150 active:scale-95 group hover:bg-cyan-500/30"
                title={getLang() === "ar" ? "مسار الفلاتر - اضغط للإضافة" : "Filter Track - Add Filter"}
              >
                <Palette className="w-3.5 h-3.5 text-cyan-400" />
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-md border border-slate-900 transition-transform group-hover:scale-110">
                  <Plus className="w-2.5 h-2.5 stroke-[3.5]" />
                </div>
              </button>
            </div>
          </div>
          {packed.map(({ item: f, lane }) => {
            const left = f.start * pxPerSec;
            const w = Math.max(20, (f.end - f.start) * pxPerSec);
            const isSelected = selectedId === f.id;
            return (
              <div 
                key={f.id} 
                data-filter-item
                onClick={() => setSelectedId(f.id)}
                className={`absolute rounded-xl flex items-center justify-between cursor-grab overflow-hidden border shadow-md transition-all ${focused && isSelected ? "border-purple-300 ring-2 ring-purple-400 z-20" : "border-purple-500/40 hover:border-purple-400/70 opacity-90"}`}
                style={{ left, width: w, height: 28, top: (focused ? lane : 0) * ROW + 2, background: `linear-gradient(135deg, rgba(168,85,247,0.6), rgba(126,34,206,0.35))` }}
                onPointerDown={(e) => {
                  setSelectedId(f.id);
                  onDown(e, f, "move");
                }}
              >
                {focused && isSelected && (
                  <TimelineTrimHandle side="left" variant="purple" onPointerDown={(e) => onDown(e, f, "left")} />
                )}
                
                {/* Keyframe diamonds overlay */}
                <div className="absolute inset-x-0 inset-y-0 pointer-events-none z-10 overflow-visible">
                  {(f.keyframes || []).map((kf) => {
                    const pct = (kf.time / Math.max(0.1, f.end - f.start)) * 100;
                    const kfGlobalTime = f.start + kf.time;
                    const isOver = Math.abs(currentTime - kfGlobalTime) < 0.08;
                    return (
                      <div 
                        key={kf.id} 
                        className={`absolute w-2.5 h-2.5 border border-white shadow transition-all duration-150 ${
                          isOver
                            ? "bg-emerald-500 scale-125 border-emerald-200 ring-2 ring-emerald-400/50 z-20"
                            : "bg-blue-500 border-blue-200 z-10"
                        }`}
                        style={{ 
                          left: `${Math.max(0, Math.min(100, pct))}%`, 
                          top: "50%",
                          transform: "translate(-50%, -50%) rotate(45deg)" 
                        }}
                      />
                    );
                  })}
                </div>

                <span className="flex-1 text-[9px] text-white font-bold truncate px-1 z-10">{f.type}</span>
                <span className="text-[8px] text-white/70 px-0.5">{Math.round(f.intensity * 100)}%</span>
                {focused && isSelected && (
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeFilter(f.id)}
                    className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-white/70 hover:text-white transition-colors z-10">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
                {focused && isSelected && (
                  <TimelineTrimHandle side="right" variant="purple" onPointerDown={(e) => onDown(e, f, "right")} />
                )}
              </div>
            );
          })}
        </div>
        {/* playhead drawn by parent */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-6 bg-gradient-to-r from-card to-transparent z-10" />
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-6 bg-gradient-to-l from-card to-transparent z-10" />
      </div>
    </div>
  );
});

FilterTimeline.displayName = "FilterTimeline";

export default FilterTimeline;
