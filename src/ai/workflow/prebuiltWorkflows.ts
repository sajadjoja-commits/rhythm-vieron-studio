import { AIWorkflowBuilder } from "./AIWorkflowBuilder";
import { WorkflowDefinition } from "./types";

/**
 * Pre-built Image Enhance Workflow:
 * 1. Remove Background
 * 2. Denoise
 * 3. Face Restore
 * 4. Upscale
 */
export const imageEnhanceWorkflow: WorkflowDefinition = AIWorkflowBuilder.create(
  "workflow-image-enhance",
  "Full Image Enhancement Workflow",
  "image",
  "Sequential pipeline for complete image optimization: BG Removal -> Denoise -> Face Restore -> 4K Upscale"
)
  .addStepAction(
    "step-bg-removal",
    "Remove Background",
    "plugin-image-enhancement",
    "remove-background",
    {},
    (prevResult, initialInput) => {
      const src = typeof initialInput === "string" ? initialInput : initialInput?.imageBase64OrUrl;
      return { imageBase64OrUrl: src };
    }
  )
  .addStepAction(
    "step-denoise",
    "Image Denoise",
    "plugin-image-enhancement",
    "denoise",
    { denoiseIntensity: 0.8 },
    (prevResult) => {
      const src = prevResult?.outputImageBase64OrUrl || prevResult?.processedImageUrlOrBase64 || prevResult;
      return { imageBase64OrUrl: typeof src === "string" ? src : src?.imageBase64OrUrl };
    }
  )
  .addStepAction(
    "step-face-restore",
    "Face Restore",
    "plugin-image-enhancement",
    "face-enhance",
    { enhanceFaceLevel: 0.9 },
    (prevResult) => {
      const src = prevResult?.outputImageBase64OrUrl || prevResult?.processedImageUrlOrBase64 || prevResult;
      return { imageBase64OrUrl: typeof src === "string" ? src : src?.imageBase64OrUrl };
    }
  )
  .addStepAction(
    "step-upscale",
    "4K Image Upscale",
    "plugin-image-enhancement",
    "upscale",
    { upscaleFactor: 4 },
    (prevResult) => {
      const src = prevResult?.outputImageBase64OrUrl || prevResult?.processedImageUrlOrBase64 || prevResult;
      return { imageBase64OrUrl: typeof src === "string" ? src : src?.imageBase64OrUrl };
    }
  )
  .build();

/**
 * Pre-built Video Enhance Workflow:
 * 1. Video Denoise
 * 2. Stabilization
 * 3. Color Enhancement
 * 4. Upscale
 * 5. Frame Interpolation
 */
export const videoEnhanceWorkflow: WorkflowDefinition = AIWorkflowBuilder.create(
  "workflow-video-enhance",
  "Full Video Enhancement Workflow",
  "video",
  "Pro video pipeline: Video Denoise -> Stabilization -> Auto Color Enhancement -> 4K Upscale -> 60fps Frame Interpolation"
)
  .addStepAction(
    "step-video-denoise",
    "Video Denoise",
    "plugin-video-enhancement",
    "video-denoise",
    { denoiseIntensity: 0.7 },
    (prevResult, initialInput) => {
      const src = typeof initialInput === "string" ? initialInput : initialInput?.videoBase64OrUrl;
      return { videoBase64OrUrl: src };
    }
  )
  .addStepAction(
    "step-video-stabilization",
    "Video Stabilization",
    "plugin-video-enhancement",
    "video-stabilize",
    { stabilizeIntensity: 0.8 },
    (prevResult) => {
      const src = prevResult?.outputVideoBase64OrUrl || prevResult?.enhancedMediaUrlOrBase64 || prevResult;
      return { videoBase64OrUrl: typeof src === "string" ? src : src?.videoBase64OrUrl };
    }
  )
  .addStepAction(
    "step-video-color-enhance",
    "Color Enhancement",
    "plugin-video-enhancement",
    "auto-color-enhance",
    {},
    (prevResult) => {
      const src = prevResult?.outputVideoBase64OrUrl || prevResult?.enhancedMediaUrlOrBase64 || prevResult;
      return { videoBase64OrUrl: typeof src === "string" ? src : src?.videoBase64OrUrl };
    }
  )
  .addStepAction(
    "step-video-upscale",
    "4K Video Upscale",
    "plugin-video-enhancement",
    "video-upscale",
    { upscaleFactor: 4 },
    (prevResult) => {
      const src = prevResult?.outputVideoBase64OrUrl || prevResult?.enhancedMediaUrlOrBase64 || prevResult;
      return { videoBase64OrUrl: typeof src === "string" ? src : src?.videoBase64OrUrl };
    }
  )
  .addStepAction(
    "step-frame-interpolation",
    "60fps Frame Interpolation",
    "plugin-video-enhancement",
    "frame-interpolation",
    { targetFps: 60 },
    (prevResult) => {
      const src = prevResult?.outputVideoBase64OrUrl || prevResult?.enhancedMediaUrlOrBase64 || prevResult;
      return { videoBase64OrUrl: typeof src === "string" ? src : src?.videoBase64OrUrl };
    }
  )
  .build();

/**
 * Pre-built Audio Enhance Workflow:
 * 1. Noise Removal
 * 2. Voice Enhancement
 * 3. Stem Separation
 */
export const audioEnhanceWorkflow: WorkflowDefinition = AIWorkflowBuilder.create(
  "workflow-audio-enhance",
  "Full Audio Enhancement Workflow",
  "audio",
  "Studio audio pipeline: Noise Removal -> Voice Clarity Enhancement -> Stem Separation"
)
  .addStepAction(
    "step-audio-denoise",
    "Noise Removal",
    "plugin-audio-enhancement",
    "denoise",
    { denoise: true, denoiseIntensity: 0.85 },
    (prevResult, initialInput) => {
      const src = typeof initialInput === "string" ? initialInput : initialInput?.audioBase64OrUrl;
      return { audioBase64OrUrl: src };
    }
  )
  .addStepAction(
    "step-voice-enhancement",
    "Voice Enhancement",
    "plugin-audio-enhancement",
    "audio-enhance-composite",
    { denoise: true, targetSampleRate: 48000 },
    (prevResult) => {
      const src = prevResult?.enhancedAudioUrlOrBase64 || prevResult;
      return { audioBase64OrUrl: typeof src === "string" ? src : src?.audioBase64OrUrl };
    }
  )
  .addStepAction(
    "step-stem-separation",
    "Stem Separation",
    "plugin-audio-enhancement",
    "separate",
    { separationMode: "extract-vocals" },
    (prevResult) => {
      const src = prevResult?.enhancedAudioUrlOrBase64 || prevResult;
      return { audioBase64OrUrl: typeof src === "string" ? src : src?.audioBase64OrUrl };
    }
  )
  .build();

export const prebuiltWorkflows: WorkflowDefinition[] = [
  imageEnhanceWorkflow,
  videoEnhanceWorkflow,
  audioEnhanceWorkflow,
];
