import type { Clip, MediaItem, OverlayItem } from "@/context/MediaContext";

export interface PreloadPlanItem {
  url: string;
  type: "image" | "video";
  aliases: string[];
}

export interface OverlayPreloadInput {
  id?: string;
  url: string;
  type?: "image" | "video" | string;
}

/**
 * Builds a deduplicated preload plan with one entry per unique (url, type) pair
 * and all associated lookup aliases (clip.id, clip.mediaId, url, overlay.id, overlay.url, media.id).
 */
export function buildPreloadPlan(
  clips: Pick<Clip, "id" | "mediaId" | "useProcessed" | "processedUrl" | "originalUrl">[],
  media: Pick<MediaItem, "id" | "url" | "type" | "processedUrl" | "originalUrl">[],
  overlays: OverlayPreloadInput[] = []
): PreloadPlanItem[] {
  const mediaById = new Map<string, Pick<MediaItem, "id" | "url" | "type" | "processedUrl" | "originalUrl">>();
  for (const m of media) {
    if (m && m.id) {
      mediaById.set(m.id, m);
    }
  }

  const planMap = new Map<string, { url: string; type: "image" | "video"; aliases: Set<string> }>();
  // Track which mediaId has already been assigned to a primary URL so a second clip
  // with different processed/original settings doesn't overwrite clip.id specificity.
  const claimedMediaIds = new Set<string>();

  const addEntry = (url: string, type: "image" | "video", aliases: (string | undefined | null)[]) => {
    const trimmedUrl = (url || "").trim();
    if (!trimmedUrl) return;
    const normalizedType: "image" | "video" = type === "image" ? "image" : "video";
    const key = `${normalizedType}::${trimmedUrl}`;

    let entry = planMap.get(key);
    if (!entry) {
      entry = {
        url: trimmedUrl,
        type: normalizedType,
        aliases: new Set<string>([trimmedUrl]),
      };
      planMap.set(key, entry);
    }

    for (const alias of aliases) {
      if (alias && typeof alias === "string" && alias.trim().length > 0) {
        entry.aliases.add(alias.trim());
      }
    }
  };

  for (const c of clips) {
    const m = mediaById.get(c.mediaId);
    const shouldUseProcessed = c.useProcessed !== false;
    const effectiveUrl =
      shouldUseProcessed && (c.processedUrl || m?.processedUrl)
        ? c.processedUrl || m?.processedUrl || ""
        : c.originalUrl || m?.originalUrl || m?.url || c.mediaId;

    const effectiveType: "image" | "video" = m?.type === "image" ? "image" : "video";

    const aliasesToAssign: (string | undefined)[] = [c.id, effectiveUrl];
    if (c.mediaId && !claimedMediaIds.has(c.mediaId)) {
      claimedMediaIds.add(c.mediaId);
      aliasesToAssign.push(c.mediaId);
    }

    addEntry(effectiveUrl, effectiveType, aliasesToAssign);
  }

  for (const o of overlays) {
    if (!o || !o.url) continue;
    const m = mediaById.get(o.url);
    const resolvedUrl = m ? m.url : o.url;
    const resolvedType: "image" | "video" =
      o.type === "video" ? "video" : m?.type === "video" ? "video" : "image";

    addEntry(resolvedUrl, resolvedType, [o.id, o.url, resolvedUrl, m?.id]);
  }

  return Array.from(planMap.values()).map((item) => ({
    url: item.url,
    type: item.type,
    aliases: Array.from(item.aliases),
  }));
}

/**
 * Runs asynchronous tasks over items with a strict maximum concurrency limit.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  isAborted?: () => boolean
): Promise<void> {
  if (items.length === 0) return;
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const runners = Array.from({ length: maxWorkers }, async () => {
    while (nextIndex < items.length) {
      if (isAborted?.()) return;
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

/**
 * Releases all HTMLVideoElement decoders, clears src attributes, and removes the hidden container from DOM.
 */
export function cleanupPreloadedElements(
  hiddenContainer: HTMLElement | null,
  preloadedMap?: Record<string, HTMLImageElement | HTMLVideoElement>,
  trackedVideos?: Iterable<HTMLVideoElement>
): void {
  const videosToClean = new Set<HTMLVideoElement>();

  if (hiddenContainer) {
    try {
      const domVideos = hiddenContainer.querySelectorAll("video");
      domVideos.forEach((v) => videosToClean.add(v));
    } catch {}
  }

  if (preloadedMap) {
    for (const key of Object.keys(preloadedMap)) {
      const el = preloadedMap[key];
      if (typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement) {
        videosToClean.add(el);
      } else if (el && (el as any).tagName === "VIDEO") {
        videosToClean.add(el as HTMLVideoElement);
      }
      delete preloadedMap[key];
    }
  }

  if (trackedVideos) {
    for (const v of trackedVideos) {
      if (v) videosToClean.add(v);
    }
  }

  for (const video of videosToClean) {
    try {
      video.pause();
    } catch {}
    try {
      video.removeAttribute("src");
      video.load();
    } catch {}
  }

  if (hiddenContainer) {
    try {
      if (hiddenContainer.parentNode) {
        hiddenContainer.parentNode.removeChild(hiddenContainer);
      } else {
        hiddenContainer.remove();
      }
    } catch {}
  }
}
