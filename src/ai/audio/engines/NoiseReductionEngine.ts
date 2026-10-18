/**
 * Local Spectral Noise Reduction Engine (DSP)
 * Multi-band STFT spectral subtraction and decision-directed Wiener noise suppression.
 * Attenuates stationary background noise, air conditioner hum, low rumble, and hiss.
 */

import { AudioWorkerManager } from "../AudioWorkerManager";
import { AudioAIJobManager } from "../AudioAIJobManager";
import { decodeAudioSource, encodeWavBlob, calculateAudioStats } from "../utils/audioBufferUtils";
import { DenoiseResult, AudioAIJobOptions } from "../types";

/**
 * Calculates the RMS level (in dBFS) of the quietest `quietRatio` (default 10%)
 * of 50ms windows on the given channel.
 */
export function calculateQuietestWindowsRmsDb(
  channel: Float32Array,
  sampleRate: number,
  windowMs: number = 50,
  quietRatio: number = 0.1
): number {
  if (!channel || channel.length === 0) return -100;
  const windowSamples = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const numWindows = Math.floor(channel.length / windowSamples);

  if (numWindows <= 0) {
    return calculateAudioStats(channel).rmsDbfs;
  }

  const windowRmsDbs: number[] = [];
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSamples;
    let sumSquares = 0;
    for (let i = 0; i < windowSamples; i++) {
      const val = channel[start + i];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / windowSamples);
    const rmsDbfs = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
    windowRmsDbs.push(rmsDbfs);
  }

  windowRmsDbs.sort((a, b) => a - b);
  const quietCount = Math.max(1, Math.floor(numWindows * quietRatio));
  let sumDb = 0;
  for (let i = 0; i < quietCount; i++) {
    sumDb += windowRmsDbs[i];
  }
  return sumDb / quietCount;
}

/**
 * Measures real noise floor reduction in dB between original and processed channel 0
 * using 50ms windows over the quietest 10% of windows.
 * Returns 0 if reduction is less than 0.5 dB.
 */
export function calculateNoiseFloorReductionDb(
  originalCh0: Float32Array,
  processedCh0: Float32Array,
  sampleRate: number
): number {
  const beforeQuietDb = calculateQuietestWindowsRmsDb(originalCh0, sampleRate, 50, 0.1);
  const afterQuietDb = calculateQuietestWindowsRmsDb(processedCh0, sampleRate, 50, 0.1);
  const noiseFloorReductionDb = beforeQuietDb - afterQuietDb;
  if (!Number.isFinite(noiseFloorReductionDb) || noiseFloorReductionDb < 0.5) {
    return 0;
  }
  return Math.round(noiseFloorReductionDb * 10) / 10;
}

export class NoiseReductionEngine {
  private static instance: NoiseReductionEngine;
  private workerManager: AudioWorkerManager;
  private jobManager: AudioAIJobManager;

  private constructor() {
    this.workerManager = AudioWorkerManager.getInstance();
    this.jobManager = AudioAIJobManager.getInstance();
  }

  public static getInstance(): NoiseReductionEngine {
    if (!NoiseReductionEngine.instance) {
      NoiseReductionEngine.instance = new NoiseReductionEngine();
    }
    return NoiseReductionEngine.instance;
  }

