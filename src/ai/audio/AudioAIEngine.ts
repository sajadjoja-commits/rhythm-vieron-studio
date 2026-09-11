/**
 * Master Audio AI Engine
 * Unified orchestrator for all local and remote AI audio operations.
 */

import { StemSeparationEngine } from "./engines/StemSeparationEngine";
import { NoiseReductionEngine } from "./engines/NoiseReductionEngine";
import { AudioAIModelRegistry } from "./AudioAIModelRegistry";
import { AudioAIJobManager, ManagedAudioJob } from "./AudioAIJobManager";
import {
  AudioAITaskType,
  AudioAIJobOptions,
  StemSeparationResult,
  DenoiseResult,
  AudioAIProgressCallback,
} from "./types";

export class AudioAIEngine {
  private static instance: AudioAIEngine;

  public readonly stemSeparator: StemSeparationEngine;
  public readonly noiseReducer: NoiseReductionEngine;
  public readonly registry: AudioAIModelRegistry;
  public readonly jobManager: AudioAIJobManager;

  private constructor() {
    this.stemSeparator = StemSeparationEngine.getInstance();
    this.noiseReducer = NoiseReductionEngine.getInstance();
    this.registry = AudioAIModelRegistry.getInstance();
    this.jobManager = AudioAIJobManager.getInstance();
  }

  public static getInstance(): AudioAIEngine {
    if (!AudioAIEngine.instance) {
      AudioAIEngine.instance = new AudioAIEngine();
    }
    return AudioAIEngine.instance;
  }

  /**
   * Separate vocals from instrumental
   */
  public async isolateVocals(
    source: File | Blob | ArrayBuffer | string,
    options?: AudioAIJobOptions
  ): Promise<StemSeparationResult> {
    return this.stemSeparator.separateStems(source, {
      ...options,
      stemsCount: 2,
    });
  }

  /**
   * Remove vocals to create karaoke / instrumental
   */
  public async removeVocals(
    source: File | Blob | ArrayBuffer | string,
    options?: AudioAIJobOptions
  ): Promise<StemSeparationResult> {
    return this.stemSeparator.separateStems(source, {
      ...options,
      stemsCount: 2,
    });
  }

  /**
   * 4-Stem separation into Vocals, Drums, Bass, and Other
   */
  public async separate4Stems(
    source: File | Blob | ArrayBuffer | string,
    options?: AudioAIJobOptions
  ): Promise<StemSeparationResult> {
    return this.stemSeparator.separateStems(source, {
      ...options,
      stemsCount: 4,
    });
  }

  /**
   * Real speech denoise
   */
  public async reduceNoise(
    source: File | Blob | ArrayBuffer | string,
    options?: AudioAIJobOptions
  ): Promise<DenoiseResult> {
    return this.noiseReducer.reduceNoise(source, options);
  }

  /**
   * Cancel an ongoing job
   */
  public cancel(jobId: string): boolean {
    return this.jobManager.cancelJob(jobId);
  }

  /**
   * Subscribe to progress of a job
   */
  public onProgress(jobId: string, callback: AudioAIProgressCallback): () => void {
    return this.jobManager.subscribe(jobId, callback);
  }
}

export const audioAIEngine = AudioAIEngine.getInstance();
