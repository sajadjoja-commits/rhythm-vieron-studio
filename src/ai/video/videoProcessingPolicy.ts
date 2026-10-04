import { VideoAIOptions, VideoCapabilityProfile } from "./types";

/** Preserve aspect ratio, avoid upscaling, and use codec-safe even dimensions. */
export function processingDimensions(width: number, height: number, profile: VideoCapabilityProfile, options?: VideoAIOptions) {
  const requested = options?.maxResolution;
  const limit = requested === "original" ? Math.max(width, height)
    : requested === "1080p" ? 1920 : requested === "720p" ? 1280 : requested === "480p" ? 854
    : profile.deviceMemoryGB <= 4 || profile.isAndroid || profile.isIOS ? 1280 : 1920;
  const scale = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2),
  };
}