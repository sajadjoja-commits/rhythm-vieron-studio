import { useRef, useId, ReactNode } from "react";
import { useMedia } from "@/context/MediaContext";

export interface MediaPickerProps {
  accept?: "video" | "image" | "both";
  multiple?: boolean;
  capture?: boolean;
  isNewProject?: boolean;
  onBeforePick?: () => void;
  onPicked?: () => void;
  className?: string;
  children: ReactNode;
}

export const MediaPicker = ({
  accept = "both",
  multiple = true,
  capture = false,
  isNewProject = false,
  onBeforePick,
  onPicked,
  className,
  children,
}: MediaPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addFiles, createNewProjectWithFiles } = useMedia();
  const inputId = useId();

  const acceptAttr =
    accept === "video" ? "video/*" : accept === "image" ? "image/*" : "image/*,video/*";

  const triggerInput = () => {
    try {
      onBeforePick?.();
    } catch (err) {
      console.warn("onBeforePick error:", err);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerInput();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = e.target.files;
      if (files && files.length > 0) {
        console.log(`[MediaPicker] Selected ${files.length} file(s), isNewProject: ${isNewProject}`);
        let items;
        if (isNewProject) {
          items = await createNewProjectWithFiles(files);
        } else {
          items = await addFiles(files);
        }
        if (items && items.length > 0) {
          onPicked?.();
        }
      }
    } catch (err) {
      console.error("[MediaPicker] Error handling selected media files:", err);
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <button
        type="button"
        id={`media-picker-btn-${inputId}`}
        className={className}
        onClick={handleClick}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        id={`media-picker-input-${inputId}`}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        {...(capture ? { capture: "environment" as any } : {})}
        onChange={handleChange}
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -100,
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
};

// Expose globally for Android WebView / Capacitor runtime compatibility
if (typeof window !== "undefined") {
  (window as any).MediaPicker = MediaPicker;
}

export default MediaPicker;

