import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { useMedia, TransitionType } from "@/context/MediaContext";
import ClipThumbnails from "./ClipThumbnails";
import TimelineTrimHandle from "./TimelineTrimHandle";
import MediaPicker from "@/components/MediaPicker";
import { Plus, X, Volume2, VolumeX, Image as ImageIcon } from "lucide-react";
import { getLang } from "@/lib/i18n";
import { triggerHapticTick, triggerHapticSelection } from "@/lib/haptics";

interface Props {
  currentTime: number;
  onSeek: (t: number) => void;
  onOpenTransition: (clipId: string) => void;
  isPlaying?: boolean;
  onUserScrub?: (scrubbing: boolean) => void;
  onWidthChange?: (w: number) => void;
  onPxPerSecChange?: (p: number) => void;
  hidePlayhead?: boolean;
  focused?: boolean;
  pxPerSec?: number;
  onOpenCover?: () => void;
  onFocus?: () => void;
}

const TRANSITION_ICON: Record<TransitionType, string> = {
  none: "—", fade: "◐", slide: "▶", zoom: "⊕", wipe: "▤", blur: "✦", dissolve: "❄",
  glitch: "⚡", spin: "🔄", flash: "💥", shutter: "📷", iris: "👁",
  split: "♊", mosaic: "▧", ripple: "≋", radar: "⎋",
  "whip-pan": "💨", "zoom-blur": "🌀", "glitch-slice": "⚡", "page-flip": "📖",
  "gsap-elastic-zoom": "🚀", "gsap-3d-flip": "💎", "gsap-stagger-wipe": "🪄", "gsap-elastic-bounce": "⚡",
  "sun-flare": "☀️", "light-leak": "🌅", "brush-paint": "🖌️", "bokeh-blur": "🎭",
  "cinematic-bars": "🎬", "cube-rotate": "📦", "color-flow": "🌈", "retro-pixel": "👾", "star-warp": "⭐"
};

const KeyframeMarkers = memo(({ clip, clipGlobalStart, pxPerSec, currentTime }: { clip: any; clipGlobalStart: number; pxPerSec: number; currentTime: number }) => {
  const seenTimes = new Set<string>();
  const kfs = clip.keyframes || [];
  if (kfs.length === 0) return null;
  
  return (
    <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none z-30 flex items-center overflow-visible">
      {kfs.map((kf: any) => {
        const tKey = kf.time.toFixed(2);
        if (seenTimes.has(tKey)) return null;
        seenTimes.add(tKey);

        const kfGlobalTime = clipGlobalStart + kf.time;
        // Turn green if the playhead is over/near the keyframe, blue otherwise
        const isOver = Math.abs(currentTime - kfGlobalTime) < 0.08;

        return (
          <div
            key={kf.id}
            className={`absolute w-2.5 h-2.5 border border-white shadow transition-all duration-150 ${
              isOver
                ? "bg-emerald-500 scale-125 border-emerald-200 ring-2 ring-emerald-400/50 z-40"
                : "bg-blue-500 border-blue-200 z-30"
            }`}
            style={{
              left: `${kf.time * pxPerSec}px`,
              transform: "translateX(-50%) rotate(45deg)",
              top: "42%",
            }}
            title={`${kf.property}: ${kf.value}`}
          />
        );
      })}
    </div>
  );
});
KeyframeMarkers.displayName = "KeyframeMarkers";

