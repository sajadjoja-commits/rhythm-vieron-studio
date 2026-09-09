import { AIError } from "../types/ai";
import { isOnline } from "./netUtils";

export function createAIError(
  code: string,
  message: string,
  provider?: string,
  details?: any
): AIError {
  const offline = !isOnline();
  return {
    code,
    message: offline ? `[Offline] ${message}` : message,
    isOffline: offline,
    provider,
    details,
  };
}

export function formatAIException(err: any, provider?: string): AIError {
  if (err?.code && err?.message) {
    return err as AIError;
  }
  const message = err?.message || String(err || "Unknown AI error occurred");
  const isOffline = !isOnline();

  return {
    code: isOffline ? "NETWORK_OFFLINE" : "AI_EXECUTION_FAILED",
    message,
    isOffline,
    provider,
    details: err,
  };
}
