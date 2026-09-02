/**
 * Video Processing Engine
 * Master Coordinator for Local Real Video AI Processing:
 * - Neural Video Background Removal with MediaPipe & Temporal Stabilization
 * - Multi-scale Adaptive CLAHE & Edge-Preserving Video Enhancement
 * - Streaming WebCodecs / MP4 & WebM Muxer Encoding
 * - Zero Frame-Accumulation Memory Management
 */

import {
  VideoAITaskType,
  VideoAIOptions,
  VideoAIResult,
  VideoProgressEvent,
  VideoCapabilityProfile,
  VideoResourceAssessment,
} from "./types";
import { VideoCapabilityDetector } from "./VideoCapabilityDetector";
import { VideoResourceManager } from "./VideoResourceManager";
import { VideoMemoryManager } from "./VideoMemoryManager";
import { VideoFrameExtractor } from "./VideoFrameExtractor";
import { VideoEnhancementEngine } from "./VideoEnhancementEngine";
import { VideoSegmentationEngine } from "./VideoSegmentationEngine";
import { VideoEncoderEngine } from "./VideoEncoderEngine";
import { VideoOutputVerifier, VideoSampleFrame } from "./VideoOutputVerifier";

export class VideoProcessingEngine {
  private static instance: VideoProcessingEngine;

  private capabilityDetector = VideoCapabilityDetector.getInstance();
  private resourceManager = VideoResourceManager.getInstance();
  private memoryManager = VideoMemoryManager.getInstance();
  private frameExtractor = VideoFrameExtractor.getInstance();
  private enhancementEngine = VideoEnhancementEngine.getInstance();
  private segmentationEngine = VideoSegmentationEngine.getInstance();
  private encoderEngine = VideoEncoderEngine.getInstance();
  private verifier = VideoOutputVerifier.getInstance();

  private activeJobs = new Map<string, { abortController: AbortController }>();

  public static getInstance(): VideoProcessingEngine {
    if (!VideoProcessingEngine.instance) {
      VideoProcessingEngine.instance = new VideoProcessingEngine();
    }
    return VideoProcessingEngine.instance;
  }

  /**
   * Pre-check resource requirements before starting a job.
   */
  public async assessVideo(videoInput: string | Blob | File): Promise<VideoResourceAssessment> {
    const profile = await this.capabilityDetector.detect();
    return this.resourceManager.assessVideo(videoInput, profile);
  }

