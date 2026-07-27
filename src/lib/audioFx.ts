// Build an audio FX chain (echo / studio reverb / lowpass / telephone) for an HTMLAudioElement.
import { AudioFxType } from "@/context/MediaContext";

interface ChainHandle {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  cleanup: () => void;
}

const sourceCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export function attachFxChain(
  ctx: AudioContext,
  el: HTMLMediaElement,
  fx: AudioFxType,
  volume: number,
  muted: boolean,
): ChainHandle {
  let source = sourceCache.get(el);
  if (!source) {
    source = ctx.createMediaElementSource(el);
    sourceCache.set(el, source);
  }
  const gain = ctx.createGain();
  gain.gain.value = muted ? 0 : volume;

  // disconnect any previous routing
  try { source.disconnect(); } catch {}

  const nodes: AudioNode[] = [];

  if (fx === "robot") {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.7;
    osc.connect(oscGain);
    
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1200;
    bandpass.Q.value = 2.0;

    const ringGain = ctx.createGain();
    ringGain.gain.value = 0.6;
    oscGain.connect(ringGain.gain);

    source.connect(bandpass).connect(gain);
    source.connect(ringGain).connect(gain);
    
    osc.start();
    nodes.push(osc, oscGain, bandpass, ringGain);

  } else if (fx === "chipmunk") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 450;
    const peak1 = ctx.createBiquadFilter(); peak1.type = "peaking"; peak1.frequency.value = 2400; peak1.gain.value = 14; peak1.Q.value = 2.5;
    const peak2 = ctx.createBiquadFilter(); peak2.type = "peaking"; peak2.frequency.value = 3800; peak2.gain.value = 10; peak2.Q.value = 2.0;
    const delay = ctx.createDelay(); delay.delayTime.value = 0.008;

    source.connect(hp).connect(peak1).connect(peak2).connect(delay).connect(gain);
    nodes.push(hp, peak1, peak2, delay);

  } else if (fx === "deep") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const sub = ctx.createBiquadFilter(); sub.type = "peaking"; sub.frequency.value = 120; sub.gain.value = 15; sub.Q.value = 1.8;
    const shelf = ctx.createBiquadFilter(); shelf.type = "lowshelf"; shelf.frequency.value = 250; shelf.gain.value = 10;

    source.connect(lp).connect(sub).connect(shelf).connect(gain);
    nodes.push(lp, sub, shelf);

  } else if (fx === "female") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 320;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 2100; peak.gain.value = 10; peak.Q.value = 2.0;
    const hs = ctx.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 3500; hs.gain.value = 8;

    source.connect(hp).connect(peak).connect(hs).connect(gain);
    nodes.push(hp, peak, hs);

  } else if (fx === "male") {
    const ls = ctx.createBiquadFilter(); ls.type = "lowshelf"; ls.frequency.value = 220; ls.gain.value = 10;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 450; peak.gain.value = 7; peak.Q.value = 1.5;
    const hs = ctx.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 3200; hs.gain.value = -6;

    source.connect(ls).connect(peak).connect(hs).connect(gain);
    nodes.push(ls, peak, hs);

  } else if (fx === "megaphone") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 750;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 1600; peak.gain.value = 12; peak.Q.value = 3.0;

    source.connect(hp).connect(lp).connect(peak).connect(gain);
    nodes.push(hp, lp, peak);

  } else if (fx === "alien") {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 95;
    const oscGain = ctx.createGain(); oscGain.gain.value = 0.5;
    osc.connect(oscGain);

    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.035;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    delay.connect(fb).connect(delay);

    source.connect(delay).connect(gain);
    source.connect(gain);

    osc.start();
    nodes.push(osc, oscGain, delay, fb);

  } else if (fx === "underwater") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.Q.value = 4.0;
    source.connect(lp).connect(gain);
    nodes.push(lp);

  } else if (fx === "echo") {
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    delay.connect(fb).connect(delay);
    source.connect(gain);
    source.connect(delay).connect(wet).connect(gain);
    nodes.push(delay, fb, wet);
  } else if (fx === "studio" || fx === "reverb") {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulseResponse(ctx, fx === "studio" ? 1.6 : 2.6, fx === "studio" ? 2.5 : 4);
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    const dry = ctx.createGain(); dry.gain.value = 0.7;
    source.connect(dry).connect(gain);
    source.connect(conv).connect(wet).connect(gain);
    nodes.push(conv, wet, dry);
  } else if (fx === "telephone") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    source.connect(hp).connect(lp).connect(gain);
    nodes.push(hp, lp);
  } else if (fx === "lowpass") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
    source.connect(lp).connect(gain);
    nodes.push(lp);
  } else {
    source.connect(gain);
  }

  gain.connect(ctx.destination);

  return {
    source, gain,
    cleanup: () => {
      try { gain.disconnect(); } catch {}
      nodes.forEach((n) => { try { n.disconnect(); } catch {} });
      try { source!.disconnect(); } catch {}
    },
  };
}

