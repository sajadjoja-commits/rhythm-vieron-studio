export interface AspectRatioOption {
  id: string;
  label: string;
  w: number;
  h: number;
  ratioValue: number;
  nameAr: string;
  nameEn: string;
  category: "social" | "video" | "cinema" | "photo";
  platforms: string[];
  primaryPlatform: string;
  baseWidth: number;
  baseHeight: number;
  resolutionLabel: string;
  emoji: string;
  iconType: "phone" | "desktop" | "square" | "portrait" | "film" | "tv" | "cinema" | "camera";
  hasSafeZones?: boolean;
  safeZoneType?: "reels_tiktok" | "youtube_safe" | "instagram_grid";
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  {
    id: "16_9",
    label: "16:9",
    w: 16,
    h: 9,
    ratioValue: 16 / 9,
    nameAr: "يوتيوب / شاشات عريضة",
    nameEn: "YouTube / Widescreen",
    category: "video",
    platforms: ["YouTube", "Facebook", "TV", "Landscape"],
    primaryPlatform: "YouTube",
    baseWidth: 1920,
    baseHeight: 1080,
    resolutionLabel: "1920 × 1080 (FHD)",
    emoji: "🖥️",
    iconType: "desktop",
    hasSafeZones: true,
    safeZoneType: "youtube_safe",
  },
  {
    id: "9_16",
    label: "9:16",
    w: 9,
    h: 16,
    ratioValue: 9 / 16,
    nameAr: "تيك توك / ريلز / شورتس",
    nameEn: "TikTok / Reels / Shorts",
    category: "social",
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts", "Snapchat", "Stories"],
    primaryPlatform: "TikTok & Reels",
    baseWidth: 1080,
    baseHeight: 1920,
    resolutionLabel: "1080 × 1920 (Vertical HD)",
    emoji: "📱",
    iconType: "phone",
    hasSafeZones: true,
    safeZoneType: "reels_tiktok",
  },
  {
    id: "1_1",
    label: "1:1",
    w: 1,
    h: 1,
    ratioValue: 1,
    nameAr: "انستغرام / منشور مربع",
    nameEn: "Instagram / Square Post",
    category: "social",
    platforms: ["Instagram Feed", "Facebook", "Twitter / X", "LinkedIn"],
    primaryPlatform: "Instagram Feed",
    baseWidth: 1080,
    baseHeight: 1080,
    resolutionLabel: "1080 × 1080 (Square HD)",
    emoji: "⏹️",
    iconType: "square",
    hasSafeZones: true,
    safeZoneType: "instagram_grid",
  },
  {
    id: "4_5",
    label: "4:5",
    w: 4,
    h: 5,
    ratioValue: 4 / 5,
    nameAr: "انستغرام بورتريه عمودي",
    nameEn: "Instagram Portrait",
    category: "social",
    platforms: ["Instagram Portrait", "Facebook Feed"],
    primaryPlatform: "Instagram Portrait",
    baseWidth: 1080,
    baseHeight: 1350,
    resolutionLabel: "1080 × 1350 (Portrait HD)",
    emoji: "📸",
    iconType: "portrait",
    hasSafeZones: true,
    safeZoneType: "instagram_grid",
  },
  {
    id: "21_9",
    label: "21:9",
    w: 21,
    h: 9,
    ratioValue: 21 / 9,
    nameAr: "سينمائي فائق الاتساع",
    nameEn: "Ultrawide Cinema",
    category: "cinema",
    platforms: ["Cinema", "UltraWide", "Movie Trailers"],
    primaryPlatform: "Cinema 21:9",
    baseWidth: 2560,
    baseHeight: 1080,
    resolutionLabel: "2560 × 1080 (Ultrawide)",
    emoji: "🎞️",
    iconType: "film",
  },
  {
    id: "4_3",
    label: "4:3",
    w: 4,
    h: 3,
    ratioValue: 4 / 3,
    nameAr: "آيباد / تلفزيون كلاسيكي",
    nameEn: "iPad / Retro Standard",
    category: "video",
    platforms: ["iPad", "Classic TV", "Presentation"],
    primaryPlatform: "iPad / 4:3",
    baseWidth: 1440,
    baseHeight: 1080,
    resolutionLabel: "1440 × 1080 (4:3 Standard)",
    emoji: "📺",
    iconType: "tv",
  },
  {
    id: "9_21",
    label: "9:21",
    w: 9,
    h: 21,
    ratioValue: 9 / 21,
    nameAr: "شاشة هاتف ممتدة",
    nameEn: "Ultra-Tall Screen",
    category: "social",
    platforms: ["Modern Flagship Phones", "Full Screen Stories"],
    primaryPlatform: "Full Screen Mobile",
    baseWidth: 1080,
    baseHeight: 2520,
    resolutionLabel: "1080 × 2520 (Ultra Tall)",
    emoji: "🍿",
    iconType: "phone",
  },
  {
    id: "2_39_1",
    label: "2.39:1",
    w: 2.39,
    h: 1,
    ratioValue: 2.39,
    nameAr: "شاشة سينمائية عريضة",
    nameEn: "Anamorphic Scope",
    category: "cinema",
    platforms: ["Cinematic Scope", "Feature Films"],
    primaryPlatform: "Anamorphic Scope",
    baseWidth: 2580,
    baseHeight: 1080,
    resolutionLabel: "2580 × 1080 (Scope)",
    emoji: "🎥",
    iconType: "cinema",
  },
  {
    id: "2_1",
    label: "2:1",
    w: 2,
    h: 1,
    ratioValue: 2,
    nameAr: "يونيفيزيوم (18:9)",
    nameEn: "Univisium / 18:9",
    category: "cinema",
    platforms: ["Netflix", "Twitter Header", "Modern Web Series"],
    primaryPlatform: "Univisium (18:9)",
    baseWidth: 2160,
    baseHeight: 1080,
    resolutionLabel: "2160 × 1080 (2:1)",
    emoji: "🏞️",
    iconType: "film",
  },
  {
    id: "16_10",
    label: "16:10",
    w: 16,
    h: 10,
    ratioValue: 16 / 10,
    nameAr: "لابتوب وماك بوك",
    nameEn: "MacBook / Laptop",
    category: "video",
    platforms: ["MacBook", "Laptops", "Android Tablets"],
    primaryPlatform: "MacBook / Laptop",
    baseWidth: 1920,
    baseHeight: 1200,
    resolutionLabel: "1920 × 1200 (WUXGA)",
    emoji: "💻",
    iconType: "desktop",
  },
  {
    id: "3_2",
    label: "3:2",
    w: 3,
    h: 2,
    ratioValue: 3 / 2,
    nameAr: "كاميرات التصوير (DSLR)",
    nameEn: "DSLR Photography",
    category: "photo",
    platforms: ["DSLR", "Mirrorless", "35mm Film"],
    primaryPlatform: "DSLR Photo",
    baseWidth: 1620,
    baseHeight: 1080,
    resolutionLabel: "1620 × 1080 (3:2 Photo)",
    emoji: "🖼️",
    iconType: "camera",
  },
  {
    id: "5_4",
    label: "5:4",
    w: 5,
    h: 4,
    ratioValue: 5 / 4,
    nameAr: "شاشات ومطبوعات كلاسيكية",
    nameEn: "Classic Print / Monitor",
    category: "photo",
    platforms: ["Print", "Classic Desktop 1280x1024"],
    primaryPlatform: "Classic 5:4",
    baseWidth: 1350,
    baseHeight: 1080,
    resolutionLabel: "1350 × 1080 (5:4)",
    emoji: "💾",
    iconType: "desktop",
  },
];

/**
 * Returns closest aspect ratio preset matching given pixel dimensions.
 */
export function findClosestRatioIndex(width: number, height: number): number {
  if (!width || !height || height === 0) return 0;
  const mediaRatio = width / height;
  let bestIndex = 0;
  let minDiff = Infinity;

  ASPECT_RATIOS.forEach((r, idx) => {
    const diff = Math.abs(r.ratioValue - mediaRatio);
    if (diff < minDiff) {
      minDiff = diff;
      bestIndex = idx;
    }
  });

  return bestIndex;
}

/**
 * Computes exact CSS style parameters to fit aspect ratio seamlessly inside container bounds
 */
export function getContainerFitStyles(targetRatio: AspectRatioOption) {
  return {
    aspectRatio: `${targetRatio.w} / ${targetRatio.h}`,
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
  };
}
