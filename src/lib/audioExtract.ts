// Extract audio from a video File and encode as base64 WAV (mono 16kHz)
export async function extractAudioBase64(
  file: File,
  startTime?: number,
  endTime?: number
): Promise<{ base64: string; mimeType: string; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
  });
  ctx.close?.();

  const startSec = Math.max(0, startTime ?? 0);
  const endSec = Math.min(audioBuffer.duration, endTime ?? audioBuffer.duration);
  const segmentDuration = Math.max(0.1, endSec - startSec);

  const base64 = await renderAudioSegment(audioBuffer, startSec, segmentDuration);
  return { base64, mimeType: "audio/wav", duration: segmentDuration };
}

export interface AudioChunk {
  base64: string;
  mimeType: string;
  start: number;
  end: number;
}

export async function extractAudioInChunks(
  file: File,
  chunkSizeSec = 25,
  overlapSec = 2
): Promise<{ totalDuration: number; chunks: AudioChunk[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
  });
  ctx.close?.();

  const totalDuration = audioBuffer.duration;

  if (totalDuration <= 60) {
    const base64 = await renderAudioSegment(audioBuffer, 0, totalDuration);
    return {
      totalDuration,
      chunks: [{ base64, mimeType: "audio/wav", start: 0, end: totalDuration }],
    };
  }

  const chunks: AudioChunk[] = [];
  let start = 0;
  const step = Math.max(1, chunkSizeSec - overlapSec); // 23s

  while (start < totalDuration) {
    const end = Math.min(totalDuration, start + chunkSizeSec);
    const segDuration = Math.max(0.1, end - start);
    const base64 = await renderAudioSegment(audioBuffer, start, segDuration);

    chunks.push({
      base64,
      mimeType: "audio/wav",
      start,
      end,
    });

    if (end >= totalDuration) break;
    start += step;
  }

  return { totalDuration, chunks };
}

async function renderAudioSegment(
  audioBuffer: AudioBuffer,
  startSec: number,
  segmentDuration: number
): Promise<string> {
  const targetRate = 16000;
  const length = Math.ceil(segmentDuration * targetRate);
  const offline = new (((window as any).OfflineAudioContext) || ((window as any).webkitOfflineAudioContext))(
    1,
    length,
    targetRate
  );
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0, startSec, segmentDuration);
  const rendered: AudioBuffer = await offline.startRendering();

  const wavBlob = encodeWAV(rendered);
  return await blobToBase64(wavBlob);
}

export interface TranscribedSegment {
  start: number;
  end: number;
  text: string;
}

export function mergeChunkResults(
  existingSegments: TranscribedSegment[],
  newChunkSegments: TranscribedSegment[],
  chunkStartOffset: number
): TranscribedSegment[] {
  const adjustedNew: TranscribedSegment[] = newChunkSegments
    .map((seg) => ({
      start: Math.round((seg.start + chunkStartOffset) * 100) / 100,
      end: Math.round((seg.end + chunkStartOffset) * 100) / 100,
      text: (seg.text || "").trim(),
    }))
    .filter((s) => s.text.length > 0);

  if (existingSegments.length === 0) {
    return adjustedNew;
  }

  const merged = [...existingSegments];

  for (const newSeg of adjustedNew) {
    const lastSeg = merged[merged.length - 1];
    if (!lastSeg) {
      merged.push(newSeg);
      continue;
    }

    const cleanLast = normalizeArabic(lastSeg.text);
    const cleanNew = normalizeArabic(newSeg.text);

    // 1. Exact or near-exact duplicate in overlap window
    if (cleanLast === cleanNew && newSeg.start < lastSeg.end + 2.0) {
      continue;
    }

    // 2. Overlapping timestamps check
    if (newSeg.start < lastSeg.end - 0.2) {
      if (cleanLast.includes(cleanNew)) {
        continue;
      }
      if (cleanNew.includes(cleanLast)) {
        merged[merged.length - 1] = newSeg;
        continue;
      }

      const lastWords = cleanLast.split(/\s+/);
      const newWords = cleanNew.split(/\s+/);

      let maxOverlapWords = 0;
      for (let len = Math.min(lastWords.length, newWords.length, 6); len >= 1; len--) {
        const tail = lastWords.slice(-len).join(" ");
        const head = newWords.slice(0, len).join(" ");
        if (tail === head) {
          maxOverlapWords = len;
          break;
        }
      }

      if (maxOverlapWords > 0) {
        const originalNewWords = newSeg.text.trim().split(/\s+/);
        const remainingWords = originalNewWords.slice(maxOverlapWords);
        if (remainingWords.length === 0) {
          continue;
        }
        newSeg.text = remainingWords.join(" ");
        newSeg.start = Math.max(lastSeg.end, newSeg.start);
      } else if (newSeg.start <= lastSeg.start) {
        continue;
      }
    }

    merged.push(newSeg);
  }

  return merged;
}

function normalizeArabic(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function encodeWAV(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([ab], { type: "audio/wav" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
