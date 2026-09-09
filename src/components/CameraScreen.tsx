import { useState, useRef, useCallback, useEffect } from "react";
import { 
  Camera, SwitchCamera, Circle, Square, Image as ImageIcon, Video, X, Check, Download,
  Zap, ZapOff, Clock, Sliders, Sparkles, Grid, Type, Play, Pause, RotateCcw, ChevronUp, ChevronDown,
  Layers, Settings, Move, Eye, EyeOff, FlipHorizontal, Sun, Contrast, Palette, Maximize,
  Volume2, VolumeX, ShieldCheck, UserCheck, Focus, Frame, Wand2
} from "lucide-react";
import { toast } from "sonner";
import { getLang, isRTL } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface CameraScreenProps {
  onCaptured?: (file: File) => void;
  onClose?: () => void;
}

// Camera Live Filters
const CAMERA_FILTERS = [
  { id: "normal", nameAr: "عادي", nameEn: "Normal", css: "none" },
  { id: "portrait_bokeh", nameAr: "بورتريه سينمائي", nameEn: "Portrait Bokeh", css: "contrast(1.1) saturate(1.15) brightness(1.04)" },
  { id: "beauty", nameAr: "تجميل ناعم", nameEn: "Soft Beauty", css: "brightness(1.08) contrast(0.95) saturate(1.1)" },
  { id: "vintage", nameAr: "فينتاج كلاسيك", nameEn: "Vintage Classic", css: "sepia(0.35) contrast(1.1) brightness(0.98)" },
  { id: "bw", nameAr: "أبيض وأسود نوار", nameEn: "B&W Noir", css: "grayscale(1) contrast(1.3)" },
  { id: "warm", nameAr: "دافئ ذهبي", nameEn: "Warm Gold", css: "saturate(1.35) sepia(0.15) hue-rotate(-10deg)" },
  { id: "cool", nameAr: "بارد سينمائي", nameEn: "Cool Slate", css: "saturate(1.2) hue-rotate(20deg) contrast(1.08)" },
  { id: "cyber", nameAr: "سايبر نيون", nameEn: "Cyber Neon", css: "contrast(1.25) saturate(1.8) hue-rotate(180deg)" },
  { id: "cinematic", nameAr: "أفلام سينما", nameEn: "Cinematic Movie", css: "contrast(1.25) saturate(0.88) brightness(0.95)" },
  { id: "vivid", nameAr: "ألوان مشبعة", nameEn: "Vivid Glow", css: "saturate(1.75) contrast(1.12) brightness(1.02)" },
];

