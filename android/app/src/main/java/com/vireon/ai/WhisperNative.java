package com.vireon.ai;

import android.util.Log;

/**
 * Real JNI bridge to offline whisper.cpp C/C++ engine.
 * 
 * Provides on-device Whisper inference without WebView/WASM dependency,
 * native cancellation callback hook, and per-segment confidence calculation.
 */
public class WhisperNative {
    private static final String TAG = "WhisperNative";
    private static boolean sLibraryLoaded = false;
    private static String sLoadError = null;

    static {
        try {
            System.loadLibrary("whisper");
            sLibraryLoaded = true;
            Log.i(TAG, "libwhisper.so native library loaded successfully");
        } catch (Throwable t) {
            sLibraryLoaded = false;
            sLoadError = t.getMessage();
            Log.w(TAG, "Failed to load libwhisper.so: " + sLoadError);
        }
    }

    public static boolean isLibraryLoaded() {
        return sLibraryLoaded;
    }

    public static String getLoadError() {
        return sLoadError;
    }

    // --- Native JNI declarations mapped to whisper-jni.cpp ---

    /**
     * Initialize whisper_context from an offline GGML/GGUF model file on disk.
     * Returns context pointer as long, or 0 on failure.
     */
    public static native long initContext(String modelPath);

    /**
     * Free whisper_context and its internal tensor buffers.
     */
    public static native void freeContext(long contextPtr);

    /**
     * Trigger cancellation of an in-flight transcribe call via abort_callback.
     */
    public static native void cancelTranscription(long contextPtr);

    /**
     * Run full whisper speech-to-text inference.
     * 
     * @param contextPtr Context pointer from initContext
     * @param samples 16kHz mono float32 audio samples
     * @param nSamples Total number of samples
     * @param language ISO-639-1 code (e.g. "ar", "en") or null for auto
     * @param nThreads Thread count for parallel execution
     * @param translate Whether to translate to English
     * @return 0 on success, non-zero on failure
     */
    public static native int fullTranscribe(
        long contextPtr,
        float[] samples,
        int nSamples,
        String language,
        int nThreads,
        boolean translate
    );

    /**
     * Get the number of transcribed segments.
     */
    public static native int getNumSegments(long contextPtr);

    /**
     * Get segment start timestamp in centiseconds (10ms units).
     */
    public static native long getSegmentT0(long contextPtr, int iSegment);

    /**
     * Get segment end timestamp in centiseconds (10ms units).
     */
    public static native long getSegmentT1(long contextPtr, int iSegment);

    /**
     * Get segment text.
     */
    public static native String getSegmentText(long contextPtr, int iSegment);

    /**
     * Get segment average token confidence (0.0 to 1.0).
     */
    public static native float getSegmentConfidence(long contextPtr, int iSegment);

    /**
     * Retrieve whisper.cpp build & hardware acceleration info.
     */
    public static native String getSystemInfo();
}
