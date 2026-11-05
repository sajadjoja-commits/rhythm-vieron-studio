/**
 * Motion graphics engine — one shared canvas renderer used identically by the
 * live preview (InteractiveOverlay) and the export loop (ExportDialog).
 * Everything is procedural (no network, no assets) so it works offline.
 */

export type MotionCategory = "text" | "shape" | "intro";

export interface MotionSpec {
  preset: string;
  text?: string;
  subText?: string;
  color?: string;
  accent?: string;
  font?: string;
}

export interface MotionPreset {
  id: string;
  category: MotionCategory;
  name: string;
  nameEn: string;
  baseW: number;
  baseH: number;
  defaultDuration: number;
  defaults: Required<Omit<MotionSpec, "preset">>;
  draw: (ctx: CanvasRenderingContext2D, s: Required<MotionSpec>, t: number, d: number, w: number, h: number) => void;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeIn = (x: number) => Math.pow(clamp(x), 3);
const easeBack = (x: number) => { const c = 1.70158; const p = clamp(x) - 1; return 1 + (c + 1) * p * p * p + c * p * p; };
/** 0→1 during intro, 1 hold, 1→0 during outro */
const envelope = (t: number, d: number, inDur = 0.5, outDur = 0.4) =>
  Math.min(easeOut(t / inDur), 1 - easeIn((t - (d - outDur)) / outDur));

const font = (s: Required<MotionSpec>, size: number, weight = 800) => `${weight} ${size}px ${s.font}, "Cairo", sans-serif`;

const D = (text: string, subText = "", color = "#ffffff", accent = "#ff3d71", f = "Cairo") => ({ text, subText, color, accent, font: f });

export const MOTION_PRESETS: MotionPreset[] = [
  // ───────── TEXT ─────────
  {
    id: "pop-title", category: "text", name: "عنوان منبثق", nameEn: "Pop Title", baseW: 200, baseH: 80, defaultDuration: 3,
    defaults: D("عنوانك هنا", "", "#ffffff", "#ff3d71"),
    draw(ctx, s, t, d, w, h) {
      const e = envelope(t, d, 0.6);
      const sc = t < 0.6 ? easeBack(t / 0.6) : e;
      ctx.translate(w / 2, h / 2); ctx.scale(sc, sc);
      ctx.font = font(s, h * 0.42); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = h * 0.08; ctx.strokeStyle = s.accent; ctx.lineJoin = "round";
      ctx.globalAlpha = clamp(e * 1.5);
      ctx.strokeText(s.text, 0, 0); ctx.fillStyle = s.color; ctx.fillText(s.text, 0, 0);
    },
  },
  {
    id: "typewriter", category: "text", name: "آلة كاتبة", nameEn: "Typewriter", baseW: 200, baseH: 60, defaultDuration: 3.5,
    defaults: D("قصة تبدأ الآن...", "", "#ffffff", "#ffd400"),
    draw(ctx, s, t, d, w, h) {
      const chars = Array.from(s.text);
      const n = Math.floor(clamp(t / Math.max(0.5, d * 0.55)) * chars.length);
      ctx.globalAlpha = 1 - easeIn((t - (d - 0.3)) / 0.3);
      ctx.font = font(s, h * 0.36, 700); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = s.color; const shown = chars.slice(0, n).join("");
      ctx.fillText(shown, w / 2, h / 2);
      if (Math.floor(t * 2.5) % 2 === 0) {
        const tw = ctx.measureText(shown).width;
        ctx.fillStyle = s.accent; ctx.fillRect(w / 2 + tw / 2 + 3, h * 0.3, 3, h * 0.4);
      }
    },
  },
  {
    id: "lower-third", category: "text", name: "شريط تعريفي", nameEn: "Lower Third", baseW: 200, baseH: 64, defaultDuration: 4,
    defaults: D("اسم المتحدث", "المسمى الوظيفي", "#ffffff", "#00c2ff"),
    draw(ctx, s, t, d, w, h) {
      const e = envelope(t, d, 0.7, 0.5);
      const barW = w * e;
      ctx.fillStyle = s.accent; ctx.fillRect(0, h * 0.1, Math.min(6, barW), h * 0.8);
      ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(8, h * 0.1, Math.max(0, barW - 8), h * 0.5);
      ctx.fillStyle = s.accent; ctx.fillRect(8, h * 0.62, Math.max(0, barW * 0.7 - 8), h * 0.28);
      ctx.save(); ctx.beginPath(); ctx.rect(8, 0, Math.max(0, barW - 8), h); ctx.clip();
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.font = font(s, h * 0.3); ctx.fillStyle = s.color; ctx.fillText(s.text, 14, h * 0.35);
      ctx.font = font(s, h * 0.18, 600); ctx.fillStyle = "#000"; ctx.fillText(s.subText, 14, h * 0.76);
      ctx.restore();
    },
  },
  {
    id: "neon-glow", category: "text", name: "نيون متوهج", nameEn: "Neon Glow", baseW: 200, baseH: 80, defaultDuration: 3,
    defaults: D("NEON", "", "#ffffff", "#ff00e6"),
    draw(ctx, s, t, d, w, h) {
      const flick = t < 0.6 ? (Math.sin(t * 60) > 0 ? 1 : 0.2) : 0.85 + 0.15 * Math.sin(t * 8);
      ctx.globalAlpha = flick * envelope(t, d, 0.2);
      ctx.font = font(s, h * 0.5); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = s.accent; ctx.shadowBlur = h * 0.3;
      ctx.strokeStyle = s.accent; ctx.lineWidth = 3; ctx.strokeText(s.text, w / 2, h / 2);
      ctx.fillStyle = s.color; ctx.fillText(s.text, w / 2, h / 2);
    },
  },
  {
    id: "word-bounce", category: "text", name: "كلمات قافزة", nameEn: "Word Bounce", baseW: 200, baseH: 70, defaultDuration: 3.5,
    defaults: D("كل كلمة تقفز", "", "#ffffff", "#7cff4f"),
    draw(ctx, s, t, d, w, h) {
      const words = s.text.split(/\s+/).filter(Boolean);
      ctx.font = font(s, h * 0.36); ctx.textBaseline = "middle"; ctx.textAlign = "left";
      const gap = h * 0.15; const widths = words.map((x) => ctx.measureText(x).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
      let x = (w - total) / 2; const out = 1 - easeIn((t - (d - 0.4)) / 0.4);
      words.forEach((wd, i) => {
        const lt = t - i * 0.18; const p = clamp(lt / 0.45);
        const y = h / 2 - Math.sin(p * Math.PI) * h * 0.3 + (1 - easeOut(p)) * h * 0.4;
        ctx.globalAlpha = clamp(p * 2) * out;
        ctx.fillStyle = i % 2 ? s.accent : s.color; ctx.fillText(wd, x, y);
        x += widths[i] + gap;
      });
    },
  },
  {
    id: "split-reveal", category: "text", name: "كشف منقسم", nameEn: "Split Reveal", baseW: 200, baseH: 80, defaultDuration: 3,
    defaults: D("SPLIT", "REVEAL", "#ffffff", "#ffb800"),
    draw(ctx, s, t, d, w, h) {
      const e = envelope(t, d, 0.7);
      ctx.fillStyle = s.accent; ctx.fillRect(w / 2 - (w / 2) * e, h / 2 - 1.5, w * e, 3);
      ctx.textAlign = "center"; ctx.font = font(s, h * 0.32);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h / 2 - 2); ctx.clip();
      ctx.textBaseline = "bottom"; ctx.fillStyle = s.color; ctx.fillText(s.text, w / 2, h / 2 - 4 + (1 - e) * h * 0.45); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, h / 2 + 2, w, h / 2); ctx.clip();
      ctx.textBaseline = "top"; ctx.font = font(s, h * 0.22, 600); ctx.fillStyle = s.accent;
      ctx.fillText(s.subText, w / 2, h / 2 + 6 - (1 - e) * h * 0.45); ctx.restore();
    },
  },
  // ───────── SHAPES ─────────
  {
    id: "pulse-circle", category: "shape", name: "دوائر نابضة", nameEn: "Pulse Rings", baseW: 160, baseH: 160, defaultDuration: 3,
    defaults: D("", "", "#ffffff", "#00e1ff"),
    draw(ctx, s, t, d, w, h) {
      const env = envelope(t, d, 0.3);
      for (let i = 0; i < 3; i++) {
        const p = ((t * 0.8 + i / 3) % 1);
        ctx.globalAlpha = (1 - p) * env; ctx.strokeStyle = s.accent; ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(w / 2, h / 2, (w / 2 - 4) * p, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = env; ctx.fillStyle = s.accent;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.08 * (1 + 0.15 * Math.sin(t * 6)), 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: "spin-ring", category: "shape", name: "حلقة دوّارة", nameEn: "Spin Ring", baseW: 160, baseH: 160, defaultDuration: 3,
    defaults: D("", "", "#ffffff", "#ff3d71"),
    draw(ctx, s, t, d, w, h) {
      ctx.globalAlpha = envelope(t, d, 0.4); ctx.translate(w / 2, h / 2);
      ctx.lineCap = "round"; const r = w * 0.4;
      ctx.rotate(t * 3); ctx.strokeStyle = s.accent; ctx.lineWidth = w * 0.06;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 1.3); ctx.stroke();
      ctx.rotate(-t * 5); ctx.strokeStyle = s.color; ctx.lineWidth = w * 0.03;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 0.9); ctx.stroke();
    },
  },
  {
    id: "burst-lines", category: "shape", name: "انفجار خطوط", nameEn: "Line Burst", baseW: 160, baseH: 160, defaultDuration: 2,
    defaults: D("", "", "#ffffff", "#ffd400"),
    draw(ctx, s, t, d, w, h) {
      ctx.translate(w / 2, h / 2); ctx.strokeStyle = s.accent; ctx.lineCap = "round"; ctx.lineWidth = w * 0.035;
      const p = clamp(t / (d * 0.7)); const a = easeOut(p); const b = easeOut(clamp((t - 0.15) / (d * 0.7)));
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2; const R = w * 0.48;
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * R * b, Math.sin(ang) * R * b);
        ctx.lineTo(Math.cos(ang) * R * a, Math.sin(ang) * R * a); ctx.stroke();
      }
    },
  },
  {
    id: "wave-dots", category: "shape", name: "نقاط موجية", nameEn: "Wave Dots", baseW: 200, baseH: 60, defaultDuration: 3,
    defaults: D("", "", "#ffffff", "#7c5cff"),
    draw(ctx, s, t, d, w, h) {
      ctx.globalAlpha = envelope(t, d, 0.3);
      for (let i = 0; i < 9; i++) {
        const x = (w / 10) * (i + 1); const y = h / 2 + Math.sin(t * 6 - i * 0.7) * h * 0.28;
        ctx.fillStyle = i % 2 ? s.accent : s.color;
        ctx.beginPath(); ctx.arc(x, y, h * 0.09, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: "arrow-swipe", category: "shape", name: "سهم متحرك", nameEn: "Arrow Swipe", baseW: 200, baseH: 80, defaultDuration: 2.5,
    defaults: D("", "", "#ffffff", "#00ff9d"),
    draw(ctx, s, t, d, w, h) {
      ctx.globalAlpha = envelope(t, d, 0.3);
      for (let i = 0; i < 3; i++) {
        const p = (t * 1.2 + i * 0.33) % 1; const x = w * 0.1 + p * w * 0.75;
        ctx.globalAlpha = Math.sin(p * Math.PI) * envelope(t, d, 0.3);
        ctx.strokeStyle = s.accent; ctx.lineWidth = h * 0.12; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(x, h * 0.2); ctx.lineTo(x + h * 0.3, h / 2); ctx.lineTo(x, h * 0.8); ctx.stroke();
      }
    },
  },
  {
    id: "confetti", category: "shape", name: "قصاصات احتفال", nameEn: "Confetti", baseW: 200, baseH: 200, defaultDuration: 3,
    defaults: D("", "", "#ffd400", "#ff3d71"),
    draw(ctx, s, t, d, w, h) {
      const cols = [s.accent, s.color, "#00c2ff", "#7cff4f"];
      ctx.globalAlpha = 1 - easeIn((t - (d - 0.5)) / 0.5);
      for (let i = 0; i < 40; i++) {
        const r1 = Math.sin(i * 12.9898) * 43758.5453; const rx = r1 - Math.floor(r1);
        const r2 = Math.sin(i * 78.233) * 12345.678; const ry = r2 - Math.floor(r2);
        const x = rx * w + Math.sin(t * 3 + i) * 8; const y = -10 + ((ry * h + t * (60 + ry * 80)) % (h + 20));
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 4 + i); ctx.fillStyle = cols[i % 4];
        ctx.fillRect(-4, -2, 8, 4); ctx.restore();
      }
    },
  },
  // ───────── INTROS / LOGOS ─────────
  {
    id: "logo-reveal", category: "intro", name: "كشف الشعار", nameEn: "Logo Reveal", baseW: 200, baseH: 200, defaultDuration: 3.5,
    defaults: D("V", "VIREON", "#ffffff", "#ff3d71"),
    draw(ctx, s, t, d, w, h) {
      const out = 1 - easeIn((t - (d - 0.4)) / 0.4); ctx.globalAlpha = out;
      const cx = w / 2, cy = h * 0.42, r = w * 0.28;
      const p = easeOut(t / 0.9);
      ctx.strokeStyle = s.accent; ctx.lineWidth = w * 0.03; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
      const sc = easeBack(clamp((t - 0.6) / 0.5));
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
      ctx.fillStyle = s.accent; ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.color; ctx.font = font(s, r * 0.9, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(s.text, 0, r * 0.05); ctx.restore();
      const tp = easeOut(clamp((t - 1.1) / 0.6));
      ctx.globalAlpha = tp * out; ctx.fillStyle = s.color; ctx.font = font(s, h * 0.1, 800); ctx.textAlign = "center";
      ctx.textBaseline = "middle"; ctx.fillText(s.subText, cx, h * 0.84 + (1 - tp) * 12);
    },
  },
  {
    id: "countdown", category: "intro", name: "عد تنازلي", nameEn: "Countdown", baseW: 160, baseH: 160, defaultDuration: 3,
    defaults: D("", "", "#ffffff", "#00c2ff"),
    draw(ctx, s, t, d, w, h) {
      const step = d / 3; const n = 3 - Math.min(2, Math.floor(t / step)); const lt = (t % step) / step;
      ctx.strokeStyle = s.accent; ctx.lineWidth = w * 0.05; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - lt)); ctx.stroke();
      const sc = 1.4 - 0.4 * easeOut(lt * 2);
      ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.globalAlpha = 1 - easeIn((lt - 0.8) / 0.2);
      ctx.fillStyle = s.color; ctx.font = font(s, h * 0.42, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(n), 0, 0);
    },
  },
  {
    id: "subscribe", category: "intro", name: "زر اشتراك", nameEn: "Subscribe", baseW: 200, baseH: 70, defaultDuration: 3.5,
    defaults: D("اشترك", "SUBSCRIBED ✓", "#ffffff", "#ff0033"),
    draw(ctx, s, t, d, w, h) {
      const e = envelope(t, d, 0.5); const clicked = t > d * 0.5;
      const sc = t < 0.5 ? easeBack(t / 0.5) : clicked && t < d * 0.5 + 0.15 ? 0.9 : 1;
      ctx.globalAlpha = clamp(e * 1.5); ctx.translate(w / 2, h / 2); ctx.scale(sc, sc);
      ctx.fillStyle = clicked ? "#666" : s.accent; ctx.beginPath(); ctx.roundRect(-w * 0.42, -h * 0.32, w * 0.84, h * 0.64, h * 0.16); ctx.fill();
      ctx.fillStyle = s.color; ctx.font = font(s, h * 0.26); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(clicked ? s.subText : s.text, 0, 0);
      const cp = clamp((t - d * 0.3) / (d * 0.2));
      if (cp > 0 && t < d * 0.75) {
        const x = w * 0.5 - cp * w * 0.35, y = h * 0.55 - cp * h * 0.45;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 18); ctx.lineTo(x + 5, y + 13); ctx.lineTo(x + 12, y + 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    },
  },
  {
    id: "stamp", category: "intro", name: "ختم", nameEn: "Stamp", baseW: 180, baseH: 100, defaultDuration: 2.5,
    defaults: D("جديد", "", "#ff3d71", "#ff3d71"),
    draw(ctx, s, t, d, w, h) {
      const p = clamp(t / 0.35); const sc = 2.2 - 1.2 * easeOut(p);
      ctx.globalAlpha = clamp(p * 2) * (1 - easeIn((t - (d - 0.3)) / 0.3));
      ctx.translate(w / 2, h / 2); ctx.rotate(-0.15); ctx.scale(sc, sc);
      ctx.strokeStyle = s.accent; ctx.lineWidth = 5; ctx.strokeRect(-w * 0.4, -h * 0.32, w * 0.8, h * 0.64);
      ctx.fillStyle = s.color; ctx.font = font(s, h * 0.38, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(s.text, 0, 2);
    },
  },
  {
    id: "cinematic-bars", category: "intro", name: "افتتاحية سينمائية", nameEn: "Cinematic Open", baseW: 200, baseH: 112, defaultDuration: 4,
    defaults: D("الفصل الأول", "CHAPTER ONE", "#ffffff", "#e8c27a"),
    draw(ctx, s, t, d, w, h) {
      const e = envelope(t, d, 0.9, 0.6);
      ctx.fillStyle = "#000"; const bh = h * 0.2 * e;
      ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh);
      ctx.globalAlpha = easeOut(clamp((t - 0.6) / 0.8)) * (1 - easeIn((t - (d - 0.6)) / 0.6));
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = s.color; ctx.font = font(s, h * 0.17, 800); ctx.fillText(s.text, w / 2, h * 0.46);
      ctx.fillStyle = s.accent; ctx.font = font(s, h * 0.08, 600); ctx.fillText(s.subText, w / 2, h * 0.62);
    },
  },
];

const byId = new Map(MOTION_PRESETS.map((p) => [p.id, p]));
export const getMotionPreset = (id?: string) => (id ? byId.get(id) : undefined);

export function motionBaseSize(spec?: MotionSpec): { w: number; h: number } {
  const p = getMotionPreset(spec?.preset);
  return p ? { w: p.baseW, h: p.baseH } : { w: 200, h: 200 };
}

/**
 * Draws a motion graphic into [0,0,w,h] of ctx at local time t (seconds since
 * the overlay started) for an overlay lasting d seconds. Shared by preview + export.
 */
export function drawMotionGraphic(ctx: CanvasRenderingContext2D, spec: MotionSpec, t: number, d: number, w: number, h: number) {
  const p = getMotionPreset(spec.preset);
  if (!p) return;
  const full = { ...p.defaults, ...Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined && v !== "")), preset: p.id } as Required<MotionSpec>;
  if (p.id === "lower-third" || p.id === "split-reveal" || p.id === "logo-reveal" || p.id === "cinematic-bars" || p.id === "subscribe") {
    full.subText = spec.subText ?? p.defaults.subText;
  }
  const sx = w / p.baseW, sy = h / p.baseH;
  ctx.save();
  ctx.scale(sx, sy);
  try { p.draw(ctx, full, Math.max(0, t), Math.max(0.1, d), p.baseW, p.baseH); } finally { ctx.restore(); }
}
