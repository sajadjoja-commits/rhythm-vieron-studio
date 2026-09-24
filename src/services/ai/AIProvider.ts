import {
  AICapabilities,
  ImageSegmentationOptions,
  ImageSegmentationResult,
  FaceDetectionResult,
  AudioTranscriptionOptions,
  AudioTranscriptionResult,
  AIModelStatus,
} from "./types";

export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  readonly platform: "android" | "web";

  isAvailable(): Promise<boolean>;
  getCapabilities(): Promise<AICapabilities>;
  getModelStatus(modelId: string): Promise<AIModelStatus>;

  removeBackground(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult>;

  segmentImage(
    imageInput: string | Blob | File,
    options?: ImageSegmentationOptions
  ): Promise<ImageSegmentationResult>;

  detectFaces(
    imageInput: string | Blob | File,
    options?: { signal?: AbortSignal }
  ): Promise<FaceDetectionResult>;

  transcribe(
    audioInput: string | Blob | File,
    options?: AudioTranscriptionOptions
  ): Promise<AudioTranscriptionResult>;

  cancel(operationId: string): Promise<boolean>;
}
