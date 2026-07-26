import React from "react";
import vireonLogoPng from "@/assets/vireon-logo.png";

interface VireonLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

/**
 * Official Vireon AI Logo Component.
 * Uses the standardized PNG logo asset with an SVG fallback.
 */
export const VireonLogo: React.FC<VireonLogoProps> = ({
  className = "w-9 h-9",
  size,
  showText = false,
}) => {
  const [imgError, setImgError] = React.useState(false);
  const styleProps = size ? { width: size, height: size } : {};

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <div
        className={`relative flex items-center justify-center rounded-2xl bg-slate-950 p-1 border border-primary/30 shadow-lg shadow-blue-600/25 overflow-hidden ${className}`}
        style={styleProps}
      >
        {!imgError ? (
          <img
            src={vireonLogoPng}
            alt="Vireon AI Logo"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover rounded-xl"
          />
        ) : (
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_2px_8px_rgba(59,130,246,0.5)]"
          >
            <defs>
              <linearGradient id="vireonMainV" x1="10%" y1="10%" x2="90%" y2="90%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="45%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="vireonFacet" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="vireonSparkle" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0f9ff" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <path d="M 22 24 L 38 24 L 50 68 L 38 72 Z" fill="url(#vireonMainV)" />
            <path d="M 78 24 L 62 24 L 50 68 L 62 72 Z" fill="url(#vireonFacet)" />
            <path d="M 45 35 L 60 45 L 45 55 Z" fill="url(#vireonSparkle)" />
            <circle cx="75" cy="22" r="4.5" fill="#38bdf8" />
            <circle cx="75" cy="22" r="2" fill="#ffffff" />
          </svg>
        )}
      </div>

      {showText && (
        <div className="flex flex-col justify-center">
          <span className="font-heading font-black text-foreground tracking-tight leading-none text-base bg-gradient-to-r from-foreground via-foreground to-primary/90 bg-clip-text">
            Vireon <span className="text-primary font-mono font-bold">AI</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default VireonLogo;
