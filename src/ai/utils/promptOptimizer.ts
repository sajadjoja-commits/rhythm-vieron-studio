/**
 * Prompt Optimizer & Arabic Translation Utility for Image Generation
 *
 * Resolves poor output quality from text-to-image models (Flux, Pollinations, SD)
 * when provided with Arabic prompts by:
 * 1. Accurately detecting Arabic script (Unicode range).
 * 2. Automatically translating Arabic prompts to descriptive English using lightweight free APIs.
 * 3. Appending standard quality-boosting modifiers (e.g., "high quality, detailed, sharp focus, 4k, professional")
 *    for BOTH English and translated prompts.
 * 4. Providing complete transparency regarding the original, translated, and final prompt.
 */

export const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Detects whether a string contains any Arabic characters
 */
export function hasArabicCharacters(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return ARABIC_CHAR_REGEX.test(text);
}

/**
 * Decodes common HTML entities returned by translation APIs (e.g. &#39; -> ')
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Standard diffusion model positive quality modifiers that dramatically
 * elevate clarity, lighting, texture rendering, and focus.
 */
export const DEFAULT_QUALITY_MODIFIERS: string[] = [
  "high quality",
  "detailed",
  "sharp focus",
  "4k",
  "professional",
];

/**
 * Basic offline fallback dictionary for common visual concepts
 */
const OFFLINE_ARABIC_DICTIONARY: Record<string, string> = {
  قطة: "cat",
  قط: "cat",
  هر: "cat",
  هرة: "cat",
  كلب: "dog",
  حصان: "horse",
  طائر: "bird",
  صقر: "falcon",
  نسر: "eagle",
  أسد: "lion",
  نمر: "tiger",
  فهد: "leopard",
  ذئب: "wolf",
  كرسي: "chair",
  أريكة: "couch",
  نافذة: "window",
  باب: "door",
  غرفة: "room",
  منزل: "house",
  بيت: "house",
  مبنى: "building",
  شارع: "street",
  مدينة: "city",
  غابة: "forest",
  حديقة: "garden",
  شجرة: "tree",
  أشجار: "trees",
  زهرة: "flower",
  وردة: "rose",
  بحر: "sea",
  محيط: "ocean",
  شاطئ: "beach",
  جبل: "mountain",
  قمر: "moon",
  شمس: "sun",
  غروب: "sunset",
  شروق: "sunrise",
  سماء: "sky",
  غيوم: "clouds",
  مطر: "rain",
  ثلج: "snow",
  صحراء: "desert",
  نهر: "river",
  بحيرة: "lake",
  رجل: "man",
  امرأة: "woman",
  فتاة: "girl",
  صبي: "boy",
  طفل: "child",
  شخص: "person",
  محارب: "warrior",
  ملك: "king",
  ملكة: "queen",
  فارس: "knight",
  سيارة: "car",
  طائرة: "airplane",
  سفينة: "ship",
  فضاء: "space",
  كوكب: "planet",
  نجوم: "stars",
  مقهى: "cafe",
  طاولة: "table",
  كتاب: "book",
  لوحة: "painting",
  صورة: "photo",
  سينمائي: "cinematic",
  واقعي: "realistic",
  جميل: "beautiful",
  ذهبي: "golden",
  فضي: "silver",
  أزرق: "blue",
  أحمر: "red",
  أخضر: "green",
  أصفر: "yellow",
  أبيض: "white",
  أسود: "black",
  كبير: "large",
  صغير: "small",
  مضيء: "glowing",
  نيون: "neon",
  مستقبلي: "futuristic",
  قديم: "vintage",
  يجلس: "sitting",
  تجلس: "sitting",
  يقف: "standing",
  تقف: "standing",
  يجري: "running",
  تجري: "running",
  يطير: "flying",
  تحلق: "soaring",
  يمشي: "walking",
  على: "on",
  في: "in",
  بجانب: "beside",
  قرب: "near",
  فوق: "above",
  تحت: "under",
  مع: "with",
};

/**
 * Translates an Arabic text to English using free, lightweight endpoints with fallbacks.
 */
