import * as ort from 'onnxruntime-web';

// Configure onnxruntime-web wasm paths
if (typeof window !== 'undefined' || typeof self !== 'undefined') {
  try {
    ort.env.wasm.numThreads = 2;
    ort.env.wasm.simd = true;
  } catch {
    // Ignore in unsupported environments
  }
}

export interface ONNXRunResult {
  mask: Float32Array;
  width: number;
  height: number;
  inferenceTimeMs: number;
}

export class ONNXModelLoader {
  private session: ort.InferenceSession | null = null;
  private modelId = '';

  /**
   * Load ONNX session from ArrayBuffer
   */
  public async loadFromBuffer(buffer: ArrayBuffer, modelId: string): Promise<void> {
    this.modelId = modelId;
    const options: ort.InferenceSession.SessionOptions = {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    };

    this.session = await ort.InferenceSession.create(buffer, options);
  }

  public isLoaded(): boolean {
    return this.session !== null;
  }

  public getLoadedModelId(): string {
    return this.modelId;
  }

  /**
   * Run inference on input image data for U2Netp / general models
   * Expects input resized to model resolution (e.g. 320x320)
   */
  public async runInference(
    inputRgba: Uint8ClampedArray,
    inW: number,
    inH: number
  ): Promise<ONNXRunResult> {
    if (!this.session) {
      throw new Error('ONNX Session not loaded');
    }

    const t0 = performance.now();

    // Prepare NCHW float32 tensor [1, 3, inH, inW]
    // Normalized: (x / 255.0 - 0.485) / 0.229 for ImageNet-style models
    const channelSize = inW * inH;
    const floatData = new Float32Array(3 * channelSize);

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    for (let i = 0; i < channelSize; i++) {
      const p = i * 4;
      const r = inputRgba[p] / 255.0;
      const g = inputRgba[p + 1] / 255.0;
      const b = inputRgba[p + 2] / 255.0;

      floatData[i] = (r - mean[0]) / std[0];
      floatData[channelSize + i] = (g - mean[1]) / std[1];
      floatData[2 * channelSize + i] = (b - mean[2]) / std[2];
    }

    const inputName = this.session.inputNames[0] || 'input';
    const tensor = new ort.Tensor('float32', floatData, [1, 3, inH, inW]);

    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputName] = tensor;

    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    const outputTensor = results[outputName];
    const rawData = outputTensor.data as Float32Array;

    // Apply sigmoid to output values if necessary, normalized [0, 1]
    const mask = new Float32Array(channelSize);
    for (let i = 0; i < channelSize; i++) {
      const val = rawData[i];
      // Sigmoid: 1 / (1 + exp(-x))
      mask[i] = 1 / (1 + Math.exp(-val));
    }

    const inferenceTimeMs = performance.now() - t0;

    return {
      mask,
      width: inW,
      height: inH,
      inferenceTimeMs
    };
  }

  public dispose(): void {
    if (this.session) {
      try {
        this.session.release();
      } catch {
        // Ignore
      }
      this.session = null;
    }
  }
}
