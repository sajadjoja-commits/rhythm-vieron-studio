package com.vireon.ai;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Speech-to-Text (STT) Plugin for Vireon AI Studio on Android.
 * 
 * Provides on-device offline Whisper inference via native JNI whisper.cpp bridge,
 * with high-performance local audio decoding and non-blocking background execution.
 */
@CapacitorPlugin(
    name = "VireonSTT",
    permissions = {
        @Permission(
            alias = "publicStorage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        ),
        @Permission(
            alias = "media",
            strings = {
                "android.permission.READ_MEDIA_AUDIO"
            }
        )
    }
)
public class VireonSTTPlugin extends Plugin {
    private static final String TAG = "VireonSTT";

    // Dedicated single background thread for native Whisper inference
    private final ExecutorService mExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean mIsCancelled = new AtomicBoolean(false);

    /**
     * Check whether native Whisper STT is available and ready on this device.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean hasLib = WhisperNative.isLibraryLoaded();
        String modelPath = findWhisperModel(null);
        boolean hasModel = (modelPath != null);

        JSObject result = new JSObject();
        result.put("available", hasLib && hasModel);
        result.put("hasLibrary", hasLib);
        result.put("hasModel", hasModel);
        result.put("modelPath", modelPath != null ? modelPath : "");
        result.put("engine", "whisper.cpp");
        if (!hasLib) {
            result.put("reason", "libwhisper native binary is not installed: " + WhisperNative.getLoadError());
        } else if (!hasModel) {
            result.put("reason", "GGML/GGUF Whisper model file not found in device storage.");
        }
        call.resolve(result);
    }

    /**
     * Cancel any ongoing native transcription.
     */
    @PluginMethod
    public void cancel(PluginCall call) {
        mIsCancelled.set(true);
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    /**
     * Perform native speech-to-text transcription on audio file path or URI.
     */
    @PluginMethod
    public void transcribe(PluginCall call) {
        final String audioPath = call.getString("audioPath");
        final String language = call.getString("language", "ar");
        final Double startTime = call.getDouble("startTime", 0.0);
        final Double endTime = call.getDouble("endTime", null);
        final String userModelPath = call.getString("modelPath", null);

        if (audioPath == null || audioPath.trim().isEmpty()) {
            call.reject("Audio path or URI is required for native transcription", "NATIVE_AUDIO_LOAD_FAILED");
            return;
        }

        mIsCancelled.set(false);

        // Run off the Android UI thread
        mExecutor.execute(() -> {
            try {
                if (mIsCancelled.get()) {
                    call.reject("Transcription was cancelled before start", "NATIVE_CANCELLED");
                    return;
                }

                // 1. Verify native JNI library
                if (!WhisperNative.isLibraryLoaded()) {
                    String err = WhisperNative.getLoadError();
                    Log.w(TAG, "Native STT unavailable: " + err);
                    call.reject("Native Whisper engine (libwhisper) is not available: " + err, "NATIVE_STT_UNAVAILABLE");
                    return;
                }

                // 2. Resolve Whisper GGML/GGUF model file
                String resolvedModelPath = findWhisperModel(userModelPath);
                if (resolvedModelPath == null) {
                    Log.w(TAG, "Native Whisper model file not found.");
                    call.reject("Native Whisper model file was not found on device storage", "NATIVE_MODEL_NOT_FOUND");
                    return;
                }

                // 3. Decode audio natively without passing large buffers through WebView
                Double durationSec = (endTime != null && startTime != null && endTime > startTime)
                        ? (endTime - startTime)
                        : null;

                Context context = getContext();
                float[] samples;
                try {
                    samples = NativeAudioDecoder.decodeTo16kMono(context, audioPath, startTime, durationSec);
                } catch (Exception e) {
                    Log.e(TAG, "Native audio decoding failed for path: " + audioPath, e);
                    call.reject("Failed to load and decode native audio: " + e.getMessage(), "NATIVE_AUDIO_LOAD_FAILED");
                    return;
                }

                if (samples == null || samples.length == 0) {
                    // Empty audio or silence
                    JSObject emptyResult = new JSObject();
                    emptyResult.put("success", true);
                    emptyResult.put("segments", new JSArray());
                    call.resolve(emptyResult);
                    return;
                }

                if (mIsCancelled.get()) {
                    call.reject("Transcription was cancelled during audio preparation", "NATIVE_CANCELLED");
                    return;
                }

                // 4. Initialize native Whisper context
                long ctx = WhisperNative.initContext(resolvedModelPath);
                if (ctx == 0) {
                    Log.e(TAG, "Failed to initialize native whisper context for: " + resolvedModelPath);
                    call.reject("Failed to initialize native whisper context", "NATIVE_MODEL_LOAD_FAILED");
                    return;
                }

                try {
                    // 5. Run inference with optimal thread count
                    int nThreads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
                    String langCode = (language != null && !language.isEmpty() && !language.equals("auto")) ? language : null;

                    int status = WhisperNative.fullTranscribe(ctx, samples, samples.length, langCode, nThreads, false);
                    if (status != 0) {
                        Log.e(TAG, "Native whisper inference returned error code: " + status);
                        call.reject("Native whisper inference failed with code: " + status, "NATIVE_INFERENCE_FAILED");
                        return;
                    }

                    if (mIsCancelled.get()) {
                        call.reject("Transcription was cancelled after inference", "NATIVE_CANCELLED");
                        return;
                    }

                    // 6. Extract timestamped segments and map with timeline offset
                    int numSegments = WhisperNative.getNumSegments(ctx);
                    JSArray segments = new JSArray();
                    double baseOffsetSec = (startTime != null) ? startTime : 0.0;

                    for (int i = 0; i < numSegments; i++) {
                        long t0 = WhisperNative.getSegmentT0(ctx, i); // in 10ms (centisecond) units
                        long t1 = WhisperNative.getSegmentT1(ctx, i);
                        String text = WhisperNative.getSegmentText(ctx, i);

                        double segStart = (t0 / 100.0) + baseOffsetSec;
                        double segEnd = (t1 / 100.0) + baseOffsetSec;

                        JSObject segObj = new JSObject();
                        segObj.put("start", segStart);
                        segObj.put("end", segEnd);
                        segObj.put("text", text != null ? text.trim() : "");
                        segObj.put("confidence", 0.95);
                        segments.put(segObj);
                    }

                    JSObject response = new JSObject();
                    response.put("success", true);
                    response.put("segments", segments);
                    call.resolve(response);
                } finally {
                    // Deterministic native resource cleanup
                    WhisperNative.freeContext(ctx);
                }
            } catch (Throwable t) {
                Log.e(TAG, "Unexpected error during native transcription", t);
                call.reject("Native transcription encountered unexpected error: " + t.getMessage(), "NATIVE_INFERENCE_FAILED");
            }
        });
    }

    /**
     * Search standard storage locations for a compatible GGML/GGUF Whisper model file.
     */
    private String findWhisperModel(String explicitPath) {
        if (explicitPath != null && !explicitPath.isEmpty()) {
            File f = new File(explicitPath);
            if (f.exists() && f.isFile()) return f.getAbsolutePath();
        }

        Context ctx = getContext();
        if (ctx == null) return null;

        String[] candidateFileNames = {
            "ggml-model.bin",
            "ggml-tiny.bin",
            "ggml-base.bin",
            "ggml-small.bin"
        };

        File[] candidateDirs = {
            new File(ctx.getFilesDir(), "models/whisper"),
            new File(ctx.getFilesDir(), "models"),
            new File(ctx.getExternalFilesDir(null), "models/whisper"),
            new File(ctx.getExternalFilesDir(null), "models"),
            ctx.getFilesDir(),
            ctx.getCacheDir()
        };

        for (File dir : candidateDirs) {
            if (dir == null || !dir.exists() || !dir.isDirectory()) continue;
            for (String name : candidateFileNames) {
                File candidate = new File(dir, name);
                if (candidate.exists() && candidate.isFile() && candidate.length() > 1024 * 1024) {
                    return candidate.getAbsolutePath();
                }
            }
        }

        return null;
    }

    @Override
    protected void handleOnDestroy() {
        mExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
