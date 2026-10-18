package com.vireon.ai;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;

/**
 * Native Android audio decoder.
 * 
 * Decodes audio from local files, file URIs, or content URIs (MP4, M4A, WAV, MP3, AAC)
 * directly into 16,000 Hz Mono Float32Array PCM buffers suitable for Whisper inference.
 * Runs completely on-device without passing audio buffers across the WebView JS bridge.
 */
public class NativeAudioDecoder {
    private static final String TAG = "NativeAudioDecoder";
    private static final int TARGET_SAMPLE_RATE = 16000;

    public static float[] decodeTo16kMono(Context context, String audioPath, Double startSec, Double durationSec) throws Exception {
        if (audioPath == null || audioPath.trim().isEmpty()) {
            throw new IllegalArgumentException("audioPath must not be empty");
        }

        // Normalize file:// URI to standard filesystem path
        String cleanPath = audioPath;
        if (cleanPath.startsWith("file://")) {
            Uri parsed = Uri.parse(cleanPath);
            if (parsed.getPath() != null) {
                cleanPath = parsed.getPath();
            }
        }

        // Check if it is a raw WAV file first
        File file = new File(cleanPath);
        if (file.exists() && cleanPath.toLowerCase().endsWith(".wav")) {
            try {
                return decodeWavDirect(file, startSec, durationSec);
            } catch (Exception e) {
                Log.w(TAG, "Direct WAV parse failed, falling back to MediaCodec: " + e.getMessage());
            }
        }

        MediaExtractor extractor = new MediaExtractor();
        try {
            if (cleanPath.startsWith("content://")) {
                extractor.setDataSource(context, Uri.parse(cleanPath), null);
            } else {
                extractor.setDataSource(cleanPath);
            }

            int audioTrackIndex = -1;
            MediaFormat format = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat f = extractor.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    audioTrackIndex = i;
                    format = f;
                    break;
                }
            }

            if (audioTrackIndex < 0 || format == null) {
                throw new IllegalStateException("No audio track found in media source: " + cleanPath);
            }

            extractor.selectTrack(audioTrackIndex);

            // Seek to start position if requested
            long startUs = (startSec != null && startSec > 0) ? (long)(startSec * 1000000L) : 0L;
            if (startUs > 0) {
                extractor.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
            }

            long maxDurationUs = (durationSec != null && durationSec > 0) ? (long)(durationSec * 1000000L) : Long.MAX_VALUE;

            String mime = format.getString(MediaFormat.KEY_MIME);
            MediaCodec codec = MediaCodec.createDecoderByType(mime);
            codec.configure(format, null, null, 0);
            codec.start();

            int sourceSampleRate = format.containsKey(MediaFormat.KEY_SAMPLE_RATE) ? format.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 44100;
            int channelCount = format.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 2;

            ArrayList<float[]> pcmChunks = new ArrayList<>();
            int totalSamples = 0;

            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean isEOS = false;
            long basePresentationTimeUs = -1;

