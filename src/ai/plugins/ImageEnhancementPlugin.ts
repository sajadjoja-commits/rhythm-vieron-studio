import { BasePlugin } from "./BasePlugin";
import {
  AIImagePayload,
  AIImageResult,
  ImageActionType,
} from "./types";
import { AICapability, AIJobOptions } from "../runtime/types";
import { AIResponse } from "../types/ai";
import { AIManager } from "../AIManager";
import { AICapabilityRegistry } from "../runtime/AICapabilityRegistry";
import { AIHistoryManager } from "../runtime/AIHistoryManager";
import { AIOutputVerifier } from "../utils/AIOutputVerifier";
import { PayloadValidator } from "../utils/PayloadValidator";
import { AIDebugLogger } from "../utils/AIDebugLogger";
import { imageAIEngine } from "../image/ImageAIEngine";

export class ImageEnhancementPlugin extends BasePlugin {
  public id = "plugin-image-enhancement";
  public name = "Unified Local Image AI Engine (MediaPipe, Real-ESRGAN, Inpainting, Denoise)";
  public version = "2.0.0";
  public description = "Production-Grade Local Neural Image AI Engine: Background Removal, Super Resolution Upscaling, Face Enhancement, Inpainting, and Denoise";

  public capabilities: AICapability[] = [
    {
      id: "ai-bg-removal",
      name: "Neural Background Removal (MediaPipe & RMBG)",
      taskType: "background-removal",
      domain: "image",
      executionMode: "auto",
      providerId: "plugin-image-enhancement",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "webp"],
      requiresWASM: true,
      estimatedRAMMB: 60,
      webSupported: true,
      androidSupported: true,
      description: "High-accuracy neural foreground extraction & alpha matting with hair/edge refinement",
    },
    {
      id: "ai-super-resolution-upscale",
      name: "Super Resolution Image Upscale (x2 / x4)",
      taskType: "enhance-media",
      domain: "image",
      executionMode: "auto",
      providerId: "plugin-image-enhancement",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "jpg", "webp"],
      requiresWebGPU: false,
      requiresWASM: true,
      estimatedRAMMB: 80,
      webSupported: true,
      androidSupported: true,
      description: "Neural super-resolution tile upscaling and high-frequency edge reconstruction",
    },
    {
      id: "ai-face-restore",
      name: "Facial Landmark Restoration & Enhancement",
      taskType: "enhance-media",
      domain: "image",
      executionMode: "auto",
      providerId: "plugin-image-enhancement",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "jpg"],
      requiresWASM: true,
      estimatedRAMMB: 75,
      webSupported: true,
      androidSupported: true,
      description: "Detects facial bounding boxes and restores degraded facial details and skin tone",
    },
    {
      id: "ai-object-removal",
      name: "Fast Fourier Texture Inpainting & Object Removal",
      taskType: "background-removal",
      domain: "image",
      executionMode: "auto",
      providerId: "plugin-image-enhancement",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "jpg", "webp"],
      requiresWASM: true,
      estimatedRAMMB: 70,
      webSupported: true,
      androidSupported: true,
      description: "Harmonic diffusion and texture inpainting on user-masked object regions",
    },
    {
      id: "ai-image-denoise",
      name: "Neural Bilateral Image Denoising & Tone Enhancement",
      taskType: "noise-reduction",
      domain: "image",
      executionMode: "auto",
      providerId: "plugin-image-enhancement",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "jpg", "webp"],
      requiresWASM: true,
      estimatedRAMMB: 50,
      webSupported: true,
      androidSupported: true,
      description: "Removes digital noise and compression artifacts while optimizing dynamic range",
    },
  ];

  constructor() {
    super();
    this.registerCapabilities();
  }

  private registerCapabilities(): void {
    this.capabilities.forEach((cap) => {
      AICapabilityRegistry.getInstance().register(cap);
    });
  }

  public async execute<TPayload = AIImagePayload, TResult = AIImageResult>(
    actionName: string,
    payload: TPayload,
    options?: AIJobOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();
    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Plugin Loaded: ImageEnhancementPlugin", { actionName });

    try {
      // Validate payload
      const validation = PayloadValidator.validate(payload, "image");
      if (!validation.valid) {
        debugLogger.logError("Payload Validation Failed in ImageEnhancementPlugin", validation.errors, { payload });
        return {
          success: false,
          error: this.createError("INVALID_PAYLOAD", validation.errors.join("; ") || "Image input (imageBase64OrUrl) is required"),
        };
      }

      const normalizedPayload = validation.normalizedPayload;
      const imgPayload: AIImagePayload = {
        ...(payload as any),
        ...normalizedPayload,
        inputMediaType: "image",
        imageBase64OrUrl: normalizedPayload.imageBase64OrUrl || "",
        videoBase64OrUrl: undefined,
        audioBase64OrUrl: undefined,
      };

      const action: ImageActionType = (actionName as ImageActionType) || imgPayload.action || "composite-enhance";

      // Cache lookup
      const inputHash = AIManager.getInstance().cache.generateHash(`plugin_image_${action}`, imgPayload);
      if (options?.enableCache !== false) {
        const cachedMatch = AIHistoryManager.getInstance().findMatch("background-removal", inputHash);
        if (cachedMatch && cachedMatch.resultData) {
          debugLogger.logStage("Cache Saved / Hit", { action, inputHash });
          return {
            success: true,
            data: cachedMatch.resultData as TResult,
            cached: true,
            executionTimeMs: 0,
          };
        }
      }

      debugLogger.logStage("Inference Started on ImageAIEngine", { action });
      let result: AIImageResult;

      switch (action) {
        case "remove-background":
          result = await this.runBackgroundRemoval(imgPayload, options);
          break;

        case "upscale":
          result = await this.runUpscale(imgPayload, options);
          break;

        case "face-enhance":
          result = await this.runFaceEnhance(imgPayload, options);
          break;

        case "object-remove":
          result = await this.runObjectRemoval(imgPayload, options);
          break;

        case "denoise":
          result = await this.runDenoise(imgPayload, options);
          break;

        case "composite-enhance":
        default:
          result = await this.runCompositeEnhance(imgPayload, options);
          break;
      }

      result.executionTimeMs = Date.now() - startTime;
      debugLogger.logStage("Inference Finished", { action, executionTimeMs: result.executionTimeMs });

      const verification = AIOutputVerifier.verify(action, imgPayload, result, "image");
      if (!verification.passed) {
        console.warn(`[ImageEnhancementPlugin] Verification warning for action "${action}": ${verification.reason}`);
        return {
          success: false,
          error: this.createError("VERIFICATION_FAILED", verification.reason || "Image processing output failed verification"),
        };
      }
      debugLogger.logStage("Output Verified", { action });

      return {
        success: true,
        data: result as unknown as TResult,
        executionTimeMs: result.executionTimeMs,
      };
    } catch (err: any) {
      debugLogger.logError("ImageEnhancementPlugin Execution Exception", err, { actionName, payload });
      return {
        success: false,
        error: this.formatException(err),
      };
    }
  }

  // ---------------- Core Action Handlers via ImageAIEngine ----------------

  private async runBackgroundRemoval(
    payload: AIImagePayload,
    options?: AIJobOptions
  ): Promise<AIImageResult> {
    const src = payload.imageBase64OrUrl;
    const aiRes = await imageAIEngine.removeBackground(src, {
      edgeRefinement: true,
      featherRadius: 1,
      signal: options?.signal,
    });

    return {
      outputImageBase64OrUrl: aiRes.outputDataUrl,
      mimeType: "image/png",
      width: aiRes.width,
      height: aiRes.height,
      processingType: "remove-background",
      appliedEngine: aiRes.engineName,
      executionTimeMs: aiRes.executionTimeMs,
      qualityMetrics: {
        originalWidth: aiRes.originalWidth,
        originalHeight: aiRes.originalHeight,
        isLocalExecution: true,
        hasAlphaChannel: aiRes.metrics.hasAlphaChannel,
        executionProvider: aiRes.executionProvider,
      },
    };
  }

  private async runUpscale(
    payload: AIImagePayload,
    options?: AIJobOptions
  ): Promise<AIImageResult> {
    const scaleFactor = (payload.upscaleFactor === 4 ? 4 : 2) as 2 | 4;
    const src = payload.imageBase64OrUrl;

    const aiRes = await imageAIEngine.upscale(src, scaleFactor, {
      quality: 0.95,
      signal: options?.signal,
    });

    return {
      outputImageBase64OrUrl: aiRes.outputDataUrl,
      mimeType: payload.mimeType || "image/png",
      width: aiRes.width,
      height: aiRes.height,
      processingType: "upscale",
      appliedEngine: aiRes.engineName,
      executionTimeMs: aiRes.executionTimeMs,
      qualityMetrics: {
        scaleFactor,
        originalWidth: aiRes.originalWidth,
        originalHeight: aiRes.originalHeight,
        isLocalExecution: true,
        executionProvider: aiRes.executionProvider,
        timings: aiRes.timings,
      },
    };
  }

  private async runFaceEnhance(
    payload: AIImagePayload,
    options?: AIJobOptions
  ): Promise<AIImageResult> {
    const src = payload.imageBase64OrUrl;
    const aiRes = await imageAIEngine.enhanceFace(src, {
      enhanceFaceLevel: payload.enhanceFaceLevel ?? 0.85,
      signal: options?.signal,
    });

    return {
      outputImageBase64OrUrl: aiRes.outputDataUrl,
      mimeType: payload.mimeType || "image/png",
      width: aiRes.width,
      height: aiRes.height,
      processingType: "face-enhance",
      appliedEngine: aiRes.engineName,
      executionTimeMs: aiRes.executionTimeMs,
      qualityMetrics: {
        originalWidth: aiRes.originalWidth,
        originalHeight: aiRes.originalHeight,
        isLocalExecution: true,
        executionProvider: aiRes.executionProvider,
      },
    };
  }

  private async runObjectRemoval(
    payload: AIImagePayload,
    options?: AIJobOptions
  ): Promise<AIImageResult> {
    const src = payload.imageBase64OrUrl;
    const mask = payload.maskBase64OrUrl || "";

    const aiRes = await imageAIEngine.removeObject(src, mask, {
      signal: options?.signal,
    });

    return {
      outputImageBase64OrUrl: aiRes.outputDataUrl,
      mimeType: payload.mimeType || "image/png",
      width: aiRes.width,
      height: aiRes.height,
      processingType: "object-remove",
      appliedEngine: aiRes.engineName,
      executionTimeMs: aiRes.executionTimeMs,
      qualityMetrics: {
        originalWidth: aiRes.originalWidth,
        originalHeight: aiRes.originalHeight,
        isLocalExecution: true,
        executionProvider: aiRes.executionProvider,
      },
    };
  }

  private async runDenoise(
    payload: AIImagePayload,
    options?: AIJobOptions
  ): Promise<AIImageResult> {
    const src = payload.imageBase64OrUrl;
    const aiRes = await imageAIEngine.enhanceImage(src, {
      denoiseIntensity: payload.denoiseIntensity ?? 0.7,
      contrastBoost: 0.5,
      detailSharpen: 0.6,
      signal: options?.signal,
    });

    return {
      outputImageBase64OrUrl: aiRes.outputDataUrl,
      mimeType: payload.mimeType || "image/png",
      width: aiRes.width,
      height: aiRes.height,
      processingType: "denoise",
      appliedEngine: aiRes.engineName,
      executionTimeMs: aiRes.executionTimeMs,
      qualityMetrics: {
        originalWidth: aiRes.originalWidth,
        originalHeight: aiRes.originalHeight,
        isLocalExecution: true,
        executionProvider: aiRes.executionProvider,
      },
    };
  }

  private async runCompositeEnhance(
    payload: AIImagePayload,
    options?: AIJobOptions
  ): Promise<AIImageResult> {
    let currentImg = payload.imageBase64OrUrl;

    // Step 1: Denoise & enhance dynamic range
    const denoiseRes = await this.runDenoise({ ...payload, imageBase64OrUrl: currentImg }, options);
    currentImg = denoiseRes.outputImageBase64OrUrl;

    // Step 2: Attempt face enhancement if face present
    try {
      const faceRes = await this.runFaceEnhance({ ...payload, imageBase64OrUrl: currentImg }, options);
      currentImg = faceRes.outputImageBase64OrUrl;
    } catch {
      // If no face found in image, proceed smoothly
    }

    // Step 3: Super resolution upscale 2x
    const upscaleRes = await this.runUpscale({ ...payload, imageBase64OrUrl: currentImg, upscaleFactor: 2 }, options);

    return {
      outputImageBase64OrUrl: upscaleRes.outputImageBase64OrUrl,
      mimeType: payload.mimeType || "image/png",
      width: upscaleRes.width,
      height: upscaleRes.height,
      processingType: "composite-enhance",
      appliedEngine: "Unified Pipeline (Denoise -> Face Restore -> Super-Resolution 2x)",
      executionTimeMs: 0,
      qualityMetrics: {
        scaleFactor: 2,
        isLocalExecution: true,
      },
    };
  }
}
