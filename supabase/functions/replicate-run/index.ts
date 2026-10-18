import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MODEL = "black-forest-labs/flux-2-pro";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action = "run", input, predictionId, model = DEFAULT_MODEL } = body;

    const headers = {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    };

    if (action === "create") {
      if (!input || (!input.prompt && !input.image)) {
        return new Response(
          JSON.stringify({ error: "Invalid Input: 'prompt' or 'image' field is required in input payload." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[replicate-run] Creating prediction for model: ${model}`);
      const createRes = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error(`[replicate-run] Replicate create error ${createRes.status}:`, errText);
        return new Response(
          JSON.stringify({
            error: `Replicate API Error (${createRes.status}): ${errText}`,
            statusCode: createRes.status,
          }),
          { status: createRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const predictionData = await createRes.json();
      return new Response(
        JSON.stringify({
          predictionId: predictionData.id,
          status: predictionData.status,
          output: predictionData.output,
          error: predictionData.error,
          urls: predictionData.urls,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "poll") {
      if (!predictionId) {
        return new Response(
          JSON.stringify({ error: "Invalid Input: 'predictionId' is required for polling." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        },
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        console.error(`[replicate-run] Replicate poll error ${pollRes.status}:`, errText);
        return new Response(
          JSON.stringify({
            error: `Replicate API Error (${pollRes.status}): ${errText}`,
            statusCode: pollRes.status,
          }),
          { status: pollRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pollData = await pollRes.json();
      return new Response(
        JSON.stringify({
          predictionId: pollData.id,
          status: pollData.status,
          output: pollData.output,
          error: pollData.error,
          metrics: pollData.metrics,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "run") {
      if (!input || (!input.prompt && !input.image)) {
        return new Response(
          JSON.stringify({ error: "Invalid Input: 'prompt' or 'image' field is required in input payload." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Create prediction
      console.log(`[replicate-run] Creating single-shot prediction for model: ${model}`);
      const createRes = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error(`[replicate-run] Replicate create error ${createRes.status}:`, errText);
        return new Response(
          JSON.stringify({
            error: `Replicate API Error (${createRes.status}): ${errText}`,
            statusCode: createRes.status,
          }),
          { status: createRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let predData = await createRes.json();
      const currentPredId = predData.id;

      // 2. Poll until terminal state
      const startTime = Date.now();
      const timeoutMs = 120000; // 2 minutes

      while (
        predData.status === "starting" ||
        predData.status === "processing"
      ) {
        if (Date.now() - startTime > timeoutMs) {
          return new Response(
            JSON.stringify({
              error: `Prediction timed out after ${timeoutMs / 1000} seconds`,
              predictionId: currentPredId,
              status: "failed",
            }),
            { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${currentPredId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          },
        });

        if (pollRes.ok) {
          predData = await pollRes.json();
        }
      }

      return new Response(
        JSON.stringify({
          predictionId: predData.id,
          status: predData.status,
          output: predData.output,
          error: predData.error,
          metrics: predData.metrics,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported action: '${action}'` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[replicate-run] Exception:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
