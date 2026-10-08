import { Capacitor } from "@capacitor/core";
import { robustSeekVideo } from "@/lib/videoSeeking";
import { thumbnailService } from "@/services/media/ThumbnailService";

export function getThumbnailTierCount(widthPx: number): number {
  if (widthPx < 100) return 1;
  if (widthPx < 300) return 3;
  if (widthPx < 700) return 6;
  return 12;
}

/**
 * Pure helper to remap previous thumbnails to a new tier count without grey skeleton flash.
 * Each slot i takes the nearest previous thumbnail at index floor(i * prev.length / count).
 */
export function remapThumbnailsToCount(prev: string[], count: number): string[] {
  if (count <= 0) return [];
  if (!prev || prev.length === 0) return Array(count).fill("");
  if (prev.length === count) return [...prev];
  const next = Array<string>(count).fill("");
  for (let i = 0; i < count; i++) {
    const idx = Math.min(prev.length - 1, Math.floor((i * prev.length) / count));
    next[i] = prev[idx] || "";
  }
  return next;
}

export function isCompleteThumbnailArray(arr: string[] | undefined, count: number): boolean {
  return Boolean(
    arr &&
      count > 0 &&
      arr.length === count &&
      arr.every((item) => typeof item === "string" && item.length > 0)
  );
}

// Generate thumbnails along a video — uses robustSeekVideo and caches rendered frames
// Cache key is strictly tied to media identifier, in/out range and stepped tier count (not zoom/pxPerSec/width)
export const MAX_THUMB_CACHE_ENTRIES = 300;
const thumbCache = new Map<string, string[]>();

export function getCachedThumbnails(cacheKey: string, count: number): string[] | undefined {
  const cached = thumbCache.get(cacheKey);
  if (!cached) return undefined;
  if (!isCompleteThumbnailArray(cached, count)) {
    thumbCache.delete(cacheKey);
    return undefined;
  }
  // Refresh LRU order
  thumbCache.delete(cacheKey);
  thumbCache.set(cacheKey, cached);
  return cached;
}

export function setCachedThumbnails(
  cacheKey: string,
  thumbs: string[],
  count: number,
  maxEntries: number = MAX_THUMB_CACHE_ENTRIES
): boolean {
  if (!isCompleteThumbnailArray(thumbs, count)) return false;
  if (thumbCache.has(cacheKey)) {
    thumbCache.delete(cacheKey);
  }
  while (thumbCache.size >= maxEntries && thumbCache.size > 0) {
    const oldestKey = thumbCache.keys().next().value;
    if (oldestKey === undefined) break;
    thumbCache.delete(oldestKey);
  }
  thumbCache.set(cacheKey, [...thumbs]);
  return true;
}

export function clearThumbnailCache(): void {
  thumbCache.clear();
}

export function getThumbnailCacheKeys(): string[] {
  return Array.from(thumbCache.keys());
}

// Small LRU pool of <video> elements (max 2) keyed by videoUrl
const MAX_VIDEO_POOL_SIZE = 2;
interface PooledVideoEntry {
  videoUrl: string;
  video: HTMLVideoElement;
  inUse: boolean;
}
const videoPool = new Map<string, PooledVideoEntry>();

function closeVideoElement(video: HTMLVideoElement): void {
  try {
    video.removeAttribute("src");
    video.src = "";
    video.load();
  } catch {}
}

function createVideoElement(videoUrl: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  (video as any).playsInline = true;
  video.src = videoUrl;
  return video;
}

function acquirePooledVideo(videoUrl: string): { video: HTMLVideoElement; pooled: boolean } {
  const existing = videoPool.get(videoUrl);
  if (existing) {
    if (!existing.inUse) {
      existing.inUse = true;
      // Refresh LRU order
      videoPool.delete(videoUrl);
      videoPool.set(videoUrl, existing);
      return { video: existing.video, pooled: true };
    }
    // Never share the same <video> element between two tasks running at the same time
    return { video: createVideoElement(videoUrl), pooled: false };
  }

  if (videoPool.size >= MAX_VIDEO_POOL_SIZE) {
    let evictKey: string | undefined;
    for (const [k, entry] of videoPool.entries()) {
      if (!entry.inUse) {
        evictKey = k;
        break;
      }
    }
    if (evictKey !== undefined) {
      const evicted = videoPool.get(evictKey)!;
      videoPool.delete(evictKey);
      closeVideoElement(evicted.video);
    }
  }

  const video = createVideoElement(videoUrl);
  if (videoPool.size < MAX_VIDEO_POOL_SIZE) {
    videoPool.set(videoUrl, { videoUrl, video, inUse: true });
    return { video, pooled: true };
  }
  return { video, pooled: false };
}

