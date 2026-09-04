/**
 * Video Frame Extractor & Audio Synchronizer
 * Sequentially extracts video frames at accurate timestamps with minimal memory footprint.
 * Features frame seeking with seeked listener / requestVideoFrameCallback.
 */

import { VideoMemoryManager } from "./VideoMemoryManager";

export interface ExtractedVideoMeta {
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  totalFrames: number;
  hasAudio: boolean;
  audioBuffer: AudioBuffer | null;
}

export class VideoFrameExtractor {
  private static instance: VideoFrameExtractor;
  private memoryManager = VideoMemoryManager.getInstance();

  public static getInstance(): VideoFrameExtractor {
    if (!VideoFrameExtractor.instance) {
      VideoFrameExtractor.instance = new VideoFrameExtractor();
    }
    return VideoFrameExtractor.instance;
  }

  /**
   * Initializes the video element and extracts audio buffer if present.
   */
  public async prepareVideo(
    videoInput: string | Blob | File,
    targetFps = 30
  ): Promise<{
    video: HTMLVideoElement;
    meta: ExtractedVideoMeta;
    cleanup: () => void;
  }> {
    if (typeof document === "undefined") {
      throw new Error("[VideoFrameExtractor] Document environment required");
    }

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    (video as any).playsInline = true;

    const videoUrl = typeof videoInput === "string" ? videoInput : URL.createObjectURL(videoInput);

    await new Promise<void>((resolve, reject) => {
      let isDone = false;
      const finish = () => {
        if (isDone) return;
        isDone = true;
        cleanupListeners();
        resolve();
      };

      const fail = (e: any) => {
        if (isDone) return;
        isDone = true;
        cleanupListeners();
        reject(new Error(`Failed to load video data: ${e?.message || "Format unsupported"}`));
      };

      const cleanupListeners = () => {
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("canplay", finish);
        video.removeEventListener("loadedmetadata", finish);
        video.removeEventListener("error", fail);
        clearTimeout(timeoutId);
      };

      video.addEventListener("loadeddata", finish);
      video.addEventListener("canplay", finish);
      video.addEventListener("loadedmetadata", finish);
      video.addEventListener("error", fail);

      // Check if already ready
      if (video.readyState >= 2) {
        finish();
        return;
      }

      const timeoutId = setTimeout(() => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          finish();
        } else {
          fail(new Error("Video loading timed out after 10s"));
        }
      }, 10000);

      video.src = videoUrl;
      video.load();
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const durationSeconds = video.duration && !isNaN(video.duration) && video.duration > 0 ? video.duration : 1;
    const fps = targetFps || 30;
    const totalFrames = Math.max(1, Math.floor(durationSeconds * fps));

    // Try extracting audio buffer
    let audioBuffer: AudioBuffer | null = null;
    let hasAudio = false;

    try {
      audioBuffer = await this.extractAudioBuffer(videoUrl);
      hasAudio = audioBuffer !== null && audioBuffer.length > 0;
    } catch {
      hasAudio = false;
    }

    const cleanup = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (typeof videoInput !== "string") {
        URL.revokeObjectURL(videoUrl);
      }
    };

    return {
      video,
      meta: {
        width,
        height,
        durationSeconds,
        fps,
        totalFrames,
        hasAudio,
        audioBuffer,
      },
      cleanup,
    };
  }

  /**
   * Seeks the video element to an exact timestamp and returns when the frame is authentically ready.
   * NEVER resolves purely on timeout; verifies currentTime is close to target timestamp.
   * Throws an error if seeking times out or fails, preventing processing of old/corrupted frames.
   */
  public seekToTimestamp(
    video: HTMLVideoElement,
    timestampSeconds: number,
    timeoutMs = 4500
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = video.duration || 1;
      const targetTime = Math.max(0, Math.min(duration - 0.001, timestampSeconds));
      const tolerance = 0.08;

      // If already at or sufficiently close to timestamp with ready data
      if (Math.abs(video.currentTime - targetTime) <= 0.015 && video.readyState >= 2) {
        resolve();
        return;
      }

      let timeoutId: any = null;
      let rvfcId: number | null = null;
      let settled = false;

      const cleanup = () => {
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        if (rvfcId !== null && "cancelVideoFrameCallback" in video) {
          (video as any).cancelVideoFrameCallback(rvfcId);
          rvfcId = null;
        }
      };

      const verifyAndResolve = () => {
        if (settled) return;
        const diff = Math.abs(video.currentTime - targetTime);
        if (diff <= tolerance || video.ended || targetTime >= duration - 0.02) {
          cleanup();
          resolve();
        }
      };

      const onSeeked = () => {
        verifyAndResolve();
        if (!settled) {
          if ("requestVideoFrameCallback" in video) {
            rvfcId = (video as any).requestVideoFrameCallback(() => {
              verifyAndResolve();
              if (!settled) {
                if (Math.abs(video.currentTime - targetTime) <= tolerance * 1.5) {
                  cleanup();
                  resolve();
                }
              }
            });
          } else {
            requestAnimationFrame(() => {
              verifyAndResolve();
            });
          }
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error(`خطأ في فك ترميز مشغل الفيديو عند الزمن ${targetTime.toFixed(3)}s.`));
      };

      // Configurable timeout appropriate for slower mobile/Android devices (default 4500ms)
      timeoutId = setTimeout(() => {
        cleanup();
        const finalDiff = Math.abs(video.currentTime - targetTime);
        if (finalDiff <= tolerance) {
          resolve();
        } else {
          reject(
            new Error(
              `فشل الانتقال إلى الإطار المطلوب: تجاوزت مهلة التزامن (${timeoutMs}ms) عند الزمن ${targetTime.toFixed(3)}s (الموقع الحالي: ${video.currentTime.toFixed(3)}s).`
            )
          );
        }
      }, timeoutMs);

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError, { once: true });
      video.currentTime = targetTime;
    });
  }

  /**
   * Decodes and extracts audio track from video URL via AudioContext.
   */
  private async extractAudioBuffer(videoUrl: string): Promise<AudioBuffer | null> {
    if (typeof window === "undefined" || (typeof AudioContext === "undefined" && typeof (window as any).webkitAudioContext === "undefined")) {
      return null;
    }

    try {
      const response = await fetch(videoUrl);
      const arrayBuffer = await response.arrayBuffer();

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();

      try {
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();
        return decoded;
      } catch {
        await audioCtx.close();
        return null;
      }
    } catch {
      return null;
    }
  }
}
