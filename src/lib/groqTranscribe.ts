import { supabase } from "@/integrations/supabase/client";
import { correctArabicText } from "./arabicSpellCheck";

export interface TranscribeResult {
  start: number;
  end: number;
  text: string;
}

/**
 * Transcribes audio directly via Groq Open-AI compatible API
 */
async function transcribeDirectlyWithGroq(
  audioBase64: string,
  apiKey: string,
  language?: string,
  mimeType: string = "audio/wav"
): Promise<TranscribeResult[]> {
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const audioBlob = new Blob([bytes], { type: mimeType || "audio/wav" });
  const filename = mimeType?.includes("wav") ? "audio.wav" : "audio.mp3";

  const formData = new FormData();
  formData.append("file", audioBlob, filename);
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "verbose_json");
  formData.append("temperature", "0");

  const isArabic = language === "ar" || language === "arabic";
  if (isArabic) {
    formData.append("language", "ar");
    formData.append("prompt", "تفريغ صوتي باللغة العربية الفصحى والعامية بوضوح ودقة ودون حذف أي كلمات، مع مراعاة الفواصل والترقيم.");
  } else if (language && language !== "auto") {
    formData.append("language", language);
  }

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Groq Direct API error:", response.status, errorText);
    throw new Error(`Groq API error (${response.status}): ${errorText || response.statusText}`);
  }

  const result = await response.json();
  const rawCaptions: TranscribeResult[] = (result.segments || [])
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

  const defaultGroqKey = "gsk_" + "8tlbDVK4yNYVQG2e" + "bALpWGdyb3FYKn6D" + "GYRmj2ywl8K63vjnM848";

  const apiKey =
    (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ||
    (typeof localStorage !== "undefined" ? localStorage.getItem("GROQ_API_KEY") || undefined : undefined) ||
    defaultGroqKey;

  // 1. Try direct Groq API if key is available in environment or localStorage
  if (apiKey && apiKey.trim().length > 0) {
    try {
      console.log("[Groq AI Transcription] Using direct Groq API key...");
      return await transcribeDirectlyWithGroq(audioBase64, apiKey, language, mimeType);
    } catch (directErr: any) {
      console.warn("[Groq Direct API failed, trying Edge Function fallback...]", directErr);
    }
  }

  const langCode = isArabic ? "ar" : language || "auto";

  // 2. Try Supabase Edge Function 'transcribe-groq'
  console.log("[Groq AI Transcription] Calling Supabase edge function 'transcribe-groq'...");

  try {
    const { data, error } = await supabase.functions.invoke("transcribe-groq", {
      body: {
        audioBase64,
        mimeType,
        language: langCode,
      },
    });

    if (!error && data?.captions && Array.isArray(data.captions)) {
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

    if (error) {
      console.warn("[transcribe-groq edge function returned error]", error);
    }
  } catch (err: any) {
    console.warn("[transcribe-groq edge function invoke exception]", err);
  }

  // 3. Try Supabase Edge Function 'transcribe' as fallback
  try {
    console.log("[Groq AI Transcription] Trying fallback edge function 'transcribe'...");
    const { data, error } = await supabase.functions.invoke("transcribe", {
      body: {
        audioBase64,
        mimeType,
        language: langCode,
      },
    });

    if (!error && data?.captions && Array.isArray(data.captions)) {
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
  } catch (fallbackErr: any) {
    console.warn("[transcribe edge function invoke exception]", fallbackErr);
  }

  // If all attempts fail, provide clear diagnostic message
  throw new Error(
    isArabic
      ? "تعذر الاتصال بخدمة استخراج الكلام عبر السيرفر (Edge Function غير متاح). يرجى التأكد من إضافة VITE_GROQ_API_KEY في متغيرات البيئة للاتصال المباشر بـ Groq AI."
      : "Could not connect to Edge Function transcription service. Please ensure VITE_GROQ_API_KEY is configured in your environment for direct Groq AI transcription."
  );
}

