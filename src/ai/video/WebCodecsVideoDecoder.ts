/**
 * WebCodecs Hardware Video Decoder with Streaming Demuxer & Bounded Backpressure
 * Eliminates HTMLVideoElement per-frame seeking, preventing freezing, dropped frames, and stutter.
 * Delivers exact hardware-decoded VideoFrames directly from GPU memory.
 */

import * as MP4Box from "mp4box";

export interface DecodedVideoMeta {
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  totalFrames: number;
  codec: string;
}

export interface DecodedFrameItem {
  frame: VideoFrame;
  timestampMicros: number;
  frameIndex: number;
  isKeyFrame: boolean;
}

export class WebCodecsVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private mp4File: any = null;
  private frameQueue: DecodedFrameItem[] = [];
  private pendingResolvers: Array<(item: DecodedFrameItem | null) => void> = [];
  private isEnded = false;
  private decodeError: Error | null = null;
  private maxQueueSize = 6;
  private trackId: number = -1;
  private samplesProcessed = 0;
  private totalSamples = 0;
  private meta: DecodedVideoMeta | null = null;
  private isPausedForBackpressure = false;
  private resumeBackpressure: (() => void) | null = null;
  private isClosed = false;

  /**
   * Checks whether WebCodecs VideoDecoder is natively supported in the current runtime environment
   */
  public static isSupported(): boolean {
    return typeof window !== "undefined" && typeof VideoDecoder === "function" && typeof EncodedVideoChunk === "function";
  }

  /**
   * Initializes demuxer and configures hardware VideoDecoder
   */
  public async prepare(videoInput: string | Blob | File | ArrayBuffer): Promise<DecodedVideoMeta> {
    if (!WebCodecsVideoDecoder.isSupported()) {
      throw new Error("[WebCodecsVideoDecoder] WebCodecs VideoDecoder is not supported in this browser.");
    }

    let arrayBuffer: ArrayBuffer;
    if (videoInput instanceof ArrayBuffer) {
      arrayBuffer = videoInput;
    } else if (typeof videoInput === "string") {
      const resp = await fetch(videoInput);
      if (!resp.ok) throw new Error(`[WebCodecsVideoDecoder] Failed to fetch video from URL: ${resp.status}`);
      arrayBuffer = await resp.arrayBuffer();
    } else {
      arrayBuffer = await (videoInput as Blob).arrayBuffer();
    }

    const mp4box = (MP4Box as any)?.createFile ? (MP4Box as any) : ((MP4Box as any)?.default || MP4Box);
    this.mp4File = mp4box.createFile();

    const readyPromise = new Promise<{ track: any; info: any }>((resolve, reject) => {
      this.mp4File.onError = (err: any) => {
        reject(new Error(`[WebCodecsVideoDecoder] MP4Box demuxing error: ${err}`));
      };

      this.mp4File.onReady = (info: any) => {
        if (!info || !info.videoTracks || info.videoTracks.length === 0) {
          reject(new Error("[WebCodecsVideoDecoder] No video tracks found in MP4 container."));
          return;
        }
        const track = info.videoTracks[0];
        resolve({ track, info });
      };
    });

    // Feed buffer into MP4Box (MP4Box requires fileStart offset on the buffer)
    (arrayBuffer as any).fileStart = 0;
    this.mp4File.appendBuffer(arrayBuffer);
    this.mp4File.flush();

    const { track, info } = await readyPromise;
    this.trackId = track.id;
    this.totalSamples = track.nb_samples || 0;

    const width = track.video.width || track.track_width || 1280;
    const height = track.video.height || track.track_height || 720;
    const timescale = track.timescale || 1000;
    const durationSeconds = track.duration && timescale ? track.duration / timescale : (info.duration || 1000) / (info.timescale || 1000);
    const calculatedFps = track.nb_samples && durationSeconds > 0 ? Math.round(track.nb_samples / durationSeconds) : 30;
    const fps = Math.min(120, Math.max(15, calculatedFps));
    const totalFrames = track.nb_samples || Math.max(1, Math.floor(durationSeconds * fps));

    this.meta = {
      width,
      height,
      durationSeconds,
      fps,
      totalFrames,
      codec: track.codec,
    };

    // Extract codec configuration box (e.g. avcC, hvcC, vpcC, av1C)
    const description = this.extractCodecDescription(track, mp4box);

    let frameOutputIndex = 0;

    this.decoder = new VideoDecoder({
      output: (videoFrame: VideoFrame) => {
        if (this.isClosed) {
          try { videoFrame.close(); } catch {}
          return;
        }

        const timestampMicros = videoFrame.timestamp;
        const item: DecodedFrameItem = {
          frame: videoFrame,
          timestampMicros,
          frameIndex: frameOutputIndex++,
          isKeyFrame: false,
        };

        if (this.pendingResolvers.length > 0) {
          const resolver = this.pendingResolvers.shift()!;
          resolver(item);
        } else {
          this.frameQueue.push(item);
        }
      },
      error: (e: any) => {
        console.error("[WebCodecsVideoDecoder] Decoder fatal error:", e);
        this.decodeError = e instanceof Error ? e : new Error(String(e));
        while (this.pendingResolvers.length > 0) {
          const resolver = this.pendingResolvers.shift()!;
          resolver(null);
        }
      },
    });

    const decoderConfig: VideoDecoderConfig = {
      codec: track.codec,
      codedWidth: width,
      codedHeight: height,
      hardwareAcceleration: "prefer-hardware",
      ...(description ? { description } : {}),
    };

    const isSupported = await VideoDecoder.isConfigSupported(decoderConfig);
    if (!isSupported.supported) {
      throw new Error(`[WebCodecsVideoDecoder] VideoDecoder does not support codec ${track.codec}`);
    }

    this.decoder.configure(decoderConfig);

    // Setup sample extraction pipeline with bounded backpressure
    this.startDemuxPipeline(timescale);

    return this.meta;
  }

  /**
   * Streams samples through the demuxer into the VideoDecoder with bounded backpressure
   */
  private startDemuxPipeline(timescale: number): void {
    this.mp4File.onSamples = async (trackId: number, user: any, samples: any[]) => {
      if (this.isClosed || trackId !== this.trackId || !this.decoder) return;

      for (const sample of samples) {
        if (this.isClosed || !this.decoder) break;

        // Apply Bounded Backpressure: pause decoding when queue reaches maxQueueSize
        while (this.frameQueue.length >= this.maxQueueSize && !this.isClosed) {
          this.isPausedForBackpressure = true;
          await new Promise<void>((resolve) => {
            this.resumeBackpressure = resolve;
          });
          this.isPausedForBackpressure = false;
        }

        if (this.isClosed || !this.decoder) break;

        const timestamp = Math.round((1_000_000 * sample.cts) / timescale);
        const duration = Math.round((1_000_000 * sample.duration) / timescale);

        const chunk = new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp,
          duration,
          data: sample.data,
        });

        try {
          this.decoder.decode(chunk);
          this.samplesProcessed++;
        } catch (err: any) {
          console.warn("[WebCodecsVideoDecoder] Chunk decode error:", err);
        }
      }

      // Check if all samples have been queued
      if (this.samplesProcessed >= this.totalSamples && !this.isClosed && this.decoder) {
        try {
          await this.decoder.flush();
        } catch {}
        this.isEnded = true;
        while (this.pendingResolvers.length > 0) {
          const resolver = this.pendingResolvers.shift()!;
          resolver(this.frameQueue.shift() || null);
        }
      }
    };

    this.mp4File.setExtractionOptions(this.trackId, null, { nbSamples: 100 });
    this.mp4File.start();
  }

  /**
   * Retrieves the next decoded VideoFrame.
   * Call `frame.close()` when finished with the returned frame to avoid memory leaks!
   */
  public async getNextFrame(): Promise<DecodedFrameItem | null> {
    if (this.decodeError) {
      throw this.decodeError;
    }

    if (this.frameQueue.length > 0) {
      const item = this.frameQueue.shift()!;
      // Release backpressure if queue fell below limit
      if (this.isPausedForBackpressure && this.frameQueue.length < this.maxQueueSize) {
        if (this.resumeBackpressure) {
          const resume = this.resumeBackpressure;
          this.resumeBackpressure = null;
          resume();
        }
      }
      return item;
    }

    if (this.isEnded) {
      return null;
    }

    // Await next incoming frame
    return new Promise<DecodedFrameItem | null>((resolve) => {
      this.pendingResolvers.push(resolve);
      // Release backpressure if needed
      if (this.isPausedForBackpressure) {
        if (this.resumeBackpressure) {
          const resume = this.resumeBackpressure;
          this.resumeBackpressure = null;
          resume();
        }
      }
    });
  }

  public getMeta(): DecodedVideoMeta | null {
    return this.meta;
  }

  public getQueueLength(): number {
    return this.frameQueue.length;
  }

  /**
   * Disposes decoder, closes any remaining VideoFrames, and frees memory
   */
  public close(): void {
    this.isClosed = true;
    if (this.resumeBackpressure) {
      this.resumeBackpressure();
      this.resumeBackpressure = null;
    }

    for (const item of this.frameQueue) {
      try {
        item.frame.close();
      } catch {}
    }
    this.frameQueue = [];

    while (this.pendingResolvers.length > 0) {
      const resolver = this.pendingResolvers.shift()!;
      resolver(null);
    }

    if (this.decoder) {
      try {
        if (this.decoder.state !== "closed") {
          this.decoder.close();
        }
      } catch {}
      this.decoder = null;
    }

    this.mp4File = null;
  }

  /**
   * Extracts AVC/HEVC/VPC/AV1 configuration box from MP4 track
   */
  private extractCodecDescription(track: any, mp4box: any): Uint8Array | undefined {
    try {
      const stsd = track.mdia?.minf?.stbl?.stsd;
      if (!stsd || !stsd.entries || !stsd.entries[0]) return undefined;
      const entry = stsd.entries[0];
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (!box) return undefined;
      const stream = new (mp4box as any).DataStream(undefined, 0, (mp4box as any).DataStream.BIG_ENDIAN);
      box.write(stream);
      // Strip box size (4 bytes) and box type (4 bytes)
      return new Uint8Array(stream.buffer, 8);
    } catch (err) {
      console.warn("[WebCodecsVideoDecoder] Could not parse codec configuration box:", err);
      return undefined;
    }
  }
}
