/**
 * Audio Validation and Distortion Detection Engine
 * Deeply audits exported media files to verify audio track presence, format compliance,
 * loudness statistics, clipping, and audio-video temporal synchronization.
 */

export interface AudioValidationReport {
  valid: boolean;
  error?: string;
  warnings: string[];
  hasAudioTrack: boolean;
  sampleRate: number;
  channels: number;
  duration: number;
  durationDiffSec: number;
  peakDbfs: number;
  rmsDbfs: number;
  clippedSamples: number;
  clippingPercentage: number;
  isSilent: boolean;
  hasNaNOrInf: boolean;
  channelImbalanceDb?: number;
}

export interface AudioValidationOptions {
  expectedHasAudio: boolean;
  expectedDurationSec: number;
  maxDurationDiffSec?: number; // default 0.65s
  allowSilence?: boolean; // false if audio was explicitly expected
}

/**
 * Validates the audio stream of an exported video Blob or audio Blob.
 */
export async function validateExportedAudio(
  blob: Blob,
  options: AudioValidationOptions
): Promise<AudioValidationReport> {
  const {
    expectedHasAudio,
    expectedDurationSec,
    maxDurationDiffSec = 0.65,
    allowSilence = false,
  } = options;

  const warnings: string[] = [];

  // Default empty report
  const report: AudioValidationReport = {
    valid: true,
    warnings,
    hasAudioTrack: false,
    sampleRate: 0,
    channels: 0,
    duration: 0,
    durationDiffSec: 0,
    peakDbfs: -100,
    rmsDbfs: -100,
    clippedSamples: 0,
    clippingPercentage: 0,
    isSilent: true,
    hasNaNOrInf: false,
  };

  if (!blob || blob.size < 1000) {
    if (expectedHasAudio) {
      report.valid = false;
      report.error = "حجم ملف التصدير غير صالح للتحقق من الصوت.";
    }
    return report;
  }

  // If no audio is expected (e.g. video muted and zero audio tracks), pass gracefully
  if (!expectedHasAudio) {
    return report;
  }

  let audioBuffer: AudioBuffer | null = null;
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) {
    warnings.push("بيئة التشغيل لا تدعم AudioContext للتحقق من الصوت المصدّر.");
    return report;
  }

  const audioCtx = new AudioCtxClass();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    // decodeAudioData decodes audio tracks directly out of MP4 (AAC) or WebM (Opus) containers
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeErr: any) {
    console.warn("[AudioValidator] Native audio decode notice:", decodeErr);
    // Container might have no audio track or unsupported container audio atom
    report.hasAudioTrack = false;
    report.valid = false;
    report.error = "لم يتم العثور على مسار صوتي صالح في ملف الفيديو المصدّر (Audio track missing or unreadable).";
    try { await audioCtx.close(); } catch {}
    return report;
  } finally {
    try { await audioCtx.close(); } catch {}
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    report.hasAudioTrack = false;
    report.valid = false;
    report.error = "المسار الصوتي المصدّر فارغ تماماً (Zero samples decoded).";
    return report;
  }

  report.hasAudioTrack = true;
  report.sampleRate = audioBuffer.sampleRate;
  report.channels = audioBuffer.numberOfChannels;
  report.duration = audioBuffer.duration;
  report.durationDiffSec = Math.abs(audioBuffer.duration - expectedDurationSec);

  // 1. Duration validation
  if (expectedDurationSec > 0.5 && report.durationDiffSec > maxDurationDiffSec) {
    const msg = `فرق مدة الصوت (${report.duration.toFixed(2)}s) عن مدة الفيديو (${expectedDurationSec.toFixed(2)}s) تجاوز الحد المسموح (${report.durationDiffSec.toFixed(2)}s).`;
    warnings.push(msg);
    if (report.durationDiffSec > Math.max(1.2, expectedDurationSec * 0.25)) {
      report.valid = false;
      report.error = msg;
      return report;
    }
  }

  // 2. Channel count validation
  if (report.channels < 1 || report.channels > 8) {
    report.valid = false;
    report.error = `عدد القنوات الصوتية غير صالح: ${report.channels}.`;
    return report;
  }

  // 3. Sample analysis: Peak, RMS, NaN/Inf, Clipping, Silence
  const totalFrames = audioBuffer.length;
  let maxAbsPeak = 0;
  let sumSquaredAll = 0;
  let totalSamplesAnalyzed = 0;
  let clippedCount = 0;
  let hasNaNOrInf = false;

  const channelRms: number[] = [];

  for (let ch = 0; ch < report.channels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    let chSumSq = 0;

    for (let i = 0; i < totalFrames; i++) {
      const sample = channelData[i];

      if (Number.isNaN(sample) || !Number.isFinite(sample)) {
        hasNaNOrInf = true;
        continue;
      }

      const abs = Math.abs(sample);
      if (abs > maxAbsPeak) {
        maxAbsPeak = abs;
      }

      if (abs >= 0.9995) {
        clippedCount++;
      }

      chSumSq += sample * sample;
    }

    const chRmsLinear = Math.sqrt(chSumSq / Math.max(1, totalFrames));
    const chRmsDb = 20 * Math.log10(Math.max(1e-5, chRmsLinear));
    channelRms.push(chRmsDb);

    sumSquaredAll += chSumSq;
    totalSamplesAnalyzed += totalFrames;
  }

  report.hasNaNOrInf = hasNaNOrInf;
  report.clippedSamples = clippedCount;
  report.clippingPercentage = (clippedCount / Math.max(1, totalSamplesAnalyzed)) * 100;

  const globalRmsLinear = Math.sqrt(sumSquaredAll / Math.max(1, totalSamplesAnalyzed));
  report.peakDbfs = 20 * Math.log10(Math.max(1e-5, maxAbsPeak));
  report.rmsDbfs = 20 * Math.log10(Math.max(1e-5, globalRmsLinear));
  report.isSilent = report.rmsDbfs < -68 && report.peakDbfs < -55;

  // 4. NaN / Infinity check
  if (hasNaNOrInf) {
    report.valid = false;
    report.error = "تم اكتشاف عينات مشوهة (NaN/Infinity) في الصوت المصدّر.";
    return report;
  }

  // 5. Unexpected silence check
  if (report.isSilent && !allowSilence) {
    report.valid = false;
    report.error = `الصوت المصدّر صامت تماماً (RMS: ${report.rmsDbfs.toFixed(1)} dBFS) رغم احتواء المشروع على مسارات صوتية.`;
    return report;
  }

  // 6. Excessive distortion / clipping check (> 5% hard-clipped)
  if (report.clippingPercentage > 5.0 && report.peakDbfs >= 0) {
    warnings.push(`نسبة التشويش/القص في الصوت مرتفعة (${report.clippingPercentage.toFixed(1)}%).`);
  }

  // 7. Stereo channel imbalance check
  if (report.channels === 2) {
    const diff = Math.abs(channelRms[0] - channelRms[1]);
    report.channelImbalanceDb = diff;
    if (diff > 24 && Math.max(channelRms[0], channelRms[1]) > -40) {
      warnings.push(`عدم توازن ملحوظ بين القناة اليمنى واليسرى (${diff.toFixed(1)} dB).`);
    }
  }

  report.valid = true;
  return report;
}
