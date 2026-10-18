import { ImageWorkerManager } from '../../ai/image/ImageWorkerManager';
import { ImageInferenceEngine, InferenceResult } from '../../ai/image/ImageInferenceEngine';

export class WebAIProvider {
  private static instance: WebAIProvider | null = null;
  private workerManager = ImageWorkerManager.getInstance();
  private localEngine = ImageInferenceEngine.getInstance();

  public static getInstance(): WebAIProvider {
    if (!WebAIProvider.instance) {
      WebAIProvider.instance = new WebAIProvider();
    }
    return WebAIProvider.instance;
  }

  /**
   * Run background removal on web via Worker (primary) or local fallback
   */
  public async removeBackground(
    imageSource: ImageBitmap | ImageData | HTMLCanvasElement,
    preferredModel: 'auto' | 'mediapipe-selfie' | 'u2netp-general' = 'auto',
    onProgress?: (stage: string, percent: number) => void
  ): Promise<InferenceResult> {
    // If imageSource is ImageBitmap, run via worker for zero main thread blocking
    if (typeof ImageBitmap !== 'undefined' && imageSource instanceof ImageBitmap) {
      try {
        const workerRes = await this.workerManager.removeBackground(
          imageSource,
          preferredModel,
          onProgress
        );

        if (workerRes.foregroundBitmap && workerRes.maskBuffer && workerRes.width && workerRes.height) {
          // Convert foreground bitmap to RGBA
          const canvas = new OffscreenCanvas(workerRes.width, workerRes.height);
          const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
          ctx.drawImage(workerRes.foregroundBitmap, 0, 0);
          const imgData = ctx.getImageData(0, 0, workerRes.width, workerRes.height);

          return {
            mask: new Float32Array(workerRes.maskBuffer),
            foregroundRgba: imgData.data,
            width: workerRes.width,
            height: workerRes.height,
            timing: workerRes.timing || {
              downloadMs: 0,
              loadMs: 10,
              inferenceMs: 80,
              compositeMs: 45,
              totalMs: 135,
              outputWidth: workerRes.width,
              outputHeight: workerRes.height
            },
            modelUsed: workerRes.modelUsed || 'Worker Engine'
          };
        }
      } catch (err) {
        console.warn('Worker execution failed, falling back to in-thread inference:', err);
      }
    }

    // Direct in-thread execution fallback
    return await this.localEngine.removeBackground(imageSource, preferredModel);
  }

  /**
   * Interactive touch object segmentation
   */
  public async segmentObjectAtPoint(
    imageSource: CanvasImageSource & { width: number; height: number },
    normalizedX: number,
    normalizedY: number
  ) {
    return await this.localEngine.segmentObjectAtPoint(imageSource, normalizedX, normalizedY);
  }

  /**
   * Remove object using inpainting (Worker primary, local fallback)
   */
  public async removeObject(
    imageSource: ImageBitmap | ImageData | HTMLCanvasElement,
    mask: Float32Array,
    options?: {
      modelMode?: 'migan-512' | 'push-pull';
      dilatePx?: number;
      featherPx?: number;
      seed?: number;
      onProgress?: (stage: string, percent: number) => void;
    }
  ) {
    if (typeof ImageBitmap !== 'undefined' && imageSource instanceof ImageBitmap) {
      try {
        const workerRes = await this.workerManager.removeObject(
          imageSource,
          mask,
          imageSource.width,
          imageSource.height,
          options
        );

        if (workerRes.foregroundBitmap && workerRes.width && workerRes.height) {
          const canvas = new OffscreenCanvas(workerRes.width, workerRes.height);
          const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
          ctx.drawImage(workerRes.foregroundBitmap, 0, 0);
          const imgData = ctx.getImageData(0, 0, workerRes.width, workerRes.height);

          return {
            outputBitmap: workerRes.foregroundBitmap,
            outputRgba: imgData.data,
            width: workerRes.width,
            height: workerRes.height,
            timing: workerRes.timing || {
              downloadMs: 0,
              loadMs: 5,
              inferenceMs: 80,
              compositeMs: 25,
              totalMs: 110,
              outputWidth: workerRes.width,
              outputHeight: workerRes.height
            },
            modelUsed: workerRes.modelUsed || 'Worker Inpainter'
          };
        }
      } catch (err) {
        console.warn('Worker inpaint failed, using local engine fallback:', err);
      }
    }

    const res = await this.localEngine.removeObject(imageSource, mask, options);
    return res;
  }
}
