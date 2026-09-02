import { KeyManager } from "./keyManager/KeyManager";
import { AICache } from "./cache/AICache";
import { LocalModelLoader } from "./providers/local/LocalModelLoader";
import { AIProvider } from "./types/provider";
import {
  AITaskType,
  AITaskOptions,
  AIResponse,
  SpeechToTextPayload,
  SpeechToTextResult,
  BackgroundRemovalPayload,
  BackgroundRemovalResult,
  AudioIsolationPayload,
  AudioIsolationResult,
  EnhanceMediaPayload,
  EnhanceMediaResult,
  TranslationPayload,
  TranslationResult,
  ImageGenerationPayload,
  ImageGenerationResult,
} from "./types/ai";

// Providers
import { GroqProvider } from "./providers/remote/GroqProvider";
import { SupabaseEdgeProvider } from "./providers/remote/SupabaseEdgeProvider";
import { GeminiProvider } from "./providers/remote/GeminiProvider";
import { FluxProvider } from "./providers/remote/FluxProvider";
import { ReplicateProvider } from "./providers/remote/ReplicateProvider";
import { LocalAudioFilter } from "./providers/local/LocalAudioFilter";
import { LocalImageProcessor } from "./providers/local/LocalImageProcessor";
import { LocalVideoProcessor } from "./providers/local/LocalVideoProcessor";
import { PayloadValidator } from "./utils/PayloadValidator";
import { AIDebugLogger } from "./utils/AIDebugLogger";

// Tasks
import { BaseTask } from "./tasks/BaseTask";
import { SpeechToTextTask } from "./tasks/SpeechToTextTask";
import { BackgroundRemovalTask } from "./tasks/BackgroundRemovalTask";
import { AudioIsolationTask } from "./tasks/AudioIsolationTask";
import { EnhanceMediaTask } from "./tasks/EnhanceMediaTask";
import { ImageGenerationTask } from "./tasks/ImageGenerationTask";
import { ImageEditingTask } from "./tasks/ImageEditingTask";
import { TranslationTask } from "./tasks/TranslationTask";
import { createAIError, formatAIException } from "./utils/errorUtils";

export class AIManager {
  private static instance: AIManager;

  public keyManager: KeyManager;
  public cache: AICache;
  public modelLoader: LocalModelLoader;

  private providers: Map<string, AIProvider> = new Map();
  private tasks: Map<AITaskType, BaseTask> = new Map();

  private constructor() {
    this.keyManager = new KeyManager();
    this.cache = new AICache({ useLocalStorage: true, defaultTTLMs: 24 * 3600 * 1000 });
    this.modelLoader = new LocalModelLoader();

    this.ensureProvidersRegistered();
    this.registerDefaultTasks();
  }

  public static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  private defaultProvidersRegistered = false;

  private ensureProvidersRegistered(): void {
    if (this.defaultProvidersRegistered) return;
    this.defaultProvidersRegistered = true;

    const groq = new GroqProvider(this.keyManager);
    const edge = new SupabaseEdgeProvider(this.keyManager);
    const gemini = new GeminiProvider(this.keyManager);
    const flux = new FluxProvider(this.keyManager);
    const replicate = new ReplicateProvider(this.keyManager);
    const localAudio = new LocalAudioFilter(this.modelLoader);
    const localImage = new LocalImageProcessor(this.modelLoader);
    const localVideo = new LocalVideoProcessor(this.modelLoader);

    this.registerProvider(groq);
    this.registerProvider(edge);
    this.registerProvider(gemini);
    this.registerProvider(flux);
    this.registerProvider(replicate);
    this.registerProvider(localAudio);
    this.registerProvider(localImage);
    this.registerProvider(localVideo);
  }

  private registerDefaultTasks(): void {
    this.tasks.set("speech-to-text", new SpeechToTextTask());
    this.tasks.set("background-removal", new BackgroundRemovalTask());
    this.tasks.set("vocal-isolation", new AudioIsolationTask());
    this.tasks.set("noise-reduction", new AudioIsolationTask());
    this.tasks.set("music-removal", new AudioIsolationTask());
    this.tasks.set("enhance-media", new EnhanceMediaTask());
    this.tasks.set("image-generation", new ImageGenerationTask());
    this.tasks.set("image-editing", new ImageEditingTask());
    this.tasks.set("translation", new TranslationTask());
  }

