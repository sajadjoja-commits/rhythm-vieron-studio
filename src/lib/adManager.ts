// Daily free-usage tracking + gating logic for Vireon.
// Free users get a limited number of "actions" per DAY across the whole app.
// Once exhausted, the manual local-payment paywall is shown.

export type AdFeature = "export-hd" | "smart-cut" | "caption" | "smart-template";

/** Free actions allowed per day for non-premium users. */
export const DAILY_FREE_LIMIT = 5;

const COUNT_KEY = "vireon:usage:count";
const DAY_KEY = "vireon:usage:day";
const PREMIUM_KEY = "vireon:premium";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Resets the shared daily counter at the start of each new day. */
export function ensureDailyReset(): void {
  const stored = localStorage.getItem(DAY_KEY);
  const now = today();
  if (stored !== now) {
    localStorage.setItem(COUNT_KEY, "0");
    localStorage.setItem(DAY_KEY, now);
  }
}

/** Kept for backwards compatibility. */
export const ensureMonthlyReset = ensureDailyReset;

export function isPremium(): boolean {
  return localStorage.getItem(PREMIUM_KEY) === "1";
}

export function setPremium(on: boolean): void {
  localStorage.setItem(PREMIUM_KEY, on ? "1" : "0");
}

/** Total actions used today (across every feature). */
export function getUsage(_feature?: AdFeature): number {
  ensureDailyReset();
  return parseInt(localStorage.getItem(COUNT_KEY) || "0", 10);
}

export function incUsage(_feature?: AdFeature): number {
  ensureDailyReset();
  const n = getUsage() + 1;
  localStorage.setItem(COUNT_KEY, String(n));
  return n;
}

/**
 * Returns true when the paywall must be shown for the current attempt
 * (i.e. the free daily limit has been reached and the user isn't premium).
 */
export function needsAd(_feature: AdFeature, _freeLimit?: number): boolean {
  if (isPremium()) return false;
  return getUsage() >= DAILY_FREE_LIMIT;
}

/** Remaining free actions for today. */
export function remainingFree(_feature?: AdFeature, _freeLimit?: number): number {
  if (isPremium()) return Infinity;
  return Math.max(0, DAILY_FREE_LIMIT - getUsage());
}
