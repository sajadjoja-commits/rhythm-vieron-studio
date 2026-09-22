package com.vireon.ai;

import android.util.Log;

/**
 * Native JNI bridge for whisper.cpp C/C++ inference engine.
 * 
 * Defines standard JNI bindings to interact directly with native whisper context,
 * whisper_full transcription parameters, and segment extraction.
 */
public class WhisperNative {
    private static final String TAG = "WhisperNative";
    private static boolean sLibraryLoaded = false;
    private static String sLoadError = null;

    static {
        try {
            System.loadLibrary("whisper");
            sLibraryLoaded = true;
            Log.i(TAG, "libwhisper native library loaded successfully.");
        } catch (UnsatisfiedLinkError e) {
            sLibraryLoaded = false;
            sLoadError = e.getMessage();
            Log.w(TAG, "libwhisper native library not yet present or loadable: " + e.getMessage());
        } catch (Throwable t) {
            sLibraryLoaded = false;
            sLoadError = t.getMessage();
            Log.e(TAG, "Unexpected error loading libwhisper: " + t.getMessage(), t);
        }
    }

    public static boolean isLibraryLoaded() {
        return sLibraryLoaded;
    }

    public static String getLoadError() {
        return sLoadError;
    }

    /**
     * Initialize whisper context from a local GGML/GGUF model file path.
     * @param modelPath Absolute path to the .bin model file on device storage.
     * @return Native pointer to whisper_context (0 if initialization failed).
     */
    public static native long initContext(String modelPath);

    /**
     * Free whisper context and all associated native memory.
     * @param contextPtr Native pointer previously returned by initContext.
     */
    public static native void freeContext(long contextPtr);

    /**
     * Run full whisper inference on 16kHz mono PCM float samples.
     * @param contextPtr Native pointer to whisper_context.
     * @param samples Array of 16kHz mono float samples normalized to [-1.0, 1.0].
     * @param nSamples Number of samples in the array.
     * @param language ISO language code (e.g., "ar", "en") or null/empty for auto-detect.
     * @param nThreads Number of CPU threads to use for inference.
     * @param translate Whether to translate to English (false for verbatim transcription).
     * @return Status code (0 for success).
     */
    public static native int fullTranscribe(long contextPtr, float[] samples, int nSamples, String language, int nThreads, boolean translate);

    /**
     * Get the number of transcribed segments produced by the last fullTranscribe call.
     * @param contextPtr Native pointer to whisper_context.
     * @return Number of segments.
     */
    public static native int getNumSegments(long contextPtr);

    /**
     * Get start timestamp of segment in milliseconds (or 10ms units depending on whisper.cpp version).
     * @param contextPtr Native pointer to whisper_context.
     * @param iSegment Zero-based segment index.
     * @return Start timestamp in centiseconds (10ms units).
     */
    public static native long getSegmentT0(long contextPtr, int iSegment);

    /**
     * Get end timestamp of segment in milliseconds (or 10ms units depending on whisper.cpp version).
     * @param contextPtr Native pointer to whisper_context.
     * @param iSegment Zero-based segment index.
     * @return End timestamp in centiseconds (10ms units).
     */
    public static native long getSegmentT1(long contextPtr, int iSegment);

    /**
     * Get transcribed text content of segment.
     * @param contextPtr Native pointer to whisper_context.
     * @param iSegment Zero-based segment index.
     * @return Transcribed text string.
     */
    public static native String getSegmentText(long contextPtr, int iSegment);
}
