import { BasePlugin } from "./BasePlugin";
import {
  AudioEnhancementPayload,
  AudioEnhancementResult,
  AudioStems,
} from "./types";
import { AICapability, AIJobOptions } from "../runtime/types";
import { AIResponse, AITaskType } from "../types/ai";
import { AIManager } from "../AIManager";
import { AICapabilityRegistry } from "../runtime/AICapabilityRegistry";
import { AIHistoryManager } from "../runtime/AIHistoryManager";
import { resolveAudioSourceToBlob, blobToDataUrl } from "../utils/audioUtils";
import { AIOutputVerifier } from "../utils/AIOutputVerifier";
import { PayloadValidator } from "../utils/PayloadValidator";
import { AIDebugLogger } from "../utils/AIDebugLogger";
import { audioAIEngine } from "../audio/AudioAIEngine";
import type { AudioAIJobOptions } from "../audio/types";

export class AudioEnhancementPlugin extends BasePlugin {
  public id = "plugin-audio-enhancement";
  public name = "Adaptive Spectral & Harmonic Audio Processing Plugin";
  public version = "1.0.0";
  public description = "Local Audio Denoising (Adaptive Spectral Subtraction) & Stem Separation (Center-Channel & Formant DSP)";

  public capabilities: AICapability[] = [
    {
      id: "spectral-denoise",
      name: "Adaptive Spectral Audio Denoise (STFT DSP)",
      taskType: "noise-reduction",
      domain: "audio",
      executionMode: "local",
      providerId: "plugin-audio-enhancement",
      supportedInputFormats: ["wav", "mp3", "m4a", "webm", "ogg", "pcm"],
      supportedOutputFormats: ["wav"],
      requiresWASM: false,
      estimatedRAMMB: 45,
      webSupported: true,
      androidSupported: true,
      description: "Low-latency STFT Wiener spectral subtraction and hum/hiss noise reduction",
    },
    {
      id: "spectral-stem-separation",
      name: "Center-Channel & Formant Stem Separation (DSP)",
      taskType: "vocal-isolation",
      domain: "audio",
      executionMode: "local",
      providerId: "plugin-audio-enhancement",
      supportedInputFormats: ["wav", "mp3", "m4a", "flac", "webm"],
      supportedOutputFormats: ["wav"],
      requiresWebGPU: false,
      requiresWASM: false,
      estimatedRAMMB: 90,
      webSupported: true,
      androidSupported: true,
      description: "Isolate Vocals or Instrumental backing track using stereo center-channel and vocal formant spectral masking DSP",
    },
    {
      id: "audio-enhance-composite",
      name: "Composite Audio Processing Pipeline (DSP)",
      taskType: "enhance-media",
      domain: "audio",
      executionMode: "local",
      providerId: "plugin-audio-enhancement",
      supportedInputFormats: ["wav", "mp3", "m4a", "webm"],
      supportedOutputFormats: ["wav"],
      requiresWASM: false,
      webSupported: true,
      androidSupported: true,
      description: "Unified local DSP audio pipeline featuring Adaptive Spectral Subtraction & Formant Stem Separation",
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

  public async execute<TPayload = AudioEnhancementPayload, TResult = AudioEnhancementResult>(
    actionName: string,
    payload: TPayload,
    options?: AIJobOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();
    const debugLogger = AIDebugLogger.getInstance();
    debugLogger.logStage("Plugin Loaded: AudioEnhancementPlugin", { actionName });

    try {
      const validation = PayloadValidator.validate(payload, "audio");
      if (!validation.valid) {
        debugLogger.logError("Payload Validation Failed in AudioEnhancementPlugin", validation.errors, { payload });
        return {
          success: false,
          error: this.createError("INVALID_PAYLOAD", validation.errors.join("; ") || "Audio data (audioBase64OrUrl) is required"),
        };
      }

      const normalizedPayload = validation.normalizedPayload;
      const audioPayload: AudioEnhancementPayload = {
        ...(payload as any),
        ...normalizedPayload,
        inputMediaType: "audio",
        audioBase64OrUrl: normalizedPayload.audioBase64OrUrl || "",
        imageBase64OrUrl: undefined,
        videoBase64OrUrl: undefined,
      };

      const historyTaskType: AITaskType =
        actionName === "denoise" || actionName === "spectral-denoise"
          ? "noise-reduction"
          : actionName === "separate" || actionName === "spectral-stem-separation"
          ? "vocal-isolation"
          : "enhance-media";

      // Check cache first
      const inputHash = AIManager.getInstance().cache.generateHash(
        `plugin_audio_${actionName}`,
        audioPayload
      );
      if (options?.enableCache !== false) {
        const cachedMatch = AIHistoryManager.getInstance().findMatch(historyTaskType, inputHash);
        if (cachedMatch && cachedMatch.resultData) {
          debugLogger.logStage("Cache Saved / Hit", { actionName, inputHash });
          return {
            success: true,
            data: cachedMatch.resultData as TResult,
            cached: true,
            executionTimeMs: 0,
          };
        }
      }

      // Determine execution path: Local DSP vs Remote
      const preferLocal = options?.executionMode !== "remote";

      debugLogger.logStage("Inference Started", { actionName, preferLocal });
      let result: AudioEnhancementResult;

      if (actionName === "denoise" || actionName === "spectral-denoise") {
        result = await this.runSpectralDenoise(audioPayload, preferLocal, options);
      } else if (actionName === "separate" || actionName === "spectral-stem-separation") {
        result = await this.runStemSeparation(audioPayload, preferLocal, options);
      } else {
        // Combined full enhancement pipeline
        result = await this.runCompositePipeline(audioPayload, preferLocal, options);
      }

      result.metrics = {
        noiseReductionDb: result.metrics?.noiseReductionDb ?? 0,
        processingTimeMs: Date.now() - startTime,
        isLocalExecution: result.metrics?.isLocalExecution ?? preferLocal,
      };

      debugLogger.logStage("Inference Finished", { actionName, executionTimeMs: result.metrics.processingTimeMs });

      const verification = AIOutputVerifier.verify(actionName, audioPayload, result, "audio");
      if (!verification.passed) {
        console.warn(`[AudioEnhancementPlugin] Verification warning for action "${actionName}": ${verification.reason}`);
        return {
          success: false,
          error: this.createError("VERIFICATION_FAILED", verification.reason || "Audio DSP processing output is identical to input or invalid"),
        };
      }
      if (verification.unchanged) {
        result.unchanged = true;
        result.message = verification.message || "لم تُكتشف ضوضاء تستحق التنقية";
      }
      debugLogger.logStage("Output Verified", { actionName, unchanged: result.unchanged });

      return {
        success: true,
        data: result as unknown as TResult,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      debugLogger.logError("AudioEnhancementPlugin Execution Exception", err, { actionName, payload });
      return {
        success: false,
        error: this.formatException(err),
      };
    }
  }

  /**
   * Adaptive Spectral Denoise Noise Reduction Implementation
   */
  private async runSpectralDenoise(
    payload: AudioEnhancementPayload,
    isLocal: boolean,
    options?: AIJobOptions
  ): Promise<AudioEnhancementResult> {
    const intensity = payload.denoiseIntensity ?? 0.8;
    const engineName = payload.denoiseEngine || "AdaptiveSpectralDSP";

    if (isLocal) {
      const { dataUrl, noiseReductionDb } = await this.applyLocalDenoiseDSP(
        payload.audioBase64OrUrl,
        intensity,
        options
      );
      return {
        enhancedAudioUrlOrBase64: dataUrl,
        processedAudioUrlOrBase64: dataUrl,
        mimeType: "audio/wav",
        appliedDenoiseEngine: "Adaptive Spectral Denoise (Local Worker DSP)",
        metrics: {
          noiseReductionDb,
          isLocalExecution: true,
        },
      };
    }

    // Remote execution via AIManager (fails explicitly if no remote audio provider is registered)
    const remoteRes = await AIManager.getInstance().isolateAudio(
      payload.audioBase64OrUrl,
      "remove-noise",
      { executionMode: "remote", abortSignal: options?.abortSignal }
    );

    if (!remoteRes?.processedAudioUrlOrBase64) {
      throw new Error("Remote noise reduction service failed or returned empty audio");
    }

    return {
      enhancedAudioUrlOrBase64: remoteRes.processedAudioUrlOrBase64,
      processedAudioUrlOrBase64: remoteRes.processedAudioUrlOrBase64,
      mimeType: payload.mimeType || "audio/wav",
      appliedDenoiseEngine: `${engineName} (Remote Provider)`,
      metrics: {
        noiseReductionDb: 0,
        isLocalExecution: false,
      },
    };
  }

  /**
   * Harmonic-Spectral Audio Stem Separation Implementation
   */
  private async runStemSeparation(
    payload: AudioEnhancementPayload,
    isLocal: boolean,
    options?: AIJobOptions
  ): Promise<AudioEnhancementResult> {
    const rawMode = (payload as any).mode || payload.separationMode || "extract-vocals";
    const mode = String(rawMode).toLowerCase();
    const engineName = payload.separationEngine || "HarmonicSpectralDSP";

    const stems: AudioStems = {};

    if (isLocal) {
      const outputAudio = await this.applyLocalStemSeparationDSP(payload.audioBase64OrUrl, mode, stems, options);
      return {
        enhancedAudioUrlOrBase64: outputAudio,
        processedAudioUrlOrBase64: outputAudio,
        mimeType: "audio/wav",
        stems,
        appliedSeparationEngine: "Center-Channel & Formant Stem Masking (Local Worker DSP)",
        metrics: {
          noiseReductionDb: 0,
          isLocalExecution: true,
        },
      };
    }

    // Remote execution via AIManager (fails explicitly if no remote audio provider is registered)
    const remoteRes = await AIManager.getInstance().isolateAudio(
      payload.audioBase64OrUrl,
      mode === "remove-music" ? "remove-music" : "isolate-vocals",
      { executionMode: "remote", abortSignal: options?.abortSignal }
    );

    if (!remoteRes?.processedAudioUrlOrBase64 && !remoteRes?.isolatedVocalUrlOrBase64) {
      throw new Error("Remote stem separation service failed or returned empty audio");
    }

    stems.vocals = remoteRes.isolatedVocalUrlOrBase64 || remoteRes.processedAudioUrlOrBase64;
    stems.instrumental = remoteRes.isolatedInstrumentalUrlOrBase64;

    const wantsVocals =
      mode === "extract-vocals" ||
      mode === "remove-music" ||
      mode === "isolate-vocals" ||
      mode === "vocals-only";

    const chosenTrack = wantsVocals
      ? (remoteRes.isolatedVocalUrlOrBase64 || remoteRes.processedAudioUrlOrBase64)
      : (remoteRes.isolatedInstrumentalUrlOrBase64 || remoteRes.processedAudioUrlOrBase64);

    return {
      enhancedAudioUrlOrBase64: chosenTrack,
      processedAudioUrlOrBase64: chosenTrack,
      mimeType: payload.mimeType || "audio/wav",
      stems,
      appliedSeparationEngine: `${engineName} (Remote Provider)`,
      metrics: {
        noiseReductionDb: 0,
        isLocalExecution: false,
      },
    };
  }

  /**
   * Composite Pipeline (Denoising & Optional Stem Separation)
   */
  private async runCompositePipeline(
    payload: AudioEnhancementPayload,
    isLocal: boolean,
    options?: AIJobOptions
  ): Promise<AudioEnhancementResult> {
    const doDenoise = payload.denoise !== false;
    const doSeparate = Boolean(payload.separationMode && payload.separationMode !== "none");

    if (!doDenoise && !doSeparate) {
      throw new Error("No enhancement action selected: either denoise or separation must be enabled");
    }

    let currentAudio = payload.audioBase64OrUrl;
    let denoiseEngineUsed: string | undefined;
    let measuredNoiseReductionDb = 0;

    if (doDenoise) {
      const denoiseRes = await this.runSpectralDenoise(payload, isLocal, options);
      currentAudio = denoiseRes.enhancedAudioUrlOrBase64;
      denoiseEngineUsed = denoiseRes.appliedDenoiseEngine;
      measuredNoiseReductionDb = denoiseRes.metrics?.noiseReductionDb ?? 0;
    }

    let stems: AudioStems | undefined;
    let separationEngineUsed: string | undefined;

    if (doSeparate) {
      const separationRes = await this.runStemSeparation(
        { ...payload, audioBase64OrUrl: currentAudio },
        isLocal,
        options
      );
      currentAudio = separationRes.enhancedAudioUrlOrBase64;
      stems = separationRes.stems;
      separationEngineUsed = separationRes.appliedSeparationEngine;
    }

    return {
      enhancedAudioUrlOrBase64: currentAudio,
      processedAudioUrlOrBase64: currentAudio,
      mimeType: "audio/wav",
      stems,
      appliedDenoiseEngine: denoiseEngineUsed,
      appliedSeparationEngine: separationEngineUsed,
      metrics: {
        noiseReductionDb: measuredNoiseReductionDb,
        isLocalExecution: isLocal,
      },
    };
  }

  /**
   * Local Audio DSP Engine Denoising
   */
  private async applyLocalDenoiseDSP(
    audioBase64OrUrl: string,
    intensity: number,
    options?: AIJobOptions
  ): Promise<{ dataUrl: string; noiseReductionDb: number }> {
    const blob = await resolveAudioSourceToBlob(audioBase64OrUrl);

    const denoiseResult = await audioAIEngine.reduceNoise(blob, {
      ...(options as Record<string, unknown>),
      denoiseStrength: Math.min(1.0, Math.max(0.2, intensity)),
    } as AudioAIJobOptions);

    const dataUrl = await blobToDataUrl(denoiseResult.audioBlob);
    return {
      dataUrl,
      noiseReductionDb: denoiseResult.snrImprovementEstDb ?? 0,
    };
  }

  /**
   * Local Audio DSP Engine Stem Separation
   */
  private async applyLocalStemSeparationDSP(
    audioBase64OrUrl: string,
    mode: string,
    outStems: AudioStems,
    options?: AIJobOptions
  ): Promise<string> {
    const blob = await resolveAudioSourceToBlob(audioBase64OrUrl);

    const sepResult = await audioAIEngine.isolateVocals(blob, options as unknown as AudioAIJobOptions);

    const vocalsDataUrl = await blobToDataUrl(sepResult.vocals.blob);
    const instDataUrl = await blobToDataUrl(sepResult.instrumental.blob);

    outStems.vocals = vocalsDataUrl;
    outStems.instrumental = instDataUrl;

    const normalizedMode = mode.toLowerCase();
    if (
      normalizedMode === "extract-vocals" ||
      normalizedMode === "remove-music" ||
      normalizedMode === "isolate-vocals" ||
      normalizedMode === "vocals-only"
    ) {
      return vocalsDataUrl;
    } else {
      // extract-music, extract-instrumental, music-only, remove-voice, remove-speech, remove-vocals, karaoke
      return instDataUrl;
    }
  }
}
