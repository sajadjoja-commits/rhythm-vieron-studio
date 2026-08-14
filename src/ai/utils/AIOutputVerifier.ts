import { AIResponse } from "../types/ai";

import { PayloadValidator } from "./PayloadValidator";

export interface VerificationResult {
  passed: boolean;
  reason?: string;
  domain?: "image" | "audio" | "video" | "text";
  metrics?: {
    inputLength?: number;
    outputLength?: number;
    isIdentical?: boolean;
    pixelDifferenceCount?: number;
    hasAlphaChannel?: boolean;
    transparentPixelCount?: number;
  };
}

export class AIOutputVerifier {
  /**
   * Verifies that the AI processing output is valid and distinct from the input media/text.
   * Enforces strict domain separation to prevent domain contamination.
   */
  public static verify<TResult = any>(
    taskType: string,
    inputPayload: any,
    result: TResult,
    expectedDomain: "image" | "audio" | "video" | "text" = "image"
  ): VerificationResult {
    if (!result) {
      return {
        passed: false,
        domain: expectedDomain,
        reason: `[AIOutputVerifier] Output result for task "${taskType}" is null or undefined`,
      };
    }

    // Determine actual payload domain
    const actualDomain = PayloadValidator.detectMediaType(inputPayload);

    // Domain mismatch check: if verifier called for audio/video but payload is image, or vice versa
    if (actualDomain !== "general" && expectedDomain !== "text" && actualDomain !== expectedDomain) {
      return {
        passed: false,
        domain: expectedDomain,
        reason: `[AIOutputVerifier] Domain Mismatch Error: Verification requested for '${expectedDomain}' but input payload is '${actualDomain}'. Processing pipeline routing defect prevented.`,
      };
    }

    if (expectedDomain === "image") {
      return this.verifyImageOutput(taskType, inputPayload, result);
    } else if (expectedDomain === "audio") {
      return this.verifyAudioOutput(inputPayload, result);
    } else if (expectedDomain === "video") {
      return this.verifyVideoOutput(inputPayload, result);
    } else if (expectedDomain === "text") {
      return this.verifyTextOutput(inputPayload, result);
    }

    return { passed: true, domain: expectedDomain };
  }

  private static verifyImageOutput(taskType: string, inputPayload: any, result: any): VerificationResult {
    const inputStr = String(
      inputPayload?.imageBase64OrUrl ||
      inputPayload?.image ||
      inputPayload?.mediaUrlOrBase64 ||
      ""
    ).trim();

    const outputStr = String(
      result?.outputImageBase64OrUrl ||
      result?.processedImageUrlOrBase64 ||
      result?.imageUrl ||
      result?.enhancedMediaUrlOrBase64 ||
      ""
    ).trim();

    if (!outputStr || outputStr.length < 10) {
      return {
        passed: false,
        domain: "image",
        reason: "[AIOutputVerifier] Image output is empty or invalid data URL",
      };
    }

    if (inputStr && inputStr === outputStr) {
      return {
        passed: false,
        domain: "image",
        reason: "[AIOutputVerifier] Image output is identical to input image. Verification failed: Image processing model did not modify the canvas.",
        metrics: { inputLength: inputStr.length, outputLength: outputStr.length, isIdentical: true },
      };
    }

    // Resolution check for upscale
    if ((taskType === "upscale" || taskType === "real-esrgan-upscale" || taskType === "enhance-media") && result?.qualityMetrics?.originalWidth && result?.width) {
      const expectedScale = result?.qualityMetrics?.scaleFactor || inputPayload?.upscaleFactor || 2;
      const expectedW = result.qualityMetrics.originalWidth * expectedScale;
      const expectedH = (result.qualityMetrics.originalHeight || 0) * expectedScale;

      if (result.width !== expectedW) {
        return {
          passed: false,
          domain: "image",
          reason: `[AIOutputVerifier] Real-ESRGAN upscale resolution check failed: output width (${result.width}) does not equal target x${expectedScale} width (${expectedW})`,
          metrics: { inputLength: inputStr.length, outputLength: outputStr.length },
        };
      }

      if (result.height && expectedH > 0 && result.height !== expectedH) {
        return {
          passed: false,
          domain: "image",
          reason: `[AIOutputVerifier] Real-ESRGAN upscale resolution check failed: output height (${result.height}) does not equal target x${expectedScale} height (${expectedH})`,
          metrics: { inputLength: inputStr.length, outputLength: outputStr.length },
        };
      }
    }

    // Alpha / Transparency check for background removal
    if (taskType === "remove-background" || taskType === "background-removal" || taskType === "rmbg-2-bg-removal") {
      if (result?.qualityMetrics && result.qualityMetrics.hasAlphaChannel === false) {
        return {
          passed: false,
          domain: "image",
          reason: "[AIOutputVerifier] RMBG-2.0 background removal verification failed: output image has no alpha channel or transparent pixels.",
          metrics: { inputLength: inputStr.length, outputLength: outputStr.length, hasAlphaChannel: false },
        };
      }
    }

    return {
      passed: true,
      domain: "image",
      metrics: {
        inputLength: inputStr.length,
        outputLength: outputStr.length,
        isIdentical: false,
      },
    };
  }

