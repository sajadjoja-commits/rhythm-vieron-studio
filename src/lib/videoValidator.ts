/**
 * Video Validation Utility
 * Verifies exported video files prior to saving to gallery or sharing.
 * Checks MIME type, container size, duration, dimensions, and decode capability.
 */

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeMB?: number;
  containerType?: string;
}

export async function validateExportedVideo(
  blob: Blob,
  expectedMinDurationSec: number = 0.5
): Promise<VideoValidationResult> {
  const sizeMB = blob.size / (1024 * 1024);

  // 1. Check size threshold (must be at least 50KB for valid container header + stream)
  if (!blob || blob.size < 50000) {
    return {
      valid: false,
      sizeMB,
      error: `Exported video file size is too small or invalid (${blob?.size || 0} bytes).`,
    };
  }

  // 2. Reject fake image disguised as MP4
  const mimeType = blob.type.toLowerCase();
  if (mimeType.includes("image/")) {
    return {
      valid: false,
      sizeMB,
      error: `Invalid export output: file is an image (${mimeType}), not a valid video file.`,
    };
  }

  // 3. Perform container decode and metadata verification
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(blob);
    video.preload = "metadata";
    video.muted = true;
    (video as any).playsInline = true;

    let resolved = false;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
      URL.revokeObjectURL(objectUrl);
      try {
        video.src = "";
        video.load();
      } catch {}
    };

    const finish = (result: VideoValidationResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        valid: false,
        sizeMB,
        error: "Video validation timed out. File container may be unplayable or corrupted.",
      });
    }, 6000);

    const onLoadedMetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!duration || !isFinite(duration) || duration < Math.min(0.1, expectedMinDurationSec * 0.2)) {
        finish({
          valid: false,
          sizeMB,
          duration,
          width,
          height,
          error: `Invalid video duration: ${duration}s. Expected at least ${expectedMinDurationSec}s.`,
        });
        return;
      }

      if (!width || !height || width <= 0 || height <= 0) {
        finish({
          valid: false,
          sizeMB,
          duration,
          width,
          height,
          error: `Invalid video resolution (${width}x${height}).`,
        });
        return;
      }

      finish({
        valid: true,
        sizeMB,
        duration,
        width,
        height,
        containerType: blob.type || "video/mp4",
      });
    };

    const onError = () => {
      finish({
        valid: false,
        sizeMB,
        error: "Browser failed to decode video container header.",
      });
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.src = objectUrl;
  });
}
