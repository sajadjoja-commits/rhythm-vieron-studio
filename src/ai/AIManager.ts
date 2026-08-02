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
import { LocalAudioFilter } from "./providers/local/LocalAudioFilter";

// Tasks
import { BaseTask } from "./tasks/BaseTask";
import { SpeechToTextTask } from "./tasks/SpeechToTextTask";
import { BackgroundRemovalTask } from "./tasks/BackgroundRemovalTask";
import { AudioIsolationTask } from "./tasks/AudioIsolationTask";
import { EnhanceMediaTask } from "./tasks/EnhanceMediaTask";
import { ImageGenerationTask } from "./tasks/ImageGenerationTask";
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

    this.registerDefaultProviders();
    this.registerDefaultTasks();
  }

  public static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  private registerDefaultProviders(): void {
    const groq = new GroqProvider(this.keyManager);
    const edge = new SupabaseEdgeProvider(this.keyManager);
    const gemini = new GeminiProvider(this.keyManager);
    const localAudio = new LocalAudioFilter(this.modelLoader);

    this.registerProvider(groq);
    this.registerProvider(edge);
    this.registerProvider(gemini);
    this.registerProvider(localAudio);
  }

  private registerDefaultTasks(): void {
    this.tasks.set("speech-to-text", new SpeechToTextTask());
    this.tasks.set("background-removal", new BackgroundRemovalTask());
    this.tasks.set("vocal-isolation", new AudioIsolationTask());
    this.tasks.set("noise-reduction", new AudioIsolationTask());
    this.tasks.set("music-removal", new AudioIsolationTask());
    this.tasks.set("enhance-media", new EnhanceMediaTask());
    this.tasks.set("image-generation", new ImageGenerationTask());
    this.tasks.set("translation", new TranslationTask());
  }

  public registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[AIManager] Registered provider: ${provider.name} (${provider.id})`);
  }

  public getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  public listProviders(): AIProvider[] {
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
    const enableCache = options?.enableCache ?? true;

    // 1. Check cache if enabled
    let cacheKey = "";
    if (enableCache) {
      cacheKey = this.cache.generateHash(taskType, payload);
      const cachedData = this.cache.get<TResult>(cacheKey);
      if (cachedData) {
        console.log(`[AIManager] Serving cached result for task "${taskType}"`);
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
      return {
        success: false,
        error: createAIError("UNSUPPORTED_TASK", `No task handler registered for task "${taskType}"`),
      };
    }

    try {
      const activeProviders = Array.from(this.providers.values());
      const response = await taskHandler.execute(payload, activeProviders, options);

      // Save to cache if successful
      if (response.success && response.data && enableCache && cacheKey) {
        this.cache.set(cacheKey, taskType, response.data, options?.cacheTTLMs, response.providerUsed);
      }

      return response as AIResponse<TResult>;
    } catch (err: any) {
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
    const payload: BackgroundRemovalPayload = { mediaUrlOrBase64, isVideo };
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
    const payload: AudioIsolationPayload = { audioBase64OrUrl, mode };
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
    const payload: EnhanceMediaPayload = { mediaUrlOrBase64, scaleFactor };
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

// Global Singleton Export
export const aiManager = AIManager.getInstance();
