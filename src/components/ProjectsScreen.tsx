import { useEffect, useState } from "react";
import { FolderOpen, Clock, Trash2, Plus, Play, Edit3, Archive, RotateCcw, Film, Cloud, MoreVertical, Check } from "lucide-react";
import { useMedia, ProjectMeta } from "@/context/MediaContext";
import { toast } from "sonner";
import { t, getLang } from "@/lib/i18n";

interface ProjectsScreenProps { onStartEditor: () => void; }
interface TrashedProject extends ProjectMeta { trashedAt: number; }

const TRASH_KEY = "vireon:trash";
const TRASH_DAYS = 7;

const getTrash = (): TrashedProject[] => {
  try { const raw = localStorage.getItem(TRASH_KEY); if (!raw) return []; const items: TrashedProject[] = JSON.parse(raw); const cutoff = Date.now() - TRASH_DAYS * 86400000; return items.filter((t) => t.trashedAt > cutoff); } catch { return []; }
};
const setTrash = (items: TrashedProject[]) => { localStorage.setItem(TRASH_KEY, JSON.stringify(items)); };

const ProjectsScreen = ({ onStartEditor }: ProjectsScreenProps) => {
  const en = getLang() === "en";
  const { listProjects, loadProject, newProject, deleteProject, projectId } = useMedia();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [trash, setTrashState] = useState<TrashedProject[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const refresh = async () => { setLoading(true); setProjects(await listProjects()); setTrashState(getTrash()); setLoading(false); };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpen = async (id: string) => { if (id === projectId) { onStartEditor(); return; } const ok = await loadProject(id); if (ok) onStartEditor(); };
  const onNew = () => { newProject(); toast.success(en ? "New Project" : "مشروع جديد"); onStartEditor(); };

  const onMoveToTrash = async (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation(); setMenuOpenId(null);
    const trashItems = getTrash(); trashItems.push({ ...p, trashedAt: Date.now() }); setTrash(trashItems);
    await deleteProject(p.id); toast.success(en ? "Moved to trash" : "تم النقل إلى سلة المهملات"); refresh();
  };
  const onRestoreFromTrash = (p: TrashedProject) => { const trashItems = getTrash().filter((t) => t.id !== p.id); setTrash(trashItems); setTrashState(trashItems); toast.success(en ? "Restored" : "تم الاستعادة"); };
  const onDeleteForever = (p: TrashedProject) => { const trashItems = getTrash().filter((t) => t.id !== p.id); setTrash(trashItems); setTrashState(trashItems); toast.success(en ? "Deleted forever" : "تم الحذف نهائياً"); };
  const onStartRename = (p: ProjectMeta, e: React.MouseEvent) => { e.stopPropagation(); setMenuOpenId(null); setEditingId(p.id); setEditName(p.name); };
  const onFinishRename = () => { setEditingId(null); toast.success(en ? "Renamed" : "تم تغيير الاسم"); refresh(); };
  const formatDuration = (s: number) => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`; };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 select-none" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-heading text-2xl font-bold text-foreground">{showTrash ? t("projects.trash") : t("projects.title")}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTrash(!showTrash)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${showTrash ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {showTrash ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {showTrash ? t("projects.projectsBtn") : t("projects.trashBtn")}
            {!showTrash && trash.length > 0 && <span className="ml-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center">{trash.length}</span>}
          </button>
          {!showTrash && <button onClick={onNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-primary glow-primary-sm text-primary-foreground text-xs font-bold"><Plus className="w-3.5 h-3.5" /> {t("projects.new")}</button>}
        </div>
      </div>

      {!showTrash && projects.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 text-[10px] text-muted-foreground">
          <Cloud className="w-3 h-3 text-primary" />{en ? "Synced with cloud" : "متزامن مع السحابة"}
        </div>
      )}

      {showTrash ? (
        trash.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Archive className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-heading font-bold text-foreground mb-1">{t("projects.trashEmpty")}</p>
            <p className="text-sm text-muted-foreground">{t("projects.trashNote", { n: String(TRASH_DAYS) })}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground mb-2">{t("projects.trashNote", { n: String(TRASH_DAYS) })}</p>
            {trash.map((p, i) => (
              <div key={p.id} className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 opacity-50"><Play className="w-4 h-4 text-muted-foreground" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-bold text-foreground truncate">{p.name}</p><p className="text-[10px] text-muted-foreground">{t("projects.trashDeleted", { time: timeAgo(p.trashedAt, en) })}</p></div>
                <button onClick={() => onRestoreFromTrash(p)} className="w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center flex-shrink-0"><RotateCcw className="w-3.5 h-3.5 text-primary" /></button>
                <button onClick={() => onDeleteForever(p)} className="w-8 h-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center flex-shrink-0"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-heading font-bold text-foreground mb-1">{t("projects.empty")}</p>
          <p className="text-sm text-muted-foreground mb-4">{t("projects.emptyDesc")}</p>
          <button onClick={onNew} className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-bold"><Plus className="w-4 h-4" /> {t("projects.startProject")}</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {projects.map((p, i) => (
            <div key={p.id} onClick={() => onOpen(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
              className={`relative rounded-xl bg-card border cursor-pointer transition-all text-start animate-fade-in overflow-hidden ${p.id === projectId ? "border-primary/60 glow-primary-sm" : "border-border hover:border-primary/30"}`}
              style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="w-full h-28 rounded-t-xl bg-gradient-to-br from-secondary via-secondary/60 to-background flex items-center justify-center relative overflow-hidden group">
                {p.coverImage ? (
                  <img
                    src={p.coverImage}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1.5 opacity-50">
                    <Film className="w-7 h-7 text-primary/40" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none" />
                <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 z-10">
                  <span className="text-[9px] font-mono font-semibold text-white/95">{formatDuration(p.duration)}</span>
                </div>
                {p.id === projectId && (
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/90 backdrop-blur-md shadow-md z-10">
                    <Check className="w-2.5 h-2.5 text-white" /><span className="text-[8px] font-extrabold text-white">{en ? "Active" : "نشط"}</span>
                  </div>
                )}
              </div>
              <div className="p-3">
                {editingId === p.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      onBlur={onFinishRename} onKeyDown={(e) => e.key === "Enter" && onFinishRename()}
                      className="text-sm font-bold text-foreground bg-secondary rounded px-2 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
                  </div>
                ) : <p className="text-sm font-bold text-foreground truncate">{p.name}</p>}
                <div className="flex items-center gap-1.5 mt-1"><Clock className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">{timeAgo(p.updatedAt, en)}</span></div>
              </div>
              {editingId !== p.id && (
                <div className="absolute top-2 right-2">
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? null : p.id); }}
                    className="w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <MoreVertical className="w-3.5 h-3.5 text-white" />
                  </button>
                  {menuOpenId === p.id && (
                    <div className="absolute top-8 right-0 z-20 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => onStartRename(p, e)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-secondary"><Edit3 className="w-3 h-3" /> {en ? "Rename" : "إعادة تسمية"}</button>
                      <button onClick={(e) => onMoveToTrash(p, e)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /> {en ? "Delete" : "حذف"}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {menuOpenId && <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />}
    </div>
  );
};

function timeAgo(ts: number, en: boolean) {
  const diff = Date.now() - ts; const m = Math.floor(diff / 60000);
  if (m < 1) return en ? "Now" : "الآن";
  if (m < 60) return en ? `${m}m ago` : `${m} ${t("projects.minute")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return en ? `${h}h ago` : `${h} ${t("projects.hour")}`;
  const d = Math.floor(h / 24);
  return en ? `${d}d ago` : `${d} ${t("projects.day")}`;
}

export default ProjectsScreen;
