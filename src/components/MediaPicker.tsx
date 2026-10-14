import { useRef, useId, ReactNode } from "react";
import { useMedia } from "@/context/MediaContext";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";

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

  const handleFiles = async (files: FileList | File[]) => {
    try {
      console.log(`[MediaPicker] Processing ${files.length} file(s), isNewProject: ${isNewProject}`);
      let items;
      if (isNewProject) {
        items = await createNewProjectWithFiles(files);
      } else {
        items = await addFiles(files);
      }
      if (items && items.length > 0) {
        onPicked?.();
      }
    } catch (err) {
      console.error("[MediaPicker] Error handling media files:", err);
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      onBeforePick?.();
    } catch (err) {
      console.warn("onBeforePick error:", err);
    }

    let isHandled = false;
    const fallback = () => {
      if (isHandled) return;
      isHandled = true;
      console.log("[MediaPicker] Falling back to standard input...");
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.click();
      }
    };

    const isNativeRuntime = Boolean((window as any).VieronNativeBridgeImpl && (window as any).VieronNative?.media?.pickMedia);
    if (isNativeRuntime) {
      const timeoutId = setTimeout(fallback, 2000);
      try {
        let type = "any";
        if (accept === "video") type = "video";
        else if (accept === "image") type = "image";

        console.log(`[MediaPicker] Invoking VieronNative.media.pickMedia type=${type} multiple=${multiple}...`);
        const nativeRes = await (window as any).VieronNative?.media?.pickMedia({ type, multiple }).catch((e: any) => {
          console.warn("[MediaPicker] VieronNative pickMedia call failed:", e);
          return null;
        });

        clearTimeout(timeoutId);
        if (isHandled) return;

        if (nativeRes && nativeRes.success && nativeRes.files && nativeRes.files.length > 0) {
          isHandled = true;
          const pickedFiles: File[] = [];
          for (const fileInfo of nativeRes.files) {
            try {
              const response = await fetch(fileInfo.uri);
              const blob = await response.blob();
              pickedFiles.push(new File([blob], fileInfo.name, { type: fileInfo.mimeType }));
            } catch (e) {
              console.warn("[MediaPicker] File fetch error from uri:", e);
            }
          }

          if (pickedFiles.length > 0) {
            await handleFiles(pickedFiles);
            return;
          }
        } else if (nativeRes && (nativeRes.cancelled || (nativeRes.success === false && nativeRes.error?.code === "CANCELLED"))) {
           console.log("[MediaPicker] User cancelled native picker.");
           isHandled = true;
           return;
        }
      } catch (err) {
        console.error("[MediaPicker] Native error:", err);
      }
      fallback();
    } else {
      fallback();
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFiles(files);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
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
