import { useEffect, useRef, useState } from "react";
import { useMedia, Caption } from "@/context/MediaContext";
import { Type, Trash2, Plus } from "lucide-react";
import TimelineTrimHandle from "./TimelineTrimHandle";
import { snapTimelineTime } from "@/lib/timelineSnap";
import { getLang } from "@/lib/i18n";

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

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const CaptionTimeline = ({ currentTime, pxPerSec, containerW, isPlaying, focused, onSeek, onAddClick, onFocus }: Props) => {
  const { captions, updateCaption, removeCaption, totalDuration, setCaptions, captionStyle } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{
    id: string; mode: "move" | "left" | "right"; startX: number; origStart: number; origEnd: number;
  } | null>(null);

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

  // Assign captions to rows to avoid overlap
  const rows = assignRows(captions);

  const onDown = (e: React.PointerEvent, c: Caption, mode: "move" | "left" | "right") => {
    e.stopPropagation();
    onFocus?.();
    let startXAdjusted = e.clientX;
    lastPointerXRef.current = e.clientX;
    dragRef.current = { id: c.id, mode, startX: e.clientX, origStart: c.start, origEnd: c.end };
    let moved = false;

    const snapTargets = [0, currentTime, totalDuration, ...captions.filter((x) => x.id !== c.id).flatMap((x) => [x.start, x.end])];

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
      updateCaption(d.id, { start: s, end: en });
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
        if (!(currentTime >= c.start && currentTime <= c.end)) {
          onSeek(c.start);
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

  const addAtPlayhead = () => {
    const start = Math.max(0, Math.min(totalDuration - 1.5, currentTime));
    const end = Math.min(totalDuration, start + 2);
    const cap: Caption = { id: uid(), start, end, text: "نص جديد", animation: captionStyle.animation };
    setCaptions((prev) => [...prev, cap].sort((a, b) => a.start - b.start));
  };

  const trackHeight = 30;
  // Collapse multiple lanes into a single row when the track is not focused
  const totalHeight = (focused ? Math.max(1, rows.length) : 1) * trackHeight + 4;

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-scrub]") || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCurrentTime = currentTimeRef.current;
    const clickedTime = Math.max(0, Math.min(totalDuration, startCurrentTime + (startX - rect.left - halfW) / pxPerSec));

    if (onSeek) onSeek(clickedTime);

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
      if (onSeek && scrubbing) {
        const nextTime = Math.max(0, Math.min(totalDuration, clickedTime - dx / pxPerSec));
        onSeek(nextTime);
      }
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
        style={{ height: Math.max(34, totalHeight), touchAction: "pan-y" }}
        onPointerDown={handleTrackPointerDown}
      >
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            width: totalPx,
            transform: `translate3d(${translateX}px, 0, 0)`,
            transition: isPlaying ? "none" : "transform 80ms linear",
            willChange: "transform",
          }}
        >
          {/* Track Header Icon: Text / Captions */}
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
                  else addAtPlayhead();
                }}
                className="w-[28px] h-[28px] rounded-md bg-amber-500/20 border border-amber-400/60 flex items-center justify-center shadow-md text-amber-400 transition-all duration-150 active:scale-95 group hover:bg-amber-500/30"
                title={getLang() === "ar" ? "مسار النص والتسميات - اضغط للإضافة" : "Text Track - Add Text"}
              >
                <Type className="w-3.5 h-3.5 text-amber-400" />
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-md border border-slate-900 transition-transform group-hover:scale-110">
                  <Plus className="w-2.5 h-2.5 stroke-[3.5]" />
                </div>
              </button>
            </div>
          </div>

          {captions.map((c) => {
            const row = focused ? getRow(rows, c.id) : 0;
            const left = c.start * pxPerSec;
            const w = Math.max(20, (c.end - c.start) * pxPerSec);
            const isSelected = selectedId === c.id;
            return (
              <div
                key={c.id}
                data-caption-item
                onClick={() => setSelectedId(c.id)}
                className={`absolute rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 text-slate-950 font-black shadow-md border border-amber-300/80 flex items-center justify-between cursor-grab overflow-hidden transition-all ${focused && isSelected ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-black z-20 opacity-100" : "opacity-90 hover:opacity-100"}`}
                style={{ left, width: w, top: row * trackHeight + 2, height: trackHeight - 4 }}
                onPointerDown={(e) => {
                  setSelectedId(c.id);
                  onDown(e, c, "move");
                }}
                title={c.text}
              >
                {focused && isSelected && (
                  <TimelineTrimHandle side="left" variant="amber" onPointerDown={(e) => onDown(e, c, "left")} />
                )}
                
                {/* Keyframe diamonds overlay */}
                <div className="absolute inset-x-0 inset-y-0 pointer-events-none overflow-visible">
                  {(c.keyframes || []).map((kf) => {
                    const pct = (kf.time / Math.max(0.1, c.end - c.start)) * 100;
                    const kfGlobalTime = c.start + kf.time;
                    const isOver = Math.abs(currentTime - kfGlobalTime) < 0.08;
                    return (
                      <div 
                        key={kf.id} 
                        className={`absolute w-2.5 h-2.5 border border-white shadow transition-all duration-150 ${
                          isOver
                            ? "bg-emerald-500 scale-125 border-emerald-200 ring-2 ring-emerald-400/50 z-20"
                            : "bg-amber-900 border-amber-200 z-10"
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

                <span className="flex-1 text-[9.5px] text-slate-950 font-black truncate px-1.5 z-10">{c.text}</span>
                {focused && isSelected && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); removeCaption(c.id); }}
                    className="w-5 h-5 flex items-center justify-center flex-shrink-0 hover:bg-amber-600/40 rounded transition-colors z-10"
                  >
                    <Trash2 className="w-2.5 h-2.5 text-slate-950/80" />
                  </button>
                )}
                {focused && isSelected && (
                  <TimelineTrimHandle side="right" variant="amber" onPointerDown={(e) => onDown(e, c, "right")} />
                )}
              </div>
            );
          })}
        </div>
        {/* playhead drawn by parent unified line */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-6 bg-gradient-to-r from-card to-transparent z-10" />
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-6 bg-gradient-to-l from-card to-transparent z-10" />
      </div>
    </div>
  );
};

function assignRows(captions: Caption[]): { id: string; row: number }[] {
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  const result: { id: string; row: number }[] = [];
  const rowEnds: number[] = [];
  for (const c of sorted) {
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (c.start >= rowEnds[r]) {
        rowEnds[r] = c.end;
        result.push({ id: c.id, row: r });
        placed = true;
        break;
      }
    }
    if (!placed) {
      result.push({ id: c.id, row: rowEnds.length });
      rowEnds.push(c.end);
    }
  }
  return result;
}

function getRow(rows: { id: string; row: number }[], id: string) {
  return rows.find((r) => r.id === id)?.row ?? 0;
}

export default CaptionTimeline;
