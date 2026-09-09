import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  X,
  Type,
  Sliders,
  RotateCcw,
  Crop,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Smile,
  Trash2,
  ChevronUp,
  ChevronDown,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  Info,
  Eye,
  EyeOff,
  Palette,
  Bold,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Plus,
  Loader2,
  Maximize2
} from "lucide-react";
import { toast } from "sonner";
import { t, getLang } from "@/lib/i18n";
import { AIToolsPanel } from "@/components/editor/AIToolsPanel";
import { ImageAIToolsModal } from "@/components/imageAi/ImageAIToolsModal";
import PhotoExportDialog from "@/components/photo/PhotoExportDialog";

interface PhotoEditorScreenProps {
  onClose: () => void;
}

interface EditorLayer {
  id: string;
  type: "text" | "sticker" | "shape" | "image";
  text?: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
  shapeType?: "rect" | "circle" | "triangle" | "star";
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  url?: string; // For PIP image
  emoji?: string; // For emoji sticker
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  width?: number; // scale dimension for shapes/PIP
  height?: number; // scale dimension for shapes/PIP
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

const FILTERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "أصلي", css: "none" },
  { id: "warm", label: "دافئ", css: "saturate(1.4) sepia(0.25) contrast(1.05)" },
  { id: "cool", label: "بارد", css: "saturate(1.2) hue-rotate(-15deg) brightness(1.05)" },
  { id: "bw", label: "أبيض/أسود", css: "grayscale(1) contrast(1.1)" },
  { id: "vivid", label: "حيوي", css: "saturate(1.8) contrast(1.15)" },
  { id: "vintage", label: "قديم", css: "sepia(0.5) contrast(0.95) brightness(1.05)" },
  { id: "fade", label: "باهت", css: "contrast(0.85) brightness(1.1) saturate(0.8)" },
];

const FONTS = [
  { id: "Cairo", name: "Cairo (عصري)" },
  { id: "Tajawal", name: "Tajawal (ناعم)" },
  { id: "Almarai", name: "Almarai (مستدير)" },
  { id: "Amiri", name: "Amiri (نسخ كلاسيكي)" },
  { id: "Alexandria", name: "Alexandria (هندسي)" },
  { id: "Vibes", name: "Vibes (جمالي)" },
  { id: "Space Grotesk", name: "Space Grotesk (تقني)" },
  { id: "Bebas Neue", name: "Bebas Neue (عرضي عريض)" },
  { id: "Archivo Black", name: "Archivo Black (عريض جداً)" }
];

const PRESETS = [
  { id: "original", labelAr: "الأبعاد الأصلية", labelEn: "Original Size" },
  { id: "instagram-post", labelAr: "انستجرام مربع (1:1)", labelEn: "Instagram Square (1:1)" },
  { id: "instagram-story", labelAr: "قصة / ستوري (9:16)", labelEn: "Story / TikTok (9:16)" },
  { id: "youtube-hd", labelAr: "يوتيوب عرضي (16:9)", labelEn: "YouTube HD (16:9)" },
  { id: "custom", labelAr: "أبعاد مخصصة", labelEn: "Custom Dimensions" }
];

const COLOR_PRESETS = [
  { value: "#ffffff", label: "أبيض" },
  { value: "#000000", label: "أسود" },
  { value: "#ef4444", label: "أحمر" },
  { value: "#f97316", label: "برتقالي" },
  { value: "#eab308", label: "أصفر" },
  { value: "#22c55e", label: "أخضر" },
  { value: "#3b82f6", label: "أزرق" },
  { value: "#a855f7", label: "بنفسجي" },
  { value: "#ec4899", label: "وردي" },
  { value: "transparent", label: "شفاف" },
  { value: "rgba(0,0,0,0.5)", label: "أسود شفاف" },
  { value: "rgba(59,130,246,0.3)", label: "أزرق شفاف" }
];

const EMOJIS = ["🔥", "✨", "❤️", "👑", "💬", "🚀", "😂", "⚡", "🌟", "🎉", "💯", "💀", "🔔", "💡", "💎", "🍿", "🍀", "🎯", "🎨", "🎮", "🎵", "🔊"];

