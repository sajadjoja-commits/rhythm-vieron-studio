import { useState, useEffect, useRef } from "react";
import { 
  X, Sparkles, Image as ImageIcon, Lock, Unlock, Hash, Check, 
  Copy, Share2, Film, Type, Music, Layers, Palette, Eye, AlertCircle, Loader2 
} from "lucide-react";
import { useMedia, Clip, Caption, OverlayItem, AudioTrackItem } from "@/context/MediaContext";
import { supabase } from "@/integrations/supabase/client";
import { publishTemplateToSupabase, generateTemplateShareUrl } from "@/services/templateService";
import { PublishedTemplate, EditableProjectData } from "@/types/template";
import { toast } from "sonner";
import { t, isRTL, getLang } from "@/lib/i18n";
import AuthScreen from "@/components/AuthScreen";

interface Props {
  open: boolean;
  onClose: () => void;
  previewRef?: React.RefObject<HTMLDivElement>;
  videoRef?: React.RefObject<HTMLVideoElement>;
  activeRatio?: number;
  embedded?: boolean;
}

export default function PublishTemplateDialog({ open, onClose, previewRef, videoRef, activeRatio = 0, embedded = false }: Props) {
  const {
    projectName,
    clips = [],
    media = [],
    captions = [],
    overlays = [],
    audioTracks = [],
    filters = [],
    vfx = [],
    totalDuration,
    coverImage,
  } = useMedia();

  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Form State
  const [title, setTitle] = useState(projectName || "My Template");
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>(["#vireon", "#template", "#trending"]);
  const [coverUrl, setCoverUrl] = useState<string>(coverImage || "");
  const [customCoverFile, setCustomCoverFile] = useState<File | null>(null);

  // Lock State
  const [editableClipIds, setEditableClipIds] = useState<Record<string, boolean>>({});
  const [editableCaptionIds, setEditableCaptionIds] = useState<Record<string, boolean>>({});
  const [editableOverlayIds, setEditableOverlayIds] = useState<Record<string, boolean>>({});
  const [editableAudioIds, setEditableAudioIds] = useState<Record<string, boolean>>({});
  const [allowTextEditing, setAllowTextEditing] = useState(true);
  const [allowMusicMuting, setAllowMusicMuting] = useState(true);

  // Publishing flow state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedTemplate, setPublishedTemplate] = useState<PublishedTemplate | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setCheckingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize clip locks on open: default 1st video clip editable, others locked unless toggled
  useEffect(() => {
    if (open) {
      setTitle(projectName || "My CapCut Template");
      
      const initialClips: Record<string, boolean> = {};
      clips.forEach((c, idx) => {
        initialClips[c.id] = idx === 0; // default 1st clip editable
      });
      setEditableClipIds(initialClips);

      const initialCaps: Record<string, boolean> = {};
      captions.forEach(c => { initialCaps[c.id] = true; });
      setEditableCaptionIds(initialCaps);

      const initialOvl: Record<string, boolean> = {};
      overlays.forEach(o => { initialOvl[o.id] = false; });
      setEditableOverlayIds(initialOvl);

      const initialAud: Record<string, boolean> = {};
      audioTracks.forEach(a => { initialAud[a.id] = false; });
      setEditableAudioIds(initialAud);

      // Auto capture cover from video element if not set
      if (!coverImage && videoRef?.current) {
        try {
          const video = videoRef.current;
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            setCoverUrl(canvas.toDataURL("image/jpeg", 0.8));
          }
        } catch (e) {
          console.log("Auto cover extraction note:", e);
        }
      } else if (coverImage) {
        setCoverUrl(coverImage);
      }
    }
  }, [open, projectName, clips, captions, overlays, audioTracks, coverImage, videoRef]);

  if (!open) return null;

  const handleAddHashtag = () => {
    const trimmed = hashtagInput.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (hashtags.length >= 5) {
      toast.error(isRTL() ? "الحد الأقصى هو 5 وسمًا (Hashtags)" : "Maximum 5 hashtags allowed");
      return;
    }
    const newTag = `#${trimmed}`;
    if (!hashtags.includes(newTag)) {
      setHashtags([...hashtags, newTag]);
    }
    setHashtagInput("");
  };

  const handleRemoveHashtag = (tagToRemove: string) => {
    setHashtags(hashtags.filter(h => h !== tagToRemove));
  };

  const handleCustomCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomCoverFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCoverUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCaptureCurrentFrame = () => {
    if (videoRef?.current) {
      try {
        const video = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setCoverUrl(dataUrl);
          toast.success(isRTL() ? "تم التقاط الغلاف من الإطار الحالي" : "Captured cover from current frame");
        }
      } catch (err) {
        toast.error(isRTL() ? "فشل التقاط الغلاف" : "Failed to capture cover frame");
      }
    } else {
      toast.error(isRTL() ? "الفيديو غير جاهز للالتقاط" : "Video player not ready");
    }
  };

  const handleToggleClipEditable = (clipId: string) => {
    setEditableClipIds(prev => ({
      ...prev,
      [clipId]: !prev[clipId],
    }));
  };

  const handleToggleCaptionEditable = (captionId: string) => {
    setEditableCaptionIds(prev => ({
      ...prev,
      [captionId]: !prev[captionId],
    }));
  };

  const handleToggleOverlayEditable = (overlayId: string) => {
    setEditableOverlayIds(prev => ({
      ...prev,
      [overlayId]: !prev[overlayId],
    }));
  };

  const handleToggleAudioEditable = (audioId: string) => {
    setEditableAudioIds(prev => ({
      ...prev,
      [audioId]: !prev[audioId],
    }));
  };

  const handlePublish = async () => {
    if (!navigator.onLine) {
      toast.error(isRTL() ? "يتطلب نشر القوالب اتصالاً بالإنترنت" : "Internet connection is required to publish templates");
      return;
    }

    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }

    if (!title.trim()) {
      toast.error(isRTL() ? "يرجى إدخال عنوان للقالب" : "Please enter a template title");
      return;
    }

    setIsPublishing(true);
    try {
      const mediaItemsMeta = media.map(m => ({
        id: m.id,
        url: m.url,
        type: m.type,
        name: m.name,
      }));

      const editableClips = clips.map(c => ({
        ...c,
        editable: !!editableClipIds[c.id],
      }));

      const editableCaptions = captions.map(c => ({
        ...c,
        editable: !!editableCaptionIds[c.id],
      }));

      const editableOverlays = overlays.map(o => ({
        ...o,
        editable: !!editableOverlayIds[o.id],
      }));

      const editableAudio = audioTracks.map(a => ({
        ...a,
        editable: !!editableAudioIds[a.id],
      }));

      const projectData: EditableProjectData = {
        clips: editableClips,
        captions: editableCaptions,
        overlays: editableOverlays,
        audioTracks: editableAudio,
        filters,
        vfx,
        totalDuration,
        activeRatio,
        allowTextEditing,
        allowMusicMuting,
        mediaItems: mediaItemsMeta,
      };

      const result = await publishTemplateToSupabase(
        title,
        hashtags,
        coverUrl,
        projectData
      );

      setPublishedTemplate(result);
      toast.success(isRTL() ? "تم نشر القالب بنجاح!" : "Template published successfully!");
    } catch (err: any) {
      console.error("Publish template error:", err);
      toast.error(err.message || (isRTL() ? "فشل نشر القالب" : "Failed to publish template"));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!publishedTemplate) return;
    const shareUrl = generateTemplateShareUrl(publishedTemplate.id);
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    toast.success(isRTL() ? "تم نسخ رابط القالب للمشاركة!" : "Template share link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (embedded) {
    return (
      <div className="w-full space-y-6 animate-in fade-in duration-200">
        {/* Auth Screen Modal if required */}
        {showAuthModal && (
          <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden p-4">
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="absolute top-3 left-3 z-10 p-2 rounded-full bg-secondary/80 text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
              <AuthScreen onLoginSuccess={() => setShowAuthModal(false)} />
            </div>
          </div>
        )}

        {publishedTemplate ? (
          /* Success Celebration & Share Screen */
          <div className="text-center space-y-5 py-4">
            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center mx-auto text-primary-foreground animate-bounce">
              <Check className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-xl text-foreground">
                {isRTL() ? "تم نشر القالب بنجاح! 🎉" : "Template Published Successfully! 🎉"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isRTL() ? "يمكن للمستخدمين الآن إنشاء مونتاج بسهولة باستخدام هذا القالب" : "Creators can now make montages effortlessly using your template"}
              </p>
            </div>

            {/* Link Copy Box */}
            <div className="p-4 bg-secondary/50 border border-border rounded-xl space-y-2 max-w-md mx-auto">
              <span className="text-[11px] font-bold text-muted-foreground block text-start">
                {isRTL() ? "رابط القالب المباشر للمشاركة:" : "Direct Template Share Link:"}
              </span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={generateTemplateShareUrl(publishedTemplate.id)}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? (isRTL() ? "تم النسخ" : "Copied") : (isRTL() ? "نسخ" : "Copy")}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs"
              >
                {isRTL() ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        ) : (
          /* Main Publishing Form */
          <>
            {/* Template Info & Cover */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Cover Thumbnail */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-primary" />
                  <span>{isRTL() ? "صورة غلاف القالب" : "Template Cover Image"}</span>
                </label>
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black border border-border group flex items-center justify-center max-h-[180px]">
                  {coverUrl ? (
                    <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-3 text-muted-foreground">
                      <Film className="w-8 h-8 mx-auto opacity-40 mb-1" />
                      <span className="text-[10px]">{isRTL() ? "لا توجد صورة غلاف" : "No cover image"}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 text-white text-xs font-bold transition-opacity"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span>{isRTL() ? "تغيير الغلاف" : "Change Cover"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCustomCoverUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Title & Hashtags */}
              <div className="md:col-span-2 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {isRTL() ? "عنوان القالب" : "Template Title"} *
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isRTL() ? "أدخل عنوانًا جذّابًا للقالب..." : "Enter template title..."}
                    className="w-full bg-secondary/50 border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-primary" />
                    <span>{isRTL() ? "الوسوم (Hashtags)" : "Hashtags"}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={hashtagInput}
                      onChange={(e) => setHashtagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddHashtag(); } }}
                      placeholder={isRTL() ? "أضف وسم مثل vireon#" : "Add hashtag e.g. #vireon"}
                      className="flex-1 bg-secondary/50 border border-border rounded-xl px-3.5 py-2 text-xs text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddHashtag}
                      className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold"
                    >
                      {isRTL() ? "إضافة" : "Add"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveHashtag(tag)}
                          className="hover:text-destructive text-primary/70"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Editable Rights / Lock Controls */}
            <div className="space-y-4 border-t border-border/80 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-heading font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    <span>{isRTL() ? "صلاحيات التعديل للمستخدمين (Lock Controls)" : "User Editable Permissions"}</span>
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isRTL() ? "حدد المقاطع القابلة للاستبدال من قبل من يدمج القالب" : "Choose which clips creators can replace when using this template"}
                  </p>
                </div>
              </div>

              {/* Media Clips Lock Toggles */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <Film className="w-3 h-3" />
                  <span>{isRTL() ? "مقاطع الفيديو والصور:" : "Media Clips:"}</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                  {clips.map((clip, idx) => {
                    const isEditable = editableClipIds[clip.id] ?? false;
                    const mediaObj = media.find((m) => m.id === clip.mediaId);
                    return (
                      <div
                        key={clip.id}
                        onClick={() => toggleClipLock(clip.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isEditable
                            ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                            : "border-border/60 bg-secondary/30 text-muted-foreground opacity-70"
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-[10px] font-bold w-4 h-4 rounded-full bg-background flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-medium truncate">
                            {mediaObj?.name || `Clip ${idx + 1}`} ({Math.round(clip.duration)}s)
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold">
                          {isEditable ? (
                            <span className="text-emerald-500 flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              <span>{isRTL() ? "قابل للاستبدال" : "Replaceable"}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>{isRTL() ? "مغلق ثابر" : "Fixed"}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-xs glow-primary-sm disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isRTL() ? "جاري نشر القالب..." : "Publishing..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{isRTL() ? "نشر القالب الآن" : "Publish Template Now"}</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Auth Screen Modal if required */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden p-4">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-3 left-3 z-10 p-2 rounded-full bg-secondary/80 text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <AuthScreen onLoginSuccess={() => setShowAuthModal(false)} />
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-foreground">
                {isRTL() ? "نشر كقالب احترافي (Publish as Template)" : "Publish as Template"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {isRTL() ? "شارك تصميمك ليتمكن الآخرون من استبدال الوسائط والنصوص فقط" : "Allow creators to reuse your media flow, effects & transitions"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {publishedTemplate ? (
            /* Success Celebration & Share Screen */
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center mx-auto text-primary-foreground animate-bounce">
                <Check className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-xl text-foreground">
                  {isRTL() ? "تم نشر القالب بنجاح! 🎉" : "Template Published Successfully! 🎉"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  {isRTL() ? "أصبح قالبك متاحاً الآن ويمكنك مشاركته عبر الرابط المباشر" : "Your template is ready! Share the direct link with users on social media"}
                </p>
              </div>

              {/* Cover & Title Preview */}
              <div className="bg-secondary/40 border border-border rounded-xl p-3 max-w-md mx-auto flex items-center gap-3">
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="w-16 h-20 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="w-16 h-20 bg-muted rounded-lg flex items-center justify-center">
                    <Film className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="text-start flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-foreground truncate">{publishedTemplate.title}</h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {publishedTemplate.hashtags.map((tag, i) => (
                      <span key={i} className="text-[10px] text-primary font-semibold">{tag}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {isRTL() ? "بواسطة: " : "By: "}{publishedTemplate.creator_name}
                  </p>
                </div>
              </div>

              {/* Share URL Box */}
              <div className="max-w-md mx-auto space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block text-start">
                  {isRTL() ? "رابط القالب المباشر:" : "Direct Template Share Link:"}
                </label>
                <div className="flex items-center gap-2 bg-secondary/60 p-2 rounded-xl border border-border">
                  <input
                    type="text"
                    readOnly
                    value={generateTemplateShareUrl(publishedTemplate.id)}
                    className="bg-transparent text-xs text-foreground flex-1 outline-none px-2 font-mono truncate"
                  />
                  <button
                    onClick={handleCopyShareLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-xs font-bold shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? (isRTL() ? "تم النسخ" : "Copied") : (isRTL() ? "نسخ الرابط" : "Copy Link")}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-xs hover:bg-secondary/80"
                >
                  {isRTL() ? "إغلاق" : "Close"}
                </button>
              </div>
            </div>
          ) : (
            /* Main Setup Form */
            <>
              {/* Login Banner check */}
              {!session?.user && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between text-amber-500 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{isRTL() ? "يتطلب نشر القوالب تسجيل الدخول بحسابك" : "You need to log in to publish templates"}</span>
                  </div>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="px-3 py-1 rounded-lg bg-amber-500 text-black font-bold text-[11px]"
                  >
                    {isRTL() ? "تسجيل الدخول" : "Log In"}
                  </button>
                </div>
              )}

              {/* Step 1: Cover Image & Details */}
              <div className="space-y-4">
                <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-primary" />
                  {isRTL() ? "1. الغلاف والتفاصيل الأساسية" : "1. Cover & Template Info"}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Cover Picker Box */}
                  <div className="flex flex-col items-center justify-center gap-2 bg-secondary/30 border border-border rounded-xl p-3">
                    <div className="relative w-24 h-32 rounded-lg bg-black overflow-hidden border border-border shadow-md">
                      {coverUrl ? (
                        <img src={coverUrl} alt="Template Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <Film className="w-6 h-6" />
                          <span className="text-[9px] mt-1">{isRTL() ? "لا يوجد غلاف" : "No cover"}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 w-full">
                      <button
                        type="button"
                        onClick={handleCaptureCurrentFrame}
                        className="flex-1 py-1 px-1.5 bg-secondary hover:bg-secondary/80 text-[10px] font-medium rounded-lg text-foreground border border-border text-center truncate"
                      >
                        {isRTL() ? "التقاط إطار" : "Pick Frame"}
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-1 px-1.5 bg-secondary hover:bg-secondary/80 text-[10px] font-medium rounded-lg text-foreground border border-border text-center truncate"
                      >
                        {isRTL() ? "رفع صورة" : "Upload"}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCustomCoverUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Title & Hashtags Inputs */}
                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">
                        {isRTL() ? "عنوان القالب:" : "Template Title:"}
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={isRTL() ? "مثال: مونتاج بطيء مع انتقال فلاش" : "e.g. Cinematic Slow Motion Reel"}
                        className="w-full px-3 py-2 rounded-xl bg-secondary/50 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5 text-primary" />
                          {isRTL() ? "الوسوم (Hashtags):" : "Hashtags:"}
                        </label>
                        <span className="text-[10px] text-muted-foreground">{hashtags.length}/5</span>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={hashtagInput}
                          onChange={(e) => setHashtagInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddHashtag(); } }}
                          placeholder={isRTL() ? "أضف وسم ثم اضغط Enter" : "Add hashtag and press Enter"}
                          disabled={hashtags.length >= 5}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-secondary/50 border border-border text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={handleAddHashtag}
                          disabled={hashtags.length >= 5 || !hashtagInput.trim()}
                          className="px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold disabled:opacity-40"
                        >
                          {isRTL() ? "إضافة" : "Add"}
                        </button>
                      </div>

                      {/* Hashtag Badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {hashtags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-medium"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveHashtag(tag)}
                              className="hover:text-destructive transition-colors ml-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Layer & Clip Lock Controls */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    {isRTL() ? "2. قفل الطبقات وتحديد العناصر القابلة للتعديل" : "2. Layer Lock & Editable Clips"}
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {isRTL() ? "العناصر غير المحددة ستكون مقفلة بصورة دائمية" : "Unmarked items remain strictly locked"}
                  </span>
                </div>

                {/* Global Feature Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-secondary/20 p-3 rounded-xl border border-border">
                  <label className="flex items-center justify-between text-xs text-foreground cursor-pointer select-none">
                    <span className="flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-primary" />
                      {isRTL() ? "السماح بتعديل النصوص والترجمات" : "Allow text editing"}
                    </span>
                    <input
                      type="checkbox"
                      checked={allowTextEditing}
                      onChange={(e) => setAllowTextEditing(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-foreground cursor-pointer select-none">
                    <span className="flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-accent" />
                      {isRTL() ? "السماح باستبدال أو كتم الصوت" : "Allow music muting/replacement"}
                    </span>
                    <input
                      type="checkbox"
                      checked={allowMusicMuting}
                      onChange={(e) => setAllowMusicMuting(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded"
                    />
                  </label>
                </div>

                {/* Video Clips Locking List */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground block">
                    {isRTL() ? "مقاطع الفيديو والصور المتتالية:" : "Video / Photo Clips:"}
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {clips.map((clip, index) => {
                      const isEditable = !!editableClipIds[clip.id];
                      const mediaItem = media.find(m => m.id === clip.mediaId);
                      return (
                        <div
                          key={clip.id}
                          onClick={() => handleToggleClipEditable(clip.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isEditable
                              ? "bg-primary/10 border-primary/40 text-foreground"
                              : "bg-secondary/30 border-border/60 text-muted-foreground hover:bg-secondary/60"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-bold w-5 h-5 rounded-full bg-secondary flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <Film className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-xs font-medium truncate">
                              {mediaItem?.name || `Clip ${index + 1}`} ({((clip.out - clip.in) / (clip.speed || 1)).toFixed(1)}s)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isEditable ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <Unlock className="w-3 h-3" />
                                {isRTL() ? "قابل للتعديل" : "Editable"}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border">
                                <Lock className="w-3 h-3" />
                                {isRTL() ? "مُقفل" : "Locked"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit / Publish Action */}
              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold hover:bg-secondary/80"
                >
                  {isRTL() ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold text-xs glow-primary-sm disabled:opacity-50"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isRTL() ? "جاري نشر القالب..." : "Publishing..."}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{isRTL() ? "نشر القالب الآن" : "Publish Template"}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
