/**
 * Motion Director — local "AI" that turns a script + the uploaded video into a
 * timed list of motion-graphic overlays. Runs fully offline:
 *  - script: sentence split, keyword/emotion classification, word-weighted timing
 *  - video: low-res frame sampling → motion energy & brightness per second,
 *    used to place accent effects on high-energy moments and pick text colors.
 */
import type { OverlayItem } from "@/context/MediaContext";
import { getMotionPreset } from "./motionGraphics";
import { VideoAnalysisWorkerManager } from "./videoAnalysisWorkerManager";
import { robustSeekVideo } from "./videoSeeking";
import type { FrameBufferData } from "./workers/videoAnalysis.worker";

export interface DirectorClip { url: string; type: "video" | "image"; in: number; out: number; speed?: number; }
export interface EnergyPoint { time: number; motion: number; brightness: number; }
export type DirectorStyle = "auto" | "energetic" | "cinematic" | "minimal";

export interface DirectorOptions {
  script: string;
  duration: number;
  energy?: EnergyPoint[];
  accent?: string;
  style?: DirectorStyle;
  idPrefix?: string;
}

const RULES: { re: RegExp; preset: string; tag: string }[] = [
  { re: /(حب|أحب|احب|قلب|love|❤)/i, preset: "st-heart", tag: "love" },
  { re: /(ضحك|هههه|مضحك|funny|lol|haha)/i, preset: "st-laugh", tag: "laugh" },
  { re: /(فلوس|مال|ربح|سعر|دولار|money|price|\$)/i, preset: "st-money", tag: "money" },
  { re: /(نار|قوي|رهيب|fire|hot|lit)/i, preset: "st-fire", tag: "fire" },
  { re: /(صاروخ|سريع|انطلق|launch|fast|rocket)/i, preset: "st-rocket", tag: "fast" },
  { re: /(ملك|الأفضل|الافضل|best|king|top)/i, preset: "st-crown", tag: "best" },
  { re: /(اشترك|تابع|لايك|subscribe|follow|like)/i, preset: "subscribe", tag: "cta" },
  { re: /(مذهل|واو|wow|amazing|صدمة)/i, preset: "st-wow", tag: "wow" },
  { re: /\d+/, preset: "st-100", tag: "number" },
];

