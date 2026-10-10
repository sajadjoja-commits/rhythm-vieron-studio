import type { AudioTrackItem, Clip, MediaItem, OverlayItem } from "@/context/MediaContext";

export interface AudioUrlCollectionInput {
  clips: Pick<Clip, "mediaId" | "processedAudioUrl" | "muteOriginalAudio" | "volume" | "keyframes" | "in" | "out">[];
  media: Pick<MediaItem, "id" | "url" | "type">[];
  audioTracks: Pick<AudioTrackItem, "url" | "muted" | "volume" | "duration">[];
  overlays: Pick<OverlayItem, "url" | "type" | "muted" | "volume" | "start" | "end">[];
  videoMuted: boolean;
  videoVolume: number;
}

/**
 * Returns whether the timeline has any potentially audible audio sources.
 */
export function hasAudibleExportSources(input: AudioUrlCollectionInput): boolean {
  return collectRequiredAudioUrls(input).length > 0;
}

export function collectAudioUrls(input: AudioUrlCollectionInput): string[] {
  return collectRequiredAudioUrls(input);
}

/**
 * Pure helper that collects only the deduplicated audio URLs that are actually audible
 * and required by the offline audio renderer.
 * Avoids fetching/decoding muted tracks, unused original video URLs when processedAudioUrl exists,
 * or video clip audio when videoMuted is true.
 */
export function collectRequiredAudioUrls(input: AudioUrlCollectionInput): string[] {
  const { clips, media, audioTracks, overlays, videoMuted, videoVolume } = input;
  const mediaById = new Map<string, Pick<MediaItem, "id" | "url" | "type">>();
  for (const m of media) {
    if (m && m.id) {
      mediaById.set(m.id, m);
    }
  }

  const urls = new Set<string>();

  // 1. Background music / voiceover tracks that are not muted and have positive volume & duration
  for (const track of audioTracks) {
    if (!track || !track.url) continue;
    if (track.muted) continue;
    if (track.volume !== undefined && track.volume <= 0) continue;
    if (track.duration !== undefined && track.duration <= 0) continue;
    urls.add(track.url);
  }

  // 2. Video clips audio (only when master video audio is not muted and has positive volume)
  if (!videoMuted && videoVolume > 0) {
    for (const clip of clips) {
      if (!clip || clip.muteOriginalAudio) continue;
      if (clip.out !== undefined && clip.in !== undefined && clip.out <= clip.in) continue;

      const hasPositiveVolumeKeyframe = clip.keyframes?.some(
        (kf) => kf.property === "volume" && kf.value > 0
      );
      const baseClipVol = clip.volume !== undefined ? clip.volume : 1;
      if (baseClipVol <= 0 && !hasPositiveVolumeKeyframe) continue;

      const mItem = mediaById.get(clip.mediaId);
      if (mItem && mItem.type === "video") {
        const audioUrlToUse = clip.processedAudioUrl || mItem.url;
        if (audioUrlToUse) {
          urls.add(audioUrlToUse);
        }
      }
    }
  }

  // 3. Audible video overlays
  if (videoVolume > 0) {
    for (const ov of overlays) {
      if (!ov || ov.type !== "video" || ov.muted) continue;
      const ovVol = ov.volume !== undefined ? ov.volume : 1;
      if (ovVol <= 0) continue;
      if (ov.end !== undefined && ov.start !== undefined && ov.end <= ov.start) continue;

      const mItem = mediaById.get(ov.url);
      const resolvedUrl = mItem ? mItem.url : ov.url;
      if (resolvedUrl) {
        urls.add(resolvedUrl);
      }
    }
  }

  return Array.from(urls);
}

/**
 * Calculates RMS (dBFS) and Peak of an AudioBuffer in a specified time window.
 */
export function calculateBufferRMS(
  buffer: AudioBuffer,
  startSec: number = 0,
  durationSec?: number
): { rmsDb: number; peak: number } {
  const numChannels = buffer.numberOfChannels;
  if (numChannels === 0 || buffer.length === 0) {
    return { rmsDb: -60, peak: 0 };
  }

  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.min(buffer.length - 1, Math.floor(startSec * sr)));
  const totalSamples =
    durationSec !== undefined
      ? Math.min(buffer.length - startSample, Math.max(1, Math.floor(durationSec * sr)))
      : buffer.length - startSample;

  if (totalSamples <= 0) {
    return { rmsDb: -60, peak: 0 };
  }

  const targetSamplesToInspect = Math.min(totalSamples, 80000);
  const step = Math.max(1, Math.floor(totalSamples / targetSamplesToInspect));

  let sumSquares = 0;
  let count = 0;
  let peak = 0;

  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    const end = Math.min(data.length, startSample + totalSamples);
    for (let i = startSample; i < end; i += step) {
      const absVal = Math.abs(data[i]);
      if (absVal > peak) peak = absVal;
      sumSquares += absVal * absVal;
      count++;
    }
  }

  if (count === 0) return { rmsDb: -60, peak: 0 };
  const rms = Math.sqrt(sumSquares / count);
  if (rms < 0.00001) return { rmsDb: -60, peak };
  const rmsDb = 20 * Math.log10(rms);
  return { rmsDb, peak };
}

/**
 * Gentle loudness gain compensation towards target RMS level (-18 to -20 dBFS).
 */
export function computeNormalizedGain(
  measuredRmsDb: number,
  targetRmsDb: number = -19,
  maxBoostDb: number = 4.0,
  maxCutDb: number = -8.0
): number {
  if (measuredRmsDb <= -45) return 1.0; // Keep silence/noise-floor untouched
  const deltaDb = targetRmsDb - measuredRmsDb;
  const clampedDeltaDb = Math.max(maxCutDb, Math.min(maxBoostDb, deltaDb));
  return Math.pow(10, clampedDeltaDb / 20);
}

/**
 * Encodes an AudioBuffer into a 16-bit PCM WAV ArrayBuffer (used lazily by Tier 2 FFmpeg).
 */
export function bufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };

  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  // RIFF WAVE Header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // chunk size = 16
  setUint16(1); // PCM = 1
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample = 16

  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return bufferArr;
}
