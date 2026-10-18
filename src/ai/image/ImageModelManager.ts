import { ModelStore, DownloadProgress } from '../models/ModelStore';
import { MODEL_CATALOG, getActiveModels } from '../models/models.catalog';
import { ModelManifest } from '../models/rmbg2.manifest';

export class ImageModelManager {
  private static instance: ImageModelManager | null = null;
  private modelStore = ModelStore.getInstance();
  private selectedModelId = 'mediapipe-selfie';

  private constructor() {}

  public static getInstance(): ImageModelManager {
    if (!ImageModelManager.instance) {
      ImageModelManager.instance = new ImageModelManager();
    }
    return ImageModelManager.instance;
  }

  public getAvailableModels(): ModelManifest[] {
    return getActiveModels();
  }

  public getSelectedModelId(): string {
    return this.selectedModelId;
  }

  public setSelectedModelId(id: string): void {
    if (MODEL_CATALOG[id] && MODEL_CATALOG[id].enabled) {
      this.selectedModelId = id;
    }
  }

  public async isModelReady(id: string): Promise<boolean> {
    return await this.modelStore.isModelCached(id);
  }

  public async ensureModel(
    id: string,
    onProgress?: (progress: DownloadProgress) => void,
    userSignal?: AbortSignal
  ): Promise<ArrayBuffer> {
    const manifest = MODEL_CATALOG[id];
    if (!manifest) {
      throw new Error(`Model ${id} not found in catalog`);
    }
    if (!manifest.enabled) {
      throw new Error(`Model ${id} is disabled. (${manifest.notes || ''})`);
    }

    if (!manifest.url) {
      throw new Error(`Model ${id} has no valid official download URL`);
    }

    return await this.modelStore.downloadModel(
      id,
      manifest.url,
      manifest.sha256,
      onProgress,
      userSignal
    );
  }

  public cancelDownload(id: string): void {
    this.modelStore.cancelDownload(id);
  }

  public async deleteModel(id: string): Promise<void> {
    await this.modelStore.deleteModel(id);
  }
}
