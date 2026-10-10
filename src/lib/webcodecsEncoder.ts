/**
 * WebCodecs + MP4 Muxer Hardware-Accelerated Export Engine
 * Ultra-fast, zero-memory-leak video encoding supported on Desktop Chrome & Android WebView.
 * Directly encodes canvas frames into H.264/AAC MP4 streams without intermediate RAM files.
 */

import { Muxer, ArrayBufferTarget, StreamTarget } from "mp4-muxer";

async function waitForEncoderDequeue(
  encoder: { encodeQueueSize: number; addEventListener?: any; removeEventListener?: any },
  maxQueueSize: number
): Promise<void> {
  if (encoder.encodeQueueSize <= maxQueueSize) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof encoder.removeEventListener === "function") {
        try {
          encoder.removeEventListener("dequeue", onDequeue);
        } catch {}
      }
      resolve();
    };
    const onDequeue = () => {
      if (encoder.encodeQueueSize <= maxQueueSize) {
        done();
      }
    };
    const timer = setTimeout(done, 40);
    if (typeof encoder.addEventListener === "function") {
      try {
        encoder.addEventListener("dequeue", onDequeue);
        return;
      } catch {}
    }
    setTimeout(done, 8);
  });
}

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

  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  const frameDurationSec = 1 / fps;
  const frameDurationUs = Math.round(frameDurationSec * 1_000_000);
  const frameChunkSize = 1024;
  const expectedAudioChunks =
    audioEncoderReady && renderedAudioBuffer
      ? Math.ceil(renderedAudioBuffer.length / frameChunkSize) + 32
      : 0;
  const expectedVideoChunks = totalFrames + 32;

  // 2. Initialize MP4 Muxer (prefer OPFS disk-backed StreamTarget, fallback to ArrayBufferTarget)
  let opfsDir: FileSystemDirectoryHandle | null = null;
  let opfsFileHandle: FileSystemFileHandle | null = null;
  let opfsWritable: FileSystemWritableFileStream | null = null;
  const opfsFileName = `vireon_export_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`;
  let opfsWriteChain: Promise<void> = Promise.resolve();
  let opfsWriteError: Error | null = null;

  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.getDirectory === "function"
  ) {
    try {
      opfsDir = await navigator.storage.getDirectory();
      opfsFileHandle = await opfsDir.getFileHandle(opfsFileName, { create: true });
      if (typeof (opfsFileHandle as any).createWritable === "function") {
        opfsWritable = await (opfsFileHandle as any).createWritable();
      }
    } catch {
      opfsDir = null;
      opfsFileHandle = null;
      opfsWritable = null;
    }
  }

  const cleanupOpfsTemp = async () => {
    if (opfsWritable) {
      try {
        await opfsWritable.abort();
      } catch {}
      opfsWritable = null;
    }
    if (opfsDir && opfsFileName) {
      try {
        await opfsDir.removeEntry(opfsFileName);
      } catch {}
    }
  };

  const muxerTarget = opfsWritable
    ? new StreamTarget({
        chunked: true,
        chunkSize: 16 * 1024 * 1024,
        onData: (data: Uint8Array, position: number) => {
          if (!opfsWritable || opfsWriteError) return;
          const chunkCopy = data.slice();
          opfsWriteChain = opfsWriteChain
            .then(() =>
              opfsWritable!.write({
                type: "write",
                data: chunkCopy,
                position,
              })
            )
            .catch((err) => {
              opfsWriteError = err instanceof Error ? err : new Error(String(err));
            });
        },
      })
    : new ArrayBufferTarget();

  const muxer = new Muxer({
    target: muxerTarget as any,
    video: {
      codec: "avc",
      width: exportWidth,
      height: exportHeight,
      frameRate: Math.round(fps),
    },
    audio: audioEncoderReady
      ? {
          codec: "aac",
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
        }
      : undefined,
    fastStart: {
      expectedVideoChunks,
      expectedAudioChunks,
    },
  });

  // 3. Initialize VideoEncoder
  let videoEncoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (muxErr: any) {
        console.error("[WebCodecs] Video muxing error:", muxErr);
        videoEncoderError = muxErr instanceof Error ? muxErr : new Error(String(muxErr));
      }
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

  try {
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
        if (opfsWriteError) {
          try { audioEncoder.close(); } catch {}
          throw opfsWriteError;
        }

        await waitForEncoderDequeue(audioEncoder, 16);

        const framesInChunk = Math.min(frameChunkSize, length - sampleOffset);
        const planarData = new Float32Array(framesInChunk * audioChannels);

        for (let ch = 0; ch < audioChannels; ch++) {
          const channelData = renderedAudioBuffer.getChannelData(ch);
          const destOffset = ch * framesInChunk;
          for (let s = 0; s < framesInChunk; s++) {
            const sample = channelData[sampleOffset + s];
            if (Number.isNaN(sample) || !Number.isFinite(sample)) {
              planarData[destOffset + s] = 0;
            } else {
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
    for (let i = 0; i < totalFrames; i++) {
      if (isAborted()) {
        try { videoEncoder.close(); } catch {}
        throw new Error("Export cancelled");
      }

      if (videoEncoderError) {
        throw videoEncoderError;
      }
      if (opfsWriteError) {
        throw opfsWriteError;
      }

      await waitForEncoderDequeue(videoEncoder, 8);

      const elapsed = i * frameDurationSec;

      // Render exact frame to canvas
      await renderFrameAtTime(elapsed);

      // Create VideoFrame directly from canvas without intermediate JPEG files or RAM memory accumulation
      const timestampUs = Math.round((i / fps) * 1_000_000);
      const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs, duration: frameDurationUs });

      // Keyframe insertion every 2 seconds
      const isKeyframe = i % Math.max(1, Math.round(fps * 2)) === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });

      // CRITICAL: Immediately release video frame to prevent GPU/RAM memory leaks
      videoFrame.close();

      const progressP = (i + 1) / totalFrames;
      onProgress(0.25 + 0.70 * progressP);
    }

    // Flush and finalize muxer
    await videoEncoder.flush();
    if (videoEncoderError) {
      throw videoEncoderError;
    }
    videoEncoder.close();

    muxer.finalize();

    if (opfsWritable && opfsFileHandle) {
      await opfsWriteChain;
      if (opfsWriteError) {
        throw opfsWriteError;
      }
      await opfsWritable.close();
      opfsWritable = null;
      const diskFile = await opfsFileHandle.getFile();
      return diskFile.slice(0, diskFile.size, "video/mp4");
    }

    const { buffer } = muxer.target as ArrayBufferTarget;
    return new Blob([buffer], { type: "video/mp4" });
  } catch (err) {
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {}
    await cleanupOpfsTemp();
    throw err;
  }
}
