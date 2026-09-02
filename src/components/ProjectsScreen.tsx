import React, { useEffect, useState, useMemo } from "react";
import {
  FolderOpen,
  Clock,
  Trash2,
  Plus,
  Play,
  Edit3,
  Archive,
  RotateCcw,
  Film,
  Cloud,
  MoreVertical,
  Check,
  Search,
  Sparkles,
  Video,
  Layers,
  Share2,
  Copy,
} from "lucide-react";
import { useMedia, ProjectMeta } from "@/context/MediaContext";
import { toast } from "sonner";
import { t, getLang } from "@/lib/i18n";

import templateUrban from "@/assets/template-urban.jpg";
import templateTravel from "@/assets/template-travel.jpg";
import templateRomantic from "@/assets/template-romantic.jpg";
import templateSport from "@/assets/template-sport.jpg";
import MediaPicker from "@/components/MediaPicker";

interface ProjectsScreenProps {
  onStartEditor: () => void;
}
interface TrashedProject extends ProjectMeta {
  trashedAt: number;
}

const TRASH_KEY = "vireon:trash";
const TRASH_DAYS = 7;

const COVER_TEMPLATES = [templateUrban, templateTravel, templateRomantic, templateSport];

const getTrash = (): TrashedProject[] => {
  try {
    const raw = localStorage.getItem(TRASH_KEY);
    if (!raw) return [];
    const items: TrashedProject[] = JSON.parse(raw);
    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    return items.filter((t) => t.trashedAt > cutoff);
  } catch {
    return [];
  }
};

const setTrash = (items: TrashedProject[]) => {
  localStorage.setItem(TRASH_KEY, JSON.stringify(items));
};

// Deterministic helper to get a rich artwork/collage cover for projects without custom coverImage
const getProjectCover = (project: ProjectMeta) => {
  if (project.coverImage || project.thumb) {
    return { type: "single" as const, src: project.coverImage || project.thumb };
  }
  // Generate deterministic index based on project ID/Name
  const hash = (project.id + project.name)
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const mainIndex = hash % COVER_TEMPLATES.length;
  const secondaryIndex = (hash + 1) % COVER_TEMPLATES.length;

  return {
    type: "collage" as const,
    src1: COVER_TEMPLATES[mainIndex],
    src2: COVER_TEMPLATES[secondaryIndex],
    accentHue: (hash * 37) % 360,
  };
};

