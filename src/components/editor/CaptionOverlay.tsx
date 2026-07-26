import { useRef, useState, useCallback, memo, useEffect } from "react";
import { useMedia, CaptionAnimation, interpolateKeyframes } from "@/context/MediaContext";
import { X, FlipHorizontal, FlipVertical, RotateCw, Maximize2, WrapText } from "lucide-react";
import { snapPreviewTransform } from "@/lib/timelineSnap";

interface Props {
  currentTime: number;
}

const animClass = (a?: CaptionAnimation) => {
  switch (a) {
    case "slide-up": return "animate-cap-slide-up";
    case "slide-down": return "animate-cap-slide-down";
    case "pop": return "animate-cap-pop";
    case "typewriter": return "animate-cap-fade";
    case "bounce": return "animate-cap-bounce";
    case "glitch": return "animate-cap-glitch";
    case "zoom-fade": return "animate-cap-zoom-fade";
    case "scale-up": return "animate-cap-scale-up";
    case "rotate-in": return "animate-cap-rotate-in";
    case "blur-in": return "animate-cap-blur-in";
    case "elastic-drop": return "animate-cap-elastic-drop";
    case "swing-in": return "animate-cap-swing-in";
    case "reveal-left": return "animate-cap-reveal-left";
    case "reveal-right": return "animate-cap-reveal-right";
    case "heartbeat": return "animate-cap-heartbeat";
    case "neon-flicker": return "animate-cap-neon-flicker";
    case "3d-flip": return "animate-cap-3d-flip";
    case "wave-bounce": return "animate-cap-wave-bounce";
    case "curtain-reveal": return "animate-cap-curtain-reveal";
    case "shatter-pop": return "animate-cap-shatter-pop";
    case "none": return "";
    case "fade":
    default: return "animate-cap-fade";
  }
};

