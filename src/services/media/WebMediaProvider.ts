import {
  MediaProvider,
  MediaMetadata,
  PreparedMediaFile,
  ExportMediaConfig,
  ExportMediaResult,
  MediaProgressCallback,
} from "./types";

/**
 * WebMediaProvider
 * 
 * Standard Web/DOM implementation for desktop browsers and web fallbacks.
 * Uses HTMLVideoElement, Canvas, ObjectURLs, and standard browser downloads.
 */
export class WebMediaProvider implements MediaProvider {
  public readonly id = "web-media-provider";
  public readonly platform = "web" as const;

  public isAvailable(): boolean {
    return typeof window !== "undefined";
  }

  public async getMetadata(source: string | File | Blob): Promise<MediaMetadata> {
    let url: string;
    let isTempUrl = false;
    let fileSize = 0;
    let mimeType = "video/mp4";

    if (source instanceof Blob) {
      url = URL.createObjectURL(source);
      isTempUrl = true;
      fileSize = source.size;
      mimeType = source.type || "video/mp4";
    } else {
      url = source;
      mimeType = source.endsWith(".png") ? "image/png" : "video/mp4";
    }

    try {
      const isImage = mimeType.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
      if (isImage) {
        return await new Promise<MediaMetadata>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              width: img.naturalWidth,
              height: img.naturalHeight,
              duration: 0,
              mimeType,
              fileSize,
              hasAudio: false,
            });
          };
          img.onerror = () => reject(new Error("Failed to load image metadata in browser"));
          img.src = url;
        });
      }

      return await new Promise<MediaMetadata>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          resolve({
            width: video.videoWidth || 1920,
            height: video.videoHeight || 1080,
            duration: video.duration || 0,
            mimeType,
            fileSize,
            rotation: 0,
            hasAudio: true,
          });
        };
        video.onerror = () => reject(new Error("Failed to load video metadata in browser"));
        video.src = url;
      });
    } finally {
      if (isTempUrl) {
        URL.revokeObjectURL(url);
      }
    }
  }

  public async prepareInput(source: string | File | Blob): Promise<PreparedMediaFile> {
    if (source instanceof File) {
      const url = URL.createObjectURL(source);
      return {
        path: url,
        webPath: url,
        name: source.name,
        mimeType: source.type || "video/mp4",
        size: source.size,
      };
    }

    if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      return {
        path: url,
        webPath: url,
        name: `blob_${Date.now()}.mp4`,
        mimeType: source.type || "video/mp4",
        size: source.size,
      };
    }

    return {
      path: source,
      webPath: source,
      name: source.split("/").pop() || "media.mp4",
      mimeType: "video/mp4",
      size: 0,
    };
  }

  public async exportMedia(
    config: ExportMediaConfig,
    onProgress?: MediaProgressCallback,
    signal?: AbortSignal
  ): Promise<ExportMediaResult> {
    if (signal?.aborted) {
      throw new Error("Export cancelled by user");
    }

    onProgress?.({
      phase: "processing",
      progress: 0.5,
      message: "Processing media on Web...",
    });

    if (config.blob) {
      const downloadUrl = URL.createObjectURL(config.blob);
      const fileName = config.outputFileName || "vireon_export.mp4";

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      onProgress?.({
        phase: "completed",
        progress: 1.0,
        message: "Download complete",
      });

      return {
        success: true,
        uri: downloadUrl,
        size: config.blob.size,
        savedToGallery: false,
      };
    }

    return {
      success: true,
      uri: config.inputUri,
      savedToGallery: false,
    };
  }

  public async releaseResource(pathOrUri: string): Promise<boolean> {
    if (pathOrUri.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(pathOrUri);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }
}
