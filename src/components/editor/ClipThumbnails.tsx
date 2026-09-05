import { useEffect, useRef, useState, memo } from "react";
import { Clip, MediaItem } from "@/context/MediaContext";
import { generateThumbnails, getThumbnailTierCount } from "@/lib/videoUtils";

interface Props {
  clip: Clip;
  media: MediaItem;
  pxPerSec: number;
  isDragging?: boolean;
  isInteracting?: boolean;
}

const ClipThumbnails = memo(({ clip, media, pxPerSec, isDragging, isInteracting }: Props) => {
  const interacting = Boolean(isDragging || isInteracting);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const lastKey = useRef("");
  const cachedSnapshotRef = useRef<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const frozenCountRef = useRef<number>(1);

  const widthPx = Math.max(40, (clip.out - clip.in) * pxPerSec);
  const rawCount = getThumbnailTierCount(widthPx);

  if (!interacting) {
    frozenCountRef.current = rawCount;
  }
  const count = interacting ? (frozenCountRef.current || rawCount) : rawCount;

  useEffect(() => {
    // If dragging or trimming is active, freeze extraction and retain current cached snapshot
    if (interacting) {
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

    const key = `${mediaKey}-${clip.in.toFixed(2)}-${clip.out.toFixed(2)}-${count}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (media.type === "image") {
      const arr = Array(count).fill(effectiveVideoUrl);
      cachedSnapshotRef.current = arr;
      setThumbs(arr);
      return;
    }

    // Instantly abort any active extraction task
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    // Use existing snapshot or initialize with skeleton slots
    if (cachedSnapshotRef.current.length === 0) {
      setThumbs(Array(count).fill(""));
    }

    generateThumbnails(
      effectiveVideoUrl,
      count,
      clip.in,
      clip.out,
      96,
      (updatedThumbs) => {
        if (signal.aborted) return;
        setThumbs(() => {
          const arr = Array(count).fill("");
          updatedThumbs.forEach((val, idx) => {
            if (idx < count) {
              arr[idx] = val;
            }
          });
          cachedSnapshotRef.current = arr;
          return arr;
        });
      },
      {
        mediaKey,
        signal,
      }
    ).then((t) => {
      if (!signal.aborted && t && t.length > 0) {
        setThumbs(() => {
          const arr = Array(count).fill("");
          t.forEach((val, idx) => {
            if (idx < count) {
              arr[idx] = val;
            }
          });
          cachedSnapshotRef.current = arr;
          return arr;
        });
      }
    });

    return () => {
      abortController.abort();
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    };
  }, [
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
