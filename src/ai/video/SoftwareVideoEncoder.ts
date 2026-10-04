import { FFmpeg } from "@ffmpeg/ffmpeg";
import { EncoderSession } from "./VideoEncoderEngine";
import { VideoAIOptions } from "./types";

/** Timestamped software fallback. Compressed frames are bounded and never recorded at processing speed. */
export async function createSoftwareVideoSession(params: {
  width: number; height: number; fps: number; format: "mp4" | "webm";
  audioBuffer?: AudioBuffer | null; options?: VideoAIOptions;
}): Promise<EncoderSession> {
  const ffmpeg = new FFmpeg();
  let state: EncoderSession["state"] = "CREATED" as EncoderSession["state"];
  let error: Error | null = null;
  const files: { name: string; timestamp: number }[] = [];
  let bytes = 0;
  let finishPromise: Promise<Blob> | null = null;
  const canvas = document.createElement("canvas");
  canvas.width = params.width;
  canvas.height = params.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable for software encoding.");
  try {
    await ffmpeg.load({ coreURL: "/ffmpeg/ffmpeg-core.js", wasmURL: "/ffmpeg/ffmpeg-core.wasm" });
  } catch (cause) {
    ffmpeg.terminate();
    throw new Error("تعذر تشغيل حفظ الفيديو على هذا الجهاز. أعد فتح التطبيق مع اتصال بالإنترنت.", { cause });
  }
  state = "PROCESSING" as EncoderSession["state"];

  const addFrame: EncoderSession["addFrame"] = async (source, timestamp) => {
    if (state !== "PROCESSING") throw error || new Error("Video encoding cancelled.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Failed to save processed frame.")), "image/png"));
    bytes += blob.size;
    if (bytes > 192 * 1024 * 1024) throw new Error("المقطع كبير للمعالجة المحلية على هذا الجهاز. قصّ المقطع أو اختر دقة أقل.");
    const name = `frame-${String(files.length).padStart(7, "0")}.png`;
    await ffmpeg.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
    files.push({ name, timestamp });
  };
  const finish = (): Promise<Blob> => {
    if (finishPromise) return finishPromise;
    finishPromise = (async () => {
      if (state !== "PROCESSING" || !files.length) throw error || new Error("No encoded video frames.");
      state = "FLUSHING" as EncoderSession["state"];
      try {
        const end = files[files.length - 1].timestamp / 1e6 + 1 / params.fps;
        const timeline = files.map((file, i) => `file '${file.name}'\nduration ${
          i + 1 < files.length ? Math.max(0.000001, (files[i + 1].timestamp - file.timestamp) / 1e6) : 1 / params.fps
        }`).join("\n") + `\nfile '${files[files.length - 1].name}'\n`;
        await ffmpeg.writeFile("frames.txt", timeline);
        const args = ["-f", "concat", "-safe", "0", "-i", "frames.txt"];
        if (params.audioBuffer) {
          await ffmpeg.writeFile("audio.wav", encodeWav(params.audioBuffer));
          args.push("-i", "audio.wav");
        }
        const alpha = params.options?.backgroundColor === "transparent" && params.format === "webm";
        args.push("-t", String(end), "-vsync", "vfr");
        if (params.format === "webm") {
          args.push("-c:v", "libvpx", "-pix_fmt", alpha ? "yuva420p" : "yuv420p", "-auto-alt-ref", "0", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "2500k");
          if (params.audioBuffer) args.push("-c:a", "libopus");
        } else {
          args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
          if (params.audioBuffer) args.push("-c:a", "aac");
        }
        const output = `output.${params.format}`;
        const code = await ffmpeg.exec([...args, output]);
        if (code !== 0) throw new Error("فشل حفظ الفيديو المعالج. جرّب مقطعاً أقصر أو دقة أقل.");
        const data = await ffmpeg.readFile(output);
        if (typeof data === "string") throw new Error("Invalid video output.");
        state = "CLOSED" as EncoderSession["state"];
        return new Blob([new Uint8Array(data)], { type: `video/${params.format}` });
      } catch (cause) {
        error = cause instanceof Error ? cause : new Error(String(cause));
        state = "ERROR" as EncoderSession["state"];
        throw error;
      } finally {
        ffmpeg.terminate();
        canvas.width = canvas.height = 1;
      }
    })();
    return finishPromise;
  };
  return { get state() { return state; }, addFrame, finish, getError: () => error,
    cancel() { state = "CANCELLED" as EncoderSession["state"]; ffmpeg.terminate(); canvas.width = canvas.height = 1; } };
}

export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = Math.min(2, buffer.numberOfChannels);
  const bytes = new Uint8Array(44 + buffer.length * channels * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, bytes.length - 44, true);
  for (let c = 0; c < channels; c++) {
    const samples = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const sample = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
      view.setInt16(44 + (i * channels + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
  }
  return bytes;
}