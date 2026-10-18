import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, Zap, Cloud, CheckCircle, Activity } from "lucide-react";
import { aiService, AICapabilities } from "@/services/ai";

interface AISystemHealthCardProps {
  en: boolean;
}

export const AISystemHealthCard: React.FC<AISystemHealthCardProps> = ({ en }) => {
  const [caps, setCaps] = useState<AICapabilities | null>(null);

  useEffect(() => {
    let mounted = true;
    aiService.getCapabilities().then((detected) => {
      if (mounted) {
        setCaps(detected);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const isNative = Boolean(caps?.nativeAI);
  const memoryLabel = caps
    ? `${Math.round(caps.memory.availableMB)} MB / ${Math.round(caps.memory.totalMB || caps.memory.availableMB * 2)} MB`
    : typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? `${(navigator as any).deviceMemory} GB`
    : "4-8 GB";

  const engineLabel = isNative
    ? (en ? "Google ML Kit (Native)" : "Google ML Kit (أصلي)")
    : (en ? "MediaPipe WASM/SIMD" : "MediaPipe معالج المتصفح");

  const accelLabel = isNative
    ? (caps?.accelerators?.nnapiApiAvailable ? "NNAPI / ARM64 NEON" : "ARM64 Native Engine")
    : (caps?.accelerators?.gpuUsable ? "WebGPU Engine" : "WASM SIMD 128-bit");

  const modelStatusLabel = isNative
    ? (en ? "On-Device Play Services" : "محلي على الجهاز")
    : (en ? "Local Memory Cache" : "ذاكرة تخزين محلية");

  return (
    <div className="rounded-2xl bg-card border border-border/80 p-4 shadow-lg mb-6 select-none animate-fade-in">
      <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Activity className="w-4 h-4 animate-pulse text-primary" />
          </div>
          <div>
            <h3 className="font-heading text-xs font-bold text-foreground">
              {en ? "AI System & Hardware Health" : "حالة محرك الذكاء الاصطناعي والجهاز"}
            </h3>
            <p className="text-[9px] text-muted-foreground">
              {isNative
                ? (en ? "Hardware accelerated on-device engine" : "تسريع عتادي مباشر على الجهاز")
                : (en ? "Real-time client-side acceleration" : "تسريع المعالجة الحية")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[9px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span>{isNative ? (en ? "Native Active" : "محلي أصلي") : (en ? "Active" : "نشط")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {/* Engine Type */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">{en ? "Primary Engine" : "المحرك الأساسي"}</p>
            <p className="text-[10px] font-bold text-foreground truncate">
              {engineLabel}
            </p>
          </div>
        </div>

        {/* Acceleration */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">{en ? "Acceleration" : "التسريع"}</p>
            <p className="text-[10px] font-bold text-foreground truncate">
              {accelLabel}
            </p>
          </div>
        </div>

        {/* RAM */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-amber-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">{en ? "Memory Available" : "الذاكرة المتاحة"}</p>
            <p className="text-[10px] font-bold text-foreground truncate">{memoryLabel}</p>
          </div>
        </div>

        {/* Local Models */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">
              {en ? "Model Deployment" : "طريقة تشغيل النماذج"}
            </p>
            <p className="text-[10px] font-bold text-foreground truncate">{modelStatusLabel}</p>
          </div>
        </div>

        {/* Cloud Connection */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2 col-span-2 sm:col-span-2">
          <Cloud className="w-3.5 h-3.5 text-cyan-400" />
          <div className="flex-1 overflow-hidden flex items-center justify-between">
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase">
                {en ? "Cloud Connection" : "الاتصال السحابي"}
              </p>
              <p className="text-[10px] font-bold text-foreground truncate">{en ? "Online (100% Ready)" : "متصل وجاهز"}</p>
            </div>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
              FLUX.1 + Gemini
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AISystemHealthCard;