const getDistance = (touches: React.TouchList) => {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

const getAngle = (touches: React.TouchList) => {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

const CaptionOverlay = memo(({ currentTime }: Props) => {
  const { captions = [], captionStyle, updateCaption, removeCaption } = useMedia();
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  // Deselect active caption when clicking on empty space
  useEffect(() => {
    const handleDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest("[data-caption-text]") &&
        !target.closest("[data-caption-overlay]") &&
        !target.closest("button")
      ) {
        setSelectedId(null);
      }
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, []);
  
  const dragRefs = useRef<Record<string, {
    startX: number;
    startY: number;
    startXPercent: number;
    startYPercent: number;
  }>>({});

  const touchStateRef = useRef<{
    startXPercent: number;
    startYPercent: number;
    startScale: number;
    startRotation: number;
    startDist: number;
    startAngle: number;
  } | null>(null);

  const activeList = captions.filter((c) => currentTime >= c.start && currentTime <= c.end);

  if (activeList.length === 0) return null;

  const startDrag = (e: React.PointerEvent, id: string, startXPercent: number, startYPercent: number) => {
    if (editingId === id) return;
    e.stopPropagation();
    setSelectedId(id);
    
    const container = containerRef.current?.parentElement;
    if (!container) return;
    
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    
    dragRefs.current[id] = {
      startX: e.clientX,
      startY: e.clientY,
      startXPercent,
      startYPercent
    };
  };

  const onMove = (e: React.PointerEvent, id: string) => {
    const drag = dragRefs.current[id];
    if (!drag) return;
    
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    
    const rawX = Math.max(4, Math.min(96, drag.startXPercent + (dx / rect.width) * 100));
    const rawY = Math.max(4, Math.min(96, drag.startYPercent + (dy / rect.height) * 100));
    const snapped = snapPreviewTransform({ x: rawX, y: rawY });
    const nextXPercent = snapped.x;
    const nextYPercent = snapped.y;
    
    const active = captions.find((c) => c.id === id);
    if (!active) return;

    const localTime = currentTime - active.start;
    const hasKeyframes = active.keyframes && active.keyframes.length > 0;

    if (hasKeyframes) {
      const updatedKfs = [...(active.keyframes || [])];
      
      // Update/Create xPercent keyframe at localTime
      const xKfIndex = updatedKfs.findIndex(
        (kf) => kf.property === "xPercent" && Math.abs(kf.time - localTime) < 0.15
      );
      if (xKfIndex > -1) {
        updatedKfs[xKfIndex] = { ...updatedKfs[xKfIndex], value: nextXPercent };
      } else {
        const xKfs = updatedKfs.filter((k) => k.property === "xPercent");
        if (xKfs.length === 0) {
          updatedKfs.push({
            id: `kf-start-x-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: 0,
            property: "xPercent",
            value: active.xPercent ?? 50,
          });
        }
        updatedKfs.push({
          id: `kf-drag-x-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "xPercent",
          value: nextXPercent,
        });
      }

      // Update/Create yPercent keyframe at localTime
      const yKfIndex = updatedKfs.findIndex(
        (kf) => kf.property === "yPercent" && Math.abs(kf.time - localTime) < 0.15
      );
      if (yKfIndex > -1) {
        updatedKfs[yKfIndex] = { ...updatedKfs[yKfIndex], value: nextYPercent };
      } else {
        const yKfs = updatedKfs.filter((k) => k.property === "yPercent");
        if (yKfs.length === 0) {
          const defaultY = captionStyle.position === "top" ? 8 : captionStyle.position === "center" ? 50 : 88;
          updatedKfs.push({
            id: `kf-start-y-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: 0,
            property: "yPercent",
            value: active.yPercent ?? defaultY,
          });
        }
        updatedKfs.push({
          id: `kf-drag-y-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "yPercent",
          value: nextYPercent,
        });
      }

      updatedKfs.sort((a, b) => a.time - b.time);
      updateCaption(id, { keyframes: updatedKfs });
    } else {
      updateCaption(id, {
        xPercent: nextXPercent,
        yPercent: nextYPercent,
      });
    }
  };

  const endDrag = (id: string) => {
    delete dragRefs.current[id];
  };

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    if (editingId === id) return;
    setSelectedId(id);
    const active = activeList.find((c) => c.id === id);
    if (!active) return;
    
    if (e.touches.length === 2) {
      e.stopPropagation();
      const dist = getDistance(e.touches);
      const angle = getAngle(e.touches);
      touchStateRef.current = {
        startXPercent: active.xPercent ?? 50,
        startYPercent: active.yPercent ?? 88,
        startScale: active.scale ?? 1,
        startRotation: active.rotation ?? 0,
        startDist: dist,
        startAngle: angle,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    const touchState = touchStateRef.current;
    if (!touchState || e.touches.length !== 2) return;
    e.stopPropagation();
    e.preventDefault();
    
    const dist = getDistance(e.touches);
    const angle = getAngle(e.touches);
    
    const scaleDelta = dist / touchState.startDist;
    const nextScale = Math.max(0.2, Math.min(3, touchState.startScale * scaleDelta));
    
    const angleDelta = angle - touchState.startAngle;
    const nextRotation = touchState.startRotation + angleDelta;
    
    const active = captions.find((c) => c.id === id);
    if (!active) return;

    const localTime = currentTime - active.start;
    const hasKeyframes = active.keyframes && active.keyframes.length > 0;

    if (hasKeyframes) {
      const updatedKfs = [...(active.keyframes || [])];
      
      // Scale
      const scaleKfIdx = updatedKfs.findIndex(
        (kf) => kf.property === "scale" && Math.abs(kf.time - localTime) < 0.15
      );
      if (scaleKfIdx > -1) {
        updatedKfs[scaleKfIdx] = { ...updatedKfs[scaleKfIdx], value: nextScale };
      } else {
        const scaleKfs = updatedKfs.filter((k) => k.property === "scale");
        if (scaleKfs.length === 0) {
          updatedKfs.push({
            id: `kf-start-s-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: 0,
            property: "scale",
            value: active.scale ?? 1,
          });
        }
        updatedKfs.push({
          id: `kf-touch-s-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "scale",
          value: nextScale,
        });
      }

      // Rotation
      const rotKfIdx = updatedKfs.findIndex(
        (kf) => kf.property === "rotation" && Math.abs(kf.time - localTime) < 0.15
      );
      if (rotKfIdx > -1) {
        updatedKfs[rotKfIdx] = { ...updatedKfs[rotKfIdx], value: nextRotation };
      } else {
        const rotKfs = updatedKfs.filter((k) => k.property === "rotation");
        if (rotKfs.length === 0) {
          updatedKfs.push({
            id: `kf-start-r-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: 0,
            property: "rotation",
            value: active.rotation ?? 0,
          });
        }
        updatedKfs.push({
          id: `kf-touch-r-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "rotation",
          value: nextRotation,
        });
      }

      updatedKfs.sort((a, b) => a.time - b.time);
      updateCaption(id, { keyframes: updatedKfs });
    } else {
      updateCaption(id, {
        scale: nextScale,
        rotation: nextRotation,
      });
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent, id: string, currentScale: number) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const nextScale = Math.max(0.2, Math.min(3, currentScale + delta));
    
    const active = captions.find((c) => c.id === id);
    if (!active) return;

    const localTime = currentTime - active.start;
    const hasKeyframes = active.keyframes && active.keyframes.length > 0;

    if (hasKeyframes) {
      const updatedKfs = [...(active.keyframes || [])];
      const scaleKfIdx = updatedKfs.findIndex(
        (kf) => kf.property === "scale" && Math.abs(kf.time - localTime) < 0.15
      );
      if (scaleKfIdx > -1) {
        updatedKfs[scaleKfIdx] = { ...updatedKfs[scaleKfIdx], value: nextScale };
      } else {
        const scaleKfs = updatedKfs.filter((k) => k.property === "scale");
        if (scaleKfs.length === 0) {
          updatedKfs.push({
            id: `kf-start-ws-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            time: 0,
            property: "scale",
            value: active.scale ?? 1,
          });
        }
        updatedKfs.push({
          id: `kf-wheel-s-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "scale",
          value: nextScale,
        });
      }
      updatedKfs.sort((a, b) => a.time - b.time);
      updateCaption(id, { keyframes: updatedKfs });
    } else {
      updateCaption(id, { scale: nextScale });
    }
  };

  const beginEdit = (id: string, text: string) => {
    setDraftText(text);
    setEditingId(id);
  };

  const commitEdit = (id: string, originalText: string) => {
    if (editingId === id) {
      updateCaption(id, { text: draftText.trim() || originalText });
    }
    setEditingId(null);
  };

  return (
    <div ref={containerRef} data-caption-overlay className="absolute inset-0 pointer-events-none z-10">
      {activeList.map((active) => {
        const font = active.font ?? captionStyle.font;
        const size = active.size ?? captionStyle.size;
        const color = active.color ?? captionStyle.color;
        const bg = active.bg ?? captionStyle.bg;
        
        // Keyframe calculations
        const localTime = currentTime - active.start;
        const scale = interpolateKeyframes(active, "scale", localTime, active.scale ?? 1);
        const rotation = interpolateKeyframes(active, "rotation", localTime, active.rotation ?? 0);
        const xPercent = interpolateKeyframes(active, "xPercent", localTime, active.xPercent ?? 50);
        const yPercent = interpolateKeyframes(active, "yPercent", localTime, active.yPercent ?? (captionStyle.position === "top" ? 8 : captionStyle.position === "center" ? 50 : 88));
        const opacity = interpolateKeyframes(active, "opacity", localTime, 1);
        const flipH = active.flipH ?? false;
        const flipV = active.flipV ?? false;
        
        const animation = active.animation ?? captionStyle.animation;
        const isSelected = selectedId === active.id;

        return (
          <div
            key={active.id + animation}
            data-caption-text
            className={`absolute flex justify-center px-3 ${animClass(animation)}`}
            style={{ 
              top: `${yPercent}%`, 
              left: `${xPercent}%`, 
              transform: "translate(-50%, -50%)",
              opacity: opacity,
              position: "absolute",
              zIndex: isSelected ? 50 : 10
            }}
          >
            <div 
              className="relative pointer-events-auto group"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: "center center"
              }}
              onTouchStart={(e) => handleTouchStart(e, active.id)}
              onTouchMove={(e) => handleTouchMove(e, active.id)}
              onTouchEnd={handleTouchEnd}
            >
              {editingId === active.id ? (
                <input
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onBlur={() => commitEdit(active.id, active.text)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(active.id, active.text);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  dir={captionStyle.language === "ar" ? "rtl" : "ltr"}
                  style={{
                    fontFamily: font,
                    fontSize: Math.min(size, 28),
                    color,
                    background: bg,
                    padding: "4px 10px",
                    borderRadius: 8,
                    outline: "2px solid hsl(var(--primary))",
                    textAlign: "center",
                    minWidth: 80,
                    maxWidth: "80vw",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8), 1px -1px 2px rgba(0,0,0,0.8), -1px 1px 2px rgba(0,0,0,0.8)"
                  }}
                />
              ) : (
                <div
                  onPointerDown={(e) => startDrag(e, active.id, xPercent, yPercent)}
                  onPointerMove={(e) => onMove(e, active.id)}
                  onPointerUp={() => endDrag(active.id)}
                  onPointerCancel={() => endDrag(active.id)}
                  onWheel={(e) => handleWheel(e, active.id, scale)}
                  onDoubleClick={() => beginEdit(active.id, active.text)}
                  dir={captionStyle.language === "ar" ? "rtl" : "ltr"}
                  style={{
                    fontFamily: font,
                    fontSize: Math.min(size, 28),
                    color,
                    background: bg,
                    padding: "4px 12px",
                    borderRadius: 8,
                    whiteSpace: active.isMultiLine ? "pre-wrap" : "nowrap",
                    maxWidth: active.isMultiLine ? "75vw" : "none",
                    textAlign: "center",
                    lineHeight: 1.3,
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                    boxShadow: isSelected ? "0 4px 20px rgba(var(--primary-rgb),0.5)" : "0 2px 12px rgba(0,0,0,0.35)",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8), 1px -1px 2px rgba(0,0,0,0.8), -1px 1px 2px rgba(0,0,0,0.8)"
                  }}
                  className={`ring-0 transition-shadow ${isSelected ? "ring-2 ring-primary" : "group-hover:ring-2 group-hover:ring-primary/60"}`}
                >
                  {active.text}
                </div>
              )}

              {/* Selection Border & Action Controls */}
              {isSelected && (
                <>
                  {/* Visual dashed container outline with corner guides */}
                  <div className="absolute inset-x-0 -inset-y-1.5 border border-dashed border-amber-400 rounded pointer-events-none">
                    {/* Corner Guide Handles (دليل مستخدم) */}
                    <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black shadow-sm" />
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black shadow-sm" />
                    <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black shadow-sm" />
                    <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black shadow-sm" />
                  </div>
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCaption(active.id); }}
                    className="absolute -top-3.5 -right-3.5 w-6 h-6 rounded-full bg-destructive text-white border border-destructive/20 flex items-center justify-center shadow-lg transition-transform active:scale-90 z-20"
                    aria-label="حذف الكابشن"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  {/* Corner Resize / Wrap Control Handle (تحكم السطر الواحد / أسطر متعددة من الزاوية) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCaption(active.id, { isMultiLine: !active.isMultiLine }); }}
                    className="absolute -bottom-3.5 -right-3.5 w-7 h-7 rounded-full bg-amber-500 text-slate-950 border-2 border-amber-300 flex items-center justify-center shadow-lg transition-transform active:scale-90 z-20"
                    title={active.isMultiLine ? "جعل النص سطر واحد" : "تقسيم النص لعدة أسطر"}
                  >
                    <WrapText className="w-4 h-4" />
                  </button>

                  {/* Horizontal Flip */}
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCaption(active.id, { flipH: !flipH }); }}
                    className="absolute -bottom-3.5 -left-3.5 w-6 h-6 rounded-full bg-primary text-white border border-primary/20 flex items-center justify-center shadow-lg transition-transform active:scale-90 z-20"
                    title="قلب أفقي"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {/* Vertical Flip */}
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCaption(active.id, { flipV: !flipV }); }}
                    className="absolute -top-3.5 -left-3.5 w-6 h-6 rounded-full bg-primary text-white border border-primary/20 flex items-center justify-center shadow-lg transition-transform active:scale-90 z-20"
                    title="قلب عمودي"
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Manual Scale & Line Mode Indicator */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-full shadow-lg text-[9px] font-black pointer-events-none whitespace-nowrap">
                    <Maximize2 className="w-2.5 h-2.5" />
                    <span>{Math.round(scale * 100)}%</span>
                    <span className="opacity-70">|</span>
                    <span>{active.isMultiLine ? "عدة أسطر" : "سطر واحد"}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

CaptionOverlay.displayName = "CaptionOverlay";
export default CaptionOverlay;
