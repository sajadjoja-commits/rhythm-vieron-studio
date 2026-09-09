/**
 * WebCodecs + MP4 Muxer Hardware-Accelerated Export Engine
 * Ultra-fast, zero-memory-leak video encoding supported on Desktop Chrome & Android WebView.
 * Directly encodes canvas frames into H.264/AAC MP4 streams without intermediate RAM files.
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export interface WebCodecsExportOptions {
  canvas: HTMLCanvasElement;
  exportWidth: number;
  exportHeight: number;
  fps: number;
  bitrate: number;
  totalDuration: number;
  renderedAudioBuffer: AudioBuffer | null;
  twoPass?: boolean;
  onProgress: (progress: number) => void;
  isAborted: () => boolean;
  renderFrameAtTime: (elapsed: number) => Promise<void>;
}

export async function isWebCodecsSupported(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  checkAudio: boolean = false
): Promise<boolean> {
  if (typeof window === "undefined" || !("VideoEncoder" in window) || typeof VideoEncoder !== "function") {
    return false;
  }

  // If audio is required, verify AudioEncoder support as well
  if (checkAudio) {
    if (!("AudioEncoder" in window) || typeof AudioEncoder !== "function" || !("AudioData" in window)) {
      return false;
    }
    try {
      const audioSupport = await AudioEncoder.isConfigSupported({
        codec: "mp4a.40.2",
        numberOfChannels: 2,
        sampleRate: 44100,
        bitrate: 192_000,
      });
      if (!audioSupport.supported) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const testConfigs = [
    { codec: "avc1.42E01E", width, height, bitrate, framerate: fps }, // Baseline
    { codec: "avc1.4D401E", width, height, bitrate, framerate: fps }, // Main
    { codec: "avc1.640028", width, height, bitrate, framerate: fps }, // High
  ];

  for (const config of testConfigs) {
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export async function exportWithWebCodecs(options: WebCodecsExportOptions): Promise<Blob> {
  const {
    canvas,
    exportWidth,
    exportHeight,
    fps,
    bitrate,
    totalDuration,
    renderedAudioBuffer,
    twoPass = false,
    onProgress,
    isAborted,
    renderFrameAtTime,
  } = options;

  // 1. Determine best supported video codec string
  const codecCandidates = ["avc1.640028", "avc1.4D401E", "avc1.42E01E"];
  let chosenCodec = "avc1.42E01E";

  for (const c of codecCandidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: c,
        width: exportWidth,
        height: exportHeight,
        bitrate: twoPass ? Math.round(bitrate * 1.35) : bitrate,
        framerate: fps,
      });
      if (support.supported) {
        chosenCodec = c;
        break;
      }
    } catch {}
  }

  const hasAudio = renderedAudioBuffer !== null && renderedAudioBuffer.length > 0;
  const audioChannels = hasAudio ? Math.min(2, Math.max(1, renderedAudioBuffer!.numberOfChannels)) : 0;
  const audioSampleRate = hasAudio ? renderedAudioBuffer!.sampleRate : 0;

  // Verify AudioEncoder support if audio is present
  let audioEncoderReady = false;
  if (hasAudio) {
    if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
      throw new Error("AudioEncoder not supported on this platform, falling back to secondary engine.");
    }
    const audioSupported = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      numberOfChannels: audioChannels,
      sampleRate: audioSampleRate,
      bitrate: 192_000,
    });
    if (!audioSupported.supported) {
      throw new Error(`Audio configuration (${audioChannels}ch @ ${audioSampleRate}Hz) not supported by AudioEncoder.`);
    }
    audioEncoderReady = true;
  }

  // 2. Initialize MP4 Muxer with matching audio configuration
  const muxerTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: "avc",
      width: exportWidth,
      height: exportHeight,
    },
    audio: audioEncoderReady
      ? {
          codec: "aac",
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
        }
      : undefined,
    fastStart: "in-memory",
  });

  // 3. Initialize VideoEncoder
  let videoEncoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      console.error("[WebCodecs] VideoEncoder error:", e);
      videoEncoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  videoEncoder.configure({
    codec: chosenCodec,
    width: exportWidth,
    height: exportHeight,
    bitrate: twoPass ? Math.round(bitrate * 1.35) : bitrate,
    framerate: fps,
    latencyMode: "quality",
    bitrateMode: "variable",
  });

  // 4. Encode audio samples with strict f32-planar alignment and error propagation
  if (audioEncoderReady && renderedAudioBuffer) {
    let audioEncoderError: Error | null = null;

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addAudioChunk(chunk, meta);
        } catch (muxErr: any) {
          console.error("[WebCodecs] Audio muxing error:", muxErr);
          audioEncoderError = muxErr instanceof Error ? muxErr : new Error(String(muxErr));
        }
      },
      error: (e) => {
        console.error("[WebCodecs] AudioEncoder error:", e);
        audioEncoderError = e instanceof Error ? e : new Error(String(e));
      },
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC LC
      numberOfChannels: audioChannels,
      sampleRate: audioSampleRate,
      bitrate: 192_000,
    });

    const length = renderedAudioBuffer.length;
    // Standard AAC frame size is 1024 samples
    const frameChunkSize = 1024;
    let sampleOffset = 0;

    while (sampleOffset < length) {
      if (isAborted()) {
        try { audioEncoder.close(); } catch {}
        try { videoEncoder.close(); } catch {}
        throw new Error("Export cancelled");
      }

      if (audioEncoderError) {
        try { audioEncoder.close(); } catch {}
        throw audioEncoderError;
      }

      const framesInChunk = Math.min(frameChunkSize, length - sampleOffset);
      // Construct strict f32-planar memory layout:
      // Channel 0 occupies [0 .. framesInChunk - 1]
      // Channel 1 occupies [framesInChunk .. 2 * framesInChunk - 1]
      const planarData = new Float32Array(framesInChunk * audioChannels);

      for (let ch = 0; ch < audioChannels; ch++) {
        const channelData = renderedAudioBuffer.getChannelData(ch);
        const destOffset = ch * framesInChunk;
        for (let s = 0; s < framesInChunk; s++) {
          const sample = channelData[sampleOffset + s];
          if (Number.isNaN(sample) || !Number.isFinite(sample)) {
            planarData[destOffset + s] = 0;
          } else {
            // Soft-clamp into [-1.0, 1.0] to prevent clipping distortions
            planarData[destOffset + s] = Math.max(-1.0, Math.min(1.0, sample));
          }
        }
      }

      const timestampUs = Math.round((sampleOffset / audioSampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: audioSampleRate,
        numberOfFrames: framesInChunk,
        numberOfChannels: audioChannels,
        timestamp: timestampUs,
        data: planarData,
      });

      audioEncoder.encode(audioData);
      audioData.close();
      sampleOffset += framesInChunk;
    }

    await audioEncoder.flush();

    if (audioEncoderError) {
      try { audioEncoder.close(); } catch {}
      throw audioEncoderError;
    }

    audioEncoder.close();
  }

  // 5. Frame-by-frame rendering and hardware encoding loop
  const totalFrames = Math.ceil(totalDuration * fps);
  const frameDurationSec = 1 / fps;

  for (let i = 0; i < totalFrames; i++) {
    if (isAborted()) {
      try { videoEncoder.close(); } catch {}
      throw new Error("Export cancelled");
    }

    if (videoEncoderError) {
      throw videoEncoderError;
    }

    const elapsed = i * frameDurationSec;

    // Render exact frame to canvas
    await renderFrameAtTime(elapsed);

    // Create VideoFrame directly from canvas without intermediate JPEG files or RAM memory accumulation
    const timestampUs = Math.round((i / fps) * 1_000_000);
    const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });

    // Keyframe insertion every 2 seconds
    const isKeyframe = i % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });

    // CRITICAL: Immediately release video frame to prevent GPU/RAM memory leaks
    videoFrame.close();

    const progressP = (i + 1) / totalFrames;
    onProgress(0.25 + 0.70 * progressP);
  }

  // Flush and finalize muxer
  await videoEncoder.flush();
  videoEncoder.close();

  muxer.finalize();

  const { buffer } = muxer.target;
  return new Blob([buffer], { type: "video/mp4" });
}
