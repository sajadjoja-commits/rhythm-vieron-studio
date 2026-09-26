/**
 * Phase 10: Unified AI Model Runtime Architecture
 * 
 * Clean, lightweight abstraction for on-device AI model execution:
 * - Deterministic lifecycle: load, infer, cancel, unload
 * - Memory telemetry: heap and resident memory tracking
 * - Hardware acceleration capabilities inspection
 */

export interface ModelMemoryUsage {
  heapMB: number;
  residentMB?: number;
}

export interface ModelCapabilities {
  framework: string;
  accelerator: string;
  precision: string;
  maxBatchSize?: number;
  supportedInputTypes: string[];
}

export interface AIModelRuntime<TInput = any, TOutput = any, TOptions = any> {
  readonly id: string;
  readonly name: string;

  /**
   * Loads model weights and initializes execution session
   */
  load(modelPathOrBuffer?: string | ArrayBuffer): Promise<void>;

  /**
   * Frees allocated session, tensors, and native memory
   */
  unload(): Promise<void>;

  /**
   * Indicates whether the model session is loaded and ready for inference
   */
  isLoaded(): boolean;

  /**
   * Runs model inference with given input and options
   */
  infer(input: TInput, options?: TOptions): Promise<TOutput>;

  /**
   * Responsive cancellation of ongoing inference
   */
  cancel(): void;

  /**
   * Reports current memory footprint of model session
   */
  getMemoryUsage(): ModelMemoryUsage;

  /**
   * Reports framework, accelerator backend, and execution precision
   */
  getCapabilities(): ModelCapabilities;
}
