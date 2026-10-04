import { useState, useEffect } from "react";
import { useMedia, type Keyframe } from "@/context/MediaContext";
import {
  X,
  CircleDot,
  Video,
  Layers,
  Type,
  Sliders,
  RotateCcw,
  PenTool,
  Sparkles,
  Diamond,
  Trash2,
} from "lucide-react";
import { MASK_SHAPES, MASK_PRESETS, type MaskPresetDefinition } from "@/lib/maskShapes";
import {
  getEffectiveMask,
  resolveMaskState,
  type MaskConfig,
  type MaskShape,
  type MaskKeyframe,
} from "@/lib/maskEngine";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

export interface MaskPanelProps {
  open: boolean;
  onClose: () => void;
  currentTime: number;
  focusedTrack?: "video" | "caption" | "audio" | "filter" | "vfx" | "overlay" | null;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onFocusTrack?: (track: "video" | "caption" | "overlay") => void;
  isFreeformDrawing?: boolean;
  onToggleFreeformDraw?: (active: boolean) => void;
}

const DEFAULT_MASK: MaskConfig = {
  maskShape: "none",
  maskX: 50,
  maskY: 50,
  maskSize: 100,
  maskWidth: 100,
  maskHeight: 100,
  maskFeather: 0,
  maskInverted: false,
};

type LayerKind = "video" | "overlay" | "caption";

const MASK_KEYFRAME_PROPS = ["maskX", "maskY", "maskSize", "maskWidth", "maskHeight", "maskFeather"] as const;

