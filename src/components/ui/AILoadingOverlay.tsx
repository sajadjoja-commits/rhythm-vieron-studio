import React, { useEffect, useState } from "react";
import { Sparkles, Cpu, CheckCircle2 } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";

interface AILoadingOverlayProps {
  isVisible: boolean;
  progress?: number; // 0 to 100
  stageText?: string;
  subText?: string;
  estimatedSecondsLeft?: number;
  onCancel?: () => void;
}

const STAGES_EN = [
  "Preparing AI Engine...",
  "Loading Neural Weights...",
  "Analyzing Media Frames...",
  "Processing Enhancements...",
  "Optimizing Latent Tensor...",
  "Finalizing Output...",
];

const STAGES_AR = [
  "جاري إعداد محرك الذكاء الاصطناعي...",
  "تحميل الأوزان العصبية...",
  "تحليل إطارات الوسائط...",
  "معالجة التحسينات العصبية...",
  "تحسين المخرجات...",
  "إكمال المعالجة...",
];

export const AILoadingOverlay: React.FC<AILoadingOverlayProps> = ({
  isVisible,
  progress = 0,
  stageText,
  subText,
  estimatedSecondsLeft,
  onCancel,
}) => {
  const [internalProgress, setInternalProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setInternalProgress(0);
      setStageIndex(0);
      return;
    }

    if (progress > 0) {
      setInternalProgress(progress);
    } else {
      const interval = setInterval(() => {
        setInternalProgress((prev) => {
          if (prev >= 98) return 98;
          const step = Math.floor(Math.random() * 4) + 1;
          return prev + step;
        });
      }, 300);
      return () => clearInterval(interval);
    }
  }, [isVisible, progress]);

  useEffect(() => {
    if (internalProgress < 20) setStageIndex(0);
    else if (internalProgress < 40) setStageIndex(1);
    else if (internalProgress < 60) setStageIndex(2);
    else if (internalProgress < 80) setStageIndex(3);
    else if (internalProgress < 95) setStageIndex(4);
    else setStageIndex(5);
  }, [internalProgress]);

  if (!isVisible) return null;

  const displayStageText = stageText || STAGES_EN[stageIndex];
  const displaySubText = subText || "Vireon AI Latent Engine";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-fade-in select-none">
      {/* Background Orbital Glows */}
      <div className="absolute w-72 h-72 rounded-full bg-blue-600/20 blur-[90px] animate-pulse pointer-events-none" />
      <div className="absolute w-64 h-64 rounded-full bg-purple-600/20 blur-[90px] animate-pulse delay-500 pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative w-full max-w-sm rounded-3xl bg-card/90 border border-border/80 shadow-2xl p-6 flex flex-col items-center text-center overflow-hidden">
        {/* Glowing Top Ambient Border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-primary to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />

        {/* Pulsing Rings around Logo */}
        <div className="relative mb-6 mt-2 flex items-center justify-center">
          <div className="absolute w-24 h-24 rounded-full border border-blue-500/30 animate-ping opacity-75" />
          <div className="absolute w-20 h-20 rounded-full border border-purple-500/30 animate-spin" style={{ animationDuration: "6s" }} />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 via-primary/20 to-purple-600/20 border border-primary/40 flex items-center justify-center shadow-lg backdrop-blur-sm">
            <VireonLogo className="w-9 h-9 animate-bounce" />
          </div>
        </div>

        {/* Title & Stage Status */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold tracking-wider uppercase mb-2">
          <Cpu className="w-3 h-3 animate-spin" />
          <span>Vireon AI Processing</span>
        </div>

        <h3 className="font-heading font-bold text-base text-foreground mb-1 transition-all">
          {displayStageText}
        </h3>
        <p className="text-[11px] text-muted-foreground mb-5 font-mono">{displaySubText}</p>

        {/* Progress Bar & Percentage */}
        <div className="w-full bg-secondary/80 rounded-full h-2.5 p-0.5 overflow-hidden mb-3 border border-border/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-primary to-purple-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.6)]"
            style={{ width: `${Math.min(100, Math.max(2, internalProgress))}%` }}
          />
        </div>

        <div className="w-full flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>{Math.round(internalProgress)}% Completed</span>
          {estimatedSecondsLeft !== undefined && (
            <span>~{estimatedSecondsLeft}s remaining</span>
          )}
        </div>

        {/* Cancel Action if supported */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Cancel Task
          </button>
        )}
      </div>
    </div>
  );
};

export default AILoadingOverlay;