function makeImpulseResponse(ctx: BaseAudioContext, durationSec: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const ir = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return ir;
}

export function applyOfflineFxChain(
  ctx: BaseAudioContext,
  inputNode: AudioNode,
  fx: AudioFxType,
): AudioNode {
  if (!fx || fx === "none") return inputNode;

  if (fx === "robot") {
    const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 55;
    const oscGain = ctx.createGain(); oscGain.gain.value = 0.7;
    osc.connect(oscGain);

    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 2.0;
    const ringGain = ctx.createGain(); ringGain.gain.value = 0.6;
    oscGain.connect(ringGain.gain);

    const out = ctx.createGain();
    inputNode.connect(bp).connect(out);
    inputNode.connect(ringGain).connect(out);
    try { osc.start(); } catch {}
    return out;

  } else if (fx === "chipmunk") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 450;
    const p1 = ctx.createBiquadFilter(); p1.type = "peaking"; p1.frequency.value = 2400; p1.gain.value = 14; p1.Q.value = 2.5;
    const p2 = ctx.createBiquadFilter(); p2.type = "peaking"; p2.frequency.value = 3800; p2.gain.value = 10; p2.Q.value = 2.0;
    const delay = ctx.createDelay(); delay.delayTime.value = 0.008;

    inputNode.connect(hp).connect(p1).connect(p2).connect(delay);
    return delay;

  } else if (fx === "deep") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const sub = ctx.createBiquadFilter(); sub.type = "peaking"; sub.frequency.value = 120; sub.gain.value = 15; sub.Q.value = 1.8;
    const shelf = ctx.createBiquadFilter(); shelf.type = "lowshelf"; shelf.frequency.value = 250; shelf.gain.value = 10;

    inputNode.connect(lp).connect(sub).connect(shelf);
    return shelf;

  } else if (fx === "female") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 320;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 2100; peak.gain.value = 10; peak.Q.value = 2.0;
    const hs = ctx.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 3500; hs.gain.value = 8;

    inputNode.connect(hp).connect(peak).connect(hs);
    return hs;

  } else if (fx === "male") {
    const ls = ctx.createBiquadFilter(); ls.type = "lowshelf"; ls.frequency.value = 220; ls.gain.value = 10;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 450; peak.gain.value = 7; peak.Q.value = 1.5;
    const hs = ctx.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 3200; hs.gain.value = -6;

    inputNode.connect(ls).connect(peak).connect(hs);
    return hs;

  } else if (fx === "megaphone") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 750;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 1600; peak.gain.value = 12; peak.Q.value = 3.0;

    inputNode.connect(hp).connect(lp).connect(peak);
    return peak;

  } else if (fx === "alien") {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 95;
    const oscGain = ctx.createGain(); oscGain.gain.value = 0.5;
    osc.connect(oscGain);

    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.035;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    delay.connect(fb).connect(delay);

    const out = ctx.createGain();
    inputNode.connect(delay).connect(out);
    inputNode.connect(out);
    try { osc.start(); } catch {}
    return out;

  } else if (fx === "underwater") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.Q.value = 4.0;
    inputNode.connect(lp);
    return lp;

  } else if (fx === "echo") {
    const delay = ctx.createDelay(2.0); delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    delay.connect(fb).connect(delay);

    const out = ctx.createGain();
    inputNode.connect(out);
    inputNode.connect(delay).connect(wet).connect(out);
    return out;

  } else if (fx === "studio" || fx === "reverb") {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulseResponse(ctx, fx === "studio" ? 1.6 : 2.6, fx === "studio" ? 2.5 : 4);
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    const dry = ctx.createGain(); dry.gain.value = 0.7;

    const out = ctx.createGain();
    inputNode.connect(dry).connect(out);
    inputNode.connect(conv).connect(wet).connect(out);
    return out;

  } else if (fx === "telephone") {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    inputNode.connect(hp).connect(lp);
    return lp;

  } else if (fx === "lowpass") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
    inputNode.connect(lp);
    return lp;
  }

  return inputNode;
}

