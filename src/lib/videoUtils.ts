// Generate thumbnails along a video — uses a single reusable element
// and waits for both `seeked` and a paint frame so even mobile webkit produces
// non-blank frames. Caches the rendered data URLs in memory by url+range+count.
const thumbCache = new Map<string, string[]>();

// Global concurrency lock to prevent frame seek storms on HTMLVideoElement
let activeThumbnailTasks = 0;
const MAX_CONCURRENT_THUMBNAIL_TASKS = 2;
const thumbnailQueue: Array<() => void> = [];

async function acquireThumbnailLock(): Promise<void> {
  if (activeThumbnailTasks < MAX_CONCURRENT_THUMBNAIL_TASKS) {
    activeThumbnailTasks++;
    return;
  }
  return new Promise((resolve) => {
    thumbnailQueue.push(resolve);
  });
}

function releaseThumbnailLock(): void {
  activeThumbnailTasks--;
  if (thumbnailQueue.length > 0) {
    const next = thumbnailQueue.shift();
    if (next) {
      activeThumbnailTasks++;
      next();
    }
  }
}

export async function generateThumbnails(
  videoUrl: string,
  count: number,
  inSec: number,
  outSec: number,
  width = 96,
  onProgress?: (thumbs: string[]) => void,
): Promise<string[]> {
  const cacheKey = `${videoUrl}|${inSec.toFixed(2)}|${outSec.toFixed(2)}|${count}|${width}`;
  const cached = thumbCache.get(cacheKey);
  if (cached) {
    if (onProgress) onProgress(cached);
    return cached;
  }

  await acquireThumbnailLock();

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    (video as any).playsInline = true;
    video.src = videoUrl;

    const thumbs: string[] = [];
    let settled = false;
    const finish = (arr: string[]) => {
      if (settled) return;
      settled = true;
      try {
        video.src = "";
        video.load();
      } catch {}
      releaseThumbnailLock();
      if (arr.length) thumbCache.set(cacheKey, arr);
      resolve(arr);
    };

    const timeoutId = window.setTimeout(() => finish(thumbs), 12000);

    const onReady = async () => {
      const dur = Math.max(0.05, outSec - inSec);
      const ratio = video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.max(24, Math.round(width / ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        clearTimeout(timeoutId);
        return finish([]);
      }

      for (let i = 0; i < count; i++) {
        // Time-slicing delay to yield control back to the browser/WebView main thread
        await new Promise<void>((r) => {
          if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            (window as any).requestIdleCallback(() => r());
          } else {
            setTimeout(r, 25);
          }
        });

        const t = inSec + (dur * (i + 0.5)) / count;
        await new Promise<void>((res) => {
          let done = false;
          const cleanup = () => {
            video.removeEventListener("seeked", onSeek);
            done = true;
            res();
          };
          const onSeek = () => {
            requestAnimationFrame(() => {
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                thumbs.push(canvas.toDataURL("image/jpeg", 0.85));
                if (onProgress) {
                  onProgress([...thumbs]);
                }
              } catch {}
              cleanup();
            });
          };
          video.addEventListener("seeked", onSeek);
          try {
            video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05));
          } catch {
            cleanup();
          }
          window.setTimeout(() => {
            if (!done) cleanup();
          }, 1500);
        });
      }
      clearTimeout(timeoutId);
      finish(thumbs);
    };

    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", () => {
      clearTimeout(timeoutId);
      finish([]);
    });
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
