// Extract the audio track of a video file as a WAV blob with same length.
// (Mono, original sample rate). Returns a File so the rest of the app can treat it
// as a normal audio source.

export async function extractVideoAudioFile(videoFile: File, name = "video-audio.wav"): Promise<File> {
  const ab = await videoFile.arrayBuffer();
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const buf: AudioBuffer = await new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej));
  ctx.close?.();
  const blob = audioBufferToWavBlob(buf);
  return new File([blob], name, { type: "audio/wav" });
}

function audioBufferToWavBlob(buf: AudioBuffer): Blob {
  // Downmix to mono
  const sr = buf.sampleRate;
  const len = buf.length;
  const out = new Float32Array(len);
  const numCh = buf.numberOfChannels;
  for (let c = 0; c < numCh; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / numCh;
  }
  const bytesPerSample = 2;
  const dataSize = len * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); writeStr(8, "WAVE"); writeStr(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * bytesPerSample, true); view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); writeStr(36, "data"); view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, out[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([ab], { type: "audio/wav" });
}
