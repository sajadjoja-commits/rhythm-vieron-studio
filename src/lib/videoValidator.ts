/**
 * Video Validation Utility
 * Verifies exported video files prior to saving to gallery or sharing.
 * Checks MIME type, container size, duration, dimensions, and decode capability.
 */

import { validateExportedAudio, AudioValidationReport } from "./audioValidator";

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeMB?: number;
  containerType?: string;
  audioReport?: AudioValidationReport;
}

export interface VideoValidationOptions {
  expectedMinDurationSec?: number;
  expectedHasAudio?: boolean;
  skipAudioDecode?: boolean;
  audioAlreadyValidated?: boolean;
}

const MAX_AUDIO_REDECODE_BYTES = 80 * 1024 * 1024; // 80 MB
const MAX_AUDIO_REDECODE_DURATION_SEC = 120; // 120 seconds

export async function validateExportedVideo(
  blob: Blob,
  optionsOrDuration: number | VideoValidationOptions = 0.5
): Promise<VideoValidationResult> {
  const expectedMinDurationSec =
    typeof optionsOrDuration === "number"
      ? optionsOrDuration
      : optionsOrDuration.expectedMinDurationSec ?? 0.5;

  const expectedHasAudio =
    typeof optionsOrDuration === "object"
      ? optionsOrDuration.expectedHasAudio ?? false
      : false;

  const skipAudioDecodeOption =
    typeof optionsOrDuration === "object"
      ? Boolean(optionsOrDuration.skipAudioDecode || optionsOrDuration.audioAlreadyValidated)
      : false;

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

    const onLoadedMetadata = async () => {
      clearTimeout(timer);
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

      // Perform a lightweight mid-stream seek check to verify frame table integrity
      const targetSeekTime = Math.min(0.5, Math.max(0, duration * 0.25));
      if (targetSeekTime > 0.01) {
        const seekOk = await new Promise<boolean>((resolveSeek) => {
          let settled = false;
          const doneSeek = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(seekTimer);
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onSeekErr);
            resolveSeek(ok);
          };
          const onSeeked = () => doneSeek(true);
          const onSeekErr = () => doneSeek(false);
          const seekTimer = setTimeout(() => doneSeek(!video.error), 300);
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("error", onSeekErr, { once: true });
          try {
            video.currentTime = targetSeekTime;
          } catch {
            doneSeek(true);
          }
        });

        if (!seekOk) {
          finish({
            valid: false,
            sizeMB,
            duration,
            width,
            height,
            error: "Exported video failed mid-stream seek verification.",
          });
          return;
        }
      }

      const shouldSkipAudioDecode =
        skipAudioDecodeOption ||
        duration > MAX_AUDIO_REDECODE_DURATION_SEC ||
        expectedMinDurationSec > MAX_AUDIO_REDECODE_DURATION_SEC ||
        blob.size > MAX_AUDIO_REDECODE_BYTES;

      // Audio validation if audio was expected and not skipped
      let audioReport: AudioValidationReport | undefined;
      if (expectedHasAudio && shouldSkipAudioDecode) {
        console.log(
          `[VideoValidator] Skipping full audio decode for exported video (duration=${duration.toFixed(1)}s, size=${sizeMB.toFixed(2)}MB).`
        );
      } else if (expectedHasAudio) {
        try {
          audioReport = await validateExportedAudio(blob, {
            expectedHasAudio: true,
            expectedDurationSec: duration || expectedMinDurationSec,
          });

          if (!audioReport.valid) {
            finish({
              valid: false,
              sizeMB,
              duration,
              width,
              height,
              audioReport,
              error: audioReport.error || "فشل التحقق من جودة وسلامة الصوت المصدّر.",
            });
            return;
          }
        } catch (audioErr: any) {
          finish({
            valid: false,
            sizeMB,
            duration,
            width,
            height,
            error: `خطأ أثناء فحص مسار الصوت المصدّر: ${audioErr?.message || String(audioErr)}`,
          });
          return;
        }
      }

      finish({
        valid: true,
        sizeMB,
        duration,
        width,
        height,
        containerType: blob.type || "video/mp4",
        audioReport,
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
