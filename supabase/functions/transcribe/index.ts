import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Caption {
  start: number;
  end: number;
  text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { audioBase64, mimeType, language, totalDuration } = await req.json();
    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 مفقود" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY غير مهيأ");

    const langMap: Record<string, string> = {
      ar: "Arabic",
      en: "English",
      fr: "French",
      es: "Spanish",
      tr: "Turkish",
    };
    const langName = langMap[language] || "Arabic";

    const systemPrompt = `You are a professional speech-to-text transcriber. Transcribe the audio in ${langName}. Split into short caption segments (2-5 seconds each). Distribute timestamps proportionally across the total duration of ${totalDuration ?? "unknown"} seconds. Return ONLY via the provided tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Transcribe this audio in ${langName} and return timed caption segments.` },
              {
                type: "input_audio",
                input_audio: { data: audioBase64, format: mimeType?.includes("wav") ? "wav" : "mp3" },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_captions",
              description: "Return timed caption segments",
              parameters: {
                type: "object",
                properties: {
                  captions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        start: { type: "number", description: "start time seconds" },
                        end: { type: "number", description: "end time seconds" },
                        text: { type: "string" },
                      },
                      required: ["start", "end", "text"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["captions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_captions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات. حاول لاحقاً." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "الرصيد منتهي. أضف رصيد إلى مساحة عمل Lovable AI." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "فشل استخراج الكلام" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let captions: Caption[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        captions = Array.isArray(parsed.captions) ? parsed.captions : [];
      } catch (e) {
        console.error("parse error", e);
      }
    }

    return new Response(JSON.stringify({ captions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "خطأ غير معروف" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
