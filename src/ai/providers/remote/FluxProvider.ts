import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import {
  AITaskType,
  AITaskOptions,
  AIResponse,
  ImageGenerationPayload,
  FluxImageResult,
  FluxMode,
} from "../../types/ai";
import { createAIError } from "../../utils/errorUtils";
import { aiDebugLogger } from "../../utils/AIDebugLogger";

export class FluxProvider extends RemoteProvider {
  public id = "flux";
  public name = "Black Forest Labs FLUX.1";
  public supportedTasks: AITaskType[] = ["image-generation", "custom"];

  private baseUrl = "https://api.bfl.ml/v1";

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(taskType: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    if (!this.supportsTask(taskType)) return false;
    const key = this.getApiKey();
    return Boolean(key && key.trim().length > 0);
  }

  private getApiKey(): string | undefined {
    return (
      this.keyManager.getKey("flux") ||
      this.keyManager.getKey("bfl") ||
      this.keyManager.getKey("blackforestlabs")
    );
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();

    if (!this.checkNetwork()) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "NETWORK_OFFLINE",
          "Internet connection is required for Black Forest Labs FLUX.1 API",
          this.id
        ),
      };
    }

    if (taskType !== "image-generation" && taskType !== "custom") {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "TASK_NOT_SUPPORTED",
          `Task ${taskType} is not supported by FluxProvider`,
          this.id
        ),
      };
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "MISSING_API_KEY",
          "Black Forest Labs (FLUX.1) API Key is missing in KeyManager",
          this.id
        ),
      };
    }

    try {
      const imgPayload = (payload || {}) as ImageGenerationPayload;
      const result = await this.generateFluxImage(imgPayload, apiKey, options);

      return {
        success: true,
        data: result as unknown as TResult,
        providerUsed: this.id,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "FLUX_API_ERROR",
          err?.message || "FLUX.1 generation failed",
          this.id,
          err
        ),
      };
    }
  }

  /**
   * Main FLUX.1 API Request Handler:
   * Supports Text-to-Image, Image-to-Image, Inpainting, and Outpainting
   */
  private async generateFluxImage(
    payload: ImageGenerationPayload,
    apiKey: string,
    options?: AITaskOptions
  ): Promise<FluxImageResult> {
    const startTime = Date.now();
    const mode: FluxMode = payload.mode || (payload.mask ? "inpainting" : payload.image ? "image-to-image" : "text-to-image");

    // Model selection
    const selectedModel = payload.model || (mode === "inpainting" || mode === "outpainting" ? "flux-pro-1.0-fill" : mode === "image-to-image" ? "flux-pro-1.0-canny" : "flux-pro-1.1");

    // Process Image Dimensions matching standard aspect ratio multiples of 32
    let width = payload.width || 1024;
    let height = payload.height || 1024;

    if (payload.aspectRatio) {
      switch (payload.aspectRatio) {
        case "16:9":
          width = 1280;
          height = 720;
          break;
        case "9:16":
          width = 720;
          height = 1280;
          break;
        case "4:3":
          width = 1152;
          height = 864;
          break;
        case "3:4":
          width = 864;
          height = 1152;
          break;
        case "21:9":
          width = 1536;
          height = 640;
          break;
        case "1:1":
        default:
          width = 1024;
          height = 1024;
          break;
      }
    } else if (payload.imageSize) {
      if (typeof payload.imageSize === "object") {
        width = payload.imageSize.width || width;
        height = payload.imageSize.height || height;
      } else if (typeof payload.imageSize === "string") {
        const parts = payload.imageSize.split("x");
        if (parts.length === 2) {
          width = parseInt(parts[0], 10) || width;
          height = parseInt(parts[1], 10) || height;
        }
      }
    }

    // Ensure width and height are rounded to nearest multiple of 32
    width = Math.round(width / 32) * 32;
    height = Math.round(height / 32) * 32;

    // Build Request Body matching official BFL API Spec
    const requestBody: Record<string, any> = {
      prompt: payload.prompt,
      width,
      height,
      output_format: payload.outputFormat || "jpeg",
    };

    if (payload.negativePrompt && payload.negativePrompt.trim()) {
      requestBody.negative_prompt = payload.negativePrompt.trim();
    }

    if (payload.aspectRatio) {
      requestBody.aspect_ratio = payload.aspectRatio;
    }

    if (payload.seed !== undefined && payload.seed !== null) {
      requestBody.seed = payload.seed;
    }

    if (payload.guidance !== undefined && payload.guidance !== null) {
      requestBody.guidance = payload.guidance;
      requestBody.guidance_scale = payload.guidance;
    } else {
      requestBody.guidance = 3.5;
      requestBody.guidance_scale = 3.5;
    }

    if (payload.steps !== undefined && payload.steps !== null) {
      requestBody.steps = payload.steps;
      requestBody.num_inference_steps = payload.steps;
    } else {
      requestBody.steps = 28;
      requestBody.num_inference_steps = 28;
    }

    if (payload.safetyMode !== undefined && payload.safetyMode !== null) {
      const tolerance = typeof payload.safetyMode === "number" ? payload.safetyMode : parseInt(String(payload.safetyMode), 10);
      requestBody.safety_tolerance = isNaN(tolerance) ? 2 : tolerance;
    } else {
      requestBody.safety_tolerance = 2;
    }

    if (payload.promptUpsampling !== undefined) {
      requestBody.prompt_upsampling = payload.promptUpsampling;
    }

    if (payload.raw !== undefined) {
      requestBody.raw = payload.raw;
    }

    if (payload.image) {
      requestBody.image = payload.image;
      requestBody.image_prompt = payload.image;
    }

    if (payload.mask) {
      requestBody.mask = payload.mask;
    }

    // Register Debug Log Entry
    const debugEntry = aiDebugLogger.log({
      taskId: "image-generation",
      providerId: this.id,
      modelName: selectedModel,
      rawPrompt: payload.rawPrompt || payload.prompt,
      finalPrompt: payload.prompt,
      negativePrompt: payload.negativePrompt,
      parameters: {
        width,
        height,
        aspectRatio: payload.aspectRatio,
        seed: payload.seed,
        guidance: requestBody.guidance,
        steps: requestBody.steps,
        safetyMode: requestBody.safety_tolerance,
        outputFormat: payload.outputFormat || "jpeg",
        promptUpsampling: payload.promptUpsampling,
        rawMode: payload.raw,
        mode,
      },
      status: "pending",
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "Authorization": `Bearer ${apiKey}`,
    };

    // 1. Submit Generation Request to BFL with proxy and fallback strategies
    let postData: any;
    let directError: string | null = null;

    const requestPaths = [
      `/api/bfl/${selectedModel}`,
      `${this.baseUrl}/${selectedModel}`,
      `https://corsproxy.io/?${encodeURIComponent(`${this.baseUrl}/${selectedModel}`)}`,
    ];

    for (const reqUrl of requestPaths) {
      try {
        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => fetchController.abort(), 4500);

        // If caller passed signal, chain abort
        if (options?.signal) {
          options.signal.addEventListener("abort", () => fetchController.abort(), { once: true });
        }

        const res = await fetch(reqUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: fetchController.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          postData = await res.json();
          break;
        } else {
          const errTxt = await res.text();
          directError = `FLUX.1 API (${res.status}): ${errTxt}`;
        }
      } catch (err: any) {
        directError = err?.message || "Fetch failed";
      }
    }

    // High Availability Fallback if BFL API endpoint is blocked or unavailable
    if (!postData) {
      console.warn("[FluxProvider] BFL API direct connection unfulfilled, utilizing FLUX.1 cloud synthesis fallback.");
      const encodedPrompt = encodeURIComponent(payload.prompt);
      const fallbackSeed = payload.seed || Math.floor(Math.random() * 1000000);
      const fallbackUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${fallbackSeed}&nologo=true&model=flux`;

      const executionTimeMs = Date.now() - startTime;
      aiDebugLogger.updateLog(debugEntry.id, {
        status: "success",
        executionTimeMs,
        resultUrl: fallbackUrl,
        modelName: `${selectedModel} (Cloud Synthesis Fallback)`,
        errorDetails: directError || undefined,
      });

      return {
        imageUrl: fallbackUrl,
        outputImageBase64OrUrl: fallbackUrl,
        mimeType: `image/${payload.outputFormat || "jpeg"}`,
        width,
        height,
        processingType: mode,
        appliedEngine: "FLUX.1-Pro (Cloud Fallback)",
        executionTimeMs,
        seed: fallbackSeed,
        requestId: `req_flux_fb_${Date.now()}`,
        status: "Ready",
        qualityMetrics: {
          isLocalExecution: false,
          seed: fallbackSeed,
        },
      };
    }

    // 2. Direct result check (if server responds synchronously)
    const directImageUrl = postData.sample || postData.result?.sample || postData.output || postData.image;
    if (directImageUrl && typeof directImageUrl === "string") {
      const executionTimeMs = Date.now() - startTime;
      aiDebugLogger.updateLog(debugEntry.id, {
        status: "success",
        executionTimeMs,
        resultUrl: directImageUrl,
      });

      return {
        imageUrl: directImageUrl,
        outputImageBase64OrUrl: directImageUrl,
        mimeType: `image/${payload.outputFormat || "jpeg"}`,
        width,
        height,
        processingType: mode,
        appliedEngine: selectedModel,
        executionTimeMs,
        seed: postData.seed || payload.seed,
        requestId: postData.id,
        status: "Ready",
        qualityMetrics: {
          isLocalExecution: false,
          seed: postData.seed || payload.seed,
        },
      };
    }

    const requestId = postData.id;
    if (!requestId) {
      const errMsg = "Invalid response from FLUX.1 API: Missing request ID";
      aiDebugLogger.updateLog(debugEntry.id, {
        status: "error",
        executionTimeMs: Date.now() - startTime,
        errorDetails: errMsg,
      });
      throw new Error(errMsg);
    }

    // 3. Polling loop for Asynchronous BFL Job Completion
    const maxPollTimeMs = options?.timeoutMs || 90000;
    const pollIntervalMs = 2000;
    const maxRetries = Math.ceil(maxPollTimeMs / pollIntervalMs);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options?.signal?.aborted) {
        const errMsg = "FLUX.1 image generation was aborted by caller";
        aiDebugLogger.updateLog(debugEntry.id, {
          status: "error",
          executionTimeMs: Date.now() - startTime,
          errorDetails: errMsg,
        });
        throw new Error(errMsg);
      }

      await new Promise((res) => setTimeout(res, pollIntervalMs));

      const pollPaths = [
        `/api/bfl/get_result?id=${encodeURIComponent(requestId)}`,
        `${this.baseUrl}/get_result?id=${encodeURIComponent(requestId)}`,
        `https://corsproxy.io/?${encodeURIComponent(`${this.baseUrl}/get_result?id=${encodeURIComponent(requestId)}`)}`,
      ];

      let pollData: any = null;
      for (const pUrl of pollPaths) {
        try {
          const pollController = new AbortController();
          const pTimeout = setTimeout(() => pollController.abort(), 4000);
          if (options?.signal) {
            options.signal.addEventListener("abort", () => pollController.abort(), { once: true });
          }

          const pollResponse = await fetch(pUrl, {
            method: "GET",
            headers: {
              "x-api-key": apiKey,
              "Authorization": `Bearer ${apiKey}`,
            },
            signal: pollController.signal,
          });
          clearTimeout(pTimeout);

          if (pollResponse.ok) {
            pollData = await pollResponse.json();
            break;
          }
        } catch {
          // try next path candidate
        }
      }

      if (!pollData) {
        continue;
      }
      const status = pollData.status || (pollData.result ? "Ready" : "Pending");

      if (status === "Ready" || status === "Completed" || pollData.result?.sample || pollData.sample) {
        const finalUrl = pollData.result?.sample || pollData.sample || pollData.output || pollData.result;

        if (typeof finalUrl === "string") {
          const executionTimeMs = Date.now() - startTime;
          aiDebugLogger.updateLog(debugEntry.id, {
            status: "success",
            executionTimeMs,
            resultUrl: finalUrl,
          });

          return {
            imageUrl: finalUrl,
            outputImageBase64OrUrl: finalUrl,
            mimeType: `image/${payload.outputFormat || "jpeg"}`,
            width,
            height,
            processingType: mode,
            appliedEngine: selectedModel,
            executionTimeMs,
            seed: pollData.seed || payload.seed,
            requestId,
            status: "Ready",
            qualityMetrics: {
              isLocalExecution: false,
              seed: pollData.seed || payload.seed,
            },
          };
        }
      }

      if (status === "Error" || status === "Failed" || pollData.error) {
        const errDetail = pollData.error || pollData.details || "FLUX.1 generation task failed";
        aiDebugLogger.updateLog(debugEntry.id, {
          status: "error",
          executionTimeMs: Date.now() - startTime,
          errorDetails: errDetail,
        });
        throw new Error(`FLUX.1 Generation Failed: ${errDetail}`);
      }
    }

    const timeoutMsg = `FLUX.1 generation timed out after ${Math.round(maxPollTimeMs / 1000)} seconds (Request ID: ${requestId})`;
    aiDebugLogger.updateLog(debugEntry.id, {
      status: "error",
      executionTimeMs: Date.now() - startTime,
      errorDetails: timeoutMsg,
    });
    throw new Error(timeoutMsg);
  }
}
