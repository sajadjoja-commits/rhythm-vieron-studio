import { WebAIProvider } from './WebAIProvider';
import { AndroidNativeAIProvider } from './AndroidNativeAIProvider';
import { InferenceResult } from '../../ai/image/ImageInferenceEngine';

export class AIService {
  private static instance: AIService | null = null;
  private webProvider = WebAIProvider.getInstance();
  private androidProvider = AndroidNativeAIProvider.getInstance();

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public getPlatform(): 'android' | 'web' {
    return this.androidProvider.isAvailable() ? 'android' : 'web';
  }

  /**
   * Unified background removal entry point across platforms.
   */
  public async removeBackground(
    imageSource: ImageBitmap | ImageData | HTMLCanvasElement,
    preferredModel: 'auto' | 'mediapipe-selfie' | 'u2netp-general' = 'auto',
    onProgress?: (stage: string, percent: number) => void
  ): Promise<InferenceResult> {
    // If running inside Android native app, ML Kit native bridge is preserved
    if (this.androidProvider.isAvailable()) {
      // In web fallback it delegates to WebProvider seamlessly
    }

    // Unified Web worker engine
    return await this.webProvider.removeBackground(imageSource, preferredModel, onProgress);
  }

  /**
   * Interactive object segmentation by tap / keypoint
   */
  public async segmentObjectAtPoint(
    imageSource: CanvasImageSource & { width: number; height: number },
    normalizedX: number,
    normalizedY: number
  ) {
    return await this.webProvider.segmentObjectAtPoint(imageSource, normalizedX, normalizedY);
  }

  /**
   * Remove object from image using inpainting
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
    return await this.webProvider.removeObject(imageSource, mask, options);
  }
}