export function splitScript(script: string): string[] {
  return script
    .split(/(?<=[.!?؟。\n])\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function classifySentence(s: string, index: number, total: number, style: DirectorStyle) {
  const isFirst = index === 0, isLast = index === total - 1 && total > 1;
  const sticker = RULES.find((r) => r.re.test(s));
  let main: string;
  if (isFirst) main = style === "cinematic" ? "cinematic-bars" : style === "minimal" ? "typewriter" : "extrude-text-3d";
  else if (sticker?.tag === "cta") main = "subscribe";
  else if (/[?؟]/.test(s)) main = "speech-bubble";
  else if (/[!！]/.test(s)) main = style === "minimal" ? "pop-title" : "extrude-text-3d";
  else if (s.length > 28) main = style === "cinematic" ? "lower-third" : "typewriter";
  else main = style === "energetic" ? "word-bounce" : style === "cinematic" ? "split-reveal" : index % 2 ? "pop-title" : "neon-glow";
  if (isLast && !sticker) main = style === "minimal" ? "typewriter" : "word-bounce";
  return { main, sticker: sticker && sticker.tag !== "cta" ? sticker.preset : undefined };
}

const shorten = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + "…" : s).replace(/[.!؟?]+$/, "");

/** Build motion overlays. Pure + deterministic so it is testable. */
export function directMotion(opts: DirectorOptions): OverlayItem[] {
  const { duration, energy = [], accent = "#ff3d71", idPrefix = "dir" } = opts;
  const sentences = splitScript(opts.script);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const avgMotion = energy.length ? energy.reduce((a, e) => a + e.motion, 0) / energy.length : 0.3;
  const style: DirectorStyle = opts.style && opts.style !== "auto" ? opts.style : avgMotion > 0.45 ? "energetic" : avgMotion < 0.15 ? "cinematic" : "auto";
  const out: OverlayItem[] = [];
  let uid = 0;
  const mk = (preset: string, start: number, len: number, extra: Partial<OverlayItem> & { text?: string; subText?: string }): OverlayItem | null => {
    const p = getMotionPreset(preset);
    if (!p) return null;
    const s = Math.max(0, Math.min(duration - 0.3, start));
    const e = Math.min(duration, s + Math.max(0.6, len));
    const { text, subText, ...rest } = extra;
    return {
      id: `${idPrefix}-${uid++}`, url: "", type: "motion", name: p.nameEn,
      motion: { preset, text, subText, accent },
      start: s, end: e, x: 50, y: 50, scale: 1.2, opacity: 1, rotation: 0, blend: "normal", brightness: 1, ...rest,
    };
  };

  // 1) Script → timed text motion (word-weighted)
  const weights = sentences.map((s) => Math.max(2, s.split(/\s+/).length));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  sentences.forEach((s, i) => {
    const len = (weights[i] / totalW) * duration;
    const { main, sticker } = classifySentence(s, i, sentences.length, style);
    const bright = nearest(energy, cursor)?.brightness ?? 0.5;
    const y = main === "lower-third" ? 82 : main === "subscribe" ? 80 : bright > 0.7 ? 28 : 72;
    const isSub = main === "lower-third" || main === "split-reveal" || main === "cinematic-bars";
    const words = s.split(/\s+/);
    const o = mk(main, cursor, Math.min(len, 5), {
      text: isSub ? words.slice(0, Math.ceil(words.length / 2)).join(" ") : s,
      subText: isSub ? words.slice(Math.ceil(words.length / 2)).join(" ") : undefined,
      x: main === "lower-third" ? 35 : 50, y, scale: main === "cinematic-bars" ? 2.2 : 1.2,
    });
    if (o) out.push(o);
    if (sticker) {
      const st = mk(sticker, cursor + Math.min(0.6, len * 0.3), Math.min(2.5, len), { x: 80, y: Math.max(12, y - 22), scale: 0.9 });
      if (st) out.push(st);
    }
    cursor += len;
  });

  // 2) Video energy → accent effects on peaks (not on top of text-heavy minimal style)
  if (style !== "minimal" && energy.length > 2) {
    const peaks = energy
      .filter((e, i) => i > 0 && i < energy.length - 1 && e.motion > energy[i - 1].motion && e.motion >= energy[i + 1].motion && e.motion > Math.max(0.25, avgMotion * 1.5))
      .sort((a, b) => b.motion - a.motion)
      .slice(0, Math.max(1, Math.round(duration / 8)));
    const fx = style === "energetic" ? ["burst-lines", "st-boom", "tunnel-3d"] : ["pulse-circle", "orbit-sphere", "st-sparkle"];
    peaks.forEach((p, i) => {
      const o = mk(fx[i % fx.length], p.time - 0.2, 1.4, { x: i % 2 ? 22 : 78, y: 22, scale: 0.9 });
      if (o) out.push(o);
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

function nearest(energy: EnergyPoint[], t: number) {
  let best: EnergyPoint | undefined; let bd = Infinity;
  for (const e of energy) { const d = Math.abs(e.time - t); if (d < bd) { bd = d; best = e; } }
  return best;
}

/** Sample the timeline's video at ~1fps on a tiny canvas to estimate motion & brightness. */
export async function analyzeTimelineEnergy(clips: DirectorClip[], signal?: AbortSignal, onProgress?: (p: number) => void): Promise<EnergyPoint[]> {
  const pts: EnergyPoint[] = [];
  const cv = document.createElement("canvas"); cv.width = 32; cv.height = 18;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Video canvas unavailable");
  const total = clips.reduce((a, c) => a + Math.max(0, c.out - c.in) / (c.speed || 1), 0) || 1;
  let base = 0;
  for (const c of clips) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const speed = c.speed || 1;
    const len = Math.max(0, c.out - c.in) / speed;
    if (c.type !== "video") { for (let t = 0; t < len; t += 1) pts.push({ time: base + t, motion: 0.05, brightness: 0.5 }); base += len; continue; }
    const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.crossOrigin = "anonymous";
    try {
      await new Promise<void>((res, rej) => {
        const cleanup = () => { clearTimeout(timer); v.onloadeddata = null; v.onerror = null; signal?.removeEventListener("abort", abort); };
        const finish = (error?: Error) => { cleanup(); if (error) rej(error); else res(); };
        const abort = () => finish(new DOMException("Cancelled", "AbortError"));
        const timer = setTimeout(() => finish(new Error("Video load timed out")), 8000);
        v.onloadeddata = () => finish(); v.onerror = () => finish(new Error("Cannot decode video"));
        signal?.addEventListener("abort", abort, { once: true });
        v.src = c.url; v.load();
      });
      const frames: FrameBufferData[] = [];
      const step = Math.max(0.5, len / 40);
      for (let t = 0; t < len; t += step) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        const ready = await robustSeekVideo(v, c.in + t * speed, { signal, timeoutMs: 1500 });
        if (!ready) throw new Error("Video frame could not be decoded");
        ctx.drawImage(v, 0, 0, 32, 18);
        const d = ctx.getImageData(0, 0, 32, 18).data;
        frames.push({ time: base + t, width: 32, height: 18, buffer: d.slice().buffer as ArrayBuffer });
        onProgress?.(Math.min(1, (base + t) / total));
      }
      if (frames.length) {
        const results = await VideoAnalysisWorkerManager.getInstance().analyzeFrames(frames, frames.map((f, i) => ({ in: f.time, out: frames[i + 1]?.time ?? base + len })));
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        pts.push(...results.map(r => ({ time: r.in, motion: r.motion, brightness: r.brightness })));
      }
    } finally { v.removeAttribute("src"); v.load(); }
    base += len;
  }
  onProgress?.(1);
  return pts;
}
