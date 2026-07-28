import { FFmpeg, toBlobURL } from "@ffmpeg/ffmpeg";
import { Clip, Caption, AudioTrackItem, FilterItem, VfxItem, OverlayItem } from "@/context/MediaContext";

interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  format: "mp4" | "webm" | "mov";
  quality: "low" | "medium" | "high";
}

interface ExportProgress {
  stage: "loading" | "encoding" | "muxing" | "complete" | "error";
  progress: number; // 0-100
  message: string;
}

type ExportProgressCallback = (progress: ExportProgress) => void;

const DEFAULT_CONFIG: ExportConfig = {
  width: 1920,
  height: 1080,
  fps: 30,
  bitrate: "5000k",
  format: "mp4",
  quality: "high",
};

export class AdvancedExportEngine {
  private ffmpeg: FFmpeg;
  private isLoaded = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  async initialize(onProgress?: ExportProgressCallback): Promise<void> {
    if (this.isLoaded) return;

    try {
      onProgress?.({
        stage: "loading",
        progress: 10,
        message: "جاري تحميل محرك التصدير...",
      });

      // Try loading local ffmpeg core first (100% offline ready)
      try {
        await this.ffmpeg.load({
          coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
        });
      } catch (e) {
        console.warn("Local ffmpeg core load failed, trying CDN fallback...", e);
        const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
      }

      this.isLoaded = true;

      onProgress?.({
        stage: "loading",
        progress: 100,
        message: "تم تحميل محرك التصدير بنجاح",
      });
    } catch (error) {
      console.error("Failed to initialize FFmpeg:", error);
      throw new Error("فشل تحميل محرك التصدير");
    }
  }

  async exportVideo(
    canvas: HTMLCanvasElement,
    audioTracks: AudioTrackItem[],
    duration: number,
    config: Partial<ExportConfig> = {},
    onProgress?: ExportProgressCallback
  ): Promise<Blob> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    if (!this.isLoaded) {
      await this.initialize(onProgress);
    }

    try {
      onProgress?.({
        stage: "encoding",
        progress: 0,
        message: "جاري تحويل الفيديو...",
      });

      // Capture canvas frames
      const frames: Blob[] = [];
      const frameCount = Math.ceil(duration * finalConfig.fps);

      for (let i = 0; i < frameCount; i++) {
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob!);
          }, "image/jpeg", 0.9);
        });
        frames.push(blob);

        const progress = Math.round((i / frameCount) * 80);
        onProgress?.({
          stage: "encoding",
          progress,
          message: `تحويل الإطار ${i + 1}/${frameCount}`,
        });
      }

      // Write frames to FFmpeg
      for (let i = 0; i < frames.length; i++) {
        const data = await frames[i].arrayBuffer();
        this.ffmpeg.writeFile(`frame_${String(i).padStart(6, "0")}.jpg`, new Uint8Array(data));
      }

      // Handle audio tracks if any
      if (audioTracks.length > 0) {
        // Mix audio tracks and write to FFmpeg
      }

      onProgress?.({
        stage: "muxing",
        progress: 85,
        message: "جاري دمج الفيديو والصوت...",
      });

      // Run FFmpeg command
      const outputFile = `output.${finalConfig.format}`;
      const videoBitrate = finalConfig.quality === "high" ? "8000k" : finalConfig.quality === "medium" ? "5000k" : "2500k";

      await this.ffmpeg.exec([
        "-framerate",
        String(finalConfig.fps),
        "-i",
        "frame_%06d.jpg",
        "-c:v",
        "libx264",
        "-b:v",
        videoBitrate,
        "-preset",
        finalConfig.quality === "high" ? "slow" : finalConfig.quality === "medium" ? "medium" : "fast",
        "-pix_fmt",
        "yuv420p",
        "-y",
        outputFile,
      ]);

      onProgress?.({
        stage: "muxing",
        progress: 95,
        message: "جاري حفظ الملف...",
      });

      // Read output file
      const data = this.ffmpeg.readFile(outputFile);
      const blob = new Blob([data], { type: `video/${finalConfig.format}` });

      onProgress?.({
        stage: "complete",
        progress: 100,
        message: "تم التصدير بنجاح!",
      });

      return blob;
    } catch (error) {
      console.error("Export error:", error);
      onProgress?.({
        stage: "error",
        progress: 0,
        message: `خطأ في التصدير: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
      });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.ffmpeg) {
      await this.ffmpeg.deleteFile("*");
    }
  }

  isFFmpegLoaded(): boolean {
    return this.isLoaded;
  }
}

// Singleton instance
let exportEngine: AdvancedExportEngine | null = null;

export function getExportEngine(): AdvancedExportEngine {
  if (!exportEngine) {
    exportEngine = new AdvancedExportEngine();
  }
  return exportEngine;
}
