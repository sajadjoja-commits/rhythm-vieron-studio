/**
 * Video Encoder Engine
 * Streaming, hardware-accelerated video encoding utilizing WebCodecs + mp4-muxer / webm-muxer
 * with transparent WebM support, zero-leak frame disposal, and lifecycle state management.
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from "webm-muxer";
import { VideoAIOptions, VideoCapabilityProfile } from "./types";
import { VideoMemoryManager } from "./VideoMemoryManager";
import { createSoftwareVideoSession } from "./SoftwareVideoEncoder";

const DEBUG_VIDEO_AI = false;

export function calculateH264Level(width: number, height: number, fps: number): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = mbs * fps;

  if (mbs <= 1620 && mbps <= 40500) return "1E"; // 3.0 (0x1E)
  if (mbs <= 3600 && mbps <= 108000) return "1F"; // 3.1 (0x1F)
  if (mbs <= 5120 && mbps <= 216000) return "20"; // 3.2 (0x20)
  if (mbs <= 8192 && mbps <= 245760) return "28"; // 4.0 (0x28)
  if (mbs <= 8704 && mbps <= 522240) return "2A"; // 4.2 (0x2A)
  if (mbs <= 22080 && mbps <= 589824) return "32"; // 5.0 (0x32)
  if (mbs <= 36864 && mbps <= 983040) return "33"; // 5.1 (0x33)
  return "34"; // 5.2 (0x34)
}

async function waitForEncoderBackpressure(
  encoder: { encodeQueueSize: number; addEventListener?: any; removeEventListener?: any },
  maxQueueSize = 2,
  timeoutMs = 3000
): Promise<void> {
  if (encoder.encodeQueueSize <= maxQueueSize) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: any = null;
    let safetyTimer: any = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (typeof encoder.removeEventListener === "function") {
        try {
          encoder.removeEventListener("dequeue", onDequeue);
        } catch {}
      }
    };

    const onDequeue = () => {
      if (encoder.encodeQueueSize <= maxQueueSize) {
        cleanup();
        resolve();
      }
    };

    safetyTimer = setTimeout(() => {
      cleanup();
      if (encoder.encodeQueueSize > maxQueueSize) {
        reject(new Error("WebCodecs encode queue stalled."));
      } else {
        resolve();
      }
    }, timeoutMs);

    if (typeof encoder.addEventListener === "function") {
      try {
        encoder.addEventListener("dequeue", onDequeue);
        return;
      } catch {}
    }

    const poll = () => {
      if (settled) return;
      if (encoder.encodeQueueSize <= maxQueueSize) {
        cleanup();
        resolve();
      } else {
        timer = setTimeout(poll, 10);
      }
    };
    timer = setTimeout(poll, 10);
  });
}

export enum EncoderState {
  CREATED = "CREATED",
  CONFIGURED = "CONFIGURED",
  PROCESSING = "PROCESSING",
  FLUSHING = "FLUSHING",
  CLOSED = "CLOSED",
  ERROR = "ERROR",
  CANCELLED = "CANCELLED",
}

export interface EncoderSession {
  state: EncoderState;
  addFrame: (canvasSource: HTMLCanvasElement | OffscreenCanvas, timestampMicros: number, isKeyFrame?: boolean) => Promise<void>;
  finish: () => Promise<Blob>;
  cancel: () => void;
  getError: () => Error | null;
}

export class VideoEncoderEngine {
  private static instance: VideoEncoderEngine;
  private memoryManager = VideoMemoryManager.getInstance();

  public static getInstance(): VideoEncoderEngine {
    if (!VideoEncoderEngine.instance) {
      VideoEncoderEngine.instance = new VideoEncoderEngine();
    }
    return VideoEncoderEngine.instance;
  }

  /**
   * Starts a streaming encoder session.
   */
  public async createEncoderSession(params: {
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
    format?: "mp4" | "webm";
    audioBuffer?: AudioBuffer | null;
    profile: VideoCapabilityProfile;
    options?: VideoAIOptions;
  }): Promise<EncoderSession> {
    const {
      width,
      height,
      fps,
      format = "mp4",
      audioBuffer,
      profile,
      options,
    } = params;

    const bitrate = params.bitrate || (width >= 1920 ? 8_000_000 : width >= 1280 ? 4_500_000 : 2_500_000);
    const preserveAudio = options?.preserveAudio ?? true;

    // Browser WebCodecs currently discards alpha; use an actual alpha-capable encoder.
    if (format === "webm" && options?.backgroundColor === "transparent") {
      return createSoftwareVideoSession({ width, height, fps, format, audioBuffer: preserveAudio ? audioBuffer : null, options });
    }

    // If WebCodecs is supported, use hardware WebCodecs streaming encoder
    if (profile.hasWebCodecs && typeof VideoEncoder !== "undefined") {
      try {
        return await this.createWebCodecsSession({
          width,
          height,
          fps,
          bitrate,
          format,
          audioBuffer: preserveAudio ? audioBuffer : null,
          options,
        });
      } catch (err) {
        console.warn("[VideoEncoderEngine] WebCodecs initialization failed, falling back to MediaRecorder:", err);
      }
    }

    // A wall-clock MediaRecorder stretches video by processing time and desynchronizes audio.
    return createSoftwareVideoSession({
      width,
      height,
      fps,
      format,
      audioBuffer: preserveAudio ? audioBuffer : null,
      options,
    });
  }

  /**
   * WebCodecs Hardware VideoEncoder Session with strict lifecycle state machine.
   */
  private async createWebCodecsSession(params: {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    format: "mp4" | "webm";
    audioBuffer?: AudioBuffer | null;
    options?: VideoAIOptions;
  }): Promise<EncoderSession> {
    const { width, height, fps, bitrate, format } = params;

    let state: EncoderState = EncoderState.CREATED;
    let lastError: Error | null = null;
    let finalBlob: Blob | null = null;
    let finishPromise: Promise<Blob> | null = null;

    let mp4Muxer: any = null;
    let webmMuxer: any = null;
    const isWebm = format === "webm";
    const sourceAudio = params.audioBuffer;
    const hasAudio = Boolean(sourceAudio && sourceAudio.length > 0);
    const audioChannels = sourceAudio ? Math.min(2, sourceAudio.numberOfChannels) : 0;
    const audioSampleRate = sourceAudio?.sampleRate || 0;

    let audioEncoder: any = null;
    let audioEncoderReady = false;
    let audioEncoderError: Error | null = null;

    // Check if AudioEncoder is available for WebCodecs
    if (hasAudio && typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined") {
      try {
        const audioCodec = isWebm ? "opus" : "mp4a.40.2";
        const isAudioSupported = await AudioEncoder.isConfigSupported({
          codec: audioCodec,
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
          bitrate: 128_000,
        });

        if (isAudioSupported && isAudioSupported.supported) {
          audioEncoder = new AudioEncoder({
            output: (chunk: any, meta: any) => {
              try {
                if (isWebm && webmMuxer) {
                  webmMuxer.addAudioChunk(chunk, meta);
                } else if (mp4Muxer) {
                  mp4Muxer.addAudioChunk(chunk, meta);
                }
              } catch (audioMuxErr: any) {
                console.error("[VideoEncoderEngine] Audio chunk muxing error:", audioMuxErr);
                audioEncoderError = audioMuxErr instanceof Error ? audioMuxErr : new Error(String(audioMuxErr));
              }
            },
            error: (e: any) => {
              console.error("[VideoEncoderEngine] AudioEncoder error:", e);
              audioEncoderError = e instanceof Error ? e : new Error(String(e));
            },
          });

          audioEncoder.configure({
            codec: audioCodec,
            numberOfChannels: audioChannels,
            sampleRate: audioSampleRate,
            bitrate: 128_000,
          });

          audioEncoderReady = true;
        }
      } catch (audioInitErr) {
        console.warn("[VideoEncoderEngine] AudioEncoder negotiation failed, continuing video only:", audioInitErr);
        audioEncoder = null;
        audioEncoderReady = false;
      }
    }

    if (hasAudio && !audioEncoderReady) {
      try { audioEncoder?.close(); } catch {}
      throw new Error("Audio codec unavailable; switching to audio-safe software encoding.");
    }

    // Candidate codecs for negotiation
    const h264Level = calculateH264Level(width, height, fps);
    const candidateCodecs = isWebm
      ? ["vp09.00.10.08", "vp8"]
      : [`avc1.6400${h264Level}`, `avc1.4D40${h264Level}`, `avc1.42E0${h264Level}`];

    let chosenCodec = candidateCodecs[0];
    let chosenLatencyMode: "quality" | "realtime" = "quality";
    let isSupported = false;
    const wantAlpha = isWebm && (!params.options?.backgroundColor || params.options.backgroundColor === "transparent");
    let supportsAlpha = false;

    for (const candidate of candidateCodecs) {
      for (const latencyMode of ["quality", "realtime"] as const) {
        try {
          const testConfig: VideoEncoderConfig = {
            codec: candidate,
            width,
            height,
            bitrate,
            framerate: fps,
            hardwareAcceleration: "prefer-hardware",
            latencyMode,
          };
          const check = await VideoEncoder.isConfigSupported(testConfig);
          if (check && check.supported) {
            chosenCodec = candidate;
            chosenLatencyMode = latencyMode;
            isSupported = true;
            if (wantAlpha) {
              try {
                const alphaCheck = await VideoEncoder.isConfigSupported({
                  ...testConfig,
                  alpha: "keep",
                });
                if (alphaCheck && alphaCheck.supported) {
                  supportsAlpha = true;
                }
              } catch {}
            }
            break;
          }
        } catch {}
      }
      if (isSupported) break;
    }

    if (!isSupported) {
      try { audioEncoder?.close(); } catch {}
      throw new Error(`[VideoEncoderEngine] WebCodecs does not support codecs for ${format}`);
    }

    const useAlphaInMuxer = isWebm && wantAlpha && supportsAlpha;

    if (isWebm) {
      const webmCodec = chosenCodec.startsWith("vp09") ? "V_VP9" : "V_VP8";
      webmMuxer = new WebmMuxer({
        target: new WebmArrayBufferTarget(),
        video: {
          codec: webmCodec,
          width,
          height,
          frameRate: fps,
          alpha: useAlphaInMuxer,
        },
        ...(audioEncoderReady
          ? {
              audio: {
                codec: "A_OPUS",
                numberOfChannels: audioChannels,
                sampleRate: audioSampleRate,
              },
            }
          : {}),
      });
    } else {
      mp4Muxer = new Mp4Muxer({
        target: new Mp4ArrayBufferTarget(),
        video: {
          codec: "avc",
          width,
          height,
          rotation: 0,
        },
        ...(audioEncoderReady
          ? {
              audio: {
                codec: "aac",
                numberOfChannels: audioChannels,
                sampleRate: audioSampleRate,
              },
            }
          : {}),
        fastStart: "in-memory",
      });
    }

    let hasGeneratedKeyFrame = false;

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (state !== EncoderState.PROCESSING && state !== EncoderState.FLUSHING) return;
        try {
          if (chunk.byteLength <= 0) {
            throw new Error(`Encoder produced empty chunk with byteLength <= 0 (ts=${chunk.timestamp}µs)`);
          }
          if (chunk.type === "key") {
            hasGeneratedKeyFrame = true;
          }
          if (DEBUG_VIDEO_AI) {
            console.log(
              `[VideoEncoderEngine] Output chunk: ts=${chunk.timestamp}µs, size=${chunk.byteLength}B, type=${chunk.type}`
            );
          }
          if (isWebm && webmMuxer) {
            webmMuxer.addVideoChunk(chunk, meta);
          } else if (mp4Muxer) {
            mp4Muxer.addVideoChunk(chunk, meta);
          }
        } catch (muxErr: any) {
          console.error("[VideoEncoderEngine] Muxer error:", muxErr);
          state = EncoderState.ERROR;
          lastError = muxErr instanceof Error ? muxErr : new Error(String(muxErr));
        }
      },
      error: (e) => {
        console.error("[VideoEncoderEngine] WebCodecs encoder error:", e);
        state = EncoderState.ERROR;
        lastError = e instanceof Error ? e : new Error((e as any)?.message || "WebCodecs encoder error");
      },
    });

    videoEncoder.configure({
      codec: chosenCodec,
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: "prefer-hardware",
      latencyMode: chosenLatencyMode,
      ...(useAlphaInMuxer ? { alpha: "keep" } : { alpha: "discard" }),
    });

    state = EncoderState.CONFIGURED;
    state = EncoderState.PROCESSING;

    let frameIndex = 0;
    let audioSampleOffset = 0;

    // Helper to progressively encode audio interleaved with video frames
    const encodeAudioUpTo = (targetTimestampMicros: number) => {
      if (!audioEncoderReady || !audioEncoder || !params.audioBuffer || audioEncoderError) return;
      const audioBuffer = params.audioBuffer;
      const sampleRate = audioBuffer.sampleRate;
      const numberOfChannels = audioChannels;
      const totalSamples = audioBuffer.length;
      const targetSample = Math.min(totalSamples, Math.floor((targetTimestampMicros / 1_000_000) * sampleRate));
      const frameSize = 1024;

      while (audioSampleOffset < targetSample) {
        if (audioEncoderError) break;
        const chunkSize = Math.min(frameSize, totalSamples - audioSampleOffset);
        const planarData = new Float32Array(chunkSize * numberOfChannels);

        for (let ch = 0; ch < numberOfChannels; ch++) {
          const channelData = audioBuffer.getChannelData(ch);
          const destOffset = ch * chunkSize;
          for (let s = 0; s < chunkSize; s++) {
            const sample = channelData[audioSampleOffset + s];
            if (Number.isNaN(sample) || !Number.isFinite(sample)) {
              planarData[destOffset + s] = 0;
            } else {
              planarData[destOffset + s] = Math.max(-1.0, Math.min(1.0, sample));
            }
          }
        }

        const audioTimestampMicros = Math.round((audioSampleOffset / sampleRate) * 1_000_000);
        const audioData = new AudioData({
          format: "f32-planar",
          sampleRate,
          numberOfFrames: chunkSize,
          numberOfChannels,
          timestamp: audioTimestampMicros,
          data: planarData,
        });

        try {
          audioEncoder.encode(audioData);
        } catch (e: any) {
          console.warn("[VideoEncoderEngine] Audio encode error:", e);
        } finally {
          audioData.close();
        }
        audioSampleOffset += chunkSize;
      }
    };

    const addFrame = async (
      canvasSource: HTMLCanvasElement | OffscreenCanvas,
      timestampMicros: number,
      isKeyFrame = false
    ) => {
      // 1. Check encoder state
      if (state === EncoderState.ERROR) {
        throw lastError || new Error("Cannot call encode: Encoder is in ERROR state.");
      }
      if (state === EncoderState.CANCELLED) {
        throw new Error("Cannot call encode: Encoder was CANCELLED.");
      }
      if (state === EncoderState.CLOSED || state === EncoderState.FLUSHING) {
        throw new Error(`Cannot call encode on a ${String(state).toLowerCase()} codec`);
      }
      if (state !== EncoderState.PROCESSING) {
        throw new Error(`Cannot call encode on encoder in ${state} state.`);
      }

      // Snapshot VideoFrame immediately from canvasSource before backpressure wait
      const keyFrame = isKeyFrame || frameIndex % Math.max(1, fps) === 0;
      const frameInit: any = {
        timestamp: timestampMicros,
        duration: Math.round(1_000_000 / fps),
      };
      if (useAlphaInMuxer) {
        frameInit.alpha = "keep";
      } else {
        frameInit.alpha = "discard";
      }
      const frame = new VideoFrame(canvasSource as any, frameInit);

      try {
        // 2. Safe queue backlog wait with dequeue event listener & timeout
        await waitForEncoderBackpressure(videoEncoder, 2);

        if (state !== EncoderState.PROCESSING) {
          throw new Error(`Cannot call encode on a ${String(state).toLowerCase()} codec`);
        }
        if (videoEncoder.state !== "configured") {
          throw new Error(`Cannot encode frame: VideoEncoder is in '${videoEncoder.state}' state (expected 'configured')`);
        }

        // Progressively encode audio interleaved with video frames
        encodeAudioUpTo(timestampMicros + Math.round(1_000_000 / fps));

        // Diagnostic tracing before encoder.encode(frame)
        if (DEBUG_VIDEO_AI && (frameIndex === 0 || isKeyFrame || frameIndex % Math.max(1, fps) === 0)) {
          console.log(
            `[VideoEncoderEngine] Encode frame ${frameIndex}: ts=${timestampMicros}µs, size=${frame.displayWidth || width}x${frame.displayHeight || height}, format=${(frame as any).format || "canvas/RGBA"}, encoderState=${videoEncoder.state}, sessionState=${state}, keyFrame=${keyFrame}`
          );
        }

        videoEncoder.encode(frame, { keyFrame });
        frameIndex++;
      } finally {
        frame.close(); // Immediate memory release
      }
    };

    const finish = async (): Promise<Blob> => {
      // Idempotency check
      if (finishPromise) return finishPromise;
      if (state === EncoderState.CLOSED && finalBlob) return finalBlob;
      if (state === EncoderState.ERROR) throw lastError || new Error("Cannot finish: Encoder is in ERROR state.");
      if (state === EncoderState.CANCELLED) throw new Error("Cannot finish: Encoder was CANCELLED.");
      if (state !== EncoderState.PROCESSING) {
        throw new Error(`Cannot finish encoder in state: ${state}`);
      }

      state = EncoderState.FLUSHING;

      finishPromise = (async () => {
        try {
          // Flush any remaining audio interleaved
          encodeAudioUpTo(Infinity);
          if (audioEncoderReady && audioEncoder) {
            await audioEncoder.flush();
            if (audioEncoderError) throw audioEncoderError;
            try {
              audioEncoder.close();
            } catch {}
          }

          await videoEncoder.flush();

          if ((state as EncoderState) === EncoderState.ERROR) {
            throw lastError || new Error("Encoder error occurred during flush.");
          }

          if (!hasGeneratedKeyFrame && frameIndex > 0) {
            throw new Error("فشل توليد الإطارات الأساسية (Keyframes) أثناء تشفير الفيديو.");
          }

          let buffer: ArrayBuffer;
          if (isWebm && webmMuxer) {
            webmMuxer.finalize();
            buffer = webmMuxer.target.buffer;
          } else if (mp4Muxer) {
            mp4Muxer.finalize();
            buffer = mp4Muxer.target.buffer;
          } else {
            throw new Error("No muxer target output available.");
          }

          if (!buffer || buffer.byteLength <= 0) {
            throw new Error("فشل تكوين ملف الفيديو: حجم البيانات المُنتجة 0 بايت.");
          }

          try {
            videoEncoder.close();
          } catch {}

          state = EncoderState.CLOSED;
          const mimeType = isWebm ? "video/webm" : "video/mp4";
          finalBlob = new Blob([buffer], { type: mimeType });
          return finalBlob;
        } catch (err: any) {
          state = EncoderState.ERROR;
          lastError = err instanceof Error ? err : new Error(String(err));
          try {
            videoEncoder.close();
          } catch {}
          try { audioEncoder?.close(); } catch {}
          throw lastError;
        }
      })();

      return finishPromise;
    };

    const cancel = () => {
      if (state === EncoderState.CLOSED || state === EncoderState.CANCELLED) return;
      state = EncoderState.CANCELLED;
      try {
        videoEncoder.close();
      } catch {}
      try { audioEncoder?.close(); } catch {}
    };

    const getError = () => lastError;

    const session: EncoderSession = {
      get state() {
        return state;
      },
      addFrame,
      finish,
      cancel,
      getError,
    };

    return session;
  }
}
