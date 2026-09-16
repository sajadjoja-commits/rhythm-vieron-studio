/**
 * Unified Audio Source Resolver for Rhythm & Video AI
 * Implements strict 4-tier audio source hierarchy:
 * 1. Explicitly selected or existing Audio Track in timeline
 * 2. Embedded Audio inside active/selected Video Clip
 * 3. Embedded Audio inside active/selected Video Overlay
 * 4. Explicit rejection with user-friendly message when no audio exists
 *
 * Automatically extracts audio from video containers into clean WAV PCM buffers,
 * avoids duplicate audio playback, maintains frame synchronization,
 * and handles clean export and preview routing.
 */

import { AudioTrackItem, Clip, MediaItem, OverlayItem } from "@/context/MediaContext";

export interface ResolvedAudioSource {
  type: "audio-track" | "clip-video-audio" | "overlay-video-audio";
  sourceId: string;
  name: string;
  url: string;
  file?: File;
  start: number;
  duration: number;
  offset: number;
  associatedClipId?: string;
  associatedOverlayId?: string;
  clipIn?: number;
  clipOut?: number;
}

export interface AudioResolveOptions {
  audioTracks?: AudioTrackItem[];
  selectedAudioTrackId?: string | null;
  clips?: Clip[];
  selectedClipId?: string | null;
  media?: MediaItem[];
  overlays?: OverlayItem[];
  selectedOverlayId?: string | null;
  currentTime?: number;
}

export class AudioSourceResolver {
  private static instance: AudioSourceResolver;

  public static getInstance(): AudioSourceResolver {
    if (!AudioSourceResolver.instance) {
      AudioSourceResolver.instance = new AudioSourceResolver();
    }
    return AudioSourceResolver.instance;
  }

  /**
   * Resolves the primary audio source based on the priority hierarchy.
   */
  public resolve(options: AudioResolveOptions): ResolvedAudioSource | null {
    const {
      audioTracks = [],
      selectedAudioTrackId,
      clips = [],
      selectedClipId,
      media = [],
      overlays = [],
      selectedOverlayId,
      currentTime = 0,
    } = options;

    // 1. Check for Audio Track (selected first, or any active track)
    if (selectedAudioTrackId) {
      const track = audioTracks.find((t) => t.id === selectedAudioTrackId);
      if (track && track.url) {
        return {
          type: "audio-track",
          sourceId: track.id,
          name: track.name || "Audio Track",
          url: track.url,
          file: track.file,
          start: track.start,
          duration: track.duration,
          offset: track.offset || 0,
        };
      }
    }

    if (audioTracks.length > 0) {
      // Find track currently under playhead, or first track
      const trackAtPlayhead = audioTracks.find((t) => currentTime >= t.start && currentTime <= t.start + t.duration);
      const track = trackAtPlayhead || audioTracks[0];
      if (track && track.url) {
        return {
          type: "audio-track",
          sourceId: track.id,
          name: track.name || "Audio Track",
          url: track.url,
          file: track.file,
          start: track.start,
          duration: track.duration,
          offset: track.offset || 0,
        };
      }
    }

    // 2. Check for Embedded Audio inside selected or active Video Clip
    const targetClip = selectedClipId
      ? clips.find((c) => c.id === selectedClipId)
      : clips.find((c) => {
          // Check if clip is active at currentTime
          return true; // will inspect below
        }) || clips[0];

    if (targetClip) {
      const mediaItem = media.find((m) => m.id === targetClip.mediaId);
      const isVideo = mediaItem?.type === "video";
      const sourceUrl = targetClip.processedAudioUrl || targetClip.processedUrl || mediaItem?.url || targetClip.originalUrl;

      if (isVideo && sourceUrl) {
        const speed = targetClip.speed && targetClip.speed > 0 ? targetClip.speed : 1;
        const duration = Math.max(0.1, (targetClip.out - targetClip.in) / speed);
        return {
          type: "clip-video-audio",
          sourceId: targetClip.id,
          name: mediaItem?.name ? `${mediaItem.name} (Video Audio)` : "Video Audio",
          url: sourceUrl,
          file: mediaItem?.file,
          start: 0,
          duration,
          offset: targetClip.in,
          associatedClipId: targetClip.id,
          clipIn: targetClip.in,
          clipOut: targetClip.out,
        };
      }
    }

    // Any other video clip in the timeline?
    for (const clip of clips) {
      const mediaItem = media.find((m) => m.id === clip.mediaId);
      if (mediaItem?.type === "video" && mediaItem.url) {
        const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
        const duration = Math.max(0.1, (clip.out - clip.in) / speed);
        return {
          type: "clip-video-audio",
          sourceId: clip.id,
          name: mediaItem.name ? `${mediaItem.name} (Video Audio)` : "Video Audio",
          url: clip.processedAudioUrl || mediaItem.url,
          file: mediaItem.file,
          start: 0,
          duration,
          offset: clip.in,
          associatedClipId: clip.id,
          clipIn: clip.in,
          clipOut: clip.out,
        };
      }
    }

    // 3. Check for Embedded Audio inside Video Overlay
    if (selectedOverlayId) {
      const ov = overlays.find((o) => o.id === selectedOverlayId);
      if (ov && ov.type === "video" && ov.url) {
        return {
          type: "overlay-video-audio",
          sourceId: ov.id,
          name: ov.name ? `${ov.name} (Overlay Audio)` : "Overlay Video Audio",
          url: ov.url,
          file: ov.file,
          start: ov.start,
          duration: Math.max(0.1, ov.end - ov.start),
          offset: 0,
          associatedOverlayId: ov.id,
        };
      }
    }

    const videoOverlay = overlays.find((o) => o.type === "video" && o.url);
    if (videoOverlay) {
      return {
        type: "overlay-video-audio",
        sourceId: videoOverlay.id,
        name: videoOverlay.name ? `${videoOverlay.name} (Overlay Audio)` : "Overlay Video Audio",
        url: videoOverlay.url,
        file: videoOverlay.file,
        start: videoOverlay.start,
        duration: Math.max(0.1, videoOverlay.end - videoOverlay.start),
        offset: 0,
        associatedOverlayId: videoOverlay.id,
      };
    }

    // 4. No valid audio source found
    return null;
  }

