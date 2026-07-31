import { useRef, ReactNode, useState, lazy, Suspense } from "react";
import { useMedia } from "@/context/MediaContext";
import CustomGallery from "./CustomGallery";

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
  const [showGallery, setShowGallery] = useState(false);
  const { addFiles } = useMedia();

  const handleClick = () => {
    onBeforePick?.();
    setShowGallery(true);
  };

  const handleSelect = async (files: FileList | File[]) => {
    const items = await addFiles(files);
    if (items.length > 0) onPicked?.();
    setShowGallery(false);
  };

  return (
    <>
      <button type="button" className={className} onClick={handleClick}>
        {children}
      </button>

      {showGallery && (
        <CustomGallery
          type={accept}
          onClose={() => setShowGallery(false)}
          onSelect={handleSelect}
        />
      )}
    </>
  );
};

export default MediaPicker;
