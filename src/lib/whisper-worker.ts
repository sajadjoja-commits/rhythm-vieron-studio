import { pipeline, env } from "@xenova/transformers";
import { correctArabicText } from "./arabicSpellCheck";

// Optimized Faster-Whisper configuration for Transformers.js in Web Worker
env.allowLocalModels = false;
env.allowRemoteModels = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = Math.min(4, typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2);
  env.backends.onnx.wasm.simd = true;
}

let transcriber: any = null;
let currentModelName: string | null = null;

// Clean Arabic text for better readability and diacritic/tatweel handling
function normalizeArabicText(text: string): string {
  if (!text) return "";
  const clean = text
    .replace(/ـ+/g, "") // Remove Tatweel (kashida)
    .replace(/[\u064B-\u065F]/g, "") // Remove short vowels/diacritics if cluttered
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
  
  return clean;
}

const loadModelWithRetry = async (modelName: string, progress_callback: any, maxRetries = 2) => {
  // Safe web worker check for Capacitor Android (served via WebViewAssetLoader at https://localhost)
  const isAndroidNative = typeof self !== "undefined" && self.location?.origin === "https://localhost";

  if (isAndroidNative) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;

    // In Capacitor Android webview context, assets bundled in android/app/src/main/assets/models/
    // are served directly by WebViewAssetLoader relative to origin (e.g. https://localhost/models/)
    const origin = typeof self !== "undefined" && self.location?.origin ? self.location.origin : "https://localhost";
    env.localModelPath = `${origin}/models/`;

    console.log(`[Faster-Whisper ONNX Native Android] Attempting local model "whisper-base" from ${env.localModelPath} (Offline native load)`);

    try {
      const model = await pipeline("automatic-speech-recognition", "whisper-base", {
        quantized: true,
        progress_callback,
      });
      currentModelName = "whisper-base";
      console.log(`[Faster-Whisper ONNX Native Android] Successfully loaded local "whisper-base" model`);
      return model;
    } catch (baseErr: any) {
      console.warn("[Faster-Whisper ONNX Native Android] Local whisper-base failed, falling back to local whisper-tiny:", baseErr);
      try {
        const model = await pipeline("automatic-speech-recognition", "whisper-tiny", {
          quantized: true,
          progress_callback,
        });
        currentModelName = "whisper-tiny";
        console.log(`[Faster-Whisper ONNX Native Android] Successfully loaded fallback local "whisper-tiny" model`);
        return model;
      } catch (tinyErr: any) {
        console.error("[Faster-Whisper ONNX Native Android] Both local whisper-base and whisper-tiny failed:", tinyErr);
        throw tinyErr;
      }
    }
  }

  // Web / PWA mode: Keep current remote fetch logic with mirror fallbacks
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  const hosts = ["https://huggingface.co", "https://hf-mirror.com"];
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const host of hosts) {
      try {
        env.remoteHost = host;
        console.log(`[Faster-Whisper ONNX Web] Loading ${modelName} from ${host} (Attempt ${attempt}/${maxRetries})`);
        
        const model = await pipeline("automatic-speech-recognition", modelName, {
          quantized: true,
          progress_callback,
        });
        
        currentModelName = modelName;
        return model;
      } catch (error: any) {
        lastError = error;
        try {
          const model = await pipeline("automatic-speech-recognition", modelName, {
            quantized: true,
            progress_callback,
          });
          currentModelName = modelName;
          return model;
        } catch (wasmError) {}
      }
    }
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  throw lastError || new Error(`Failed to load ${modelName}`);
};

self.onmessage = async (e) => {
  const { audio, language, action, modelPreference } = e.data;

  if (action === "cleanup") {
    transcriber = null;
    currentModelName = null;
    self.postMessage({ status: "cleanup_done" });
    return;
  }

  try {
    const isArabic = language === "ar" || language === "arabic";
    // Whisper Large-v3 Turbo by default, or specified modelPreference
    const targetModel = modelPreference || "onnx-community/whisper-large-v3-turbo";

    if (!transcriber || currentModelName !== targetModel) {
      const progress_callback = (data: any) => {
        if (data.status === "progress") {
          const progressPct = data.progress ? Math.round(data.progress) : 0;
          self.postMessage({
            status: "loading",
            progress: progressPct,
            message: "جاري استخراج الكلام بدقة Whisper Large-v3 Turbo..."
          });
        }
      };

      try {
        transcriber = await loadModelWithRetry(targetModel, progress_callback);
      } catch (err) {
        console.warn(`[Whisper Worker] Loading ${targetModel} failed, trying fallback ladder...`, err);
        const fallbacks = ["Xenova/whisper-small", "Xenova/whisper-base", "Xenova/whisper-tiny"];
        let loaded = false;
        for (const fbModel of fallbacks) {
          try {
            self.postMessage({
              status: "loading",
              progress: 15,
              message: `جاري تحميل نموذج Whisper التكيفي (${fbModel})...`
            });
            transcriber = await loadModelWithRetry(fbModel, progress_callback);
            loaded = true;
            break;
          } catch (fbErr) {
            console.warn(`[Whisper Worker] Fallback model ${fbModel} failed:`, fbErr);
          }
        }
        if (!loaded) {
          throw err;
        }
      }
      self.postMessage({ status: "ready" });
    }

    self.postMessage({ status: "processing", message: "جاري استخراج الكلام..." });

    // Faster-Whisper settings: Greedy decoding (num_beams: 1) for 5x speed
    const result = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 2,
      language: isArabic ? "arabic" : language,
      task: "transcribe",
      return_timestamps: true,
      num_beams: 1,
      temperature: 0.0,
    });

    // Post-processing: Normalize, spell-check, and trim Arabic text
    let captions = result.chunks
      .map((chunk: any) => {
        let text = chunk.text.trim();
        if (isArabic) {
          text = normalizeArabicText(text);
          text = correctArabicText(text);
        }
        return {
          start: Math.round(chunk.timestamp[0] * 100) / 100,
          end: Math.round((chunk.timestamp[1] || chunk.timestamp[0] + 2) * 100) / 100,
          text,
        };
      })
      .filter((cap: any) => cap.text && cap.text.length > 0);

    // Remove consecutive duplicates
    captions = captions.filter((cap: any, index: number) => {
      if (index === 0) return true;
      return cap.text !== captions[index - 1].text;
    });

    self.postMessage({ status: "done", captions });
  } catch (error: any) {
    console.error("Faster-Whisper Worker Error:", error);
    self.postMessage({ 
      status: "error", 
      error: `فشل معالجة الصوت عبر Faster-Whisper. (التفاصيل: ${error.message || error})` 
    });
  }
};

