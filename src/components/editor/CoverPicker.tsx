import { useRef, useState, useEffect } from "react";
import { Image as ImageIcon, X, Camera, Upload, Trash2, Check, Eye, EyeOff } from "lucide-react";
import { useMedia } from "@/context/MediaContext";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface Props {
  open: boolean;
  onClose: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const CoverPicker = ({ open, onClose, videoRef }: Props) => {
  const { coverImage, setCoverImage } = useMedia();
  const [draft, setDraft] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const en = getLang() === "en";

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  if (!open) return null;

  const preview = draft ?? coverImage;

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Video Cover:" : "الغلاف الحالي:"}</span>
            <span className="text-primary font-extrabold">{preview ? (en ? "Custom" : "مخصص") : (en ? "None" : "لا يوجد")}</span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button 
            onClick={() => { playSfx("click"); setIsCollapsed(false); }}
            className="px-3.5 py-1.5 rounded-full gradient-primary hover:opacity-90 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-md"
          >
            <Eye className="w-3.5 h-3.5" />
            {en ? "Show Library" : "إظهار المكتبة"}
          </button>
          <button 
            onClick={() => { playSfx("success"); onClose(); }}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-90"
            title={en ? "Confirm" : "تأكيد"}
          >
            <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
          </button>
          <button 
            onClick={() => { playSfx("click"); onClose(); }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-all active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const captureFrame = () => {
    playSfx("click");
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      toast.error(en ? "Play video to the desired frame first" : "شغّل الفيديو عند الإطار المطلوب أولاً");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setDraft(canvas.toDataURL("image/jpeg", 0.85));
    try { navigator.vibrate?.(10); } catch {}
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    playSfx("click");
    const reader = new FileReader();
    reader.onload = () => setDraft(reader.result as string);
    reader.readAsDataURL(f);
  };

  const save = () => {
    playSfx("success");
    if (!draft) { onClose(); return; }
    setCoverImage(draft);
    setDraft(null);
    toast.success(en ? "Video cover set successfully" : "تم تعيين غلاف الفيديو بنجاح");
    onClose();
  };

  const clear = () => {
    playSfx("click");
    setCoverImage(null);
    setDraft(null);
    toast.success(en ? "Cover removed" : "تمت إزالة الغلاف بنجاح");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir={en ? "ltr" : "rtl"}>
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl pb-6">
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <ImageIcon className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
            </div>
            <span>{en ? "Video Cover & Thumbnail Picker" : "غلاف الفيديو وصورة العرض"}</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Collapse to see work button */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90"
              title={en ? "Minimize library to preview work" : "إخفاء لرؤية العمل"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            <button onClick={() => { playSfx("click"); onClose(); }} className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-all active:scale-90">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="aspect-video w-full max-w-[220px] mx-auto rounded-xl bg-black overflow-hidden border border-border mb-3 flex items-center justify-center shadow-lg relative group">
          {preview ? (
            <img src={preview} alt="cover" className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105" />
          ) : (
            <span className="text-[10px] text-muted-foreground">{en ? "No cover thumbnail yet" : "لم يتم اختيار غلاف بعد"}</span>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-black/40 py-1 text-center text-[8px] font-extrabold text-white tracking-widest uppercase">
            {en ? "PREVIEW COVER" : "معاينة الغلاف"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={captureFrame} className="py-2.5 rounded-xl bg-secondary text-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-secondary/80 transition-all active:scale-95">
            <Camera className="w-4 h-4 text-primary animate-bounce" /> {en ? "From current frame" : "لقطة من المقطع الحالي"}
          </button>
          <button onClick={() => fileRef.current?.click()} className="py-2.5 rounded-xl bg-secondary text-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-secondary/80 transition-all active:scale-95">
            <Upload className="w-4 h-4 text-primary animate-pulse" /> {en ? "From files" : "رفع صورة مخصصة"}
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 glow-primary-sm hover:opacity-90 transition-all active:scale-95">
            <Check className="w-4 h-4" /> {en ? "Set as Cover" : "حفظ وتعيين الغلاف"}
          </button>
          {(coverImage || draft) && (
            <button onClick={clear} className="px-3 py-2.5 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 text-xs font-bold flex items-center justify-center transition-all active:scale-95" title={en ? "Remove" : "إزالة"}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
};

export default CoverPicker;
