/**
 * Audio helper tools
 * Provides robust conversion between Blobs, Data URLs, URLs, and Base64 strings.
 */

export async function resolveAudioSourceToBlob(source: string | Blob, defaultMime = "audio/wav"): Promise<Blob> {
  if (source instanceof Blob) {
    return source;
  }

  if (typeof source !== "string" || !source.trim()) {
    throw new Error("Invalid audio source: empty or non-string source provided");
  }

  const trimmed = source.trim();

  // 1. Data URL
  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      const header = trimmed.substring(0, commaIdx);
      const dataStr = trimmed.substring(commaIdx + 1);
      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : defaultMime;
      const binaryString = atob(dataStr);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }
  }

  // 2. Fetchable Web URL, relative path, or Blob URL
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.includes(".mp3") ||
    trimmed.includes(".wav") ||
    trimmed.includes(".ogg") ||
    trimmed.includes(".m4a")
  ) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to fetch audio from URL "${trimmed}": ${res.status} ${res.statusText}`);
    }
    return await res.blob();
  }

  // 3. Raw pure Base64 string
  const cleanBase64 = trimmed.replace(/[^A-Za-z0-9+/=]/g, "");
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: defaultMime });
}

export function base64ToBlob(base64: string, mimeType: string = "audio/wav"): Blob {
  if (!base64 || typeof base64 !== "string") {
    return new Blob([], { type: mimeType });
  }

  let clean = base64.trim();
  if (clean.startsWith("data:")) {
    const commaIdx = clean.indexOf(",");
    if (commaIdx !== -1) {
      clean = clean.substring(commaIdx + 1);
    }
  }

  // Strip non-base64 chars
  clean = clean.replace(/[^A-Za-z0-9+/=]/g, "");
  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
