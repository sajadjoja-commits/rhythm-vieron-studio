import { VideoAIOptions, VideoCapabilityProfile } from "./types";

/** Preserve aspect ratio, avoid upscaling, and use codec-safe even dimensions. */
export function processingDimensions(
  width: number,
  height: number,
  profile: VideoCapabilityProfile,
  options?: VideoAIOptions
) {
  const requested = options?.maxResolution;
  let limit: number;

  if (requested === "original") {
    limit = Math.max(width, height);
  } else if (requested === "1080p") {
    limit = 1920;
  } else if (requested === "720p") {
    limit = 1280;
  } else if (requested === "480p") {
    limit = 854;
  } else if (profile.isAndroid) {
    limit = profile.deviceMemoryGB >= 6 && profile.memoryKnown ? 1920 : 1280;
  } else if (profile.deviceMemoryGB <= 4 || profile.isIOS) {
    limit = 1280;
  } else {
    limit = 1920;
  }

  const maxSide = Math.max(width, height);
  const scale = Math.min(1, limit / maxSide);
  const outW = Math.max(2, Math.floor((width * scale) / 2) * 2);
  const outH = Math.max(2, Math.floor((height * scale) / 2) * 2);
  const downscaled = scale < 1 || outW < width || outH < height;

  return {
    width: outW,
    height: outH,
    outputWidth: outW,
    outputHeight: outH,
    downscaled,
  };
}