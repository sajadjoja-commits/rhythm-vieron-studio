import { Capacitor } from "@capacitor/core";
import { getVireonSTTPlugin } from "./AndroidCaptionProvider";

export interface WhisperModelMetadata {
  id: string;
  name: string;
  fileName: string;
  format: string;
  language: string;
  version: string;
  isDefault: boolean;
  isAvailable: boolean;
  status: "ready" | "in_assets" | "not_found" | "invalid" | "not_downloaded";
  size: number;
  storagePath?: string;
}

/**
 * NativeWhisperModelManager
 * 
 * TypeScript bridge interface to the Android Native WhisperModelManager.
 * Exposes model discovery, validation status, and metadata to the React UI.
 * 
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - NO binary model data or buffers are ever transmitted across the JavaScript bridge.
 * - Only lightweight JSON metadata objects are returned.
 * - Model discovery, verification (GGML magic), and on-device storage resolution occur exclusively in Native Java/C++.
 */
export class NativeWhisperModelManager {
  private static instance: NativeWhisperModelManager;

  public static getInstance(): NativeWhisperModelManager {
    if (!NativeWhisperModelManager.instance) {
      NativeWhisperModelManager.instance = new NativeWhisperModelManager();
    }
    return NativeWhisperModelManager.instance;
  }

  /**
   * Check if native platform and plugin are accessible
   */
  public isSupported(): boolean {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("VireonSTT")
    );
  }

  /**
   * Retrieve all registered Whisper models and their current on-device availability status
   */
  public async getModels(): Promise<WhisperModelMetadata[]> {
    if (!this.isSupported()) {
      return [
        {
          id: "whisper-tiny",
          name: "Whisper Tiny (Web / Fallback)",
          fileName: "ggml-tiny.bin",
          format: "ggml",
          language: "multilingual",
          version: "1.0",
          isDefault: true,
          isAvailable: true,
          status: "ready",
          size: 77691713,
        },
      ];
    }

    try {
      const plugin = getVireonSTTPlugin();
      const res = await plugin.getModels();
      return Array.isArray(res?.models) ? res.models : [];
    } catch (err) {
      console.warn("[NativeWhisperModelManager] Failed to fetch models:", err);
      return [];
    }
  }

  /**
   * Get metadata and readiness for a specific model ID
   */
  public async getModelInfo(modelId: string = "whisper-tiny"): Promise<WhisperModelMetadata | null> {
    if (!this.isSupported()) {
      const models = await this.getModels();
      return models.find((m) => m.id === modelId) || null;
    }

    try {
      const plugin = getVireonSTTPlugin();
      const res = await plugin.getModelInfo({ modelId });
      return res?.model || null;
    } catch (err) {
      console.warn(`[NativeWhisperModelManager] Failed to get model info for ${modelId}:`, err);
      return null;
    }
  }

  /**
   * Check if a specific model is ready on the device
   */
  public async isModelAvailable(modelId: string = "whisper-tiny"): Promise<boolean> {
    if (!this.isSupported()) {
      return true; // Web fallback is assumed available
    }

    try {
      const plugin = getVireonSTTPlugin();
      const res = await plugin.isModelAvailable({ modelId });
      return Boolean(res?.available);
    } catch {
      return false;
    }
  }

  /**
   * Get textual status of a model (e.g. "ready", "in_assets", "not_found", "invalid")
   */
  public async getModelStatus(modelId: string = "whisper-tiny"): Promise<string> {
    if (!this.isSupported()) {
      return "ready";
    }

    try {
      const plugin = getVireonSTTPlugin();
      const res = await plugin.isModelAvailable({ modelId });
      return res?.status || "not_found";
    } catch {
      return "not_found";
    }
  }

  /**
   * Reclaim memory by freeing any cached native Whisper context in the background
   */
  public async releaseModel(): Promise<boolean> {
    if (!this.isSupported()) {
      return true;
    }

    try {
      const plugin = getVireonSTTPlugin();
      const res = await plugin.releaseModel();
      return Boolean(res?.released);
    } catch {
      return false;
    }
  }
}

export const whisperModelManager = NativeWhisperModelManager.getInstance();
