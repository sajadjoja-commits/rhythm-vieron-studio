import { AIBenchmarkResult } from "./types";

class BenchmarkRegistry {
  private static instance: BenchmarkRegistry;
  private records: Map<string, AIBenchmarkResult> = new Map();

  private constructor() {
    this.seedDefaultEntries();
  }

  public static getInstance(): BenchmarkRegistry {
    if (!BenchmarkRegistry.instance) {
      BenchmarkRegistry.instance = new BenchmarkRegistry();
    }
    return BenchmarkRegistry.instance;
  }

  private seedDefaultEntries(): void {
    // Official benchmark registry: unrun hardware paths are transparently marked NOT_MEASURED
    this.records.set("backgroundRemoval-android-mlkit", {
      feature: "backgroundRemoval",
      runtime: "android-mlkit-subject-segmentation",
      coldStartMs: 0,
      warmStartMs: 0,
      inferenceMs: 0,
      preprocessMs: 0,
      postprocessMs: 0,
      peakMemoryMB: 0,
      modelSizeMB: 0, // Dynamically loaded by Play Services (0MB APK size impact)
      runtimeSizeMB: 1.2,
      status: "NOT_MEASURED",
    });

    this.records.set("backgroundRemoval-web-mediapipe", {
      feature: "backgroundRemoval",
      runtime: "web-mediapipe-selfie-segmenter",
      coldStartMs: 0,
      warmStartMs: 0,
      inferenceMs: 0,
      preprocessMs: 0,
      postprocessMs: 0,
      peakMemoryMB: 0,
      modelSizeMB: 0.25,
      runtimeSizeMB: 0.94,
      status: "NOT_MEASURED",
    });

    this.records.set("whisper-stt-android-native", {
      feature: "speechToText",
      runtime: "android-whisper.cpp-arm64",
      coldStartMs: 0,
      warmStartMs: 0,
      inferenceMs: 0,
      preprocessMs: 0,
      postprocessMs: 0,
      peakMemoryMB: 0,
      modelSizeMB: 75.0, // GGML tiny/base
      runtimeSizeMB: 2.1,
      status: "NOT_MEASURED",
    });

    this.records.set("whisper-stt-web-onnx", {
      feature: "speechToText",
      runtime: "web-onnxruntime-wasm",
      coldStartMs: 0,
      warmStartMs: 0,
      inferenceMs: 0,
      preprocessMs: 0,
      postprocessMs: 0,
      peakMemoryMB: 0,
      modelSizeMB: 43.0,
      runtimeSizeMB: 26.0,
      status: "NOT_MEASURED",
    });

    this.records.set("audioStemSeparation-dsp", {
      feature: "audioStemSeparation",
      runtime: "web-audio-worker-dsp",
      coldStartMs: 0,
      warmStartMs: 0,
      inferenceMs: 0,
      preprocessMs: 0,
      postprocessMs: 0,
      peakMemoryMB: 0,
      modelSizeMB: 0,
      runtimeSizeMB: 0.01,
      status: "NOT_MEASURED",
    });
  }

  public recordMeasurement(
    key: string,
    measurement: Omit<AIBenchmarkResult, "status">
  ): void {
    this.records.set(key, {
      ...measurement,
      status: "MEASURED",
    });
  }

  public get(key: string): AIBenchmarkResult | undefined {
    return this.records.get(key);
  }

  public getAll(): AIBenchmarkResult[] {
    return Array.from(this.records.values());
  }
}

export const benchmarkRegistry = BenchmarkRegistry.getInstance();
