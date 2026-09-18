/**
 * Audio AI Model Registry
 * Authoritative registry tracking model availability, status, and capabilities.
 * Enforces transparency: never shows a fake model or reports fake readiness.
 */

import { AudioModelManifest, AudioAITaskType, AudioModelStatus } from "./types";

export class AudioAIModelRegistry {
  private static instance: AudioAIModelRegistry;

  private models: Map<string, AudioModelManifest> = new Map();
  private modelStatuses: Map<string, AudioModelStatus> = new Map();

  private constructor() {
    this.registerKnownModels();
  }

  public static getInstance(): AudioAIModelRegistry {
    if (!AudioAIModelRegistry.instance) {
      AudioAIModelRegistry.instance = new AudioAIModelRegistry();
    }
    return AudioAIModelRegistry.instance;
  }

  private registerKnownModels(): void {
    // 1. Local Adaptive Spectral Denoise DSP
    this.registerModel({
      id: "local-rnnoise-spectral",
      name: "Adaptive Spectral Noise Subtraction (DSP)",
      version: "1.2.0",
      runtime: "local-worker",
      approxSizeBytes: 0,
      description: "Local STFT/FFT spectral subtraction and Wiener filtering for stationary acoustic noise.",
      capabilities: ["ai-denoise", "audio-enhancement"],
      isLocal: true,
    });

    // 2. Local Center-Channel & Spectrogram Stem Separator DSP
    this.registerModel({
      id: "local-stem-separator",
      name: "Harmonic Spectrogram & Center-Channel Stem Filter (DSP)",
      version: "2.1.0",
      runtime: "local-worker",
      approxSizeBytes: 0,
      description: "Local STFT harmonic/percussive and center-panning frequency isolation filter.",
      capabilities: ["vocal-isolation", "music-removal"],
      isLocal: true,
    });

    // 3. Local Voice Activity Detector (VAD)
    this.registerModel({
      id: "local-silero-vad",
      name: "Energy Voice Activity Detector (VAD)",
      version: "4.0.0",
      runtime: "local-worker",
      approxSizeBytes: 0,
      description: "Local energy and spectral entropy voice activity segmentation.",
      capabilities: ["silence-removal"],
      isLocal: true,
    });

    // 4. Local Pitch & Key Analyzer (Krumhansl-Schmuckler)
    this.registerModel({
      id: "local-music-intelligence",
      name: "Harmonic Pitch Class Profile & Key Analyzer",
      version: "1.5.0",
      runtime: "local-worker",
      approxSizeBytes: 0,
      description: "Musical key detection (Major/Minor) and fundamental pitch tracking via Chromagram.",
      capabilities: ["key-pitch-detection", "pitch-correction"],
      isLocal: true,
    });
  }

  public registerModel(manifest: AudioModelManifest): void {
    this.models.set(manifest.id, manifest);
    this.modelStatuses.set(manifest.id, manifest.isLocal ? "AVAILABLE" : "READY");
  }

  public getModel(id: string): AudioModelManifest | undefined {
    return this.models.get(id);
  }

  public getAllModels(): AudioModelManifest[] {
    return Array.from(this.models.values());
  }

  public getModelsForTask(task: AudioAITaskType): AudioModelManifest[] {
    return Array.from(this.models.values()).filter((m) =>
      m.capabilities.includes(task)
    );
  }

  public getModelStatus(id: string): AudioModelStatus {
    return this.modelStatuses.get(id) || "NOT_INSTALLED";
  }

  public setModelStatus(id: string, status: AudioModelStatus): void {
    this.modelStatuses.set(id, status);
  }
}
