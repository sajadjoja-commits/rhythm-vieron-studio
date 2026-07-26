import { useRef, ReactNode } from "react";
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

  const handleClick = () => {
    onBeforePick?.();
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