const CameraScreen = ({ onCaptured, onClose }: CameraScreenProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [active, setActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [mode, setMode] = useState<"photo" | "video">("video");
  const [recording, setRecording] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  // Advanced Tools & Portrait mode state
  const [flash, setFlash] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [timer, setTimer] = useState<0 | 3 | 5 | 10>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState<0.5 | 1 | 2 | 3>(1);
  const [activeFilter, setActiveFilter] = useState("normal");
  const [showFilters, setShowFilters] = useState(false);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "4:3">("9:16");

  // Portrait Mode (عزل الخلفية - بورتريه)
  const [portraitMode, setPortraitMode] = useState(false);
  const [portraitBlurAmount, setPortraitBlurAmount] = useState(12);

  // Manual Adjustments (سطوع، تباين، تشبع)
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // Teleprompter (أداة التلقين النصي) State
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [teleprompterText, setTeleprompterText] = useState(
    "أهلاً بكم في ڤايرون استوديو! 🎬\nهذا النص يظهر في أداة التلقين لمساعدتك أثناء التصوير.\nيمكنك تعديل السرعة وحجم الخط أو استبدال النص بنفسك."
  );
  const [isEditingTeleprompter, setIsEditingTeleprompter] = useState(false);
  const [teleprompterPlaying, setTeleprompterPlaying] = useState(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(2); // 1-5
  const [teleprompterFontSize, setTeleprompterFontSize] = useState(22); // 14-36
  const [teleprompterMirrored, setTeleprompterMirrored] = useState(false);
  const [teleprompterOpacity, setTeleprompterOpacity] = useState(85); // %

  const teleprompterRef = useRef<HTMLDivElement>(null);
  const isEn = getLang() === "en";

  // Teleprompter Auto-scroll effect
  useEffect(() => {
    let interval: any;
    if (teleprompterPlaying && teleprompterRef.current) {
      interval = setInterval(() => {
        if (teleprompterRef.current) {
          teleprompterRef.current.scrollTop += teleprompterSpeed * 0.8;
        }
      }, 30);
    }
    return () => clearInterval(interval);
  }, [teleprompterPlaying, teleprompterSpeed]);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode, 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        },
        audio: mode === "video",
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setActive(true);
    } catch (err) {
      toast.error(isEn ? "Camera access denied" : "تعذر الوصول إلى الكاميرا");
    }
  }, [facingMode, mode, isEn]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, startCamera]);

  const flipCamera = () => {
    playSfx("click");
    setFacingMode((f) => (f === "user" ? "environment" : "user"));
  };

  const toggleFlash = () => {
    playSfx("click");
    setFlash((prev) => {
      const next = !prev;
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        if (track && "applyConstraints" in track) {
          (track as any).applyConstraints({
            advanced: [{ torch: next }]
          }).catch(() => {});
        }
      }
      return next;
    });
  };

  const toggleScreenFlash = () => {
    playSfx("click");
    setScreenFlash(!screenFlash);
  };

  const togglePortraitMode = () => {
    playSfx("click");
    const next = !portraitMode;
    setPortraitMode(next);
    toast.success(
      next
        ? (isEn ? "Portrait Bokeh Mode Enabled" : "تم تفعيل عزل الخلفية بورتريه 🎭")
        : (isEn ? "Portrait Mode Disabled" : "تم إيقاف عزل الخلفية")
    );
  };

  const selectedFilterObj = CAMERA_FILTERS.find((f) => f.id === activeFilter) || CAMERA_FILTERS[0];

  // Combined CSS Filter expression
  const computedFilter = [
    selectedFilterObj.id !== "normal" ? selectedFilterObj.css : "",
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
  ].filter(Boolean).join(" ");

  const takePhoto = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 1080;
    c.height = v.videoHeight || 1920;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // Apply combined filters to canvas output
    if (computedFilter) {
      ctx.filter = computedFilter;
    }

    if (facingMode === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(v, 0, 0, c.width, c.height);

    // Apply Soft Portrait Depth Overlay on output image if portrait mode active
    if (portraitMode) {
      ctx.save();
      const gradient = ctx.createRadialGradient(
        c.width / 2, c.height / 2, c.width * 0.2,
        c.width / 2, c.height / 2, c.width * 0.7
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    }

    c.toBlob((blob) => {
      if (!blob) return;
      playSfx("success");
      const file = new File([blob], `vireon-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedUrl(URL.createObjectURL(blob));
      setCapturedFile(file);
    }, "image/jpeg", 0.95);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    playSfx("click");

    const mimeType = MediaRecorder.isTypeSupported("video/mp4") 
      ? "video/mp4" 
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    try {
      const mr = new MediaRecorder(streamRef.current, { mimeType });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `vireon-cam-${Date.now()}.${ext}`, { type: mimeType });
        setCapturedUrl(URL.createObjectURL(blob));
        setCapturedFile(file);
      };
      mr.start(1000);
      recorderRef.current = mr;
      setRecording(true);
      if (showTeleprompter) setTeleprompterPlaying(true);
    } catch (err) {
      toast.error(isEn ? "Failed to start recording" : "فشل بدء التسجيل");
    }
  };

  const stopRecording = () => {
    playSfx("click");
    recorderRef.current?.stop();
    setRecording(false);
    setTeleprompterPlaying(false);
  };

  const handleCaptureClick = () => {
    if (recording) {
      stopRecording();
      return;
    }

    if (timer > 0) {
      setCountdown(timer);
      let current = timer;
      const interval = setInterval(() => {
        current -= 1;
        if (current <= 0) {
          clearInterval(interval);
          setCountdown(null);
          if (mode === "photo") takePhoto();
          else startRecording();
        } else {
          setCountdown(current);
          playSfx("click");
        }
      }, 1000);
    } else {
      if (mode === "photo") takePhoto();
      else startRecording();
    }
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCapturedFile(file);
      setCapturedUrl(URL.createObjectURL(file));
    }
  };

  const handleUse = () => {
    if (capturedFile && onCaptured) {
      onCaptured(capturedFile);
    } else {
      toast.success(isEn ? "Media saved to project" : "تمت إضافة المقطع للمشروع");
    }
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
    a.download = capturedFile?.name || "vireon-capture";
    a.click();
    toast.success(isEn ? "Saved to downloads" : "تم التنزيل للجهاز");
  };

  // Preview captured media
  if (capturedUrl) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col justify-between p-4 select-none animate-in fade-in duration-200">
        <div className="flex items-center justify-between z-10 pt-2 px-2">
          <button
            onClick={handleDiscard}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-white text-xs font-bold bg-black/60 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
            {mode === "photo" ? (isEn ? "Photo Captured" : "صورة ملتقطة 📸") : (isEn ? "Video Recorded" : "فيديو مسجل 🎥")}
          </span>
          <button
            onClick={handleSave}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-95 transition-all"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>

        {/* Captured Media Display */}
        <div className="relative flex-1 flex items-center justify-center my-3 overflow-hidden rounded-2xl border border-white/10 bg-black">
          {mode === "photo" ? (
            <img src={capturedUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <video src={capturedUrl} controls autoPlay loop className="w-full h-full object-contain" />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pb-6 px-2">
          <button
            onClick={handleDiscard}
            className="flex-1 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-2 backdrop-blur-md transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            {isEn ? "Retake" : "إعادة التقاط"}
          </button>

          <button
            onClick={handleUse}
            className="flex-1 py-3.5 rounded-2xl gradient-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transition-all active:scale-95"
          >
            <Check className="w-5 h-5" />
            {isEn ? "Use in Editor" : "استخدام في التحرير"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black text-white flex flex-col justify-between select-none overflow-hidden" dir={isRTL() ? "rtl" : "ltr"}>
      <canvas ref={canvasRef} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*,video/*" className="hidden" onChange={handleGallerySelect} />

      {/* Screen Fill Soft Light Flash Overlay */}
      {screenFlash && (
        <div className="absolute inset-0 z-40 bg-white/90 backdrop-blur-none pointer-events-none animate-in fade-in duration-100" />
      )}

      {/* Main Viewfinder Box */}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-black overflow-hidden">
        {/* Background Bokeh Blur Layer for Portrait Mode */}
        {portraitMode && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none scale-110">
            <video
              src={(videoRef.current as any)?.srcObject}
              playsInline
              muted
              autoPlay
              style={{ filter: `blur(${portraitBlurAmount}px) brightness(0.7) ${computedFilter}` }}
              className={`w-full h-full object-cover transition-all ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
            />
          </div>
        )}

        {/* Foreground Camera Video Stream */}
        <div
          className={`relative transition-all overflow-hidden ${
            aspectRatio === "9:16"
              ? "w-full h-full"
              : aspectRatio === "1:1"
              ? "w-full aspect-square max-h-[80vh] rounded-3xl border border-white/20"
              : "w-full aspect-[4/3] max-h-[80vh] rounded-3xl border border-white/20"
          } ${portraitMode ? "z-10 shadow-2xl rounded-3xl border border-primary/40 max-w-[92vw] max-h-[85vh]" : ""}`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ filter: computedFilter }}
            className={`w-full h-full object-cover transition-all ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />

          {/* Portrait Vignette Focal Guide */}
          {portraitMode && (
            <div className="absolute inset-0 pointer-events-none border-2 border-primary/30 rounded-3xl flex items-center justify-center">
              <div className="px-3 py-1 rounded-full bg-primary/80 backdrop-blur-md text-[11px] font-bold text-white shadow-lg flex items-center gap-1.5 absolute top-4">
                <Focus className="w-3.5 h-3.5" />
                <span>{isEn ? "Portrait Depth Active" : "عزل خلفية بورتريه 🎭"}</span>
              </div>
            </div>
          )}

          {/* 3x3 Composition Grid */}
          {gridEnabled && (
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none z-10 border border-white/10">
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-white/15" />
              <div className="border-r border-white/15" />
              <div />
            </div>
          )}
        </div>

        {/* Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <span className="text-8xl font-extrabold text-primary animate-ping">
              {countdown}
            </span>
          </div>
        )}

        {/* Teleprompter Overlay (الملقن النصي المتقدم) */}
        {showTeleprompter && (
          <div
            style={{ backgroundColor: `rgba(0, 0, 0, ${teleprompterOpacity / 100})` }}
            className="absolute top-16 inset-x-4 z-30 max-w-lg mx-auto backdrop-blur-md border border-primary/40 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[40vh] transition-all"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/15 mb-2">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Type className="w-4 h-4" />
                {isEn ? "Teleprompter Script" : "الملقن النصي (تلقين الكلام)"}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsEditingTeleprompter(!isEditingTeleprompter)}
                  className="px-2.5 py-1 rounded-lg bg-white/15 text-[10px] font-bold text-white hover:bg-white/25"
                >
                  {isEditingTeleprompter ? (isEn ? "Done" : "تم") : (isEn ? "Edit Script" : "تعديل النص")}
                </button>

                <button
                  onClick={() => setTeleprompterMirrored(!teleprompterMirrored)}
                  className={`p-1.5 rounded-lg border text-xs ${
                    teleprompterMirrored ? "bg-primary border-primary text-white" : "bg-white/10 border-white/10 text-white/70"
                  }`}
                  title={isEn ? "Mirror Flip" : "عكس المرآة"}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setTeleprompterPlaying(!teleprompterPlaying)}
                  className="p-1.5 rounded-lg bg-primary text-white hover:opacity-90 active:scale-95"
                >
                  {teleprompterPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => setShowTeleprompter(false)}
                  className="p-1 rounded-lg bg-white/10 text-white/70 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Script Display or Edit Area */}
            {isEditingTeleprompter ? (
              <textarea
                value={teleprompterText}
                onChange={(e) => setTeleprompterText(e.target.value)}
                className="w-full flex-1 bg-white/5 border border-white/15 rounded-xl p-3 text-xs text-white resize-none focus:outline-none focus:border-primary"
                rows={5}
              />
            ) : (
              <div
                ref={teleprompterRef}
                style={{ fontSize: `${teleprompterFontSize}px` }}
                className={`flex-1 overflow-y-auto pr-2 text-white font-semibold leading-relaxed tracking-wide transition-all ${
                  teleprompterMirrored ? "scale-x-[-1]" : ""
                }`}
              >
                {teleprompterText.split("\n").map((line, idx) => (
                  <p key={idx} className="mb-3 text-center text-primary-foreground drop-shadow-md">
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Teleprompter Tuning Sliders */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-2 text-[10px] text-white/70 gap-2">
              <div className="flex items-center gap-1.5">
                <span>{isEn ? "Speed" : "السرعة"}:</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={teleprompterSpeed}
                  onChange={(e) => setTeleprompterSpeed(Number(e.target.value))}
                  className="w-16 accent-primary"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span>{isEn ? "Size" : "الحجم"}:</span>
                <input
                  type="range"
                  min="14"
                  max="36"
                  value={teleprompterFontSize}
                  onChange={(e) => setTeleprompterFontSize(Number(e.target.value))}
                  className="w-16 accent-primary"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span>{isEn ? "Opacity" : "الشفافية"}:</span>
                <input
                  type="range"
                  min="30"
                  max="100"
                  value={teleprompterOpacity}
                  onChange={(e) => setTeleprompterOpacity(Number(e.target.value))}
                  className="w-16 accent-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Header Bar Controls */}
      <div className="relative z-20 flex items-center justify-between p-4 pt-6 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-95 transition-all hover:bg-white/20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Recording Indicator Timer */}
        {recording && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-destructive/90 text-white font-bold text-xs backdrop-blur-md border border-destructive/50 animate-pulse shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span>{isEn ? "REC..." : "تسجيل جارٍ..."}</span>
          </div>
        )}

        {/* Top Tools Options */}
        <div className="flex items-center gap-2">
          {/* Torch/Flash */}
          <button
            onClick={toggleFlash}
            className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
              flash ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-black/50 border-white/15 text-white"
            }`}
            title={isEn ? "Flash Light" : "فلاش فلاش"}
          >
            {flash ? <Zap className="w-4 h-4 fill-amber-400" /> : <ZapOff className="w-4 h-4" />}
          </button>

          {/* Screen Light Flash */}
          <button
            onClick={toggleScreenFlash}
            className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
              screenFlash ? "bg-white text-black border-white" : "bg-black/50 border-white/15 text-white"
            }`}
            title={isEn ? "Soft Screen Flash" : "إضاءة الشاشة للسيلفي"}
          >
            <Sun className="w-4 h-4" />
          </button>

          {/* Timer Selector */}
          <button
            onClick={() => setTimer((t) => (t === 0 ? 3 : t === 3 ? 5 : t === 5 ? 10 : 0))}
            className={`px-2.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-bold flex items-center gap-1 transition-all ${
              timer > 0 ? "bg-primary/20 border-primary text-primary" : "bg-black/50 border-white/15 text-white"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{timer === 0 ? (isEn ? "Off" : "مؤقت") : `${timer}s`}</span>
          </button>

          {/* Teleprompter Button */}
          <button
            onClick={() => setShowTeleprompter(!showTeleprompter)}
            className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
              showTeleprompter ? "bg-primary border-primary text-white" : "bg-black/50 border-white/15 text-white"
            }`}
            title={isEn ? "Teleprompter" : "الملقن النصي"}
          >
            <Type className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right Floating Sidebar Camera Tools */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-3">
        {/* Portrait Mode Toggle (عزل خلفية بورتريه) */}
        <button
          onClick={togglePortraitMode}
          className={`w-11 h-11 rounded-full backdrop-blur-md border flex items-center justify-center transition-all shadow-lg ${
            portraitMode ? "bg-gradient-to-r from-purple-600 to-pink-600 border-primary text-white scale-110" : "bg-black/60 border-white/20 text-white hover:bg-white/20"
          }`}
          title={isEn ? "Portrait Bokeh Blur" : "عزل خلفية بورتريه"}
        >
          <Focus className="w-5 h-5" />
        </button>

        {/* Camera Adjustments (سطوع وتباعد) */}
        <button
          onClick={() => {
            setShowAdjustments(!showAdjustments);
            if (showFilters) setShowFilters(false);
          }}
          className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
            showAdjustments ? "bg-primary border-primary text-white" : "bg-black/60 border-white/20 text-white"
          }`}
          title={isEn ? "Color Adjustments" : "أدوات التعديل"}
        >
          <Sliders className="w-5 h-5" />
        </button>

        {/* Filter Toggle */}
        <button
          onClick={() => {
            setShowFilters(!showFilters);
            if (showAdjustments) setShowAdjustments(false);
          }}
          className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
            showFilters || activeFilter !== "normal" ? "bg-primary border-primary text-white" : "bg-black/60 border-white/20 text-white"
          }`}
          title={isEn ? "Filters" : "الفلاتر المباشرة"}
        >
          <Sparkles className="w-5 h-5" />
        </button>

        {/* Speed Selector */}
        <button
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 0.5 : 1))}
          className={`w-10 h-10 rounded-full backdrop-blur-md border text-xs font-bold flex items-center justify-center transition-all ${
            speed !== 1 ? "bg-primary border-primary text-white" : "bg-black/60 border-white/20 text-white"
          }`}
          title={isEn ? "Recording Speed" : "سرعة التسجيل"}
        >
          {speed}x
        </button>

        {/* Aspect Ratio Switcher */}
        <button
          onClick={() => setAspectRatio((r) => (r === "9:16" ? "1:1" : r === "1:1" ? "4:3" : "9:16"))}
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-extrabold flex items-center justify-center text-white active:scale-95 transition-all"
          title={isEn ? "Aspect Ratio" : "أبعاد الكاميرا"}
        >
          {aspectRatio}
        </button>

        {/* Grid Toggle */}
        <button
          onClick={() => setGridEnabled(!gridEnabled)}
          className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
            gridEnabled ? "bg-primary border-primary text-white" : "bg-black/60 border-white/20 text-white"
          }`}
          title={isEn ? "Grid Lines" : "شبكة التوجيه"}
        >
          <Grid className="w-5 h-5" />
        </button>

        {/* Flip Camera */}
        <button
          onClick={flipCamera}
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-95 transition-all hover:bg-white/20"
        >
          <SwitchCamera className="w-5 h-5" />
        </button>
      </div>

      {/* Camera Adjustments Drawer (أدوات التعديل المباشر) */}
      {showAdjustments && (
        <div className="relative z-20 px-4 py-3 bg-black/85 backdrop-blur-md border-t border-white/15 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-primary" />
              {isEn ? "Live Camera Adjustments" : "تعديل الإضاءة والألوان المباشرة"}
            </span>
            <button onClick={() => setShowAdjustments(false)} className="text-white/60 text-xs">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-white/80">
            {/* Brightness */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span>{isEn ? "Brightness" : "السطوع"}</span>
                <span className="text-primary font-mono">{brightness}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="140"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/20 rounded-lg cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span>{isEn ? "Contrast" : "التباين"}</span>
                <span className="text-primary font-mono">{contrast}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="140"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/20 rounded-lg cursor-pointer"
              />
            </div>

            {/* Saturation */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span>{isEn ? "Saturation" : "التشبع"}</span>
                <span className="text-primary font-mono">{saturation}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="180"
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/20 rounded-lg cursor-pointer"
              />
            </div>

            {/* Portrait Blur Amount if Portrait Active */}
            {portraitMode && (
              <div className="flex flex-col gap-1 sm:col-span-3 pt-2 border-t border-white/10">
                <div className="flex justify-between text-[11px] text-primary">
                  <span>{isEn ? "Portrait Blur Strength" : "قوة عزل خلفية البورتريه"}</span>
                  <span className="font-mono">{portraitBlurAmount}px</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="25"
                  value={portraitBlurAmount}
                  onChange={(e) => setPortraitBlurAmount(Number(e.target.value))}
                  className="w-full accent-purple-500 h-1.5 bg-white/20 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Filters Drawer */}
      {showFilters && (
        <div className="relative z-20 px-4 py-3 bg-black/85 backdrop-blur-md border-t border-white/15 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              {isEn ? "Camera Filters" : "فلاتر الكاميرا المباشرة"}
            </span>
            <button onClick={() => setShowFilters(false)} className="text-white/60 text-xs">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
            {CAMERA_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  playSfx("click");
                  setActiveFilter(f.id);
                }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeFilter === f.id
                    ? "gradient-primary border-primary text-white shadow-lg shadow-primary/30 scale-105"
                    : "bg-white/10 border-white/10 text-white/80 hover:bg-white/20"
                }`}
              >
                <span>{isEn ? f.nameEn : f.nameAr}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Control Shutter Bar */}
      <div className="relative z-20 pb-8 pt-4 px-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col items-center gap-4">
        {/* Photo / Video Mode Switcher */}
        <div className="flex items-center gap-2 p-1 rounded-full bg-black/60 border border-white/15 backdrop-blur-md">
          <button
            onClick={() => {
              playSfx("click");
              setMode("photo");
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              mode === "photo" ? "gradient-primary text-white shadow-md" : "text-white/70 hover:text-white"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{isEn ? "Photo" : "صورة"}</span>
          </button>
          <button
            onClick={() => {
              playSfx("click");
              setMode("video");
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              mode === "video" ? "gradient-primary text-white shadow-md" : "text-white/70 hover:text-white"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{isEn ? "Video" : "فيديو"}</span>
          </button>
        </div>

        {/* Capture Trigger Bar */}
        <div className="w-full flex items-center justify-between max-w-sm px-4">
          {/* Gallery Shortcut Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-95"
            title={isEn ? "Gallery" : "المعرض"}
          >
            <ImageIcon className="w-6 h-6" />
          </button>

          {/* Main Shutter Trigger Button */}
          <button
            onClick={handleCaptureClick}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              recording
                ? "border-4 border-destructive bg-destructive/20 animate-pulse"
                : mode === "photo"
                ? "border-4 border-white bg-white/20"
                : "border-4 border-primary bg-primary/20"
            }`}
          >
            {mode === "photo" ? (
              <div className="w-14 h-14 rounded-full bg-white shadow-lg" />
            ) : recording ? (
              <Square className="w-8 h-8 text-destructive fill-destructive" />
            ) : (
              <div className="w-14 h-14 rounded-full gradient-primary shadow-lg shadow-primary/40 flex items-center justify-center">
                <Circle className="w-8 h-8 text-white fill-white" />
              </div>
            )}
          </button>

          {/* Camera Flip Shortcut */}
          <button
            onClick={flipCamera}
            className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-95"
          >
            <SwitchCamera className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraScreen;
