import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import {
  AITaskType,
  AITaskOptions,
  AIResponse,
  ImageGenerationPayload,
  FluxImageResult,
  EnhanceMediaPayload,
  EnhanceMediaResult,
} from "../../types/ai";
import { supabase } from "@/integrations/supabase/client";
import { createAIError } from "../../utils/errorUtils";
import { AIProgressManager } from "../../runtime/AIProgressManager";
import { aiDebugLogger } from "../../utils/AIDebugLogger";

export const REPLICATE_MODEL_FLUX_2_PRO = "black-forest-labs/flux-2-pro";
export const REPLICATE_MODEL_REAL_ESRGAN = "nightmareai/real-esrgan";

export class ReplicateProvider extends RemoteProvider {
  public id = "replicate";
  public name = "Replicate Provider";
  public supportedTasks: AITaskType[] = [
    "image-generation",
    "image-editing",
    "image-upscale",
    "enhance-media",
  ];

  private progressManager: AIProgressManager;

  constructor(keyManager: KeyManager) {
    super(keyManager);
    this.progressManager = AIProgressManager.getInstance();
  }

  public isAvailable(taskType: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    return this.supportsTask(taskType);
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();
    const jobId = options?.signal ? undefined : `job_replicate_${startTime}_${Math.random().toString(36).substring(2, 6)}`;

    if (!this.checkNetwork()) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "NETWORK_OFFLINE",
          "Internet connection is required for Replicate Provider",
          this.id
        ),
      };
    }

    if (!this.supportsTask(taskType)) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError(
          "TASK_NOT_SUPPORTED",
          `Task '${taskType}' is not supported by ReplicateProvider`,
          this.id
        ),
      };
    }

    try {
      let result: any;
      if (taskType === "image-generation") {
        result = await this.generateImage(payload as ImageGenerationPayload, options, jobId);
      } else if (taskType === "image-editing") {
        result = await this.editImage(payload as any, options, jobId);
      } else if (taskType === "image-upscale" || taskType === "enhance-media") {
        result = await this.upscaleImage(payload as any, options, jobId);
      } else {
        throw new Error(`Unsupported task type '${taskType}' for ReplicateProvider`);
      }

      return {
        success: true,
        data: result as unknown as TResult,
        providerUsed: this.id,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      console.error(`[ReplicateProvider] Execution failed for task '${taskType}':`, err);
      const modelUsed =
        taskType === "image-upscale" || taskType === "enhance-media"
          ? REPLICATE_MODEL_REAL_ESRGAN
          : REPLICATE_MODEL_FLUX_2_PRO;

      const errorMessage = err?.message || String(err) || "Replicate task execution failed";
      const errorCode = err?.code || "REPLICATE_ERROR";

      return {
        success: false,
        providerUsed: this.id,
        error: {
          code: errorCode,
          message: errorMessage,
          provider: this.id,
          details: {
            errorCode,
            errorMessage,
            provider: this.id,
            model: modelUsed,
            task: taskType,
            requestId: err?.requestId || undefined,
            timestamp: new Date().toISOString(),
            status: "failed",
          },
        },
      };
    }
  }

  /**
   * Tool 1: Image Generation using black-forest-labs/flux-2-pro
   */
  private async generateImage(
    payload: ImageGenerationPayload,
    options?: AITaskOptions,
    jobId?: string
  ): Promise<FluxImageResult> {
    const startTime = Date.now();
    const targetJobId = jobId || `replicate_job_${Date.now()}`;

    this.progressManager.updateProgress(targetJobId, 5, "Preparing Replicate Payload", "processing");

    if (!payload.prompt || !payload.prompt.trim()) {
      throw new Error("Invalid Input: Prompt is required for image generation.");
    }

    const replicateInput: Record<string, any> = {
      prompt: payload.prompt.trim(),
    };

    if (payload.aspectRatio) replicateInput.aspect_ratio = payload.aspectRatio;
    if (payload.negativePrompt?.trim()) replicateInput.negative_prompt = payload.negativePrompt.trim();
    if (payload.outputFormat) replicateInput.output_format = payload.outputFormat;
    if (payload.seed !== undefined && payload.seed !== null) replicateInput.seed = payload.seed;
    if (payload.guidance !== undefined && payload.guidance !== null) replicateInput.guidance = payload.guidance;
    if (payload.steps !== undefined && payload.steps !== null) replicateInput.steps = payload.steps;

    const inputImg = payload.image || (payload as any).inputImage;
    if (inputImg) replicateInput.image_prompt = inputImg;

    this.progressManager.updateProgress(targetJobId, 10, "Submitting to Replicate (FLUX.2 Pro)", "processing");

    const { finalOutputUrl, predictionId, metrics } = await this.runPrediction(
      REPLICATE_MODEL_FLUX_2_PRO,
      replicateInput,
      targetJobId,
      options
    );

    this.progressManager.updateProgress(targetJobId, 95, "Verifying Output Image", "processing");

    const verified = await this.verifyImageOutput(finalOutputUrl);
    if (!verified) {
      throw new Error("Invalid Output: The generated image URL from Replicate is inaccessible or unrenderable.");
    }

    const executionTimeMs = Date.now() - startTime;
    this.progressManager.updateProgress(targetJobId, 100, "Image Generation Complete", "completed");

    return {
      imageUrl: finalOutputUrl,
      outputImageBase64OrUrl: finalOutputUrl,
      mimeType: `image/${payload.outputFormat || "webp"}`,
      width: payload.width || 1024,
      height: payload.height || 1024,
      processingType: "text-to-image",
      appliedEngine: REPLICATE_MODEL_FLUX_2_PRO,
      executionTimeMs,
      seed: payload.seed,
      requestId: predictionId,
      status: "Ready",
      metadata: {
        provider: "replicate",
        model: REPLICATE_MODEL_FLUX_2_PRO,
        predictionId,
        metrics,
      },
      qualityMetrics: {
        isLocalExecution: false,
        seed: payload.seed,
      },
    };
  }

  /**
   * Tool 2: Image Editing using black-forest-labs/flux-2-pro
   */
  private async editImage(
    payload: any,
    options?: AITaskOptions,
    jobId?: string
  ): Promise<FluxImageResult> {
    const startTime = Date.now();
    const targetJobId = jobId || `replicate_edit_job_${Date.now()}`;

    this.progressManager.updateProgress(targetJobId, 5, "Preparing Image Editing Payload", "processing");

    const promptText = payload.prompt || payload.rawPrompt || "";
    if (!promptText.trim()) {
      throw new Error("Invalid Input: Prompt is required for image editing.");
    }

    const sourceImage = payload.image || payload.sourceImage || payload.imageBase64OrUrl || payload.inputImage || payload.mediaUrlOrBase64;
    if (!sourceImage) {
      throw new Error("Invalid Input: Source image URL or base64 is required for image editing.");
    }

    const replicateInput: Record<string, any> = {
      prompt: promptText.trim(),
      image_prompt: sourceImage,
    };

    if (payload.aspectRatio) replicateInput.aspect_ratio = payload.aspectRatio;
    if (payload.negativePrompt?.trim()) replicateInput.negative_prompt = payload.negativePrompt.trim();
    if (payload.outputFormat) replicateInput.output_format = payload.outputFormat;
    if (payload.seed !== undefined && payload.seed !== null) replicateInput.seed = payload.seed;
    if (payload.guidance !== undefined && payload.guidance !== null) replicateInput.guidance = payload.guidance;
    if (payload.steps !== undefined && payload.steps !== null) replicateInput.steps = payload.steps;

    this.progressManager.updateProgress(targetJobId, 10, "Submitting Image Editing to Replicate (FLUX.2 Pro)", "processing");

    const { finalOutputUrl, predictionId, metrics } = await this.runPrediction(
      REPLICATE_MODEL_FLUX_2_PRO,
      replicateInput,
      targetJobId,
      options
    );

    this.progressManager.updateProgress(targetJobId, 95, "Verifying Edited Image Output", "processing");

    const verified = await this.verifyImageOutput(finalOutputUrl);
    if (!verified) {
      throw new Error("Invalid Output: The edited image URL from Replicate is inaccessible or unrenderable.");
    }

    const executionTimeMs = Date.now() - startTime;
    this.progressManager.updateProgress(targetJobId, 100, "Image Editing Complete", "completed");

    return {
      imageUrl: finalOutputUrl,
      outputImageBase64OrUrl: finalOutputUrl,
      mimeType: `image/${payload.outputFormat || "webp"}`,
      width: payload.width || 1024,
      height: payload.height || 1024,
      processingType: "image-to-image",
      appliedEngine: REPLICATE_MODEL_FLUX_2_PRO,
      executionTimeMs,
      seed: payload.seed,
      requestId: predictionId,
      status: "Ready",
      metadata: {
        provider: "replicate",
        model: REPLICATE_MODEL_FLUX_2_PRO,
        predictionId,
        metrics,
      },
      qualityMetrics: {
        isLocalExecution: false,
        seed: payload.seed,
      },
    };
  }

  /**
   * Tool 3: Image Upscale using nightmareai/real-esrgan
   */
  private async upscaleImage(
    payload: any,
    options?: AITaskOptions,
    jobId?: string
  ): Promise<EnhanceMediaResult> {
    const startTime = Date.now();
    const targetJobId = jobId || `replicate_upscale_job_${Date.now()}`;

    this.progressManager.updateProgress(targetJobId, 5, "Preparing Real-ESRGAN Upscale Payload", "processing");

    const inputImg = payload.image || payload.imageBase64OrUrl || payload.mediaUrlOrBase64 || payload.sourceImage;
    if (!inputImg) {
      throw new Error("Invalid Input: Source image URL or base64 is required for upscaling.");
    }

    const scaleNum = Number(payload.scale || payload.scaleFactor || payload.upscaleFactor || 2);
    const validScale = scaleNum >= 3 ? 4 : 2; // Map to 2x or 4x
    const faceEnhance = Boolean(payload.face_enhance ?? payload.faceEnhance ?? payload.enhanceFace ?? true);

    const replicateInput: Record<string, any> = {
      image: inputImg,
      scale: validScale,
      face_enhance: faceEnhance,
    };

    this.progressManager.updateProgress(
      targetJobId,
      10,
      `Submitting to Replicate (Real-ESRGAN ${validScale}x, face_enhance=${faceEnhance})`,
      "processing"
    );

    // 1. Get input dimensions
    const inputDims = await this.getImageDimensions(inputImg);

    // 2. Run prediction
    const { finalOutputUrl, predictionId, metrics } = await this.runPrediction(
      REPLICATE_MODEL_REAL_ESRGAN,
      replicateInput,
      targetJobId,
      options
    );

    this.progressManager.updateProgress(targetJobId, 90, "Verifying Upscaled Output Dimensions", "processing");

    // 3. Verify output image accessibility
    const verified = await this.verifyImageOutput(finalOutputUrl);
    if (!verified) {
      throw new Error("Invalid Output: The upscaled image URL from Replicate is inaccessible or unrenderable.");
    }

    // 4. Measure output dimensions and strictly verify outW > inW AND outH > inH
    const outputDims = await this.getImageDimensions(finalOutputUrl);

    if (inputDims.width > 0 && inputDims.height > 0 && outputDims.width > 0 && outputDims.height > 0) {
      console.log(
        `[ReplicateProvider] Upscale dimension check: Input (${inputDims.width}x${inputDims.height}) -> Output (${outputDims.width}x${outputDims.height})`
      );

      if (outputDims.width <= inputDims.width || outputDims.height <= inputDims.height) {
        throw new Error(
          `Upscale Verification Failed: Output dimensions (${outputDims.width}x${outputDims.height}) are not larger than input dimensions (${inputDims.width}x${inputDims.height}).`
        );
      }
    }

    const executionTimeMs = Date.now() - startTime;
    this.progressManager.updateProgress(targetJobId, 100, "Image Upscale Complete", "completed");

    return {
      enhancedUrlOrBase64: finalOutputUrl,
      outputImageBase64OrUrl: finalOutputUrl,
      mimeType: "image/png",
      width: outputDims.width,
      height: outputDims.height,
      processingType: "upscale",
      appliedEngine: REPLICATE_MODEL_REAL_ESRGAN,
      executionTimeMs,
      requestId: predictionId,
      qualityMetrics: {
        originalWidth: inputDims.width,
        originalHeight: inputDims.height,
        outputWidth: outputDims.width,
        outputHeight: outputDims.height,
        scaleFactor: validScale,
        isLocalExecution: false,
      },
    };
  }

  /**
   * Reusable core runner for Replicate prediction lifecycle (create -> poll -> result)
   */
  private async runPrediction(
    model: string,
    input: Record<string, any>,
    jobId: string,
    options?: AITaskOptions
  ): Promise<{ finalOutputUrl: string; predictionId: string; metrics: any }> {
    const createResponse = await supabase.functions.invoke("replicate-run", {
      body: {
        action: "create",
        model,
        input,
      },
    });

    if (createResponse.error) {
      const errMsg = createResponse.error.message || "Failed to invoke Edge Function 'replicate-run'";
      throw new Error(`Edge Function Error: ${errMsg}`);
    }

    if (createResponse.data?.error) {
      const apiErr = createResponse.data.error;
      const status = createResponse.data.statusCode || 500;
      throw new Error(`Replicate Creation Error (${status}): ${apiErr}`);
    }

    const predictionId = createResponse.data?.predictionId;
    if (!predictionId) {
      throw new Error("Invalid Replicate Response: Missing predictionId");
    }

    const timeoutMs = options?.timeoutMs || 120000;
    const pollIntervalMs = 2000;
    const maxRetries = Math.ceil(timeoutMs / pollIntervalMs);

    let finalOutputUrl: string | null = null;
    let predictionStatus = createResponse.data?.status || "starting";
    let pollMetrics: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options?.signal?.aborted) {
        throw new Error("Canceled Prediction: Replicate prediction was canceled by user request.");
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const progressPct = Math.min(88, 15 + Math.floor(((attempt + 1) / maxRetries) * 70));
      this.progressManager.updateProgress(
        jobId,
        progressPct,
        `Processing Replicate Model Prediction (${predictionStatus})`,
        "processing"
      );

      const pollResponse = await supabase.functions.invoke("replicate-run", {
        body: {
          action: "poll",
          predictionId,
        },
      });

      if (pollResponse.error) {
        console.warn(`[ReplicateProvider] Poll attempt ${attempt + 1} edge error:`, pollResponse.error.message);
        continue;
      }

      const pollData = pollResponse.data || {};
      if (pollData.error) {
        throw new Error(`Replicate Prediction Error: ${pollData.error}`);
      }

      predictionStatus = pollData.status || predictionStatus;
      pollMetrics = pollData.metrics || pollMetrics;

      if (predictionStatus === "canceled") {
        throw new Error("Canceled Prediction: Replicate prediction was canceled.");
      }

      if (predictionStatus === "failed") {
        const failReason = pollData.error || "Replicate model execution failed.";
        throw new Error(`Replicate Model Failed: ${failReason}`);
      }

      if (predictionStatus === "succeeded") {
        const output = pollData.output;
        if (Array.isArray(output) && output.length > 0) {
          finalOutputUrl = String(output[0]);
        } else if (typeof output === "string") {
          finalOutputUrl = output;
        }
        break;
      }
    }

    if (!finalOutputUrl || predictionStatus !== "succeeded") {
      throw new Error(`Replicate Timeout: Model prediction did not complete within ${timeoutMs / 1000} seconds (Prediction ID: ${predictionId}).`);
    }

    return { finalOutputUrl, predictionId, metrics: pollMetrics };
  }

  /**
   * Verifies that image URL is accessible and renderable
   */
  private async verifyImageOutput(url: string): Promise<boolean> {
    if (!url || typeof url !== "string") return false;
    if (!url.startsWith("http://") && !url.startsWith("https://")) return false;

    try {
      const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1024" } });
      if (!res.ok) {
        console.error(`[ReplicateProvider] Image URL verification failed with status ${res.status}`);
        return false;
      }

      if (typeof window !== "undefined" && typeof Image !== "undefined") {
        const canLoad = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
          setTimeout(() => resolve(false), 5000);
        });

        if (!canLoad) {
          console.error("[ReplicateProvider] Image element failed to render");
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error("[ReplicateProvider] Verification exception:", err);
      return false;
    }
  }

  /**
   * Helper to measure image dimensions in browser environment
   */
  private async getImageDimensions(urlOrBase64: string): Promise<{ width: number; height: number }> {
    if (typeof window !== "undefined" && typeof Image !== "undefined") {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          resolve({
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
          });
        };
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = urlOrBase64;
        setTimeout(() => resolve({ width: 0, height: 0 }), 6000);
      });
    }
    return { width: 0, height: 0 };
  }
}
