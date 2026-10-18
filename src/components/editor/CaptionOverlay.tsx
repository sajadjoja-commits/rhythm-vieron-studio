import { useRef, useState, useCallback, memo, useEffect } from "react";
import { useMedia, CaptionAnimation, interpolateKeyframes } from "@/context/MediaContext";
import { X, FlipHorizontal, FlipVertical, RotateCw, Maximize2, WrapText, Youtube, Instagram, Sparkles, MapPin, AlertTriangle, Quote, Bell, Flame, CheckCircle2, Radio, Tv, Hash, Bookmark, Award, Star } from "lucide-react";
import { snapPreviewTransform } from "@/lib/timelineSnap";
import { computeWordState, computeCharacterReveal } from "@/lib/textTemplatesLibrary";
import { hasMask, maskDataUrl, getEffectiveMask } from "@/lib/maskEngine";

const renderBadgeIcon = (iconName?: string) => {
  if (!iconName) return null;
  const props = { className: "w-4 h-4 inline-block shrink-0" };
  switch (iconName) {
    case "youtube": return <Youtube {...props} className="w-4 h-4 text-red-500 fill-red-500/20" />;
    case "instagram": return <Instagram {...props} className="w-4 h-4 text-pink-500" />;
    case "sparkles": return <Sparkles {...props} className="w-4 h-4 text-amber-400 fill-amber-400/20" />;
    case "location": return <MapPin {...props} className="w-4 h-4 text-cyan-400 fill-cyan-400/20" />;
    case "alert": return <AlertTriangle {...props} className="w-4 h-4 text-amber-500 animate-pulse" />;
    case "quote": return <Quote {...props} className="w-4 h-4 text-purple-400" />;
    case "bell": return <Bell {...props} className="w-4 h-4 text-yellow-400 fill-yellow-400/20" />;
    case "fire": return <Flame {...props} className="w-4 h-4 text-orange-500 fill-orange-500/20" />;
    case "check": return <CheckCircle2 {...props} className="w-4 h-4 text-emerald-400" />;
    case "news": return <Radio {...props} className="w-4 h-4 text-rose-500 animate-pulse" />;
    case "tv": return <Tv {...props} className="w-4 h-4 text-indigo-400" />;
    case "tag": return <Hash {...props} className="w-4 h-4 text-blue-400" />;
    case "star": return <Star {...props} className="w-4 h-4 text-amber-300 fill-amber-300/30" />;
    case "award": return <Award {...props} className="w-4 h-4 text-yellow-400" />;
    default: return null;
  }
};

interface Props {
  currentTime: number;
}

