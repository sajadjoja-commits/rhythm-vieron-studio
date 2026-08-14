import { Filesystem, Directory } from '@capacitor/filesystem';
import { registerPlugin, Capacitor } from '@capacitor/core';

const VireonMedia = registerPlugin<any>('VireonMedia');

/**
 * Converts a Blob to a Base64 string in small chunks using ArrayBuffer.
 * Avoids call stack overflow and memory spikes from large FileReader operations.
 */
export async function blobToBase64Optimized(blob: Blob): Promise<string> {
  try {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 32768; // 32KB chunks prevent call stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk as any);
    }
    return btoa(binary);
  } catch (err: any) {
    console.warn("[NativeService] Chunked base64 conversion failed, falling back to FileReader:", err);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result ? result.split(',')[1] : '';
        resolve(base64);
      };
      reader.onerror = (e) => reject(new Error(`FileReader failed: ${e}`));
      reader.readAsDataURL(blob);
    });
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return blobToBase64Optimized(blob);
}

/**
 * Writes a Blob to Capacitor Filesystem Directory.Cache in 2MB chunks.
 * Uses writeFile for the first chunk and appendFile for remaining chunks.
 * This prevents V8 string length limit errors and out-of-memory crashes on large video files.
 */
export async function writeBlobInChunksToCache(
  blob: Blob,
  finalFileName: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const chunkSize = 2 * 1024 * 1024; // 2MB Blob chunks
  const totalChunks = Math.ceil(blob.size / chunkSize);
  console.log(`[NativeService] Chunked write starting for ${finalFileName}. Size: ${blob.size} bytes, Total chunks: ${totalChunks}`);

  let cacheUri = '';

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(blob.size, start + chunkSize);
    const chunkBlob = blob.slice(start, end);
    const base64Chunk = await blobToBase64Optimized(chunkBlob);

    if (i === 0) {
      console.log(`[NativeService] Writing chunk 1/${totalChunks} via Filesystem.writeFile...`);
      const writeResult = await Filesystem.writeFile({
        path: finalFileName,
        data: base64Chunk,
        directory: Directory.Cache,
        recursive: true
      });
      cacheUri = writeResult.uri;
    } else {
      console.log(`[NativeService] Appending chunk ${i + 1}/${totalChunks} via Filesystem.appendFile...`);
      await Filesystem.appendFile({
        path: finalFileName,
        data: base64Chunk,
        directory: Directory.Cache
      });
    }

    if (onProgress) {
      onProgress((i + 1) / totalChunks);
    }
  }

  if (!cacheUri) {
    const uriResult = await Filesystem.getUri({
      path: finalFileName,
      directory: Directory.Cache
    });
    cacheUri = uriResult.uri;
  }

  console.log(`[NativeService] Chunked write completed successfully. File URI: ${cacheUri}`);
  return cacheUri;
}

/**
 * Converts an exported video Blob and writes it to Filesystem.Directory.Cache in memory-efficient chunks,
 * then calls the native VireonMedia plugin to save the video to the gallery.
 * 
 * @param blob The video Blob to be saved
 * @param fileName The name of the file to save (defaults to 'vireon_video.mp4')
 * @param isCancelled Optional callback checking if export/save was cancelled
 */
