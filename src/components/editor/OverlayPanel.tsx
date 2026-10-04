import { useRef, useState, useEffect } from "react";
import { useMedia } from "@/context/MediaContext";
import { 
  X, Layers, Plus, Upload, Check, 
  Settings, Scissors, Trash2, ArrowUp, ArrowDown, 
  ChevronsUp, ChevronsDown, Image as ImageIcon, Video as VideoIcon,
  Clock, Sliders, Circle, Square, Star, Heart, Ban, Diamond
} from "lucide-react";
import type { MaskShape, MaskKeyframe } from "@/lib/maskEngine";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";
import DraggableLibrarySheet from "./DraggableLibrarySheet";

interface Props {
  open: boolean;
  onClose: () => void;
  currentTime: number;
}

type TabType = "layers" | "adjust" | "trim" | "mask";

const OverlayPanel = ({ open, onClose, currentTime }: Props) => {
  const { 
    overlays = [], 
    addOverlay, 
    updateOverlay, 
    removeOverlay, 
    setOverlays, 
    totalDuration,
    clips = [],
    media = [],
    resolveTimelineTime,
    removeClip
  } = useMedia();

  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>("layers");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const en = getLang() === "en";

  const handleConvertVideoToOverlay = () => {
    playSfx("click");
    const resolved = resolveTimelineTime(currentTime);
    if (!resolved || !resolved.clip) {
      toast.error(en ? "No video clip found under playhead" : "لا يوجد مقطع فيديو عند مؤشر التشغيل لتحويله إلى تراكب");
      return;
    }

    const currentClip = resolved.clip;
    const mediaItem = media.find(m => m.id === currentClip.mediaId);
    if (!mediaItem) {
      toast.error(en ? "Media source not found" : "لم يتم العثور على مصدر الفيديو");
      return;
    }

    const overlayId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const clipDur = (currentClip.out - currentClip.in) / (currentClip.speed || 1);
    const start = Math.max(0, resolved.clipStart);
    const end = Math.min(totalDuration, start + clipDur);

    const newOverlay = {
      id: overlayId,
      url: mediaItem.url,
      file: mediaItem.file,
      type: (mediaItem.type === "video" ? "video" : "image") as "video" | "image",
      name: `${mediaItem.name || (en ? "Clip" : "مقطع")} (${en ? "Overlay" : "تراكب"})`,
      start,
      end,
      x: 50,
      y: 50,
      scale: 0.5,
      opacity: 1,
      rotation: 0,
      blend: "normal" as const,
      brightness: 1,
    };

    setOverlays(prev => [...prev, newOverlay]);
    setSelectedId(overlayId);
    setActiveTab("layers");

    toast.success(
      en ? "Video converted to PIP Overlay successfully!" : "تم تحويل مقطع الفيديو إلى طبقة تراكب (PIP) بنجاح!",
      {
        action: clips.length > 1 ? {
          label: en ? "Remove Original Clip" : "حذف المقطع الأصلي",
          onClick: () => {
            removeClip(currentClip.id);
            toast.success(en ? "Original clip removed from main track" : "تم حذف المقطع الأصلي من المسار الرئيسي");
          }
        } : undefined
      }
    );
  };

  // Automatically select an active overlay or the first one if nothing is selected
  useEffect(() => {
    if (overlays.length > 0 && !selectedId) {
      const active = overlays.find(o => currentTime >= o.start && currentTime <= o.end);
      if (active) {
        setSelectedId(active.id);
      } else {
        setSelectedId(overlays[0].id);
      }
    } else if (overlays.length === 0 && selectedId !== null) {
      setSelectedId(null);
    }
  }, [overlays, currentTime, selectedId]);

  if (!open) return null;

  const selectedOverlay = overlays.find(o => o.id === selectedId);

  // Layer Sorting actions:
  // In our rendering, overlays later in the array are drawn on top.
  // Move Up (Bring Forward) = shift right (index + 1)
  const moveUp = (index: number) => {
    if (index >= overlays.length - 1) return;
    const copy = [...overlays];
    const temp = copy[index];
    copy[index] = copy[index + 1];
    copy[index + 1] = temp;
    setOverlays(copy);
    playSfx("click");
    toast.success(en ? "Moved layer forward" : "تم نقل الطبقة للأمام");
  };

  // Move Down (Send Backward) = shift left (index - 1)
  const moveDown = (index: number) => {
    if (index <= 0) return;
    const copy = [...overlays];
    const temp = copy[index];
    copy[index] = copy[index - 1];
    copy[index - 1] = temp;
    setOverlays(copy);
    playSfx("click");
    toast.success(en ? "Moved layer backward" : "تم نقل الطبقة للخلف");
  };

  const bringToFront = (index: number) => {
    if (index >= overlays.length - 1) return;
    const copy = [...overlays];
    const [item] = copy.splice(index, 1);
    copy.push(item);
    setOverlays(copy);
    playSfx("success");
    toast.success(en ? "Brought layer to front" : "تم إحضار الطبقة للمقدمة");
  };

  const sendToBack = (index: number) => {
    if (index <= 0) return;
    const copy = [...overlays];
    const [item] = copy.splice(index, 1);
    copy.unshift(item);
    setOverlays(copy);
    playSfx("success");
    toast.success(en ? "Sent layer to back" : "تم إرسال الطبقة للمؤخرة");
  };

  // Handle local file uploads
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    let addedCount = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      const id = await addOverlay(file);
      // Give a default length of 4 seconds or remaining duration
      const duration = Math.min(4, Math.max(1, totalDuration - currentTime));
      updateOverlay(id, { start: currentTime, end: currentTime + duration });
      setSelectedId(id);
      addedCount++;
    }
    if (inputRef.current) inputRef.current.value = "";
    if (addedCount > 0) {
      setActiveTab("layers");
    }
  };

  return (
    <DraggableLibrarySheet
      id="overlay-panel-root"
      open={open}
      onClose={onClose}
      dir={en ? "ltr" : "rtl"}
      defaultVh={54}
      icon={<Layers className="w-3.5 h-3.5 text-primary-foreground" />}
      title={en ? "Overlays & Stickers" : "التراكب والملصقات"}
      badge={
        overlays.length > 0 ? (
          <span className="text-[10px] text-primary font-bold font-mono">· {overlays.length}</span>
        ) : null
      }
      headerActions={
        <button
          type="button"
          onClick={() => { playSfx("click"); inputRef.current?.click(); }}
          className="h-7 px-2.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-bold border border-primary/30 flex items-center gap-1 transition-all active:scale-95"
        >
          <Plus className="w-3 h-3" />
          <span>{en ? "Add" : "إضافة"}</span>
        </button>
      }
      subHeader={
        <div className="grid grid-cols-4 gap-1 bg-secondary/40 p-1 rounded-xl border border-border/30">
          <button
            onClick={() => { playSfx("click"); setActiveTab("layers"); }}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeTab === "layers" 
                ? "bg-primary text-primary-foreground shadow-xs" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{en ? "Layers" : "الطبقات"}</span>
          </button>
          
          <button
            onClick={() => { 
              if (overlays.length === 0) {
                toast.error(en ? "Please add an overlay first" : "يرجى إضافة تراكب أولاً");
                return;
              }
              playSfx("click"); 
              setActiveTab("adjust"); 
            }}
            disabled={overlays.length === 0}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              overlays.length === 0 ? "opacity-40 cursor-not-allowed" : ""
            } ${
              activeTab === "adjust" 
                ? "bg-primary text-primary-foreground shadow-xs" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>{en ? "Adjust" : "الخصائص"}</span>
          </button>

          <button
            onClick={() => { 
              if (overlays.length === 0) {
                toast.error(en ? "Please add an overlay first" : "يرجى إضافة تراكب أولاً");
                return;
              }
              playSfx("click"); 
              setActiveTab("trim"); 
            }}
            disabled={overlays.length === 0}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              overlays.length === 0 ? "opacity-40 cursor-not-allowed" : ""
            } ${
              activeTab === "trim" 
                ? "bg-primary text-primary-foreground shadow-xs" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Scissors className="w-3 h-3" />
            <span>{en ? "Trim" : "التوقيت"}</span>
          </button>
          <button
            onClick={() => {
              if (overlays.length === 0) {
                toast.error(en ? "Please add an overlay first" : "يرجى إضافة تراكب أولاً");
                return;
              }
              playSfx("click");
              setActiveTab("mask");
            }}
            disabled={overlays.length === 0}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              overlays.length === 0 ? "opacity-40 cursor-not-allowed" : ""
            } ${
              activeTab === "mask"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Circle className="w-3 h-3" />
            <span>{en ? "Mask" : "قناع"}</span>
          </button>
        </div>
      }
    >
      {/* Hidden File Input */}
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFile} />

          {/* TAB 1: LAYERS & OVERLAYS LIST */}
          {activeTab === "layers" && (
            <div className="space-y-2.5">
              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { playSfx("click"); inputRef.current?.click(); }}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center justify-center gap-1.5 text-primary font-bold text-xs transition-all active:scale-[0.98]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="truncate">{en ? "Upload Image/Video" : "رفع صورة أو فيديو"}</span>
                </button>

                <button
                  onClick={handleConvertVideoToOverlay}
                  className="w-full py-2.5 px-3 rounded-xl border border-border bg-secondary/60 hover:bg-secondary flex items-center justify-center gap-1.5 text-foreground font-bold text-xs transition-all active:scale-[0.98]"
                  title={en ? "Convert current video clip under playhead to PIP overlay" : "تحويل مقطع الفيديو عند مؤشر التشغيل إلى طبقة تراكب"}
                >
                  <VideoIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="truncate">{en ? "Clip to Overlay" : "تحويل المقطع لتراكب"}</span>
                </button>
              </div>

              {overlays.length === 0 ? (
                <div className="text-center py-6 bg-secondary/20 rounded-2xl border border-dashed border-border/40">
                  <Layers className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">
                    {en ? "No overlays added yet" : "لا توجد طبقات تراكب مضافة بعد"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {overlays.map((o, idx) => {
                    const isSelected = o.id === selectedId;
                    return (
                      <div 
                        key={o.id} 
                        onClick={() => setSelectedId(o.id)}
                        className={`flex items-center gap-3 bg-card rounded-2xl p-2.5 border-2 transition-all cursor-pointer ${
                          isSelected 
                            ? "border-primary bg-primary/5 shadow-md" 
                            : "border-border/50 hover:border-border/80 bg-secondary/20"
                        }`}
                      >
                        {/* Thumbnail / Indicator */}
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-border/40 flex-shrink-0 flex items-center justify-center">
                          {o.type === "image" ? (
                            <>
                              <img src={o.url} alt="" className="w-full h-full object-cover" />
                              <div className="absolute bottom-0.5 right-0.5 bg-black/60 rounded p-0.5">
                                <ImageIcon className="w-2.5 h-2.5 text-white" />
                              </div>
                            </>
                          ) : (
                            <>
                              <video src={o.url} className="w-full h-full object-cover" muted />
                              <div className="absolute bottom-0.5 right-0.5 bg-black/60 rounded p-0.5">
                                <VideoIcon className="w-2.5 h-2.5 text-white" />
                              </div>
                            </>
                          )}
                          
                          {/* Selected marker */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Check className="w-5 h-5 text-primary stroke-[3.5px] drop-shadow-md" />
                            </div>
                          )}
                        </div>

                        {/* Name and Duration Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {o.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded font-mono">
                              {o.start.toFixed(1)}s → {o.end.toFixed(1)}s
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {en ? "Layer" : "طبقة"} #{idx + 1}
                            </span>
                          </div>
                        </div>

                        {/* Layer Depth Controls */}
                        <div className="flex items-center gap-1 border-r border-border/40 pr-2 mr-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); sendToBack(idx); }}
                            disabled={idx === 0}
                            className="p-1 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground hover:text-primary transition-all disabled:opacity-30"
                            title={en ? "Send to bottom layer" : "إرسال لآخر طبقة بالخلف"}
                          >
                            <ChevronsDown className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); moveDown(idx); }}
                            disabled={idx === 0}
                            className="p-1 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground hover:text-primary transition-all disabled:opacity-30"
                            title={en ? "Send layer backward" : "نقل لأسفل"}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); moveUp(idx); }}
                            disabled={idx === overlays.length - 1}
                            className="p-1 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground hover:text-primary transition-all disabled:opacity-30"
                            title={en ? "Bring layer forward" : "نقل لأعلى"}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); bringToFront(idx); }}
                            disabled={idx === overlays.length - 1}
                            className="p-1 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground hover:text-primary transition-all disabled:opacity-30"
                            title={en ? "Bring to top layer" : "إحضار لأول طبقة بالمقدمة"}
                          >
                            <ChevronsUp className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Delete Action */}
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            playSfx("click");
                            removeOverlay(o.id);
                            toast.success(en ? "Removed overlay" : "تم حذف التراكب بنجاح");
                          }} 
                          className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all ml-1"
                          title={en ? "Delete" : "حذف"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EDIT PROPERTIES & TUNE SLIDERS */}
          {activeTab === "adjust" && (
            <div className="space-y-4">
              {!selectedOverlay ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {en ? "Please select an overlay from the Layers tab to tune" : "الرجاء تحديد تراكب من علامة تبويب 'الطبقات والترتيب' للبدء في ضبطه"}
                </p>
              ) : (
                <div className="bg-secondary/25 p-4 rounded-2xl border border-border/30 space-y-4">
                  <div className="flex items-center gap-2 border-b border-border/40 pb-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-xs font-bold text-foreground truncate">{en ? "Adjusting:" : "تعديل خصائص:"} {selectedOverlay.name}</span>
                  </div>

                  {/* Scale (الحجم) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Scale / Size" : "الحجم والقياس"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {Math.round(selectedOverlay.scale * 100)}%
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={10} 
                      max={300} 
                      step={1} 
                      value={Math.round(selectedOverlay.scale * 100)}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { scale: Number(e.target.value) / 100 })}
                      className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                    />
                  </div>

                  {/* Opacity (الشفافية) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Opacity / Transparency" : "الشفافية والوضوح"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {Math.round((selectedOverlay.opacity ?? 1) * 100)}%
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={100} 
                      step={1} 
                      value={Math.round((selectedOverlay.opacity ?? 1) * 100)}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { opacity: Number(e.target.value) / 100 })}
                      className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                    />
                  </div>

                  {/* Brightness (السطوع) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Brightness" : "السطوع والإضاءة"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {Math.round((selectedOverlay.brightness ?? 1) * 100)}%
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={200} 
                      step={1} 
                      value={Math.round((selectedOverlay.brightness ?? 1) * 100)}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { brightness: Number(e.target.value) / 100 })}
                      className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                    />
                  </div>

                  {/* Rotation (الدوران) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Rotation" : "زاوية الدوران"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {selectedOverlay.rotation ?? 0}°
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={-180} 
                      max={180} 
                      step={1} 
                      value={selectedOverlay.rotation ?? 0}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { rotation: Number(e.target.value) })}
                      className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                    />
                  </div>

                  {/* Blend Mode (نوع الدمج) */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-foreground">{en ? "Blend Mode / Screen Effect" : "نوع دمج الألوان (Blend Mode)"}</span>
                    <select 
                      value={selectedOverlay.blend ?? "normal"}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { blend: e.target.value })}
                      className="w-full text-xs bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                    >
                      <option value="normal">{en ? "Normal Blend" : "مزج طبيعي عادي"}</option>
                      <option value="screen">{en ? "Screen (Glow/Remove Black)" : "إضاءة ووهج (Screen)"}</option>
                      <option value="lighten">{en ? "Lighten" : "تفتيح الألوان (Lighten)"}</option>
                      <option value="multiply">{en ? "Multiply (Darken/Remove White)" : "تعتيم وإزالة الأبيض (Multiply)"}</option>
                      <option value="overlay">{en ? "Overlay Contrast" : "تراكب وتباين لوني (Overlay)"}</option>
                      <option value="soft-light">{en ? "Soft Light Glow" : "إضاءة ناعمة خفيفة (Soft Light)"}</option>
                    </select>
                  </div>

                  {/* Position Presets (قوالب التموضع السريع) */}
                  <div className="space-y-1.5 pt-2 border-t border-border/30">
                    <span className="text-xs font-bold text-foreground">{en ? "Position Presets" : "المحاذاة والتموضع السريع"}</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: en ? "Center" : "المنتصف", x: 50, y: 50, scale: 0.6 },
                        { label: en ? "Top Left" : "أعلى يسار", x: 25, y: 25, scale: 0.4 },
                        { label: en ? "Top Right" : "أعلى يمين", x: 75, y: 25, scale: 0.4 },
                        { label: en ? "Bottom Left" : "أسفل يسار", x: 25, y: 75, scale: 0.4 },
                        { label: en ? "Bottom Right" : "أسفل يمين", x: 75, y: 75, scale: 0.4 },
                        { label: en ? "PiP Corner" : "زاوية PiP", x: 80, y: 80, scale: 0.32 },
                      ].map((pos, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            playSfx("click");
                            updateOverlay(selectedOverlay.id, { x: pos.x, y: pos.y, scale: pos.scale });
                          }}
                          className="py-1.5 px-2 text-[10px] font-medium rounded-lg bg-background hover:bg-secondary border border-border/40 text-foreground transition-all active:scale-95"
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Corner Radius (استدارة الحواف) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Rounded Corners" : "استدارة الحواف (Rounded Corners)"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {selectedOverlay.cornerRadius ?? 8}px
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={40} 
                      step={1} 
                      value={selectedOverlay.cornerRadius ?? 8}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { cornerRadius: Number(e.target.value) })}
                      className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                    />
                  </div>

                  {/* Border Width & Color (الإطار الخارجي) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Border" : "حدود الإطار (Border)"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {selectedOverlay.borderWidth ?? 0}px
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min={0} 
                        max={10} 
                        step={1} 
                        value={selectedOverlay.borderWidth ?? 0}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { borderWidth: Number(e.target.value) })}
                        className="flex-1 h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                      />
                      <input 
                        type="color" 
                        value={selectedOverlay.borderColor || "#ffffff"}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { borderColor: e.target.value })}
                        className="w-7 h-7 rounded-lg border border-border cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Shadow Blur (الظل والعمق) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{en ? "Shadow Depth" : "ظل التراكب (Shadow Depth)"}</span>
                      <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                        {selectedOverlay.shadowBlur ?? 0}px
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={30} 
                      step={1} 
                      value={selectedOverlay.shadowBlur ?? 0}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { shadowBlur: Number(e.target.value) })}
                      className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                    />
                  </div>

                  {/* Video Overlay Audio Controls (خاص بتراكبات الفيديو) */}
                  {selectedOverlay.type === "video" && (
                    <div className="space-y-2 pt-2 border-t border-border/30">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <VideoIcon className="w-3.5 h-3.5 text-primary" />
                        <span>{en ? "Video Overlay Audio" : "صوت فيديو التراكب"}</span>
                      </span>

                      <div className="flex items-center justify-between p-2.5 bg-background rounded-xl border border-border/40">
                        <span className="text-xs text-foreground font-medium">{en ? "Mute Overlay Audio" : "كتم صوت التراكب"}</span>
                        <button
                          type="button"
                          onClick={() => {
                            playSfx("click");
                            updateOverlay(selectedOverlay.id, { muted: !(selectedOverlay.muted ?? true) });
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            selectedOverlay.muted ?? true
                              ? "bg-secondary text-muted-foreground border border-border"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {selectedOverlay.muted ?? true ? (en ? "Muted" : "مكتوم") : (en ? "Active" : "مفعّل")}
                        </button>
                      </div>

                      {!(selectedOverlay.muted ?? true) && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-foreground">
                            <span>{en ? "Overlay Volume" : "مستوى صوت التراكب"}</span>
                            <span className="text-primary text-[10px] font-mono">
                              {Math.round((selectedOverlay.volume ?? 1) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range" 
                            min={0} 
                            max={100} 
                            step={1} 
                            value={Math.round((selectedOverlay.volume ?? 1) * 100)}
                            onChange={(e) => updateOverlay(selectedOverlay.id, { volume: Number(e.target.value) / 100 })}
                            className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" 
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TRIM & TIMING */}
          {activeTab === "mask" && selectedOverlay && (() => {
            const o = selectedOverlay;
            const eff = o.mask || o;
            const shape = eff.maskShape ?? o.maskShape ?? "none";
            const local = Math.max(0, currentTime - o.start);
            const kfs = eff.maskKeyframes || o.maskKeyframes || [];
            const kfAtNow = kfs.find(k => Math.abs(k.time - local) < 0.05);
            const updateOvMask = (patch: Record<string, any>) => {
              const nextMask = {
                maskShape: eff.maskShape ?? o.maskShape ?? "none",
                maskX: eff.maskX ?? o.maskX ?? 50,
                maskY: eff.maskY ?? o.maskY ?? 50,
                maskSize: eff.maskSize ?? o.maskSize ?? 100,
                maskWidth: eff.maskWidth ?? o.maskWidth ?? 100,
                maskHeight: eff.maskHeight ?? o.maskHeight ?? 100,
                maskFeather: eff.maskFeather ?? o.maskFeather ?? 0,
                maskInverted: eff.maskInverted ?? o.maskInverted ?? false,
                maskKeyframes: eff.maskKeyframes ?? o.maskKeyframes,
                maskPath: eff.maskPath ?? o.maskPath,
                ...patch,
              };
              updateOverlay(o.id, { ...patch, mask: nextMask } as any);
            };
            const shapes: { id: MaskShape; icon: any; label: string }[] = [
              { id: "none", icon: Ban, label: en ? "None" : "بدون" },
              { id: "circle", icon: Circle, label: en ? "Circle" : "دائرة" },
              { id: "rectangle", icon: Square, label: en ? "Rect" : "مستطيل" },
              { id: "rounded-rectangle", icon: Diamond, label: en ? "Rounded" : "حواف دائرية" },
              { id: "star", icon: Star, label: en ? "Star" : "نجمة" },
              { id: "heart", icon: Heart, label: en ? "Heart" : "قلب" },
            ];
            const slider = (label: string, key: "maskX" | "maskY" | "maskSize" | "maskWidth" | "maskHeight" | "maskFeather", min: number, max: number, def: number, unit: string) => (
              <div className="space-y-1.5" key={key}>
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span>{label}</span>
                  <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-mono">{Math.round(((eff as any)[key] ?? (o as any)[key]) ?? def)}{unit}</span>
                </div>
                <input type="range" min={min} max={max} step={1} value={((eff as any)[key] ?? (o as any)[key]) ?? def}
                  onChange={(e) => updateOvMask({ [key]: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg accent-primary bg-secondary cursor-pointer" />
              </div>
            );
            const addKf = () => {
              playSfx("click");
              const k: MaskKeyframe = { time: local, x: eff.maskX ?? o.maskX ?? 50, y: eff.maskY ?? o.maskY ?? 50, size: eff.maskSize ?? o.maskSize ?? 100 };
              const next = [...kfs.filter(x => Math.abs(k.time - local) >= 0.05), k].sort((a, b) => a.time - b.time);
              updateOvMask({ maskKeyframes: next });
              toast.success(en ? "Mask keyframe added" : "تمت إضافة إطار مفتاحي للقناع");
            };
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-6 gap-1.5">
                  {shapes.map(s => {
                    const Icon = s.icon;
                    return (
                      <button key={s.id} type="button"
                        onClick={() => { playSfx("click"); updateOvMask({ maskShape: s.id }); }}
                        className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[9px] font-bold transition-all active:scale-95 ${shape === s.id ? "border-primary bg-primary/10 text-primary" : "border-border/40 bg-background text-muted-foreground"}`}>
                        <Icon className="w-4 h-4" />
                        <span className="truncate max-w-full">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
                {shape !== "none" && (
                  <>
                    {slider(en ? "Mask Size" : "حجم القناع", "maskSize", 10, 200, 100, "%")}
                    {slider(en ? "Horizontal Position" : "الموضع الأفقي", "maskX", 0, 100, 50, "%")}
                    {slider(en ? "Vertical Position" : "الموضع العمودي", "maskY", 0, 100, 50, "%")}
                    {slider(en ? "Width Stretch" : "تمديد العرض", "maskWidth", 20, 200, 100, "%")}
                    {slider(en ? "Height Stretch" : "تمديد الارتفاع", "maskHeight", 20, 200, 100, "%")}
                    {slider(en ? "Feather / Softness" : "نعومة الحواف", "maskFeather", 0, 50, 0, "px")}
                    <label className="flex items-center justify-between text-xs font-bold text-foreground bg-background border border-border/40 rounded-xl px-3 py-2">
                      <span>{en ? "Invert mask" : "عكس القناع"}</span>
                      <input type="checkbox" checked={!!(eff.maskInverted ?? o.maskInverted)} onChange={(e) => updateOvMask({ maskInverted: e.target.checked })} className="w-4 h-4 accent-primary" />
                    </label>
                    <div className="space-y-2 pt-2 border-t border-border/30">
                      <div className="flex gap-2">
                        <button type="button" onClick={addKf} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold active:scale-95">
                          {kfAtNow ? (en ? "Update keyframe" : "تحديث الإطار المفتاحي") : (en ? "Add keyframe at playhead" : "إضافة إطار مفتاحي عند المؤشر")}
                        </button>
                        {kfs.length > 0 && (
                          <button type="button" onClick={() => { playSfx("click"); updateOvMask({ maskKeyframes: [] }); }} className="px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold active:scale-95">
                            {en ? "Clear" : "مسح"}
                          </button>
                        )}
                      </div>
                      {kfs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {kfs.map((k, i) => (
                            <button key={i} type="button" onClick={() => updateOvMask({ maskKeyframes: kfs.filter((_, j) => j !== i) })}
                              className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                              {k.time.toFixed(2)}s ✕
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground">{en ? "Move the playhead, adjust position/size, then add a keyframe to animate the mask." : "حرّك المؤشر، عدّل الموضع والحجم، ثم أضف إطاراً مفتاحياً لتحريك القناع."}</p>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {activeTab === "trim" && (
            <div className="space-y-4">
              {!selectedOverlay ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {en ? "Please select an overlay from the Layers tab to trim" : "الرجاء تحديد تراكب من علامة تبويب 'الطبقات والترتيب' لقص وقته"}
                </p>
              ) : (
                <div className="bg-secondary/25 p-4 rounded-2xl border border-border/30 space-y-4">
                  <div className="flex items-center gap-2 border-b border-border/40 pb-2 mb-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground truncate">{en ? "Trimming Timeline:" : "تعديل توقيت الظهور والمستجدات:"} {selectedOverlay.name}</span>
                  </div>

                  {/* Current Time Indicator helper */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{en ? "Current Playhead Position:" : "مؤشر التوقيت الحالي للفيديو:"}</span>
                    <span className="text-xs font-extrabold text-primary font-mono">{currentTime.toFixed(2)}s / {totalDuration.toFixed(1)}s</span>
                  </div>

                  {/* Time controls inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-muted-foreground font-bold">{en ? "Start Time (sec)" : "توقيت البدء (ثانية)"}</label>
                      <input 
                        type="number" 
                        min={0} 
                        max={totalDuration} 
                        step={0.1}
                        value={Number(selectedOverlay.start.toFixed(2))}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(totalDuration, Number(e.target.value)));
                          updateOverlay(selectedOverlay.id, { start: val, end: Math.max(val + 0.2, selectedOverlay.end) });
                        }}
                        className="w-full text-xs font-mono bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-muted-foreground font-bold">{en ? "End Time (sec)" : "توقيت الانتهاء (ثانية)"}</label>
                      <input 
                        type="number" 
                        min={selectedOverlay.start + 0.1} 
                        max={totalDuration} 
                        step={0.1}
                        value={Number(selectedOverlay.end.toFixed(2))}
                        onChange={(e) => {
                          const val = Math.max(selectedOverlay.start + 0.2, Math.min(totalDuration, Number(e.target.value)));
                          updateOverlay(selectedOverlay.id, { end: val });
                        }}
                        className="w-full text-xs font-mono bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick-snap buttons (أزرار الاختصار الذكي) */}
                  <div className="space-y-2 pt-1 border-t border-border/30">
                    <span className="text-[11px] font-bold text-muted-foreground">{en ? "Quick Align Actions" : "أزرار المحاذاة والقص السريع للوقت الحالي"}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          playSfx("click");
                          const startVal = Math.min(currentTime, totalDuration - 0.2);
                          updateOverlay(selectedOverlay.id, { 
                            start: startVal, 
                            end: Math.max(startVal + 0.2, selectedOverlay.end) 
                          });
                          toast.success(en ? "Start time set to current" : "تم ضبط توقيت البداية عند الوقت الحالي");
                        }}
                        className="py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 border border-border/40 text-xs text-foreground font-bold transition-all active:scale-95 flex items-center justify-center gap-1"
                      >
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span>{en ? "Start at Current" : "البدء عند المؤشر"}</span>
                      </button>

                      <button
                        onClick={() => {
                          playSfx("click");
                          const endVal = Math.max(currentTime, selectedOverlay.start + 0.2);
                          updateOverlay(selectedOverlay.id, { end: endVal });
                          toast.success(en ? "End time set to current" : "تم ضبط توقيت الانتهاء عند الوقت الحالي");
                        }}
                        className="py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 border border-border/40 text-xs text-foreground font-bold transition-all active:scale-95 flex items-center justify-center gap-1"
                      >
                        <Clock className="w-3.5 h-3.5 text-destructive" />
                        <span>{en ? "End at Current" : "الانتهاء عند المؤشر"}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-2">
                      <button
                        onClick={() => {
                          playSfx("success");
                          // Make it spanning the entire totalDuration of the video project!
                          updateOverlay(selectedOverlay.id, { start: 0, end: totalDuration });
                          toast.success(en ? "Stretched to full duration" : "تم تمديد التراكب لكامل طول الفيديو");
                        }}
                        className="py-2.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-xs text-primary font-bold transition-all active:scale-95 flex items-center justify-center gap-1 border border-primary/20"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{en ? "Span Full Video Project" : "تمديد لكامل مدة المخطط الزمني"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
    </DraggableLibrarySheet>
  );
};

export default OverlayPanel;
