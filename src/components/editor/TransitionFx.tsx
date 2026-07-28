import { useEffect, useState } from "react";
import { TransitionType } from "@/context/MediaContext";

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
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">{inner}</div>
  );
};

export default TransitionFx;
