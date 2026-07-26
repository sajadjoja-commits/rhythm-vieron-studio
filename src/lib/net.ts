// Network / connectivity helpers for online-only AI features.
import { toast } from "sonner";
import { t, getLang } from "./i18n";

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Verifies real connectivity (not just navigator.onLine) by pinging a tiny
 * endpoint. Returns true if reachable.
 */
export async function checkConnectivity(timeoutMs = 4000): Promise<boolean> {
  if (!isOnline()) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch("https://www.gstatic.com/generate_204", {
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return true;
  } catch {
    return isOnline();
  }
}

/** Guard used by online-only tools. Shows a toast and returns false when offline. */
export async function requireOnline(featureName?: string): Promise<boolean> {
  const name = featureName || (getLang() === "en" ? "This feature" : "هذه الميزة");
  const ok = await checkConnectivity();
  if (!ok) {
    toast.error(t("toast.onlineRequired", { featureName: name }));
  }
  return ok;
}
