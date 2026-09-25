/**
 * Phase 9: Native Waveform Service & Amplitude Engine
 * 
 * Generates compact downsampled audio waveforms for timeline rendering.
 * - Extracts amplitude envelopes natively without passing multi-megabyte raw PCM across the bridge.
 * - Produces normalized amplitude buckets [0.0 - 1.0] for direct SVG/Canvas rendering.
 * - Caches waveforms in memory and persistent storage.
 * - Includes Web Audio API fallback for desktop browsers.
 */

import { MediaService } from "./MediaService";
import { WaveformOptions, WaveformResult } from "./types";

export class WaveformService {
  private static instance: WaveformService;
  private readonly memoryCache: Map<string, WaveformResult> = new Map();
  private readonly maxCacheEntries = 100;

  private constructor() {}

  public static getInstance(): WaveformService {
    if (!WaveformService.instance) {
      WaveformService.instance = new WaveformService();
    }
    return WaveformService.instance;
  }

  public generateCacheKey(sourceId: string, samplesCount = 100): string {
    const cleanId = sourceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-64);
    return `wave_${cleanId}_${samplesCount}_v1`;
  }

  /**
   * Generates or retrieves cached waveform for an audio/video source.
   */
  public async getWaveform(
    source: string | File | Blob,
    options?: WaveformOptions
  ): Promise<WaveformResult> {
    const samplesCount = options?.samplesCount ?? 100;
    const sourceIdentifier =
      typeof source === "string"
        ? source
        : (source as any).nativePath || (source as any).name || (source as any).size?.toString() || "audio";

    const cacheKey = this.generateCacheKey(sourceIdentifier, samplesCount);

    // 1. Check in-memory cache
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // 2. Delegate to MediaService (Native on Android, Web Audio API fallback on Web)
    const mediaService = MediaService.getInstance();
    const result = await mediaService.generateWaveform(source, {
      samplesCount,
      ...options,
    });

    // 3. Store in memory cache
    if (this.memoryCache.size >= this.maxCacheEntries) {
      const oldest = this.memoryCache.keys().next().value;
      if (oldest) this.memoryCache.delete(oldest);
    }
    this.memoryCache.set(cacheKey, result);

    return result;
  }

  /**
   * Clear in-memory waveform cache
   */
  public clearMemoryCache(): void {
    this.memoryCache.clear();
  }
}

export const waveformService = WaveformService.getInstance();
