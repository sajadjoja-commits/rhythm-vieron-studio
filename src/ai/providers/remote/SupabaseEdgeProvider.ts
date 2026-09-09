import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import { AITaskType, AITaskOptions, AIResponse, SpeechToTextPayload, SpeechToTextResult, CaptionSegment } from "../../types/ai";
import { supabase } from "@/integrations/supabase/client";
import { correctArabicText } from "@/lib/arabicSpellCheck";
import { createAIError } from "../../utils/errorUtils";

export class SupabaseEdgeProvider extends RemoteProvider {
  public id = "supabase-edge";
  public name = "Supabase Edge Functions";
  public supportedTasks: AITaskType[] = ["speech-to-text"];

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(): boolean {
    return this.checkNetwork();
  }

  public async execute<TPayload = any, TResult = any>(
    taskType: AITaskType,
    payload: TPayload,
    options?: AITaskOptions
  ): Promise<AIResponse<TResult>> {
    const startTime = Date.now();

    if (!this.checkNetwork()) {
      return {
        success: false,
        providerUsed: this.id,
        error: createAIError("NETWORK_OFFLINE", "Internet connection is required for Edge Functions", this.id),
      };
    }

    if (taskType === "speech-to-text") {
      try {
        const result = await this.transcribeSpeech(payload as unknown as SpeechToTextPayload, options);
        return {
          success: true,
          data: result as unknown as TResult,
          providerUsed: this.id,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (err: any) {
        return {
          success: false,
          providerUsed: this.id,
          error: createAIError("EDGE_FUNCTION_ERROR", err?.message || "Edge Function invocation failed", this.id, err),
        };
      }
    }

    return {
      success: false,
      providerUsed: this.id,
      error: createAIError("TASK_NOT_SUPPORTED", `Task ${taskType} not supported`, this.id),
    };
  }

  private async transcribeSpeech(
    payload: SpeechToTextPayload,
    options?: AITaskOptions
  ): Promise<SpeechToTextResult> {
    const lang = payload.language || options?.language || "auto";
    const isArabic = lang === "ar" || lang === "arabic";
    const langCode = isArabic ? "ar" : lang;

    // 1. Try 'transcribe-groq' Edge Function
    let response = await supabase.functions.invoke("transcribe-groq", {
      body: {
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType || "audio/wav",
        language: langCode,
      },
    });

    // 2. Fallback to 'transcribe' Edge Function if error
    if (response.error || !response.data?.captions) {
      response = await supabase.functions.invoke("transcribe", {
        body: {
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType || "audio/wav",
          language: langCode,
        },
      });
    }

    if (response.error || !response.data?.captions) {
      throw new Error(response.error?.message || "Edge function transcription failed to return captions");
    }

    const rawCaptions: CaptionSegment[] = (response.data.captions || [])
      .map((seg: any) => ({
        start: Math.round(Number(seg.start || 0) * 100) / 100,
        end: Math.round(Number(seg.end || seg.start + 2) * 100) / 100,
        text: String(seg.text || "").trim(),
      }))
      .filter((seg: CaptionSegment) => seg.text.length > 0);

    const captions = isArabic
      ? rawCaptions.map((cap) => ({ ...cap, text: correctArabicText(cap.text) }))
      : rawCaptions;

    return {
      captions,
      rawText: captions.map((c) => c.text).join(" "),
      languageDetected: langCode,
    };
  }
}
