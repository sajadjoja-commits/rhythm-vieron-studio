import { useEffect, useRef, useState, useCallback } from "react";
import { useMedia } from "@/context/MediaContext";
import { packLanes } from "@/lib/lanes";
import { Volume2, VolumeX, Trash2, Music2, Plus } from "lucide-react";
import { getWaveformPeaks } from "@/lib/waveform";
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

/**
 * Music / SFX track that scrolls in lockstep with the video timeline. Renders a
 * real waveform, smart beat markers and blue/red fade-in / fade-out heads.
 */
const AudioTimeline = ({ currentTime, pxPerSec, containerW, isPlaying, focused, onSeek, onAddClick, onFocus }: Props) => {
  const { audioTracks, totalDuration, updateAudioTrack, removeAudioTrack, audioBeats } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const halfW = containerW / 2;
  const totalPx = Math.max(totalDuration, 0.001) * pxPerSec;
  const translateX = halfW - currentTime * pxPerSec;

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const packed = packLanes(audioTracks.map((a) => ({ ...a, start: a.start, end: a.start + a.duration })));
  const lanes = audioTracks.length ? Math.max(1, ...packed.map((p) => p.lane + 1)) : 1;
  const ROW = 56;
  const trackH = audioTracks.length ? Math.max(36, (focused ? lanes : 1) * ROW + 4) : 36;
  const laneOf = new Map(packed.map((p) => [p.item.id, p.lane]));

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-scrub]") || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCurrentTime = currentTimeRef.current;
    const clickedTime = Math.max(0, Math.min(totalDuration, startCurrentTime + (startX - rect.left - halfW) / pxPerSec));

    // Deselect if clicking on empty track space
    if (!(e.target as HTMLElement).closest("[data-audio-block]")) {
      setSelectedId(null);
    }

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
        style={{ height: trackH, touchAction: "pan-y" }}
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
          {/* Left Track Icon Header: Music Track */}
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
                className="w-[28px] h-[28px] rounded-md bg-indigo-500/20 border border-indigo-400/60 flex items-center justify-center shadow-md text-indigo-400 transition-all duration-150 active:scale-95 group hover:bg-indigo-500/30"
                title={getLang() === "ar" ? "مسار الصوت والموسيقى - اضغط للإضافة" : "Audio Track - Add Audio"}
              >
                <Music2 className="w-3.5 h-3.5 text-indigo-400" />
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-indigo-400 text-slate-950 flex items-center justify-center shadow-md border border-slate-900 transition-transform group-hover:scale-110">
                  <Plus className="w-2.5 h-2.5 stroke-[3.5]" />
                </div>
              </button>
            </div>
          </div>
          {/* Beat markers (separate from cutting) */}
          {audioBeats.map((b, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-primary/50 z-[5] pointer-events-none"
              style={{ left: b * pxPerSec }}
            >
              <div className="w-1.5 h-1.5 -ml-[3px] rounded-full bg-primary" />
            </div>
          ))}
          {audioTracks.map((a) => (
            <AudioBlock
              key={a.id}
              track={a}
              top={(focused ? (laneOf.get(a.id) ?? 0) : 0) * ROW + 2}
              focused={focused}
              isSelected={selectedId === a.id}
              onSelect={() => setSelectedId(a.id)}
              pxPerSec={pxPerSec}
              containerW={containerW}
              currentTime={currentTime}
              totalDuration={totalDuration}
              onSeek={onSeek}
              onMove={(start) => updateAudioTrack(a.id, { start: Math.max(0, start) })}
              onResize={(edge, value) => {
                if (edge === "in") {
                  const delta = value;
                  const newOffset = Math.max(0, a.offset + delta);
                  const newDuration = Math.max(0.2, a.duration - delta);
                  const newStart = a.start + delta;
                  updateAudioTrack(a.id, { offset: newOffset, duration: newDuration, start: newStart });
                } else {
                  updateAudioTrack(a.id, { duration: Math.max(0.2, Math.min(a.sourceDuration - a.offset, value)) });
                }
              }}
              onFade={(edge, value) => updateAudioTrack(a.id, edge === "in" ? { fadeIn: value } : { fadeOut: value })}
              onMute={() => updateAudioTrack(a.id, { muted: !a.muted })}
              onRemove={() => removeAudioTrack(a.id)}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-6 bg-gradient-to-r from-card to-transparent z-10" />
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-6 bg-gradient-to-l from-card to-transparent z-10" />
      </div>
    </div>
  );
};

interface BlockProps {
  track: ReturnType<typeof useMedia>["audioTracks"][number];
  pxPerSec: number;
  containerW: number;
  currentTime: number;
  totalDuration: number;
  top?: number;
  focused?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onSeek?: (t: number) => void;
  onMove: (start: number) => void;
  onResize: (edge: "in" | "out", value: number) => void;
  onFade: (edge: "in" | "out", value: number) => void;
  onMute: () => void;
  onRemove: () => void;
}

const AudioBlock = ({ track, pxPerSec, containerW, currentTime, totalDuration, top = 2, focused, isSelected, onSelect, onSeek, onMove, onResize, onFade, onMute, onRemove }: BlockProps) => {
  const left = track.start * pxPerSec;
  const width = Math.max(20, track.duration * pxPerSec);
  const dragRef = useRef<{ kind: "move" | "in" | "out" | "fadeIn" | "fadeOut"; startX: number; base: number } | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fadeIn = track.fadeIn ?? 0;
  const fadeOut = track.fadeOut ?? 0;

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Auto-scrolling state & handlers
  const scrollIntervalRef = useRef<number | null>(null);
  const lastPointerXRef = useRef<number>(0);

  const startAutoScroll = useCallback((onScrollTick: (deltaSec: number, speed: number) => void) => {
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
  }, [totalDuration, onSeek]);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getWaveformPeaks(track.url, 240).then((p) => { if (alive) setPeaks(p); }).catch(() => {});
    return () => { alive = false; };
  }, [track.url]);

  // draw waveform
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !peaks.length) return;
    const w = Math.max(1, Math.round(width));
    const h = 52;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const mid = h / 2;
    // map source window (offset..offset+duration) onto peaks
    const total = track.sourceDuration || track.duration;
    const startFrac = total ? track.offset / total : 0;
    const endFrac = total ? (track.offset + track.duration) / total : 1;
    const i0 = Math.floor(startFrac * peaks.length);
    const i1 = Math.max(i0 + 1, Math.floor(endFrac * peaks.length));
    const span = i1 - i0;
    for (let x = 0; x < w; x += 2) {
      const pi = i0 + Math.floor((x / w) * span);
      const v = peaks[pi] || 0;
      const bh = Math.max(1, v * (h - 6));
      ctx.fillRect(x, mid - bh / 2, 1.4, bh);
    }
  }, [peaks, width, track.offset, track.duration, track.sourceDuration]);

  const onPointerDown = (e: React.PointerEvent, kind: "move" | "in" | "out" | "fadeIn" | "fadeOut") => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const base = kind === "fadeIn" ? fadeIn : kind === "fadeOut" ? fadeOut : kind === "out" ? track.duration : track.start;
    
    let startXAdjusted = e.clientX;
    lastPointerXRef.current = e.clientX;
    dragRef.current = { kind, startX: e.clientX, base };
    let moved = false;

    const snapTargets = [0, currentTime, totalDuration];

    const updateAction = (currentX: number) => {
      if (!dragRef.current) return;
      const dt = (currentX - startXAdjusted) / pxPerSec;
      const k = dragRef.current.kind;
      if (k === "move") {
        const rawStart = Math.max(0, dragRef.current.base + dt);
        const snapped = snapTimelineTime(rawStart, { pxPerSec, targets: snapTargets });
        onMove(snapped.time);
      } else if (k === "in") {
        onResize("in", dt);
      } else if (k === "out") {
        const rawEnd = track.start + dragRef.current.base + dt;
        const snapped = snapTimelineTime(rawEnd, { pxPerSec, targets: snapTargets });
        const newDur = Math.max(0.2, snapped.time - track.start);
        onResize("out", newDur);
      } else if (k === "fadeIn") {
        onFade("in", Math.max(0, Math.min(track.duration / 2, dragRef.current.base + dt)));
      } else if (k === "fadeOut") {
        onFade("out", Math.max(0, Math.min(track.duration / 2, dragRef.current.base - dt)));
      }
    };

    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      lastPointerXRef.current = ev.clientX;
      if (Math.abs(ev.clientX - dragRef.current.startX) > 4) {
        moved = true;
      }
      updateAction(ev.clientX);
    };

    const up = () => {
      stopAutoScroll();
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (kind === "move" && !moved && onSeek) {
        if (!(currentTime >= track.start && currentTime <= track.start + track.duration)) {
          onSeek(track.start);
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

  const fadeInPx = Math.min(width, fadeIn * pxPerSec);
  const fadeOutPx = Math.min(width, fadeOut * pxPerSec);

  return (
    <div
      data-audio-block
      onClick={onSelect}
      className={`absolute h-[44px] rounded-xl overflow-hidden border shadow-lg transition-all ${focused && isSelected ? "border-indigo-300 ring-2 ring-indigo-400" : "border-white/20"}`}
      style={{ left, width, top, background: `linear-gradient(135deg, ${track.color}cc, ${track.color}88)` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80 pointer-events-none" />

      {/* fade-in (blue) wedge */}
      {fadeInPx > 1 && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none z-[6]" style={{ width: fadeInPx, background: "linear-gradient(to right, rgba(0,0,0,0.6), transparent)" }}>
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100"><polygon points="0,100 100,0 100,100" fill="rgba(59,130,246,0.35)" /></svg>
        </div>
      )}
      {/* fade-out (red) wedge */}
      {fadeOutPx > 1 && (
        <div className="absolute right-0 top-0 bottom-0 pointer-events-none z-[6]" style={{ width: fadeOutPx, background: "linear-gradient(to left, rgba(0,0,0,0.6), transparent)" }}>
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100"><polygon points="0,0 0,100 100,100" fill="rgba(239,68,68,0.35)" /></svg>
        </div>
      )}

      {/* draggable body */}
      <div
        onPointerDown={(e) => {
          if (onSelect) onSelect();
          onPointerDown(e, "move");
        }}
        className="absolute inset-0 cursor-grab active:cursor-grabbing flex items-center justify-between px-3 z-[7]"
        style={{ touchAction: "none" }}
      >
        {/* Keyframe diamonds overlay */}
        <div className="absolute inset-x-0 inset-y-0 pointer-events-none z-10 overflow-visible">
          {(track.keyframes || []).map((kf) => {
            const pct = (kf.time / Math.max(0.1, track.duration)) * 100;
            const kfGlobalTime = track.start + kf.time;
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

        <span className="text-[10px] font-bold text-white truncate max-w-[55%] z-10" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
          {track.kind === "video-audio" ? "🎬 " : track.kind === "sfx" ? "✨ " : "🎵 "}
          {track.name}
        </span>
        <div className="flex items-center gap-1">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onMute(); }} className="w-5 h-5 rounded bg-black/40 flex items-center justify-center">
            {track.muted ? <VolumeX className="w-3 h-3 text-white" /> : <Volume2 className="w-3 h-3 text-white" />}
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-5 h-5 rounded bg-black/40 flex items-center justify-center">
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>

      {/* fade heads — blue (in) top-left, red (out) top-right */}
      {focused && isSelected && (
        <>
          <div
            onPointerDown={(e) => onPointerDown(e, "fadeIn")}
            className="absolute -top-0.5 z-20 cursor-ew-resize"
            style={{ left: Math.max(0, fadeInPx - 5), touchAction: "none" }}
          >
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
          </div>
          <div
            onPointerDown={(e) => onPointerDown(e, "fadeOut")}
            className="absolute -top-0.5 z-20 cursor-ew-resize"
            style={{ left: Math.max(0, width - fadeOutPx - 5), touchAction: "none" }}
          >
            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
          </div>
        </>
      )}

      {/* trim edge handles */}
      {focused && isSelected && (
        <>
          <TimelineTrimHandle side="left" variant="cyan" onPointerDown={(e) => onPointerDown(e, "in")} className="absolute left-0 top-0 bottom-0" />
          <TimelineTrimHandle side="right" variant="cyan" isMaxReached={track.duration > 0 && (track.end || (track.start + track.duration)) >= (track.start + track.duration - 0.05)} onPointerDown={(e) => onPointerDown(e, "out")} className="absolute right-0 top-0 bottom-0" />
        </>
      )}
    </div>
  );
};

export default AudioTimeline;
