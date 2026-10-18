/**
 * Network connection utility
 */
export function isOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true; // Default to true in non-browser environments
}

export async function pingCheck(url: string = "https://1.1.1.1", timeoutMs: number = 3000): Promise<boolean> {
  if (!isOnline()) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(url, { method: "HEAD", mode: "no-cors", signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}
