import { useState, useEffect, useRef, useMemo } from "react";
import { 
  ArrowRight, Video, Image as ImageIcon, Download, Play, Pause, 
  Sparkles, RefreshCw, Type, Music, Lock, Check, Loader2, Volume2, VolumeX, Hash 
} from "lucide-react";
import { PublishedTemplate, EditableProjectData } from "@/types/template";
import { useMedia, Clip, Caption, AudioTrackItem } from "@/context/MediaContext";
import { fetchTemplateById, generateTemplateShareUrl } from "@/services/templateService";
import ExportDialog from "@/components/editor/ExportDialog";
import { toast } from "sonner";
import { t, isRTL, getLang } from "@/lib/i18n";

interface Props {
  templateId?: string;
  templateObj?: PublishedTemplate | null;
  onBack: () => void;
  onExportSuccess?: () => void;
}

const aspectRatios = [
  { label: "16:9", w: 16, h: 9 }, 
  { label: "9:16", w: 9, h: 16 },
  { label: "1:1", w: 1, h: 1 }, 
  { label: "4:5", w: 4, h: 5 },
  { label: "21:9", w: 21, h: 9 },
  { label: "4:3", w: 4, h: 3 },
  { label: "9:21", w: 9, h: 21 },
  { label: "2.39:1", w: 2.39, h: 1 },
  { label: "2:1", w: 2, h: 1 },
  { label: "16:10", w: 16, h: 10 },
  { label: "3:2", w: 3, h: 2 },
  { label: "5:4", w: 5, h: 4 },
];