export async function saveVideoToGallery(
  blob: Blob, 
  fileName: string = 'vireon_video.mp4',
  isCancelled?: () => boolean
): Promise<{ success: boolean; path?: string; warning?: string }> {
  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
  console.log(`[NativeService] Starting saveVideoToGallery. Blob size: ${sizeMB} MB (${blob.size} bytes), filename: ${fileName}`);

  let sizeWarning: string | undefined = undefined;
  if (blob.size > 50 * 1024 * 1024) {
    sizeWarning = `Video size (${sizeMB} MB) is large (>50MB). Saving may take longer or require more memory on lower-end devices. Try a lower quality/FPS if saving fails.`;
    console.warn(`[NativeService] ${sizeWarning}`);
  }

  if (!Capacitor.isNativePlatform()) {
    console.log("[NativeService] Not running on a native platform, skipping native gallery save.");
    return { success: false, path: '', warning: sizeWarning };
  }

  if (isCancelled && isCancelled()) {
    console.log("[NativeService] Save operation cancelled before filesystem write.");
    return { success: false, path: '', warning: 'Save operation cancelled by user.' };
  }

  const cleanFileName = fileName.trim().replace(/\s+/g, "_") || "vireon_video";
  const finalFileName = cleanFileName.endsWith('.mp4') || cleanFileName.endsWith('.webm') ? cleanFileName : `${cleanFileName}.mp4`;
  let cacheUri = '';

  // Phase 1: Write file to native cache (using chunked write to prevent OOM)
  try {
    if (blob.size > 2 * 1024 * 1024) {
      try {
        cacheUri = await writeBlobInChunksToCache(blob, finalFileName);
      } catch (chunkErr: any) {
        console.warn("[NativeService] Chunked write failed or unsupported, trying single-shot write fallback:", chunkErr);
        const base64Data = await blobToBase64Optimized(blob);
        const writeResult = await Filesystem.writeFile({
          path: finalFileName,
          data: base64Data,
          directory: Directory.Cache
        });
        cacheUri = writeResult.uri;
      }
    } else {
      const base64Data = await blobToBase64Optimized(blob);
      const writeResult = await Filesystem.writeFile({
        path: finalFileName,
        data: base64Data,
        directory: Directory.Cache
      });
      cacheUri = writeResult.uri;
    }
  } catch (fsError: any) {
    console.error("[NativeService] Capacitor Filesystem error details:", {
      name: fsError?.name,
      message: fsError?.message,
      code: fsError?.code,
      stack: fsError?.stack,
      blobSizeMB: sizeMB
    });
    let detail = fsError?.message || String(fsError);
    if (detail.includes("permission") || detail.includes("Permission") || detail.includes("denied")) {
      detail = `Storage permission denied: ${detail}`;
    } else if (detail.includes("memory") || detail.includes("Memory") || detail.includes("allocate") || detail.includes("OOM") || detail.includes("RangeError")) {
      detail = `Out of memory writing ${sizeMB}MB file: Try exporting with 1080p or 720p resolution.`;
    } else if (detail.includes("space") || detail.includes("ENOSPC")) {
      detail = `Insufficient storage space on device (${sizeMB}MB required).`;
    }
    throw new Error(`Filesystem write error: ${detail}`);
  }

  if (isCancelled && isCancelled()) {
    console.log("[NativeService] Save operation cancelled after filesystem write.");
    return { success: false, path: cacheUri, warning: 'Save operation cancelled by user.' };
  }

  // Phase 2: Native Plugin Gallery Save
  try {
    console.log("[NativeService] Invoking VireonMedia.saveVideoToGallery plugin with path:", cacheUri);
    const result = await VireonMedia.saveVideoToGallery({ 
      path: cacheUri 
    });

    if (result && result.success) {
      console.log("[NativeService] Native VireonMedia gallery save succeeded!", result);
      return { success: true, path: cacheUri, warning: sizeWarning };
    } else {
      const pluginMsg = result?.message || result?.error || "Native plugin returned unsuccessful status";
      console.error("[NativeService] Native VireonMedia plugin response indicates failure:", result);
      throw new Error(`VireonMedia gallery plugin error: ${pluginMsg}`);
    }
  } catch (pluginError: any) {
    console.error("[NativeService] VireonMedia plugin execution failure details:", {
      name: pluginError?.name,
      message: pluginError?.message,
      code: pluginError?.code,
      stack: pluginError?.stack,
      cacheUri
    });
    let msg = pluginError?.message || String(pluginError);
    if (msg.includes("UNIMPLEMENTED") || msg.includes("not implemented") || msg.includes("plugin_not_installed")) {
      msg = `Native VireonMedia gallery plugin is not installed in this native build (${msg})`;
    } else if (msg.includes("Permission") || msg.includes("permission")) {
      msg = `Gallery permission denied by user: ${msg}`;
    }
    throw new Error(msg);
  }
}