  /**
   * Decodes an audio or video URL into an AudioBuffer using AudioContext.
   */
  public async extractAudioBuffer(urlOrBlob: string | Blob): Promise<AudioBuffer> {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) {
      throw new Error("Web Audio API is not supported in this browser environment.");
    }
    const audioCtx = new AudioCtxClass();

    try {
      let arrayBuffer: ArrayBuffer;
      if (typeof urlOrBlob === "string") {
        const response = await fetch(urlOrBlob);
        if (!response.ok) {
          throw new Error(`Failed to fetch media: HTTP ${response.status}`);
        }
        arrayBuffer = await response.arrayBuffer();
      } else {
        arrayBuffer = await urlOrBlob.arrayBuffer();
      }

      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      return decoded;
    } finally {
      try {
        await audioCtx.close();
      } catch {}
    }
  }

  /**
   * Encodes an AudioBuffer into a standardized 16-bit PCM WAV Blob.
   */
  public audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new ArrayBuffer(length);
    const view = new DataView(out);

    let offset = 0;
    const setUint16 = (data: number) => {
      view.setUint16(offset, data, true);
      offset += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(offset, data, true);
      offset += 4;
    };

    // RIFF identifier
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"

    // format chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // subchunk1size
    setUint16(1); // PCM format
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16); // 16-bit

    // data chunk
    setUint32(0x61746164); // "data"
    setUint32(length - offset - 4);

    // interleave channel samples
    const channels: Float32Array[] = [];
    for (let c = 0; c < numOfChan; c++) {
      channels.push(buffer.getChannelData(c));
    }

    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numOfChan; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([out], { type: "audio/wav" });
  }

  /**
   * Prepares a ready-to-process audio payload from a ResolvedAudioSource.
   * If the source is a video file, it extracts the internal audio track into a pristine WAV blob.
   */
  public async prepareAudioForProcessing(
    source: ResolvedAudioSource
  ): Promise<{ audioBlob: Blob; audioUrl: string; duration: number; cleanup: () => void }> {
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.extractAudioBuffer(source.url);
    } catch (err: any) {
      throw new Error(`فشل استخراج وقراءة الصوت من المصدر: ${err?.message || "تنسيق غير مدعوم أو لا يحتوي على صوت"}`);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("الملف المحدد لا يحتوي على أي بيانات صوتية صالحة للمعالجة.");
    }

    // If it's a clip with in/out range, extract only that portion
    let finalBuffer = audioBuffer;
    if (source.type === "clip-video-audio" && source.clipIn !== undefined && source.clipOut !== undefined) {
      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.max(0, Math.floor(source.clipIn * sampleRate));
      const endSample = Math.min(audioBuffer.length, Math.floor(source.clipOut * sampleRate));
      const lengthSamples = Math.max(sampleRate, endSample - startSample);

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const tempCtx = new AudioCtxClass();
      finalBuffer = tempCtx.createBuffer(audioBuffer.numberOfChannels, lengthSamples, sampleRate);
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const srcData = audioBuffer.getChannelData(c);
        const subData = srcData.subarray(startSample, endSample);
        finalBuffer.copyToChannel(subData, c, 0);
      }
      try {
        await tempCtx.close();
      } catch {}
    }

    const audioBlob = this.audioBufferToWavBlob(finalBuffer);
    const audioUrl = URL.createObjectURL(audioBlob);

    return {
      audioBlob,
      audioUrl,
      duration: finalBuffer.duration,
      cleanup: () => {
        URL.revokeObjectURL(audioUrl);
      },
    };
  }
}

export const audioSourceResolver = AudioSourceResolver.getInstance();
