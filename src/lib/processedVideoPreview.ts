/** Verify a replacement without changing the visible video or timeline. */
export async function verifyProcessedVideoSource(url: string, timeoutMs = 5000): Promise<void> {
  const probe = document.createElement("video");
  probe.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        probe.removeEventListener("loadedmetadata", onMetadata);
        probe.removeEventListener("error", onError);
      };
      const onMetadata = () => {
        cleanup();
        if (probe.videoWidth > 0 && probe.videoHeight > 0 && Number.isFinite(probe.duration) && probe.duration > 0) resolve();
        else reject(new Error("Processed video has invalid dimensions or duration"));
      };
      const onError = () => {
        cleanup();
        reject(new Error(probe.error?.message || "Processed video could not be decoded"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Processed video metadata timed out"));
      }, timeoutMs);
      probe.addEventListener("loadedmetadata", onMetadata);
      probe.addEventListener("error", onError);
      probe.src = url;
      probe.load();
    });
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
}