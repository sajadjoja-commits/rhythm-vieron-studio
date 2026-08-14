import React from "react";
import { History, Play, Scissors, Volume2, Video, RefreshCw, Clock, Trash2, Film } from "lucide-react";
import { ProjectMeta } from "@/context/MediaContext";

interface RecentAIActivityProps {
  recentProjects: ProjectMeta[];
  onOpenProject: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  onNavigate: (tab: string) => void;
  en: boolean;
}

export const RecentAIActivity: React.FC<RecentAIActivityProps> = ({
  recentProjects,
  onOpenProject,
  onDeleteProject,
  onNavigate,
  en,
}) => {
  // Mock default activity logs if no projects yet to demonstrate the UI
  const defaultActivities = [
    {
      id: "act_1",
      titleEn: "Background Removal",
      titleAr: "إزالة الخلفية",
      typeEn: "Image Processing",
      typeAr: "معالجة صورة",
      timeEn: "10 mins ago",
      timeAr: "منذ 10 دقائق",
      icon: Scissors,
      color: "text-blue-400",
    },
    {
      id: "act_2",
      titleEn: "Audio Isolation & Noise Clean",
      titleAr: "فصل الصوت وتنقية الضوضاء",
      typeEn: "Audio Enhancement",
      typeAr: "تحسين صوتي",
      timeEn: "1 hour ago",
      timeAr: "منذ ساعة",
      icon: Volume2,
      color: "text-pink-400",
    },
    {
      id: "act_3",
      titleEn: "4K Video Upscale",
      titleAr: "رفع جودة فيديو إلى 4K",
      typeEn: "Video Super-Res",
      typeAr: "دقة فائقة",
      timeEn: "Yesterday",
      timeAr: "بالأمس",
      icon: Video,
      color: "text-cyan-400",
    },
  ];

  return (
    <div className="mb-6 select-none animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <History className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">
              {en ? "Recent AI Activity" : "سجل العمليات الأخير"}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {en ? "Quick access to your recent AI tasks" : "وصول سريع للعمليات السابقة"}
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate("projects")}
          className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
        >
          {en ? "History" : "السجل الكامل"}
        </button>
      </div>

      {recentProjects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {recentProjects.slice(0, 4).map((p) => {
            const coverSrc = p.coverImage || p.thumb;

            return (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all shadow-sm group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Video Thumbnail Image instead of Sparkles star icon */}
                  <div className="w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0 relative overflow-hidden border border-border/60">
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/30 via-purple-600/20 to-cyan-500/20 flex items-center justify-center">
                        <Film className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <Play className="w-2.5 h-2.5 text-white fill-current ml-0.5 rtl:mr-0.5 rtl:ml-0" />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-xs text-foreground truncate">{p.name}</h3>
                    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{p.duration ? `${p.duration.toFixed(1)}s` : "Video Project"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onOpenProject(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-[10px] active:scale-95 transition-transform shadow-sm"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{en ? "Reopen" : "إعادة فتح"}</span>
                  </button>

                  {onDeleteProject && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(p.id);
                      }}
                      className="w-7 h-7 rounded-xl bg-secondary/80 hover:bg-destructive/15 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors active:scale-90"
                      title={en ? "Move to Trash" : "حذف إلى سلة المهملات"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {defaultActivities.map((act) => {
            const IconComp = act.icon;
            return (
              <div
                key={act.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/70 hover:border-border transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl bg-secondary flex items-center justify-center ${act.color}`}>
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-xs text-foreground truncate">
                      {en ? act.titleEn : act.titleAr}
                    </h3>
                    <p className="text-[9px] text-muted-foreground">{en ? act.timeEn : act.timeAr}</p>
                  </div>
                </div>

                <button
                  onClick={() => onNavigate("aistudio")}
                  className="w-7 h-7 rounded-xl bg-secondary hover:bg-primary/20 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors active:scale-90"
                  title={en ? "Run again" : "إعادة تشغيل"}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecentAIActivity;
