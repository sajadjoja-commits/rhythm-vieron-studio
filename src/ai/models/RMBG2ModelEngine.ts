import { ENABLE_RMBG, RMBG2_MANIFEST } from './rmbg2.manifest';

/**
 * RMBG2ModelEngine
 * 
 * Disabled behind ENABLE_RMBG constant.
 * RMBG-2.0 is licensed under CC BY-NC 4.0 (Non-commercial), and its weights
 * are heavy (176MB - 348MB) with conflicting specs across sources.
 */
export class RMBG2ModelEngine {
  private static instance: RMBG2ModelEngine | null = null;
  private isLoaded = false;

  private constructor() {
    if (!ENABLE_RMBG) {
      // Intentionally deactivated
    }
  }

  public static getInstance(): RMBG2ModelEngine {
    if (!RMBG2ModelEngine.instance) {
      RMBG2ModelEngine.instance = new RMBG2ModelEngine();
    }
    return RMBG2ModelEngine.instance;
  }

  public static isSupported(): boolean {
    return ENABLE_RMBG;
  }

  public async load(): Promise<void> {
    if (!ENABLE_RMBG) {
      throw new Error(
        `RMBG-2.0 model is disabled (ENABLE_RMBG = false). License is non-commercial (${RMBG2_MANIFEST.license}) and size exceeds constraints.`
      );
    }
    this.isLoaded = true;
  }

  public async infer(_inputTensor: unknown): Promise<Float32Array> {
    if (!ENABLE_RMBG || !this.isLoaded) {
      throw new Error('RMBG-2.0 engine is not enabled or loaded.');
    }
    throw new Error('RMBG-2.0 execution disabled.');
  }

  public dispose(): void {
    this.isLoaded = false;
  }
}
