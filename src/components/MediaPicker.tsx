import { useRef, useId, ReactNode } from "react";
import { registerPlugin, Capacitor } from "@capacitor/core";
import { useMedia } from "@/context/MediaContext";
import { toast } from "sonner";
import { getLang } from "@/lib/i18n";

const VireonMedia = registerPlugin<any>('VireonMedia');

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

    if (Capacitor.isNativePlatform()) {
      const timeoutId = setTimeout(fallback, 1500);
      try {
        let method = "pickImage";
        if (accept === "video") method = "pickVideo";
        else if (accept === "both") method = "pickMedia";

        console.log(`[MediaPicker] Invoking native ${method}...`);

        const result = await VireonMedia[method]({ multiple }).catch((e: any) => {
          console.warn("[MediaPicker] Native call failed:", e);
          return null;
        });

        clearTimeout(timeoutId);
        if (isHandled) return;

        if (result && result.success && result.files && result.files.length > 0) {
          isHandled = true;
          const pickedFiles: File[] = [];
          for (const fileInfo of result.files) {
            try {
              if (process.env.NODE_ENV !== "production") {
                console.log("[MEDIA INPUT]: NATIVE_URI", {
                  path: fileInfo.path,
                  webPath: fileInfo.webPath,
                  name: fileInfo.name,
                  size: fileInfo.size,
                });
              }

              // Zero-RAM handle: avoid loading huge video binary into JS heap
              const emptyBlob = new Blob([], { type: fileInfo.mimeType || "video/mp4" });
              const fileObj = new File([emptyBlob], fileInfo.name || "media", {
                type: fileInfo.mimeType || "video/mp4",
              });
              Object.defineProperty(fileObj, "size", { value: fileInfo.size || 0, writable: false });
              Object.defineProperty(fileObj, "nativePath", { value: fileInfo.path, writable: false });
              Object.defineProperty(fileObj, "nativeUri", { value: fileInfo.webPath, writable: false });
              pickedFiles.push(fileObj);
            } catch (e) {
              console.warn("[MediaPicker] File handle creation error:", e);
            }
          }

          if (pickedFiles.length > 0) {
            await handleFiles(pickedFiles);
            return;
          }
        } else if (result && result.success === false && result.message === "CANCELLED") {
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
