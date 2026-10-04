import { useRef, useState } from "react";
import { Image as ImageIcon, Camera, Upload, Trash2, Check } from "lucide-react";
import { useMedia } from "@/context/MediaContext";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import DraggableLibrarySheet from "./DraggableLibrarySheet";

interface Props {
  open: boolean;
  onClose: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const CoverPicker = ({ open, onClose, videoRef }: Props) => {
  const { coverImage, setCoverImage } = useMedia();
  const [draft, setDraft] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const en = getLang() === "en";

  if (!open) return null;

  const preview = draft ?? coverImage;

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
    <DraggableLibrarySheet
      id="cover-picker-root"
      open={open}
      onClose={onClose}
      dir={en ? "ltr" : "rtl"}
      defaultVh={48}
      icon={<ImageIcon className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />}
      title={en ? "Video Cover" : "غلاف الفيديو"}
      badge={
        preview ? (
          <span className="text-[10px] text-primary font-black px-1.5 py-0.2 rounded-md bg-primary/10 border border-primary/20 shrink-0">
            {en ? "Custom" : "مخصص"}
          </span>
        ) : null
      }
    >
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
          <Camera className="w-4 h-4 text-primary" /> {en ? "From frame" : "من اللقطة الحالية"}
        </button>
        <button onClick={() => fileRef.current?.click()} className="py-2.5 rounded-xl bg-secondary text-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-secondary/80 transition-all active:scale-95">
          <Upload className="w-4 h-4 text-primary" /> {en ? "From files" : "رفع صورة"}
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={save} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 glow-primary-sm hover:opacity-90 transition-all active:scale-95">
          <Check className="w-4 h-4" /> {en ? "Set as Cover" : "حفظ الغلاف"}
        </button>
        {(coverImage || draft) && (
          <button onClick={clear} className="px-3 py-2.5 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 text-xs font-bold flex items-center justify-center transition-all active:scale-95" title={en ? "Remove" : "إزالة"}>
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </DraggableLibrarySheet>
  );
};

export default CoverPicker;
