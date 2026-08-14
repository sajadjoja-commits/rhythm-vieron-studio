import { useEffect, useRef, useState, memo } from "react";
import { Clip, MediaItem } from "@/context/MediaContext";
import { generateThumbnails } from "@/lib/videoUtils";

interface Props {
  clip: Clip;
  media: MediaItem;
  pxPerSec: number;
}

const ClipThumbnails = memo(({ clip, media, pxPerSec }: Props) => {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const lastKey = useRef("");

  const widthPx = Math.max(40, (clip.out - clip.in) * pxPerSec);
  const count = Math.max(1, Math.min(10, Math.floor(widthPx / 50)));

  useEffect(() => {
    const key = `${media.id}-${clip.in.toFixed(2)}-${clip.out.toFixed(2)}-${count}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (media.type === "image") {
      setThumbs(Array(count).fill(media.url));
      return;
    }
    let cancelled = false;

    // Initialize with empty slot skeletons
    setThumbs(Array(count).fill(""));

    generateThumbnails(media.url, count, clip.in, clip.out, 120, (updatedThumbs) => {
      if (!cancelled) {
        setThumbs(() => {
          const arr = Array(count).fill("");
          updatedThumbs.forEach((val, idx) => {
            if (idx < count) {
              arr[idx] = val;
            }
          });
          return arr;
        });
      }
    }).then((t) => {
      if (!cancelled && t && t.length > 0) {
        setThumbs(() => {
          const arr = Array(count).fill("");
          t.forEach((val, idx) => {
            if (idx < count) {
              arr[idx] = val;
            }
          });
          return arr;
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [media.id, media.url, media.type, clip.in, clip.out, count]);

  return (
    <div className="flex h-full w-full overflow-hidden" dir="ltr">
      {thumbs.map((src, i) => 
        !src ? (
          <div key={i} className="flex-1 h-full bg-secondary/40 animate-pulse border-r border-background/20 last:border-0" />
        ) : (
          <img
            key={i}
            src={src}
            alt=""
            className="flex-1 h-full object-cover animate-in fade-in duration-300"
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