export const animClass = (a?: CaptionAnimation) => {
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
  
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragLiveCoords, setDragLiveCoords] = useState<{ x: number; y: number } | null>(null);

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

  const applyPositionUpdate = (id: string, nextXPercent: number, nextYPercent: number) => {
    const active = captions.find((c) => c.id === id);
    if (!active) return;

    const localTime = Math.max(0, currentTime - active.start);
    const hasKeyframes = active.keyframes && active.keyframes.length > 0;

    if (hasKeyframes) {
      const updatedKfs = [...(active.keyframes || [])];

      // Update/Create xPercent keyframe at localTime only (never add extra keyframe at 0)
      const xKfIndex = updatedKfs.findIndex(
        (kf) => kf.property === "xPercent" && Math.abs(kf.time - localTime) < 0.08
      );
      if (xKfIndex > -1) {
        updatedKfs[xKfIndex] = { ...updatedKfs[xKfIndex], value: nextXPercent };
      } else {
        updatedKfs.push({
          id: `kf-drag-x-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "xPercent",
          value: nextXPercent,
        });
      }

      // Update/Create yPercent keyframe at localTime only (never add extra keyframe at 0)
      const yKfIndex = updatedKfs.findIndex(
        (kf) => kf.property === "yPercent" && Math.abs(kf.time - localTime) < 0.08
      );
      if (yKfIndex > -1) {
        updatedKfs[yKfIndex] = { ...updatedKfs[yKfIndex], value: nextYPercent };
      } else {
        updatedKfs.push({
          id: `kf-drag-y-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "yPercent",
          value: nextYPercent,
        });
      }

      updatedKfs.sort((a, b) => a.time - b.time);
      updateCaption(id, {
        xPercent: nextXPercent,
        yPercent: nextYPercent,
        keyframes: updatedKfs,
      });
    } else {
      updateCaption(id, {
        xPercent: nextXPercent,
        yPercent: nextYPercent,
      });
    }
  };

  const applyScaleRotationUpdate = (id: string, nextScale: number, nextRotation: number) => {
    const active = captions.find((c) => c.id === id);
    if (!active) return;

    const localTime = Math.max(0, currentTime - active.start);
    const hasKeyframes = active.keyframes && active.keyframes.length > 0;

    if (hasKeyframes) {
      const updatedKfs = [...(active.keyframes || [])];

      const scaleKfIdx = updatedKfs.findIndex(
        (kf) => kf.property === "scale" && Math.abs(kf.time - localTime) < 0.08
      );
      if (scaleKfIdx > -1) {
        updatedKfs[scaleKfIdx] = { ...updatedKfs[scaleKfIdx], value: nextScale };
      } else {
        updatedKfs.push({
          id: `kf-s-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "scale",
          value: nextScale,
        });
      }

      const rotKfIdx = updatedKfs.findIndex(
        (kf) => kf.property === "rotation" && Math.abs(kf.time - localTime) < 0.08
      );
      if (rotKfIdx > -1) {
        updatedKfs[rotKfIdx] = { ...updatedKfs[rotKfIdx], value: nextRotation };
      } else {
        updatedKfs.push({
          id: `kf-r-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          time: localTime,
          property: "rotation",
          value: nextRotation,
        });
      }

      updatedKfs.sort((a, b) => a.time - b.time);
      updateCaption(id, {
        scale: nextScale,
        rotation: nextRotation,
        keyframes: updatedKfs,
      });
    } else {
      updateCaption(id, {
        scale: nextScale,
        rotation: nextRotation,
      });
    }
  };

  const startDrag = (e: React.PointerEvent, id: string, startXPercent: number, startYPercent: number) => {
    if (editingId === id) return;
    if ((e.target as HTMLElement).closest("[data-caption-handle]")) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);

    const container = containerRef.current;
    if (!container) return;
    const initialRect = container.getBoundingClientRect();
    if (initialRect.width <= 0 || initialRect.height <= 0) return;

    const targetEl = e.currentTarget as HTMLElement;
    const activePointerId = e.pointerId;
    try {
      targetEl.setPointerCapture(activePointerId);
    } catch {}

    setActiveDragId(id);
    setDragLiveCoords({ x: Math.round(startXPercent), y: Math.round(startYPercent) });

    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const cleanup = () => {
      try {
        if (targetEl.hasPointerCapture(activePointerId)) {
          targetEl.releasePointerCapture(activePointerId);
        }
      } catch {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
      setActiveDragId(null);
      setDragLiveCoords(null);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== activePointerId) return;
      if (ev.pointerType === "mouse" && ev.buttons === 0) {
        cleanup();
        return;
      }
      ev.stopPropagation();
      ev.preventDefault();

      const curRect = container.getBoundingClientRect();
      if (curRect.width <= 0 || curRect.height <= 0) return;

      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;

      // Keep text movement within preview bounds (0% to 100%)
      const rawX = Math.max(0, Math.min(100, startXPercent + (dx / curRect.width) * 100));
      const rawY = Math.max(2, Math.min(98, startYPercent + (dy / curRect.height) * 100));

      const snapped = snapPreviewTransform({ x: rawX, y: rawY, thresholdPercent: 1.5 });
      const nextX = Math.round(snapped.x * 10) / 10;
      const nextY = Math.round(snapped.y * 10) / 10;

      setDragLiveCoords({ x: Math.round(nextX), y: Math.round(nextY) });
      applyPositionUpdate(id, nextX, nextY);
    };

    const onPointerUp = (ev: PointerEvent | FocusEvent) => {
      if ("pointerId" in ev && ev.pointerId !== activePointerId) return;
      ev.stopPropagation();
      cleanup();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onPointerUp);
  };

  const startRotateScaleDrag = (
    e: React.PointerEvent,
    id: string,
    currentScale: number,
    currentRotation: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);

    const handleEl = e.currentTarget as HTMLElement;
    const captionBoxEl = handleEl.closest("[data-caption-text]") as HTMLElement | null;
    if (!captionBoxEl) return;

    const boxRect = captionBoxEl.getBoundingClientRect();
    const centerX = boxRect.left + boxRect.width / 2;
    const centerY = boxRect.top + boxRect.height / 2;

    const startX = e.clientX;
    const startY = e.clientY;
    const startDist = Math.max(16, Math.hypot(startX - centerX, startY - centerY));
    const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);

    const activePointerId = e.pointerId;
    try {
      handleEl.setPointerCapture(activePointerId);
    } catch {}

    let isDraggingHandle = true;

    const cleanup = () => {
      if (!isDraggingHandle) return;
      isDraggingHandle = false;
      try {
        if (handleEl.hasPointerCapture(activePointerId)) {
          handleEl.releasePointerCapture(activePointerId);
        }
      } catch {}
      window.removeEventListener("pointermove", onRotateMove);
      window.removeEventListener("pointerup", onRotateUp);
      window.removeEventListener("pointercancel", onRotateUp);
      window.removeEventListener("blur", onRotateUp);
      handleEl.removeEventListener("lostpointercapture", onRotateUp);
    };

    const onRotateMove = (ev: PointerEvent) => {
      if (!isDraggingHandle || ev.pointerId !== activePointerId) return;
      if (ev.pointerType === "mouse" && ev.buttons === 0) {
        cleanup();
        return;
      }
      ev.stopPropagation();
      ev.preventDefault();

      const curDist = Math.max(10, Math.hypot(ev.clientX - centerX, ev.clientY - centerY));
      const curAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * (180 / Math.PI);

      const scaleRatio = curDist / startDist;
      const newSc = Math.max(0.25, Math.min(3.5, Math.round(currentScale * scaleRatio * 100) / 100));

      let angleDelta = curAngle - startAngle;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;
      const newRot = Math.round(currentRotation + angleDelta);

      applyScaleRotationUpdate(id, newSc, newRot);
    };

    const onRotateUp = (ev: Event) => {
      if ("pointerId" in ev && (ev as PointerEvent).pointerId !== activePointerId) return;
      ev.stopPropagation();
      cleanup();
    };

    window.addEventListener("pointermove", onRotateMove, { passive: false });
    window.addEventListener("pointerup", onRotateUp);
    window.addEventListener("pointercancel", onRotateUp);
    window.addEventListener("blur", onRotateUp);
    handleEl.addEventListener("lostpointercapture", onRotateUp);
  };

  const handleTouchStart = (e: React.TouchEvent, id: string, currentScale: number, currentRotation: number) => {
    if (editingId === id) return;
    if ((e.target as HTMLElement).closest("[data-caption-handle]")) return;
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
        startScale: currentScale,
        startRotation: currentRotation,
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
    const nextScale = Math.max(0.25, Math.min(3.5, touchState.startScale * scaleDelta));

    const angleDelta = angle - touchState.startAngle;
    const nextRotation = Math.round(touchState.startRotation + angleDelta);

    applyScaleRotationUpdate(id, nextScale, nextRotation);
  };

  const handleTouchEnd = () => {
    touchStateRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent, id: string, currentScale: number, currentRotation: number) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const nextScale = Math.max(0.25, Math.min(3.5, currentScale + delta));
    applyScaleRotationUpdate(id, nextScale, currentRotation);
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
    <div ref={containerRef} data-caption-overlay className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {activeList.map((active) => {
        const font = active.font ?? captionStyle.font;
        const size = active.size ?? captionStyle.size;
        const color = active.color ?? captionStyle.color;
        const bg = active.bg ?? captionStyle.bg;
        const bgPadding = active.bgPadding ?? captionStyle.bgPadding;
        const bgRadius = active.bgRadius ?? captionStyle.bgRadius ?? 8;
        const strokeWidth = active.strokeWidth ?? captionStyle.strokeWidth ?? 0;
        const strokeColor = active.strokeColor ?? captionStyle.strokeColor ?? "#000000";
        const shadowColor = active.shadowColor ?? captionStyle.shadowColor;
        const shadowBlur = active.shadowBlur ?? captionStyle.shadowBlur ?? 4;
        const letterSpacing = active.letterSpacing ?? captionStyle.letterSpacing;
        const lineHeight = active.lineHeight ?? captionStyle.lineHeight ?? 1.3;
        const textTransform = active.textTransform ?? captionStyle.textTransform ?? "none";
        const badgeIcon = (active as any).badgeIcon ?? (captionStyle as any).badgeIcon;
        
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

        const masked = hasMask(active);
        const effMask = getEffectiveMask(active);
        const hasMaskAnim = Boolean(
          effMask?.maskKeyframes?.length ||
          active.keyframes?.some((k) => k.property.startsWith("mask"))
        );
        const capMaskTime = masked && hasMaskAnim ? Math.round(localTime * 30) / 30 : 0;
        const capMaskUrl = masked ? maskDataUrl(active, capMaskTime, 320, 120, active.keyframes) : null;
        const capMaskStyle: React.CSSProperties = capMaskUrl
          ? {
              WebkitMaskImage: `url(${capMaskUrl})`,
              maskImage: `url(${capMaskUrl})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }
          : {};

        return (
          <div
            key={active.id}
            data-caption-text
            className="absolute select-none pointer-events-none"
            style={{ 
              top: `${yPercent}%`, 
              left: `${xPercent}%`, 
              transform: "translate(-50%, -50%)",
              width: "max-content",
              minWidth: "max-content",
              maxWidth: "none",
              opacity: opacity,
              position: "absolute",
              zIndex: isSelected ? 50 : 10,
              direction: "ltr",
            }}
          >
            {/* Animation Wrapper: isolates animation transforms from position */}
            <div className={`flex justify-center px-1 ${animClass(animation)}`} style={{ width: "max-content", minWidth: "max-content" }}>
              <div 
                className="relative pointer-events-auto group"
                style={{
                  transform: `scale(${scale}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                  transformOrigin: "center center",
                  width: "max-content",
                  minWidth: "max-content",
                }}
                onTouchStart={(e) => handleTouchStart(e, active.id, scale, rotation)}
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
                      textShadow: "0 2px 4px rgba(0,0,0,0.8)"
                    }}
                  />
                ) : (
                  <div
                    onPointerDown={(e) => startDrag(e, active.id, xPercent, yPercent)}
                    onWheel={(e) => handleWheel(e, active.id, scale, rotation)}
                    onDoubleClick={() => beginEdit(active.id, active.text)}
                    dir={captionStyle.language === "ar" ? "rtl" : "ltr"}
                    style={{
                      fontFamily: font,
                      fontSize: Math.min(size, 28),
                      color,
                      background: bg,
                      padding: bgPadding ? `${bgPadding}px ${bgPadding * 2}px` : "4px 12px",
                      borderRadius: bgRadius,
                      whiteSpace: active.isMultiLine ? "pre" : "nowrap",
                      width: "max-content",
                      minWidth: "max-content",
                      maxWidth: "none",
                      textAlign: "center",
                      lineHeight: lineHeight,
                      letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                      textTransform: textTransform,
                      cursor: "grab",
                      touchAction: "none",
                      userSelect: "none",
                      boxShadow: isSelected ? "0 4px 20px rgba(var(--primary-rgb),0.5)" : "0 2px 12px rgba(0,0,0,0.35)",
                      textShadow: shadowColor
                        ? `${active.shadowOffsetX || 0}px ${active.shadowOffsetY || 2}px ${shadowBlur}px ${shadowColor}`
                        : "0 2px 4px rgba(0,0,0,0.8)",
                      WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
                      ...capMaskStyle,
                    }}
                    className={`ring-0 transition-shadow flex items-center justify-center gap-1.5 active:cursor-grabbing ${isSelected ? "ring-2 ring-primary" : "group-hover:ring-2 group-hover:ring-primary/60"}`}
                  >
                  {renderBadgeIcon(badgeIcon)}
                  {active.wordAnimation?.enabled ? (
                    <span className="inline-flex flex-nowrap items-center justify-center gap-x-1 gap-y-0.5" style={{ width: "max-content", minWidth: "max-content" }}>
                      {active.text.split(/\s+/).filter(Boolean).map((word, wIdx, arr) => {
                        const wState = computeWordState(
                          wIdx,
                          arr.length,
                          localTime,
                          Math.max(0.1, active.end - active.start),
                          active.wordAnimation
                        );
                        return (
                          <span
                            key={wIdx}
                            style={{
                              display: "inline-block",
                              opacity: wState.opacity,
                              transform: `scale(${wState.scale}) translateY(${wState.translateY}px)`,
                              color: wState.highlightColor || color,
                              backgroundColor: wState.highlightBg || undefined,
                              padding: wState.highlightBg ? "2px 6px" : undefined,
                              borderRadius: wState.highlightBg ? "6px" : undefined,
                              transition: "transform 0.08s ease-out, opacity 0.08s ease-out, color 0.08s ease-out",
                              whiteSpace: "pre",
                            }}
                          >
                            {word}
                          </span>
                        );
                      })}
                    </span>
                  ) : active.characterAnimation?.enabled ? (
                    <span>
                      {
                        computeCharacterReveal(
                          active.text,
                          localTime,
                          Math.max(0.1, active.end - active.start),
                          active.characterAnimation
                        ).visibleText
                      }
                    </span>
                  ) : (
                    <span>{active.text}</span>
                  )}
                </div>
              )}

              {/* Selection Border & Action Controls */}
              {isSelected && (
                <>
                  {/* Bounding box with dashed border & corner handle controls */}
                  <div className="absolute -inset-1.5 border-2 border-dashed border-amber-400 rounded-lg pointer-events-none z-20">
                    {/* Top-Left: Edit button */}
                    <button
                      type="button"
                      data-caption-handle
                      onTouchStart={(e) => e.stopPropagation()}
                      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); beginEdit(active.id, active.text); }}
                      style={{ touchAction: "none" }}
                      className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-slate-900 border-2 border-amber-400 text-amber-300 flex items-center justify-center shadow-md hover:scale-110 active:scale-90 transition-transform pointer-events-auto cursor-pointer touch-none select-none"
                      title="تعديل النص"
                    >
                      <span className="text-[10px]">✏️</span>
                    </button>

                    {/* Top-Right: Delete button */}
                    <button
                      type="button"
                      data-caption-handle
                      onTouchStart={(e) => e.stopPropagation()}
                      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); removeCaption(active.id); }}
                      style={{ touchAction: "none" }}
                      className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-rose-600 border-2 border-white text-white flex items-center justify-center shadow-md hover:scale-110 active:scale-90 transition-transform pointer-events-auto cursor-pointer touch-none select-none"
                      title="حذف النص"
                    >
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                    </button>

                    {/* Bottom-Right: Rotate & Scale Handle (Touch/Drag around center to rotate & pull in/out to scale) */}
                    <div
                      data-caption-handle
                      onTouchStart={(e) => e.stopPropagation()}
                      onPointerDown={(e) => startRotateScaleDrag(e, active.id, scale, rotation)}
                      style={{ touchAction: "none" }}
                      className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-950 text-slate-950 flex items-center justify-center shadow-md hover:scale-110 active:scale-90 transition-transform pointer-events-auto cursor-grab active:cursor-grabbing touch-none select-none"
                      title="تدوير وتكبير/تصغير باللمس والسحب"
                    >
                      <RotateCw className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

CaptionOverlay.displayName = "CaptionOverlay";
export default CaptionOverlay;
