/**
 * Phase 10.1: Generative Expand / Outpainting Architecture Preparation
 * 
 * Strict Reality Rule:
 * - NO fake outpainting (stretching, mirroring, edge duplication, repeating pixels, or blur extension).
 * - Status MUST be GENERATIVE_EXPAND_NOT_AVAILABLE until a real generative model is integrated in Phase 11.
 */

export interface CanvasExpansion {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface AspectRatioPreset {
  id: "16:9_to_9:16" | "9:16_to_16:9" | "square_to_portrait" | "square_to_landscape" | "custom";
  name: string;
  targetRatio: number; // width / height
}

export interface GenerativeExpandOptions {
  steps?: number;
  strength?: number;
  seed?: number;
  guidance?: number;
  prompt?: string;
  preserveOriginalSeams?: boolean;
  signal?: AbortSignal;
}

export interface GeneratedImageResult {
  outputDataUrl: string;
  outputBlob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  expansion: CanvasExpansion;
  modelId: string;
  engine: string;
  timings: {
    generationMs: number;
    blendingMs: number;
    totalMs: number;
  };
}

export interface GenerativeImageRuntime {
  readonly id: string;
  readonly name: string;

  /**
   * Checks if a real generative model is available and supported on this hardware
   */
  isAvailable(): Promise<boolean>;

  /**
   * Loads real generative diffusion / outpainting weights
   */
  loadModel(modelId: string): Promise<void>;

  /**
   * Executes genuine generative outpainting (synthesizes new content in expanded areas)
   */
  expandImage(
    image: string | Blob | File | HTMLImageElement | HTMLCanvasElement,
    canvas: CanvasExpansion,
    mask?: string | Blob | ImageData,
    options?: GenerativeExpandOptions
  ): Promise<GeneratedImageResult>;

  /**
   * Releases generative weights from RAM
   */
  unloadModel(): Promise<void>;
}
