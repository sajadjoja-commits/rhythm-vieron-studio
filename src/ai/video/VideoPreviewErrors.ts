/**
 * Video Preview Errors & Diagnostic Reporter
 * Strict error typing, diagnostic payload capturing, and human-readable localization.
 */

export type PreviewErrorCode =
  | "PREVIEW_CLIP_NOT_FOUND"
  | "PREVIEW_BLOB_INVALID"
  | "PREVIEW_DECODE_FAILED"
  | "PREVIEW_METADATA_TIMEOUT"
  | "PREVIEW_CANPLAY_TIMEOUT"
  | "PREVIEW_SOURCE_MISMATCH"
  | "PREVIEW_OBJECT_URL_REVOKED"
  | "PREVIEW_ACTIVE_SLOT_FAILED"
  | "PREVIEW_ATTACH_FAILED"
  | "PREVIEW_DUPLICATE_IGNORED";

export interface PreviewDiagnosticInfo {
  jobId?: string;
  clipId?: string;
  mediaId?: string;
  processedUrl?: string;
  mimeType?: string;
  blobSize?: number;
  videoWidth?: number;
  videoHeight?: number;
  duration?: number;
  readyState?: number;
  networkState?: number;
  activeSlot?: number;
  mediaErrorCode?: number;
  mediaErrorMessage?: string;
  details?: string;
}

export class PreviewIntegrationError extends Error {
  public readonly code: PreviewErrorCode;
  public readonly diagnostic: PreviewDiagnosticInfo;

  constructor(code: PreviewErrorCode, message: string, diagnostic: PreviewDiagnosticInfo = {}) {
    super(`[${code}] ${message}`);
    this.name = "PreviewIntegrationError";
    this.code = code;
    this.diagnostic = diagnostic;
    Object.setPrototypeOf(this, PreviewIntegrationError.prototype);
  }

  public getLocalizedMessage(lang: "ar" | "en" = "ar"): string {
    const isAr = lang === "ar";
    switch (this.code) {
      case "PREVIEW_CLIP_NOT_FOUND":
        return isAr
          ? "لم يتم العثور على المقطع المستهدف في الخط الزمني (PREVIEW_CLIP_NOT_FOUND)"
          : "Target clip not found in timeline (PREVIEW_CLIP_NOT_FOUND)";
      case "PREVIEW_BLOB_INVALID":
        return isAr
          ? `ملف الفيديو الناتج غير صالح أو فارغ الحجم (${this.diagnostic.blobSize || 0}B) (PREVIEW_BLOB_INVALID)`
          : `Processed video blob is empty or corrupt (${this.diagnostic.blobSize || 0}B) (PREVIEW_BLOB_INVALID)`;
      case "PREVIEW_DECODE_FAILED":
        return isAr
          ? `فشل متصفح الويب في فك ترميز الفيديو المعالج (${this.diagnostic.mediaErrorMessage || "DECODE_ERROR"}) (PREVIEW_DECODE_FAILED)`
          : `Browser failed to decode processed video output (${this.diagnostic.mediaErrorMessage || "DECODE_ERROR"}) (PREVIEW_DECODE_FAILED)`;
      case "PREVIEW_METADATA_TIMEOUT":
        return isAr
          ? "انتهت مهلة قراءة بيانات الفيديو المعالج في نافذة المعاينة (PREVIEW_METADATA_TIMEOUT)"
          : "Timed out waiting for video metadata in editor preview (PREVIEW_METADATA_TIMEOUT)";
      case "PREVIEW_CANPLAY_TIMEOUT":
        return isAr
          ? "انتهت مهلة تهيئة تشغيل الفيديو المعالج في نافذة المعاينة (PREVIEW_CANPLAY_TIMEOUT)"
          : "Timed out waiting for video canplay event (PREVIEW_CANPLAY_TIMEOUT)";
      case "PREVIEW_SOURCE_MISMATCH":
        return isAr
          ? "عدم تطابق مسار الفيديو الفعلي مع الفيديو المعالج في نافذة المعاينة (PREVIEW_SOURCE_MISMATCH)"
          : "Active preview element source mismatch with processed output (PREVIEW_SOURCE_MISMATCH)";
      case "PREVIEW_OBJECT_URL_REVOKED":
        return isAr
          ? "تم إلغاء رابط الفيديو الموضعي قبل عرضه في المعاينة (PREVIEW_OBJECT_URL_REVOKED)"
          : "Video Object URL was revoked before preview rendering (PREVIEW_OBJECT_URL_REVOKED)";
      case "PREVIEW_ACTIVE_SLOT_FAILED":
        return isAr
          ? "تعذر الوصول إلى مشغل الفيديو النشط في شاشة المعاينة (PREVIEW_ACTIVE_SLOT_FAILED)"
          : "Active video preview player slot could not be mounted (PREVIEW_ACTIVE_SLOT_FAILED)";
      case "PREVIEW_ATTACH_FAILED":
      default:
        return isAr
          ? `فشل ربط الفيديو بنافذة المعاينة: ${this.message}`
          : `Failed to attach processed video to preview: ${this.message}`;
    }
  }

  public logDiagnostic(): void {
    console.error(`[PREVIEW_INTEGRATION_ERROR] [${this.code}]`, {
      code: this.code,
      message: this.message,
      jobId: this.diagnostic.jobId || "N/A",
      clipId: this.diagnostic.clipId || "N/A",
      mediaId: this.diagnostic.mediaId || "N/A",
      processedUrl: this.diagnostic.processedUrl || "N/A",
      mimeType: this.diagnostic.mimeType || "N/A",
      blobSize: this.diagnostic.blobSize ?? 0,
      videoWidth: this.diagnostic.videoWidth ?? 0,
      videoHeight: this.diagnostic.videoHeight ?? 0,
      duration: this.diagnostic.duration ?? 0,
      readyState: this.diagnostic.readyState ?? 0,
      networkState: this.diagnostic.networkState ?? 0,
      activeSlot: this.diagnostic.activeSlot ?? -1,
      mediaErrorCode: this.diagnostic.mediaErrorCode ?? null,
      mediaErrorMessage: this.diagnostic.mediaErrorMessage ?? null,
      details: this.diagnostic.details || null,
    });
  }
}
