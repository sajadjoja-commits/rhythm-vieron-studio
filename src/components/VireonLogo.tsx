import React from "react";

interface VireonLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

/**
 * Official Vireon AI Studio Logo Component.
 * Displays the exact vector glowing electric "V" mark from the app cover logo (/vireon-logo.svg).
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
        className={`relative flex items-center justify-center rounded-2xl bg-[#090d16] p-1.5 border border-primary/30 shadow-lg shadow-blue-600/30 overflow-hidden ${className}`}
        style={styleProps}
      >
        {!imgError ? (
          <img
            src="/vireon-logo.svg"
            alt="Vireon AI Studio Logo"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        ) : (
          <svg
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_0_12px_rgba(59,130,246,0.7)]"
          >
            <defs>
              <linearGradient id="vGlowGradientInline" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="30%" stopColor="#3b82f6" />
                <stop offset="70%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <filter id="neonBlurInline" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="12" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M 102 112 L 184 112 L 256 348 L 328 112 L 410 112 L 297 410 C 276 450 236 450 215 410 Z"
              fill="url(#vGlowGradientInline)"
              filter="url(#neonBlurInline)"
            />
          </svg>
        )}
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