  private static verifyAudioOutput(inputPayload: any, result: any): VerificationResult {
    const inputStr = String(
      inputPayload?.audioBase64OrUrl ||
      inputPayload?.audioBase64 ||
      ""
    ).trim();

    const outputStr = String(
      result?.enhancedAudioUrlOrBase64 ||
      result?.processedAudioUrlOrBase64 ||
      ""
    ).trim();

    if (!outputStr && !result?.stems?.vocals) {
      return {
        passed: false,
        domain: "audio",
        reason: "[AIOutputVerifier] Audio output and stems are empty",
      };
    }

    if (inputStr && outputStr && inputStr === outputStr) {
      return {
        passed: false,
        domain: "audio",
        reason: "[AIOutputVerifier] Audio output is identical to input audio. Verification failed: No real DSP processing occurred.",
        metrics: { inputLength: inputStr.length, outputLength: outputStr.length, isIdentical: true },
      };
    }

    if (result?.stems) {
      const vocals = String(result.stems.vocals || "").trim();
      const inst = String(result.stems.instrumental || "").trim();

      if (vocals && inst && vocals === inst && vocals === inputStr) {
        return {
          passed: false,
          domain: "audio",
          reason: "[AIOutputVerifier] Audio Demucs stems are identical to original input. Stem separation failed.",
          metrics: { isIdentical: true },
        };
      }
    }

    return { passed: true, domain: "audio" };
  }

  private static verifyVideoOutput(inputPayload: any, result: any): VerificationResult {
    const inputStr = String(
      inputPayload?.videoBase64OrUrl ||
      ""
    ).trim();

    const outputStr = String(
      result?.outputVideoBase64OrUrl ||
      ""
    ).trim();

    if (!outputStr || outputStr.length < 5) {
      return {
        passed: false,
        domain: "video",
        reason: "[AIOutputVerifier] Video processing output is empty",
      };
    }

    if (inputStr && inputStr === outputStr) {
      return {
        passed: false,
        domain: "video",
        reason: "[AIOutputVerifier] Video output URL is identical to input video. Verification failed: No real video frame processing occurred.",
        metrics: { isIdentical: true },
      };
    }

    return { passed: true, domain: "video" };
  }

  private static verifyTextOutput(inputPayload: any, result: any): VerificationResult {
    if (result?.captions && Array.isArray(result.captions) && result.captions.length === 0) {
      return {
        passed: false,
        domain: "text",
        reason: "[AIOutputVerifier] Speech-to-Text returned no captions",
      };
    }

    if (result?.translatedText !== undefined && String(result.translatedText).trim().length === 0) {
      return {
        passed: false,
        domain: "text",
        reason: "[AIOutputVerifier] Translation output is empty",
      };
    }

    return { passed: true, domain: "text" };
  }
}