function releasePooledVideo(videoUrl: string, video: HTMLVideoElement, hadError = false): void {
  const entry = videoPool.get(videoUrl);
  if (entry && entry.video === video) {
    if (hadError) {
      videoPool.delete(videoUrl);
      closeVideoElement(video);
    } else {
      entry.inUse = false;
      videoPool.delete(videoUrl);
      videoPool.set(videoUrl, entry);
    }
  } else {
    closeVideoElement(video);
  }
}

export function clearVideoElementPool(): void {
  for (const entry of videoPool.values()) {
    closeVideoElement(entry.video);
  }
  videoPool.clear();
}

export function getVideoPoolKeys(): string[] {
  return Array.from(videoPool.keys());
}

// Global concurrency lock to prevent frame seek storms on HTMLVideoElement
let activeThumbnailTasks = 0;
const MAX_CONCURRENT_THUMBNAIL_TASKS = 2;
const thumbnailQueue: Array<() => void> = [];

export function getActiveThumbnailTasksCount(): number {
  return activeThumbnailTasks;
}

async function acquireThumbnailLock(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  if (activeThumbnailTasks < MAX_CONCURRENT_THUMBNAIL_TASKS) {
    activeThumbnailTasks++;
    return true;
  }
  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const onAbort = () => {
      if (resolved) return;
      resolved = true;
      const idx = thumbnailQueue.indexOf(proceed);
      if (idx !== -1) thumbnailQueue.splice(idx, 1);
      resolve(false);
    };

    const proceed = () => {
      if (resolved) return;
      resolved = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(true);
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    thumbnailQueue.push(proceed);
  });
}

function releaseThumbnailLock(): void {
  activeThumbnailTasks = Math.max(0, activeThumbnailTasks - 1);
  while (thumbnailQueue.length > 0 && activeThumbnailTasks < MAX_CONCURRENT_THUMBNAIL_TASKS) {
    const next = thumbnailQueue.shift();
    if (next) {
      activeThumbnailTasks++;
      next();
    }
  }
}

export interface GenerateThumbnailsOptions {
  mediaKey?: string;
  signal?: AbortSignal;
}

