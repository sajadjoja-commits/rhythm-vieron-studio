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

  // Downmix to mono and resample to 16kHz via OfflineAudioContext
  const targetRate = 16000;
  const length = Math.ceil(segmentDuration * targetRate);
  const offline = new (((window as any).OfflineAudioContext) || ((window as any).webkitOfflineAudioContext))(
    1,
    length,
    targetRate,
  );
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  // Play from startSec for segmentDuration
  src.start(0, startSec, segmentDuration);
  const rendered: AudioBuffer = await offline.startRendering();

  const wavBlob = encodeWAV(rendered);
  const base64 = await blobToBase64(wavBlob);
  return { base64, mimeType: "audio/wav", duration: segmentDuration };
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
