import { AICapability } from "./types";
import { AITaskType } from "../types/ai";

export class AICapabilityRegistry {
  private static instance: AICapabilityRegistry;
  private capabilities: Map<string, AICapability> = new Map();

  public static getInstance(): AICapabilityRegistry {
    if (!AICapabilityRegistry.instance) {
      AICapabilityRegistry.instance = new AICapabilityRegistry();
    }
    return AICapabilityRegistry.instance;
  }

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // 1. Speech-to-Text via Groq Cloud
    this.register({
      id: "stt-groq-whisper",
      name: "Groq Whisper Large v3 (Cloud)",
      taskType: "speech-to-text",
      domain: "audio",
      executionMode: "remote",
      providerId: "groq",
      supportedInputFormats: ["wav", "mp3", "m4a", "webm", "ogg"],
      supportedOutputFormats: ["json", "vtt", "srt"],
      webSupported: true,
      androidSupported: true,
      description: "High-accuracy fast cloud speech recognition",
    });

    // 2. Speech-to-Text via Supabase Edge Functions
    this.register({
      id: "stt-supabase-edge",
      name: "Supabase Edge Speech-to-Text",
      taskType: "speech-to-text",
      domain: "audio",
      executionMode: "remote",
      providerId: "supabase-edge",
      supportedInputFormats: ["wav", "mp3", "m4a", "webm"],
      supportedOutputFormats: ["json"],
      webSupported: true,
      androidSupported: true,
      description: "Edge-hosted speech recognition fallback",
    });

    // 3. Local Audio DSP Filter (VAD & Noise Reduction)
    this.register({
      id: "audio-local-dsp",
      name: "Local Spectral Audio DSP Filter",
      taskType: "noise-reduction",
      domain: "audio",
      executionMode: "local",
      providerId: "local-audio-filter",
      supportedInputFormats: ["wav", "pcm"],
      supportedOutputFormats: ["wav", "pcm"],
      requiresWASM: false,
      estimatedRAMMB: 30,
      webSupported: true,
      androidSupported: true,
      description: "Client-side low latency STFT spectral noise and voice activity filter",
    });

    // 4. Vocal & Music Isolation
    this.register({
      id: "audio-vocal-isolation",
      name: "Vocal and Music Isolation (DSP)",
      taskType: "vocal-isolation",
      domain: "audio",
      executionMode: "local",
      providerId: "local-audio-filter",
      supportedInputFormats: ["wav", "mp3", "aac"],
      supportedOutputFormats: ["wav"],
      estimatedRAMMB: 60,
      webSupported: true,
      androidSupported: true,
      description: "Isolate vocals or extract instrumental tracks using local spectral masking",
    });

    // 5. Image Background Removal (Local Neural Engine)
    this.register({
      id: "ai-bg-removal",
      name: "Neural Background Removal (MediaPipe & RMBG)",
      taskType: "background-removal",
      domain: "image",
      executionMode: "local",
      providerId: "local-image-processor",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "webp"],
      requiresWASM: true,
      estimatedRAMMB: 1400,
      webSupported: true,
      androidSupported: true,
      description: "Local neural foreground extraction & alpha matting",
    });

    // 6. Media Enhancement (Local Video & Image Processing)
    this.register({
      id: "ai-video-clarity-enhancer",
      name: "AI Video Clarity & Detail Enhancer",
      taskType: "enhance-media",
      domain: "video",
      executionMode: "local",
      providerId: "local-video-processor",
      supportedInputFormats: ["mp4", "webm", "mov"],
      supportedOutputFormats: ["mp4", "webm"],
      requiresWASM: false,
      estimatedRAMMB: 90,
      webSupported: true,
      androidSupported: true,
      description: "Enhance video clarity, contrast, and micro-detail sharpness locally",
    });

    // 7. Image Generation & Editing (Replicate FLUX.2 Pro & BFL FLUX.1)
    this.register({
      id: "image-gen-replicate-flux",
      name: "Replicate FLUX.2 Pro",
      taskType: "image-generation",
      domain: "image",
      executionMode: "remote",
      providerId: "replicate",
      supportedInputFormats: ["text"],
      supportedOutputFormats: ["webp", "jpeg", "png"],
      webSupported: true,
      androidSupported: true,
      description: "Generates images using Black Forest Labs FLUX.2 Pro via Replicate",
    });

    this.register({
      id: "image-edit-replicate-flux",
      name: "Replicate FLUX.2 Pro Image Editing",
      taskType: "image-editing",
      domain: "image",
      executionMode: "remote",
      providerId: "replicate",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp", "text"],
      supportedOutputFormats: ["webp", "jpeg", "png"],
      webSupported: true,
      androidSupported: true,
      description: "Edits images using Black Forest Labs FLUX.2 Pro via Replicate",
    });

    this.register({
      id: "image-gen-bfl-flux",
      name: "Black Forest Labs FLUX.1",
      taskType: "image-generation",
      domain: "image",
      executionMode: "remote",
      providerId: "flux",
      supportedInputFormats: ["text"],
      supportedOutputFormats: ["jpeg", "png", "webp"],
      webSupported: true,
      androidSupported: true,
      description: "Generates high quality images from text prompts via BFL API",
    });

    // 8. Translation
    this.register({
      id: "translation-gemini",
      name: "Gemini Translation Engine",
      taskType: "translation",
      domain: "text",
      executionMode: "remote",
      providerId: "gemini",
      supportedInputFormats: ["text"],
      supportedOutputFormats: ["text"],
      webSupported: true,
      androidSupported: true,
      description: "Translates captions and text via Google Gemini API",
    });
  }

  public register(capability: AICapability): void {
    const existing = this.capabilities.get(capability.id);
    if (existing && existing.estimatedRAMMB && (!capability.estimatedRAMMB || capability.estimatedRAMMB < existing.estimatedRAMMB)) {
      this.capabilities.set(capability.id, {
        ...capability,
        estimatedRAMMB: existing.estimatedRAMMB,
      });
      return;
    }
    this.capabilities.set(capability.id, capability);
  }

  public get(id: string): AICapability | undefined {
    return this.capabilities.get(id);
  }

  public list(): AICapability[] {
    return Array.from(this.capabilities.values());
  }

  public findByTask(taskType: AITaskType): AICapability[] {
    return this.list().filter((c) => c.taskType === taskType);
  }

  public findBestForTask(
    taskType: AITaskType,
    preferLocal: boolean = false,
    isAndroid: boolean = false
  ): AICapability | undefined {
    const candidates = this.findByTask(taskType).filter((c) => {
      if (isAndroid && !c.androidSupported) return false;
      return true;
    });

    if (preferLocal) {
      const local = candidates.find((c) => c.executionMode === "local");
      if (local) return local;
    }

    return candidates[0];
  }
}
