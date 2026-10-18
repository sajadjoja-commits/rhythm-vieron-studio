/**
 * High-Performance AudioBuffer and Signal Processing Utilities
 * Provides lossless PCM WAV encoding, resampling, stereo mixing, and overlap-add windowing.
 */

import { resolveAudioSourceToBlob } from "../../utils/audioUtils";

let sharedAudioCtx: AudioContext | null = null;

export function getSharedAudioContext(sampleRate?: number): AudioContext {
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = sampleRate ? new AudioCtxClass({ sampleRate }) : new AudioCtxClass();
  }
  return sharedAudioCtx;
}

/**
 * Decode an Audio File, Blob, or URL into an in-memory AudioBuffer
 */
export async function decodeAudioSource(
  source: File | Blob | ArrayBuffer | string,
  targetSampleRate?: number
): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;

  if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else {
    const blob = await resolveAudioSourceToBlob(source);
    arrayBuffer = await blob.arrayBuffer();
  }

  const ctx = getSharedAudioContext(targetSampleRate);
  // Safari compatibility: slice buffer to avoid detaching issues
  const clonedBuffer = arrayBuffer.slice(0);
  const audioBuffer = await ctx.decodeAudioData(clonedBuffer);

  if (targetSampleRate && audioBuffer.sampleRate !== targetSampleRate) {
    return resampleAudioBuffer(audioBuffer, targetSampleRate);
  }

  return audioBuffer;
}

/**
 * Resample an AudioBuffer using OfflineAudioContext
 */
export async function resampleAudioBuffer(
  buffer: AudioBuffer,
  targetSampleRate: number
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) return buffer;

  const numChannels = buffer.numberOfChannels;
  const numFrames = Math.round((buffer.length * targetSampleRate) / buffer.sampleRate);

  const offlineCtx = new OfflineAudioContext(numChannels, numFrames, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  return await offlineCtx.startRendering();
}

/**
 * Mix stereo channels to mono Float32Array
 */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const numFrames = buffer.length;
  const mono = new Float32Array(numFrames);

  if (buffer.numberOfChannels === 1) {
    mono.set(buffer.getChannelData(0));
    return mono;
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < numFrames; i++) {
    mono[i] = (left[i] + right[i]) * 0.5;
  }

  return mono;
}

/**
 * Encode Float32Array channels or AudioBuffer to standard 16-bit PCM WAV Blob
 */
export function encodeWavBlob(
  channelsData: Float32Array[],
  sampleRate: number
): Blob {
  const numChannels = channelsData.length;
  const numFrames = channelsData[0].length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // RIFF Header
  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, "WAVE");

  // fmt chunk
  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // data chunk
  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write Interleaved Samples
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelsData[ch][i];
      // Soft clamp between -1.0 and +1.0
      sample = Math.max(-1.0, Math.min(1.0, sample));
      // Convert to 16-bit signed integer
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, Math.round(intSample), true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeAsciiString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Compute Hanning window array
 */
export function createHanningWindow(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return window;
}

/**
 * Calculate audio statistics: RMS, Peak in dBFS
 */
export function calculateAudioStats(channel: Float32Array): {
  peakDbfs: number;
  rmsDbfs: number;
  hasClipping: boolean;
} {
  let sumSquares = 0;
  let maxAbs = 0;
  let clipCount = 0;

  for (let i = 0; i < channel.length; i++) {
    const val = channel[i];
    const abs = Math.abs(val);
    if (abs > maxAbs) maxAbs = abs;
    if (abs >= 0.999) clipCount++;
    sumSquares += val * val;
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, channel.length));
  const rmsDbfs = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
  const peakDbfs = maxAbs > 0.00001 ? 20 * Math.log10(maxAbs) : -100;

  return {
    peakDbfs,
    rmsDbfs,
    hasClipping: clipCount > 5,
  };
}