const MaskPanel = ({
  open,
  onClose,
  currentTime,
  focusedTrack,
  selectedOverlayId,
  onSelectOverlay,
  onFocusTrack,
  isFreeformDrawing = false,
  onToggleFreeformDraw,
}: MaskPanelProps) => {
  const {
    clips = [],
    media = [],
    overlays = [],
    captions = [],
    setClips,
    updateOverlay,
    updateCaption,
    resolveTimelineTime,
  } = useMedia();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [targetKind, setTargetKind] = useState<LayerKind>("video");
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const en = getLang() === "en";

  // Sync targetKind with timeline's focusedTrack when opening or changing focusedTrack
  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
      onToggleFreeformDraw?.(false);
      return;
    }
    if (focusedTrack === "overlay") setTargetKind("overlay");
    else if (focusedTrack === "caption") setTargetKind("caption");
    else setTargetKind("video");
  }, [open, focusedTrack, onToggleFreeformDraw]);

  // Auto-select active caption at playhead
  useEffect(() => {
    const activeCap = captions.find((c) => currentTime >= c.start && currentTime <= c.end);
    if (activeCap) {
      setSelectedCaptionId(activeCap.id);
    } else if (captions.length > 0 && !selectedCaptionId) {
      setSelectedCaptionId(captions[0].id);
    }
  }, [captions, currentTime, selectedCaptionId]);

  // Auto-select active overlay at playhead if none selected
  useEffect(() => {
    if (overlays.length > 0 && !selectedOverlayId && onSelectOverlay) {
      const activeOv = overlays.find((o) => currentTime >= o.start && currentTime <= o.end);
      onSelectOverlay(activeOv ? activeOv.id : overlays[0].id);
    }
  }, [overlays, currentTime, selectedOverlayId, onSelectOverlay]);

  if (!open) return null;

  const resolved = resolveTimelineTime(currentTime);
  const activeClip = resolved?.clip || clips[0] || null;
  const activeMedia = activeClip ? media.find((m) => m.id === activeClip.mediaId) : null;

  const activeOverlay =
    overlays.find((o) => o.id === selectedOverlayId) ||
    overlays.find((o) => currentTime >= o.start && currentTime <= o.end) ||
    overlays[0] ||
    null;

  const activeCaption =
    captions.find((c) => c.id === selectedCaptionId) ||
    captions.find((c) => currentTime >= c.start && currentTime <= c.end) ||
    captions[0] ||
    null;

  const targetItem =
    targetKind === "video"
      ? activeClip
      : targetKind === "overlay"
      ? activeOverlay
      : activeCaption;

  // Compute localTime relative to the selected target layer's start
  const localTime =
    targetKind === "video"
      ? Math.max(0, resolved ? currentTime - resolved.clipStart : 0)
      : targetKind === "overlay" && activeOverlay
      ? Math.max(0, currentTime - activeOverlay.start)
      : targetKind === "caption" && activeCaption
      ? Math.max(0, currentTime - activeCaption.start)
      : 0;

  const layerDuration =
    targetKind === "video" && activeClip
      ? Math.max(0.5, (activeClip.out - activeClip.in) / (activeClip.speed || 1))
      : targetKind === "overlay" && activeOverlay
      ? Math.max(0.5, activeOverlay.end - activeOverlay.start)
      : targetKind === "caption" && activeCaption
      ? Math.max(0.5, activeCaption.end - activeCaption.start)
      : 3;

  const currentMask: MaskConfig = {
    ...DEFAULT_MASK,
    ...(getEffectiveMask(targetItem) || {}),
  };

  const layerKeyframes: Keyframe[] = targetItem?.keyframes || [];
  const resolvedState = resolveMaskState(currentMask, localTime, layerKeyframes);

  // Collect unique keyframe timestamps for mask animation
  const maskKeyframeTimes = Array.from(
    new Set([
      ...(currentMask.maskKeyframes || []).map((k) => Number(k.time.toFixed(2))),
      ...layerKeyframes
        .filter((k) => (MASK_KEYFRAME_PROPS as readonly string[]).includes(k.property))
        .map((k) => Number(k.time.toFixed(2))),
    ])
  ).sort((a, b) => a - b);

  const hasKfAtNow = maskKeyframeTimes.some((t) => Math.abs(t - localTime) < 0.06);

  const shape: MaskShape = currentMask.maskShape || "none";

  const commitLayerMaskAndKeyframes = (nextMask: MaskConfig, nextLayerKfs?: Keyframe[]) => {
    if (!targetItem) return;
    if (targetKind === "video" && activeClip) {
      setClips((prev) =>
        prev.map((c) =>
          c.id === activeClip.id
            ? {
                ...c,
                mask: nextMask,
                ...(nextLayerKfs !== undefined ? { keyframes: nextLayerKfs } : {}),
              }
            : c
        )
      );
    } else if (targetKind === "overlay" && activeOverlay) {
      updateOverlay(activeOverlay.id, {
        mask: nextMask,
        maskShape: nextMask.maskShape,
        maskX: nextMask.maskX,
        maskY: nextMask.maskY,
        maskSize: nextMask.maskSize,
        maskWidth: nextMask.maskWidth,
        maskHeight: nextMask.maskHeight,
        maskFeather: nextMask.maskFeather,
        maskInverted: nextMask.maskInverted,
        maskKeyframes: nextMask.maskKeyframes,
        maskPath: nextMask.maskPath,
        customPoints: nextMask.customPoints,
        ...(nextLayerKfs !== undefined ? { keyframes: nextLayerKfs } : {}),
      });
    } else if (targetKind === "caption" && activeCaption) {
      updateCaption(activeCaption.id, {
        mask: nextMask,
        ...(nextLayerKfs !== undefined ? { keyframes: nextLayerKfs } : {}),
      });
    }
  };

  const applyMaskUpdate = (patch: Partial<MaskConfig>) => {
    if (!targetItem) return;
    const nextMask: MaskConfig = {
      ...currentMask,
      ...patch,
    };

    // If the layer already has mask keyframes, also update/insert keyframes at localTime for any modified spatial property
    if (maskKeyframeTimes.length > 0) {
      let updatedLayerKfs = [...layerKeyframes];
      let updatedMaskKfs = [...(nextMask.maskKeyframes || [])];

      const spatialKeys = ["maskX", "maskY", "maskSize", "maskWidth", "maskHeight", "maskFeather"] as const;
      let touchedSpatial = false;

      for (const prop of spatialKeys) {
        if (patch[prop] !== undefined) {
          touchedSpatial = true;
          const val = patch[prop] as number;
          const existingIdx = updatedLayerKfs.findIndex(
            (k) => k.property === prop && Math.abs(k.time - localTime) < 0.08
          );
          if (existingIdx > -1) {
            updatedLayerKfs[existingIdx] = { ...updatedLayerKfs[existingIdx], value: val };
          } else {
            updatedLayerKfs.push({
              id: `kf-${prop}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              time: localTime,
              property: prop,
              value: val,
              easing: "easeInOut",
            });
          }
        }
      }

      if (touchedSpatial) {
        updatedLayerKfs.sort((a, b) => a.time - b.time);
        const mkf: MaskKeyframe = {
          time: localTime,
          x: patch.maskX ?? resolvedState.x,
          y: patch.maskY ?? resolvedState.y,
          size: patch.maskSize ?? resolvedState.size,
          width: patch.maskWidth ?? resolvedState.width,
          height: patch.maskHeight ?? resolvedState.height,
          feather: patch.maskFeather ?? resolvedState.feather,
        };
        updatedMaskKfs = [
          ...updatedMaskKfs.filter((k) => Math.abs(k.time - localTime) >= 0.08),
          mkf,
        ].sort((a, b) => a.time - b.time);
        nextMask.maskKeyframes = updatedMaskKfs;
        commitLayerMaskAndKeyframes(nextMask, updatedLayerKfs);
        return;
      }
    }

    commitLayerMaskAndKeyframes(nextMask);
  };

  const handleAddOrUpdateKeyframe = () => {
    if (!targetItem) return;
    playSfx("click");

    const x = resolvedState.x;
    const y = resolvedState.y;
    const size = resolvedState.size;
    const width = resolvedState.width;
    const height = resolvedState.height;
    const feather = resolvedState.feather;

    // 1. Update shared layerKeyframes array (reusing existing keyframe interpolation system)
    const nonMaskAtNow = layerKeyframes.filter(
      (k) =>
        !(
          (MASK_KEYFRAME_PROPS as readonly string[]).includes(k.property) &&
          Math.abs(k.time - localTime) < 0.08
        )
    );
    const propMap: Record<(typeof MASK_KEYFRAME_PROPS)[number], number> = {
      maskX: x,
      maskY: y,
      maskSize: size,
      maskWidth: width,
      maskHeight: height,
      maskFeather: feather,
    };
    const newKfs: Keyframe[] = MASK_KEYFRAME_PROPS.map((prop) => ({
      id: `kf-${prop}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: localTime,
      property: prop,
      value: propMap[prop],
      easing: "easeInOut",
    }));
    const updatedLayerKfs = [...nonMaskAtNow, ...newKfs].sort((a, b) => a.time - b.time);

    // 2. Also sync maskKeyframes array
    const mkf: MaskKeyframe = { time: localTime, x, y, size, width, height, feather };
    const updatedMaskKfs = [
      ...(currentMask.maskKeyframes || []).filter((k) => Math.abs(k.time - localTime) >= 0.08),
      mkf,
    ].sort((a, b) => a.time - b.time);

    commitLayerMaskAndKeyframes(
      { ...currentMask, maskKeyframes: updatedMaskKfs },
      updatedLayerKfs
    );

    toast.success(
      hasKfAtNow
        ? en
          ? "Mask keyframe updated at playhead"
          : "تم تحديث الإطار المفتاحي للقناع عند المؤشر"
        : en
        ? "Mask keyframe added at playhead"
        : "تمت إضافة إطار مفتاحي للقناع عند المؤشر"
    );
  };

  const handleRemoveKeyframeAtTime = (timeSec: number) => {
    playSfx("click");
    const updatedLayerKfs = layerKeyframes.filter(
      (k) =>
        !(
          (MASK_KEYFRAME_PROPS as readonly string[]).includes(k.property) &&
          Math.abs(k.time - timeSec) < 0.08
        )
    );
    const updatedMaskKfs = (currentMask.maskKeyframes || []).filter(
      (k) => Math.abs(k.time - timeSec) >= 0.08
    );
    commitLayerMaskAndKeyframes(
      { ...currentMask, maskKeyframes: updatedMaskKfs },
      updatedLayerKfs
    );
  };

  const handleClearAllMaskKeyframes = () => {
    playSfx("click");
    const updatedLayerKfs = layerKeyframes.filter(
      (k) => !(MASK_KEYFRAME_PROPS as readonly string[]).includes(k.property)
    );
    commitLayerMaskAndKeyframes(
      { ...currentMask, maskKeyframes: [] },
      updatedLayerKfs
    );
    toast.success(en ? "Cleared mask keyframes" : "تم مسح جميع الإطارات المفتاحية للقناع");
  };

  const applyQuickKeyframeAnimation = (mode: "zoom-reveal" | "slide-across") => {
    if (!targetItem) return;
    playSfx("success");
    const t0 = 0;
    const t1 = Number(Math.min(layerDuration, Math.max(0.8, layerDuration * 0.85)).toFixed(2));

    const startState =
      mode === "zoom-reveal"
        ? { x: 50, y: 50, size: 15, width: 100, height: 100, feather: 8 }
        : { x: 18, y: 50, size: 65, width: 100, height: 100, feather: 4 };
    const endState =
      mode === "zoom-reveal"
        ? { x: 50, y: 50, size: 115, width: 100, height: 100, feather: 2 }
        : { x: 82, y: 50, size: 65, width: 100, height: 100, feather: 4 };

    const nonMaskKfs = layerKeyframes.filter(
      (k) => !(MASK_KEYFRAME_PROPS as readonly string[]).includes(k.property)
    );

    const buildKfsAt = (t: number, st: typeof startState): Keyframe[] => [
      { id: `kf-mx-${t}-${Date.now()}`, time: t, property: "maskX", value: st.x, easing: "easeInOut" },
      { id: `kf-my-${t}-${Date.now()}`, time: t, property: "maskY", value: st.y, easing: "easeInOut" },
      { id: `kf-ms-${t}-${Date.now()}`, time: t, property: "maskSize", value: st.size, easing: "easeInOut" },
      { id: `kf-mw-${t}-${Date.now()}`, time: t, property: "maskWidth", value: st.width, easing: "easeInOut" },
      { id: `kf-mh-${t}-${Date.now()}`, time: t, property: "maskHeight", value: st.height, easing: "easeInOut" },
      { id: `kf-mf-${t}-${Date.now()}`, time: t, property: "maskFeather", value: st.feather, easing: "easeInOut" },
    ];

    const nextLayerKfs = [...nonMaskKfs, ...buildKfsAt(t0, startState), ...buildKfsAt(t1, endState)];
    const nextMaskKfs: MaskKeyframe[] = [
      { time: t0, ...startState },
      { time: t1, ...endState },
    ];

    commitLayerMaskAndKeyframes(
      {
        ...currentMask,
        maskShape: currentMask.maskShape && currentMask.maskShape !== "none" ? currentMask.maskShape : "circle",
        maskX: startState.x,
        maskY: startState.y,
        maskSize: startState.size,
        maskFeather: startState.feather,
        maskKeyframes: nextMaskKfs,
      },
      nextLayerKfs
    );

    toast.success(
      en
        ? "Mask keyframe animation applied! Play the timeline to preview."
        : "تم تطبيق حركة القناع التلقائية! شغّل الفيديو لمعاينة الحركة."
    );
  };

  const resetMask = () => {
    playSfx("click");
    onToggleFreeformDraw?.(false);
    const updatedLayerKfs = layerKeyframes.filter(
      (k) => !(MASK_KEYFRAME_PROPS as readonly string[]).includes(k.property)
    );
    commitLayerMaskAndKeyframes(
      { ...DEFAULT_MASK, maskKeyframes: [], maskPath: undefined, customPoints: undefined },
      updatedLayerKfs
    );
    toast.success(en ? "Mask reset" : "تمت إعادة ضبط القناع");
  };

  const handleSwitchTargetKind = (kind: LayerKind) => {
    playSfx("click");
    setTargetKind(kind);
    onFocusTrack?.(kind);
  };

  const startFreeformDraw = () => {
    playSfx("click");
    applyMaskUpdate({ maskShape: "custom-path" });
    onToggleFreeformDraw?.(true);
    setIsCollapsed(true);
    toast.info(
      en
        ? "Draw your custom mask shape directly on the preview screen!"
        : "ارسم مسار القناع الحر بإصبعك مباشرة على شاشة المعاينة!"
    );
  };

  if (isCollapsed || isFreeformDrawing) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/95 backdrop-blur-xl border border-primary/30 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <CircleDot className="w-4 h-4 text-primary" />
            <span>
              {isFreeformDrawing
                ? en
                  ? "Drawing Freeform Mask..."
                  : "وضع الرسم الحر للقناع..."
                : en
                ? "Mask Tool Active"
                : "أداة القناع نشطة"}
            </span>
          </span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => {
              playSfx("click");
              onToggleFreeformDraw?.(false);
              setIsCollapsed(false);
            }}
            className="px-3.5 py-1.5 rounded-full gradient-primary text-white text-xs font-bold transition-all active:scale-95"
          >
            {en ? "Show Panel" : "إظهار اللوحة"}
          </button>
          <button
            onClick={() => {
              playSfx("click");
              onToggleFreeformDraw?.(false);
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const renderSlider = (
    label: string,
    key: "maskSize" | "maskX" | "maskY" | "maskWidth" | "maskHeight" | "maskFeather",
    resolvedVal: number,
    min: number,
    max: number,
    unit: string
  ) => {
    return (
      <div className="space-y-1.5" key={key}>
        <div className="flex items-center justify-between text-xs font-bold text-foreground">
          <span>{label}</span>
          <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
            {Math.round(resolvedVal)}
            {unit}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={Math.round(resolvedVal)}
          onChange={(e) => applyMaskUpdate({ [key]: Number(e.target.value) })}
          className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up max-h-[82vh] flex flex-col" dir="rtl">
      <div className="bg-card border-t border-border rounded-t-3xl p-4 pb-6 shadow-2xl overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <CircleDot className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-foreground text-sm">
                {en ? "Mask Tool (قناع)" : "أداة القناع الشاملة (Mask)"}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {en
                  ? "Shapes, Freeform Draw, Presets & Keyframes for any layer"
                  : "أشكال جاهزة، رسم حر باللمس، وتحريك بالإطارات المفتاحية لأي طبقة"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {shape !== "none" && (
              <button
                type="button"
                onClick={resetMask}
                className="px-2.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-[11px] font-bold flex items-center gap-1 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{en ? "Reset" : "إعادة ضبط"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playSfx("click");
                setIsCollapsed(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-primary/10 text-primary text-[11px] font-bold"
            >
              {en ? "Preview" : "معاينة"}
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleFreeformDraw?.(false);
                onClose();
              }}
              className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Layer Target Selector Tabs (Video Clip / Overlay / Caption) */}
        <div className="grid grid-cols-3 gap-1.5 bg-secondary/40 p-1 rounded-2xl border border-border/40">
          <button
            type="button"
            onClick={() => handleSwitchTargetKind("video")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              targetKind === "video"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{en ? "Clip / Image" : "المقطع / الصورة"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTargetKind("overlay")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              targetKind === "overlay"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{en ? "Overlay" : "التراكب"} ({overlays.length})</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTargetKind("caption")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              targetKind === "caption"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>{en ? "Caption" : "النص"} ({captions.length})</span>
          </button>
        </div>

        {/* Specific item picker when multiple overlays or captions exist */}
        {targetKind === "overlay" && overlays.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {overlays.map((ov) => (
              <button
                key={ov.id}
                type="button"
                onClick={() => {
                  playSfx("click");
                  onSelectOverlay?.(ov.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all ${
                  activeOverlay?.id === ov.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/50 bg-secondary/40 text-muted-foreground"
                }`}
              >
                {ov.name}
              </button>
            ))}
          </div>
        )}

        {targetKind === "caption" && captions.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {captions.map((cap) => (
              <button
                key={cap.id}
                type="button"
                onClick={() => {
                  playSfx("click");
                  setSelectedCaptionId(cap.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all max-w-[150px] truncate ${
                  activeCaption?.id === cap.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/50 bg-secondary/40 text-muted-foreground"
                }`}
              >
                {cap.text || (en ? "Caption" : "نص")}
              </button>
            ))}
          </div>
        )}

        {!targetItem ? (
          <div className="py-8 text-center text-xs text-muted-foreground bg-secondary/20 rounded-2xl border border-border/30">
            {targetKind === "overlay"
              ? en
                ? "No overlay layers added yet. Add an overlay first or switch to Clip."
                : "لا توجد طبقات تراكب حالياً. أضف طبقة تراكب أولاً أو اختر المقطع الرئيسي."
              : targetKind === "caption"
              ? en
                ? "No captions added yet. Add a caption first or switch to Clip."
                : "لا توجد نصوص مضافة حالياً. أضف نصاً أولاً أو اختر المقطع الرئيسي."
              : en
              ? "No active clip found at playhead."
              : "لا يوجد مقطع نشط عند مؤشر التشغيل."}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Target Indicator */}
            <div className="flex items-center justify-between bg-secondary/35 border border-border/50 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {targetKind === "video" && <Video className="w-4 h-4 text-primary shrink-0" />}
                {targetKind === "overlay" && <Layers className="w-4 h-4 text-primary shrink-0" />}
                {targetKind === "caption" && <Type className="w-4 h-4 text-primary shrink-0" />}
                <span className="text-xs font-bold text-foreground truncate">
                  {targetKind === "video"
                    ? activeMedia?.name || (en ? "Main Clip" : "المقطع الرئيسي")
                    : targetKind === "overlay"
                    ? activeOverlay?.name || (en ? "Overlay" : "طبقة التراكب")
                    : activeCaption?.text || (en ? "Caption" : "النص")}
                </span>
              </div>
              <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                {shape === "none" ? (en ? "No Mask" : "بدون قناع") : shape}
              </span>
            </div>

            {/* Ready-made 1-Tap Mask Presets */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                {en ? "Quick Mask Presets (1-Tap)" : "قوالب قناع جاهزة (بلمسة واحدة)"}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {MASK_PRESETS.map((preset: MaskPresetDefinition) => {
                  const PIcon = preset.icon;
                  const isActivePreset =
                    currentMask.maskShape === preset.config.maskShape &&
                    Math.round(currentMask.maskX ?? 50) === Math.round(preset.config.maskX ?? 50) &&
                    Math.round(currentMask.maskY ?? 50) === Math.round(preset.config.maskY ?? 50) &&
                    Math.round(currentMask.maskSize ?? 100) === Math.round(preset.config.maskSize ?? 100) &&
                    Math.round(currentMask.maskFeather ?? 0) === Math.round(preset.config.maskFeather ?? 0);

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        playSfx("click");
                        onToggleFreeformDraw?.(false);
                        applyMaskUpdate({ ...preset.config });
                        toast.success(
                          en
                            ? `Applied preset: ${preset.labelEn}`
                            : `تم تطبيق قالب: ${preset.labelAr}`
                        );
                      }}
                      className={`flex items-start gap-2.5 p-2.5 rounded-2xl border text-right transition-all active:scale-95 ${
                        isActivePreset
                          ? "border-primary bg-primary/15 text-primary shadow-sm"
                          : "border-border/50 bg-background/80 hover:bg-secondary/50 text-foreground"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isActivePreset ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"
                        }`}
                      >
                        <PIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold truncate">
                          {en ? preset.labelEn : preset.labelAr}
                        </div>
                        <div className="text-[9px] text-muted-foreground line-clamp-1">
                          {en ? preset.descEn : preset.descAr}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Shapes Grid (including Freeform custom-path) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-primary" />
                  {en ? "Select Mask Shape" : "اختر شكل القناع"}
                </span>
                <button
                  type="button"
                  onClick={startFreeformDraw}
                  className="px-2.5 py-1 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-400 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
                >
                  <PenTool className="w-3 h-3" />
                  <span>{en ? "Draw Freeform on Screen" : "رسم حر باللمس على المعاينة"}</span>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {MASK_SHAPES.map((s) => {
                  const Icon = s.icon;
                  const active = shape === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (s.id === "custom-path") {
                          startFreeformDraw();
                        } else {
                          playSfx("click");
                          onToggleFreeformDraw?.(false);
                          applyMaskUpdate({ maskShape: s.id });
                        }
                      }}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[9px] font-bold transition-all active:scale-95 ${
                        active
                          ? "border-primary bg-primary/15 text-primary shadow-xs"
                          : "border-border/40 bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="truncate max-w-full px-0.5">{en ? s.labelEn : s.labelAr}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Freeform Custom Path Info Banner if active */}
            {shape === "custom-path" && (
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div className="text-[11px] text-cyan-200 font-medium">
                  {currentMask.customPoints && currentMask.customPoints.length >= 3
                    ? en
                      ? `Custom freeform path (${currentMask.customPoints.length} points)`
                      : `مسار حر مرسوم (${currentMask.customPoints.length} نقطة)`
                    : en
                    ? "Tap 'Draw Now' to sketch your mask on the preview"
                    : "اضغط 'ارسم الآن' لرسم القناع بإصبعك على شاشة المعاينة"}
                </div>
                <button
                  type="button"
                  onClick={startFreeformDraw}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-extrabold shrink-0 active:scale-95"
                >
                  {en ? "Draw Now" : "ارسم الآن"}
                </button>
              </div>
            )}

            {/* Sliders, Invert & Keyframe Animation */}
            {shape !== "none" && (
              <div className="bg-secondary/25 p-3.5 rounded-2xl border border-border/40 space-y-3">
                {renderSlider(en ? "Mask Size" : "حجم القناع", "maskSize", resolvedState.size, 10, 200, "%")}
                {renderSlider(en ? "Horizontal Position (X)" : "الموضع الأفقي (X)", "maskX", resolvedState.x, 0, 100, "%")}
                {renderSlider(en ? "Vertical Position (Y)" : "الموضع العمودي (Y)", "maskY", resolvedState.y, 0, 100, "%")}
                <div className="grid grid-cols-2 gap-3">
                  {renderSlider(en ? "Width Stretch" : "تمديد العرض", "maskWidth", resolvedState.width, 20, 200, "%")}
                  {renderSlider(en ? "Height Stretch" : "تمديد الارتفاع", "maskHeight", resolvedState.height, 20, 200, "%")}
                </div>
                {renderSlider(en ? "Edge Feather / Softness" : "نعومة الحواف (Feather)", "maskFeather", resolvedState.feather, 0, 50, "px")}

                <label className="flex items-center justify-between text-xs font-bold text-foreground bg-background border border-border/40 rounded-xl px-3 py-2.5 cursor-pointer">
                  <span>{en ? "Invert Mask (Cutout Inside)" : "عكس القناع (إخفاء الداخل وإظهار الخارج)"}</span>
                  <input
                    type="checkbox"
                    checked={!!currentMask.maskInverted}
                    onChange={(e) => applyMaskUpdate({ maskInverted: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                </label>

                {/* Keyframe Animation Controls */}
                <div className="space-y-2.5 pt-2.5 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Diamond className="w-3.5 h-3.5 text-rose-400" />
                      {en ? "Mask Keyframe Animation" : "تحريك القناع بالإطارات المفتاحية (Keyframes)"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {localTime.toFixed(2)}s
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddOrUpdateKeyframe}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                        hasKfAtNow
                          ? "bg-rose-500 text-white shadow-sm"
                          : "bg-primary text-primary-foreground shadow-sm"
                      }`}
                    >
                      <Diamond className="w-3.5 h-3.5" />
                      <span>
                        {hasKfAtNow
                          ? en
                            ? "Update Keyframe at Playhead"
                            : "تحديث الإطار المفتاحي الحالي"
                          : en
                          ? "Add Keyframe at Playhead"
                          : "إضافة إطار مفتاحي عند المؤشر"}
                      </span>
                    </button>

                    {maskKeyframeTimes.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllMaskKeyframes}
                        className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-bold flex items-center gap-1 active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{en ? "Clear" : "مسح"}</span>
                      </button>
                    )}
                  </div>

                  {/* Quick 1-Tap Keyframe Animation Generators */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyQuickKeyframeAnimation("zoom-reveal")}
                      className="py-1.5 px-2.5 rounded-xl bg-background hover:bg-secondary border border-border/50 text-[10px] font-bold text-foreground flex items-center justify-center gap-1 active:scale-95"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>{en ? "Auto Zoom Reveal" : "حركة تكبير تدريجي تلقائية"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickKeyframeAnimation("slide-across")}
                      className="py-1.5 px-2.5 rounded-xl bg-background hover:bg-secondary border border-border/50 text-[10px] font-bold text-foreground flex items-center justify-center gap-1 active:scale-95"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      <span>{en ? "Auto Pan Across" : "حركة مسح أفقي تلقائية"}</span>
                    </button>
                  </div>

                  {maskKeyframeTimes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {maskKeyframeTimes.map((tSec) => (
                        <button
                          key={tSec}
                          type="button"
                          onClick={() => handleRemoveKeyframeAtTime(tSec)}
                          className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-all"
                          title={en ? "Remove keyframe" : "حذف الإطار المفتاحي"}
                        >
                          ⬥ {tSec.toFixed(2)}s ✕
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {en
                      ? "Move the timeline playhead, adjust mask position or size, and add keyframes to smoothly animate the mask over time."
                      : "حرّك مؤشر التوقيت، عدّل موضع القناع أو حجمه، وأضف إطارات مفتاحية لتحريك القناع بسلاسة عبر الوقت."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaskPanel;