const Timeline = memo(({ currentTime, onSeek, onOpenTransition, isPlaying, onUserScrub, onWidthChange, onPxPerSecChange, hidePlayhead, focused, pxPerSec: propPxPerSec, onOpenCover, onFocus }: Props) => {
  const { clips, getMediaById, totalDuration, removeClip, trimClip, moveClip, videoMuted, setVideoMuted, coverImage, audioBeats } = useMedia();

  const autoCover = useMemo(() => {
    if (coverImage) return coverImage;
    if (clips.length > 0) {
      const firstMedia = getMediaById(clips[0].mediaId);
      if (firstMedia) {
        return firstMedia.thumbnail || firstMedia.url;
      }
    }
    return null;
  }, [coverImage, clips, getMediaById]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [localPxPerSec, setLocalPxPerSec] = useState(60);
  const pxPerSec = propPxPerSec !== undefined ? propPxPerSec : localPxPerSec;
  
  const setPxPerSec = useCallback((p: number | ((prev: number) => number)) => {
    if (propPxPerSec !== undefined) {
      const nextVal = typeof p === "function" ? p(propPxPerSec) : p;
      onPxPerSecChange?.(nextVal);
    } else {
      setLocalPxPerSec(p);
    }
  }, [propPxPerSec, onPxPerSecChange]);

  const [containerW, setContainerW] = useState(360);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const isScrubbingRef = useRef(false);
  const isTrimmingRef = useRef(false);
  isTrimmingRef.current = isTrimming;
  const dragIdRef = useRef<string | null>(null);
  dragIdRef.current = dragId;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Touch inertial scrolling refs & helper
  const inertiaFrameRef = useRef<number | null>(null);
  
  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  // Cleanup inertia on unmount
  useEffect(() => {
    return () => {
      if (inertiaFrameRef.current !== null) {
        cancelAnimationFrame(inertiaFrameRef.current);
      }
    };
  }, []);

  // Auto-update selectedClipId when currentTime moves, so the active clip at the playhead is selected
  useEffect(() => {
    let acc = 0;
    let foundId: string | null = null;
    for (const clip of clips) {
      const len = clip.out - clip.in;
      if (currentTime >= acc && currentTime <= acc + len) {
        foundId = clip.id;
        break;
      }
      acc += len;
    }
    if (foundId) {
      setSelectedClipId(foundId);
    }
  }, [currentTime, clips]);

  // Touch Pinch-to-Zoom State & Handlers
  const touchRef = useRef<{ initialDist: number; initialPx: number } | null>(null);
  const isPinchingRef = useRef(false);

  // Track the latest pxPerSec via Ref so our non-passive listener always uses the freshest values
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // Pinch Lock: Disable pinch zoom completely if a clip is being trimmed, dragged, or scrubbed
      if (isTrimmingRef.current || dragIdRef.current !== null || isScrubbingRef.current) {
        isPinchingRef.current = false;
        touchRef.current = null;
        return;
      }

      if (e.touches.length >= 2) {
        isPinchingRef.current = true;
        e.preventDefault(); // Stop native page zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchRef.current = {
          initialDist: dist,
          initialPx: pxPerSecRef.current
        };
      } else {
        isPinchingRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      // Pinch Lock: Disable pinch zoom completely if a clip is being trimmed, dragged, or scrubbed
      if (isTrimmingRef.current || dragIdRef.current !== null || isScrubbingRef.current) {
        isPinchingRef.current = false;
        touchRef.current = null;
        return;
      }

      if (e.touches.length === 2 && touchRef.current) {
        e.preventDefault(); // Stop native page scroll/zoom
        isPinchingRef.current = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const ratio = dist / touchRef.current.initialDist;
        // Widen zoom range to 12 - 400 for a much more responsive and immersive feel!
        const newPx = Math.max(12, Math.min(400, Math.round(touchRef.current.initialPx * ratio)));
        setPxPerSec(newPx);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchRef.current = null;
        // Keep isPinchingRef locked for 200ms to absorb any trailing touch tap/clicks
        setTimeout(() => {
          if (!touchRef.current) {
            isPinchingRef.current = false;
          }
        }, 200);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [setPxPerSec]);

  // Edge Auto-Scrolling State & Logic
  const scrollIntervalRef = useRef<number | null>(null);
  const lastPointerXRef = useRef<number>(0);

  const startAutoScroll = useCallback((onScrollTick: (deltaSec: number, speed: number) => void, maxSpeedMultiplier: number = 4) => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    let lastTime = performance.now();

    scrollIntervalRef.current = window.setInterval(() => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pointerX = lastPointerXRef.current;

      let speed = 0; // seconds to scroll per second of real time
      if (pointerX < rect.left + 50) {
        const dist = Math.max(0, pointerX - rect.left);
        const factor = (50 - dist) / 50;
        speed = -maxSpeedMultiplier * factor;
      } else if (pointerX > rect.right - 50) {
        const dist = Math.max(0, rect.right - pointerX);
        const factor = (50 - dist) / 50;
        speed = maxSpeedMultiplier * factor;
      }

      if (speed !== 0) {
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
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setContainerW(w);
      onWidthChange?.(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onWidthChange]);

  useEffect(() => {
    if (propPxPerSec === undefined) {
      onPxPerSecChange?.(pxPerSec);
    }
  }, [pxPerSec, propPxPerSec, onPxPerSecChange]);

  const halfW = containerW / 2;
  const totalPx = totalDuration * pxPerSec;

  const ticks = useMemo(() => {
    const tickInterval = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 2 : 5;
    const arr: number[] = [];
    for (let s = 0; s <= totalDuration + tickInterval; s += tickInterval) arr.push(s);
    return arr;
  }, [totalDuration, pxPerSec]);

  const lastSnappedPtRef = useRef<number | null>(null);

  const getSnapPoints = useCallback(() => {
    const points: number[] = [0];
    let acc = 0;
    for (const clip of clips) {
      const len = clip.out - clip.in;
      points.push(acc);
      points.push(acc + len);
      acc += len;
    }
    points.push(totalDuration);
    return Array.from(new Set(points)).sort((a, b) => a - b);
  }, [clips, totalDuration]);

  const applySnap = useCallback((time: number) => {
    const points = getSnapPoints();
    const thresholdPx = 10; // Snap within 10 pixels of any edge
    const thresholdSec = thresholdPx / pxPerSec;
    for (const pt of points) {
      if (Math.abs(time - pt) < thresholdSec) {
        if (lastSnappedPtRef.current !== pt) {
          lastSnappedPtRef.current = pt;
          triggerHapticTick("light");
        }
        return pt;
      }
    }
    lastSnappedPtRef.current = null;
    return time;
  }, [getSnapPoints, pxPerSec]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-scrub]")) return;
    if (isPinchingRef.current || (e.pointerType === "touch" && (e.nativeEvent as any).touches && (e.nativeEvent as any).touches.length > 1)) return;
    
    // Stop any currently running momentum/inertia scroll
    stopInertia();

    const targetEl = e.currentTarget as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCurrentTime = currentTimeRef.current;
    const clickedTime = Math.max(0, Math.min(totalDuration, startCurrentTime + (startX - rect.left - halfW) / pxPerSec));

    isScrubbingRef.current = true;
    onUserScrub?.(true);
    
    let hasMoved = false;
    let isCaptured = false;
    let lastX = startX;
    let lastTime = performance.now();
    let velocity = 0; // px per millisecond

    const move = (ev: PointerEvent) => {
      if (!isScrubbingRef.current || isPinchingRef.current) return;
      const currentX = ev.clientX;
      const currentY = ev.clientY;
      const now = performance.now();
      const dt = now - lastTime;
      const dxTotal = currentX - startX;
      const dyTotal = currentY - startY;

      if (!isCaptured && Math.abs(dyTotal) > Math.abs(dxTotal) && Math.abs(dyTotal) > 5) {
        // User is scrolling vertically — cancel scrub so container scrolls natively
        isScrubbingRef.current = false;
        onUserScrub?.(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        return;
      }

      const dxStep = currentX - lastX;

      if (Math.abs(dxTotal) > 3) {
        hasMoved = true;
        if (!isCaptured) {
          isCaptured = true;
          try { targetEl.setPointerCapture(e.pointerId); } catch {}
        }
      }

      if (dt > 0) {
        const instantVelocity = dxStep / dt;
        velocity = velocity * 0.4 + instantVelocity * 0.6; // low-pass smoothing
      }

      lastX = currentX;
      lastTime = now;

      let nextTime = Math.max(0, Math.min(totalDuration, clickedTime - dxTotal / pxPerSec));
      nextTime = applySnap(nextTime);
      onSeek(nextTime);
    };

    const up = () => {
      isScrubbingRef.current = false;
      onUserScrub?.(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      
      // Commit the seek only if it was a discrete tap/click and we are not currently pinching
      if (!hasMoved && !isPinchingRef.current) {
        const snapped = applySnap(clickedTime);
        onSeek(snapped);
      } else if (hasMoved && !isPinchingRef.current && Math.abs(velocity) > 0.05) {
        // Trigger high-performance momentum inertia scrolling
        let currentVelocity = velocity;
        let lastFrameTime = performance.now();
        onUserScrub?.(true);

        const runInertia = () => {
          const now = performance.now();
          const frameTime = now - lastFrameTime;
          lastFrameTime = now;

          // Smoothly decay velocity (friction)
          const friction = 0.94;
          currentVelocity *= Math.pow(friction, frameTime / 16);

          if (Math.abs(currentVelocity) < 0.04) {
            onUserScrub?.(false);
            inertiaFrameRef.current = null;
            return;
          }

          const deltaPx = currentVelocity * frameTime;
          const nextTime = Math.max(0, Math.min(totalDuration, currentTimeRef.current - deltaPx / pxPerSec));
          onSeek(nextTime);

          if (nextTime <= 0 || nextTime >= totalDuration) {
            onUserScrub?.(false);
            inertiaFrameRef.current = null;
            return;
          }

          inertiaFrameRef.current = requestAnimationFrame(runInertia);
        };

        inertiaFrameRef.current = requestAnimationFrame(runInertia);
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
  }, [halfW, pxPerSec, totalDuration, onSeek, onUserScrub, applySnap, stopInertia]);

  const startTrim = useCallback((e: React.PointerEvent, clipId: string, edge: "in" | "out", clip: { in: number; out: number; mediaId: string }) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedClipId(clipId);
    setIsTrimming(true);
    isTrimmingRef.current = true;
    onFocus?.();

    // Gesture Isolation: Pointer capture to isolate gestures from zoom/scroll
    const targetEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      targetEl.setPointerCapture(pointerId);
    } catch {}

    let startXAdjusted = e.clientX;
    lastPointerXRef.current = e.clientX;
    const startIn = clip.in, startOut = clip.out;

    // Calculate initial global position of this clip on timeline
    const fromIdx = clips.findIndex((c) => c.id === clipId);
    let clipGlobalStart = 0;
    for (let i = 0; i < fromIdx && i < clips.length; i++) {
      clipGlobalStart += clips[i].out - clips[i].in;
    }
    const initialClipDuration = clip.out - clip.in;
    const clipGlobalEnd = clipGlobalStart + initialClipDuration;
    const initialPlayhead = currentTimeRef.current;
    const playheadInsideClip = initialPlayhead >= clipGlobalStart - 0.05 && initialPlayhead <= clipGlobalEnd + 0.05;

    const media = getMediaById(clip.mediaId);
    const isVideo = media && media.type === "video";
    const maxSourceDuration = isVideo && media.duration > 0 ? media.duration : Infinity;

    const updateTrim = (currentX: number) => {
      const dt = (currentX - startXAdjusted) / pxPerSec;
      if (edge === "in") {
        const newIn = Math.max(0, Math.min(startIn + dt, startOut - 0.1));
        trimClip(clipId, "in", newIn);
        // Visual Anchoring: Only update playhead if playhead was inside the affected clip
        if (playheadInsideClip) {
          onSeek(clipGlobalStart);
        }
      } else {
        const proposedOut = Math.max(startIn + 0.1, Math.min(startOut + dt, maxSourceDuration));
        if (proposedOut >= maxSourceDuration) {
          triggerHapticTick("medium");
        }
        trimClip(clipId, "out", proposedOut);
        // Visual Anchoring: Only update playhead preview if playhead was inside the affected clip
        if (playheadInsideClip) {
          onSeek(clipGlobalStart + (proposedOut - startIn));
        }
      }
    };

    const move = (ev: PointerEvent) => {
      lastPointerXRef.current = ev.clientX;
      updateTrim(ev.clientX);
    };

    const up = () => {
      setIsTrimming(false);
      isTrimmingRef.current = false;
      stopAutoScroll();

      try {
        if (targetEl && targetEl.hasPointerCapture(pointerId)) {
          targetEl.releasePointerCapture(pointerId);
        }
      } catch {}

      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };

    startAutoScroll((deltaSec, speed) => {
      const scrolledPx = speed * deltaSec * pxPerSec;
      startXAdjusted -= scrolledPx;
      updateTrim(lastPointerXRef.current);
    }, 1.8); // Smooth and controlled auto-scroll speed (1.8x) during trim prevents visual zoom illusion

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [clips, pxPerSec, trimClip, startAutoScroll, stopAutoScroll, getMediaById, onFocus, onSeek]);

  const COMPACT_W = 68;
  const GAP = 10;
  const slotWidth = COMPACT_W + GAP;
  const isReordering = dragId !== null;
  const fromIdx = isReordering ? clips.findIndex((c) => c.id === dragId) : -1;
  const hoverIdx = isReordering && fromIdx !== -1 
    ? Math.max(0, Math.min(clips.length - 1, Math.round((fromIdx * slotWidth + dragDx) / slotWidth))) 
    : -1;

  const startMove = useCallback((e: React.PointerEvent, clipId: string) => {
    e.stopPropagation();
    setSelectedClipId(clipId);
    onFocus?.();

    const targetEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      targetEl.setPointerCapture(pointerId);
    } catch {}

    let startXAdjusted = e.clientX;
    lastPointerXRef.current = e.clientX;
    const clipIdx = clips.findIndex((c) => c.id === clipId);
    if (clipIdx === -1) return;

    let moved = false;
    const HOLD = 6;

    const updateMove = (currentX: number) => {
      const dx = currentX - startXAdjusted;
      if (!moved && Math.abs(dx) < HOLD) return;
      moved = true;
      setDragId(clipId);
      setDragDx(dx);
    };

    const move = (ev: PointerEvent) => {
      lastPointerXRef.current = ev.clientX;
      updateMove(ev.clientX);
    };

    const up = () => {
      stopAutoScroll();
      try {
        if (targetEl && targetEl.hasPointerCapture(pointerId)) {
          targetEl.releasePointerCapture(pointerId);
        }
      } catch {}

      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);

      const finalX = lastPointerXRef.current;
      const dx = finalX - startXAdjusted;

      if (moved) {
        const target = Math.max(0, Math.min(clips.length - 1, Math.round((clipIdx * slotWidth + dx) / slotWidth)));
        moveClip(clipId, target);
        triggerHapticTick("medium");
        try { navigator.vibrate?.(12); } catch {}
      } else {
        // Gravitate/snap playhead cursor to the clicked clip start ONLY if not already inside its boundaries!
        let clipGlobalStart = 0;
        for (let i = 0; i < clipIdx; i++) {
          clipGlobalStart += clips[i].out - clips[i].in;
        }
        const clipDuration = clips[clipIdx].out - clips[clipIdx].in;
        const clipGlobalEnd = clipGlobalStart + clipDuration;
        
        if (currentTime > clipGlobalEnd) {
          onSeek(clipGlobalEnd);
          triggerHapticTick("light");
          try { navigator.vibrate?.(15); } catch {}
        } else if (currentTime < clipGlobalStart) {
          onSeek(clipGlobalStart);
          triggerHapticTick("light");
          try { navigator.vibrate?.(15); } catch {}
        }
      }
      setDragId(null);
      setDragDx(0);
    };

    startAutoScroll((deltaSec, speed) => {
      const scrolledPx = speed * deltaSec * 80;
      startXAdjusted -= scrolledPx;
      updateMove(lastPointerXRef.current);
    });

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [clips, slotWidth, moveClip, startAutoScroll, stopAutoScroll, onSeek, currentTime, onFocus]);

  const translateX = isReordering && fromIdx !== -1
    ? halfW - (fromIdx * slotWidth + COMPACT_W / 2)
    : halfW - currentTime * pxPerSec;

  const clipElements = useMemo(() => {
    let acc = 0;
    return clips.map((clip, idx) => {
      const media = getMediaById(clip.mediaId);
      const len = clip.out - clip.in;
      const w = len * pxPerSec;
      const left = acc * pxPerSec;
      acc += len;
      if (!media) return null;

      const dragging = dragId === clip.id;
      
      let cardWidth = w;
      let cardLeft = left;
      let transform: string | undefined = undefined;
      let zIndex: number | undefined = undefined;

      if (isReordering) {
        cardWidth = COMPACT_W;
        if (dragging) {
          cardLeft = fromIdx * slotWidth;
          transform = `translateX(${dragDx}px) translateY(-6px) scale(1.05)`;
          zIndex = 50;
        } else {
          let slotIndex = idx;
          if (fromIdx < hoverIdx && idx > fromIdx && idx <= hoverIdx) {
            slotIndex = idx - 1;
          } else if (fromIdx > hoverIdx && idx < fromIdx && idx >= hoverIdx) {
            slotIndex = idx + 1;
          }
          cardLeft = slotIndex * slotWidth;
          transform = undefined;
          zIndex = 20;
        }
      }

      return (
        <div
          key={clip.id}
          className="absolute h-full"
          style={{
            left: cardLeft,
            width: cardWidth,
            transform,
            zIndex,
            opacity: isReordering && !dragging ? 0.75 : 1,
            transition: dragging ? "none" : isReordering ? "all 200ms cubic-bezier(0.16, 1, 0.3, 1)" : "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          data-no-scrub
        >
          {!isReordering && idx > 0 && (
            <button
              data-no-scrub
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onOpenTransition(clip.id); }}
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full gradient-primary glow-primary-sm flex items-center justify-center"
            >
              {clip.transitionIn && clip.transitionIn.type !== "none" ? (
                <span className="text-[10px] text-primary-foreground">{TRANSITION_ICON[clip.transitionIn.type]}</span>
              ) : (
                <Plus className="w-3 h-3 text-primary-foreground" />
              )}
            </button>
          )}

          <div
            className={`relative h-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing shadow-md transition-all duration-150 ${
              dragging 
                ? "border-2 border-amber-400 ring-4 ring-amber-400/80 z-30 shadow-2xl bg-slate-950/95 backdrop-blur-md rounded-2xl transform shadow-amber-500/40 brightness-110 flex items-center justify-center" 
                : isReordering
                ? "border-2 border-slate-600/80 bg-slate-900/90 shadow-lg"
                : focused !== false && selectedClipId === clip.id
                ? "border-2 border-primary ring-2 ring-primary/40 bg-secondary"
                : "border border-primary/30 hover:border-primary/60 bg-secondary"
            }`}
            onPointerDown={(e) => startMove(e, clip.id)}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
            style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
          >
            {isReordering && (
              <div className={`absolute top-1 left-1 z-30 px-1.5 py-0.5 rounded-md text-[10px] font-black shadow-md flex items-center gap-1 ${
                dragging ? "bg-amber-400 text-slate-950" : "bg-slate-800/90 text-slate-200 border border-slate-700"
              }`}>
                <span>#{idx + 1}</span>
              </div>
            )}
            <ClipThumbnails
              clip={clip}
              media={media}
              pxPerSec={pxPerSec}
              isDragging={dragging || isReordering}
              isInteracting={isTrimming || isReordering}
            />
            
            {!isReordering && focused !== false && selectedClipId === clip.id && (
              <TimelineTrimHandle
                side="left"
                variant="primary"
                onPointerDown={(e) => startTrim(e, clip.id, "in", clip)}
                className="absolute left-0 top-0 bottom-0"
              />
            )}
            {!isReordering && focused !== false && selectedClipId === clip.id && (
              <TimelineTrimHandle
                side="right"
                variant="primary"
                isMaxReached={media?.type === "video" && media.duration > 0 && clip.out >= media.duration - 0.05}
                onPointerDown={(e) => startTrim(e, clip.id, "out", clip)}
                className="absolute right-0 top-0 bottom-0"
              />
            )}
            {!isReordering && (
              <div className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs flex items-center justify-between z-10">
                <span className="text-[9px] text-white/90 font-mono font-medium">{len.toFixed(1)}s</span>
                <button
                  data-no-scrub
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (clips.length > 1) removeClip(clip.id); }}
                  className="text-white/80 hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {isReordering && !dragging && (
              <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/75 backdrop-blur-xs flex items-center justify-center z-10">
                <span className="text-[9px] text-white/90 font-mono font-semibold">{len.toFixed(1)}s</span>
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [clips, getMediaById, pxPerSec, onOpenTransition, startTrim, startMove, removeClip, dragId, dragDx, selectedClipId, focused, isTrimming, isReordering, fromIdx, hoverIdx, slotWidth]);

  // Separate, extremely high-performance render layer for keyframe markers
  const keyframesOverlay = useMemo(() => {
    let acc = 0;
    return clips.map((clip) => {
      const len = clip.out - clip.in;
      const left = acc * pxPerSec;
      const clipGlobalStart = acc;
      acc += len;
      if (!clip.keyframes || clip.keyframes.length === 0) return null;
      return (
        <div key={`kf-layer-${clip.id}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left, width: len * pxPerSec }}>
          <KeyframeMarkers clip={clip} clipGlobalStart={clipGlobalStart} pxPerSec={pxPerSec} currentTime={currentTime} />
        </div>
      );
    });
  }, [clips, pxPerSec, currentTime]);

  return (
    <div className="bg-card/60 border-t border-border" dir="ltr">
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none touch-pan-y"
        style={{ height: 110, touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
      >
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            width: totalPx + 56,
            transform: `translate3d(${translateX}px, 0, 0)`,
            willChange: "transform",
          }}
        >
          {/* Ruler */}
          <div className="h-5 relative border-b border-border/60">
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full flex items-end pb-0.5" style={{ left: s * pxPerSec }}>
                <div className="w-px h-2 bg-muted-foreground/40 mr-1" />
                <span className="text-[9px] text-muted-foreground font-mono">{s}s</span>
              </div>
            ))}

          </div>

          {/* Clips */}
          <div className="absolute left-0 top-6 h-16 flex items-center" style={{ width: totalPx }}>
            {/* Left Controls: Cover (Top) + Mute (Bottom) - Locked at start, scrolls with track */}
            <div 
              data-no-scrub
              className="absolute left-0 top-0 bottom-0 w-9 -ml-12 flex flex-col items-center justify-center gap-1.5 z-30"
            >
              {/* Cover Image Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCover?.();
                }}
                className={`w-[28px] h-[28px] rounded-md overflow-hidden border ${
                  autoCover ? "border-primary" : "border-dashed border-muted-foreground/50"
                } bg-black/60 flex items-center justify-center transition-all duration-150 active:scale-90 shadow-md`}
                title={getLang() === "ar" ? "غلاف الفيديو" : "Video Cover"}
              >
                {autoCover ? (
                  clips.length > 0 && getMediaById(clips[0].mediaId)?.type === "video" && !coverImage && !getMediaById(clips[0].mediaId)?.thumbnail ? (
                    <video
                      src={autoCover}
                      className="w-full h-full object-cover pointer-events-none"
                      muted
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        try { e.currentTarget.currentTime = 0.5; } catch {}
                      }}
                    />
                  ) : (
                    <img
                      src={autoCover}
                      alt="cover"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to video element or icon if img fails
                        const target = e.currentTarget;
                        target.style.display = "none";
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector("video")) {
                          const v = document.createElement("video");
                          v.src = autoCover;
                          v.className = "w-full h-full object-cover pointer-events-none";
                          v.muted = true;
                          v.preload = "metadata";
                          v.onloadedmetadata = () => { try { v.currentTime = 0.5; } catch {} };
                          parent.appendChild(v);
                        }
                      }}
                    />
                  )
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>

              {/* Mute Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoMuted(!videoMuted);
                  try { navigator.vibrate?.(12); } catch {}
                }}
                className={`w-[28px] h-[28px] rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 shadow-md ${
                  videoMuted 
                    ? "bg-red-500 text-white hover:bg-red-600 ring-2 ring-red-400/40" 
                    : "bg-background text-foreground hover:bg-secondary border border-border/80"
                }`}
                title={videoMuted ? "إلغاء كتم صوت الفيديو" : "كتم صوت الفيديو"}
              >
                {videoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {clipElements}
            {keyframesOverlay}

            <div data-no-scrub className="absolute h-full" style={{ left: totalPx + 4, width: 48 }}>
              <MediaPicker
                accept="both"
                className="w-full h-full rounded-md border-2 border-dashed border-primary/50 bg-card/40 flex items-center justify-center hover:border-primary"
              >
                <Plus className="w-5 h-5 text-primary" />
              </MediaPicker>
            </div>
          </div>
        </div>

        {/* Fixed playhead — hidden when parent draws unified one */}
        {!hidePlayhead && (
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-primary pointer-events-none z-30">
            <div className="w-3 h-3 -ml-[5px] -mt-1 rounded-full bg-primary glow-primary-sm" />
            <div className="w-3 h-3 -ml-[5px] absolute bottom-0 rounded-full bg-primary glow-primary-sm" />
          </div>
        )}

        {/* Edge fades */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-card to-transparent z-20" />
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-l from-card to-transparent z-20" />
      </div>
    </div>
  );
});

Timeline.displayName = "Timeline";
export default Timeline;
