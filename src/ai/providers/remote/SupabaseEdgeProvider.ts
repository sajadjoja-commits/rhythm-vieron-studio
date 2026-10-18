import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import { AITaskType, AITaskOptions, AIResponse, SpeechToTextPayload, SpeechToTextResult, CaptionSegment } from "../../types/ai";
import { supabase } from "@/integrations/supabase/client";
import { correctArabicText } from "@/lib/arabicSpellCheck";
import { createAIError } from "../../utils/errorUtils";

function isServerFunctionNotConfigured(err: any): boolean {
  if (!err) return false;
  const name = String(err.name || err.constructor?.name || "");
  const msg = String(err.message || err || "");
  const status =
    err.status ??
    err.statusCode ??
    err.context?.status ??
    err.context?.statusCode;
  if (name === "FunctionsRelayError" || /FunctionsRelayError/i.test(msg)) {
    return true;
  }
  if (status === 404) {
    return true;
  }
  if (
    (name === "FunctionsHttpError" || /FunctionsHttpError/i.test(msg)) &&
    (status === 404 || /\b404\b|not[\s_-]*found/i.test(msg))
  ) {
    return true;
  }
  if (/\b404\b.*(?:function|edge|not\s*found)|function.*not\s*found/i.test(msg)) {
    return true;
  }
  return false;
}

export class SupabaseEdgeProvider extends RemoteProvider {
  public id = "supabase-edge";
  public name = "Supabase Edge Functions";
  public supportedTasks: AITaskType[] = ["speech-to-text"];

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(taskType?: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    if (taskType && !this.supportsTask(taskType)) return false;
    return true;
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
        if (err?.code === "PROVIDER_NOT_CONFIGURED" || isServerFunctionNotConfigured(err)) {
          return {
            success: false,
            providerUsed: this.id,
            error: createAIError("PROVIDER_NOT_CONFIGURED", "وظيفة السيرفر غير مفعّلة", this.id, err),
          };
        }
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
    const audioSource =
      payload?.audioBase64 ||
      (payload as any)?.audioBase64OrUrl ||
      (payload as any)?.mediaUrlOrBase64 ||
      "";
    if (!audioSource) {
      throw new Error("audioBase64 is required for edge transcription");
    }

    const lang = payload.language || options?.language || "auto";
    const isArabic = lang === "ar" || lang === "arabic";
    const langCode = isArabic ? "ar" : lang;

    // Invoke standard transcribe Edge Function if remote is explicitly requested
    const response = await supabase.functions.invoke("transcribe", {
      body: {
        audioBase64: audioSource,
        mimeType: payload.mimeType || "audio/wav",
        language: langCode,
      },
    });

    if (response.error) {
      if (isServerFunctionNotConfigured(response.error)) {
        const notConfErr: any = new Error("وظيفة السيرفر غير مفعّلة");
        notConfErr.code = "PROVIDER_NOT_CONFIGURED";
        throw notConfErr;
      }
      throw new Error(response.error?.message || "Edge function transcription failed to return captions");
    }

    if (response.data?.statusCode === 404) {
      const notConfErr: any = new Error("وظيفة السيرفر غير مفعّلة");
      notConfErr.code = "PROVIDER_NOT_CONFIGURED";
      throw notConfErr;
    }

    if (!response.data?.captions) {
      throw new Error("Edge function transcription failed to return captions");
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
