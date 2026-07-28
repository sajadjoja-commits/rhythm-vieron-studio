import { useRef, useState, useEffect } from "react";
import { useMedia } from "@/context/MediaContext";
import { 
  X, Layers, Plus, Upload, Check, Eye, EyeOff, 
  Settings, Scissors, Trash2, ArrowUp, ArrowDown, 
  ChevronsUp, ChevronsDown, Image as ImageIcon, Video as VideoIcon,
  Clock, Sliders
} from "lucide-react";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  currentTime: number;
}

type TabType = "layers" | "adjust" | "trim";

const OverlayPanel = ({ open, onClose, currentTime }: Props) => {
  const { 
    overlays = [], 
    addOverlay, 
    updateOverlay, 
    removeOverlay, 
    setOverlays, 
    totalDuration 
  } = useMedia();

  const inputRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("layers");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const en = getLang() === "en";

  useEffect(() => {
    if (!open) {
      setIsCollapsed(false);
    }
  }, [open]);

  // Automatically select an active overlay or the first one if nothing is selected
  useEffect(() => {
    if (overlays.length > 0 && !selectedId) {
      const active = overlays.find(o => currentTime >= o.start && currentTime <= o.end);
      if (active) {
        setSelectedId(active.id);
      } else {
        setSelectedId(overlays[0].id);
      }
    } else if (overlays.length === 0) {
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

  // Minimized/Collapsed render mode so the user can easily see their work
  if (isCollapsed) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-300" dir="rtl">
        <div className="bg-card/95 backdrop-blur-xl border border-primary/30 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-muted-foreground">{en ? "Active Overlays:" : "مسارات التراكب:"}</span>
            <span className="text-primary font-extrabold">{overlays.length}</span>
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

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-4 duration-200" dir="rtl">
      <div className="bg-card border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[70vh] overflow-y-auto no-scrollbar pb-6 flex flex-col">
        
        {/* Panel Header */}
        <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-3">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
              <Layers className="w-4 h-4 text-primary-foreground" />
            </div>
            <span>{en ? "PIP Overlay & Sticker" : "التراكب وملصقات الفيديو والصور"}</span>
            <span className="bg-primary/10 text-primary text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              {overlays.length}
            </span>
          </h3>
          
          <div className="flex items-center gap-1.5">
            {/* Collapse to see work button */}
            <button 
              onClick={() => { playSfx("click"); setIsCollapsed(true); }}
              className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 flex items-center gap-1 text-xs font-bold text-foreground transition-all active:scale-90 shadow-sm border border-border/40"
              title={en ? "Minimize library to preview work" : "إخفاء لرؤية العمل"}
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{en ? "See Work" : "رؤية العمل"}</span>
            </button>

            <button 
              onClick={() => { playSfx("success"); onClose(); }} 
              className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white shadow-md transition-all active:scale-90"
              title={en ? "Confirm" : "تأكيد"}
            >
              <Check className="w-4 h-4 text-white stroke-[3px]" />
            </button>
            <button 
              onClick={() => { playSfx("click"); onClose(); }} 
              className="w-8 h-8 rounded-xl bg-secondary hover:bg-secondary/80 flex items-center justify-center border border-border/40 transition-all active:scale-90"
            >
              <X className="w-4.5 h-4.5 text-foreground" />
            </button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFile} />

        {/* Tabs Bar */}
        <div className="grid grid-cols-3 gap-1 bg-secondary/50 p-1 rounded-2xl mb-4 border border-border/20">
          <button
            onClick={() => { playSfx("click"); setActiveTab("layers"); }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "layers" 
                ? "bg-card text-foreground shadow-sm border border-border/20" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{en ? "Layers" : "الطبقات والترتيب"}</span>
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
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              overlays.length === 0 ? "opacity-40 cursor-not-allowed" : ""
            } ${
              activeTab === "adjust" 
                ? "bg-card text-foreground shadow-sm border border-border/20" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{en ? "Tune Properties" : "الضبط والخصائص"}</span>
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
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              overlays.length === 0 ? "opacity-40 cursor-not-allowed" : ""
            } ${
              activeTab === "trim" 
                ? "bg-card text-foreground shadow-sm border border-border/20" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>{en ? "Trim & Timing" : "القص والتوقيت"}</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto max-h-[44vh] no-scrollbar">
          
          {/* TAB 1: LAYERS & OVERLAYS LIST */}
          {activeTab === "layers" && (
            <div className="space-y-3">
              {/* Add New Button */}
              <button
                onClick={() => { playSfx("click"); inputRef.current?.click(); }}
                className="w-full py-3.5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center justify-center gap-2 text-primary font-extrabold text-xs transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>{en ? "Upload New Overlay / Image / Video" : "إضافة تراكب جديد (صورة، ملصق، فيديو)"}</span>
              </button>

              {overlays.length === 0 ? (
                <div className="text-center py-8 bg-secondary/20 rounded-2xl border border-dashed border-border/40">
                  <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2.5 animate-bounce" />
                  <p className="text-xs text-foreground font-semibold">
                    {en ? "No overlays added yet" : "لا توجد تراكبات مضافة بعد"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 max-w-xs mx-auto">
                    {en ? "Upload images, PNGs, stickers, or video clips to overlay on top of your main timeline" : "قم برفع ملفات الصور أو الملصقات أو الفيديوهات لتركيبها فوق المخطط الزمني الرئيسي وتعديل مواضعها"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground font-semibold px-1">
                    {en ? "Select overlay to modify. Drag or use arrows to rearrange overlay depth (bottom is back, top is front)." : "اختر تراكباً من القائمة لتعديله. الطبقات المرتبة بالأسفل تظهر بالخلف، والأعلى تظهر بالمقدمة."}
                  </p>
                  
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
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TRIM & TIMING */}
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

        </div>

        {/* Bottom spacer for safe layout spacing */}
        <div className="mt-2" />
      </div>
    </div>
  );
};

export default OverlayPanel;
