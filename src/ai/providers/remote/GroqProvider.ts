import { RemoteProvider } from "../RemoteProvider";
import { KeyManager } from "../../keyManager/KeyManager";
import { AITaskType, AITaskOptions, AIResponse, SpeechToTextPayload, SpeechToTextResult, CaptionSegment } from "../../types/ai";
import { base64ToBlob } from "../../utils/audioUtils";
import { correctArabicText } from "@/lib/arabicSpellCheck";
import { createAIError } from "../../utils/errorUtils";

export class GroqProvider extends RemoteProvider {
  public id = "groq";
  public name = "Groq AI Cloud";
  public supportedTasks: AITaskType[] = ["speech-to-text", "translation"];

  constructor(keyManager: KeyManager) {
    super(keyManager);
  }

  public isAvailable(taskType: AITaskType): boolean {
    if (!this.checkNetwork()) return false;
    if (!this.supportsTask(taskType)) return false;
    const key = this.keyManager.getKey("groq");
    return Boolean(key && key.trim().length > 0);
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
        error: createAIError(
          "NETWORK_OFFLINE",
          "Internet connection is required for Groq AI execution",
          this.id
        ),
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
          error: createAIError("GROQ_API_ERROR", err?.message || "Groq transcription failed", this.id, err),
        };
      }
    }

    return {
      success: false,
      providerUsed: this.id,
      error: createAIError("TASK_NOT_SUPPORTED", `Task type ${taskType} is not supported by GroqProvider`, this.id),
    };
  }

  private async transcribeSpeech(
    payload: SpeechToTextPayload,
    options?: AITaskOptions
  ): Promise<SpeechToTextResult> {
    const apiKey = this.keyManager.getKey("groq");
    if (!apiKey) {
      throw new Error("Groq API Key is missing");
    }

    const mimeType = payload.mimeType || "audio/wav";
    const audioBlob = base64ToBlob(payload.audioBase64, mimeType);
    const filename = mimeType.includes("wav") ? "audio.wav" : "audio.mp3";

    const formData = new FormData();
    formData.append("file", audioBlob, filename);
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");
    formData.append("temperature", "0");

    const lang = payload.language || options?.language;
    const isArabic = lang === "ar" || lang === "arabic";

    if (isArabic) {
      formData.append("language", "ar");
      formData.append(
        "prompt",
        payload.prompt || "تفريغ صوتي باللغة العربية الفصحى والعامية بوضوح ودقة ودون حذف أي كلمات، مع مراعاة الفواصل والترقيم."
      );
    } else if (lang && lang !== "auto") {
      formData.append("language", lang);
    }

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API returned HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const json = await response.json();
    const rawCaptions: CaptionSegment[] = (json.segments || [])
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
      rawText: json.text || captions.map((c) => c.text).join(" "),
      languageDetected: json.language || lang,
    };
  }
}
