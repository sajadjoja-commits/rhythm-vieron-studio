export interface PromptBuildResult {
  rawPrompt: string;
  finalPrompt: string;
  selectedStyleId: string;
  styleSuffixUsed: string;
  isModified: boolean;
  lengthBefore: number;
  lengthAfter: number;
}

export class PromptBuilder {
  /**
   * Safely builds a final prompt from raw user input and visual style options.
   * GUARANTEE: Never modifies, truncates, translates, or replaces the raw user text.
   * Modifiers are strictly appended as additive non-destructive visual descriptors.
   */
  public static build(
    rawUserPrompt: string,
    stylePresetSuffix?: string,
    additionalModifiers?: string[]
  ): PromptBuildResult {
    const trimmedRaw = (rawUserPrompt || "").trim();
    const suffixes: string[] = [];

    if (stylePresetSuffix && stylePresetSuffix.trim().length > 0) {
      const cleanSuffix = stylePresetSuffix.trim().replace(/^,\s*/, "");
      if (cleanSuffix) {
        suffixes.push(cleanSuffix);
      }
    }

    if (additionalModifiers && additionalModifiers.length > 0) {
      additionalModifiers.forEach((m) => {
        if (m && m.trim().length > 0) {
          const cleanM = m.trim().replace(/^,\s*/, "");
          if (cleanM) {
            suffixes.push(cleanM);
          }
        }
      });
    }

    const styleSuffixUsed = suffixes.length > 0 ? `, ${suffixes.join(", ")}` : "";
    const finalPrompt = trimmedRaw
      ? `${trimmedRaw}${styleSuffixUsed}`
      : styleSuffixUsed.replace(/^,\s*/, "");

    return {
      rawPrompt: trimmedRaw,
      finalPrompt,
      selectedStyleId: stylePresetSuffix || "none",
      styleSuffixUsed,
      isModified: finalPrompt !== trimmedRaw,
      lengthBefore: trimmedRaw.length,
      lengthAfter: finalPrompt.length,
    };
  }
}
