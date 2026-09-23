/**
 * Media Service Types & Interfaces
 * Phase 5 High-Performance Native & Web Media Pipeline
 */

export interface MediaMetadata {
  width: number;
  height: number;
  duration: number; // in seconds
  rotation?: number; // 0, 90, 180, 270
  mimeType: string;
  fileSize: number; // in bytes
  bitrate?: number;
  hasAudio?: boolean;
}

export interface PreparedMediaFile {
  path: string; // Native filesystem path (e.g. /data/user/0/com.vireon.ai/...)
  webPath: string; // Web-accessible URI (e.g. file://... or http://localhost/_capacitor_file_/...)
  name: string;
  mimeType: string;
  size: number;
}

export interface ExportMediaConfig {
  inputUri?: string; // Native file path, file://, or content://
  outputFileName?: string;
  startTime?: number; // Trim start offset in seconds
  endTime?: number; // Trim end offset in seconds
  saveToGallery?: boolean;
  operationId?: string;
  blob?: Blob; // Used on Web or when Canvas render provides Blob
}

export interface ExportMediaResult {
  success: boolean;
  path?: string;
  uri?: string;
  size?: number;
  savedToGallery?: boolean;
  warning?: string;
}

export interface MediaProgressUpdate {
  phase: "preparing" | "processing" | "saving" | "completed";
  progress: number; // 0.0 to 1.0
  message?: string;
}

export type MediaProgressCallback = (update: MediaProgressUpdate) => void;

export interface MediaProvider {
  readonly id: string;
  readonly platform: "web" | "android";
  isAvailable(): boolean;
  getMetadata(source: string | File | Blob): Promise<MediaMetadata>;
  prepareInput(source: string | File | Blob): Promise<PreparedMediaFile>;
  exportMedia(
    config: ExportMediaConfig,
    onProgress?: MediaProgressCallback,
    signal?: AbortSignal
  ): Promise<ExportMediaResult>;
  releaseResource(pathOrUri: string): Promise<boolean>;
}
