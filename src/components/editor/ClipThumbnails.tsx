import { useEffect, useRef, useState, memo, RefObject } from "react";
import { Clip, MediaItem } from "@/context/MediaContext";
import { generateThumbnails, getThumbnailTierCount, remapThumbnailsToCount } from "@/lib/videoUtils";

export { remapThumbnailsToCount };

interface Props {
  clip: Clip;
  media: MediaItem;
  pxPerSec: number;
  isDragging?: boolean;
  isInteracting?: boolean;
  containerRef?: RefObject<HTMLElement | null> | HTMLElement | null;
}

const ClipThumbnails = memo(({ clip, media, pxPerSec, isDragging, isInteracting, containerRef }: Props) => {
  const interacting = Boolean(isDragging || isInteracting);
  const rootElRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState<boolean>(() => typeof IntersectionObserver === "undefined");
  const lastKey = useRef("");
  const lastMediaKeyRef = useRef("");
  const cachedSnapshotRef = useRef<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const frozenCountRef = useRef<number>(1);
  const prevCountRef = useRef<number | null>(null);

  const widthPx = Math.max(40, (clip.out - clip.in) * pxPerSec);
  const rawCount = getThumbnailTierCount(widthPx);

  if (!interacting) {
    frozenCountRef.current = rawCount;
  }
  const count = interacting ? (frozenCountRef.current || rawCount) : rawCount;

  const [thumbs, setThumbs] = useState<string[]>(() => Array(count).fill(""));

  // Observe visibility within timeline container (+ 100% horizontal margin on each side)
  useEffect(() => {
    if (isVisible) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const el = rootElRef.current;
    if (!el) return;

    const rootNode =
      containerRef && typeof containerRef === "object" && "current" in containerRef
        ? containerRef.current
        : (containerRef ?? null);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      {
        root: rootNode,
        rootMargin: "0px 100% 0px 100%",
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [isVisible, containerRef]);

  useEffect(() => {
    // Before entering visible range: show skeletons only and do not start generation
    if (!isVisible) {
      setThumbs((prev) => (prev.length === count && prev.every((s) => s === "") ? prev : Array(count).fill("")));
      return;
    }

    // If dragging, trimming, or pinching is active, freeze extraction and retain current cached snapshot
    if (interacting) {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    const shouldUseProcessed = clip.useProcessed !== false;
    const effectiveVideoUrl = (shouldUseProcessed && (clip.processedUrl || media.processedUrl))
      ? (clip.processedUrl || media.processedUrl!)
      : (clip.originalUrl || media.originalUrl || media.url);

    const revision = clip.mediaRevision || media.mediaRevision || 0;
    const procFlag = (shouldUseProcessed && (clip.processedUrl || media.processedUrl)) ? "proc" : "raw";
    const mediaKey = `${media.id}_${clip.id}_r${revision}_${procFlag}`;

    if (lastMediaKeyRef.current && lastMediaKeyRef.current !== mediaKey) {
      cachedSnapshotRef.current = [];
      lastKey.current = "";
    }
    lastMediaKeyRef.current = mediaKey;

    const key = `${mediaKey}-${clip.in.toFixed(2)}-${clip.out.toFixed(2)}-${count}`;
    if (key === lastKey.current && cachedSnapshotRef.current.length === count) {
      return;
    }

    if (media.type === "image") {
      const arr = Array(count).fill(effectiveVideoUrl);
      cachedSnapshotRef.current = arr;
      lastKey.current = key;
      prevCountRef.current = count;
      setThumbs(arr);
      return;
    }

    // Retain previous thumbnails remapped to the new count as temporary placeholders
    const placeholders = remapThumbnailsToCount(cachedSnapshotRef.current, count);
    setThumbs(placeholders);

    const isCountChange = prevCountRef.current !== null && prevCountRef.current !== count;
    prevCountRef.current = count;

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    let completed = false;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    const startGeneration = () => {
      if (signal.aborted) return;

      generateThumbnails(
        effectiveVideoUrl,
        count,
        clip.in,
        clip.out,
        96,
        (updatedThumbs) => {
          if (signal.aborted) return;
          const merged = Array<string>(count).fill("");
          for (let idx = 0; idx < count; idx++) {
            merged[idx] = updatedThumbs[idx] || placeholders[idx] || "";
          }
          cachedSnapshotRef.current = merged;
          setThumbs(merged);
        },
        {
          mediaKey,
          signal,
        }
      ).then((t) => {
        if (signal.aborted) return;
        if (t && t.length === count) {
          const merged = Array<string>(count).fill("");
          for (let idx = 0; idx < count; idx++) {
            merged[idx] = t[idx] || placeholders[idx] || "";
          }
          cachedSnapshotRef.current = merged;
          setThumbs(merged);
          if (t.every((item) => Boolean(item))) {
            completed = true;
            lastKey.current = key;
          }
        }
      });
    };

    if (isCountChange) {
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        startGeneration();
      }, 200);
    } else {
      startGeneration();
    }

    return () => {
      if (!completed && lastKey.current === key) {
        lastKey.current = "";
      }
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      abortController.abort();
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    };
  }, [
    isVisible,
    media.id,
    media.url,
    media.type,
    media.processedUrl,
    media.originalUrl,
    media.mediaRevision,
    clip.id,
    clip.in,
    clip.out,
    clip.processedUrl,
    clip.originalUrl,
    clip.useProcessed,
    clip.mediaRevision,
    count,
    interacting,
  ]);

  return (
    <div
      ref={rootElRef}
      className="flex h-full w-full overflow-hidden pointer-events-none select-none relative"
      dir="ltr"
      style={clip.hasAlpha ? {
        backgroundImage: `
          linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), 
          linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), 
          linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), 
          linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)
        `,
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
      } : undefined}
    >
      {thumbs.map((src, i) => 
        !src ? (
          <div key={i} className="flex-1 h-full bg-secondary/40 animate-pulse border-r border-background/20 last:border-0" />
        ) : (
          <img
            key={i}
            src={src}
            alt=""
            decoding="async"
            className="flex-1 h-full object-cover animate-in fade-in duration-200"
            style={{ minWidth: 0 }}
            draggable={false}
          />
        )
      )}
    </div>
  );
});

ClipThumbnails.displayName = "ClipThumbnails";

export default ClipThumbnails;
