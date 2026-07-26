import { useEffect, useRef } from "react";
import { AudioTrackItem } from "@/context/MediaContext";
import { attachFxChain } from "@/lib/audioFx";
import { getAudioContext } from "@/lib/audioAnalysis";

interface Props {
  tracks: AudioTrackItem[];
  currentTime: number;
  isPlaying: boolean;
}

/**
 * Hidden <audio> elements that play each timeline audio track in sync with
 * the video preview, with per-track FX, volume and mute applied.
 */
const AudioPlayback = ({ tracks, currentTime, isPlaying }: Props) => {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const chainRef = useRef<Map<string, ReturnType<typeof attachFxChain>>>(new Map());

  // Hook up FX chain whenever fx/volume/muted changes
  useEffect(() => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    tracks.forEach((t) => {
      const el = audioRefs.current.get(t.id);
      if (!el) return;
      const prev = chainRef.current.get(t.id);
      if (prev) prev.cleanup();
      const chain = attachFxChain(ctx, el, t.fx, t.volume, t.muted);
      chainRef.current.set(t.id, chain);
    });
  }, [tracks]);

  // Sync play/pause + currentTime
  useEffect(() => {
    tracks.forEach((t) => {
      const el = audioRefs.current.get(t.id);
      if (!el) return;
      const localStart = currentTime - t.start;
      const sourceTime = t.offset + localStart;
      const active = localStart >= 0 && localStart < t.duration;
      if (!active) {
        if (!el.paused) el.pause();
        return;
      }
      // fade in / out envelope
      const fIn = t.fadeIn ?? 0;
      const fOut = t.fadeOut ?? 0;
      let mul = 1;
      if (fIn > 0 && localStart < fIn) mul = localStart / fIn;
      const remaining = t.duration - localStart;
      if (fOut > 0 && remaining < fOut) mul = Math.min(mul, remaining / fOut);
      el.volume = Math.max(0, Math.min(1, (t.volume ?? 1) * mul));
      if (Math.abs(el.currentTime - sourceTime) > 0.2) {
        try { el.currentTime = sourceTime; } catch {}
      }
      if (isPlaying) { if (el.paused) el.play().catch(() => {}); }
      else if (!el.paused) el.pause();
    });
    if (!isPlaying) {
      tracks.forEach((t) => {
        const el = audioRefs.current.get(t.id);
        if (el && !el.paused) el.pause();
      });
    }
  }, [currentTime, isPlaying, tracks]);

  return (
    <div className="hidden">
      {tracks.map((t) => (
        <audio
          key={t.id}
          ref={(el) => {
            if (el) audioRefs.current.set(t.id, el);
            else audioRefs.current.delete(t.id);
          }}
          src={t.url}
          preload="auto"
          crossOrigin="anonymous"
        />
      ))}
    </div>
  );
};

export default AudioPlayback;
