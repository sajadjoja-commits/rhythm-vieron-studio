import { Home, Sparkles, Clapperboard, Camera, FolderOpen, Settings, Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface BottomNavProps {
  active: string;
  onNavigate: (tab: string) => void;
  onPlusClick?: () => void;
}

const tabs = [
  { id: "home", icon: Home, labelKey: "nav.home" },
  { id: "aistudio", icon: Sparkles, labelKey: "nav.aistudio" },
  { id: "camera", icon: null, labelKey: "" }, // placeholder for center plus
  { id: "templates", icon: Clapperboard, labelKey: "nav.templates" },
  { id: "projects", icon: FolderOpen, labelKey: "nav.projects" },
];

const BottomNav = ({ active, onNavigate, onPlusClick }: BottomNavProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
      <div className="flex items-center justify-around py-2 px-1">
        {tabs.map((tab) => {
          if (tab.id === "camera") {
            // Center plus button
            return (
              <button
                key={tab.id}
                onClick={() => { playSfx("pop"); onPlusClick ? onPlusClick() : onNavigate(tab.id); }}
                className="w-12 h-12 -mt-5 rounded-full gradient-primary flex items-center justify-center shadow-lg glow-primary-sm"
              >
                <Plus className="w-6 h-6 text-primary-foreground" />
              </button>
            );
          }
          const isActive = active === tab.id;
          const Icon = tab.icon!;
          return (
            <button
              key={tab.id}
              onClick={() => { playSfx("click"); onNavigate(tab.id); }}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? "text-primary glow-primary-sm"
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
