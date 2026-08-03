import { Filesystem, Directory } from '@capacitor/filesystem';
import { registerPlugin, Capacitor } from '@capacitor/core';

const VireonMedia = registerPlugin<any>('VireonMedia');

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts an exported video Blob to base64, writes it to Filesystem.Directory.Cache,
 * and calls the native VireonMedia plugin to save the video to the gallery.
 * 
 * @param blob The video Blob to be saved
 * @param fileName The name of the file to save (defaults to 'vireon_video.mp4')
 */
export async function saveVideoToGallery(blob: Blob, fileName: string = 'vireon_video.mp4'): Promise<{ success: boolean; path?: string }> {
  try {
    if (!Capacitor.isNativePlatform()) {
      console.log("Not running on a native platform, skipping native gallery save.");
      return { success: false, path: '' };
    }

    console.log("Converting exported video Blob to base64...");
    const base64Data = await blobToBase64(blob);

    // Ensure fileName is clean and has extension
    const cleanFileName = fileName.trim().replace(/\s+/g, "_") || "vireon_video";
    const finalFileName = cleanFileName.endsWith('.mp4') ? cleanFileName : `${cleanFileName}.mp4`;

    console.log(`Writing base64 video to Cache under name: ${finalFileName}`);
    const writeResult = await Filesystem.writeFile({
      path: finalFileName,
      data: base64Data,
      directory: Directory.Cache
    });

    console.log("Successfully wrote video to native filesystem. Path:", writeResult.uri);

    console.log("Passing path to native VireonMedia plugin...");
    const result = await VireonMedia.saveVideoToGallery({ 
      path: writeResult.uri 
    });

    if (result && result.success) {
      console.log("Native save operation succeeded!");
      return { success: true, path: writeResult.uri };
    } else {
      throw new Error(result?.message || "Plugin returned unsuccessful response");
    }
  } catch (error: any) {
    console.error("Failed inside saveVideoToGallery service:", error);
    throw error;
  }
}

/**
 * Gets a video thumbnail natively on Android/iOS
 */
export async function getNativeVideoThumbnail(path: string, timeMs: number = 1000, width: number = 200): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await VireonMedia.getVideoThumbnail({ path, timeMs, width });
    return result?.value || null;
  } catch (err) {
    console.warn("Native thumbnail capture error:", err);
    return null;
  }
}
