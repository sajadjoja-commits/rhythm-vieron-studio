import { createAIError } from "./errorUtils";
import { AIDebugLogger } from "./AIDebugLogger";

export interface NormalizedAIPayload {
  inputMediaType: "image" | "audio" | "video" | "general";
  outputMediaType: "image" | "audio" | "video" | "general";
  imageBase64OrUrl?: string;
  imageBlob?: Blob | File;
  videoBase64OrUrl?: string;
  videoFile?: Blob | File;
  audioBase64OrUrl?: string;
  audioFile?: Blob | File;
  mediaUrlOrBase64?: string;
  mask?: string | Blob;
  prompt?: string;
  negativePrompt?: string;
  toolId?: string;
  pluginId?: string;
  historyId?: string;
  projectId?: string;
  action?: string;
  [key: string]: any;
}

export type PayloadDomain = "image" | "video" | "audio" | "generation" | "general";

export interface PayloadValidationResult {
  valid: boolean;
  errors: string[];
  normalizedPayload: NormalizedAIPayload;
}

export class PayloadValidator {
  /**
   * Detects explicit or implicit media type ("image" | "audio" | "video" | "general")
   */
  public static detectMediaType(rawPayload: any): "image" | "audio" | "video" | "general" {
    if (!rawPayload) return "general";

    // 1. Explicit domain / mediaType
    if (rawPayload.inputMediaType && ["image", "audio", "video"].includes(rawPayload.inputMediaType)) {
      return rawPayload.inputMediaType;
    }
    if (rawPayload.mediaType && ["image", "audio", "video"].includes(rawPayload.mediaType)) {
      return rawPayload.mediaType;
    }
    if (rawPayload.category && ["image", "audio", "video"].includes(rawPayload.category)) {
      return rawPayload.category;
    }
    if (rawPayload.domain && ["image", "audio", "video"].includes(rawPayload.domain)) {
      return rawPayload.domain;
    }

    // 2. Inspect candidate URL / Data URI header first for definitive typing
    const candidate = String(
      rawPayload.mediaUrlOrBase64 ||
      rawPayload.imageBase64OrUrl ||
      rawPayload.videoBase64OrUrl ||
      rawPayload.audioBase64OrUrl ||
      rawPayload.mediaUrl ||
      rawPayload.url ||
      rawPayload.src ||
      rawPayload.inputUrl ||
      ""
    ).trim();

    if (candidate.startsWith("data:image/")) return "image";
    if (candidate.startsWith("data:video/")) return "video";
    if (candidate.startsWith("data:audio/")) return "audio";

    const lower = candidate.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|bmp|tiff)(\?.*)?$/.test(lower)) return "image";
    if (/\.(mp4|webm|mov|avi|mkv|m4v)(\?.*)?$/.test(lower)) return "video";
    if (/\.(mp3|wav|m4a|ogg|flac|aac)(\?.*)?$/.test(lower)) return "audio";

    // 3. Tool ID or taskType keywords
    const toolId = String(rawPayload.toolId || rawPayload.taskType || rawPayload.action || rawPayload.pluginId || "").toLowerCase();
    if (toolId.includes("img") || toolId.includes("image") || toolId.includes("upscale") || toolId.includes("rmbg") || toolId.includes("gfpgan") || toolId.includes("lama") || toolId.includes("scunet")) {
      return "image";
    }
    if (toolId.includes("vid") || toolId.includes("video") || toolId.includes("rife") || toolId.includes("frame") || toolId.includes("matting")) {
      return "video";
    }
    if (toolId.includes("audio") || toolId.includes("denoise") || toolId.includes("vocal") || toolId.includes("music") || toolId.includes("demucs") || toolId.includes("filter")) {
      return "audio";
    }

    // 4. Explicit field presence (checked ONLY if candidate content was not conclusive)
    if (rawPayload.isVideo === true) return "video";
    if (rawPayload.imageBlob || (rawPayload.imageBase64OrUrl && !rawPayload.videoBase64OrUrl && !rawPayload.audioBase64OrUrl)) return "image";
    if (rawPayload.videoFile || (rawPayload.videoBase64OrUrl && !rawPayload.imageBase64OrUrl && !rawPayload.audioBase64OrUrl)) return "video";
    if (rawPayload.audioFile || (rawPayload.audioBase64OrUrl && !rawPayload.imageBase64OrUrl && !rawPayload.videoBase64OrUrl)) return "audio";

    return "image"; // Default fallback for single-media tools
  }

  /**
   * Normalizes any raw payload input, preserving domain isolation and mapping
   * candidate strings exclusively to the matching domain field.
   */
  public static normalize(rawPayload: any): NormalizedAIPayload {
    if (!rawPayload || typeof rawPayload !== "object") {
      const media = typeof rawPayload === "string" ? rawPayload : "";
      const mediaType = this.detectMediaType({ url: media });
      return {
        inputMediaType: mediaType,
        outputMediaType: mediaType,
        imageBase64OrUrl: mediaType === "image" ? media : undefined,
        videoBase64OrUrl: mediaType === "video" ? media : undefined,
        audioBase64OrUrl: mediaType === "audio" ? media : undefined,
        mediaUrlOrBase64: media,
        prompt: "",
        negativePrompt: "",
        toolId: "ai-tool-default",
        pluginId: "ai-plugin-default",
        historyId: `hist_${Date.now()}`,
        projectId: "proj_default",
        action: "default",
      };
    }

    const inputMediaType = this.detectMediaType(rawPayload);
    const outputMediaType = rawPayload.outputMediaType || inputMediaType;

    // Extract primary media candidate string
    const mediaCandidate =
      rawPayload.mediaUrlOrBase64 ||
      rawPayload.mediaUrl ||
      rawPayload.url ||
      rawPayload.src ||
      rawPayload.inputUrl ||
      "";

    // Extract Blob / File candidate
    const blobCandidate =
      rawPayload.file ||
      rawPayload.blob ||
      undefined;

    // Strict Domain Isolation: Only populate the matching media property
    const imageBase64OrUrl = inputMediaType === "image"
      ? (rawPayload.imageBase64OrUrl || (typeof rawPayload.image === "string" ? rawPayload.image : "") || mediaCandidate)
      : undefined;

    const videoBase64OrUrl = inputMediaType === "video"
      ? (rawPayload.videoBase64OrUrl || (typeof rawPayload.video === "string" ? rawPayload.video : "") || mediaCandidate)
      : undefined;

    const audioBase64OrUrl = inputMediaType === "audio"
      ? (rawPayload.audioBase64OrUrl || (typeof rawPayload.audio === "string" ? rawPayload.audio : "") || mediaCandidate)
      : undefined;

    const imageBlob = inputMediaType === "image"
      ? (rawPayload.imageBlob || (rawPayload.image instanceof Blob ? rawPayload.image : undefined) || blobCandidate)
      : undefined;

    const videoFile = inputMediaType === "video"
      ? (rawPayload.videoFile || (rawPayload.video instanceof Blob ? rawPayload.video : undefined) || blobCandidate)
      : undefined;

    const audioFile = inputMediaType === "audio"
      ? (rawPayload.audioFile || (rawPayload.audio instanceof Blob ? rawPayload.audio : undefined) || blobCandidate)
      : undefined;

    const normalized: NormalizedAIPayload = {
      ...rawPayload,
      inputMediaType,
      outputMediaType,
      mediaUrlOrBase64: mediaCandidate || imageBase64OrUrl || videoBase64OrUrl || audioBase64OrUrl || "",
      imageBase64OrUrl,
      videoBase64OrUrl,
      audioBase64OrUrl,
      imageBlob,
      videoFile,
      audioFile,
      mask: rawPayload.mask || rawPayload.maskBase64OrUrl || undefined,
      prompt: rawPayload.prompt || rawPayload.rawPrompt || "",
      negativePrompt: rawPayload.negativePrompt || "",
      toolId: rawPayload.toolId || rawPayload.action || rawPayload.taskType || "ai-tool-default",
      pluginId: rawPayload.pluginId || "ai-plugin-default",
      historyId: rawPayload.historyId || `hist_${Date.now()}`,
      projectId: rawPayload.projectId || "proj_default",
      action: rawPayload.action || rawPayload.actionName || "",
    };

    return normalized;
  }

  /**
   * Validates normalized payload against target domain requirements
   */
  public static validate(payload: any, domain: PayloadDomain = "general"): PayloadValidationResult {
    const normalized = this.normalize(payload);
    const errors: string[] = [];

    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Payload Validation", { domain, normalizedKeys: Object.keys(normalized) });

    if (domain === "image") {
      const hasImageString = Boolean(normalized.imageBase64OrUrl && normalized.imageBase64OrUrl.trim().length > 0);
      const hasImageBlob = Boolean(normalized.imageBlob);
      if (!hasImageString && !hasImageBlob) {
        errors.push("Image input (imageBase64OrUrl or imageBlob) is required and cannot be empty.");
      }
    } else if (domain === "video") {
      const hasVideoString = Boolean(normalized.videoBase64OrUrl && normalized.videoBase64OrUrl.trim().length > 0);
      const hasVideoFile = Boolean(normalized.videoFile);
      if (!hasVideoString && !hasVideoFile) {
        errors.push("Video input (videoBase64OrUrl or videoFile) is required and cannot be empty.");
      }
    } else if (domain === "audio") {
      const hasAudioString = Boolean(normalized.audioBase64OrUrl && normalized.audioBase64OrUrl.trim().length > 0);
      const hasAudioFile = Boolean(normalized.audioFile);
      if (!hasAudioString && !hasAudioFile) {
        errors.push("Audio input (audioBase64OrUrl or audioFile) is required and cannot be empty.");
      }
    } else if (domain === "generation") {
      const hasPrompt = Boolean(normalized.prompt && normalized.prompt.trim().length > 0);
      if (!hasPrompt) {
        errors.push("Generation prompt (prompt) is required and cannot be empty.");
      }
    }

    const valid = errors.length === 0;

    if (!valid) {
      console.error("[PayloadValidator] Validation failed:", errors);
      debugLogger.logStage("Payload Validation Failed", { errors, normalized });
    } else {
      debugLogger.logStage("Payload Validated Successfully", { domain });
    }

    return {
      valid,
      errors,
      normalizedPayload: normalized,
    };
  }
}
