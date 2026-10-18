import React from "react";
import { Sparkles, Download, Cloud, CheckCircle2, ChevronRight, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { IMAGE_AI_TOOLS_REGISTRY, ImageAIToolDefinition } from "@/ai/image/toolsRegistry";
import { ImageAITaskType } from "@/ai/image/types";

interface ImageAIHubProps {
  onSelectTool: (toolId: ImageAITaskType) => void;
  onClose: () => void;
  className?: string;
}

export const ImageAIHub: React.FC<ImageAIHubProps> = ({
  onSelectTool,
  onClose,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col bg-[#0e131f] text-foreground rounded-t-3xl border-t border-white/10 shadow-2xl max-h-[85dvh] overflow-hidden ${className}`}
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      dir="rtl"
    >
      {/* Drag handle & header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              {t("imageAi.title")}
            </h2>
            <p className="text-[11px] text-slate-400">
              {t("imageAi.subtitle")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={t("imageAi.cancel")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of Tools */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 min-h-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {IMAGE_AI_TOOLS_REGISTRY.map((tool: ImageAIToolDefinition) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectTool(tool.id)}
                className="group relative flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] active:scale-[0.98] border border-white/5 hover:border-blue-500/30 transition text-right w-full min-h-[72px]"
              >
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform"
                  style={{
                    backgroundColor: `${tool.accentColor}20`,
                    color: tool.accentColor,
                    borderColor: `${tool.accentColor}40`,
                    borderWidth: 1,
                  }}
                >
                  <Icon className="w-5 h-5" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold text-slate-100 group-hover:text-blue-400 transition-colors truncate">
                      {t(tool.titleKey)}
                    </span>

                    {/* Badge: جاهز / تنزيل / سحابي */}
                    {tool.badgeType === "ready" && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>{t("imageAi.badgeReady")}</span>
                      </span>
                    )}
                    {tool.badgeType === "needs-download" && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
                        <Download className="w-2.5 h-2.5" />
                        <span>
                          {t("imageAi.badgeDownload", { size: tool.downloadSize || "10MB" })}
                        </span>
                      </span>
                    )}
                    {tool.badgeType === "cloud" && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex-shrink-0">
                        <Cloud className="w-2.5 h-2.5" />
                        <span>{t("imageAi.badgeCloud")}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                    {t(tool.descKey)}
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors self-center flex-shrink-0 rtl:rotate-180" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImageAIHub;