export async function generateThumbnails(
  videoUrl: string,
  count: number,
  inSec: number,
  outSec: number,
  width = 96,
  onProgress?: (thumbs: string[]) => void,
  options: GenerateThumbnailsOptions = {}
): Promise<string[]> {
  const { mediaKey, signal } = options;
  if (count <= 0 || signal?.aborted) return [];

  const cacheKey = `${mediaKey || videoUrl}|${inSec.toFixed(2)}|${outSec.toFixed(2)}|${count}`;
  const cached = getCachedThumbnails(cacheKey, count);
  if (cached) {
    if (onProgress) onProgress([...cached]);
    return [...cached];
  }

  // Native Android Fast Path via MediaMetadataRetriever (wrapped in concurrency lock)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const acquiredNative = await acquireThumbnailLock(signal);
    if (!acquiredNative) return [];
    let nativeResult: string[] | null = null;
    try {
      if (signal?.aborted) {
        return [];
      }
      const dur = Math.max(0.05, outSec - inSec);
      const nativeThumbs: string[] = Array(count).fill("");
      let hasAny = false;
      for (let i = 0; i < count; i++) {
        if (signal?.aborted) break;
        const t = inSec + (dur * (i + 0.5)) / count;
        const res = await thumbnailService.getThumbnail(videoUrl, {
          timestampSeconds: t,
          width,
          height: Math.max(24, Math.round(width / (16 / 9))),
        });
        if (signal?.aborted) break;
        if (res && res.success && res.webPath) {
          nativeThumbs[i] = res.webPath;
          hasAny = true;
          if (onProgress && !signal?.aborted) {
            onProgress([...nativeThumbs]);
          }
        }
      }
      if (signal?.aborted) {
        nativeResult = nativeThumbs;
      } else if (hasAny) {
        if (isCompleteThumbnailArray(nativeThumbs, count)) {
          setCachedThumbnails(cacheKey, nativeThumbs, count);
        }
        nativeResult = nativeThumbs;
      }
    } catch (e) {
      console.warn("[videoUtils] Native thumbnail extraction failed, falling back to Web canvas:", e);
    } finally {
      releaseThumbnailLock();
    }
    if (nativeResult !== null) {
      return nativeResult;
    }
  }

  const acquired = await acquireThumbnailLock(signal);
  if (!acquired) {
    return [];
  }
  if (signal?.aborted) {
    releaseThumbnailLock();
    return [];
  }

  return new Promise((resolve) => {
    const thumbs: string[] = Array(count).fill("");
    let settled = false;
    let hadVideoError = false;
    let video: HTMLVideoElement | null = null;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      if (video) {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
        releasePooledVideo(videoUrl, video, hadVideoError);
        video = null;
      }
      releaseThumbnailLock();
    };

    const finish = (arr: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      if (!signal?.aborted && isCompleteThumbnailArray(arr, count)) {
        setCachedThumbnails(cacheKey, arr, count);
      }
      resolve(arr);
    };

    const onAbort = () => {
      finish(thumbs);
    };

    const onError = () => {
      hadVideoError = true;
      finish(thumbs);
    };

    const timeoutId = window.setTimeout(() => finish(thumbs), 12000);

    const onReady = async () => {
      if (settled || signal?.aborted || !video) {
        finish(thumbs);
        return;
      }
      const activeVideo = video;
      try {
        const dur = Math.max(0.05, outSec - inSec);
        const ratio = activeVideo.videoHeight ? activeVideo.videoWidth / activeVideo.videoHeight : 16 / 9;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.max(24, Math.round(width / ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }

        for (let i = 0; i < count; i++) {
          if (settled || signal?.aborted) break;

          // Time-slicing delay to yield control back to the browser/WebView main thread
          await new Promise<void>((r) => {
            if (typeof window !== "undefined" && "requestIdleCallback" in window) {
              (window as any).requestIdleCallback(() => r());
            } else {
              setTimeout(r, 16);
            }
          });

          if (settled || signal?.aborted) break;

          const t = inSec + (dur * (i + 0.5)) / count;
          const seekOk = await robustSeekVideo(activeVideo, t, {
            signal,
            timeoutMs: 1200,
            toleranceSec: 0.04,
          });

          if (settled || signal?.aborted) break;

          if (seekOk) {
            try {
              ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
              if (dataUrl) {
                thumbs[i] = dataUrl;
                if (onProgress && !signal?.aborted) {
                  onProgress([...thumbs]);
                }
              }
            } catch {}
          }
        }
      } catch {
        // Ensure lock is always released in finally
      } finally {
        finish(thumbs);
      }
    };

    try {
      if (signal) {
        if (signal.aborted) {
          finish(thumbs);
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const acquiredVideo = acquirePooledVideo(videoUrl);
      video = acquiredVideo.video;

      if (video.readyState >= 2) {
        void onReady();
      } else {
        video.addEventListener("loadeddata", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
      }
    } catch {
      hadVideoError = true;
      finish(thumbs);
    }
  });
}

// Detect silence segments → returns cut points (timeline seconds within video duration)
export interface SilenceOptions {
  thresholdDb?: number; // e.g. -45
  minSilenceMs?: number; // e.g. 400
}

export async function detectSilenceCutPoints(
  file: File,
  opts: SilenceOptions = {},
): Promise<number[]> {
  const { thresholdDb = -42, minSilenceMs = 450 } = opts;
  const arrayBuffer = await file.arrayBuffer();
  const tmpCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await new Promise((resolve, reject) => {
      tmpCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });
  } finally {
    await tmpCtx.close?.().catch(() => {});
  }

  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms
  const minSilentWindows = Math.ceil(minSilenceMs / 20);
  const threshold = Math.pow(10, thresholdDb / 20);

  const cuts: number[] = [];
  let silentRun = 0;
  let inSilence = false;
  let silenceStartIdx = 0;

  for (let i = 0; i < channel.length; i += windowSize) {
    let sum = 0;
    const end = Math.min(i + windowSize, channel.length);
    for (let j = i; j < end; j++) sum += channel[j] * channel[j];
    const rms = Math.sqrt(sum / (end - i));
    const isSilent = rms < threshold;

    if (isSilent) {
      if (!inSilence) {
        inSilence = true;
        silenceStartIdx = i;
        silentRun = 1;
      } else silentRun++;
    } else {
      if (inSilence && silentRun >= minSilentWindows) {
        const startTime = silenceStartIdx / sampleRate;
        const endTime = i / sampleRate;
        const cutAt = (startTime + endTime) / 2;
        cuts.push(cutAt);
      }
      inSilence = false;
      silentRun = 0;
    }

    if (i % (windowSize * 500) === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return cuts;
}
