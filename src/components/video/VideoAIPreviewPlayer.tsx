import React, { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

interface VideoAIPreviewPlayerProps {
  src: string;
  videoBgMode: "checkerboard" | "green" | "white" | "black";
  en?: boolean;
  onReady?: () => void;
  onError?: (err: string) => void;
}

export const VideoAIPreviewPlayer: React.FC<VideoAIPreviewPlayerProps> = ({
  src,
  videoBgMode,
  en = false,
  onReady,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const activeUrlRef = useRef<string>("");

  useEffect(() => {
    if (!src) {
      setStatus("error");
      setErrorMessage(en ? "No processed video URL provided." : "لم يتم توفير رابط الفيديو المعالج.");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    activeUrlRef.current = src;

    const video = videoRef.current;
    if (!video) return;

    let isSubscribed = true;

    const handleLoadedMetadata = () => {
      if (!isSubscribed) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        setStatus("error");
        const msg = en ? "Invalid video dimensions (0x0)" : "أبعاد الفيديو غير صالحة (0x0)";
        setErrorMessage(msg);
        onError?.(msg);
        return;
      }
    };

    const handleCanPlay = () => {
      if (!isSubscribed) return;
      setStatus("ready");
      onReady?.();
    };

    const handleError = () => {
      if (!isSubscribed) return;
      const mediaError = video.error;
      let errText = en ? "Failed to load processed video preview." : "فشل تحميل معاينة الفيديو الناتج.";
      if (mediaError) {
        if (mediaError.code === 1) errText = en ? "Video playback aborted" : "تم إلغاء تشغيل الفيديو";
        else if (mediaError.code === 2) errText = en ? "Network error decoding video" : "خطأ شبكة أثناء فك ترميز الفيديو";
        else if (mediaError.code === 3) errText = en ? "Video decoding failed (codec unsupported)" : "فشل فك ترميز الفيديو (ترميز غير مدعوم)";
        else if (mediaError.code === 4) errText = en ? "Video format not supported by browser" : "صيغة الفيديو غير مدعومة في المتصفح";
      }
      setStatus("error");
      setErrorMessage(errText);
      onError?.(errText);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);

    // Assign source and force browser re-decode
    video.src = src;
    video.load();

    return () => {
      isSubscribed = false;
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleError);
    };
  }, [src, en, onReady, onError]);

  const bgClasses = {
    checkerboard:
      "bg-[linear-gradient(45deg,#202020_25%,transparent_25%),linear-gradient(-45deg,#202020_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#202020_75%),linear-gradient(-45deg,transparent_75%,#202020_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-slate-900",
    green: "bg-[#00ff00]",
    white: "bg-white",
    black: "bg-black",
  }[videoBgMode];

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-border flex items-center justify-center min-h-[220px] max-h-[360px] w-full transition-colors ${bgClasses}`}
    >
      {/* Real Video Element */}
      <video
        ref={videoRef}
        controls
        playsInline
        className={`w-full max-h-72 object-contain transition-opacity duration-300 ${
          status === "ready" ? "opacity-100" : "opacity-0 pointer-events-none absolute"
        }`}
      />

      {/* Loading Overlay */}
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center p-6 gap-3 text-center bg-black/40 backdrop-blur-sm rounded-xl">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-xs font-semibold text-white">
            {en ? "Loading processed video preview..." : "جاري تحميل معاينة الفيديو الناتج..."}
          </div>
          <div className="text-[10px] text-white/70 font-mono">
            {en ? "Verifying decoded stream & metadata..." : "جاري التحقق من تدفق الفيديو والبيانات..."}
          </div>
        </div>
      )}

      {/* Error / Failed State Overlay (Strictly no fallback to original) */}
      {status === "error" && (
        <div className="flex flex-col items-center justify-center p-6 gap-3 text-center bg-destructive/10 border border-destructive/30 rounded-xl m-4">
          <AlertTriangle className="w-8 h-8 text-destructive animate-pulse" />
          <div className="text-xs font-bold text-destructive">
            {en ? "Processed Video Preview Failed" : "فشل عرض معاينة الفيديو المُعالج"}
          </div>
          <div className="text-[11px] text-muted-foreground max-w-sm">
            {errorMessage || (en ? "The processed video could not be decoded." : "تعذر فك ترميز الفيديو المُنتج.")}
          </div>
          <button
            type="button"
            onClick={() => {
              if (videoRef.current && src) {
                setStatus("loading");
                videoRef.current.src = src;
                videoRef.current.load();
              }
            }}
            className="mt-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1.5 border border-border"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {en ? "Retry Loading" : "إعادة المحاولة"}
          </button>
        </div>
      )}
    </div>
  );
};
