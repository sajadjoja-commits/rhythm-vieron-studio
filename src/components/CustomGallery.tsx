import { useState, useEffect } from "react";
import { X, Check, Image as ImageIcon, Video as VideoIcon, Loader2, RefreshCw, Layers } from "lucide-react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { t, isRTL } from "@/lib/i18n";
import { useMedia } from "@/context/MediaContext";

const VireonMedia = registerPlugin<any>("VireonMedia");

interface CustomGalleryProps {
  onClose: () => void;
  onSelect: (files: FileList | File[]) => void;
  type?: "image" | "video" | "both";
}

const CustomGallery = ({ onClose, onSelect, type = "both" }: CustomGalleryProps) => {
  const [assets, setAssets] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { addFiles } = useMedia();

  useEffect(() => {
    loadAssets();
  }, [type]);

  const loadAssets = async () => {
    if (!Capacitor.isNativePlatform()) {
      setLoading(false);
      setAssets([
        { identifier: 'd1', name: 'Demo 1', path: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe', mimeType: 'image/jpeg' },
        { identifier: 'd2', name: 'Demo 2', path: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113', mimeType: 'image/jpeg' },
      ]);
      return;
    }

    try {
      setLoading(true);
      console.log("[Vieron Native] Fetching gallery assets...");

      const response = await VireonMedia.getGalleryAssets({ type });
      setAssets(response.assets || []);
    } catch (err) {
      console.error("[Vieron Native] Gallery Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (asset: any) => {
    setSelectedIds(prev =>
      prev.includes(asset.identifier)
        ? prev.filter(id => id !== asset.identifier)
        : [...prev, asset.identifier]
    );
  };

  const handleDone = async () => {
    setLoading(true);
    try {
      const selectedAssets = assets.filter(a => selectedIds.includes(a.identifier));
      const files: File[] = [];

      for (const asset of selectedAssets) {
        try {
          const fileData = await Filesystem.readFile({
            path: asset.path,
          });

          const response = await fetch(`data:${asset.mimeType};base64,${fileData.data}`);
          const blob = await response.blob();
          const file = new File([blob], asset.name || `vieron_${Date.now()}`, { type: asset.mimeType });
          files.push(file);
        } catch (e) {
          console.error(`Failed to read file: ${asset.path}`, e);
        }
      }

      if (files.length > 0) onSelect(files);
    } catch (err) {
      console.error("Error processing selection:", err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col animate-in fade-in slide-in-from-bottom duration-500">
      {/* Glossy Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-zinc-900/40 backdrop-blur-2xl sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <X className="w-6 h-6 text-white" />
          </button>
          <div>
            <h2 className="text-base font-heading font-extrabold text-white uppercase tracking-tight">
              {type === "image" ? t("gallery.photos") : type === "video" ? t("gallery.videos") : t("gallery.title")}
            </h2>
            <p className="text-[10px] text-primary font-bold">{assets.length} FILES FOUND</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadAssets} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <RefreshCw className={`w-5 h-5 text-white/70 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleDone}
            disabled={selectedIds.length === 0 || loading}
            className="px-6 py-2.5 rounded-2xl gradient-primary text-white font-black text-sm disabled:opacity-30 transition-all active:scale-95"
          >
            {t("common.done").toUpperCase()}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-1 bg-zinc-950">
        {loading && assets.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-xs font-bold text-white/40 tracking-widest animate-pulse">ACCESSING DEVICE STORAGE...</p>
          </div>
        ) : assets.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {assets.map((asset) => (
              <div
                key={asset.identifier}
                className="relative aspect-square group cursor-pointer overflow-hidden bg-zinc-900"
                onClick={() => toggleSelection(asset)}
              >
                <img
                  src={Capacitor.convertFileSrc(asset.path)}
                  alt=""
                  className={`w-full h-full object-cover transition-all duration-500 ${selectedIds.includes(asset.identifier) ? 'opacity-40 scale-90 saturate-0' : 'opacity-100 group-hover:scale-110'}`}
                  loading="lazy"
                />

                <div className={`absolute top-2 right-2 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${selectedIds.includes(asset.identifier) ? 'bg-primary border-primary scale-100 shadow-lg shadow-primary/40' : 'bg-black/40 border-white/20 scale-75 opacity-0 group-hover:opacity-100'}`}>
                  {selectedIds.includes(asset.identifier) && <Check className="w-4 h-4 text-white stroke-[3px]" />}
                </div>

                {asset.duration > 0 && (
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
                    <VideoIcon className="w-3 h-3 text-white" />
                    <span className="text-[10px] font-black text-white">
                      {Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
            <ImageIcon className="w-16 h-16 mb-4 opacity-10" />
            <h3 className="text-white font-bold mb-2 uppercase">{t("gallery.empty")}</h3>
            <button
              onClick={loadAssets}
              className="mt-4 px-8 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              {t("gallery.retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomGallery;