// Generate procedural SFX (no external assets) — returns a Blob URL for an MP3-ish WAV.
export function buildBuiltinSfx(name: BuiltinSfxName): { url: string; duration: number } {
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const offline = new (((window as any).OfflineAudioContext) || ((window as any).webkitOfflineAudioContext))(
    1, 44100 * 1.5, 44100,
  );
  const t0 = 0;
  const dur = 1.2;
  switch (name) {
    case "swoosh": {
      const buf = noiseBuffer(offline, dur);
      const src = offline.createBufferSource(); src.buffer = buf;
      const filter = offline.createBiquadFilter(); filter.type = "bandpass";
      filter.frequency.setValueAtTime(200, t0);
      filter.frequency.exponentialRampToValueAtTime(8000, t0 + 0.5);
      filter.Q.value = 4;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.7, t0 + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      src.connect(filter).connect(g).connect(offline.destination); src.start(t0);
      break;
    }
    case "boom": {
      const osc = offline.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(35, t0 + 0.6);
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
      osc.connect(g).connect(offline.destination); osc.start(t0); osc.stop(t0 + 0.8);
      break;
    }
    case "click": {
      const buf = noiseBuffer(offline, 0.05);
      const src = offline.createBufferSource(); src.buffer = buf;
      const g = offline.createGain(); g.gain.value = 0.6;
      src.connect(g).connect(offline.destination); src.start(t0);
      break;
    }
    case "ding": {
      const osc = offline.createOscillator(); osc.type = "triangle"; osc.frequency.value = 1760;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
      osc.connect(g).connect(offline.destination); osc.start(t0); osc.stop(t0 + 0.9);
      break;
    }
    case "pop": {
      const osc = offline.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(800, t0);
      osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.15);
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.7, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(g).connect(offline.destination); osc.start(t0); osc.stop(t0 + 0.25);
      break;
    }
    case "applause": {
      const buf = noiseBuffer(offline, 1.4);
      const src = offline.createBufferSource(); src.buffer = buf;
      const filter = offline.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 2500; filter.Q.value = 1;
      const g = offline.createGain(); g.gain.value = 0.4;
      src.connect(filter).connect(g).connect(offline.destination); src.start(t0);
      break;
    }
  }
  return offline.startRendering().then((rendered: AudioBuffer) => {
    const blob = bufferToWav(rendered);
    return { url: URL.createObjectURL(blob), duration: rendered.duration };
  }) as any;
}

export type BuiltinSfxName = "swoosh" | "boom" | "click" | "ding" | "pop" | "applause";

export const BUILTIN_SFX: { name: BuiltinSfxName; label: string; labelEn: string }[] = [
  { name: "swoosh", label: "سوش (سريع)", labelEn: "Swoosh (Fast)" },
  { name: "boom", label: "بوم (انفجار)", labelEn: "Boom (Impact)" },
  { name: "click", label: "نقرة", labelEn: "Click" },
  { name: "ding", label: "رنين", labelEn: "Ding" },
  { name: "pop", label: "بوب", labelEn: "Pop" },
  { name: "applause", label: "تصفيق", labelEn: "Applause" },
];

function noiseBuffer(ctx: BaseAudioContext, dur: number) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); writeStr(8, "WAVE"); writeStr(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); writeStr(36, "data"); view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([ab], { type: "audio/wav" });
}