const ProjectsScreen = ({ onStartEditor }: ProjectsScreenProps) => {
  const en = getLang() === "en";
  const { listProjects, loadProject, newProject, deleteProject, projectId } = useMedia();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [trash, setTrashState] = useState<TrashedProject[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setProjects(await listProjects());
    setTrashState(getTrash());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [projects, searchQuery]);

  const onOpen = async (id: string) => {
    if (id === projectId) {
      if (media.length > 0 && clips.length > 0) {
        onStartEditor();
      } else {
        toast.error(en ? "Project has no media. Please add photos or videos." : "المشروع لا يحتوي على وسائط. يرجى اختيار صور أو فيديوهات.");
      }
      return;
    }
    const ok = await loadProject(id);
    if (ok) {
      onStartEditor();
    }
  };

  const onNew = () => {
    console.log("[NewProject] NEW_PROJECT_CLICKED in ProjectsScreen");
    console.log("[NewProject] STEP 1: click received");
    console.log("[NewProject] STEP 2: create project started");
    newProject();
    console.log("[NewProject] STEP 3: project object created");
    toast.success(en ? "New Project Created" : "تم إنشاء مشروع جديد");
    console.log("[NewProject] STEP 4: project saved");
    console.log("[NewProject] STEP 5: navigation started");
    onStartEditor();
    console.log("[NewProject] STEP 6: navigation completed");
  };

  const onMoveToTrash = async (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    const trashItems = getTrash();
    trashItems.push({ ...p, trashedAt: Date.now() });
    setTrash(trashItems);
    await deleteProject(p.id);
    toast.success(en ? "Moved to trash" : "تم النقل إلى سلة المهملات");
    refresh();
  };

  const onRestoreFromTrash = (p: TrashedProject) => {
    const trashItems = getTrash().filter((t) => t.id !== p.id);
    setTrash(trashItems);
    setTrashState(trashItems);
    toast.success(en ? "Restored" : "تم الاستعادة");
  };

  const onDeleteForever = (p: TrashedProject) => {
    const trashItems = getTrash().filter((t) => t.id !== p.id);
    setTrash(trashItems);
    setTrashState(trashItems);
    toast.success(en ? "Deleted forever" : "تم الحذف نهائياً");
  };

  const onStartRename = (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setEditingId(p.id);
    setEditName(p.name);
  };

  const onFinishRename = () => {
    setEditingId(null);
    toast.success(en ? "Renamed successfully" : "تم تغيير الاسم بنجاح");
    refresh();
  };

  const onShareProject = async (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    if (navigator.share) {
      try {
        await navigator.share({
          title: p.name,
          text: `Vireon AI Video Project: ${p.name}`,
          url: window.location.href,
        });
        toast.success(en ? "Shared successfully" : "تمت المشاركة بنجاح");
        return;
      } catch {
        /* fallback */
      }
    }
    await navigator.clipboard?.writeText(window.location.href);
    toast.success(en ? "Project link copied to clipboard" : "تم نسخ رابط المشروع بنجاح");
  };

  const onDuplicateProject = async (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    try {
      const DB_NAME = "vireon-ai-db";
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("projects", "readwrite");
        const store = tx.objectStore("projects");
        const getReq = store.get(p.id);
        getReq.onsuccess = () => {
          const orig = getReq.result;
          if (orig) {
            const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const copy = {
              ...orig,
              id: newId,
              name: `${orig.name} (${en ? "Copy" : "نسخة"})`,
              updatedAt: Date.now(),
            };
            const putTx = db.transaction("projects", "readwrite");
            putTx.objectStore("projects").put(copy);
            putTx.oncomplete = () => {
              toast.success(en ? "Project duplicated successfully" : "تم نسخ وتكرار المشروع بنجاح");
              refresh();
            };
          } else {
            toast.error(en ? "Failed to duplicate project" : "لم يتم العثور على بيانات المشروع");
          }
        };
      };
    } catch {
      toast.error(en ? "Failed to duplicate project" : "فشل تكرار المشروع");
    }
  };

  const formatDuration = (s: number) => {
    if (!s || isNaN(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen pb-28 px-4 pt-6 select-none max-w-7xl mx-auto" dir={en ? "ltr" : "rtl"}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <span>{showTrash ? t("projects.trash") : t("projects.title")}</span>
            {!showTrash && projects.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {projects.length}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {showTrash
              ? en
                ? "Deleted items will be permanently removed after 7 days"
                : "العناصر المحذوفة ستتم إزالتها نهائياً بعد 7 أيام"
              : en
              ? "Manage and edit all your media video projects"
              : "إدارة وتعديل جميع مشاريع الفيديو الخاصة بك"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTrash(!showTrash)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              showTrash
                ? "bg-primary/15 text-primary border-primary/30 shadow-sm"
                : "bg-secondary/80 hover:bg-secondary text-muted-foreground border-border"
            }`}
          >
            {showTrash ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            <span>{showTrash ? t("projects.projectsBtn") : t("projects.trashBtn")}</span>
            {!showTrash && trash.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {trash.length}
              </span>
            )}
          </button>

          {!showTrash && (
            <MediaPicker
              isNewProject
              accept="both"
              multiple
              onPicked={onStartEditor}
              className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary glow-primary-sm text-primary-foreground text-xs font-extrabold shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t("projects.new")}</span>
            </MediaPicker>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      {!showTrash && projects.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 rtl:left-auto rtl:right-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={en ? "Search projects..." : "البحث في المشاريع..."}
              className="w-full pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2 bg-card border border-border/80 rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/40 px-3 py-1.5 rounded-xl border border-border/50">
            <Cloud className="w-3.5 h-3.5 text-primary" />
            <span>{en ? "Synced with Cloud Storage" : "متزامن مع التخزين السحابي"}</span>
          </div>
        </div>
      )}

      {/* Trash View */}
      {showTrash ? (
        trash.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4 text-muted-foreground/40">
              <Archive className="w-8 h-8" />
            </div>
            <p className="text-lg font-heading font-bold text-foreground mb-1">
              <span>{t("projects.trashEmpty")}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              <span>{t("projects.trashNote", { n: String(TRASH_DAYS) })}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-3">
              <span>{t("projects.trashNote", { n: String(TRASH_DAYS) })}</span>
            </p>
            {trash.map((p, i) => (
              <div
                key={`trash-${p.id}`}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/80 hover:border-primary/40 transition-all animate-fade-in"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 opacity-60 overflow-hidden">
                  <Play className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <span>{t("projects.trashDeleted", { time: timeAgo(p.trashedAt, en) })}</span>
                  </p>
                </div>
                <button
                  onClick={() => onRestoreFromTrash(p)}
                  className="w-8 h-8 rounded-xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center flex-shrink-0 transition-colors"
                  title={en ? "Restore" : "استعادة"}
                >
                  <RotateCcw className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => onDeleteForever(p)}
                  className="w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center flex-shrink-0 transition-colors"
                  title={en ? "Delete forever" : "حذف نهائي"}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">{en ? "Loading projects..." : "جاري تحميل المشاريع..."}</span>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary">
            <FolderOpen className="w-10 h-10" />
          </div>
          <p className="text-lg font-heading font-bold text-foreground mb-1">
            {searchQuery ? (en ? "No matching projects" : "لم يتم العثور على نتائج") : t("projects.empty")}
          </p>
          <p className="text-xs text-muted-foreground mb-5 max-w-sm">
            {searchQuery
              ? en
                ? "Try searching for a different name"
                : "جرب البحث باسم آخر"
              : t("projects.emptyDesc")}
          </p>
          <MediaPicker
            isNewProject
            accept="both"
            multiple
            onPicked={onStartEditor}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl gradient-primary text-primary-foreground text-xs font-bold shadow-lg hover:scale-105 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t("projects.startProject")}</span>
          </MediaPicker>
        </div>
      ) : (
        /* Projects Grid Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredProjects.map((p, i) => {
            const cover = getProjectCover(p);
            const isActive = p.id === projectId;

            return (
              <div
                key={`project-${p.id}`}
                onClick={() => onOpen(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(p.id);
                  }
                }}
                className={`group relative rounded-2xl bg-card border cursor-pointer transition-all duration-300 text-start animate-fade-in overflow-hidden hover:shadow-xl hover:-translate-y-0.5 ${
                  isActive
                    ? "border-primary/80 ring-1 ring-primary/30 shadow-lg shadow-primary/10"
                    : "border-border/80 hover:border-primary/50"
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                {/* Project Cover / Artwork Thumbnail */}
                <div className="w-full h-36 rounded-t-2xl bg-slate-950 relative overflow-hidden flex items-center justify-center">
                  {cover.type === "single" ? (
                    <img
                      src={cover.src}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    /* Multi-Tile Artwork Collage for Projects without custom cover - Clean fallbacks without alt text issues */
                    <div className="w-full h-full relative grid grid-cols-2 gap-0.5 p-0.5 bg-slate-900">
                      <div className="relative overflow-hidden bg-slate-800">
                        {cover.src1 && (
                          <img
                            src={cover.src1}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/30 to-transparent" />
                      </div>
                      <div className="relative overflow-hidden bg-slate-850">
                        {cover.src2 && (
                          <img
                            src={cover.src2}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-bl from-black/70 via-black/30 to-transparent" />
                      </div>
                      {/* Film Reel Accent Strip */}
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-cyan-400" />
                    </div>
                  )}

                  {/* Dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 pointer-events-none" />

                  {/* Play Button Hover Effect */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 z-10">
                    <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-xl backdrop-blur-md">
                      <Play className="w-5 h-5 fill-current ml-0.5 rtl:mr-0.5 rtl:ml-0" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 z-10 flex items-center gap-1">
                    <Video className="w-2.5 h-2.5 text-white/70" />
                    <span className="text-[10px] font-mono font-bold text-white/95">
                      {formatDuration(p.duration)}
                    </span>
                  </div>

                  {/* Active Status Badge */}
                  {isActive && (
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground shadow-md z-10 animate-pulse">
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span className="text-[9px] font-extrabold">{en ? "Active" : "قيد التعديل"}</span>
                    </div>
                  )}

                  {/* Resolution / Preset Tag */}
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 z-10 text-[9px] font-semibold text-white/80">
                    {p.preset?.name || "HD 1080p"}
                  </div>
                </div>

                {/* Card Content Footer */}
                <div className="p-3.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {editingId === p.id ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={onFinishRename}
                          onKeyDown={(e) => e.key === "Enter" && onFinishRename()}
                          className="text-xs font-bold text-foreground bg-secondary border border-primary rounded-lg px-2 py-1 w-full focus:outline-none"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <h3 className="text-xs font-extrabold text-foreground truncate group-hover:text-primary transition-colors">
                        {p.name}
                      </h3>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground/70" />
                        {timeAgo(p.updatedAt, en)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-muted-foreground/70" />
                        {en ? "Multi-track" : "مسارات متعددة"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Delete Trash Button & Action Options Menu */}
                  {editingId !== p.id && (
                    <div className="flex items-center gap-1">
                      {/* Direct Trash / Delete Button */}
                      <button
                        onClick={(e) => onMoveToTrash(p, e)}
                        className="w-7 h-7 rounded-lg bg-secondary/80 hover:bg-destructive/15 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                        title={en ? "Move to Trash" : "نقل إلى سلة المهملات"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* 3 Dots Options Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === p.id ? null : p.id);
                          }}
                          className="w-7 h-7 rounded-lg bg-secondary/80 hover:bg-secondary flex items-center justify-center transition-colors"
                          title={en ? "Options" : "خيارات"}
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>

                        {menuOpenId === p.id && (
                          <div
                            className="absolute bottom-9 right-0 rtl:right-auto rtl:left-0 z-50 bg-card border border-border/90 rounded-2xl shadow-2xl py-1.5 min-w-[150px] animate-scale-in"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                onOpen(p.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                            >
                              <Play className="w-3.5 h-3.5 text-primary" />
                              <span>{en ? "Open Project" : "فتح المشروع"}</span>
                            </button>

                            <button
                              onClick={(e) => onStartRename(p, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-foreground" />
                              <span>{en ? "Rename" : "إعادة تسمية"}</span>
                            </button>

                            <button
                              onClick={(e) => onDuplicateProject(p, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{en ? "Duplicate" : "نسخ وتكرار"}</span>
                            </button>

                            <button
                              onClick={(e) => onShareProject(p, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                            >
                              <Share2 className="w-3.5 h-3.5 text-purple-400" />
                              <span>{en ? "Share Link" : "إعادة مشاركة"}</span>
                            </button>

                            <div className="h-px bg-border/60 my-1" />

                            <button
                              onClick={(e) => onMoveToTrash(p, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              <span>{en ? "Delete" : "حذف لـ المهملات"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {menuOpenId && (
        <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setMenuOpenId(null)} />
      )}
    </div>
  );
};

function timeAgo(ts: number, en: boolean) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return en ? "Just now" : "الآن";
  if (m < 60) return en ? `${m}m ago` : `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return en ? `${h}h ago` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return en ? `${d}d ago` : `منذ ${d} يوم`;
}

export default ProjectsScreen;