            while (!isEOS) {
                int inIndex = codec.dequeueInputBuffer(10000);
                if (inIndex >= 0) {
                    ByteBuffer buffer = codec.getInputBuffer(inIndex);
                    if (buffer != null) {
                        int sampleSize = extractor.readSampleData(buffer, 0);
                        if (sampleSize < 0) {
                            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            isEOS = true;
                        } else {
                            long sampleTime = extractor.getSampleTime();
                            if (basePresentationTimeUs < 0) basePresentationTimeUs = sampleTime;
                            if (sampleTime - basePresentationTimeUs > maxDurationUs) {
                                codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                isEOS = true;
                            } else {
                                codec.queueInputBuffer(inIndex, 0, sampleSize, sampleTime, 0);
                                extractor.advance();
                            }
                        }
                    }
                }

                int outIndex = codec.dequeueOutputBuffer(info, 10000);
                if (outIndex >= 0) {
                    ByteBuffer outBuffer = codec.getOutputBuffer(outIndex);
                    if (outBuffer != null && info.size > 0) {
                        outBuffer.position(info.offset);
                        outBuffer.limit(info.offset + info.size);
                        outBuffer.order(ByteOrder.LITTLE_ENDIAN);

                        int shortsCount = info.size / 2;
                        int frames = shortsCount / Math.max(1, channelCount);
                        float[] monoChunk = new float[frames];

                        for (int f = 0; f < frames; f++) {
                            float sum = 0;
                            for (int c = 0; c < channelCount; c++) {
                                sum += outBuffer.getShort() / 32768.0f;
                            }
                            monoChunk[f] = sum / channelCount;
                        }

                        pcmChunks.add(monoChunk);
                        totalSamples += frames;
                    }
                    codec.releaseOutputBuffer(outIndex, false);
                } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat newFormat = codec.getOutputFormat();
                    if (newFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        channelCount = newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    }
                    if (newFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                        sourceSampleRate = newFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    }
                }
            }

            codec.stop();
            codec.release();

            // Merge chunks into single Float array
            float[] merged = new float[totalSamples];
            int offset = 0;
            for (float[] chunk : pcmChunks) {
                System.arraycopy(chunk, 0, merged, offset, chunk.length);
                offset += chunk.length;
            }

            // Resample to 16,000 Hz if needed
            if (sourceSampleRate != TARGET_SAMPLE_RATE && merged.length > 0) {
                return resample(merged, sourceSampleRate, TARGET_SAMPLE_RATE);
            }

            return merged;
        } finally {
            extractor.release();
        }
    }

    private static float[] decodeWavDirect(File file, Double startSec, Double durationSec) throws Exception {
        byte[] bytes = new byte[(int) file.length()];
        try (InputStream is = new FileInputStream(file)) {
            int read = is.read(bytes);
            if (read < 44) throw new IllegalStateException("WAV file too short");
        }

        ByteBuffer bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        int channels = bb.getShort(22);
        int sampleRate = bb.getInt(24);
        int bitsPerSample = bb.getShort(34);

        int dataOffset = 44;
        for (int i = 12; i < bytes.length - 8; i++) {
            if (bytes[i] == 'd' && bytes[i+1] == 'a' && bytes[i+2] == 't' && bytes[i+3] == 'a') {
                dataOffset = i + 8;
                break;
            }
        }

        int bytesPerSample = bitsPerSample / 8;
        int totalFrames = (bytes.length - dataOffset) / (channels * bytesPerSample);

        int startFrame = (startSec != null && startSec > 0) ? (int)(startSec * sampleRate) : 0;
        int maxFrames = (durationSec != null && durationSec > 0) ? (int)(durationSec * sampleRate) : totalFrames - startFrame;
        int framesToRead = Math.max(0, Math.min(maxFrames, totalFrames - startFrame));

        float[] mono = new float[framesToRead];
        bb.position(dataOffset + startFrame * channels * bytesPerSample);

        for (int i = 0; i < framesToRead; i++) {
            float sum = 0;
            for (int c = 0; c < channels; c++) {
                if (bitsPerSample == 16) {
                    sum += bb.getShort() / 32768.0f;
                } else if (bitsPerSample == 32) {
                    sum += bb.getFloat();
                } else if (bitsPerSample == 8) {
                    sum += (bb.get() - 128) / 128.0f;
                }
            }
            mono[i] = sum / channels;
        }

        if (sampleRate != TARGET_SAMPLE_RATE && mono.length > 0) {
            return resample(mono, sampleRate, TARGET_SAMPLE_RATE);
        }
        return mono;
    }

    private static float[] resample(float[] input, int fromRate, int toRate) {
        if (fromRate == toRate || input.length == 0) return input;
        double ratio = (double) toRate / (double) fromRate;
        int outLength = (int) Math.round(input.length * ratio);
        float[] output = new float[outLength];

        for (int i = 0; i < outLength; i++) {
            double srcIdx = i / ratio;
            int idxFloor = (int) Math.floor(srcIdx);
            int idxCeil = Math.min(input.length - 1, idxFloor + 1);
            double frac = srcIdx - idxFloor;
            output[i] = (float) ((1.0 - frac) * input[idxFloor] + frac * input[idxCeil]);
        }
        return output;
    }
}
