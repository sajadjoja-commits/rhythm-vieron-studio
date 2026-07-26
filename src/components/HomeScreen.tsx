import { useEffect, useState } from "react";
import { Plus, Zap, Upload, Image, Video, User, Camera, Sparkles, Film, Wand2, Scissors, Palette, Music, ArrowLeft } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import MediaPicker from "@/components/MediaPicker";
import NotificationsBell from "@/components/NotificationsBell";
import { useMedia, ProjectMeta } from "@/context/MediaContext";
import { t, getLang } from "@/lib/i18n";

interface HomeScreenProps {
  onNavigate: (tab: string) => void;
  onStartEditor: () => void;
  session?: any;
  newProject: () => void;
}

const FEATURES = [
  { icon: Scissors, label: "قص ذكي", labelEn: "Smart Cut", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { icon: Palette, label: "فلاتر", labelEn: "Filters", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  { icon: Film, label: "انتقالات", labelEn: "Transitions", color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  { icon: Music, label: "موسيقى", labelEn: "Music", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  { icon: Zap, label: "مؤثرات", labelEn: "Effects", color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  { icon: Wand2, label: "كابشن AI", labelEn: "AI Captions", color: "#06b6d4", bg: "rgba(6,182,212,0.12)" },
];

const PromoBanner = ({ onNavigate, onStartEditor, newProject, en }: { onNavigate: (t: string) => void; onStartEditor: () => void; newProject: () => void; en: boolean }) => {
  return (
    <div className="relative rounded-2xl overflow-hidden mb-6 animate-fade-in" style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #3730a3 70%, #6d28d9 100%)",
    }}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-2 right-4 w-20 h-20 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #60a5fa, transparent)", animation: "float 4s ease-in-out infinite" }} />
        <div className="absolute bottom-4 left-6 w-16 h-16 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #c084fc, transparent)", animation: "float 5s ease-in-out infinite 1s" }} />
        <div className="absolute top-1/2 right-1/3 w-12 h-12 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #f472b6, transparent)", animation: "float 6s ease-in-out infinite 0.5s" }} />
      </div>
      <div className="relative p-5" dir={en ? "ltr" : "rtl"}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-blue-300" />
          <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">AI Powered</span>
        </div>
        <h2 className="font-heading text-xl font-bold text-white mb-1">{en ? "Create viral videos in seconds" : "اصنع فيديوهات فيرالية بثواني"}</h2>
        <p className="text-xs text-blue-200/80 mb-4 leading-relaxed">{en ? "AI auto-selects best moments, applies color grading, syncs cuts to music" : "الذكاء الاصطناعي يختار أفضل اللحظات، يطبق الألوان، ويقطع على الإيقاع"}</p>
        <div className="flex gap-2">
          <MediaPicker accept="both" onBeforePick={newProject} onPicked={onStartEditor}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-gray-900 font-bold text-xs active:scale-95 transition-transform">
            <Plus className="w-4 h-4" />{en ? "New Project" : "مشروع جديد"}
          </MediaPicker>
          <button onClick={() => onNavigate("templates")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-bold text-xs backdrop-blur-sm border border-white/20 active:scale-95 transition-transform">
            <Wand2 className="w-4 h-4" />{en ? "Templates" : "قوالب"}
          </button>
        </div>
      </div>
    </div>
  );
};

