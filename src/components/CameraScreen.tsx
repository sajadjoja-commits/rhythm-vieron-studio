import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, SwitchCamera, Circle, Square, Image as ImageIcon, Video, X, Check, Download } from "lucide-react";
import { toast } from "sonner";

interface CameraScreenProps {
  onCaptured?: (file: File) => void;
}

const CameraScreen = ({ onCaptured }: CameraScreenProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [active, setActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === "video",
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setActive(true);
    } catch (err) {
      toast.error("تعذر الوصول إلى الكاميرا");
    }
  }, [facingMode, mode]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const flipCamera = () => {
    setFacingMode((f) => (f === "user" ? "environment" : "user"));
  };

  useEffect(() => {
    if (active) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const takePhoto = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedUrl(URL.createObjectURL(blob));
      setCapturedFile(file);
    }, "image/jpeg", 0.92);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `video-${Date.now()}.webm`, { type: "video/webm" });
      setCapturedUrl(URL.createObjectURL(blob));
      setCapturedFile(file);
    };
    mr.start();
    recorderRef.current = mr;
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const handleCapture = () => {
    if (mode === "photo") takePhoto();
    else if (recording) stopRecording();
    else startRecording();
  };

  const handleUse = () => {
    if (capturedFile && onCaptured) onCaptured(capturedFile);
    setCapturedUrl(null);
    setCapturedFile(null);
  };

  const handleDiscard = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedFile(null);
  };

  const handleSave = () => {
    if (!capturedUrl) return;
    const a = document.createElement("a");
    a.href = capturedUrl;
    a.download = capturedFile?.name || "capture";
    a.click();
    toast.success("تم الحفظ");
  };

  if (capturedUrl) {
    return (
      <div className="min-h-screen pb-24 flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-border bg-card">
          {mode === "photo" ? (
            <img src={capturedUrl} alt="" className="w-full aspect-[3/4] object-cover" />
          ) : (
            <video src={capturedUrl} controls className="w-full aspect-[3/4] object-cover" />
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={handleDiscard} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-bold">
            <X className="w-4 h-4" /> تجاهل
          </button>
          <button onClick={handleSave} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-bold">
            <Download className="w-4 h-4" /> حفظ
          </button>
          {onCaptured && (
            <button onClick={handleUse} className="flex items-center gap-1 px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">
              <Check className="w-4 h-4" /> استخدام
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 flex flex-col items-center justify-center bg-background px-4">
      <h1 className="font-heading text-2xl font-bold text-foreground mb-4">الكاميرا</h1>

      <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-border bg-black relative">
        <video ref={videoRef} className="w-full aspect-[3/4] object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hidden" />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/90">
            <Camera className="w-12 h-12 text-primary" />
            <button onClick={startCamera} className="px-6 py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold text-sm">
              تشغيل الكاميرا
            </button>
          </div>
        )}
        {recording && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-destructive/80">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] text-white font-bold">تسجيل</span>
          </div>
        )}
      </div>

      {active && (
        <div className="flex items-center gap-6 mt-5">
          <button onClick={flipCamera} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <SwitchCamera className="w-5 h-5 text-foreground" />
          </button>
          <button
            onClick={handleCapture}
            className={`w-16 h-16 rounded-full flex items-center justify-center border-4 ${
              recording ? "border-destructive bg-destructive/20" : "border-primary bg-primary/20"
            }`}
          >
            {mode === "photo" ? (
              <Circle className="w-10 h-10 text-primary fill-primary" />
            ) : recording ? (
              <Square className="w-6 h-6 text-destructive fill-destructive" />
            ) : (
              <Circle className="w-10 h-10 text-destructive fill-destructive" />
            )}
          </button>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setMode("photo")}
              className={`p-2 rounded-lg ${mode === "photo" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMode("video")}
              className={`p-2 rounded-lg ${mode === "video" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <Video className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraScreen;
