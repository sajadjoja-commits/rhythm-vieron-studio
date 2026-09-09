import { BasePlugin } from "./BasePlugin";
import {
  AIVideoPayload,
  AIVideoResult,
  VideoActionType,
} from "./types";
import { AICapability, AIJobOptions } from "../runtime/types";
import { AIResponse } from "../types/ai";
import { AIManager } from "../AIManager";
import { AICapabilityRegistry } from "../runtime/AICapabilityRegistry";
import { AIHistoryManager } from "../runtime/AIHistoryManager";
import { PayloadValidator } from "../utils/PayloadValidator";
import { AIDebugLogger } from "../utils/AIDebugLogger";
import { VideoProcessingEngine } from "../video/VideoProcessingEngine";

export class VideoEnhancementPlugin extends BasePlugin {
  public id = "plugin-video-enhancement";
  public name = "Professional AI Video Processing Plugin (Neural Segmentation, Multi-scale CLAHE, Bilateral Denoising)";
  public version = "2.0.0";
  public description = "Hardware-Accelerated AI Video Enhancement and Neural Video Background Removal";

  private engine = VideoProcessingEngine.getInstance();

  public capabilities: AICapability[] = [
    {
      id: "ai-video-clarity-enhancer",
      name: "AI Video Clarity & Detail Enhancer",
      taskType: "enhance-media",
      domain: "video",
      executionMode: "auto",
      providerId: "plugin-video-enhancement",
      supportedInputFormats: ["mp4", "webm", "mov", "avi"],
      supportedOutputFormats: ["mp4", "webm"],
      requiresWASM: false,
      estimatedRAMMB: 90,
      webSupported: true,
      androidSupported: true,
      description: "Enhance video clarity, contrast, and micro-detail sharpness using multi-scale CLAHE and bilateral filtering",
    },
    {
      id: "mediapipe-video-bg-removal",
      name: "Neural Video Background Removal",
      taskType: "background-removal",
      domain: "video",
      executionMode: "auto",
      providerId: "plugin-video-enhancement",
      supportedInputFormats: ["mp4", "webm", "mov"],
      supportedOutputFormats: ["webm", "mp4"],
      requiresWASM: true,
      estimatedRAMMB: 120,
      webSupported: true,
      androidSupported: true,
      description: "Real-time AI video background matting and alpha cutout with temporal stabilization",
    },
    {
      id: "video-spatial-denoise",
      name: "Spatial-Temporal Video Denoising",
      taskType: "noise-reduction",
      domain: "video",
      executionMode: "auto",
      providerId: "plugin-video-enhancement",
      supportedInputFormats: ["mp4", "webm", "mov"],
      supportedOutputFormats: ["mp4", "webm"],
      requiresWASM: false,
      estimatedRAMMB: 85,
      webSupported: true,
      androidSupported: true,
      description: "Removes low-light sensor noise and grain from video footage with edge-preserving bilateral filtering",
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

  public async execute<TPayload = AIVideoPayload, TResult = AIVideoResult>(
    actionName: string,
    payload: TPayload,
    options?: AIJobOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();
    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Plugin Loaded: VideoEnhancementPlugin", { actionName });

    try {
      const validation = PayloadValidator.validate(payload, "video");
      if (!validation.valid) {
        debugLogger.logError("Payload Validation Failed in VideoEnhancementPlugin", validation.errors, { payload });
        return {
          success: false,
          error: this.createError("INVALID_PAYLOAD", validation.errors.join("; ") || "Video input (videoBase64OrUrl) is required"),
        };
      }

      const normalizedPayload = validation.normalizedPayload;
      const vidPayload: AIVideoPayload = {
        ...(payload as any),
        ...normalizedPayload,
        inputMediaType: "video",
        videoBase64OrUrl: normalizedPayload.videoBase64OrUrl || "",
      };

      const action: VideoActionType = (actionName as VideoActionType) || vidPayload.action || "composite-video-enhance";

      // 1. Check Cache
      const inputHash = AIManager.getInstance().cache.generateHash(`plugin_video_${action}`, vidPayload);
      if (options?.enableCache !== false) {
        const cachedMatch = AIHistoryManager.getInstance().findMatch("enhance-media", inputHash);
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

      debugLogger.logStage("Inference Started", { action });

      let res;
      if (action === "video-bg-removal") {
        res = await this.engine.removeVideoBackground(vidPayload.videoBase64OrUrl, {
          jobId: options?.jobId,
          abortSignal: options?.abortSignal,
          preserveAudio: vidPayload.preserveAudio ?? true,
          onProgress: (p) => {
            options?.onProgress?.({
              taskId: options?.jobId || "vid_job",
              taskType: "background-removal",
              stage: p.stage as any,
              progress: p.percentage / 100,
              message: p.message,
              metadata: {
                currentFrame: p.currentFrame,
                totalFrames: p.totalFrames,
                fps: p.fps,
                etaSeconds: p.etaSeconds,
              },
            });
          },
        });
      } else if (action === "video-denoise" || (action as string) === "fastdvdnet-video-denoise") {
        res = await this.engine.enhanceVideo(vidPayload.videoBase64OrUrl, {
          jobId: options?.jobId,
          abortSignal: options?.abortSignal,
          denoiseIntensity: vidPayload.denoiseIntensity ?? 0.85,
          sharpnessIntensity: 0.2,
          claheClipLimit: 1.2,
          colorVibrance: 0.05,
          preserveAudio: vidPayload.preserveAudio ?? true,
          onProgress: (p) => {
            options?.onProgress?.({
              taskId: options?.jobId || "vid_job",
              taskType: "noise-reduction",
              stage: p.stage as any,
              progress: p.percentage / 100,
              message: p.message,
              metadata: {
                currentFrame: p.currentFrame,
                totalFrames: p.totalFrames,
                fps: p.fps,
                etaSeconds: p.etaSeconds,
              },
            });
          },
        });
      } else {
        res = await this.engine.enhanceVideo(vidPayload.videoBase64OrUrl, {
          jobId: options?.jobId,
          abortSignal: options?.abortSignal,
          denoiseIntensity: vidPayload.denoiseIntensity ?? 0.6,
          sharpnessIntensity: vidPayload.sharpnessIntensity ?? 0.5,
          claheClipLimit: vidPayload.claheClipLimit ?? 2.0,
          colorVibrance: vidPayload.colorVibrance ?? 0.35,
          preserveAudio: vidPayload.preserveAudio ?? true,
          onProgress: (p) => {
            options?.onProgress?.({
              taskId: options?.jobId || "vid_job",
              taskType: "enhance-media",
              stage: p.stage as any,
              progress: p.percentage / 100,
              message: p.message,
              metadata: {
                currentFrame: p.currentFrame,
                totalFrames: p.totalFrames,
                fps: p.fps,
                etaSeconds: p.etaSeconds,
              },
            });
          },
        });
      }

      const executionTimeMs = Date.now() - startTime;
      const result: AIVideoResult = {
        outputVideoBase64OrUrl: res.outputUrl,
        blob: res.blob,
        outputBlob: res.blob,
        mimeType: res.mimeType,
        width: res.width,
        height: res.height,
        durationSeconds: res.durationSeconds,
        fps: res.fps,
        processingType: action,
        appliedEngine: res.appliedEngine,
        executionTimeMs,
        qualityMetrics: {
          originalWidth: res.width,
          originalHeight: res.height,
          originalFps: res.fps,
          totalFramesProcessed: res.frameCount,
          isLocalExecution: true,
        },
      };

      // 3. Save to History / Cache safely without ever throwing or breaking video result
      if (options?.enableCache !== false) {
        try {
          AIHistoryManager.getInstance().recordJob(
            "enhance-media",
            this.id,
            executionTimeMs,
            inputHash,
            true,
            action,
            "Video processed successfully",
            result
          );
        } catch (histErr) {
          console.warn("[VideoEnhancementPlugin] Non-fatal history recording warning:", histErr);
        }
      }

      debugLogger.logStage("Plugin Result Verified", { action, executionTimeMs });

      return {
        success: true,
        data: result as TResult,
        executionTimeMs,
      };
    } catch (err: any) {
      debugLogger.logError("Video Enhancement Plugin Execution Error", err);
      return {
        success: false,
        error: this.createError("PROCESSING_FAILED", err?.message || String(err)),
      };
    }
  }
}
