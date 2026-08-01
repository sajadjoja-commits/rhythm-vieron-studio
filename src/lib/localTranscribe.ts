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

    worker.onerror = (e) => {
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
  try {
    return await runTranscribeWorker(audioBase64, language, onProgress, modelPreference);
  } catch (err: any) {
    console.error("Local transcription failed:", err);
    throw err;
  }
}

