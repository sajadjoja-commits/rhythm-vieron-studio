import { useEffect, useState, useRef } from "react";
import { TransitionType } from "@/context/MediaContext";
import { gsap } from "gsap";

interface Props {
  /** When this changes (e.g. clip id), the animation re-fires. */
  triggerKey: string | number;
  type: TransitionType;
  durationMs: number;
}

/**
 * Plays a high-end visual transition animation as an overlay on top of the
 * preview when a clip boundary is crossed. The actual underlying media just
 * swaps; this layer paints the artistic transition (fade-to-black, blur,
 * slide-wipe, zoom punch, dissolve) in a Premium Vireon AI style.
 */
const TransitionFx = ({ triggerKey, type, durationMs }: Props) => {
  const [active, setActive] = useState(false);
  const gsapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!type || type === "none") return;
    setActive(false);
    const id = requestAnimationFrame(() => setActive(true));
    const t = window.setTimeout(() => setActive(false), durationMs);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [triggerKey, type, durationMs]);

  useEffect(() => {
    if (!active || !gsapRef.current) return;
    const durSec = durationMs / 1000;

    if (type === "gsap-elastic-zoom") {
      gsap.fromTo(
        gsapRef.current,
        { scale: 0.1, opacity: 0 },
        { scale: 1, opacity: 1, duration: durSec, ease: "elastic.out(1.2, 0.35)" }
      );
    } else if (type === "gsap-3d-flip") {
      gsap.fromTo(
        gsapRef.current,
        { rotateY: 90, opacity: 0 },
        { rotateY: 0, opacity: 1, duration: durSec, ease: "back.out(1.7)" }
      );
    } else if (type === "gsap-stagger-wipe") {
      const stripes = gsapRef.current.querySelectorAll(".stagger-stripe");
      if (stripes.length) {
        gsap.fromTo(
          stripes,
          { scaleY: 0 },
          { scaleY: 1, duration: durSec * 0.7, stagger: 0.04, ease: "power4.inOut" }
        );
      }
    } else if (type === "gsap-elastic-bounce") {
      gsap.fromTo(
        gsapRef.current,
        { y: "-100%" },
        { y: "0%", duration: durSec, ease: "bounce.out" }
      );
    }
  }, [active, type, durationMs]);

  if (!active || !type || type === "none") return null;

  const baseStyle: React.CSSProperties = {
    animationDuration: `${durationMs}ms`,
    animationTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
    animationFillMode: "both",
  };

  let inner: React.ReactNode = null;
  switch (type) {
    case "fade":
      inner = <div className="absolute inset-0 bg-black animate-fx-fade" style={baseStyle} />;
      break;
    case "dissolve":
      inner = (
        <>
          <div
            className="absolute inset-0 backdrop-blur-md bg-white/10 animate-fx-fade"
            style={baseStyle}
          />
          <div className="absolute inset-0 bg-black/40 animate-fx-fade" style={baseStyle} />
        </>
      );
      break;
    case "slide":
      inner = (
        <>
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-fx-slide mix-blend-overlay"
            style={baseStyle}
          />
          <div
            className="absolute inset-0 gradient-primary animate-fx-slide opacity-30"
            style={baseStyle}
          />
        </>
      );
      break;
    case "zoom":
      inner = (
        <>
          <div
            className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.85)_0%,rgba(0,0,0,0)_75%)] animate-fx-zoom opacity-60 mix-blend-screen"
            style={baseStyle}
          />
          <div
            className="absolute inset-0 border-[30px] border-double border-white/20 rounded-full animate-fx-zoom origin-center"
            style={baseStyle}
          />
        </>
      );
      break;
    case "wipe":
      inner = (
        <div
          className="absolute inset-y-0 w-8 bg-gradient-to-r from-primary via-accent to-primary shadow-[0_0_30px_rgba(59,130,246,0.9)] animate-fx-wipe"
          style={baseStyle}
        />
      );
      break;
    case "blur":
      inner = (
        <div
          className="absolute inset-0 backdrop-blur-2xl bg-gradient-to-br from-black/30 via-white/10 to-black/30 animate-fx-fade"
          style={baseStyle}
        />
      );
      break;
    case "glitch":
      inner = (
        <>
          <div
            className="absolute inset-0 bg-foreground/60 animate-fx-glitch"
            style={baseStyle}
          />
          <div
            className="absolute inset-0 bg-red-500/15 mix-blend-screen animate-fx-glitch"
            style={{ ...baseStyle, animationDelay: "40ms" }}
          />
          <div
            className="absolute inset-0 bg-cyan-500/15 mix-blend-screen animate-fx-glitch"
            style={{ ...baseStyle, animationDelay: "80ms" }}
          />
          {/* Scanlines overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.3)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
        </>
      );
      break;
    case "spin":
      inner = (
        <>
          <div
            className="absolute inset-0 bg-foreground/50 animate-fx-spin"
            style={baseStyle}
          />
          <div
            className="absolute inset-0 rounded-full border-[12px] border-dashed border-primary/30 animate-fx-spin"
            style={baseStyle}
          />
        </>
      );
      break;
    case "flash":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-tr from-amber-500 via-white to-orange-600 animate-fx-flash mix-blend-screen opacity-95"
          style={baseStyle}
        />
      );
      break;
    case "shutter":
      inner = (
        <>
          <div
            className="absolute inset-x-0 top-0 h-1/2 bg-black/95 animate-fx-shutter origin-top"
            style={baseStyle}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-black/95 animate-fx-shutter origin-bottom"
            style={baseStyle}
          />
        </>
      );
      break;
    case "iris":
      inner = (
        <div
          className="absolute inset-0 bg-black animate-fx-iris"
          style={{
            ...baseStyle,
            maskImage: "radial-gradient(circle, transparent 25%, black 65%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 25%, black 65%)",
          }}
        />
      );
      break;
    case "split":
      inner = (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/2 bg-black animate-fx-split-left"
            style={baseStyle}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/2 bg-black animate-fx-split-right"
            style={baseStyle}
          />
        </>
      );
      break;
    case "mosaic":
      inner = (
        <div
          className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm animate-fx-mosaic"
          style={baseStyle}
        />
      );
      break;
    case "ripple":
      inner = (
        <div
          className="absolute inset-0 animate-fx-ripple"
          style={baseStyle}
        />
      );
      break;
    case "radar":
      inner = (
        <div
          className="absolute inset-0 bg-black animate-fx-radar"
          style={baseStyle}
        />
      );
      break;
    case "whip-pan":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-r from-cyan-500/80 via-white/90 to-blue-600/80 backdrop-blur-lg animate-fx-slide"
          style={baseStyle}
        />
      );
      break;
    case "zoom-blur":
      inner = (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95)_0%,rgba(0,0,0,0.8)_80%)] backdrop-blur-xl animate-fx-zoom"
          style={baseStyle}
        />
      );
      break;
    case "glitch-slice":
      inner = (
        <>
          <div
            className="absolute inset-0 bg-gradient-to-b from-red-500/30 via-transparent to-cyan-500/30 animate-fx-glitch mix-blend-screen"
            style={baseStyle}
          />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.5),rgba(0,0,0,0.5)_4px,transparent_4px,transparent_8px)]" />
        </>
      );
      break;
    case "page-flip":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-l from-black/80 via-white/20 to-transparent animate-fx-split-right"
          style={baseStyle}
        />
      );
      break;
    case "gsap-elastic-zoom":
      inner = (
        <div ref={gsapRef} className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full h-full gradient-primary opacity-40 mix-blend-screen rounded-full blur-xl scale-125" />
          <div className="absolute inset-0 border-8 border-primary/50 rounded-2xl shadow-[0_0_50px_rgba(59,130,246,0.8)]" />
        </div>
      );
      break;
    case "gsap-3d-flip":
      inner = (
        <div ref={gsapRef} className="absolute inset-0 bg-gradient-to-tr from-purple-900/80 via-indigo-900/60 to-black/90 backdrop-blur-md shadow-2xl border border-white/20" />
      );
      break;
    case "gsap-stagger-wipe":
      inner = (
        <div ref={gsapRef} className="absolute inset-0 grid grid-cols-10 h-full w-full pointer-events-none">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="stagger-stripe h-full bg-gradient-to-b from-pink-500 via-purple-600 to-indigo-700 origin-top shadow-md border-r border-white/10" />
          ))}
        </div>
      );
      break;
    case "gsap-elastic-bounce":
      inner = (
        <div ref={gsapRef} className="absolute inset-0 bg-gradient-to-b from-emerald-500/80 via-teal-700/80 to-slate-900/90 backdrop-blur-md border-b-4 border-emerald-400 shadow-[0_10px_40px_rgba(16,185,129,0.5)]" />
      );
      break;
    case "sun-flare":
      inner = (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.95)_0%,rgba(249,115,22,0.6)_40%,transparent_80%)] animate-fx-flash mix-blend-screen"
          style={baseStyle}
        />
      );
      break;
    case "light-leak":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-tr from-rose-500/40 via-amber-400/60 to-transparent backdrop-blur-sm animate-fx-fade mix-blend-screen"
          style={baseStyle}
        />
      );
      break;
    case "brush-paint":
      inner = (
        <div
          className="absolute inset-0 bg-emerald-600/30 backdrop-blur-md animate-fx-wipe"
          style={baseStyle}
        />
      );
      break;
    case "bokeh-blur":
      inner = (
        <div
          className="absolute inset-0 backdrop-blur-xl bg-pink-500/10 animate-fx-fade"
          style={baseStyle}
        >
          <div className="absolute top-1/4 left-1/3 w-32 h-32 rounded-full bg-pink-400/30 blur-2xl animate-pulse" />
          <div className="absolute bottom-1/3 right-1/4 w-40 h-40 rounded-full bg-amber-400/30 blur-2xl animate-pulse" />
        </div>
      );
      break;
    case "cinematic-bars":
      inner = (
        <>
          <div
            className="absolute inset-x-0 top-0 h-1/4 bg-black animate-fx-shutter origin-top"
            style={baseStyle}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-1/4 bg-black animate-fx-shutter origin-bottom"
            style={baseStyle}
          />
        </>
      );
      break;
    case "cube-rotate":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-x-8 border-indigo-500/40 animate-fx-spin"
          style={baseStyle}
        />
      );
      break;
    case "color-flow":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-r from-purple-500/50 via-pink-500/60 to-cyan-500/50 mix-blend-color-dodge animate-fx-slide"
          style={baseStyle}
        />
      );
      break;
    case "retro-pixel":
      inner = (
        <div
          className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm animate-fx-mosaic"
          style={baseStyle}
        />
      );
      break;
    case "star-warp":
      inner = (
        <div
          className="absolute inset-0 bg-black animate-fx-iris"
          style={baseStyle}
        />
      );
      break;
    case "liquid-melt":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-b from-cyan-500/40 via-sky-400/50 to-blue-600/60 backdrop-blur-md animate-fx-liquid mix-blend-overlay"
          style={baseStyle}
        >
          <div className="absolute inset-x-0 top-0 h-1/2 bg-cyan-300/30 rounded-b-[40%] blur-sm animate-pulse" />
        </div>
      );
      break;
    case "cross-zoom":
      inner = (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,1)_0%,rgba(245,158,11,0.8)_30%,rgba(0,0,0,0.4)_70%)] animate-fx-cross-zoom mix-blend-screen"
          style={baseStyle}
        />
      );
      break;
    case "glitch-rgb-shatter":
      inner = (
        <div className="absolute inset-0 animate-fx-glitch overflow-hidden" style={baseStyle}>
          <div className="absolute inset-0 bg-red-600/25 translate-x-2 mix-blend-screen" />
          <div className="absolute inset-0 bg-cyan-400/25 -translate-x-2 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-transparent h-4 animate-pulse" />
        </div>
      );
      break;
    case "burn-film":
      inner = (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,237,213,0.95)_0%,rgba(249,115,22,0.85)_40%,rgba(194,65,12,0.6)_70%,rgba(0,0,0,0.9)_100%)] animate-fx-film-burn mix-blend-screen"
          style={baseStyle}
        />
      );
      break;
    case "kaleido-spin":
      inner = (
        <div
          className="absolute inset-0 bg-gradient-to-tr from-purple-600/60 via-fuchsia-500/50 to-pink-500/60 backdrop-blur-md animate-fx-kaleido mix-blend-color-dodge border-[20px] border-double border-purple-400/50 rounded-full"
          style={baseStyle}
        />
      );
      break;
    case "heart-zoom":
      inner = (
        <div
          className="absolute inset-0 flex items-center justify-center animate-fx-heart pointer-events-none"
          style={baseStyle}
        >
          <div className="w-64 h-64 bg-pink-500/80 shadow-[0_0_80px_rgba(236,72,153,0.9)] [clip-path:path('M12_21.35l-1.45-1.32C5.4_15.36_2_12.28_2_8.5_2_5.42_4.42_3_7.5_3c1.74_0_3.41.81_4.5_2.09C13.09_3.81_14.76_3_16.5_3_19.58_3_22_5.42_22_8.5c0_3.78-3.4_6.86-8.55_11.54L12_21.35z')] transform scale-[6]" />
        </div>
      );
      break;
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">{inner}</div>
  );
};

export default TransitionFx;