const PhotoEditorScreen = ({ onClose }: PhotoEditorScreenProps) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pipInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const [filter, setFilter] = useState("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [blurVal, setBlurVal] = useState(0);
  const [hueVal, setHueVal] = useState(0);

  const [tab, setTab] = useState<"crop" | "filters" | "adjust" | "vfx" | "text" | "stickers" | "layers" | "ai">("crop");
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Crop & Scale states
  const [cropRatio, setCropRatio] = useState<string>("free");
  const [targetRes, setTargetRes] = useState<string>("original");
  const [customWidth, setCustomWidth] = useState<number>(1080);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1); // 1.0 to 3.0
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // Original natural image size
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 1080, height: 1080 });

  // VFX States
  const [vfxType, setVfxType] = useState<string>("none");
  const [vfxIntensity, setVfxIntensity] = useState<number>(50);

  // Layers states
  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const en = getLang() === "en";

  const filterCss = `${FILTERS.find((f) => f.id === filter)?.css === "none" ? "" : FILTERS.find((f) => f.id === filter)?.css} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blurVal}px) hue-rotate(${hueVal}deg)`;

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    // Reset editing attributes
    setFilter("none");
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setBlurVal(0);
    setHueVal(0);
    setCropRatio("free");
    setTargetRes("original");
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setVfxType("none");
    setLayers([]);
    setSelectedLayerId(null);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setCustomWidth(naturalWidth);
    setCustomHeight(naturalHeight);
  };

  const resetAll = () => {
    setFilter("none");
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setBlurVal(0);
    setHueVal(0);
    setCropRatio("free");
    setTargetRes("original");
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setVfxType("none");
    setLayers([]);
    setSelectedLayerId(null);
    toast.success(en ? "Reset completed" : "تمت إعادة تعيين الصورة");
  };

  // Layers utilities
  const updateLayer = (id: string, updates: Partial<EditorLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const deleteLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
    toast.success(en ? "Layer removed" : "تم حذف الطبقة");
  };

  const moveLayerOrder = (id: string, direction: "up" | "down") => {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const newLayers = [...layers];
    if (direction === "up" && idx < layers.length - 1) {
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx + 1];
      newLayers[idx + 1] = temp;
      setLayers(newLayers);
    } else if (direction === "down" && idx > 0) {
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx - 1];
      newLayers[idx - 1] = temp;
      setLayers(newLayers);
    }
  };

  const addTextLayer = () => {
    const newLayer: EditorLayer = {
      id: `text-${Date.now()}`,
      type: "text",
      text: en ? "Double click to edit" : "انقر مرتين للتعديل",
      x: 50,
      y: 50,
      fontSize: 24,
      color: "#ffffff",
      bgColor: "rgba(0,0,0,0.5)",
      fontFamily: "Cairo",
      fontWeight: "bold",
      textAlign: "center",
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    setTab("text");
    toast.success(en ? "Text layer added" : "تمت إضافة طبقة النص");
  };

  const addStickerLayer = (emoji: string) => {
    const newLayer: EditorLayer = {
      id: `sticker-${Date.now()}`,
      type: "sticker",
      emoji: emoji,
      x: 50,
      y: 50,
      fontSize: 48,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    toast.success(en ? "Sticker added" : "تمت إضافة الملصق");
  };

  const handleAddPipImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const newLayer: EditorLayer = {
      id: `image-${Date.now()}`,
      type: "image",
      url: url,
      x: 50,
      y: 50,
      width: 25,
      height: 25,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    e.target.value = "";
    toast.success(en ? "PIP image overlay added" : "تمت إضافة صورة التراكب");
  };

  const addShapeLayer = (shapeType: "rect" | "circle" | "triangle" | "star") => {
    const newLayer: EditorLayer = {
      id: `shape-${Date.now()}`,
      type: "shape",
      shapeType: shapeType,
      x: 50,
      y: 50,
      width: 20,
      height: 20,
      fillColor: "rgba(59, 130, 246, 0.4)",
      strokeColor: "#ffffff",
      strokeWidth: 2,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    toast.success(en ? "Shape overlay added" : "تمت إضافة الشكل الهندسي");
  };

  // Unified Mouse / Touch Dragging Handler for base image (panning)
  const handleContainerDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (tab !== "crop") return;
    // Don't pan if clicking directly on handles or button
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest(".handle")) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;
    const startPanX = panX;
    const startPanY = panY;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const moveX = "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = "touches" in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = moveX - startX;
      const dy = moveY - startY;

      setPanX(startPanX + dx);
      setPanY(startPanY + dy);
    };

    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
  };

  // Unified Mouse / Touch Dragging Handler for active layers
  const handleLayerDragStart = (e: React.MouseEvent | React.TouchEvent, layerId: string) => {
    e.stopPropagation();
    setSelectedLayerId(layerId);
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;
    const startLayerX = layer.x;
    const startLayerY = layer.y;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const container = previewContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      const moveX = "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = "touches" in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = moveX - startX;
      const dy = moveY - startY;

      // Convert delta to percentages
      const pctX = (dx / rect.width) * 100;
      const pctY = (dy / rect.height) * 100;

      setLayers((prev) =>
        prev.map((l) => {
          if (l.id === layerId) {
            return {
              ...l,
              x: Math.min(100, Math.max(0, startLayerX + pctX)),
              y: Math.min(100, Math.max(0, startLayerY + pctY)),
            };
          }
          return l;
        })
      );
    };

    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
  };

  // Image loading helper for Canvas export
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const imgObj = new Image();
      imgObj.crossOrigin = "anonymous";
      imgObj.src = url;
      imgObj.onload = () => resolve(imgObj);
      imgObj.onerror = (err) => reject(err);
    });
  };

  // High quality Export
  const exportImage = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setExporting(true);

    try {
      // Determine final canvas resolution
      let exportW = naturalSize.width;
      let exportH = naturalSize.height;

      if (targetRes === "instagram-post") {
        exportW = 1080;
        exportH = 1080;
      } else if (targetRes === "instagram-story") {
        exportW = 1080;
        exportH = 1920;
      } else if (targetRes === "youtube-hd") {
        exportW = 1920;
        exportH = 1080;
      } else if (targetRes === "custom") {
        exportW = customWidth;
        exportH = customHeight;
      } else if (cropRatio !== "free") {
        // Respect aspect ratio if set to preset and using "original" size
        const ratioParts = cropRatio.split(":");
        const ratioVal = Number(ratioParts[0]) / Number(ratioParts[1]);
        if (exportW / exportH > ratioVal) {
          exportW = Math.round(exportH * ratioVal);
        } else {
          exportH = Math.round(exportW / ratioVal);
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = exportW;
      canvas.height = exportH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");

      // Draw background color (fill with black to look professional)
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, exportW, exportH);

      // Save context to apply filters and transformations to base image
      ctx.save();

      // Set CSS filters equivalent on context
      const filterParts = [
        FILTERS.find((f) => f.id === filter)?.css !== "none" ? FILTERS.find((f) => f.id === filter)?.css : "",
        `brightness(${brightness}%)`,
        `contrast(${contrast}%)`,
        `saturate(${saturate}%)`,
        blurVal > 0 ? `blur(${blurVal}px)` : "",
        hueVal > 0 ? `hue-rotate(${hueVal}deg)` : ""
      ].filter(Boolean).join(" ");
      ctx.filter = filterParts || "none";

      // Translate to center to rotate/scale/flip/pan correctly
      ctx.translate(exportW / 2, exportH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

      // Replicate cover/fit styling
      const sX = exportW / img.naturalWidth;
      const sY = exportH / img.naturalHeight;
      const fitScale = cropRatio === "free" ? Math.min(sX, sY) : Math.max(sX, sY);
      const drawScale = fitScale * zoom;

      const dw = img.naturalWidth * drawScale;
      const dh = img.naturalHeight * drawScale;

      // Transform pan from preview width to canvas width
      const previewW = previewContainerRef.current?.getBoundingClientRect().width || 450;
      const scaleFactor = exportW / previewW;
      const cx = panX * scaleFactor;
      const cy = panY * scaleFactor;

      ctx.drawImage(img, -dw / 2 + cx, -dh / 2 + cy, dw, dh);
      ctx.restore();

      // Draw Visual Effects (VFX)
      if (vfxType === "vignette") {
        ctx.save();
        const grad = ctx.createRadialGradient(
          exportW / 2, exportH / 2, exportW * 0.25,
          exportW / 2, exportH / 2, exportW * 0.7
        );
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, `rgba(0,0,0,${vfxIntensity / 100})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, exportW, exportH);
        ctx.restore();
      } else if (vfxType === "light-leak") {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = vfxIntensity / 100;
        const grad = ctx.createLinearGradient(0, 0, exportW * 0.8, exportH * 0.8);
        grad.addColorStop(0, "rgba(255, 120, 50, 0.4)");
        grad.addColorStop(0.5, "rgba(255, 200, 80, 0.2)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, exportW, exportH);
        ctx.restore();
      } else if (vfxType === "film-grain") {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        const grainCount = Math.floor(exportW * exportH * 0.04 * (vfxIntensity / 100));
        for (let i = 0; i < grainCount; i++) {
          const gx = Math.random() * exportW;
          const gy = Math.random() * exportH;
          const gSize = Math.random() * (exportW / 500) + 1;
          ctx.fillRect(gx, gy, gSize, gSize);
        }
        ctx.restore();
      } else if (vfxType === "neon-glow") {
        ctx.save();
        ctx.globalCompositeOperation = "color-dodge";
        ctx.fillStyle = `rgba(59, 130, 246, ${vfxIntensity / 250})`;
        ctx.fillRect(0, 0, exportW, exportH);
        ctx.restore();
      }

      // Draw active layers on top
      for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity;

        // Position coordinates mapped to high resolution canvas
        const lx = (layer.x / 100) * exportW;
        const ly = (layer.y / 100) * exportH;

        ctx.translate(lx, ly);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.scale(layer.scale, layer.scale);

        if (layer.type === "text") {
          const drawFontSize = (layer.fontSize || 20) * scaleFactor;
          ctx.font = `${layer.fontWeight || "bold"} ${drawFontSize}px "${layer.fontFamily || "Cairo"}"`;
          ctx.textAlign = layer.textAlign || "center";
          ctx.textBaseline = "middle";

          const lines = (layer.text || "").split("\n");
          let yOffset = 0;

          for (const line of lines) {
            const metrics = ctx.measureText(line);
            const textW = metrics.width;
            const textH = drawFontSize;

            // Background box render
            if (layer.bgColor && layer.bgColor !== "transparent") {
              ctx.fillStyle = layer.bgColor;
              let rx = -textW / 2 - 12 * scaleFactor;
              if (layer.textAlign === "left") rx = -12 * scaleFactor;
              else if (layer.textAlign === "right") rx = -textW - 12 * scaleFactor;
              const ry = yOffset - textH / 2 - 6 * scaleFactor;
              const rw = textW + 24 * scaleFactor;
              const rh = textH + 12 * scaleFactor;
              ctx.fillRect(rx, ry, rw, rh);
            }

            // Text Stroke (shadow outline)
            ctx.strokeStyle = "rgba(0,0,0,0.85)";
            ctx.lineWidth = Math.max(2, 4 * scaleFactor);
            ctx.strokeText(line, 0, yOffset);

            // Text Fill
            ctx.fillStyle = layer.color || "#ffffff";
            ctx.fillText(line, 0, yOffset);

            yOffset += drawFontSize + 6;
          }
        } else if (layer.type === "sticker") {
          const drawStickerSize = (layer.fontSize || 40) * scaleFactor;
          ctx.font = `${drawStickerSize}px Cairo, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(layer.emoji || "✨", 0, 0);
        } else if (layer.type === "image" && layer.url) {
          try {
            const pipImg = await loadImage(layer.url);
            const dw = (layer.width || 25) * 10 * scaleFactor;
            const dh = (layer.height || 25) * 10 * scaleFactor;
            ctx.drawImage(pipImg, -dw / 2, -dh / 2, dw, dh);
          } catch (err) {
            console.error("PIP image loading failed during canvas drawing:", err);
          }
        } else if (layer.type === "shape") {
          const sw = (layer.width || 20) * 10 * scaleFactor;
          const sh = (layer.height || 20) * 10 * scaleFactor;
          ctx.fillStyle = layer.fillColor || "rgba(59, 130, 246, 0.4)";
          ctx.strokeStyle = layer.strokeColor || "#ffffff";
          ctx.lineWidth = (layer.strokeWidth || 2) * scaleFactor;

          if (layer.shapeType === "rect") {
            ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
            ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
          } else if (layer.shapeType === "circle") {
            ctx.beginPath();
            ctx.arc(0, 0, sw / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (layer.shapeType === "triangle") {
            ctx.beginPath();
            ctx.moveTo(0, -sh / 2);
            ctx.lineTo(sw / 2, sh / 2);
            ctx.lineTo(-sw / 2, sh / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (layer.shapeType === "star") {
            ctx.beginPath();
            const spikes = 5;
            const outerRadius = sw / 2;
            const innerRadius = sw / 4;
            let rot = (Math.PI / 2) * 3;
            let cx = 0, cy = 0;
            const step = Math.PI / spikes;
            ctx.moveTo(0, -outerRadius);
            for (let i = 0; i < spikes; i++) {
              cx = Math.cos(rot) * outerRadius;
              cy = Math.sin(rot) * outerRadius;
              ctx.lineTo(cx, cy);
              rot += step;
              cx = Math.cos(rot) * innerRadius;
              cy = Math.sin(rot) * innerRadius;
              ctx.lineTo(cx, cy);
              rot += step;
            }
            ctx.lineTo(0, -outerRadius);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      canvas.toBlob(
        (blob) => {
          setExporting(false);
          if (!blob) return;
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = `vireon-photo-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(downloadUrl);
          toast.success(en ? "High Quality photo exported successfully!" : "تم تصدير الصورة بجودة عالية بنجاح!");
        },
        "image/png",
        1.0
      );
    } catch (err) {
      setExporting(false);
      console.error(err);
      toast.error(en ? "Failed to export photo" : "فشل تصدير الصورة");
    }
  }, [
    filter,
    brightness,
    contrast,
    saturate,
    blurVal,
    hueVal,
    naturalSize,
    targetRes,
    cropRatio,
    customWidth,
    customHeight,
    rotation,
    flipH,
    flipV,
    zoom,
    panX,
    panY,
    vfxType,
    vfxIntensity,
    layers,
    en
  ]);

  // Selected layer reference for the settings tab
  const activeLayer = layers.find((l) => l.id === selectedLayerId);

  return (
    <div className="dark fixed inset-0 z-[60] bg-[#0c0f16] flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#131924] border-b border-white/5 shadow-md">
        <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-transform">
          <X className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="font-heading font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 text-base md:text-lg">
            {en ? "Advanced Photo Editor" : "محرر الصور المطور Pro"}
          </h1>
          {imgUrl && (
            <span className="text-[9px] text-muted-foreground">
              {naturalSize.width} × {naturalSize.height} PX
            </span>
          )}
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          disabled={!imgUrl}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs md:text-sm font-black shadow-lg shadow-blue-500/20 active:scale-95 transition-transform disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          {en ? "Full Export" : "تصدير كامل"}
        </button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative bg-[#090b10] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]">
        {imgUrl ? (
          <div
            ref={previewContainerRef}
            onMouseDown={handleContainerDragStart}
            onTouchStart={handleContainerDragStart}
            className="relative max-w-full max-h-[50vh] bg-black/90 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 border border-white/10"
            style={{
              aspectRatio:
                cropRatio === "1:1"
                  ? "1/1"
                  : cropRatio === "9:16"
                  ? "9/16"
                  : cropRatio === "16:9"
                  ? "16/9"
                  : cropRatio === "4:3"
                  ? "4/3"
                  : cropRatio === "3:2"
                  ? "3/2"
                  : undefined
            }}
          >
            {/* Base Image */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt="edit"
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
              className={`max-w-full max-h-[50vh] transition-all duration-150 select-none pointer-events-none ${
                cropRatio === "free" ? "object-contain" : "w-full h-full object-cover"
              }`}
              style={{ filter: filterCss, transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1}) translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: "center center" }}
            />

            {/* Aesthetic VFX Overlays */}
            {vfxType === "vignette" && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(circle, transparent 40%, rgba(0,0,0,${vfxIntensity / 100}) 100%)`
                }}
              />
            )}
            {vfxType === "light-leak" && (
              <div
                className="absolute inset-0 pointer-events-none mix-blend-screen"
                style={{
                  background: "linear-gradient(135deg, rgba(255,100,50,0.3) 0%, transparent 60%, rgba(255,200,50,0.2) 100%)",
                  opacity: vfxIntensity / 100
                }}
              />
            )}
            {vfxType === "film-grain" && (
              <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
              />
            )}
            {vfxType === "neon-glow" && (
              <div
                className="absolute inset-0 pointer-events-none mix-blend-color-dodge bg-blue-500"
                style={{
                  opacity: vfxIntensity / 250
                }}
              />
            )}

            {/* Layers Rendering */}
            {layers.map((layer) => {
              if (!layer.visible) return null;
              const isSelected = layer.id === selectedLayerId;

              return (
                <div
                  key={layer.id}
                  onMouseDown={(e) => handleLayerDragStart(e, layer.id)}
                  onTouchStart={(e) => handleLayerDragStart(e, layer.id)}
                  className={`absolute cursor-move select-none group touch-none ${
                    isSelected ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-black z-50 rounded" : "hover:ring-1 hover:ring-white/40 z-40 rounded"
                  }`}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                    opacity: layer.opacity,
                    transformOrigin: "center center"
                  }}
                >
                  {/* Selected Layer Quick Control HUD */}
                  {isSelected && (
                    <div className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/90 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-xl shadow-xl z-[100]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLayer(layer.id);
                        }}
                        className="p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 active:scale-90 transition-transform"
                        title={en ? "Delete" : "حذف"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayer(layer.id, { visible: false });
                        }}
                        className="p-1 rounded-lg bg-white/5 text-gray-300 hover:bg-white/15 active:scale-90 transition-transform"
                        title={en ? "Hide" : "إخفاء"}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-[1px] h-3 bg-white/10" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayer(layer.id, { rotation: (layer.rotation + 45) % 360 });
                        }}
                        className="p-1 rounded-lg bg-white/5 text-gray-300 hover:bg-white/15 active:scale-90 transition-transform"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Layer Content */}
                  {layer.type === "text" && (
                    <div
                      className="whitespace-nowrap px-4 py-2 rounded-xl text-center cursor-move font-heading"
                      style={{
                        fontFamily: layer.fontFamily || "Cairo",
                        fontWeight: layer.fontWeight || "bold",
                        fontSize: `${layer.fontSize || 22}px`,
                        color: layer.color || "#ffffff",
                        backgroundColor: layer.bgColor || "transparent",
                        textAlign: layer.textAlign || "center",
                        textShadow: "1px 1px 3px rgba(0,0,0,0.85)"
                      }}
                      onDoubleClick={() => {
                        const newTxt = prompt(en ? "Edit Text content:" : "تعديل محتوى النص:", layer.text);
                        if (newTxt !== null) updateLayer(layer.id, { text: newTxt });
                      }}
                    >
                      {layer.text}
                    </div>
                  )}

                  {layer.type === "sticker" && (
                    <span className="text-center select-none" style={{ fontSize: `${layer.fontSize || 42}px` }}>
                      {layer.emoji}
                    </span>
                  )}

                  {layer.type === "image" && layer.url && (
                    <img
                      src={layer.url}
                      alt="PIP Overlay"
                      className="object-contain select-none pointer-events-none rounded-lg shadow-lg"
                      style={{
                        width: `${(layer.width || 25) * 10}px`,
                        height: `${(layer.height || 25) * 10}px`
                      }}
                    />
                  )}

                  {layer.type === "shape" && (
                    <div
                      style={{
                        width: `${(layer.width || 20) * 10}px`,
                        height: `${(layer.height || 20) * 10}px`
                      }}
                    >
                      {layer.shapeType === "rect" && (
                        <div
                          className="w-full h-full rounded shadow"
                          style={{
                            backgroundColor: layer.fillColor,
                            borderColor: layer.strokeColor,
                            borderWidth: `${layer.strokeWidth || 2}px`
                          }}
                        />
                      )}
                      {layer.shapeType === "circle" && (
                        <div
                          className="w-full h-full rounded-full shadow"
                          style={{
                            backgroundColor: layer.fillColor,
                            borderColor: layer.strokeColor,
                            borderWidth: `${layer.strokeWidth || 2}px`
                          }}
                        />
                      )}
                      {layer.shapeType === "triangle" && (
                        <svg className="w-full h-full drop-shadow" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polygon
                            points="50,5 95,95 5,95"
                            fill={layer.fillColor}
                            stroke={layer.strokeColor}
                            strokeWidth={layer.strokeWidth}
                          />
                        </svg>
                      )}
                      {layer.shapeType === "star" && (
                        <svg className="w-full h-full drop-shadow" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polygon
                            points="50,2 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36"
                            fill={layer.fillColor}
                            stroke={layer.strokeColor}
                            strokeWidth={layer.strokeWidth}
                          />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-4 text-muted-foreground p-8 rounded-3xl bg-[#131924]/60 border border-white/5 hover:border-blue-500/20 active:scale-95 transition-all duration-300 shadow-xl"
          >
            <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-tr from-blue-600/20 to-purple-600/20 flex items-center justify-center border border-blue-500/10 shadow-inner">
              <Upload className="w-12 h-12 text-blue-400" />
            </div>
            <div className="text-center">
              <span className="text-base font-bold text-foreground block mb-1">
                {en ? "Upload Photo to Edit" : "اضغط لرفع صورة والبدء في تعديلها"}
              </span>
              <span className="text-xs text-muted-foreground/80 block">
                {en ? "Supports JPG, PNG, WEBP high-res images" : "يدعم الصور بدقة عالية بصيغ JPG, PNG, WEBP"}
              </span>
            </div>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      </div>

      {/* Editor Controls Interface */}
      {imgUrl && (
        <div className="border-t border-white/5 bg-[#131924] shadow-2xl relative z-10">
          {/* Main Controls Tabs Bar */}
          <div className="flex items-center justify-around py-2 border-b border-white/5 overflow-x-auto no-scrollbar scroll-smooth px-3 bg-[#0d121c]">
            {[
              { id: "ai", icon: Sparkles, label: en ? "AI Tools" : "أدوات AI" },
              { id: "crop", icon: Crop, label: en ? "Size & Crop" : "القص والأبعاد" },
              { id: "filters", icon: Sliders, label: en ? "Filters" : "الفلاتر السينمائية" },
              { id: "adjust", icon: Sliders, label: en ? "Tune Color" : "الضبط والحرارة" },
              { id: "vfx", icon: Sparkles, label: en ? "Visual VFX" : "المؤثرات البصرية" },
              { id: "text", icon: Type, label: en ? "Texts" : "إضافة نصوص" },
              { id: "stickers", icon: Smile, label: en ? "PIP & Stickers" : "ملصقات وتراكب" },
              { id: "layers", icon: Layers, label: en ? "Layers" : "إدارة الطبقات" }
            ].map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id as any)}
                className={`flex flex-col items-center gap-1 px-3.5 py-1.5 text-[10px] md:text-xs font-bold shrink-0 transition-all rounded-xl ${
                  tab === tb.id ? "text-blue-400 bg-blue-500/10 scale-105 shadow-inner" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tb.icon className="w-4 h-4" />
                {tb.label}
              </button>
            ))}
            <button
              onClick={resetAll}
              className="flex flex-col items-center gap-1 px-3.5 py-1.5 text-[10px] md:text-xs font-bold text-red-400/80 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              {en ? "Reset" : "إعادة ضبط"}
            </button>
          </div>

          {/* Sub Panels Container */}
          <div className="p-4 max-h-[35vh] md:max-h-[30vh] overflow-y-auto no-scrollbar bg-[#131924]">
            {/* CROP AND DIMENSIONS PANEL */}
            {tab === "crop" && (
              <div className="space-y-4">
                {/* Aspect Ratio selector */}
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Crop className="w-3.5 h-3.5" />
                    {en ? "Aspect Ratio Preview" : "تحديد نسبة وقص الصورة"}
                  </p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {[
                      { id: "free", label: en ? "Free" : "حرّ" },
                      { id: "1:1", label: "1:1 مربع" },
                      { id: "9:16", label: "9:16 ستوري" },
                      { id: "16:9", label: "16:9 عرضي" },
                      { id: "4:3", label: "4:3 تصوير" },
                      { id: "3:2", label: "3:2 كلاسيك" }
                    ].map((ratio) => (
                      <button
                        key={ratio.id}
                        onClick={() => setCropRatio(ratio.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 transition-all ${
                          cropRatio === ratio.id ? "gradient-primary text-primary-foreground scale-105 shadow" : "bg-[#1d2636] hover:bg-[#253147] text-foreground"
                        }`}
                      >
                        {ratio.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export Resolution Settings (تحكم في قياسات الصورة وتصدير كامل) */}
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" />
                    {en ? "Export Size Preset" : "تحكم في أبعاد وقياس الصورة عند التصدير"}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setTargetRes(p.id)}
                        className={`p-2 rounded-xl text-xs font-bold transition-all text-right border ${
                          targetRes === p.id ? "bg-blue-600/15 border-blue-500 text-blue-400" : "bg-[#1d2636] border-transparent text-foreground/80 hover:border-white/10"
                        }`}
                      >
                        {en ? p.labelEn : p.labelAr}
                      </button>
                    ))}
                  </div>

                  {targetRes === "custom" && (
                    <div className="flex gap-3 mt-3 bg-[#1d2636] p-3 rounded-2xl border border-white/5 items-center">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Width (px)" : "العرض بالبكسل"}</label>
                        <input
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(Math.max(10, Number(e.target.value)))}
                          className="w-full bg-[#131924] text-foreground border border-white/10 rounded-xl px-3 py-1.5 text-xs text-center focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="text-muted-foreground text-xs font-bold self-end pb-2">×</div>
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Height (px)" : "الارتفاع بالبكسل"}</label>
                        <input
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(Math.max(10, Number(e.target.value)))}
                          className="w-full bg-[#131924] text-foreground border border-white/10 rounded-xl px-3 py-1.5 text-xs text-center focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Base Image Transformations */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-white/5 pt-3">
                  <button
                    onClick={() => setRotation((prev) => (prev + 90) % 360)}
                    className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-[#1d2636] hover:bg-[#253147] text-xs font-bold text-foreground"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                    {en ? "Rotate 90°" : "تدوير 90 درجة"}
                  </button>
                  <button
                    onClick={() => setFlipH(!flipH)}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold ${
                      flipH ? "bg-blue-600/20 border border-blue-500/30 text-blue-400" : "bg-[#1d2636] text-foreground"
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    {en ? "Flip H" : "قلب أفقي"}
                  </button>
                  <button
                    onClick={() => setFlipV(!flipV)}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold ${
                      flipV ? "bg-blue-600/20 border border-blue-500/30 text-blue-400" : "bg-[#1d2636] text-foreground"
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    {en ? "Flip V" : "قلب عمودي"}
                  </button>
                  <div className="flex items-center gap-1 bg-[#1d2636] p-1.5 rounded-xl col-span-2 md:col-span-1">
                    <span className="text-[10px] text-muted-foreground shrink-0 font-bold px-1">{en ? "Zoom" : "تكبير"}</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] font-bold text-blue-400 min-w-8 text-center">{zoom.toFixed(1)}x</span>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 bg-blue-500/5 p-2.5 rounded-xl border border-blue-500/10">
                  <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{en ? "Tip: You can drag directly on the base photo image above to pan and crop your frame" : "تلميح: يمكنك سحب الصورة الأصلية بإصبعك أو بالفأرة مباشرة في نافذة العرض لتعديل موقع القص والتركيز."}</span>
                </div>
              </div>
            )}

            {/* CINEMATIC FILTERS PANEL */}
            {tab === "filters" && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground mb-2">{en ? "Cinematic LUT Presets" : "اختر فلتر سينمائي كلاسيكي جاهز"}</p>
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      className={`flex flex-col items-center gap-1 shrink-0 ${
                        filter === f.id ? "text-blue-400" : "text-muted-foreground"
                      }`}
                    >
                      <div
                        className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                          filter === f.id ? "border-blue-400 scale-105 shadow-md" : "border-transparent opacity-80 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={imgUrl}
                          alt={f.label}
                          className="w-full h-full object-cover"
                          style={{ filter: f.css === "none" ? "none" : f.css }}
                        />
                      </div>
                      <span className="text-[10px] font-extrabold">{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* COLOR TUNE / ADJUST PANEL */}
            {tab === "adjust" && (
              <div className="space-y-3">
                {[
                  { label: en ? "Brightness" : "السطوع والاضاءة", value: brightness, set: setBrightness, min: 50, max: 150 },
                  { label: en ? "Contrast" : "التباين والحدة", value: contrast, set: setContrast, min: 50, max: 150 },
                  { label: en ? "Saturation" : "التشبع اللوني", value: saturate, set: setSaturate, min: 0, max: 200 },
                  { label: en ? "Gaussian Blur" : "تأثير التغبيش والضبابية", value: blurVal, set: setBlurVal, min: 0, max: 10 },
                  { label: en ? "Hue shift" : "تدرج درجات الألوان (Hue)", value: hueVal, set: setHueVal, min: 0, max: 360 }
                ].map((s) => (
                  <div key={s.label} className="bg-[#1d2636] p-2.5 rounded-xl border border-white/5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-bold">
                      <span>{s.label}</span>
                      <span className="text-blue-400">{s.value}%</span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      value={s.value}
                      onChange={(e) => s.set(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ARTISTIC VISUAL EFFECTS PANEL (VFX) */}
            {tab === "vfx" && (
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-muted-foreground mb-1">{en ? "Visual Effects Overlays" : "تراكبات مؤثرات بصرية مدمجة"}</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { id: "none", labelAr: "بدون مؤثر", labelEn: "No VFX", icon: X },
                    { id: "vignette", labelAr: "تعتيم أطراف (Vignette)", labelEn: "Vignette", icon: Sparkles },
                    { id: "light-leak", labelAr: "تسريب ضوء دافئ", labelEn: "Light Leak", icon: Sparkles },
                    { id: "film-grain", labelAr: "حبيبات سينمائية", labelEn: "Vintage Grain", icon: Sparkles },
                    { id: "neon-glow", labelAr: "توهج أزرق نيون", labelEn: "Neon Glow", icon: Sparkles }
                  ].map((fx) => (
                    <button
                      key={fx.id}
                      onClick={() => setVfxType(fx.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                        vfxType === fx.id ? "bg-blue-600/15 border-blue-500 text-blue-400" : "bg-[#1d2636] border-transparent text-foreground hover:bg-[#253147]"
                      }`}
                    >
                      {en ? fx.labelEn : fx.labelAr}
                    </button>
                  ))}
                </div>

                {vfxType !== "none" && (
                  <div className="bg-[#1d2636] p-3 rounded-2xl border border-white/5 mt-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-bold">
                      <span>{en ? "VFX Intensity" : "قوة وقوة المؤثر البصري"}</span>
                      <span className="text-blue-400">{vfxIntensity}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={vfxIntensity}
                      onChange={(e) => setVfxIntensity(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* TEXT LAYERS ADD / EDIT PANEL (تحكم في كتابة على صورة) */}
            {tab === "text" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-muted-foreground">{en ? "Double click text layer in preview to edit text content" : "تحكم كامل في الكتابة على الصورة وتنسيقها"}</p>
                  <button
                    onClick={addTextLayer}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold active:scale-95 transition-transform"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {en ? "Add New Text" : "إضافة نص جديد"}
                  </button>
                </div>

                {activeLayer && activeLayer.type === "text" ? (
                  <div className="bg-[#1d2636] p-3 rounded-2xl border border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-blue-400 mb-1">{en ? "Active Text Styling" : "خصائص النص المحدّد حالياً"}</p>
                    
                    {/* Text Field Content */}
                    <div>
                      <input
                        type="text"
                        value={activeLayer.text}
                        onChange={(e) => updateLayer(activeLayer.id, { text: e.target.value })}
                        placeholder={en ? "Type text..." : "اكتب النص هنا..."}
                        className="w-full bg-[#131924] border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Font Selection */}
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Font Family" : "نوع ونمط الخط العربي والانجليزي"}</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-24 overflow-y-auto no-scrollbar bg-[#131924] p-1.5 rounded-xl border border-white/5">
                        {FONTS.map((font) => (
                          <button
                            key={font.id}
                            onClick={() => updateLayer(activeLayer.id, { fontFamily: font.id })}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-right transition-all truncate ${
                              activeLayer.fontFamily === font.id ? "bg-blue-600 text-white shadow" : "hover:bg-white/5 text-foreground/80"
                            }`}
                            style={{ fontFamily: font.id }}
                          >
                            {font.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Slider Font Size & Opacity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-bold">
                          <span>{en ? "Font Size" : "حجم الخط"}</span>
                          <span className="text-blue-400">{activeLayer.fontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min={12}
                          max={100}
                          value={activeLayer.fontSize}
                          onChange={(e) => updateLayer(activeLayer.id, { fontSize: Number(e.target.value) })}
                          className="w-full accent-blue-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-bold">
                          <span>{en ? "Text Opacity" : "شفافية النص"}</span>
                          <span className="text-blue-400">{Math.round(activeLayer.opacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={activeLayer.opacity}
                          onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                          className="w-full accent-blue-500"
                        />
                      </div>
                    </div>

                    {/* Color Presets */}
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Text Color" : "لون النص"}</label>
                      <div className="flex flex-wrap gap-1.5 bg-[#131924] p-1.5 rounded-xl border border-white/5">
                        {COLOR_PRESETS.filter(c => c.value !== "transparent").map((c) => (
                          <button
                            key={c.value}
                            onClick={() => updateLayer(activeLayer.id, { color: c.value })}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              activeLayer.color === c.value ? "border-blue-400 scale-110 shadow" : "border-transparent"
                            }`}
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                          />
                        ))}
                        {/* Custom Hex input */}
                        <input 
                          type="color" 
                          value={activeLayer.color?.startsWith("#") ? activeLayer.color : "#ffffff"} 
                          onChange={(e) => updateLayer(activeLayer.id, { color: e.target.value })}
                          className="w-6 h-6 bg-transparent border-0 cursor-pointer rounded-full"
                        />
                      </div>
                    </div>

                    {/* Bg Color Presets */}
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{en ? "Text Background Color" : "لون خلفية النص"}</label>
                      <div className="flex flex-wrap gap-1.5 bg-[#131924] p-1.5 rounded-xl border border-white/5">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => updateLayer(activeLayer.id, { bgColor: c.value })}
                            className={`w-6 h-6 rounded-full border-2 transition-transform relative ${
                              activeLayer.bgColor === c.value ? "border-blue-400 scale-110 shadow" : "border-white/10"
                            }`}
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                          >
                            {c.value === "transparent" && <span className="absolute inset-0 flex items-center justify-center text-[8px] text-red-500">❌</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Weight and Align */}
                    <div className="flex gap-4 items-center pt-1">
                      <div className="flex gap-1 bg-[#131924] p-1 rounded-xl border border-white/5">
                        <button
                          onClick={() => updateLayer(activeLayer.id, { fontWeight: activeLayer.fontWeight === "bold" ? "normal" : "bold" })}
                          className={`p-1.5 rounded-lg text-xs font-bold ${
                            activeLayer.fontWeight === "bold" ? "bg-blue-600 text-white" : "text-muted-foreground"
                          }`}
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex gap-1 bg-[#131924] p-1 rounded-xl border border-white/5">
                        {[
                          { val: "left" as const, icon: AlignLeft },
                          { val: "center" as const, icon: AlignCenter },
                          { val: "right" as const, icon: AlignRight }
                        ].map((align) => (
                          <button
                            key={align.val}
                            onClick={() => updateLayer(activeLayer.id, { textAlign: align.val })}
                            className={`p-1.5 rounded-lg ${
                              activeLayer.textAlign === align.val ? "bg-blue-600 text-white" : "text-muted-foreground"
                            }`}
                          >
                            <align.icon className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 bg-[#1d2636]/40 rounded-2xl border border-white/5 text-xs text-muted-foreground">
                    {en ? "Add or select a text layer to view style properties" : "اضغط على زر (إضافة نص جديد) بالأعلى، أو اضغط مرتين على أي نص في الشاشة للتحكم في نوع الخط وحجمه وألوانه."}
                  </div>
                )}
              </div>
            )}

            {/* STICKERS AND PIP IMAGE OVERLAY PANEL */}
            {tab === "stickers" && (
              <div className="space-y-4">
                {/* PIP Image Upload overlay (إضافة تراكبات صورة) */}
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground mb-2">{en ? "Picture-in-Picture Image Overlay (PIP)" : "تراكب صور ثانوية (صورة داخل صورة / PIP)"}</p>
                  <button
                    onClick={() => pipInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 w-full p-2.5 rounded-xl bg-[#1d2636] hover:bg-[#253147] border border-white/5 hover:border-blue-500/30 text-xs font-bold text-blue-400 active:scale-[0.98] transition-transform"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {en ? "Add Photo PIP Overlay" : "إضافة صورة ثانوية متراكبة"}
                  </button>
                  <input ref={pipInputRef} type="file" accept="image/*" hidden onChange={handleAddPipImage} />
                </div>

                {/* Vector Shapes Adding */}
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground mb-2">{en ? "Vector Design Shapes" : "إضافة أشكال هندسية لتزيين التصميم"}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "rect" as const, label: en ? "Square" : "مربع" },
                      { id: "circle" as const, label: en ? "Circle" : "دائرة" },
                      { id: "triangle" as const, label: en ? "Triangle" : "مثلث" },
                      { id: "star" as const, label: en ? "Star" : "نجمة" }
                    ].map((shape) => (
                      <button
                        key={shape.id}
                        onClick={() => addShapeLayer(shape.id)}
                        className="p-2 rounded-xl bg-[#1d2636] hover:bg-[#253147] text-[10px] font-bold text-foreground text-center"
                      >
                        {shape.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stickers Grid */}
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground mb-2">{en ? "Aesthetic Stickers" : "ملصقات ووجوه تعبيرية للمونتاج"}</p>
                  <div className="grid grid-cols-8 gap-2 bg-[#1d2636]/60 p-2.5 rounded-2xl border border-white/5 max-h-24 overflow-y-auto no-scrollbar">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addStickerLayer(emoji)}
                        className="text-xl p-1 hover:bg-[#253147] rounded-lg active:scale-90 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub Properties for Shapes or PIP */}
                {activeLayer && (activeLayer.type === "shape" || activeLayer.type === "image" || activeLayer.type === "sticker") && (
                  <div className="bg-[#1d2636] p-3 rounded-2xl border border-white/10 space-y-3.5">
                    <p className="text-[10px] font-black text-blue-400">{en ? "Active Overlay Style" : "تعديل خصائص التراكب النشط"}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-bold">
                          <span>{en ? "Scale" : "الحجم والتكبير"}</span>
                          <span className="text-blue-400">{activeLayer.scale.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={activeLayer.scale}
                          onChange={(e) => updateLayer(activeLayer.id, { scale: Number(e.target.value) })}
                          className="w-full accent-blue-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-bold">
                          <span>{en ? "Opacity" : "الشفافية"}</span>
                          <span className="text-blue-400">{Math.round(activeLayer.opacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={activeLayer.opacity}
                          onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                          className="w-full accent-blue-500"
                        />
                      </div>
                    </div>

                    {activeLayer.type === "shape" && (
                      <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-2">
                        <div>
                          <label className="text-[9px] text-muted-foreground block mb-1">{en ? "Fill Color" : "لون التعبئة والشكل"}</label>
                          <div className="flex flex-wrap gap-1">
                            {COLOR_PRESETS.map((c) => (
                              <button
                                key={c.value}
                                onClick={() => updateLayer(activeLayer.id, { fillColor: c.value })}
                                className={`w-5 h-5 rounded-full border border-white/15 ${
                                  activeLayer.fillColor === c.value ? "ring-1 ring-blue-500" : ""
                                }`}
                                style={{ backgroundColor: c.value }}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground block mb-1">{en ? "Stroke Color" : "لون الإطار"}</label>
                          <div className="flex flex-wrap gap-1">
                            {COLOR_PRESETS.filter(c => c.value !== "transparent").map((c) => (
                              <button
                                key={c.value}
                                onClick={() => updateLayer(activeLayer.id, { strokeColor: c.value })}
                                className={`w-5 h-5 rounded-full border border-white/15 ${
                                  activeLayer.strokeColor === c.value ? "ring-1 ring-blue-500" : ""
                                }`}
                                style={{ backgroundColor: c.value }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* LAYERS MANAGER PANEL (تحكم في طبقات) */}
            {tab === "layers" && (
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-muted-foreground">{en ? "Layers Management" : "إدارة طبقات التصميم الحالية وترتيبها"}</p>
                {layers.length === 0 ? (
                  <div className="text-center py-4 bg-[#1d2636]/40 rounded-2xl border border-white/5 text-xs text-muted-foreground">
                    {en ? "No layers added on top of the image" : "لا توجد طبقات مضافة حالياً. أضف نصوص أو ملصقات أو أشكال هندسية أولاً."}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                    {layers.map((layer, index) => {
                      const isSelected = layer.id === selectedLayerId;
                      return (
                        <div
                          key={layer.id}
                          onClick={() => setSelectedLayerId(layer.id)}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? "bg-blue-600/15 border-blue-500/40 text-blue-400"
                              : "bg-[#1d2636] border-transparent text-foreground/90 hover:border-white/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground/60 font-mono">#{layers.length - index}</span>
                            <span className="font-bold">
                              {layer.type === "text" && `📝 ${layer.text?.substring(0, 15)}...`}
                              {layer.type === "sticker" && `😊 ملصق: ${layer.emoji}`}
                              {layer.type === "image" && "🖼️ صورة تراكب ثانوية"}
                              {layer.type === "shape" && `📐 شكل هندسي (${layer.shapeType})`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Visibility */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateLayer(layer.id, { visible: !layer.visible });
                              }}
                              className="p-1 rounded hover:bg-white/10"
                            >
                              {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>

                            {/* Move Order */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveLayerOrder(layer.id, "up");
                              }}
                              disabled={index === layers.length - 1}
                              className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                              title={en ? "Move up" : "للأمام"}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveLayerOrder(layer.id, "down");
                              }}
                              disabled={index === 0}
                              className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                              title={en ? "Move down" : "للخلف"}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteLayer(layer.id);
                              }}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* AI TOOLS PANEL & MODAL */}
            {tab === "ai" && (
              <ImageAIToolsModal
                isOpen={tab === "ai"}
                onClose={() => setTab("crop")}
                imageUrl={imgUrl || ""}
                onApplyResult={(resultUrl) => {
                  if (resultUrl) {
                    setImgUrl(resultUrl);
                  }
                }}
              />
            )}

            {/* UPGRADED UNIFIED PHOTO EXPORT MODAL */}
            <PhotoExportDialog
              isOpen={showExportModal}
              onClose={() => setShowExportModal(false)}
              baseImage={imgRef.current}
              imgUrl={imgUrl}
              naturalSize={naturalSize}
              filter={filter}
              filterCssString={filterCss}
              brightness={brightness}
              contrast={contrast}
              saturate={saturate}
              blurVal={blurVal}
              hueVal={hueVal}
              rotation={rotation}
              flipH={flipH}
              flipV={flipV}
              zoom={zoom}
              panX={panX}
              panY={panY}
              cropRatio={cropRatio}
              vfxType={vfxType}
              vfxIntensity={vfxIntensity}
              layers={layers}
              previewContainerWidth={previewContainerRef.current?.clientWidth || 450}
              previewContainerHeight={previewContainerRef.current?.clientHeight || 450}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoEditorScreen;