  /**
   * Cancels an ongoing video AI job.
   */
  public cancelJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.abortController.abort();
      this.activeJobs.delete(jobId);
    }
  }

  // --------------------------------------------------------------------------
  // 1. VIDEO ENHANCEMENT
  // --------------------------------------------------------------------------
  public async enhanceVideo(
    videoInput: string | Blob | File,
    options?: VideoAIOptions
  ): Promise<VideoAIResult> {
    return this.executeVideoPipeline("enhance-video", videoInput, options);
  }

  // --------------------------------------------------------------------------
  // 2. VIDEO BACKGROUND REMOVAL
  // --------------------------------------------------------------------------
  public async removeVideoBackground(
    videoInput: string | Blob | File,
    options?: VideoAIOptions
  ): Promise<VideoAIResult> {
    return this.executeVideoPipeline("remove-video-background", videoInput, {
      ...options,
      outputFormat: options?.outputFormat || (options?.backgroundColor && options.backgroundColor !== "transparent" ? "mp4" : "webm"),
    });
  }

  // --------------------------------------------------------------------------
  // UNIFIED EXECUTION PIPELINE
  // --------------------------------------------------------------------------
  private async executeVideoPipeline(
    taskType: VideoAITaskType,
    videoInput: string | Blob | File,
    options?: VideoAIOptions
  ): Promise<VideoAIResult> {
    const startTime = Date.now();
    const jobId = options?.jobId || `vieron_vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const abortController = new AbortController();
    this.activeJobs.set(jobId, { abortController });

    if (options?.abortSignal) {
      options.abortSignal.addEventListener("abort", () => {
        abortController.abort();
      }, { once: true });
    }

    const logStage = (stage: string, meta?: Record<string, any>) => {
      console.log(`[VIDEO-AI] [${stage}] jobId: ${jobId} | task: ${taskType}`, meta ? JSON.stringify(meta) : "");
    };

    logStage("INIT", { timestamp: new Date().toISOString() });

    const emitProgress = (
      stage: VideoProgressEvent["stage"],
      percentage: number,
      currentFrame: number,
      totalFrames: number,
      message: string
    ) => {
      if (abortController.signal.aborted || options?.isAborted?.() || options?.abortSignal?.aborted) return;

      const elapsedMs = Date.now() - startTime;
      const framesDone = Math.max(1, currentFrame);
      const msPerFrame = elapsedMs / framesDone;
      const remainingFrames = Math.max(0, totalFrames - currentFrame);
      const etaSeconds = Math.round((remainingFrames * msPerFrame) / 1000);

      options?.onProgress?.({
        jobId,
        taskType,
        stage,
        percentage: Math.min(100, Math.max(0, Math.round(percentage))),
        currentFrame,
        totalFrames,
        fps: Math.round(1000 / (msPerFrame || 33)),
        elapsedMs,
        etaSeconds,
        message,
      });
    };

    try {
      logStage("INPUT", { inputType: typeof videoInput === "string" ? "url/base64" : "blob/file" });
      emitProgress("PREPARING", 3, 0, 100, "جاري فحص خصائص الفيديو وتهيئة المعالج...");

      // 1. Detect Capabilities
      const profile = await this.capabilityDetector.detect();
      logStage("CAPABILITIES", {
        hasWebCodecs: profile.hasWebCodecs,
        hasWASM: profile.hasWASM,
        deviceMemoryGB: profile.deviceMemoryGB,
        recommendedEncoder: profile.recommendedEncoder,
      });

      // 2. Prepare video and metadata
      const targetFps = options?.targetFps || 30;
      const { video, meta, cleanup: cleanupSourceVideo } = await this.frameExtractor.prepareVideo(
        videoInput,
        targetFps
      );

      const width = meta.width;
      const height = meta.height;
      const totalFrames = meta.totalFrames;
      const durationSeconds = meta.durationSeconds;
      const fps = meta.fps;

      logStage("DECODER_READY", { width, height, durationSeconds, fps, totalFrames, hasAudio: meta.hasAudio });

      // 3. Setup Processing Canvas & Buffers
      const processCanvas = this.memoryManager.createCanvas(width, height);
      const ctx = processCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

      if (!ctx) {
        cleanupSourceVideo();
        throw new Error("فشل إنشاء سياق المعالجة ثنائي الأبعاد (Canvas 2D Context).");
      }

      // Pre-warm neural model if segmentation
      if (taskType === "remove-video-background") {
        logStage("MODEL_LOADING", { model: "mediapipe-selfie-segmenter" });
        emitProgress("LOADING", 8, 0, totalFrames, "جاري تحميل محرك الذكاء الاصطناعي للفصل...");
        await this.segmentationEngine.getSegmenter();
        logStage("MODEL_READY");
      }

      // 4. Initialize Streaming Encoder
      const outputFormat = options?.outputFormat || (taskType === "remove-video-background" && (!options?.backgroundColor || options.backgroundColor === "transparent") ? "webm" : "mp4");
      
      const encoderSession = await this.encoderEngine.createEncoderSession({
        width,
        height,
        fps,
        format: outputFormat,
        audioBuffer: meta.audioBuffer,
        profile,
        options,
      });

      logStage("ENCODER_READY", { format: outputFormat, width, height, fps });
      emitProgress("PROCESSING", 10, 0, totalFrames, "بدء معالجة الإطارات بدقة الذكاء الاصطناعي...");

      // Buffers for temporal stabilization
      let prevLuminanceBuffer: Float32Array | null = null;
      let prevAlphaBuffer: Float32Array | null = null;
      const inputSampleFrames: VideoSampleFrame[] = [];

      // 5. Sequential Frame Processing Loop (Zero frame accumulation in RAM)
      try {
        logStage("PROCESSING", { totalFrames });
        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          // Abort / Cancellation check
          if (abortController.signal.aborted || options?.isAborted?.() || options?.abortSignal?.aborted) {
            encoderSession.cancel();
            throw new Error("تم إلغاء عملية المعالجة بواسطة المستخدم.");
          }

          // Encoder health check
          if (encoderSession.state === "ERROR" || encoderSession.state === "CANCELLED" || encoderSession.state === "CLOSED") {
            const encErr = encoderSession.getError() || new Error(`مشفر الفيديو في حالة غير صالحة: ${encoderSession.state}`);
            throw encErr;
          }

          const timestampSeconds = (frameIdx / fps);
          const timestampMicros = Math.round(timestampSeconds * 1_000_000);

          // Seek video
          await this.frameExtractor.seekToTimestamp(video, timestampSeconds);

          // Draw current frame into processing canvas
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(video, 0, 0, width, height);

          // Fetch ImageData
          const imageData = ctx.getImageData(0, 0, width, height);

          // Sample frames (start, midpoint, end) for authentic output verification
          const isSampleFrame = frameIdx === 0 || frameIdx === Math.floor(totalFrames / 2) || frameIdx === totalFrames - 1;
          if (isSampleFrame && inputSampleFrames.length < 3) {
            inputSampleFrames.push({
              timestampSeconds,
              data: new Uint8ClampedArray(imageData.data),
              width,
              height,
            });
          }

          // Apply task-specific processing
          if (taskType === "enhance-video") {
            const origDataCopy = isSampleFrame ? new Uint8ClampedArray(imageData.data) : null;
            const res = this.enhancementEngine.processFrame(imageData, options, prevLuminanceBuffer);
            prevLuminanceBuffer = res.currentLuminance;

            if (isSampleFrame && origDataCopy) {
              const metrics = this.enhancementEngine.calculateFrameMetrics(origDataCopy, imageData.data);
              console.log(
                `[VideoProcessingEngine] Frame ${frameIdx + 1}/${totalFrames} [Enhance]: meanDiff=${metrics.meanPixelDifference.toFixed(2)}, changed%=${metrics.changedPixelPercentage.toFixed(1)}%, lum=[${metrics.luminanceOriginal.toFixed(1)}->${metrics.luminanceProcessed.toFixed(1)}], contrast=[${metrics.contrastOriginal.toFixed(1)}->${metrics.contrastProcessed.toFixed(1)}]`
              );
            }

            ctx.clearRect(0, 0, width, height);
            ctx.putImageData(imageData, 0, 0);
          } else if (taskType === "remove-video-background") {
            const res = await this.segmentationEngine.processFrame(
              processCanvas,
              imageData,
              { ...options, frameIndex: frameIdx },
              prevAlphaBuffer
            );
            prevAlphaBuffer = res.currentAlphaBuffer;

            // CRITICAL: Clear canvas completely before putting modified image data so no original frame remnants exist underneath!
            ctx.clearRect(0, 0, width, height);
            ctx.putImageData(imageData, 0, 0);
          }

          // Quick canvas verification for sample frames
          if (isSampleFrame) {
            const checkPixel = ctx.getImageData(0, 0, 1, 1).data;
            console.log(
              `[VideoProcessingEngine] Frame ${frameIdx + 1} canvas ready: R=${checkPixel[0]}, G=${checkPixel[1]}, B=${checkPixel[2]}, A=${checkPixel[3]}`
            );
          }

          // Stream encoded frame into muxer
          await encoderSession.addFrame(processCanvas, timestampMicros, frameIdx === 0);

          // Update Progress
          const percent = 10 + Math.round((frameIdx / totalFrames) * 75);
          if (frameIdx % Math.max(1, Math.floor(fps / 3)) === 0 || frameIdx === totalFrames - 1) {
            emitProgress(
              "PROCESSING",
              percent,
              frameIdx + 1,
              totalFrames,
              `معالجة الإطار ${frameIdx + 1} من ${totalFrames}...`
            );
          }
        }

        // 6. Finalize Encoding
        logStage("FINALIZING");
        emitProgress("ENCODING", 90, totalFrames, totalFrames, "جاري إتمام ترميز وضغط الفيديو النهائي...");
        const outputBlob = await encoderSession.finish();

        // Clean source resources
        cleanupSourceVideo();
        this.memoryManager.disposeCanvas(processCanvas);

        // 7. Verify Output
        logStage("VERIFYING", { sizeBytes: outputBlob.size, sampleFramesCount: inputSampleFrames.length });
        emitProgress("VERIFYING", 95, totalFrames, totalFrames, "جاري التحقق من سلامة الفيديو المُنتج ومطابقة الإطارات...");
        const verification = await this.verifier.verify(outputBlob, {
          expectedDuration: durationSeconds,
          expectedWidth: width,
          expectedHeight: height,
          taskType: taskType as any,
          inputSampleFrames,
        });

        if (!verification.valid) {
          throw new Error(verification.error || "فشل التحقق من صحة ملف الفيديو النهائي.");
        }

        const outputUrl = this.memoryManager.createTrackedObjectUrl(outputBlob);
        const executionTimeMs = Date.now() - startTime;
        const sizeMB = Number((outputBlob.size / (1024 * 1024)).toFixed(2));

        logStage("COMPLETED", { outputUrl, sizeMB, executionTimeMs });
        emitProgress("COMPLETED", 100, totalFrames, totalFrames, "اكتملت معالجة الفيديو بنجاح!");

        return {
          outputUrl,
          blob: outputBlob,
          mimeType: outputBlob.type || `video/${outputFormat}`,
          width,
          height,
          durationSeconds,
          fps,
          frameCount: totalFrames,
          sizeMB,
          executionTimeMs,
          taskType,
          appliedEngine: profile.hasWebCodecs ? "WebCodecs Hardware AI Pipeline" : "Optimized Media Muxer AI Pipeline",
          verified: true,
        };
      } catch (loopErr) {
        encoderSession.cancel();
        cleanupSourceVideo();
        this.memoryManager.disposeCanvas(processCanvas);
        throw loopErr;
      }
    } catch (err: any) {
      logStage("FAILED", { error: err?.message || String(err) });
      emitProgress("FAILED", 0, 0, 0, `خطأ في المعالجة: ${err?.message || String(err)}`);
      throw err;
    } finally {
      this.activeJobs.delete(jobId);
    }
  }
}