const HomeScreen = ({ onNavigate, onStartEditor, session, newProject }: HomeScreenProps) => {
  const en = getLang() === "en";
  const { listProjects, loadProject } = useMedia();
  const [recentProjects, setRecentProjects] = useState<ProjectMeta[]>([]);

  useEffect(() => { listProjects().then((p) => setRecentProjects(p.slice(0, 4))); }, [listProjects]);

  const userAvatar = session?.user?.user_metadata?.avatar_url;
  const userName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;

  const handleOpenProject = async (id: string) => { const ok = await loadProject(id); if (ok) onStartEditor(); };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 select-none" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <VireonLogo className="w-9 h-9" />
          <div>
            <h1 className="font-heading text-lg font-bold text-foreground leading-none">Vireon AI</h1>
            <p className="text-[9px] text-muted-foreground mt-0.5">{en ? "Smart Video Editor" : "محرر فيديو ذكي"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          {userAvatar ? (
            <img src={userAvatar} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-primary cursor-pointer" onClick={() => onNavigate("settings")} />
          ) : (
            <button onClick={() => onNavigate("settings")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center border border-border">
              <User className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {userName && <p className="text-sm text-muted-foreground mb-4 animate-fade-in">{en ? `Welcome back, ${userName.split(" ")[0]}` : `مرحباً بعودتك، ${userName.split(" ")[0]}`}</p>}

      <PromoBanner onNavigate={onNavigate} onStartEditor={onStartEditor} newProject={newProject} en={en} />

      <div className="grid grid-cols-3 gap-3 mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <MediaPicker accept="video" onBeforePick={newProject} onPicked={onStartEditor}
          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Video className="w-5 h-5 text-primary" /></div>
          <span className="text-[11px] font-medium text-foreground">{en ? "Video" : "فيديو"}</span>
        </MediaPicker>
        <MediaPicker accept="image" onBeforePick={newProject} onPicked={onStartEditor}
          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><Image className="w-5 h-5 text-accent" /></div>
          <span className="text-[11px] font-medium text-foreground">{en ? "Photos" : "صور"}</span>
        </MediaPicker>
        <MediaPicker accept="both" capture onBeforePick={newProject} onPicked={onStartEditor}
          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Camera className="w-5 h-5 text-primary" /></div>
          <span className="text-[11px] font-medium text-foreground">{en ? "Camera" : "كاميرا"}</span>
        </MediaPicker>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar animate-fade-in" style={{ animationDelay: "0.15s" }}>
        {FEATURES.map((f) => (
          <div key={f.label} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card border border-border" style={{ background: f.bg }}>
            <f.icon className="w-3.5 h-3.5" style={{ color: f.color }} />
            <span className="text-[10px] font-bold text-foreground whitespace-nowrap">{en ? f.labelEn : f.label}</span>
          </div>
        ))}
      </div>

      {recentProjects.length > 0 && (
        <div className="mb-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-base font-semibold text-foreground">{t("home.recentProjects")}</h2>
            <button onClick={() => onNavigate("projects")} className="flex items-center gap-1 text-xs text-primary font-medium">
              {en ? "All" : "الكل"}<ArrowLeft className={`w-3 h-3 ${en ? "" : "rotate-180"}`} />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
            {recentProjects.map((p) => (
              <button key={p.id} onClick={() => handleOpenProject(p.id)}
                className="flex-shrink-0 w-36 rounded-xl bg-card border border-border hover:border-primary/50 transition-all p-3 text-start">
                <div className="w-full h-20 rounded-lg bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center mb-2 overflow-hidden relative">
                  {p.preset === "cover" ? <Image className="w-5 h-5 text-muted-foreground" /> : (
                    <div className="flex items-center justify-center w-full h-full" style={{ background: "linear-gradient(135deg, #1e3a8a20, #7c2d1220)" }}><Film className="w-5 h-5 text-primary/40" /></div>
                  )}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm"><span className="text-[8px] font-mono text-white/80">{p.duration.toFixed(1)}s</span></div>
                </div>
                <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{p.preset === "cover" ? (en ? "Cover" : "غلاف") : (en ? "Video" : "فيديو")}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 animate-fade-in" style={{ animationDelay: "0.25s" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold text-foreground">{t("templates.title")}</h2>
          <button onClick={() => onNavigate("templates")} className="flex items-center gap-1 text-xs text-primary font-medium">
            {en ? "All" : "الكل"}<ArrowLeft className={`w-3 h-3 ${en ? "" : "rotate-180"}`} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { emoji: "🎬", name: en ? "Cinematic" : "سينمائي", gradient: "linear-gradient(135deg, #1e1b4b, #6d28d9)" },
            { emoji: "🎵", name: en ? "Music Beat" : "إيقاع", gradient: "linear-gradient(135deg, #831843, #ec4899)" },
            { emoji: "⚡", name: en ? "Sports" : "رياضة", gradient: "linear-gradient(135deg, #164e63, #06b6d4)" },
            { emoji: "✈️", name: en ? "Travel" : "سفر", gradient: "linear-gradient(135deg, #064e3b, #10b981)" },
          ].map((tpl) => (
            <button key={tpl.name} onClick={() => onNavigate("templates")}
              className="relative h-20 rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all active:scale-[0.98]">
              <div className="absolute inset-0" style={{ background: tpl.gradient }} />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">{tpl.emoji}</div>
              <div className="absolute bottom-1.5 left-2"><span className="text-[10px] font-bold text-white/90">{tpl.name}</span></div>
              <div className="absolute top-1.5 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/30 backdrop-blur-sm"><Sparkles className="w-2 h-2 text-white" /><span className="text-[7px] font-bold text-white">AI</span></div>
            </button>
          ))}
        </div>
      </div>

      <div className="animate-fade-in rounded-2xl bg-card border border-border p-4" style={{ animationDelay: "0.3s" }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center"><Zap className="w-5 h-5 text-primary-foreground" /></div>
          <div className="flex-1">
            <h3 className="font-heading font-bold text-sm text-foreground">{en ? "AI Smart Editing" : "تحرير ذكي بالـ AI"}</h3>
            <p className="text-[11px] text-muted-foreground">{en ? "Auto-select best moments" : "اختيار أفضل اللقطات تلقائياً"}</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{en ? "Vireon AI analyzes your videos, selects the best moments, and cuts them to the music beat automatically." : "يحلل Vireon AI فيديوهاتك ويختار أفضل اللحظات ويقطعها على إيقاع الموسيقى تلقائياً."}</p>
      </div>

      <style>{`@keyframes float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.05); } }`}</style>
    </div>
  );
};

export default HomeScreen;
