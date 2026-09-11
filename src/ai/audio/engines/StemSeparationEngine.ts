/**
 * Real Stem Separation Engine
 * Isolates Vocals, Instrumental, Drums, Bass, and Other without fake filters.
 * Conserves phase and duration; guarantees original == vocals + instrumental.
 */

import { AudioWorkerManager } from "../AudioWorkerManager";
import { AudioAIJobManager } from "../AudioAIJobManager";
import {
  decodeAudioSource,
  encodeWavBlob,
  getSharedAudioContext,
} from "../utils/audioBufferUtils";
import {
  StemSeparationResult,
  StemTrackOutput,
  AudioAIJobOptions,
} from "../types";

export class StemSeparationEngine {
  private static instance: StemSeparationEngine;
  private workerManager: AudioWorkerManager;
  private jobManager: AudioAIJobManager;

  private constructor() {
    this.workerManager = AudioWorkerManager.getInstance();
    this.jobManager = AudioAIJobManager.getInstance();
  }

  public static getInstance(): StemSeparationEngine {
    if (!StemSeparationEngine.instance) {
      StemSeparationEngine.instance = new StemSeparationEngine();
    }
    return StemSeparationEngine.instance;
  }

  /**
   * Separate audio into Vocals, Instrumental, or 4-Stems
   */
  public async separateStems(
    source: File | Blob | ArrayBuffer | string,
    options: AudioAIJobOptions = {}
  ): Promise<StemSeparationResult> {
    const stemsCount = options.stemsCount || 2;
    const taskType = stemsCount === 4 ? "stem-separation-4" : "vocal-isolation";
    const job = this.jobManager.createJob(taskType, options.jobId);

    if (options.onProgress) {
      this.jobManager.subscribe(job.id, options.onProgress);
    }

    try {
      this.jobManager.updateProgress(job.id, 5, "DECODE", "جاري قراءة وفك تشفير الإشارة الصوتية...");

      // 1. Decode audio to Float32Array channels
      const audioBuffer = await decodeAudioSource(source);
      const sampleRate = audioBuffer.sampleRate;
      const duration = audioBuffer.duration;
      const numChannels = audioBuffer.numberOfChannels;

      this.jobManager.updateProgress(
        job.id,
        20,
        "PREPARE",
        `تم فك التشفير بنجاح (${duration.toFixed(1)} ثانية، ${sampleRate}Hz، ${numChannels > 1 ? "Stereo" : "Mono"})...`
      );

      // Extract raw channels
      const rawChannels: Float32Array[] = [];
      const transferableBuffers: ArrayBuffer[] = [];

      for (let ch = 0; ch < numChannels; ch++) {
        // Clone channel data so it can be transferred cleanly
        const channelClone = new Float32Array(audioBuffer.getChannelData(ch));
        rawChannels.push(channelClone);
        transferableBuffers.push(channelClone.buffer);
      }

      this.jobManager.updateProgress(
        job.id,
        35,
        "SEPARATING",
        `جاري فصل المسارات الصوتية (${stemsCount === 4 ? "4 مسارات كاملة" : "غناء وموسيقى"})...`
      );

      // 2. Offload to Web Worker with zero main-thread block
      const workerResult = await this.workerManager.runTask<{
        vocals: Float32Array[];
        instrumental: Float32Array[];
        additionalStems?: {
          drums?: Float32Array[];
          bass?: Float32Array[];
          other?: Float32Array[];
        };
        sampleRate: number;
      }>(
        {
          id: job.id,
          type: "stem-separation",
          sampleRate,
          channels: rawChannels,
          options: { stemsCount },
        },
        transferableBuffers
      );

      this.jobManager.updateProgress(job.id, 80, "ENCODING", "جاري ترميز ملفات الـ Stems بصيغة WAV عالية النقاء...");

      // 3. Encode stems to lossless 16-bit PCM WAV
      const vocalsBlob = encodeWavBlob(workerResult.vocals, sampleRate);
      const vocalsUrl = URL.createObjectURL(vocalsBlob);

      const instBlob = encodeWavBlob(workerResult.instrumental, sampleRate);
      const instUrl = URL.createObjectURL(instBlob);

      const vocalsStem: StemTrackOutput = {
        name: "Vocals (غناء منفصل)",
        stemType: "vocals",
        url: vocalsUrl,
        blob: vocalsBlob,
        duration,
        sampleRate,
        channels: workerResult.vocals.length,
      };

      const instStem: StemTrackOutput = {
        name: "Instrumental (موسيقى بدون غناء)",
        stemType: "instrumental",
        url: instUrl,
        blob: instBlob,
        duration,
        sampleRate,
        channels: workerResult.instrumental.length,
      };

      const result: StemSeparationResult = {
        vocals: vocalsStem,
        instrumental: instStem,
        duration,
        sampleRate,
        providerUsed: "local-worker-harmonic-spectral",
      };

      // Handle 4-stems if present
      if (stemsCount === 4 && workerResult.additionalStems) {
        result.additionalStems = {};
        if (workerResult.additionalStems.drums) {
          const drumsBlob = encodeWavBlob(workerResult.additionalStems.drums, sampleRate);
          result.additionalStems.drums = {
            name: "Drums (الإيقاع والدرامز)",
            stemType: "drums",
            url: URL.createObjectURL(drumsBlob),
            blob: drumsBlob,
            duration,
            sampleRate,
            channels: workerResult.additionalStems.drums.length,
          };
        }
        if (workerResult.additionalStems.bass) {
          const bassBlob = encodeWavBlob(workerResult.additionalStems.bass, sampleRate);
          result.additionalStems.bass = {
            name: "Bass (البيز والترددات المنخفضة)",
            stemType: "bass",
            url: URL.createObjectURL(bassBlob),
            blob: bassBlob,
            duration,
            sampleRate,
            channels: workerResult.additionalStems.bass.length,
          };
        }
        if (workerResult.additionalStems.other) {
          const otherBlob = encodeWavBlob(workerResult.additionalStems.other, sampleRate);
          result.additionalStems.other = {
            name: "Other Instruments (باقي الآلات والمؤثرات)",
            stemType: "other",
            url: URL.createObjectURL(otherBlob),
            blob: otherBlob,
            duration,
            sampleRate,
            channels: workerResult.additionalStems.other.length,
          };
        }
      }

      this.jobManager.completeJob(job.id, "تم فصل المسارات بنجاح بجودة عالية!");
      return result;
    } catch (err: any) {
      this.jobManager.failJob(job.id, err);
      throw err;
    }
  }
}
