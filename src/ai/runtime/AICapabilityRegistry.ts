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
      name: "Local WebAssembly Audio Filter",
      taskType: "noise-reduction",
      domain: "audio",
      executionMode: "local",
      providerId: "local-audio-filter",
      supportedInputFormats: ["wav", "pcm"],
      supportedOutputFormats: ["wav", "pcm"],
      requiresWASM: true,
      estimatedRAMMB: 30,
      webSupported: true,
      androidSupported: true,
      description: "Client-side low latency noise and voice activity filter",
    });

    // 4. Vocal & Music Isolation
    this.register({
      id: "audio-vocal-isolation",
      name: "Vocal and Music Isolation",
      taskType: "vocal-isolation",
      domain: "audio",
      executionMode: "auto",
      providerId: "local-audio-filter",
      supportedInputFormats: ["wav", "mp3", "aac"],
      supportedOutputFormats: ["wav", "mp3"],
      estimatedRAMMB: 60,
      webSupported: true,
      androidSupported: true,
      description: "Isolate vocals or extract instrumental tracks",
    });

    // 5. Image & Video Background Removal
    this.register({
      id: "bg-removal-gemini",
      name: "Gemini Vision BG Removal",
      taskType: "background-removal",
      domain: "image",
      executionMode: "auto",
      providerId: "gemini",
      supportedInputFormats: ["png", "jpg", "jpeg", "mp4", "webm"],
      supportedOutputFormats: ["png", "webm"],
      webSupported: true,
      androidSupported: true,
      description: "Smart background removal for media assets",
    });

    // 6. Media Enhancement & Upscaling
    this.register({
      id: "enhance-media-gemini",
      name: "Gemini Super Resolution & Enhance",
      taskType: "enhance-media",
      domain: "video",
      executionMode: "auto",
      providerId: "gemini",
      supportedInputFormats: ["png", "jpg", "mp4"],
      supportedOutputFormats: ["png", "mp4"],
      webSupported: true,
      androidSupported: true,
      description: "Enhance image and video quality using AI upscaling",
    });

    // 7. Image Generation & Editing (Replicate FLUX.2 Pro)
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
      description: "Generates ultra-realistic state-of-the-art images using Black Forest Labs FLUX.2 Pro via Replicate",
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
      description: "Edits real images using Black Forest Labs FLUX.2 Pro via Replicate",
    });

    this.register({
      id: "image-upscale-replicate-esrgan",
      name: "Replicate Real-ESRGAN Upscaler",
      taskType: "image-upscale",
      domain: "image",
      executionMode: "remote",
      providerId: "replicate",
      supportedInputFormats: ["png", "jpg", "jpeg", "webp"],
      supportedOutputFormats: ["png", "jpeg", "webp"],
      webSupported: true,
      androidSupported: true,
      description: "Super resolution image upscaling (2x / 4x) using Real-ESRGAN via Replicate",
    });

    this.register({
      id: "image-gen-gemini",
      name: "Gemini Image Generator",
      taskType: "image-generation",
      domain: "image",
      executionMode: "remote",
      providerId: "gemini",
      supportedInputFormats: ["text"],
      supportedOutputFormats: ["png", "jpeg"],
      webSupported: true,
      androidSupported: true,
      description: "Generates high quality images from text prompts",
    });

    // 8. Translation
    this.register({
      id: "translation-groq-gemini",
      name: "Multi-Provider Translation Engine",
      taskType: "translation",
      domain: "text",
      executionMode: "auto",
      providerId: "groq",
      supportedInputFormats: ["text"],
      supportedOutputFormats: ["text"],
      webSupported: true,
      androidSupported: true,
      description: "Translates captions and text across 50+ languages",
    });
  }

  public register(capability: AICapability): void {
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
