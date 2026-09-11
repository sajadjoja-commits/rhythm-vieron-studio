/**
 * Core Types for AI Audio & Music Architecture
 * Professional, typed abstractions for Local and Remote Audio AI processing.
 */

export type AudioAITaskType =
  | "vocal-isolation"
  | "music-removal"
  | "stem-separation-4"
  | "ai-denoise"
  | "silence-removal"
  | "audio-enhancement"
  | "key-pitch-detection"
  | "pitch-correction"
  | "music-generation"
  | "sfx-generation"
  | "tts"
  | "voice-clone";

export type AudioModelRuntime = "local-worker" | "local-onnx" | "remote-api";

export type AudioModelStatus =
  | "AVAILABLE"
  | "LOADING"
  | "READY"
  | "RUNNING"
  | "FAILED"
  | "NOT_INSTALLED";

export interface AudioModelManifest {
  id: string;
  name: string;
  version: string;
  runtime: AudioModelRuntime;
  approxSizeBytes: number;
  description: string;
  capabilities: AudioAITaskType[];
  isLocal: boolean;
  requiredApi?: "replicate" | "groq" | "supabase" | "elevenlabs";
}

export type AudioJobStatus =
  | "QUEUED"
  | "PREPARING"
  | "RUNNING"
  | "POST_PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface AudioAIProgress {
  jobId: string;
  taskType: AudioAITaskType;
  status: AudioJobStatus;
  percent: number; // 0 to 100
  stage: string;
  message: string;
  processedSeconds?: number;
  totalSeconds?: number;
}

export type AudioAIProgressCallback = (progress: AudioAIProgress) => void;

export interface AudioAIJobOptions {
  jobId?: string;
  signal?: AbortSignal;
  onProgress?: AudioAIProgressCallback;
  preferLocal?: boolean;
  sampleRate?: number;
  channels?: number;
  // Specific settings
  denoiseStrength?: number; // 0.0 to 1.0
  normalizeLoudness?: boolean; // Default true
  targetDbfs?: number; // Default -14 LUFS / dBFS
  stemsCount?: 2 | 4; // 2 (Vocals/Instrumental) or 4 (Vocals/Drums/Bass/Other)
  // Silence remover settings
  vadThreshold?: number; // 0.0 to 1.0 (default 0.5)
  minSilenceDurationMs?: number; // default 300ms
  // Pitch & Key settings
  targetScale?: "chromatic" | "major" | "minor";
  retuneSpeed?: number; // 0.0 (fastest/robotic) to 1.0 (natural)
}

export interface StemTrackOutput {
  name: string;
  stemType: "vocals" | "instrumental" | "drums" | "bass" | "other";
  url: string;
  blob: Blob;
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface StemSeparationResult {
  vocals: StemTrackOutput;
  instrumental: StemTrackOutput;
  additionalStems?: {
    drums?: StemTrackOutput;
    bass?: StemTrackOutput;
    other?: StemTrackOutput;
  };
  duration: number;
  sampleRate: number;
  providerUsed: string;
}

export interface DenoiseResult {
  audioUrl: string;
  audioBlob: Blob;
  duration: number;
  sampleRate: number;
  channels: number;
  noiseProfileDetected?: string;
  snrImprovementEstDb?: number;
  providerUsed: string;
}

export interface SilenceRegion {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface SilenceRemovalResult {
  processedUrl: string;
  processedBlob: Blob;
  originalDuration: number;
  newDuration: number;
  silenceRegionsRemoved: SilenceRegion[];
  timeSavedSeconds: number;
}

export interface KeyPitchDetectionResult {
  detectedKey: string; // e.g. "C Major", "A Minor"
  scale: "major" | "minor";
  keyConfidence: number; // 0.0 to 1.0
  estimatedBpm: number;
  averagePitchHz: number;
  pitchRangeHz: { min: number; max: number };
  dominantNote: string; // e.g. "A4"
  dominantMidi: number; // e.g. 69
}