  /**
   * Remove background noise and hiss from an audio source
   */
  public async reduceNoise(
    source: File | Blob | ArrayBuffer | string,
    options: AudioAIJobOptions = {}
  ): Promise<DenoiseResult> {
    const job = this.jobManager.createJob("ai-denoise", options.jobId);

    if (options.onProgress) {
      this.jobManager.subscribe(job.id, options.onProgress);
    }

    if (options.abortSignal) {
      if (options.abortSignal.aborted) {
        this.jobManager.cancelJob(job.id);
        throw new DOMException("Noise reduction was cancelled before execution", "AbortError");
      }
      options.abortSignal.addEventListener("abort", () => {
        this.workerManager.cancelTask(job.id);
        this.jobManager.cancelJob(job.id);
      }, { once: true });
    }

    let createdAudioUrl: string | null = null;

    try {
      this.jobManager.updateProgress(job.id, 10, "DECODE", "جاري قراءة وفك تشفير المقطع الصوتي...");

      const audioBuffer = await decodeAudioSource(source);
      const sampleRate = audioBuffer.sampleRate;
      const duration = audioBuffer.duration;
      const numChannels = audioBuffer.numberOfChannels;

      if (options.abortSignal?.aborted) {
        throw new DOMException("Noise reduction cancelled after decoding", "AbortError");
      }

      const statsBefore = calculateAudioStats(audioBuffer.getChannelData(0));

      this.jobManager.updateProgress(
        job.id,
        25,
        "ANALYZE",
        `تحليل الطيف الصوتي وبناء بصمة الضوضاء (RMS: ${statsBefore.rmsDbfs.toFixed(1)} dBFS)...`
      );

      const rawChannels: Float32Array[] = [];
      const transferableBuffers: ArrayBuffer[] = [];

      for (let ch = 0; ch < numChannels; ch++) {
        const channelClone = new Float32Array(audioBuffer.getChannelData(ch));
        rawChannels.push(channelClone);
        transferableBuffers.push(channelClone.buffer);
      }

      this.jobManager.updateProgress(
        job.id,
        45,
        "DENOISE",
        "تطبيق خوارزمية التنقية الطيفية التكيفية وإزالة الطنين والتشويش..."
      );

      const workerResult = await this.workerManager.runTask<{
        channels: Float32Array[];
        sampleRate: number;
      }>(
        {
          id: job.id,
          type: "denoise",
          sampleRate,
          channels: rawChannels,
          options: {
            denoiseStrength: options.denoiseStrength ?? 0.85,
          },
        },
        transferableBuffers,
        (workerPct) => {
          const mappedPct = Math.min(84, Math.max(45, Math.round(45 + (workerPct / 100) * 39)));
          this.jobManager.updateProgress(
            job.id,
            mappedPct,
            "DENOISE",
            "تطبيق خوارزمية التنقية الطيفية التكيفية وإزالة الطنين والتشويش..."
          );
        }
      );

      if (options.abortSignal?.aborted) {
        throw new DOMException("Noise reduction cancelled after worker processing", "AbortError");
      }

      if (!workerResult.channels || workerResult.channels.length === 0 || !workerResult.channels[0]) {
        throw new Error("Noise reduction worker returned empty audio channels");
      }

      const originalCh0 = audioBuffer.getChannelData(0);
      const processedCh0 = workerResult.channels[0];

      this.jobManager.updateProgress(job.id, 85, "ENCODE", "ترميز المقطع الصوتي المنقى بصيغة WAV بدون فقدان...");

      const noiseFloorReductionDb = calculateNoiseFloorReductionDb(
        originalCh0,
        processedCh0,
        sampleRate
      );

      const wavBlob = encodeWavBlob(workerResult.channels, sampleRate);
      createdAudioUrl = URL.createObjectURL(wavBlob);

      const result: DenoiseResult = {
        audioUrl: createdAudioUrl,
        audioBlob: wavBlob,
        duration,
        sampleRate,
        channels: numChannels,
        noiseProfileDetected:
          noiseFloorReductionDb > 0 ? "Stationary Spectral Noise Floor (STFT Wiener)" : undefined,
        snrImprovementEstDb: noiseFloorReductionDb,
        providerUsed: "local-adaptive-spectral-worker",
      };

      this.jobManager.completeJob(
        job.id,
        noiseFloorReductionDb > 0
          ? `تمت تنقية الضوضاء بنجاح (خفض أرضية الضوضاء ${result.snrImprovementEstDb} dB)`
          : "تمت معالجة الصوت بمرشح الطيف التكيفي"
      );

      return result;
    } catch (err: any) {
      if (createdAudioUrl) {
        URL.revokeObjectURL(createdAudioUrl);
      }
      if (err?.name === "AbortError") {
        this.jobManager.cancelJob(job.id);
      } else {
        console.error(`[NoiseReductionEngine] Job ${job.id} failed:`, err);
        this.jobManager.failJob(job.id, err);
      }
      throw err;
    }
  }
}