  public registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[AIManager] Registered provider: ${provider.name} (${provider.id})`);
  }

  public getProvider(id: string): AIProvider | undefined {
    this.ensureProvidersRegistered();
    return this.providers.get(id);
  }

  public listProviders(): AIProvider[] {
    this.ensureProvidersRegistered();
    return Array.from(this.providers.values());
  }

  /**
   * Unified Execution API for any AI Task
   */
  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    this.ensureProvidersRegistered();
    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Payload Created", { taskType, rawPayload: payload });

    const normalizedPayload = PayloadValidator.normalize(payload);
    debugLogger.logStage("Payload Normalized", { normalizedPayload });

    // Default enableCache to false for image generation to prevent serving stale prompts/images
    const enableCache = options?.enableCache ?? (taskType === "image-generation" ? false : true);

    // 1. Check cache if enabled
    let cacheKey = "";
    if (enableCache) {
      cacheKey = this.cache.generateHash(taskType, normalizedPayload);
      const cachedData = this.cache.get<TResult>(cacheKey);
      if (cachedData) {
        console.log(`[AIManager] Serving cached result for task "${taskType}"`);
        debugLogger.logStage("Cache Saved / Hit", { taskType, cacheKey });
        return {
          success: true,
          data: cachedData,
          cached: true,
          executionTimeMs: 0,
        };
      }
    }

    // 2. Resolve task handler
    const taskHandler = this.tasks.get(taskType);
    if (!taskHandler) {
      debugLogger.logError("Task Handler Not Found", new Error(`No task handler registered for task "${taskType}"`));
      return {
        success: false,
        error: createAIError("UNSUPPORTED_TASK", `No task handler registered for task "${taskType}"`),
      };
    }

    try {
      const activeProviders = Array.from(this.providers.values());
      const response = await taskHandler.execute(normalizedPayload, activeProviders, options);

      // Save to cache if successful
      if (response.success && response.data && enableCache && cacheKey) {
        this.cache.set(cacheKey, taskType, response.data, options?.cacheTTLMs, response.providerUsed);
        debugLogger.logStage("Cache Saved", { taskType, cacheKey, providerUsed: response.providerUsed });
      }

      return response as AIResponse<TResult>;
    } catch (err: any) {
      debugLogger.logError("AIManager Task Execution Exception", err, { taskType, normalizedPayload });
      return {
        success: false,
        error: formatAIException(err),
      };
    }
  }

  // ---------------- Convenience API Methods ----------------

  /**
   * Convenience Speech-To-Text method
   */
  public async transcribe(
    audioBase64: string,
    language?: string,
    options?: AITaskOptions
  ): Promise<SpeechToTextResult> {
    const payload: SpeechToTextPayload = {
      audioBase64,
      language,
    };

    const res = await this.execute<SpeechToTextPayload, SpeechToTextResult>(
      "speech-to-text",
      payload,
      options
    );

    if (res.success && res.data) {
      return res.data;
    }

    throw new Error(res.error?.message || "Speech transcription failed via AIManager");
  }

  /**
   * Convenience Background Removal method
   */
  public async removeBackground(
    mediaUrlOrBase64: string,
    isVideo: boolean = false,
    options?: AITaskOptions
  ): Promise<BackgroundRemovalResult> {
    const payload: BackgroundRemovalPayload = {
      mediaUrlOrBase64,
      isVideo,
      inputMediaType: isVideo ? "video" : "image",
    };
    const res = await this.execute<BackgroundRemovalPayload, BackgroundRemovalResult>(
      "background-removal",
      payload,
      options
    );

    if (res.success && res.data) return res.data;
    throw new Error(res.error?.message || "Background removal failed");
  }

  /**
   * Convenience Audio Isolation / Noise Reduction method
   */
  public async isolateAudio(
    audioBase64OrUrl: string,
    mode: "remove-noise" | "isolate-vocals" | "remove-music" = "remove-noise",
    options?: AITaskOptions
  ): Promise<AudioIsolationResult> {
    const payload: AudioIsolationPayload = { audioBase64OrUrl, mode, inputMediaType: "audio" };
    const res = await this.execute<AudioIsolationPayload, AudioIsolationResult>(
      "vocal-isolation",
      payload,
      options
    );

    if (res.success && res.data) return res.data;
    throw new Error(res.error?.message || "Audio isolation failed");
  }

  /**
   * Convenience Media Enhancement method
   */
  public async enhanceMedia(
    mediaUrlOrBase64: string,
    scaleFactor: 2 | 4 = 2,
    options?: AITaskOptions
  ): Promise<EnhanceMediaResult> {
    const mediaType = PayloadValidator.detectMediaType({ mediaUrlOrBase64 });
    const payload: EnhanceMediaPayload = {
      mediaUrlOrBase64,
      scaleFactor,
      inputMediaType: mediaType,
    };
    const res = await this.execute<EnhanceMediaPayload, EnhanceMediaResult>(
      "enhance-media",
      payload,
      options
    );

    if (res.success && res.data) return res.data;
    throw new Error(res.error?.message || "Media enhancement failed");
  }

  /**
   * Convenience Translation method
   */
  public async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
    options?: AITaskOptions
  ): Promise<TranslationResult> {
    const payload: TranslationPayload = { text, targetLang, sourceLang };
    const res = await this.execute<TranslationPayload, TranslationResult>(
      "translation",
      payload,
      options
    );

    if (res.success && res.data) return res.data;
    throw new Error(res.error?.message || "Translation failed");
  }

  /**
   * Convenience Image Generation method
   */
  public async generateImage(
    prompt: string,
    aspectRatio?: string,
    options?: AITaskOptions
  ): Promise<ImageGenerationResult> {
    const payload: ImageGenerationPayload = { prompt, aspectRatio };
    const res = await this.execute<ImageGenerationPayload, ImageGenerationResult>(
      "image-generation",
      payload,
      options
    );

    if (res.success && res.data) return res.data;
    throw new Error(res.error?.message || "Image generation failed");
  }

  /**
   * Clean up memory & caches
   */
  public async dispose(): Promise<void> {
    this.cache.clear();
    await this.modelLoader.unloadAll();
  }
}

// Global Singleton Export (Lazy Proxy)
let _aiManagerProxyInstance: AIManager | null = null;
export const aiManager: AIManager = new Proxy({} as AIManager, {
  get(_target, prop, receiver) {
    if (!_aiManagerProxyInstance) {
      _aiManagerProxyInstance = AIManager.getInstance();
    }
    const val = Reflect.get(_aiManagerProxyInstance, prop, receiver);
    return typeof val === "function" ? val.bind(_aiManagerProxyInstance) : val;
  },
});
