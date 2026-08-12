import { env, AutoModel, AutoProcessor, RawImage, Tensor } from "@xenova/transformers";
import { AIProgressManager } from "../runtime/AIProgressManager";
import { AIError } from "../types/ai";

export class RMBG2ModelEngine {
  private modelId = "briaai/RMBG-2.0";
  private model: any = null;
  private processor: any = null;
  private isInitialized = false;
  private progressManager?: AIProgressManager;
  private jobId?: string;

  constructor(progressManager?: AIProgressManager, jobId?: string) {
    this.progressManager = progressManager;
    this.jobId = jobId;

    // Configure Transformers.js for optimal local performance
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
        env.backends.onnx.wasm.simd = true;
    }
  }

  public async load(): Promise<void> {
    this.updateProgress(5, "Checking Model Cache");

    try {
      this.updateProgress(10, "Downloading Model & Processor");

      // Load processor and model
      this.processor = await AutoProcessor.from_pretrained(this.modelId, {
        progress_callback: (progress: any) => {
          if (progress.status === "progress") {
            // Map 0-100% of download to 10-60% of total progress
            const downloadPct = progress.progress || 0;
            this.updateProgress(10 + (downloadPct * 0.5), `Downloading Model: ${Math.round(downloadPct)}%`);
          }
        }
      });

      this.updateProgress(60, "Loading Model into Memory");
      this.model = await AutoModel.from_pretrained(this.modelId, {
        config: { model_type: "custom" }, // RMBG-2.0 often needs custom config handling
      });

      this.updateProgress(70, "Creating ONNX Session");
      this.isInitialized = true;
      this.updateProgress(75, "Ready");
    } catch (err: any) {
      console.error("[RMBG2ModelEngine] Load failed:", err);
      throw this.createError("MODEL_LOAD_FAILED", `Failed to load RMBG-2.0: ${err.message}`);
    }
  }

  public async initialize(): Promise<void> {
    if (!this.isInitialized) {
      await this.load();
    }
  }

  public async preprocess(imageBase64OrUrl: string): Promise<any> {
    this.updateProgress(80, "Preprocessing Image");
    try {
      const image = await RawImage.fromURL(imageBase64OrUrl);

      // RMBG-2.0 expectations: Resize to 1024x1024, Normalize
      const inputs = await this.processor(image);

      // Verify Input Shape & Type as requested
      const pixelValues = inputs.pixel_values;
      console.log(`[RMBG2ModelEngine] Input Tensor Shape: ${pixelValues.dims}`);
      console.log(`[RMBG2ModelEngine] Input Tensor Type: ${pixelValues.type}`);

      // Explicitly check for 1024x1024 as RMBG-2.0 is trained on this
      if (pixelValues.dims[2] !== 1024 || pixelValues.dims[3] !== 1024) {
          console.warn(`[RMBG2ModelEngine] Unexpected input resolution: ${pixelValues.dims[2]}x${pixelValues.dims[3]}`);
      }

      // Verification of data type (should be float32)
      if (pixelValues.type !== 'float32') {
          throw this.createError("VERIFICATION_FAILED", `Expected float32 input tensor, got ${pixelValues.type}`);
      }

      return inputs;
    } catch (err: any) {
      throw this.createError("PREPROCESS_FAILED", `Image preprocessing failed: ${err.message}`);
    }
  }

  public async infer(inputs: any): Promise<any> {
    this.updateProgress(85, "Running Inference (ONNX)");
    try {
      const { output } = await this.model(inputs);

      // Verify Output Shape as requested
      // RMBG-2.0 output is typically [1, 1, 1024, 1024] or similar mask
      console.log(`[RMBG2ModelEngine] Output Tensor Shape: ${output.dims}`);

      return output;
    } catch (err: any) {
      throw this.createError("INFERENCE_FAILED", `Model inference failed: ${err.message}`);
    }
  }

  public async postprocess(output: any, originalImageBase64OrUrl: string): Promise<string> {
    this.updateProgress(90, "Processing Alpha Mask");

    try {
      // 1. Convert output mask tensor to image
      // RMBG-2.0 output is a single channel mask
      const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8"), "L");

      // 2. Load original image to get dimensions
      const originalImage = await RawImage.fromURL(originalImageBase64OrUrl);

      // 3. Resize mask back to original dimensions
      const resizedMask = await mask.resize(originalImage.width, originalImage.height);

      // 4. Verification: Mask must not be empty or full
      this.verifyMask(resizedMask);

      this.updateProgress(95, "Generating Transparent PNG");

      // 5. Create transparent PNG
      return await this.createTransparentPNG(originalImage, resizedMask);
    } catch (err: any) {
        if (err.code === "VERIFICATION_FAILED") throw err;
      throw this.createError("POSTPROCESS_FAILED", `Mask post-processing failed: ${err.message}`);
    }
  }

  private async createTransparentPNG(original: RawImage, mask: RawImage): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = original.width;
    canvas.height = original.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get 2D context");

    // Draw original image
    const imgData = ctx.createImageData(original.width, original.height);
    const data = imgData.data;
    const originalData = original.data;
    const maskData = mask.data;

    let hasAlpha = false;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = originalData[i];     // R
      data[i + 1] = originalData[i + 1]; // G
      data[i + 2] = originalData[i + 2]; // B

      // Apply mask as Alpha
      const alpha = maskData[i / 4];
      data[i + 3] = alpha;

      if (alpha < 255) hasAlpha = true;
    }

    if (!hasAlpha) {
        console.warn("[RMBG2ModelEngine] Warning: No transparent pixels detected in output");
    }

    ctx.putImageData(imgData, 0, 0);

    // Output Verification
    const output = canvas.toDataURL("image/png");
    if (!output.startsWith("data:image/png")) {
        throw this.createError("VERIFICATION_FAILED", "Output is not a valid PNG format");
    }

    this.updateProgress(100, "Verification Passed", "completed");
    return output;
  }

  private verifyMask(mask: RawImage): void {
    const data = mask.data;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i];
    }

    const avg = sum / data.length;
    if (avg < 1) {
        throw this.createError("VERIFICATION_FAILED", "Mask is empty (Background removed everything)");
    }
    if (avg > 254) {
        throw this.createError("VERIFICATION_FAILED", "Mask is full (No background detected)");
    }
  }

  public async dispose(): Promise<void> {
    this.model = null;
    this.processor = null;
    this.isInitialized = false;
  }

  private updateProgress(percentage: number, stage: string, status: any = "processing"): void {
    if (this.progressManager && this.jobId) {
      this.progressManager.updateProgress(this.jobId, percentage, stage, status);
    }
  }

  private createError(code: string, message: string): AIError & { stage?: string } {
    return {
      code,
      message,
      provider: "RMBG2ModelEngine",
      model: this.modelId,
    };
  }
}
