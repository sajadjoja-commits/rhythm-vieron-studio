import { useEffect, useState } from "react";
import { Plus, Zap, Image, Video, User, Camera, Download, Sparkles, Wand2, Scissors, Palette, Film, Music } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import NotificationsBell from "@/components/NotificationsBell";
import { useMedia, ProjectMeta } from "@/context/MediaContext";
import { getLang } from "@/lib/i18n";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import HeroCarousel from "@/components/home/HeroCarousel";
import RecommendedAITools from "@/components/home/RecommendedAITools";
import RecentAIActivity from "@/components/home/RecentAIActivity";
import SmartTemplatesSection from "@/components/home/SmartTemplatesSection";
import MediaPicker from "@/components/MediaPicker";

interface HomeScreenProps {
  onNavigate: (tab: string) => void;
  onStartEditor: () => void;
  onOpenPhotoEditor?: () => void;
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

const HomeScreen = ({
  onNavigate,
  onStartEditor,
  onOpenPhotoEditor,
  session,
  newProject,
}: HomeScreenProps) => {
  const en = getLang() === "en";
  const { listProjects, loadProject, deleteProject } = useMedia();
  const { showInstallEntry } = useInstallPrompt();
  const [recentProjects, setRecentProjects] = useState<ProjectMeta[]>([]);

  const refreshRecent = async () => {
    try {
      const list = await listProjects();
      setRecentProjects(list.slice(0, 4));
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    listProjects().then((list) => {
      if (isMounted) {
        setRecentProjects(list.slice(0, 4));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [listProjects]);

  const userAvatar = session?.user?.user_metadata?.avatar_url;
  const userName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;

  const handleOpenProject = async (id: string) => {
    const ok = await loadProject(id);
    if (ok) onStartEditor();
  };

  const handleCreateNewVideoProject = () => {
    console.log("[NewProject] NEW_PROJECT_CLICKED in HomeScreen");
    console.log("[NewProject] STEP 1: click received");
    console.log("[NewProject] STEP 2: create project started");
    newProject();
    console.log("[NewProject] STEP 3: project object created");
    console.log("[NewProject] STEP 4: project saved");
    console.log("[NewProject] STEP 5: navigation started");
    onStartEditor();
    console.log("[NewProject] STEP 6: navigation completed");
  };

  return (
    <div className="min-h-screen pb-28 px-4 pt-6 select-none max-w-4xl mx-auto" dir={en ? "ltr" : "rtl"}>
      {/* Top Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <VireonLogo className="w-9 h-9" />
          <div>
            <h1 className="font-heading text-lg font-bold text-foreground leading-none">Vireon AI</h1>
            <p className="text-[9px] text-muted-foreground mt-0.5">{en ? "Smart Video & AI Suite" : "محرر فيديو واستوديو AI ذكي"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showInstallEntry && (
            <button
              onClick={() => window.dispatchEvent(new Event("vireon_open_install_prompt"))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-[11px] font-bold transition-all active:scale-95 shadow-sm"
              title={en ? "Install App" : "تثبيت التطبيق"}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{en ? "Install" : "تثبيت"}</span>
            </button>
          )}

          <NotificationsBell />

          {userAvatar ? (
            <img
              src={userAvatar}
              alt=""
              className="w-9 h-9 rounded-full object-cover border-2 border-primary cursor-pointer hover:scale-105 transition-transform"
              onClick={() => onNavigate("settings")}
            />
          ) : (
            <button
              onClick={() => onNavigate("settings")}
              className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center border border-border hover:border-primary/50 transition-colors"
            >
              <User className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {userName && (
        <p className="text-xs font-medium text-muted-foreground mb-4 animate-fade-in">
          {en ? `Welcome back, ${userName.split(" ")[0]} 👋` : `مرحباً بعودتك، ${userName.split(" ")[0]} 👋`}
        </p>
      )}

      {/* 1. Hero Auto Carousel with Character Imagery & Create Project Button */}
      <HeroCarousel
        onNavigate={onNavigate}
        onStartEditor={onStartEditor}
        newProject={newProject}
        en={en}
      />

      {/* 2. Direct Quick Actions: Camera, Photo Editor, New Video Editor */}
      <div className="grid grid-cols-3 gap-3 mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
        {/* New Video Button -> Directly Opens Phone Media Picker, loads media, and opens Editor */}
        <MediaPicker
          isNewProject
          accept="both"
          multiple
          onPicked={onStartEditor}
          className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/60 hover:shadow-lg transition-all active:scale-95 text-center cursor-pointer w-full"
        >
          <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Video className="w-5.5 h-5.5 text-primary" />
          </div>
          <div>
            <span className="text-xs font-bold text-foreground block">{en ? "New Video" : "فيديو جديد"}</span>
            <span className="text-[9px] text-muted-foreground block">{en ? "Video Editor" : "محرر الفيديو"}</span>
          </div>
        </MediaPicker>

        {/* Photo Editor Button -> Opens Photo Editor Screen directly */}
        <button
          onClick={() => {
            if (onOpenPhotoEditor) onOpenPhotoEditor();
            else onNavigate("aistudio");
          }}
          className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border/80 hover:border-accent/60 hover:shadow-lg transition-all active:scale-95 text-center cursor-pointer"
        >
          <div className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Image className="w-5.5 h-5.5 text-accent" />
          </div>
          <div>
            <span className="text-xs font-bold text-foreground block">{en ? "Photo Editor" : "محرر الصور"}</span>
            <span className="text-[9px] text-muted-foreground block">{en ? "Enhance & Cut" : "تحسين وعزل"}</span>
          </div>
        </button>

        {/* Camera Button -> Opens Camera Screen directly */}
        <button
          onClick={() => onNavigate("camera")}
          className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border/80 hover:border-purple-500/60 hover:shadow-lg transition-all active:scale-95 text-center cursor-pointer"
        >
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Camera className="w-5.5 h-5.5 text-purple-400" />
          </div>
          <div>
            <span className="text-xs font-bold text-foreground block">{en ? "Camera" : "كاميرا"}</span>
            <span className="text-[9px] text-muted-foreground block">{en ? "Record 4K" : "تصوير مباشر"}</span>
          </div>
        </button>
      </div>

      {/* Feature Pills */}
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar animate-fade-in" style={{ animationDelay: "0.15s" }}>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card border border-border/80 hover:border-primary/40 transition-colors shadow-sm"
            style={{ background: f.bg }}
          >
            <f.icon className="w-3.5 h-3.5" style={{ color: f.color }} />
            <span className="text-[10px] font-bold text-foreground whitespace-nowrap">
              {en ? f.labelEn : f.label}
            </span>
          </div>
        ))}
      </div>

      {/* Recommended AI Tools */}
      <RecommendedAITools
        onNavigate={onNavigate}
        onStartEditor={onStartEditor}
        newProject={newProject}
        en={en}
      />

      {/* Recent AI Activity / Projects */}
      <RecentAIActivity
        recentProjects={recentProjects}
        onOpenProject={handleOpenProject}
        onDeleteProject={async (id) => {
          await deleteProject(id);
          await refreshRecent();
        }}
        onNavigate={onNavigate}
        en={en}
      />

      {/* Smart Templates Section */}
      <SmartTemplatesSection onNavigate={onNavigate} en={en} />

      {/* AI Smart Editing Banner */}
      <div className="animate-fade-in rounded-2xl bg-gradient-to-r from-secondary/80 to-card border border-border p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-md">
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-heading font-bold text-sm text-foreground">
              {en ? "Vireon AI Smart Editing Engine" : "محرك التحرير الذكي بالـ AI"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {en ? "Auto-selects best moments & syncs cuts" : "قطع تلقائي وتنسيق الألوان مع الإيقاع"}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {en
            ? "Vireon AI analyzes your media, selects peak moments, removes silent pauses, applies neural color grading, and exports high-bitrate 4K output effortlessly."
            : "يحلل Vireon AI الوسائط بذكاء اصطناعي فائق، يختار أفضل اللحظات، يزيل الصمت الميت، ينسق الألوان عصبياً، ويصدر النتائج بدقة 4K."}
        </p>
      </div>

      <style>{`@keyframes float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.05); } }`}</style>
    </div>
  );
};

export default HomeScreen;
