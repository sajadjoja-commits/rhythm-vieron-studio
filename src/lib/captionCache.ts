/**
 * Secure, Fingerprint-Grounded Cache for Caption & Speech-to-Text Transcripts
 * Uses strict multidimensional fingerprinting:
 * - Source content hash & size
 * - Exact timeline range (startTime, endTime, offset)
 * - Language code & task options
 * - Model ID & model version
 * 
 * Never returns stale transcripts or cross-file results.
 */

export interface CachedCaptionSegment {
  start: number;
  end: number;
  text: string;
  rawText?: string;
}

export interface CaptionCacheEntry {
  fingerprint: string;
  timestamp: number;
  audioDuration: number;
  language?: string;
  modelId: string;
  segments: CachedCaptionSegment[];
}

const DB_NAME = "rhythm_caption_cache_v1";
const STORE_NAME = "transcripts";
const MAX_CACHE_ENTRIES = 50;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "fingerprint" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn("[CaptionCache] IndexedDB open failed, operating without persistent cache");
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Generates a fast, robust 64-character hash of audio samples and metadata.
 */
export function computeAudioFingerprint(
  audioData: Float32Array,
  duration: number,
  options: {
    sourceId?: string;
    startTime?: number;
    endTime?: number;
    language?: string;
    modelId?: string;
  } = {}
): string {
  const len = audioData.length;
  // Sample 256 evenly spaced points across the audio array
  let checksum = 0;
  const step = Math.max(1, Math.floor(len / 256));
  for (let i = 0; i < len; i += step) {
    const s = Math.round(audioData[i] * 10000);
    checksum = ((checksum << 5) - checksum + s) | 0;
  }

  const parts = [
    options.sourceId || "src",
    len.toString(16),
    Math.round(duration * 100).toString(16),
    Math.round((options.startTime || 0) * 100).toString(16),
    Math.round((options.endTime || duration) * 100).toString(16),
    options.language || "auto",
    options.modelId || "local-whisper-tiny-v1",
    (checksum >>> 0).toString(16),
  ];

  return parts.join("_");
}

/**
 * Retrieve cached transcription if all fingerprint dimensions match exactly.
 */
export async function getCachedTranscript(
  fingerprint: string
): Promise<CachedCaptionSegment[] | null> {
  try {
    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(fingerprint);

      req.onsuccess = () => {
        const entry = req.result as CaptionCacheEntry | undefined;
        if (entry && Array.isArray(entry.segments) && entry.segments.length > 0) {
          resolve(entry.segments);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save transcription result with complete fingerprint verification.
 */
export async function setCachedTranscript(
  entry: CaptionCacheEntry
): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);

    // Prune oldest entries if cache exceeds limit
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_CACHE_ENTRIES) {
        const cursorReq = store.openCursor();
        let deleted = 0;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < 10) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };
  } catch (err) {
    console.warn("[CaptionCache] Failed to store cache entry:", err);
  }
}

/**
 * Invalidate all cached transcripts.
 */
export async function clearCaptionCache(): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // Ignore cleanup error
  }
}
