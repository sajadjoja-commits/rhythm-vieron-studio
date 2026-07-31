import { useState, useEffect } from "react";
import { Media, PhotoResponse } from "@capacitor-community/media";
import { X, Check, Image as ImageIcon, Video as VideoIcon, Loader2, Search } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { t, isRTL } from "@/lib/i18n";
import { useMedia } from "@/context/MediaContext";

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
      return;
    }

    try {
      setLoading(true);

      const perm = await Media.requestPermissions();
      if (perm.photos !== 'granted') {
        console.error("Gallery permission denied");
        setLoading(false);
        return;
      }

      const photos = await Media.getMedias({
        quantity: 500, // Load more for a better experience
        types: type === "both" ? ["photos", "videos"] : type === "image" ? ["photos"] : ["videos"],
      });

      // Filter out assets without paths
      const validMedias = photos.medias.filter(m => m.path);
      setAssets(validMedias);
    } catch (err) {
      console.error("Error loading gallery:", err);
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
        // Read file as base64 and convert to blob
        const fileData = await Filesystem.readFile({
          path: asset.path,
        });

        const response = await fetch(`data:${asset.mimeType};base64,${fileData.data}`);
        const blob = await response.blob();
        const file = new File([blob], asset.name || `media_${Date.now()}`, { type: asset.mimeType });
        files.push(file);
      }

      onSelect(files);
    } catch (err) {
      console.error("Error processing selection:", err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 glass sticky top-0 z-10">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary/80 transition-colors">
          <X className="w-6 h-6 text-foreground" />
        </button>
        <h2 className="text-lg font-heading font-bold text-foreground">
          {type === "image" ? t("gallery.photos") : type === "video" ? t("gallery.videos") : t("gallery.title")}
        </h2>
        <button
          onClick={handleDone}
          disabled={selectedIds.length === 0}
          className="px-5 py-2 rounded-xl gradient-primary text-primary-foreground font-bold disabled:opacity-50 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-primary/20"
        >
          {t("common.done")} ({selectedIds.length})
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-1 bg-zinc-950/50">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : assets.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {assets.map((asset) => (
              <div
                key={asset.identifier}
                className="relative aspect-square group cursor-pointer overflow-hidden"
                onClick={() => toggleSelection(asset)}
              >
                <img
                  src={Capacitor.convertFileSrc(asset.path)}
                  alt=""
                  className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${selectedIds.includes(asset.identifier) ? 'opacity-60 scale-95' : 'opacity-100'}`}
                />

                {/* Selection Overlay */}
                <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(asset.identifier) ? 'bg-primary border-primary scale-110' : 'bg-black/20 border-white/50'}`}>
                  {selectedIds.includes(asset.identifier) && <Check className="w-4 h-4 text-white" />}
                </div>

                {/* Video Indicator */}
                {asset.duration > 0 && (
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md">
                    <VideoIcon className="w-3 h-3 text-white" />
                    <span className="text-[10px] font-bold text-white">
                      {Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">{t("gallery.empty")}</p>
            {!Capacitor.isNativePlatform() && (
              <p className="text-xs mt-2 opacity-60">Gallery view is optimized for Android devices</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomGallery;
