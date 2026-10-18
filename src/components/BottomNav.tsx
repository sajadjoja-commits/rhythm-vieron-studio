import { Home, Sparkles, Clapperboard, FolderOpen, Settings } from "lucide-react";
import { t } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface BottomNavProps {
  active: string;
  onNavigate: (tab: string) => void;
  onPlusClick?: () => void;
}

const tabs = [
  { id: "home", icon: Home, labelKey: "nav.home" },
  { id: "templates", icon: Clapperboard, labelKey: "nav.templates" },
  { id: "aistudio", icon: Sparkles, labelKey: "nav.aistudio", isCenter: true },
  { id: "projects", icon: FolderOpen, labelKey: "nav.projects" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

const BottomNav = ({ active, onNavigate }: BottomNavProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
      <div className="flex items-center justify-around py-1.5 px-1 max-w-lg mx-auto">
        {tabs.map((tab) => {
          if (tab.isCenter || tab.id === "aistudio") {
            const isActive = active === "aistudio";
            return (
              <button
                key={tab.id}
                onClick={() => {
                  playSfx("pop");
                  onNavigate("aistudio");
                }}
                className="relative -mt-5 flex flex-col items-center group transition-transform active:scale-95 z-10"
                aria-label={t("nav.aistudio")}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-tr from-primary via-indigo-600 to-pink-500 ring-2 ring-primary ring-offset-2 ring-offset-background scale-105 shadow-primary/50 glow-primary-sm"
                      : "bg-gradient-to-tr from-primary via-purple-600 to-pink-500 hover:scale-105 shadow-primary/30"
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white transition-transform group-hover:rotate-12" />
                    <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-white/25 backdrop-blur-sm text-white px-1 py-0.2 rounded-full border border-white/40 tracking-tighter shadow-sm">
                      AI
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold mt-0.5 tracking-tight transition-colors ${
                    isActive ? "text-primary font-black" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {t("nav.aistudio")}
                </span>
              </button>
            );
          }
          const isActive = active === tab.id;
          const Icon = tab.icon!;
          return (
            <button
              key={tab.id}
              onClick={() => {
                playSfx("click");
                onNavigate(tab.id);
              }}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? "text-primary glow-primary-sm font-bold scale-105"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
