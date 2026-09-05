/**
 * Video Encoder Engine
 * Streaming, hardware-accelerated video encoding utilizing WebCodecs + mp4-muxer / webm-muxer
 * with transparent WebM support, zero-leak frame disposal, and lifecycle state management.
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from "webm-muxer";
import { VideoAIOptions, VideoCapabilityProfile } from "./types";
import { VideoMemoryManager } from "./VideoMemoryManager";

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
        });
      } catch (err) {
        console.warn("[VideoEncoderEngine] WebCodecs initialization failed, falling back to MediaRecorder:", err);
      }
    }

    // Fallback: Canvas MediaRecorder stream encoder
    return this.createMediaRecorderSession({
      width,
      height,
      fps,
      bitrate,
      format,
      audioBuffer: preserveAudio ? audioBuffer : null,
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
  }): Promise<EncoderSession> {
    const { width, height, fps, bitrate, format } = params;

    let state: EncoderState = EncoderState.CREATED;
    let lastError: Error | null = null;
    let finalBlob: Blob | null = null;
    let finishPromise: Promise<Blob> | null = null;

    let mp4Muxer: any = null;
    let webmMuxer: any = null;
    const isWebm = format === "webm";
    const hasAudio = Boolean(params.audioBuffer && params.audioBuffer.length > 0);
    const audioChannels = hasAudio ? Math.min(2, params.audioBuffer!.numberOfChannels) : 0;
    const audioSampleRate = hasAudio ? params.audioBuffer!.sampleRate : 0;

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

    if (isWebm) {
      webmMuxer = new WebmMuxer({
        target: new WebmArrayBufferTarget(),
        video: {
          codec: "V_VP9",
          width,
          height,
          frameRate: fps,
          alpha: true,
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

    // Candidate codecs for negotiation
    const candidateCodecs = isWebm
      ? ["vp09.00.10.08", "vp8"]
      : ["avc1.4D401E", "avc1.42E01E", "avc1.64001F"];

    let chosenCodec = candidateCodecs[0];
    let isSupported = false;

    for (const candidate of candidateCodecs) {
      try {
        const testConfig: VideoEncoderConfig = {
          codec: candidate,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: "prefer-hardware",
          latencyMode: "realtime",
        };
        const check = await VideoEncoder.isConfigSupported(testConfig);
        if (check && check.supported) {
          chosenCodec = candidate;
          isSupported = true;
          break;
        }
      } catch {}
    }

    if (!isSupported) {
      throw new Error(`[VideoEncoderEngine] WebCodecs does not support codecs for ${format}`);
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
          console.log(
            `[VideoEncoderEngine] Output chunk: ts=${chunk.timestamp}µs, size=${chunk.byteLength}B, type=${chunk.type}`
          );
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
      latencyMode: "realtime",
    });

    state = EncoderState.CONFIGURED;
    state = EncoderState.PROCESSING;

    let frameIndex = 0;

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
        throw new Error(`Cannot call encode on a ${state.toLowerCase()} codec`);
      }
      if (state !== EncoderState.PROCESSING) {
        throw new Error(`Cannot call encode on encoder in ${state} state.`);
      }

      // 2. Safe queue backlog wait with timeout & state verification
      let waitCount = 0;
      while (videoEncoder.encodeQueueSize > 2) {
        if (state !== EncoderState.PROCESSING) {
          if (state === EncoderState.ERROR) throw lastError || new Error("Encoder encountered error while waiting for queue.");
          if (state === EncoderState.CANCELLED) throw new Error("Encoder was cancelled while waiting for queue.");
          throw new Error(`Cannot call encode on a ${state.toLowerCase()} codec`);
        }
        await new Promise((r) => setTimeout(r, 10));
        waitCount++;
        if (waitCount > 300) {
          // 3 seconds queue stall timeout
          state = EncoderState.ERROR;
          lastError = new Error("WebCodecs encode queue stalled.");
          throw lastError;
        }
      }

      if (state !== EncoderState.PROCESSING) {
        throw new Error(`Cannot call encode on a ${state.toLowerCase()} codec`);
      }

      // 3. Construct VideoFrame, encode, and dispose synchronously
      const keyFrame = isKeyFrame || frameIndex % Math.max(1, fps * 2) === 0;
      const frame = new VideoFrame(canvasSource as any, {
        timestamp: timestampMicros,
        duration: Math.round(1_000_000 / fps),
      });

      try {
        if (state !== EncoderState.PROCESSING) {
          throw new Error(`Cannot call encode on a ${state.toLowerCase()} codec`);
        }
        if (videoEncoder.state !== "configured") {
          throw new Error(`Cannot encode frame: VideoEncoder is in '${videoEncoder.state}' state (expected 'configured')`);
        }

        // Diagnostic tracing before encoder.encode(frame)
        if (frameIndex === 0 || isKeyFrame || frameIndex % Math.max(1, Math.floor(fps * 2)) === 0) {
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
          // If audio encoder was active, encode audio buffer and flush
          if (audioEncoderReady && audioEncoder && params.audioBuffer) {
            try {
              const audioBuffer = params.audioBuffer;
              const sampleRate = audioBuffer.sampleRate;
              const numberOfChannels = audioChannels;
              const totalSamples = audioBuffer.length;
              const frameSize = 1024;

              for (let offset = 0; offset < totalSamples; offset += frameSize) {
                if (audioEncoderError) {
                  throw audioEncoderError;
                }

                const chunkSize = Math.min(frameSize, totalSamples - offset);
                const planarData = new Float32Array(chunkSize * numberOfChannels);

                for (let ch = 0; ch < numberOfChannels; ch++) {
                  const channelData = audioBuffer.getChannelData(ch);
                  const destOffset = ch * chunkSize;
                  for (let s = 0; s < chunkSize; s++) {
                    const sample = channelData[offset + s];
                    if (Number.isNaN(sample) || !Number.isFinite(sample)) {
                      planarData[destOffset + s] = 0;
                    } else {
                      planarData[destOffset + s] = Math.max(-1.0, Math.min(1.0, sample));
                    }
                  }
                }

                const audioTimestampMicros = Math.round((offset / sampleRate) * 1_000_000);
                const audioData = new AudioData({
                  format: "f32-planar",
                  sampleRate,
                  numberOfFrames: chunkSize,
                  numberOfChannels,
                  timestamp: audioTimestampMicros,
                  data: planarData,
                });

                audioEncoder.encode(audioData);
                audioData.close();
              }

              await audioEncoder.flush();
              if (audioEncoderError) {
                throw audioEncoderError;
              }
              audioEncoder.close();
            } catch (audioFlushErr) {
              console.error("[VideoEncoderEngine] Audio encoding error:", audioFlushErr);
              try {
                audioEncoder.close();
              } catch {}
              throw audioFlushErr;
            }
          }

          await videoEncoder.flush();

          if (state === EncoderState.ERROR) {
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

  /**
   * MediaRecorder Canvas Fallback Session with state management.
   */
  private async createMediaRecorderSession(params: {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    format: "mp4" | "webm";
    audioBuffer?: AudioBuffer | null;
  }): Promise<EncoderSession> {
    const { width, height, fps, bitrate, format } = params;

    let state: EncoderState = EncoderState.CREATED;
    let lastError: Error | null = null;
    let finalBlob: Blob | null = null;
    let finishPromise: Promise<Blob> | null = null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const stream = canvas.captureStream(fps);
    let audioContext: AudioContext | null = null;

    if (params.audioBuffer && params.audioBuffer.length > 0) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContext = new AudioCtx();
          const bufferSource = audioContext.createBufferSource();
          bufferSource.buffer = params.audioBuffer;
          const dest = audioContext.createMediaStreamDestination();
          bufferSource.connect(dest);
          dest.stream.getAudioTracks().forEach((track) => {
            stream.addTrack(track);
          });
          bufferSource.start(0);
        }
      } catch (audioCtxErr) {
        console.warn("[VideoEncoderEngine] MediaRecorder audio attach failed:", audioCtxErr);
      }
    }
    
    // Choose truly supported container & mime
    let mimeType = "video/webm";
    if (format === "mp4" && typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
      mimeType = "video/mp4;codecs=avc1";
    } else if (format === "mp4" && typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    } else if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      mimeType = "video/webm;codecs=vp9";
    } else if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      mimeType = "video/webm;codecs=vp8";
    }

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onerror = (e: any) => {
      state = EncoderState.ERROR;
      lastError = new Error(e?.error?.message || "MediaRecorder error");
    };

    mediaRecorder.start();
    state = EncoderState.PROCESSING;

    const addFrame = async (canvasSource: HTMLCanvasElement | OffscreenCanvas) => {
      if (state !== EncoderState.PROCESSING) {
        throw new Error(`MediaRecorder is not processing (state: ${state})`);
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(canvasSource as any, 0, 0, width, height);
      await new Promise((r) => setTimeout(r, Math.max(5, Math.floor(1000 / fps))));
    };

    const finish = async (): Promise<Blob> => {
      if (finishPromise) return finishPromise;
      if (state === EncoderState.CLOSED && finalBlob) return finalBlob;
      if (state === EncoderState.ERROR) throw lastError || new Error("MediaRecorder in ERROR state");
      if (state === EncoderState.CANCELLED) throw new Error("MediaRecorder was CANCELLED");

      state = EncoderState.FLUSHING;

      finishPromise = new Promise<Blob>((resolve, reject) => {
        mediaRecorder.onstop = () => {
          state = EncoderState.CLOSED;
          try {
            audioContext?.close();
          } catch {}
          // Determine actual output format
          const actualMime = mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm";
          finalBlob = new Blob(chunks, { type: actualMime });
          canvas.width = 1;
          canvas.height = 1;
          resolve(finalBlob);
        };
        try {
          mediaRecorder.stop();
        } catch (err: any) {
          state = EncoderState.ERROR;
          lastError = err;
          try {
            audioContext?.close();
          } catch {}
          reject(err);
        }
      });

      return finishPromise;
    };

    const cancel = () => {
      if (state === EncoderState.CLOSED || state === EncoderState.CANCELLED) return;
      state = EncoderState.CANCELLED;
      try {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      } catch {}
      try {
        audioContext?.close();
      } catch {}
      canvas.width = 1;
      canvas.height = 1;
    };

    const getError = () => lastError;

    return {
      get state() {
        return state;
      },
      addFrame,
      finish,
      cancel,
      getError,
    };
  }
}
