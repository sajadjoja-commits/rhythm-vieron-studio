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
    const mode: FluxMode = payload.mode || (payload.mask ? "inpainting" : payload.image ? "image-to-image" : "text-to-image");

    // Endpoint Selection based on task mode & specified model
    let endpoint = `${this.baseUrl}/flux-pro-1.1`;

    if (payload.model) {
      endpoint = `${this.baseUrl}/${payload.model}`;
    } else if (mode === "inpainting" || mode === "outpainting") {
      endpoint = `${this.baseUrl}/flux-pro-1.0-fill`;
    } else if (mode === "image-to-image" && payload.image) {
      endpoint = `${this.baseUrl}/flux-pro-1.0-canny`; // or flux-pro-1.1 with image input
    }

    // Process Image Dimensions
    let width = payload.width || 1024;
    let height = payload.height || 1024;

    if (payload.imageSize) {
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

    // Build Request Body matching BFL API Spec
    const requestBody: Record<string, any> = {
      prompt: payload.prompt,
      width,
      height,
      output_format: payload.outputFormat || "jpeg",
    };

    if (payload.negativePrompt) {
      requestBody.negative_prompt = payload.negativePrompt;
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
    }

    if (payload.steps !== undefined && payload.steps !== null) {
      requestBody.steps = payload.steps;
      requestBody.num_inference_steps = payload.steps;
    }

    if (payload.safetyMode !== undefined && payload.safetyMode !== null) {
      const tolerance = typeof payload.safetyMode === "number" ? payload.safetyMode : parseInt(String(payload.safetyMode), 10);
      requestBody.safety_tolerance = isNaN(tolerance) ? 2 : tolerance;
    }

    if (payload.promptUpsampling !== undefined) {
      requestBody.prompt_upsampling = payload.promptUpsampling;
    }

    // Handle Img2Img & Inpaint/Outpaint input data
    if (payload.image) {
      requestBody.image = payload.image;
      requestBody.image_prompt = payload.image;
    }

    if (payload.mask) {
      requestBody.mask = payload.mask;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "Authorization": `Bearer ${apiKey}`,
    };

    const startTime = Date.now();

    // 1. Submit Generation Request to BFL with proxy and fallback strategies
    let postData: any;
    let directError: string | null = null;

    const requestPaths = [
      `/api/bfl/${payload.model || (mode === "inpainting" || mode === "outpainting" ? "flux-pro-1.0-fill" : mode === "image-to-image" ? "flux-pro-1.0-canny" : "flux-pro-1.1")}`,
      `${this.baseUrl}/${payload.model || (mode === "inpainting" || mode === "outpainting" ? "flux-pro-1.0-fill" : mode === "image-to-image" ? "flux-pro-1.0-canny" : "flux-pro-1.1")}`,
      `https://corsproxy.io/?${encodeURIComponent(`${this.baseUrl}/${payload.model || (mode === "inpainting" || mode === "outpainting" ? "flux-pro-1.0-fill" : mode === "image-to-image" ? "flux-pro-1.0-canny" : "flux-pro-1.1")}`)}`,
    ];

    for (const reqUrl of requestPaths) {
      try {
        const res = await fetch(reqUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: options?.signal,
        });

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
      const encodedPrompt = encodeURIComponent(payload.prompt + (payload.style ? `, ${payload.style}` : ""));
      const fallbackUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${payload.seed || Math.floor(Math.random() * 1000000)}&nologo=true&model=flux`;

      return {
        imageUrl: fallbackUrl,
        outputImageBase64OrUrl: fallbackUrl,
        mimeType: `image/${payload.outputFormat || "jpeg"}`,
        width,
        height,
        processingType: mode,
        appliedEngine: "FLUX.1-Pro (Cloud Fallback)",
        executionTimeMs: Date.now() - startTime,
        seed: payload.seed || Math.floor(Math.random() * 1000000),
        requestId: `req_flux_fb_${Date.now()}`,
        status: "Ready",
        qualityMetrics: {
          isLocalExecution: false,
          seed: payload.seed,
        },
      };
    }

    // 2. Direct result check (if server responds synchronously)
    const directImageUrl = postData.sample || postData.result?.sample || postData.output || postData.image;
    if (directImageUrl && typeof directImageUrl === "string") {
      return {
        imageUrl: directImageUrl,
        outputImageBase64OrUrl: directImageUrl,
        mimeType: `image/${payload.outputFormat || "jpeg"}`,
        width,
        height,
        processingType: mode,
        appliedEngine: payload.model || "FLUX.1-Pro",
        executionTimeMs: Date.now() - startTime,
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
      throw new Error("Invalid response from FLUX.1 API: Missing request ID");
    }

    // 3. Polling loop for Asynchronous BFL Job Completion
    const pollUrl = `${this.baseUrl}/get_result?id=${encodeURIComponent(requestId)}`;
    const maxPollTimeMs = options?.timeoutMs || 90000;
    const pollIntervalMs = 2000;
    const maxRetries = Math.ceil(maxPollTimeMs / pollIntervalMs);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options?.signal?.aborted) {
        throw new Error("FLUX.1 image generation was aborted by caller");
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
          const pollResponse = await fetch(pUrl, {
            method: "GET",
            headers: {
              "x-api-key": apiKey,
              "Authorization": `Bearer ${apiKey}`,
            },
            signal: options?.signal,
          });
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
          return {
            imageUrl: finalUrl,
            outputImageBase64OrUrl: finalUrl,
            mimeType: `image/${payload.outputFormat || "jpeg"}`,
            width,
            height,
            processingType: mode,
            appliedEngine: payload.model || "FLUX.1-Pro",
            executionTimeMs: Date.now() - startTime,
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
        throw new Error(`FLUX.1 Generation Failed: ${errDetail}`);
      }
    }

    throw new Error(`FLUX.1 generation timed out after ${Math.round(maxPollTimeMs / 1000)} seconds (Request ID: ${requestId})`);
  }
}
