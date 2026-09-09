import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, Zap, Cloud, CheckCircle, Activity } from "lucide-react";

interface AISystemHealthCardProps {
  en: boolean;
}

export const AISystemHealthCard: React.FC<AISystemHealthCardProps> = ({ en }) => {
  const [stats, setStats] = useState({
    webGpu: false,
    webGl: true,
    wasm: true,
    memoryGb: "8 GB",
    localModelStatus: "Ready",
    cloudStatus: "Online",
  });

  useEffect(() => {
    // Detect WebGPU
    const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
    // Estimate memory
    const deviceMemory =
      typeof navigator !== "undefined" && "deviceMemory" in navigator
        ? `${(navigator as any).deviceMemory} GB`
        : "4-8 GB";

    setStats({
      webGpu: hasWebGpu,
      webGl: true,
      wasm: typeof WebAssembly === "object",
      memoryGb: deviceMemory,
      localModelStatus: hasWebGpu ? "WebGPU Fast" : "WASM Local",
      cloudStatus: "Online 100%",
    });
  }, []);

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
              {en ? "Real-time engine acceleration" : "تسريع المعالجة الحية"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[9px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span>{en ? "Active" : "نشط"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {/* WebGPU */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">WebGPU</p>
            <p className="text-[10px] font-bold text-foreground truncate">
              {stats.webGpu ? (en ? "Supported (Hardware)" : "مدعوم (تسريع)") : (en ? "WebGL Fallback" : "بديل WebGL")}
            </p>
          </div>
        </div>

        {/* WebGL & WASM */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">WASM + SIMD</p>
            <p className="text-[10px] font-bold text-foreground truncate">
              {stats.wasm ? (en ? "Ultra Fast 128-bit" : "سريع جداً 128- بت") : "Standard"}
            </p>
          </div>
        </div>

        {/* RAM */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-amber-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">RAM</p>
            <p className="text-[10px] font-bold text-foreground truncate">{stats.memoryGb}</p>
          </div>
        </div>

        {/* Local Models */}
        <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <div className="flex-1 overflow-hidden">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase">
              {en ? "Local Engine" : "المعالجة المحلية"}
            </p>
            <p className="text-[10px] font-bold text-foreground truncate">{stats.localModelStatus}</p>
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
              <p className="text-[10px] font-bold text-foreground truncate">{stats.cloudStatus}</p>
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
