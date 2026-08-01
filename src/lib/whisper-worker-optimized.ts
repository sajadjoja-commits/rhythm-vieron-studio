import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.backends.onnx.wasm.numThreads = 1;

let transcriber: any = null;
let isProcessing = false;

const loadModelWithRetry = async (progress_callback: any, maxRetries = 3) => {
  const isAndroidNative = typeof self !== "undefined" && self.location?.origin === "https://localhost";

  if (isAndroidNative) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    const origin = typeof self !== "undefined" && self.location?.origin ? self.location.origin : "https://localhost";
    env.localModelPath = `${origin}/models/`;

    console.log(`[Faster-Whisper Native Android] Loading local whisper-tiny from ${env.localModelPath}`);
    const model = await pipeline("automatic-speech-recognition", "whisper-tiny", {
      device: "wasm",
      quantized: true,
      progress_callback,
    });
    return model;
  }

  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  const hosts = ["https://huggingface.co", "https://hf-mirror.com"];
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const host of hosts) {
      try {
        env.remoteHost = host;
        const model = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
          device: "webgpu",
          progress_callback,
        });
        return model;
      } catch (error: any) {
        lastError = error;
        try {
          const model = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
            device: "wasm",
            progress_callback,
          });
          return model;
        } catch (wasmError) {}
      }
    }
    if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
  }
  throw lastError || new Error("Loading failed");
};

self.onmessage = async (e) => {
  const { audio, language, action } = e.data;

  try {
    if (action === "cleanup") {
      transcriber = null;
      self.postMessage({ status: "cleanup_done" });
      return;
    }

    if (!transcriber) {
      if (isProcessing) return;
      isProcessing = true;
      
      const progress_callback = (data: any) => {
        if (data.status === "progress") {
          const progressPct = data.progress ? Math.round(data.progress) : 0;
          self.postMessage({
            status: "loading",
            progress: progressPct,
            message: `تحميل: ${progressPct}%`
          });
        }
      };

      transcriber = await loadModelWithRetry(progress_callback);
      isProcessing = false;
      self.postMessage({ status: "ready" });
    }

    self.postMessage({ status: "processing", message: "جارٍ التحليل..." });

    const result = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 3, // Improved stride
      language: language === "ar" ? "arabic" : language,
      task: "transcribe",
      return_timestamps: true,
    });

    let captions = result.chunks
      .filter((chunk: any) => chunk.text && chunk.text.trim().length > 0)
      .map((chunk: any) => ({
        start: Math.round(chunk.timestamp[0] * 100) / 100,
        end: Math.round((chunk.timestamp[1] || chunk.timestamp[0] + 2) * 100) / 100,
        text: chunk.text.trim(),
      }));

    // Post-processing: Remove consecutive duplicates
    captions = captions.filter((cap: any, index: number) => {
      if (index === 0) return true;
      return cap.text !== captions[index - 1].text;
    });

    self.postMessage({ status: "done", captions });
  } catch (error: any) {
    isProcessing = false;
    self.postMessage({ status: "error", error: error.message });
  }
};
