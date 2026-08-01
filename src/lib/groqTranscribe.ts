import { supabase } from "@/integrations/supabase/client";
import { correctArabicText } from "./arabicSpellCheck";

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
  const isArabic = language === "ar" || language === "arabic";

  // Check online status first
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error(
      isArabic
        ? "تنبيه: يلزم وجود اتصال بالإنترنت لاستخراج الكلام عبر Groq AI."
        : "Internet connection is required for speech recognition via Groq AI."
    );
  }

  const langCode = isArabic ? "ar" : language || "auto";

  console.log("[Groq AI Transcription] Calling Supabase edge function 'transcribe-groq'...");

  const { data, error } = await supabase.functions.invoke("transcribe-groq", {
    body: {
      audioBase64,
      mimeType,
      language: langCode,
    },
  });

  if (error) {
    console.error("[Groq AI Transcription Error]", error);
    let errMsg = error.message || (isArabic ? "فشل استخراج الكلام عبر السيرفر" : "Groq transcription failed");
    
    // Attempt to parse edge function error response
    if (typeof error === "object" && error !== null && "context" in error) {
      try {
        const resObj = (error as any).context;
        if (resObj && typeof resObj.text === "function") {
          const bodyText = await resObj.text();
          const parsed = JSON.parse(bodyText);
          if (parsed?.error) errMsg = parsed.error;
        }
      } catch (err) {
        // use default error message
      }
    }
    throw new Error(errMsg);
  }

  if (!data) {
    throw new Error(
      isArabic
        ? "لم يتم استلام أي استجابة من خدمة استخراج الكلام"
        : "No response received from transcription service"
    );
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (Array.isArray(data.captions)) {
    const rawCaptions: TranscribeResult[] = data.captions
      .map((seg: any) => ({
        start: Math.round(Number(seg.start || 0) * 100) / 100,
        end: Math.round(Number(seg.end || seg.start + 2) * 100) / 100,
        text: String(seg.text || "").trim(),
      }))
      .filter((seg: TranscribeResult) => seg.text.length > 0);

    if (isArabic) {
      return rawCaptions.map((cap) => ({
        ...cap,
        text: correctArabicText(cap.text),
      }));
    }

    return rawCaptions;
  }

  return [];
}
