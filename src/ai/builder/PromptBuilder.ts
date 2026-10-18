import {
  hasArabicCharacters,
  optimizePrompt,
  appendQualityModifiers,
  DEFAULT_QUALITY_MODIFIERS,
  OptimizedPromptInfo,
} from "../utils/promptOptimizer";

export interface PromptBuildResult {
  rawPrompt: string;
  finalPrompt: string;
  selectedStyleId: string;
  styleSuffixUsed: string;
  isModified: boolean;
  lengthBefore: number;
  lengthAfter: number;
  isArabic?: boolean;
  wasTranslated?: boolean;
  translatedPrompt?: string;
  translationSource?: string;
  qualityModifiersUsed?: string[];
}

export class PromptBuilder {
  /**
   * Asynchronously builds and optimizes a prompt:
   * 1. Detects Arabic script.
   * 2. Automatically translates Arabic to descriptive English for maximum diffusion model fidelity.
   * 3. Appends standard quality-boosting modifiers (high quality, detailed, sharp focus, 4k, professional).
   * 4. Incorporates style preset suffixes.
   */
  public static async buildAsync(
    rawUserPrompt: string,
    stylePresetSuffix?: string,
    additionalModifiers?: string[]
  ): Promise<PromptBuildResult> {
    const trimmedRaw = (rawUserPrompt || "").trim();

    // 1. Optimize prompt (detects Arabic, translates, and adds quality modifiers)
    const customModifiers = [
      ...DEFAULT_QUALITY_MODIFIERS,
      ...(additionalModifiers || []),
    ];

    const optimized: OptimizedPromptInfo = await optimizePrompt(
      trimmedRaw,
      stylePresetSuffix,
      customModifiers
    );

    return {
      rawPrompt: trimmedRaw,
      finalPrompt: optimized.finalPrompt,
      selectedStyleId: stylePresetSuffix || "none",
      styleSuffixUsed: stylePresetSuffix || "",
      isModified: optimized.finalPrompt !== trimmedRaw,
      lengthBefore: trimmedRaw.length,
      lengthAfter: optimized.finalPrompt.length,
      isArabic: optimized.isArabic,
      wasTranslated: optimized.wasTranslated,
      translatedPrompt: optimized.translatedPrompt,
      translationSource: optimized.translationSource,
      qualityModifiersUsed: optimized.qualityModifiersAppended,
    };
  }

  /**
   * Synchronous fallback builder:
   * Appends quality-boosting modifiers and style presets.
   */
  public static build(
    rawUserPrompt: string,
    stylePresetSuffix?: string,
    additionalModifiers?: string[]
  ): PromptBuildResult {
    const trimmedRaw = (rawUserPrompt || "").trim();
    const isArabic = hasArabicCharacters(trimmedRaw);

    const customModifiers = [
      ...DEFAULT_QUALITY_MODIFIERS,
      ...(additionalModifiers || []),
    ];

    const { enhancedPrompt, modifiersAppended } = appendQualityModifiers(
      trimmedRaw,
      stylePresetSuffix,
      customModifiers
    );

    return {
      rawPrompt: trimmedRaw,
      finalPrompt: enhancedPrompt,
      selectedStyleId: stylePresetSuffix || "none",
      styleSuffixUsed: stylePresetSuffix || "",
      isModified: enhancedPrompt !== trimmedRaw,
      lengthBefore: trimmedRaw.length,
      lengthAfter: enhancedPrompt.length,
      isArabic,
      wasTranslated: false,
      qualityModifiersUsed: modifiersAppended,
    };
  }
}

