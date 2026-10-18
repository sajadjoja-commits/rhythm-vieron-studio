import { transcribeLocally } from "./localTranscribe";

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
  // Convert base64 to Blob and transcribe locally with Whisper
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const segments = await transcribeLocally(blob, { language });
  return segments.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
  }));
}



