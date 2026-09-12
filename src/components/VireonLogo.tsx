import React from "react";

interface VireonLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

/**
 * Official Vireon AI Studio Logo Component.
 * Displays the exact vector glowing electric "V" logo mark matching the cover image.
 */
export const VireonLogo: React.FC<VireonLogoProps> = ({
  className = "w-9 h-9",
  size,
  showText = false,
}) => {
  const styleProps = size ? { width: size, height: size } : {};

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <div
        className={`relative flex items-center justify-center rounded-2xl bg-[#090d16] p-1.5 border border-blue-500/30 shadow-lg shadow-blue-600/30 overflow-hidden ${className}`}
        style={styleProps}
      >
        <svg
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="vGlowGradComp" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="35%" stopColor="#3b82f6" />
              <stop offset="70%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <filter id="neonBlurComp" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="18" result="blur1" />
              <feGaussianBlur stdDeviation="8" result="blur2" />
              <feMerge>
                <feMergeNode in="blur1" />
                <feMergeNode in="blur2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M 105 110 L 185 110 L 256 280 L 327 110 L 407 110 L 295 375 C 275 425 237 425 217 375 Z"
            fill="url(#vGlowGradComp)"
            filter="url(#neonBlurComp)"
            opacity="0.9"
          />
          <path
            d="M 105 110 L 185 110 L 256 280 L 327 110 L 407 110 L 295 375 C 275 425 237 425 217 375 Z"
            fill="url(#vGlowGradComp)"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col justify-center">
          <span className="font-heading font-black text-foreground tracking-tight leading-none text-base bg-gradient-to-r from-foreground via-foreground to-primary/90 bg-clip-text">
            Vireon <span className="text-primary font-mono font-bold">AI Studio</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default VireonLogo;
