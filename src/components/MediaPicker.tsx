import { useRef, ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera } from "@capacitor/camera";
import { useMedia } from "@/context/MediaContext";

interface MediaPickerProps {
  accept?: "video" | "image" | "both";
  multiple?: boolean;
  capture?: boolean;
  onBeforePick?: () => void;
  onPicked?: () => void;
  className?: string;
  children: ReactNode;
}

const MediaPicker = ({
  accept = "both",
  multiple = true,
  capture = false,
  onBeforePick,
  onPicked,
  className,
  children,
}: MediaPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addFiles } = useMedia();

  const acceptAttr =
    accept === "video" ? "video/*" : accept === "image" ? "image/*" : "video/*,image/*";

  const handleClick = async () => {
    onBeforePick?.();

    if (Capacitor.isNativePlatform()) {
      try {
        // Request runtime permissions on Android/iOS
        await Camera.requestPermissions({ permissions: ["photos"] });
      } catch (err) {
        console.warn("Camera requestPermissions failed or ignored:", err);
      }

      // If selecting images on native platform, use Camera.pickImages
      if (accept === "image" || (accept === "both" && !capture)) {
        try {
          const result = await Camera.pickImages({ quality: 90, limit: multiple ? 0 : 1 });
          if (result.photos && result.photos.length > 0) {
            const pickedFiles: File[] = [];
            for (let i = 0; i < result.photos.length; i++) {
              const photo = result.photos[i];
              if (photo.webPath) {
                const response = await fetch(photo.webPath);
                const blob = await response.blob();
                const mimeType = blob.type || `image/${photo.format || "jpeg"}`;
                const file = new File([blob], `photo_${Date.now()}_${i}.${photo.format || "jpg"}`, { type: mimeType });
                pickedFiles.push(file);
              }
            }
            if (pickedFiles.length > 0) {
              const items = await addFiles(pickedFiles);
              if (items.length > 0) onPicked?.();
              return;
            }
          }
        } catch (err) {
          console.warn("Camera.pickImages cancelled or failed, falling back to input:", err);
        }
      }
    }

    // Fallback to standard input click (Web or Videos or Native fallback)
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const items = await addFiles(files);
      if (items.length > 0) onPicked?.();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <button type="button" className={className} onClick={handleClick}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        {...(capture ? { capture: "environment" as any } : {})}
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
};

export default MediaPicker;
