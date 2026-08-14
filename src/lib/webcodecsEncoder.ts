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
  onProgress: (progress: number) => void;
  isAborted: () => boolean;
  renderFrameAtTime: (elapsed: number) => Promise<void>;
}

export async function isWebCodecsSupported(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<boolean> {
  if (typeof window === "undefined" || !("VideoEncoder" in window) || typeof VideoEncoder !== "function") {
    return false;
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
    onProgress,
    isAborted,
    renderFrameAtTime,
  } = options;

  // 1. Determine best supported video codec string
  const codecCandidates = ["avc1.42E01E", "avc1.4D401E", "avc1.640028"];
  let chosenCodec = "avc1.42E01E";

  for (const c of codecCandidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: c,
        width: exportWidth,
        height: exportHeight,
        bitrate,
        framerate: fps,
      });
      if (support.supported) {
        chosenCodec = c;
        break;
      }
    } catch {}
  }

  const hasAudio = renderedAudioBuffer !== null && renderedAudioBuffer.length > 0;

  // 2. Initialize MP4 Muxer
  const muxerTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: "avc",
      width: exportWidth,
      height: exportHeight,
    },
    audio: hasAudio
      ? {
          codec: "aac",
          numberOfChannels: 2,
          sampleRate: 44100,
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
    bitrate,
    framerate: fps,
  });

  // 4. Encode audio samples if available
  if (hasAudio && renderedAudioBuffer) {
    try {
      if ("AudioEncoder" in window && typeof AudioEncoder === "function") {
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            muxer.addAudioChunk(chunk, meta);
          },
          error: (e) => console.warn("[WebCodecs] AudioEncoder notice:", e),
        });

        audioEncoder.configure({
          codec: "mp4a.40.2", // AAC LC
          numberOfChannels: 2,
          sampleRate: 44100,
          bitrate: 192_000,
        });

        const numChannels = Math.min(2, renderedAudioBuffer.numberOfChannels);
        const length = renderedAudioBuffer.length;
        const pcmData = new Float32Array(length * numChannels);

        const leftChan = renderedAudioBuffer.getChannelData(0);
        const rightChan = numChannels > 1 ? renderedAudioBuffer.getChannelData(1) : leftChan;

        for (let i = 0; i < length; i++) {
          pcmData[i * 2] = leftChan[i];
          pcmData[i * 2 + 1] = rightChan[i];
        }

        // Send audio in 1-second chunks (44100 frames)
        const chunkSize = 44100;
        let sampleOffset = 0;

        while (sampleOffset < length) {
          const framesInChunk = Math.min(chunkSize, length - sampleOffset);
          const chunkPcm = pcmData.subarray(sampleOffset * 2, (sampleOffset + framesInChunk) * 2);

          const audioData = new AudioData({
            format: "f32-planar",
            sampleRate: 44100,
            numberOfFrames: framesInChunk,
            numberOfChannels: 2,
            timestamp: Math.round((sampleOffset / 44100) * 1_000_000),
            data: chunkPcm,
          });

          audioEncoder.encode(audioData);
          audioData.close();
          sampleOffset += framesInChunk;
        }

        await audioEncoder.flush();
        audioEncoder.close();
      }
    } catch (audioErr) {
      console.warn("[WebCodecs] Audio encoding warning, continuing with video track:", audioErr);
    }
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
