// Global UI and Video sound-effects library for Vireon AI.
export type SfxName = 
  | "click" | "success" | "error" | "pop" | "swipe" | "applause" 
  | "whoosh" | "camera-shutter" | "glitch" | "sparkle" | "heartbeat" | "notification";

export const SFX_PATHS: Record<SfxName, string> = {
  click: "/audio/sfx/click.mp3",
  success: "/audio/sfx/success.mp3",
  error: "/audio/sfx/error.mp3",
  pop: "/audio/sfx/pop.mp3",
  swipe: "/audio/sfx/swipe.mp3",
  applause: "/audio/sfx/applause.mp3",
  whoosh: "/audio/sfx/whoosh.mp3",
  "camera-shutter": "/audio/sfx/shutter.mp3",
  glitch: "/audio/sfx/glitch.mp3",
  sparkle: "/audio/sfx/sparkle.mp3",
  heartbeat: "/audio/sfx/heartbeat.mp3",
  notification: "/audio/sfx/notification.mp3",
};

const LS_KEY = "vireon:sfxEnabled";
const VOL_KEY = "vireon:sfxVolume";

export function isSfxEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(LS_KEY) !== "0";
}

export function setSfxEnabled(on: boolean) {
  localStorage.setItem(LS_KEY, on ? "1" : "0");
}

export function getSfxVolume(): number {
  if (typeof localStorage === "undefined") return 0.6;
  const v = parseFloat(localStorage.getItem(VOL_KEY) || "0.6");
  return isNaN(v) ? 0.6 : v;
}

export function setSfxVolume(v: number) {
  localStorage.setItem(VOL_KEY, String(v));
}

const pools: Partial<Record<SfxName, HTMLAudioElement[]>> = {};
const POOL_SIZE = 3;

function getPool(name: SfxName): HTMLAudioElement[] {
  if (!pools[name]) {
    pools[name] = Array.from({ length: POOL_SIZE }, () => {
      const a = new Audio(SFX_PATHS[name]);
      a.preload = "auto";
      return a;
    });
  }
  return pools[name]!;
}

export function preloadSfx() {
  (Object.keys(SFX_PATHS) as SfxName[]).forEach((n) => getPool(n));
}

export function playSfx(name: SfxName) {
  if (!isSfxEnabled()) return;
  try {
    const pool = getPool(name);
    const el = pool.find((a) => a.paused || a.ended) || pool[0];
    el.volume = getSfxVolume();
    el.currentTime = 0;
    void el.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
