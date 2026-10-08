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
  onDeselect?: () => void;
}

const TRANSITION_ICON: Partial<Record<TransitionType, string>> = {
  none: "—", fade: "◐", slide: "▶", zoom: "⊕", wipe: "▤", blur: "✦", dissolve: "❄",
  glitch: "⚡", spin: "🔄", flash: "💥", shutter: "📷", iris: "👁",
  split: "♊", mosaic: "▧", ripple: "≋", radar: "⎋",
  "whip-pan": "💨", "zoom-blur": "🌀", "glitch-slice": "⚡", "page-flip": "📖",
  "gsap-elastic-zoom": "🚀", "gsap-3d-flip": "💎", "gsap-stagger-wipe": "🪄", "gsap-elastic-bounce": "⚡",
  "sun-flare": "☀️", "light-leak": "🌅", "brush-paint": "🖌️", "bokeh-blur": "🎭",
  "cinematic-bars": "🎬", "cube-rotate": "📦", "color-flow": "🌈", "retro-pixel": "👾", "star-warp": "⭐",
  "liquid-melt": "💧", "cross-zoom": "💥", "glitch-rgb-shatter": "⚡", "burn-film": "🔥", "kaleido-spin": "🌀", "heart-zoom": "💖"
};

const KeyframeMarkers = memo(({ clip, pxPerSec, activeBuckets }: { clip: any; pxPerSec: number; activeBuckets: string }) => {
  const seenTimes = new Set<number>();
  const kfs = clip.keyframes || [];
  if (kfs.length === 0) return null;
  const activeSet = activeBuckets ? new Set(activeBuckets.split(",")) : null;
  
  return (
    <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none z-20 flex items-center overflow-visible">
      {kfs.map((kf: any) => {
        const tBucket = Math.round(kf.time * 20);
        if (seenTimes.has(tBucket)) return null;
        seenTimes.add(tBucket);

        // Turn green if the playhead is over/near the keyframe, blue otherwise
        const isOver = activeSet ? activeSet.has(String(tBucket)) : false;
        
        // Exact keyframe alignment
        const xPos = kf.time * pxPerSec;

        return (
          <div
            key={kf.id || `${kf.property}-${tBucket}`}
            className={`absolute w-3 h-3 border border-white shadow transition-all duration-150 ${
              isOver
                ? "bg-emerald-500 scale-125 border-emerald-200 ring-2 ring-emerald-400/50 z-25"
                : "bg-blue-500 border-blue-200 z-20"
            }`}
            style={{
              left: `${xPos}px`,
              transform: "translate(-50%, -50%) rotate(45deg)",
              top: "50%",
            }}
            title={`${kf.property}: ${kf.value}`}
          />
        );
      })}
    </div>
  );
});
KeyframeMarkers.displayName = "KeyframeMarkers";