export async function translateArabicToEnglish(arabicText: string): Promise<{
  translatedText: string;
  source: "mymemory" | "lingva" | "dictionary" | "original";
  success: boolean;
}> {
  const trimmed = arabicText.trim();
  if (!trimmed) {
    return { translatedText: "", source: "original", success: true };
  }

  // 1. Primary Method: Free MyMemory Translation API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const encoded = encodeURIComponent(trimmed);
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=ar|en`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawTranslation = data?.responseData?.translatedText;

      if (rawTranslation && typeof rawTranslation === "string") {
        const cleaned = decodeHtmlEntities(rawTranslation.trim());
        // Verify translation does not contain error strings and is not completely empty
        if (cleaned && !cleaned.toLowerCase().includes("mymemory warning") && cleaned !== trimmed) {
          return {
            translatedText: cleaned,
            source: "mymemory",
            success: true,
          };
        }
      }
    }
  } catch (err) {
    // Fallthrough to next strategy
  }

  // 2. Secondary Fallback: Free Lingva / Public Mirror
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const encoded = encodeURIComponent(trimmed);
    const url = `https://lingva.ml/api/v1/ar/en/${encoded}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const translation = data?.translation;
      if (translation && typeof translation === "string" && translation.trim() !== trimmed) {
        return {
          translatedText: decodeHtmlEntities(translation.trim()),
          source: "lingva",
          success: true,
        };
      }
    }
  } catch (err) {
    // Fallthrough to dictionary
  }

  // 3. Tertiary Fallback: Offline Arabic Dictionary Word-by-Word Mapping
  const words = trimmed.split(/\s+/);
  let translatedWordsCount = 0;
  const mappedWords = words.map((w) => {
    // Clean punctuation
    const cleanWord = w.replace(/[،.؟!:;]/g, "");
    if (OFFLINE_ARABIC_DICTIONARY[cleanWord]) {
      translatedWordsCount++;
      return OFFLINE_ARABIC_DICTIONARY[cleanWord];
    }
    // Remove "ال" prefix if present
    if (cleanWord.startsWith("ال") && cleanWord.length > 3) {
      const stem = cleanWord.slice(2);
      if (OFFLINE_ARABIC_DICTIONARY[stem]) {
        translatedWordsCount++;
        return OFFLINE_ARABIC_DICTIONARY[stem];
      }
    }
    return w;
  });

  if (translatedWordsCount > 0 && translatedWordsCount >= Math.ceil(words.length * 0.4)) {
    return {
      translatedText: mappedWords.join(" "),
      source: "dictionary",
      success: true,
    };
  }

  // If all failed, return original with success=false
  return {
    translatedText: trimmed,
    source: "original",
    success: false,
  };
}

/**
 * Appends standard positive quality modifiers to a prompt.
 * Avoids adding duplicates if the prompt or style suffix already includes them.
 */
export function appendQualityModifiers(
  basePrompt: string,
  stylePresetSuffix?: string,
  customModifiers: string[] = DEFAULT_QUALITY_MODIFIERS
): {
  enhancedPrompt: string;
  modifiersAppended: string[];
} {
  const trimmed = (basePrompt || "").trim();
  const existingTextLower = `${trimmed} ${stylePresetSuffix || ""}`.toLowerCase();

  const modifiersToAdd: string[] = [];

  for (const mod of customModifiers) {
    const cleanMod = mod.trim().toLowerCase();
    if (!cleanMod) continue;

    // Check if whole word or phrase already exists
    if (!existingTextLower.includes(cleanMod)) {
      modifiersToAdd.push(mod.trim());
    }
  }

  const parts: string[] = [];
  if (trimmed) parts.push(trimmed);

  if (stylePresetSuffix && stylePresetSuffix.trim()) {
    const cleanStyle = stylePresetSuffix.trim().replace(/^,\s*/, "");
    if (cleanStyle) parts.push(cleanStyle);
  }

  if (modifiersToAdd.length > 0) {
    parts.push(modifiersToAdd.join(", "));
  }

  return {
    enhancedPrompt: parts.join(", "),
    modifiersAppended: modifiersToAdd,
  };
}

export interface OptimizedPromptInfo {
  rawPrompt: string;
  isArabic: boolean;
  wasTranslated: boolean;
  translatedPrompt?: string;
  translationSource?: string;
  stylePresetUsed?: string;
  qualityModifiersAppended: string[];
  finalPrompt: string;
}

/**
 * Full Pipeline: Detects language, translates Arabic to English if needed,
 * and appends quality-boosting terms for both English and translated prompts.
 */
export async function optimizePrompt(
  rawPrompt: string,
  stylePresetSuffix?: string,
  customModifiers: string[] = DEFAULT_QUALITY_MODIFIERS
): Promise<OptimizedPromptInfo> {
  const trimmed = (rawPrompt || "").trim();
  const isArabic = hasArabicCharacters(trimmed);

  let effectiveBasePrompt = trimmed;
  let translatedPrompt: string | undefined = undefined;
  let wasTranslated = false;
  let translationSource: string | undefined = undefined;

  if (isArabic && trimmed) {
    const translationResult = await translateArabicToEnglish(trimmed);
    if (translationResult.success && translationResult.translatedText) {
      translatedPrompt = translationResult.translatedText;
      effectiveBasePrompt = translationResult.translatedText;
      wasTranslated = true;
      translationSource = translationResult.source;
    }
  }

  const { enhancedPrompt, modifiersAppended } = appendQualityModifiers(
    effectiveBasePrompt,
    stylePresetSuffix,
    customModifiers
  );

  return {
    rawPrompt: trimmed,
    isArabic,
    wasTranslated,
    translatedPrompt,
    translationSource,
    stylePresetUsed: stylePresetSuffix,
    qualityModifiersAppended: modifiersAppended,
    finalPrompt: enhancedPrompt,
  };
}
