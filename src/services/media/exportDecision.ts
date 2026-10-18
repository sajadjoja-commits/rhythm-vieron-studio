import { Capacitor } from "@capacitor/core";
import { MediaItem, Clip } from "@/context/MediaContext";

export type ExportPathType = "NATIVE_FAST_PATH" | "WEB_RENDER_PATH";

export interface ExportDecisionContext {
  clips: Clip[];
  media: MediaItem[];
  captions?: any[];
  filters?: any[];
  vfx?: any[];
  overlays?: any[];
  audioTracks?: any[];
  isNativePlatform?: boolean;
}

export interface ExportDecision {
  pathType: ExportPathType;
  reason: string;
  nativeConfig?: {
    inputUri: string;
    startTime?: number;
    endTime?: number;
  };
}

/**
 * Determines whether the export operation can be executed via the Native Fast Path
 * (stream copy / remux / trimming via MediaExtractor & MediaMuxer without re-encoding or JS heap bloat)
 * or requires the full Web Render Path (FFmpeg / Canvas composition for text, effects, transitions, overlays).
 */
export function resolveExportPath(context: ExportDecisionContext): ExportDecision {
  const isNative = context.isNativePlatform !== undefined 
    ? context.isNativePlatform 
    : Capacitor.isNativePlatform();

  // 1. Non-native environments must use the Web Render Path
  if (!isNative) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Running in Web/Browser environment",
    };
  }

  // 2. Timeline must have at least one clip
  if (!context.clips || context.clips.length === 0) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline is empty",
    };
  }

  // 3. Complex multi-track or composition requires Web rendering
  if (context.clips.length > 1) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline contains multiple clips requiring cross-clip composition/transitions",
    };
  }

  // 4. Captions or text rendering requires canvas/web frame rendering
  if (context.captions && context.captions.length > 0) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline contains captions/text that require per-frame rendering",
    };
  }

  // 5. Visual color filters require shader/canvas rendering
  if (context.filters && context.filters.length > 0) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline contains visual color filters",
    };
  }

  // 6. Visual VFX animations require Web canvas rendering
  if (context.vfx && context.vfx.length > 0) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline contains VFX effects",
    };
  }

  // 7. Graphic/image overlays or stickers require composition
  if (context.overlays && context.overlays.length > 0) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline contains overlays or stickers",
    };
  }

  // 8. Multiple mixed audio tracks require audio mixer
  if (context.audioTracks && context.audioTracks.length > 0) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Timeline contains multiple background audio tracks",
    };
  }

  const singleClip = context.clips[0];
  const mediaItem = context.media.find((m) => m.id === singleClip.mediaId);

  // 9. Media item must exist and be a video
  if (!mediaItem) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Clip media item not found",
    };
  }

  if (mediaItem.type !== "video") {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Clip is a static image, requires video generation via canvas",
    };
  }

  // 10. Native URI or path must be available
  const nativeUri = mediaItem.nativePath || mediaItem.nativeUri;
  if (!nativeUri) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Media item does not have a native file path or content URI",
    };
  }

  // 11. Clip transitions or non-standard speed require re-encoding
  if (singleClip.transitionIn && singleClip.transitionIn.type !== "none") {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Clip has transition effect",
    };
  }

  if (singleClip.speed && singleClip.speed !== 1) {
    return {
      pathType: "WEB_RENDER_PATH",
      reason: "Clip has speed modification requiring sample resampling",
    };
  }

  // Eligible for Native Fast Path!
  return {
    pathType: "NATIVE_FAST_PATH",
    reason: "Single video clip with stream copy or trim; no frame rendering needed",
    nativeConfig: {
      inputUri: nativeUri,
      startTime: singleClip.in,
      endTime: singleClip.out,
    },
  };
}
