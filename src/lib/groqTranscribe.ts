import { aiManager } from "@/ai";

export interface TranscribeResult {
  start: number;
  end: number;
  text: string;
}

export async function transcribeWithGroq(
  audioBase64: string,
  language?: string,
  mimeType: string = "audio/wav"
): Promise<TranscribeResult[]> {
  const res = await aiManager.transcribe(audioBase64, language, {
    language,
    enableCache: true,
  });

  return res.captions.map((cap) => ({
    start: cap.start,
    end: cap.end,
    text: cap.text,
  }));
}