export default function TemplateUseScreen({ templateId, templateObj, onBack }: Props) {
  const {
    setClips, setCaptions, setOverlays, setAudioTracks, 
    setFilters, setVfx, addFiles, clips, captions, audioTracks,
    totalDuration, resolveTimelineTime, getMediaById, setProjectName
  } = useMedia();

  const [loading, setLoading] = useState(!templateObj);
  const [template, setTemplate] = useState<PublishedTemplate | null>(templateObj || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [replacingClipId, setReplacingClipId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!template && templateId) {
      setLoading(true);
      fetchTemplateById(templateId).then((res) => {
        if (res) {
          setTemplate(res);
        } else {
          toast.error(isRTL() ? "لم يتم العثور على القالب" : "Template not found");
        }
        setLoading(false);
      });
    }
  }, [templateId, template]);

  // Load project elements into MediaContext when template is selected
  useEffect(() => {
    if (template) {
      const data: EditableProjectData = template.project_data;
      setProjectName(template.title);

      if (data.clips) setClips(data.clips);
      if (data.captions) setCaptions(data.captions);
      if (data.overlays) setOverlays(data.overlays);
      if (data.audioTracks) setAudioTracks(data.audioTracks);
      if (data.filters) setFilters(data.filters);
      if (data.vfx) setVfx(data.vfx);
    }
  }, [template, setClips, setCaptions, setOverlays, setAudioTracks, setFilters, setVfx, setProjectName]);

  // Handle media playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setCurrentTime((t) => {
        const next = t + dt;
        if (next >= (totalDuration || 5)) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, totalDuration]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">{isRTL() ? "جاري تحميل القالب..." : "Loading Template..."}</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background p-4 gap-4">
        <p className="text-sm font-bold text-foreground">{isRTL() ? "القالب غير موجود" : "Template Not Found"}</p>
        <button onClick={onBack} className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl">
          {isRTL() ? "العودة" : "Go Back"}
        </button>
      </div>
    );
  }

  const projectData: EditableProjectData = template.project_data;
  const editableClips = clips.filter(c => c.editable !== false);
  const editableCaptions = captions.filter(c => c.editable !== false);

  const handleTriggerReplaceMedia = (clipId: string) => {
    setReplacingClipId(clipId);
    fileInputRef.current?.click();
  };

  const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingClipId) return;

    try {
      const mediaIds = await addFiles([file]);
      if (mediaIds && mediaIds.length > 0) {
        const newMediaId = mediaIds[0];
        setClips((prevClips) =>
          prevClips.map((c) =>
            c.id === replacingClipId ? { ...c, mediaId: newMediaId } : c
          )
        );
        toast.success(isRTL() ? "تم استبدال المقطع بنجاح!" : "Clip media replaced!");
      }
    } catch (err) {
      toast.error(isRTL() ? "فشل استبدال المقطع" : "Failed to replace clip media");
    } finally {
      setReplacingClipId(null);
      if (e.target) e.target.value = "";
    }
  };

  const handleCaptionTextChange = (id: string, newText: string) => {
    setCaptions((prev) =>
      prev.map((cap) => (cap.id === id ? { ...cap, text: newText } : cap))
    );
  };

  const activeRatioIndex = projectData.activeRatio || 0;
  const ratio = aspectRatios[activeRatioIndex] || aspectRatios[0];

  const resolved = resolveTimelineTime(currentTime);
  const activeMedia = resolved ? getMediaById(resolved.clip.mediaId) : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        onChange={handleMediaFileChange}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0 bg-secondary/30">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
            <ArrowRight className={`w-5 h-5 text-foreground transition-transform ${isRTL() ? "" : "rotate-180"}`} />
          </button>
          <div>
            <h2 className="font-heading font-bold text-xs sm:text-sm text-foreground truncate max-w-[160px] sm:max-w-xs">
              {template.title}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {isRTL() ? "قالب بواسطة: " : "By: "}{template.creator_name}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground font-bold text-xs glow-primary-sm"
        >
          <Download className="w-4 h-4" />
          <span>{isRTL() ? "تصدير الفيديو" : "Export Video"}</span>
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left / Top Video Preview Stage */}
        <div className="flex-1 bg-black/90 p-3 flex flex-col items-center justify-center relative min-h-[220px]">
          <div
            ref={previewRef}
            className="rounded-xl bg-black overflow-hidden relative border border-border shadow-2xl"
            style={{
              aspectRatio: `${ratio.w}/${ratio.h}`,
              maxHeight: "min(42vh, 320px)",
              maxWidth: "100%",
            }}
          >
            {activeMedia?.type === "video" ? (
              <video
                ref={videoRef}
                src={activeMedia.url}
                className="w-full h-full object-contain"
                playsInline
                preload="auto"
                poster="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>"
              />
            ) : activeMedia?.type === "image" ? (
              <img src={activeMedia.url} alt="Media" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
                <Video className="w-8 h-8 opacity-40 mb-2" />
                <span className="text-xs">{isRTL() ? "استبدل المقاطع القابلة للتعديل لمشاهدة الفيديو" : "Replace editable clips below to view preview"}</span>
              </div>
            )}
          </div>

          {/* Play/Pause Playhead Controller */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="mt-3 px-4 py-1.5 rounded-full bg-secondary/80 hover:bg-secondary text-foreground font-bold text-xs flex items-center gap-1.5 border border-border"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? (isRTL() ? "إيقاف" : "Pause") : (isRTL() ? "تشغيل المعاينة" : "Play Preview")}</span>
          </button>
        </div>

        {/* Right / Bottom Simplified Customization Panel */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-card p-4 overflow-y-auto space-y-5 flex-shrink-0">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {isRTL() ? "المقاطع والنصوص القابلة للتعديل" : "Editable Elements"}
            </h3>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
              {isRTL() ? "القالب مقفل ذكياً" : "Smart Locked"}
            </span>
          </div>

          {/* Replaceable Clips Section */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-primary" />
              {isRTL() ? "مقاطع الفيديو القابلة للاستبدال:" : "Replaceable Clips:"}
            </label>

            {editableClips.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                {isRTL() ? "لا توجد مقاطع قابلة للتعديل في هذا القالب" : "No media elements marked editable"}
              </p>
            ) : (
              <div className="space-y-2">
                {editableClips.map((clip, index) => {
                  const mediaItem = getMediaById(clip.mediaId);
                  return (
                    <div
                      key={clip.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/80 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-black overflow-hidden border border-border shrink-0 flex items-center justify-center">
                          {mediaItem?.url ? (
                            <img src={mediaItem.url} alt="Clip" className="w-full h-full object-cover" />
                          ) : (
                            <Video className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {isRTL() ? `المقطع ${index + 1}` : `Clip Slot ${index + 1}`}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {((clip.out - clip.in) / (clip.speed || 1)).toFixed(1)}s
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTriggerReplaceMedia(clip.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground font-bold text-xs shadow-sm hover:opacity-90"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{isRTL() ? "استبدال" : "Replace"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Editable Captions Section */}
          {projectData.allowTextEditing !== false && (
            <div className="space-y-3 pt-3 border-t border-border">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Type className="w-3.5 h-3.5 text-primary" />
                {isRTL() ? "تعديل نصوص القالب:" : "Edit Text / Captions:"}
              </label>

              {editableCaptions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  {isRTL() ? "لا توجد نصوص للتعديل" : "No captions in this template"}
                </p>
              ) : (
                <div className="space-y-2">
                  {editableCaptions.map((cap) => (
                    <div key={cap.id} className="space-y-1">
                      <input
                        type="text"
                        value={cap.text}
                        onChange={(e) => handleCaptionTextChange(cap.id, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-secondary/50 border border-border text-xs text-foreground focus:outline-none focus:border-primary font-medium"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Render Export Pipeline Dialog */}
      <ExportDialog
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectName={template.title}
        totalDuration={totalDuration || 5}
        previewRef={previewRef as any}
        videoRef={videoRef as any}
        onPlayForExport={() => setIsPlaying(true)}
        onStopPlay={() => setIsPlaying(false)}
        seekToStart={() => setCurrentTime(0)}
        activeRatio={activeRatioIndex}
      />
    </div>
  );
}
