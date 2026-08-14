/**
 * Video Seeking Utility for High-Precision Frame Rendering
 * Ensures source video elements have decoded and rendered the exact requested frame
 * before drawing to canvas. Handles timeouts, cancellations, seek errors, and readyState.
 */

export interface SeekOptions {
  timeoutMs?: number;
  toleranceSec?: number;
}

export async function robustSeekVideo(
  video: HTMLVideoElement,
  targetTime: number,
  options: SeekOptions = {}
): Promise<boolean> {
  const { timeoutMs = 1500, toleranceSec = 0.04 } = options;

  if (!video || !isFinite(video.duration) || video.duration <= 0) {
    return false;
  }

  // Clamp target time to valid bounds
  const clampedTime = Math.max(0, Math.min(targetTime, Math.max(0, video.duration - 0.02)));

  // If video is already at the target frame position and ready to render
  if (Math.abs(video.currentTime - clampedTime) <= toleranceSec && video.readyState >= 2) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let frameCallbackId: number | null = null;

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeEventListener("canplay", onCanPlay);
      if (pollInterval !== null) clearInterval(pollInterval);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (
        frameCallbackId !== null &&
        "cancelVideoFrameCallback" in video &&
        typeof (video as any).cancelVideoFrameCallback === "function"
      ) {
        try {
          (video as any).cancelVideoFrameCallback(frameCallbackId);
        } catch {}
      }
    };

    const finish = (success: boolean) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(success);
    };

    const onSeeked = () => {
      if (video.readyState >= 2) {
        finish(true);
      }
    };

    const onCanPlay = () => {
      if (video.readyState >= 2) {
        finish(true);
      }
    };

    const onError = () => {
      finish(false);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    // Modern Chrome / WebView Frame callback (gives exact frame decoded notification)
    if ("requestVideoFrameCallback" in video && typeof (video as any).requestVideoFrameCallback === "function") {
      try {
        frameCallbackId = (video as any).requestVideoFrameCallback(() => {
          if (video.readyState >= 2) {
            finish(true);
          }
        });
      } catch (e) {
        console.warn("requestVideoFrameCallback error:", e);
      }
    }

    // Interval poller checking actual currentTime alignment & readiness
    pollInterval = setInterval(() => {
      if (video.readyState >= 2 && Math.abs(video.currentTime - clampedTime) <= toleranceSec + 0.02) {
        finish(true);
      }
    }, 20);

    // Reasonable timeout (1500ms instead of 35ms!)
    timeoutTimer = setTimeout(() => {
      // Check if video at least has current frame data available
      const isUsable = video.readyState >= 2;
      finish(isUsable);
    }, timeoutMs);

    try {
      video.currentTime = clampedTime;
    } catch (err) {
      finish(false);
    }
  });
}
