import { correctArabicText } from "./arabicSpellCheck";
import { detectSilenceGaps, alignCaptionsToSilenceGaps } from "./vadUtils";

export interface TranscribeResult {
  start: number;
  end: number;
  text: string;
}

function preprocessAudio(float32Data: Float32Array): Float32Array {
  // 1. Peak Normalization to ~0.95
  let maxVal = 0;
  for (let i = 0; i < float32Data.length; i++) {
    const absVal = Math.abs(float32Data[i]);
    if (absVal > maxVal) maxVal = absVal;
  }

  if (maxVal > 0) {
    const multiplier = 0.95 / maxVal;
    for (let i = 0; i < float32Data.length; i++) {
      float32Data[i] *= multiplier;
    }
  }

  // 2. Simple Noise Gate (-50dB threshold)
  const threshold = 0.00316;
  for (let i = 0; i < float32Data.length; i++) {
    if (Math.abs(float32Data[i]) < threshold) {
      float32Data[i] = 0;
    }
  }

  return float32Data;
}

/**
 * Transcribe using Whisper Large-v3 via Groq Cloud API for maximum Arabic accuracy & speed.
 */
async function transcribeWithGroqLargeV3(
  audioBase64: string,
  language: string,
  apiKey: string
): Promise<TranscribeResult[] | null> {
  try {
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const audioBlob = new Blob([bytes], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.wav");
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");

    if (language) {
      const langCode = (language === "ar" || language === "arabic") ? "ar" : language;
      formData.append("language", langCode);
    }

    console.log("[Whisper Large-v3 Engine] Transcribing via Groq Cloud API (whisper-large-v3)...");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Whisper Large-v3 Engine] Groq API returned ${res.status}:`, errText);
      return null;
    }

    const data = await res.json();
    if (data && Array.isArray(data.segments)) {
      console.log(`[Whisper Large-v3 Engine] Successfully extracted ${data.segments.length} segments via whisper-large-v3`);
      return data.segments
        .map((seg: any) => ({
          start: Math.round(Number(seg.start || 0) * 100) / 100,
          end: Math.round(Number(seg.end || seg.start + 2) * 100) / 100,
          text: String(seg.text || "").trim(),
        }))
        .filter((seg: any) => seg.text.length > 0);
    }
    return null;
  } catch (err) {
    console.warn("[Whisper Large-v3 Engine] Groq API call failed, falling back to local worker:", err);
    return null;
  }
}

function runTranscribeWorker(
  audioBase64: string,
  language: string,
  onProgress?: (message: string, progress?: number) => void,
  modelPreference?: string
): Promise<TranscribeResult[]> {
  return new Promise((resolve, reject) => {
    // Convert base64 back to Float32Array
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert WAV bytes to Float32Array (skipping 44 bytes header)
    const audioData = new Int16Array(bytes.buffer, 44);
    let float32Data = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      float32Data[i] = audioData[i] / 32768.0;
    }

    // Apply Preprocessing (Normalization & Noise Gate)
    float32Data = preprocessAudio(float32Data);

    // VAD: Detect natural speech silence gaps from raw audio Float32 amplitudes
    const sampleRate = 16000;
    const audioDuration = float32Data.length / sampleRate;
    const silenceGaps = detectSilenceGaps(float32Data, sampleRate);

    const worker = new Worker(new URL("./whisper-worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (e) => {
      const { status, message, captions, error, progress } = e.data;

      if (status === "loading" || status === "processing") {
        onProgress?.(message, progress);
      } else if (status === "done") {
        worker.postMessage({ action: "cleanup" });
        worker.terminate();

        const isArabic = language === "ar" || language === "arabic";

        // 1. Align caption segment start & end boundaries to VAD silence gaps
        let processedCaptions = alignCaptionsToSilenceGaps(captions || [], silenceGaps, audioDuration);

        // 2. High-confidence Arabic spell correction pass
        if (isArabic && processedCaptions.length > 0) {
          processedCaptions = processedCaptions.map((cap) => ({
            ...cap,
            text: correctArabicText(cap.text),
          }));
        }

        resolve(processedCaptions);
      } else if (status === "error") {
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Worker failed to start or crashed"));
    };

    worker.postMessage({ audio: float32Data, language, modelPreference });
  });
}

export async function localTranscribe(
  audioBase64: string,
  language: string,
  onProgress?: (message: string, progress?: number) => void,
  modelPreference?: string
): Promise<TranscribeResult[]> {
  const isArabic = language === "ar" || language === "arabic";
  const groqApiKey = 
    (typeof process !== "undefined" && process.env?.VITE_GROQ_API_KEY) ||
    (import.meta.env && import.meta.env.VITE_GROQ_API_KEY) ||
    (typeof process !== "undefined" && process.env?.Vireon) ||
    "";

  // Calculate audio VAD & duration for alignment
  let silenceGaps: any[] = [];
  let audioDuration = 0;
  try {
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioData = new Int16Array(bytes.buffer, 44);
    const float32Data = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      float32Data[i] = audioData[i] / 32768.0;
    }
    const sampleRate = 16000;
    audioDuration = float32Data.length / sampleRate;
    silenceGaps = detectSilenceGaps(float32Data, sampleRate);
  } catch (e) {
    console.warn("VAD audio pre-calculation error:", e);
  }

  // 1. Try Whisper Large-v3 via Groq API (Highest accuracy & instant speed)
  if (groqApiKey) {
    onProgress?.("جاري استخراج الكلام بدقة Whisper Large-v3 عالية...", 25);
    const groqCaptions = await transcribeWithGroqLargeV3(audioBase64, language, groqApiKey);
    if (groqCaptions && groqCaptions.length > 0) {
      onProgress?.("جاري ضبط توقيت الكابشن مع الفواصل والتصحيح...", 90);
      let processed = alignCaptionsToSilenceGaps(groqCaptions, silenceGaps, audioDuration);
      if (isArabic) {
        processed = processed.map((c) => ({ ...c, text: correctArabicText(c.text) }));
      }
      return processed;
    }
  }

  // 2. Fallback to Local Worker with Whisper Large-v3 Turbo (or specified preference)
  try {
    onProgress?.("جاري التحويل لنموذج Whisper المحتفظ المحلي...", 30);
    return await runTranscribeWorker(audioBase64, language, onProgress, modelPreference || "onnx-community/whisper-large-v3-turbo");
  } catch (err: any) {
    console.error("Local transcription failed:", err);
    throw err;
  }
}


