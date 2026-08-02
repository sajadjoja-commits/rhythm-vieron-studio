import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Segment {
  start: number;
  end: number;
  text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { audioBase64, mimeType, language, prompt } = await req.json();
    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY secret is not configured in Supabase dashboard." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert base64 to binary ArrayBuffer
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a Blob from the byte array
    const audioBlob = new Blob([bytes], { type: mimeType || "audio/mp3" });
    const filename = mimeType?.includes("wav") ? "audio.wav" : "audio.mp3";

    // Build the multipart form-data payload for Groq API
    const defaultArabicPrompt =
      "يرجى تفريغ الصوت بدقة عالية: حافظ على اللهجة العربية المستخدمة كما هي دون تصحيحها إلى الفصحى، لا تترجم أي كلام، اكتب الأرقام بالشكل الصحيح، أضف علامات الترقيم المناسبة (نقطة، فاصلة، علامة استفهام)، ولا تحذف أي تكرار مقصود في الكلام.";

    const formData = new FormData();
    formData.append("file", audioBlob, filename);
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");
    formData.append("temperature", "0");
    formData.append("prompt", prompt || defaultArabicPrompt);
    
    if (language) {
      formData.append("language", language);
    }

    console.log(`Sending transcription request to Groq API using model whisper-large-v3, language: ${language || "auto"}`);

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error response:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Groq transcription failed: ${response.statusText}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Groq transcription request succeeded. Mapping segments...");

    const captions: Segment[] = (result.segments || []).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text?.trim() || "",
    }));

    return new Response(JSON.stringify({ captions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Transcribe-groq function exception:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