const Timeline = memo(({ currentTime, onSeek, onOpenTransition, isPlaying, onUserScrub, onWidthChange, onPxPerSecChange, hidePlayhead, focused, pxPerSec: propPxPerSec, onOpenCover, onFocus, onDeselect }: Props) => {
  const { clips, getMediaById, totalDuration, removeClip, trimClip, moveClip, videoMuted, setVideoMuted, coverImage } = useMedia();

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

  const propPxPerSecRef = useRef(propPxPerSec);
  propPxPerSecRef.current = propPxPerSec;
  const onPxPerSecChangeRef = useRef(onPxPerSecChange);
  onPxPerSecChangeRef.current = onPxPerSecChange;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onUserScrubRef = useRef(onUserScrub);
  onUserScrubRef.current = onUserScrub;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onDeselectRef = useRef(onDeselect);
  onDeselectRef.current = onDeselect;
  const onOpenTransitionRef = useRef(onOpenTransition);
  onOpenTransitionRef.current = onOpenTransition;
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

  // Track the latest pxPerSec via Ref so our non-passive listener always uses the freshest values
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;
  
  const setPxPerSec = useCallback((p: number | ((prev: number) => number)) => {
    const currentPropPx = propPxPerSecRef.current;
    if (currentPropPx !== undefined) {
      const nextVal = typeof p === "function" ? p(currentPropPx) : p;
      if (nextVal !== currentPropPx) {
        pxPerSecRef.current = nextVal;
        onPxPerSecChangeRef.current?.(nextVal);
      }
    } else {
      setLocalPxPerSec((prev) => {
        const nextVal = typeof p === "function" ? p(prev) : p;
        pxPerSecRef.current = nextVal;
        return nextVal;
      });
    }
  }, []);

  const [containerW, setContainerW] = useState(360);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Auto-deselect clip when track focus is cleared
  useEffect(() => {
    if (focused === false) {
      setSelectedClipId(null);
    }
  }, [focused]);
  const isScrubbingRef = useRef(false);
  const isTrimmingRef = useRef(false);
  isTrimmingRef.current = isTrimming;
  const dragIdRef = useRef<string | null>(null);
  dragIdRef.current = dragId;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;
  const selectedClipIdRef = useRef(selectedClipId);
  selectedClipIdRef.current = selectedClipId;

  // Active pointers tracking to prevent 2nd finger from triggering scrub/move
  const activePointersRef = useRef<Set<number>>(new Set());
  const cancelActiveGestureRef = useRef<(() => void) | null>(null);

  // Touch inertial scrolling refs & helper
  const inertiaFrameRef = useRef<number | null>(null);
  
  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  const longPressTimerRef = useRef<number | null>(null);

  const cancelActiveGesture = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    stopInertia();
    if (cancelActiveGestureRef.current) {
      const fn = cancelActiveGestureRef.current;
      cancelActiveGestureRef.current = null;
      fn();
    }
  }, [stopInertia]);

  const handlePointerDownCapture = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.add(e.pointerId);
    if (activePointersRef.current.size > 1) {
      cancelActiveGesture();
    }
  }, [cancelActiveGesture]);

  const handlePointerUpOrCancelCapture = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
  }, []);

  // Ensure activePointersRef never retains stale pointers released outside container
  useEffect(() => {
    const onGlobalPointerEnd = (ev: PointerEvent) => {
      activePointersRef.current.delete(ev.pointerId);
    };
    const onWindowBlur = () => {
      activePointersRef.current.clear();
    };
    window.addEventListener("pointerup", onGlobalPointerEnd, { passive: true, capture: true });
    window.addEventListener("pointercancel", onGlobalPointerEnd, { passive: true, capture: true });
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointerup", onGlobalPointerEnd, { capture: true });
      window.removeEventListener("pointercancel", onGlobalPointerEnd, { capture: true });
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  // Cleanup inertia & timers on unmount
  useEffect(() => {
    return () => {
      if (inertiaFrameRef.current !== null) {
        cancelAnimationFrame(inertiaFrameRef.current);
      }
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Auto-update selectedClipId when currentTime moves while track is focused, so the active clip at the playhead is selected
  useEffect(() => {
    if (focused === false || isTrimmingRef.current || dragIdRef.current !== null) return;
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
      setSelectedClipId((prev) => (prev === foundId ? prev : foundId));
    }
  }, [currentTime, clips, focused]);

  // Touch Pinch-to-Zoom State & Handlers
  const touchRef = useRef<{ initialDist: number; initialPx: number } | null>(null);
  const isPinchingRef = useRef(false);
  const pinchRafRef = useRef<number | null>(null);
  const pendingPxRef = useRef<number | null>(null);
  const pinchUnlockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // Pinch Lock: Disable pinch zoom if a clip is actively being trimmed or reordered
      if (isTrimmingRef.current || dragIdRef.current !== null) {
        isPinchingRef.current = false;
        touchRef.current = null;
        return;
      }

      if (e.touches.length >= 2) {
        // Immediately cancel any single-finger scrub/move/long-press gesture
        cancelActiveGesture();
        if (pinchUnlockTimerRef.current !== null) {
          clearTimeout(pinchUnlockTimerRef.current);
          pinchUnlockTimerRef.current = null;
        }
        isPinchingRef.current = true;
        setIsPinching(true);
        e.preventDefault(); // Stop native page zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.max(1, Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY));
        touchRef.current = {
          initialDist: dist,
          initialPx: pxPerSecRef.current
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isTrimmingRef.current || dragIdRef.current !== null) {
        isPinchingRef.current = false;
        touchRef.current = null;
        return;
      }

      if (e.touches.length >= 2) {
        e.preventDefault(); // Stop native page scroll/zoom
        if (!isPinchingRef.current) {
          cancelActiveGesture();
          isPinchingRef.current = true;
          setIsPinching(true);
        }
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.max(1, Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY));
        if (!touchRef.current) {
          touchRef.current = {
            initialDist: dist,
            initialPx: pxPerSecRef.current
          };
          return;
        }
        const ratio = dist / touchRef.current.initialDist;
        // Widen zoom range to 12 - 400 for a much more responsive and immersive feel!
        const newPx = Math.max(12, Math.min(400, Math.round(touchRef.current.initialPx * ratio)));
        if (newPx === pxPerSecRef.current && pendingPxRef.current === null) return;
        pendingPxRef.current = newPx;
        if (pinchRafRef.current === null) {
          pinchRafRef.current = requestAnimationFrame(() => {
            pinchRafRef.current = null;
            const targetPx = pendingPxRef.current;
            pendingPxRef.current = null;
            if (targetPx !== null && targetPx !== pxPerSecRef.current) {
              setPxPerSec(targetPx);
            }
          });
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        activePointersRef.current.clear();
      }
      if (e.touches.length < 2) {
        touchRef.current = null;
        if (pinchRafRef.current !== null) {
          cancelAnimationFrame(pinchRafRef.current);
          pinchRafRef.current = null;
        }
        if (pendingPxRef.current !== null && pendingPxRef.current !== pxPerSecRef.current) {
          setPxPerSec(pendingPxRef.current);
        }
        pendingPxRef.current = null;
        setIsPinching(false);
        // Keep isPinchingRef locked for 200ms to absorb any trailing touch tap/clicks
        if (pinchUnlockTimerRef.current !== null) {
          clearTimeout(pinchUnlockTimerRef.current);
        }
        pinchUnlockTimerRef.current = window.setTimeout(() => {
          pinchUnlockTimerRef.current = null;
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
      if (pinchRafRef.current !== null) {
        cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
      if (pinchUnlockTimerRef.current !== null) {
        clearTimeout(pinchUnlockTimerRef.current);
        pinchUnlockTimerRef.current = null;
      }
    };
  }, [setPxPerSec, cancelActiveGesture]);

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

        const nextTime = Math.max(0, Math.min(totalDurationRef.current, currentTimeRef.current + speed * deltaSec));
        if (nextTime !== currentTimeRef.current) {
          onSeekRef.current(nextTime);
          onScrollTick(deltaSec, speed);
        }
      } else {
        lastTime = performance.now();
      }
    }, 16);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastW = 0;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (Math.abs(lastW - w) >= 1) {
        lastW = w;
        setContainerW((prev) => (Math.abs(prev - w) < 1 ? prev : w));
        onWidthChangeRef.current?.(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (propPxPerSec === undefined) {
      onPxPerSecChangeRef.current?.(pxPerSec);
    }
  }, [pxPerSec, propPxPerSec]);

  const halfW = containerW / 2;
  const totalPx = totalDuration * pxPerSec;

  const tickInterval = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 2 : 5;
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let s = 0; s <= totalDuration + tickInterval; s += tickInterval) arr.push(s);
    return arr;
  }, [totalDuration, tickInterval]);

  const lastSnappedPtRef = useRef<number | null>(null);

  const snapPoints = useMemo(() => {
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

  const snapPointsRef = useRef(snapPoints);
  snapPointsRef.current = snapPoints;

  const applySnap = useCallback((time: number) => {
    const points = snapPointsRef.current;
    const thresholdPx = 10; // Snap within 10 pixels of any edge
    const thresholdSec = thresholdPx / pxPerSecRef.current;
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
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-scrub]")) return;
    if (!e.isPrimary || isPinchingRef.current || activePointersRef.current.size > 1) return;
    
    // Stop any currently running momentum/inertia scroll
    stopInertia();

    const targetEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCurrentTime = currentTimeRef.current;

    isScrubbingRef.current = true;
    onUserScrubRef.current?.(true);
    
    let hasMoved = false;
    let isCaptured = false;
    let isCancelled = false;
    let lastX = startX;
    let lastTime = performance.now();
    let velocity = 0; // px per millisecond

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (isCaptured) {
        isCaptured = false;
        try {
          if (targetEl.hasPointerCapture(pointerId)) {
            targetEl.releasePointerCapture(pointerId);
          }
        } catch {}
      }
      if (cancelActiveGestureRef.current === cancel) {
        cancelActiveGestureRef.current = null;
      }
    };

    const cancel = () => {
      if (isCancelled) return;
      isCancelled = true;
      isScrubbingRef.current = false;
      onUserScrubRef.current?.(false);
      stopInertia();
      cleanup();
    };

    cancelActiveGestureRef.current = cancel;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (isCancelled || !isScrubbingRef.current || isPinchingRef.current || activePointersRef.current.size > 1) {
        cancel();
        return;
      }
      const currentX = ev.clientX;
      const currentY = ev.clientY;
      const now = performance.now();
      const dt = now - lastTime;
      const dxTotal = currentX - startX;
      const dyTotal = currentY - startY;

      if (!isCaptured && Math.abs(dyTotal) > Math.abs(dxTotal) && Math.abs(dyTotal) > 5) {
        // User is scrolling vertically — cancel scrub so container scrolls natively
        cancel();
        return;
      }

      const dxStep = currentX - lastX;

      if (Math.abs(dxTotal) > 3) {
        hasMoved = true;
        if (!isCaptured) {
          isCaptured = true;
          try { targetEl.setPointerCapture(pointerId); } catch {}
        }
      }

      if (!hasMoved) return;

      if (dt > 0) {
        const instantVelocity = dxStep / dt;
        velocity = velocity * 0.4 + instantVelocity * 0.6; // low-pass smoothing
      }

      lastX = currentX;
      lastTime = now;

      let nextTime = Math.max(0, Math.min(totalDurationRef.current, startCurrentTime - dxTotal / pxPerSecRef.current));
      nextTime = applySnap(nextTime);
      onSeekRef.current(nextTime);
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      activePointersRef.current.delete(ev.pointerId);
      if (isCancelled) return;
      isScrubbingRef.current = false;
      onUserScrubRef.current?.(false);
      cleanup();
      
      // Discrete tap on timeline background deselects clip without jumping playhead
      if (!hasMoved && !isPinchingRef.current && activePointersRef.current.size === 0) {
        setSelectedClipId(null);
        onDeselectRef.current?.();
      } else if (hasMoved && !isPinchingRef.current && activePointersRef.current.size === 0 && Math.abs(velocity) > 0.05) {
        // Trigger high-performance momentum inertia scrolling
        let currentVelocity = velocity;
        let lastFrameTime = performance.now();
        onUserScrubRef.current?.(true);

        const runInertia = () => {
          if (isPinchingRef.current || activePointersRef.current.size > 0) {
            onUserScrubRef.current?.(false);
            inertiaFrameRef.current = null;
            return;
          }
          const now = performance.now();
          const frameTime = now - lastFrameTime;
          lastFrameTime = now;

          // Smoothly decay velocity (friction)
          const friction = 0.94;
          currentVelocity *= Math.pow(friction, frameTime / 16);

          if (Math.abs(currentVelocity) < 0.04) {
            onUserScrubRef.current?.(false);
            inertiaFrameRef.current = null;
            return;
          }

          const deltaPx = currentVelocity * frameTime;
          const dur = totalDurationRef.current;
          const nextTime = Math.max(0, Math.min(dur, currentTimeRef.current - deltaPx / pxPerSecRef.current));
          onSeekRef.current(nextTime);

          if (nextTime <= 0 || nextTime >= dur) {
            onUserScrubRef.current?.(false);
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
    window.addEventListener("pointercancel", cancel);
  }, [applySnap, stopInertia]);

  const startTrim = useCallback((e: React.PointerEvent, clipId: string, edge: "in" | "out", clip: { in: number; out: number; mediaId: string }) => {
    e.stopPropagation();
    e.preventDefault();
    if (!e.isPrimary || isPinchingRef.current || activePointersRef.current.size > 1) return;
    setSelectedClipId(clipId);
    setIsTrimming(true);
    isTrimmingRef.current = true;
    onFocusRef.current?.();

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
    const currentClips = clipsRef.current;
    const fromIdx = currentClips.findIndex((c) => c.id === clipId);
    let clipGlobalStart = 0;
    for (let i = 0; i < fromIdx && i < currentClips.length; i++) {
      clipGlobalStart += currentClips[i].out - currentClips[i].in;
    }
    const initialClipDuration = clip.out - clip.in;
    const clipGlobalEnd = clipGlobalStart + initialClipDuration;
    const initialPlayhead = currentTimeRef.current;
    const playheadInsideClip = initialPlayhead >= clipGlobalStart - 0.05 && initialPlayhead <= clipGlobalEnd + 0.05;

    const media = getMediaById(clip.mediaId);
    const isVideo = media && media.type === "video";
    const maxSourceDuration = isVideo && media.duration > 0 ? media.duration : Infinity;

    const updateTrim = (currentX: number) => {
      const dt = (currentX - startXAdjusted) / pxPerSecRef.current;
      if (edge === "in") {
        const newIn = Math.max(0, Math.min(startIn + dt, startOut - 0.1));
        trimClip(clipId, "in", newIn);
        // Visual Anchoring: Only update playhead if playhead was inside the affected clip
        if (playheadInsideClip) {
          onSeekRef.current(clipGlobalStart);
        }
      } else {
        const proposedOut = Math.max(startIn + 0.1, Math.min(startOut + dt, maxSourceDuration));
        if (proposedOut >= maxSourceDuration) {
          triggerHapticTick("medium");
        }
        trimClip(clipId, "out", proposedOut);
        // Visual Anchoring: Only update playhead preview if playhead was inside the affected clip
        if (playheadInsideClip) {
          onSeekRef.current(clipGlobalStart + (proposedOut - startIn));
        }
      }
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastPointerXRef.current = ev.clientX;
      updateTrim(ev.clientX);
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      activePointersRef.current.delete(ev.pointerId);
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
      const scrolledPx = speed * deltaSec * pxPerSecRef.current;
      startXAdjusted -= scrolledPx;
      updateTrim(lastPointerXRef.current);
    }, 1.8); // Smooth and controlled auto-scroll speed (1.8x) during trim prevents visual zoom illusion

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [trimClip, startAutoScroll, stopAutoScroll, getMediaById]);

  const COMPACT_W = 68;
  const GAP = 10;
  const slotWidth = COMPACT_W + GAP;
  const isReordering = dragId !== null;
  const fromIdx = isReordering ? clips.findIndex((c) => c.id === dragId) : -1;
  const hoverIdx = isReordering && fromIdx !== -1 
    ? Math.max(0, Math.min(clips.length - 1, Math.round((fromIdx * slotWidth + dragDx) / slotWidth))) 
    : -1;

  const startMove = useCallback((e: React.PointerEvent, clipId: string) => {
    // Stop event bubbling so outer timeline canvas click listener doesn't overwrite our seek
    e.stopPropagation();

    // If clicking on a trim handle or delete button, let them handle it
    if ((e.target as HTMLElement).closest("[data-no-scrub]")) return;
    if (!e.isPrimary || isPinchingRef.current || activePointersRef.current.size > 1) return;

    const currentClips = clipsRef.current;
    const clipIdx = currentClips.findIndex((c) => c.id === clipId);
    if (clipIdx === -1) return;

    stopInertia();

    // Determine current clip index from playhead position prior to click
    let currentClipIdx = -1;
    let accTimeline = 0;
    for (let i = 0; i < currentClips.length; i++) {
      const dur = currentClips[i].out - currentClips[i].in;
      if (currentTimeRef.current >= accTimeline - 0.05 && currentTimeRef.current < accTimeline + dur - 0.05) {
        currentClipIdx = i;
        break;
      }
      accTimeline += dur;
    }
    if (currentClipIdx === -1 && currentClips.length > 0) {
      currentClipIdx = currentTimeRef.current >= accTimeline ? currentClips.length - 1 : 0;
    }

    const prevSelectedClipId = selectedClipIdRef.current;
    const prevIdx = currentClips.findIndex((c) => c.id === prevSelectedClipId);
    const refIdx = prevIdx !== -1 ? prevIdx : currentClipIdx;
    const isDifferentClip = clipIdx !== refIdx;

    // Calculate target clip's start and end on the timeline
    let accTime = 0;
    let targetStart = 0;
    let targetEnd = 0;
    for (let i = 0; i < currentClips.length; i++) {
      const c = currentClips[i];
      const dur = c.out - c.in;
      if (c.id === clipId) {
        targetStart = accTime;
        targetEnd = accTime + dur;
        break;
      }
      accTime += dur;
    }

    setSelectedClipId(clipId);
    selectedClipIdRef.current = clipId;
    onFocusRef.current?.();

    let targetTime = currentTimeRef.current;
    if (clipIdx > refIdx) {
      // Going forward to next/later clip -> snap directly to FIRST handle (start)
      targetTime = targetStart;
    } else if (clipIdx < refIdx) {
      // Going backward to previous/earlier clip -> snap directly to LAST handle (end)
      targetTime = Math.max(targetStart, targetEnd - 0.04);
    }

    if (isDifferentClip) {
      onSeekRef.current(targetTime);
      triggerHapticTick("light");
    } else {
      triggerHapticTick("light");
    }

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let lastX = startX;
    let hasMoved = false;
    let isReorderMode = false;
    let isCancelled = false;

    const cleanup = () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (cancelActiveGestureRef.current === cancel) {
        cancelActiveGestureRef.current = null;
      }
    };

    const cancel = () => {
      if (isCancelled) return;
      isCancelled = true;
      cleanup();
      isScrubbingRef.current = false;
      onUserScrubRef.current?.(false);
      stopInertia();
      if (isReorderMode || dragIdRef.current !== null) {
        isReorderMode = false;
        dragIdRef.current = null;
        setDragId(null);
        setDragDx(0);
      }
    };

    cancelActiveGestureRef.current = cancel;

    // CapCut style long-press (350ms): hold to reorder
    if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      if (!hasMoved && !isCancelled && !isPinchingRef.current && activePointersRef.current.size <= 1) {
        isReorderMode = true;
        dragIdRef.current = clipId;
        setDragId(clipId);
        triggerHapticTick("medium");
        try { navigator.vibrate?.(35); } catch {}
      }
    }, 350);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (isCancelled || isPinchingRef.current || activePointersRef.current.size > 1) {
        cancel();
        return;
      }
      const currentX = ev.clientX;
      const currentY = ev.clientY;
      const dxTotal = currentX - startX;
      const dyTotal = currentY - startY;

      if (Math.hypot(dxTotal, dyTotal) > 8) {
        hasMoved = true;
        if (!isReorderMode && longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      if (isReorderMode) {
        lastPointerXRef.current = currentX;
        setDragDx(dxTotal);
      } else if (hasMoved) {
        // Smooth timeline scrub across clips only after intentional drag
        isScrubbingRef.current = true;
        const dxStep = currentX - lastX;
        lastX = currentX;
        const nextTime = Math.max(0, Math.min(totalDurationRef.current, currentTimeRef.current - dxStep / pxPerSecRef.current));
        onSeekRef.current(nextTime);
        onUserScrubRef.current?.(true);
      }
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      activePointersRef.current.delete(ev.pointerId);
      if (isCancelled) return;
      cleanup();
      isScrubbingRef.current = false;
      onUserScrubRef.current?.(false);

      if (isReorderMode) {
        const finalX = lastPointerXRef.current;
        const dx = finalX - startX;
        const latestClips = clipsRef.current;
        const target = Math.max(0, Math.min(latestClips.length - 1, Math.round((clipIdx * slotWidth + dx) / slotWidth)));
        moveClip(clipId, target);
        triggerHapticTick("medium");
        try { navigator.vibrate?.(12); } catch {}
        dragIdRef.current = null;
        setDragId(null);
        setDragDx(0);
      } else if (!hasMoved && isDifferentClip && !isPinchingRef.current && activePointersRef.current.size === 0) {
        // Confirm discrete tap on a different clip jumped to first or last handle
        onSeekRef.current(targetTime);
      }
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }, [slotWidth, moveClip, stopInertia]);

  const translateX = isReordering && fromIdx !== -1
    ? halfW - (fromIdx * slotWidth + COMPACT_W / 2)
    : halfW - currentTime * pxPerSec;

  // Compute active keyframe buckets per clip so clipElements only updates when a keyframe actually crosses the playhead (< 0.08s)
  const activeKeyframeSignature = useMemo(() => {
    let acc = 0;
    let sig = "";
    for (const clip of clips) {
      const len = clip.out - clip.in;
      const kfs = clip.keyframes;
      if (kfs && kfs.length > 0 && currentTime >= acc - 0.1 && currentTime <= acc + len + 0.1) {
        const buckets: number[] = [];
        for (const kf of kfs) {
          if (Math.abs(currentTime - (acc + kf.time)) < 0.08) {
            buckets.push(Math.round(kf.time * 20));
          }
        }
        if (buckets.length > 0) {
          sig += `${clip.id}:${buckets.join(",")};`;
        }
      }
      acc += len;
    }
    return sig;
  }, [clips, currentTime]);

  const clipElements = useMemo(() => {
    const activeByClip = new Map<string, string>();
    if (activeKeyframeSignature) {
      for (const part of activeKeyframeSignature.split(";")) {
        if (!part) continue;
        const colonIdx = part.indexOf(":");
        if (colonIdx !== -1) {
          activeByClip.set(part.slice(0, colonIdx), part.slice(colonIdx + 1));
        }
      }
    }

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
            transition: dragging || isTrimming || isPinching ? "none" : isReordering ? "all 200ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          }}
        >
          <div
            className={`relative h-full overflow-visible cursor-grab active:cursor-grabbing shadow-md transition-colors duration-150 ${
              dragging 
                ? "border-2 border-amber-400 ring-4 ring-amber-400/80 z-30 shadow-2xl bg-slate-950/95 backdrop-blur-md rounded-2xl transform shadow-amber-500/40 brightness-110 flex items-center justify-center" 
                : isReordering
                ? "border-2 border-slate-600/80 bg-slate-900/90 shadow-lg rounded-xl"
                : focused !== false && selectedClipId === clip.id
                ? "bg-secondary z-20"
                : "rounded-xl border border-white/20 hover:border-white/40 bg-secondary"
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

            {/* Seamless unified selection outline spanning handles and media cleanly */}
            {!isReordering && focused !== false && selectedClipId === clip.id && (
              <div className="absolute -left-3.5 sm:-left-4 -right-3.5 sm:-right-4 -top-[2px] -bottom-[2px] rounded-xl border-2 border-primary ring-2 ring-primary/40 pointer-events-none z-30" />
            )}

            {/* Thumbnails clipped neatly: straight edges when selected to connect flush with handles, rounded-xl when unselected */}
            <div className={`absolute inset-0 overflow-hidden pointer-events-none ${focused !== false && selectedClipId === clip.id ? "rounded-none" : "rounded-xl"}`}>
              <ClipThumbnails
                clip={clip}
                media={media}
                pxPerSec={pxPerSec}
                isDragging={dragging || isReordering}
                isInteracting={isTrimming || isReordering || isPinching}
                containerRef={containerRef}
              />
            </div>
            
            {/* Keyframe Markers Layer inside clip (z-20) */}
            {!isReordering && clip.keyframes && clip.keyframes.length > 0 && (
              <KeyframeMarkers
                clip={clip}
                pxPerSec={pxPerSec}
                activeBuckets={activeByClip.get(clip.id) || ""}
              />
            )}

            {/* Left Trim Handle positioned outside to the left so playhead at 0s stops at its inner edge */}
            {!isReordering && focused !== false && selectedClipId === clip.id && (
              <TimelineTrimHandle
                side="left"
                variant="primary"
                onPointerDown={(e) => startTrim(e, clip.id, "in", clip)}
                className="absolute -left-3.5 sm:-left-4 top-0 bottom-0 z-20"
              />
            )}
            {/* Right Trim Handle positioned outside to the right so playhead at clip end stops at its inner edge */}
            {!isReordering && focused !== false && selectedClipId === clip.id && (
              <TimelineTrimHandle
                side="right"
                variant="primary"
                isMaxReached={media?.type === "video" && media.duration > 0 && clip.out >= media.duration - 0.05}
                onPointerDown={(e) => startTrim(e, clip.id, "out", clip)}
                className="absolute -right-3.5 sm:-right-4 top-0 bottom-0 z-20"
              />
            )}
            {!isReordering && (
              <div className={`absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs flex items-center justify-between z-10 ${focused !== false && selectedClipId === clip.id ? "rounded-b-none" : "rounded-b-xl"} overflow-hidden`}>
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
              <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/75 backdrop-blur-xs flex items-center justify-center z-10 rounded-b-xl overflow-hidden">
                <span className="text-[9px] text-white/90 font-mono font-semibold">{len.toFixed(1)}s</span>
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [clips, getMediaById, pxPerSec, startTrim, startMove, removeClip, dragId, dragDx, selectedClipId, focused, isTrimming, isPinching, isReordering, fromIdx, hoverIdx, slotWidth, activeKeyframeSignature]);

  // CapCut Transition Cut Buttons between adjacent clips
  // Must appear ONLY when the user has NOT selected a clip or track
  const isClipSelected = focused !== false && selectedClipId !== null;

  const transitionElements = useMemo(() => {
    if (isReordering || isClipSelected || clips.length < 2) return null;
    let cutAcc = 0;
    return clips.map((clip, idx) => {
      const len = clip.out - clip.in;
      if (idx === 0) {
        cutAcc += len;
        return null;
      }
      const cutPx = cutAcc * pxPerSec;
      cutAcc += len;

      const hasTransition = clip.transitionIn && clip.transitionIn.type !== "none";

      return (
        <button
          key={`trans-${clip.id}`}
          data-no-scrub
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenTransitionRef.current(clip.id);
          }}
          style={{
            left: `${cutPx}px`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 45,
          }}
          className={`absolute w-[18px] h-[28px] rounded-[6px] shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-120 active:scale-95 pointer-events-auto select-none ${
            hasTransition
              ? "bg-primary text-primary-foreground border border-primary/60 ring-2 ring-primary/40 shadow-primary/30"
              : "bg-white hover:bg-slate-100 text-slate-900 border border-black/25 shadow-md"
          }`}
          title={hasTransition ? `انتقال: ${clip.transitionIn!.type}` : "إضافة انتقال بين المقطعين"}
        >
          {hasTransition ? (
            <span className="text-[10px] font-black leading-none">{TRANSITION_ICON[clip.transitionIn!.type] || "⧉"}</span>
          ) : (
            <div className="w-[1.5px] h-3.5 bg-slate-800 rounded-full" />
          )}
        </button>
      );
    });
  }, [isReordering, isClipSelected, clips, pxPerSec]);

  return (
    <div className="bg-card/60 border-t border-border" dir="ltr">
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none touch-pan-y"
        style={{ height: 110, touchAction: "pan-y" }}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerUpCapture={handlePointerUpOrCancelCapture}
        onPointerCancelCapture={handlePointerUpOrCancelCapture}
        onPointerDown={handlePointerDown}
      >
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            width: totalPx + 160,
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

            {/* CapCut Transition buttons between adjacent clips - placed in top layer so BOTH halves are completely visible */}
            {!isReordering && transitionElements}

            <div data-no-scrub className="absolute h-full flex items-center" style={{ left: totalPx + 14, width: 44 }} title="إضافة فيديو أو صور جديدة (+)">
              <MediaPicker
                accept="both"
                className="w-full h-[54px] rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/25 shadow-lg backdrop-blur-sm flex items-center justify-center cursor-pointer transition-all group"
              >
                <Plus className="w-5 h-5 text-white/90 group-hover:text-white stroke-[2.5] transition-colors" />
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
