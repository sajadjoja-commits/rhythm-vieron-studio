package com.vireon.ai;

import android.Manifest;
import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Native Speech-to-Text (STT) Plugin for Vireon AI Studio on Android.
 * 
 * Executes on-device offline Whisper inference via native JNI whisper.cpp,
 * using high-performance local audio decoding (MediaCodec/MediaExtractor),
 * robust Model Manager discovery/validation, cached native context reuse,
 * and responsive abort_callback cancellation.
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

    // Dedicated single background thread for native Whisper inference (whisper.cpp is single-context thread-bound)
    private final ExecutorService mExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean mIsCancelled = new AtomicBoolean(false);
    private final AtomicLong mActiveContextPtr = new AtomicLong(0);

    // Native context reuse to avoid 75MB re-initialization overhead across caption requests
    private final Object mContextLock = new Object();
    private long mCachedContextPtr = 0;
    private String mCachedModelPath = null;

    /**
     * Check whether native Whisper STT is available and ready on this device.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean hasLib = WhisperNative.isLibraryLoaded();
        String modelId = call.getString("modelId", null);
        WhisperModelManager modelMgr = WhisperModelManager.getInstance(getContext());
        JSObject modelInfo = modelMgr.getModelMetadata(modelId);
        boolean hasModel = (modelInfo != null && Boolean.TRUE.equals(modelInfo.getBool("isAvailable")));

        JSObject result = new JSObject();
        result.put("available", hasLib && hasModel);
        result.put("hasLibrary", hasLib);
        result.put("hasModel", hasModel);
        result.put("modelId", modelInfo != null ? modelInfo.getString("id") : modelMgr.getDefaultModelId());
        result.put("modelPath", modelInfo != null ? modelInfo.getString("storagePath") : "");
        result.put("modelInfo", modelInfo);
        result.put("engine", "whisper.cpp");

        if (hasLib) {
            try {
                result.put("systemInfo", WhisperNative.getSystemInfo());
            } catch (Throwable ignored) {}
        }

        if (!hasLib) {
            result.put("reason", "libwhisper native binary is not loaded: " + WhisperNative.getLoadError());
        } else if (!hasModel) {
            result.put("reason", "GGML Whisper model file (ggml-*.bin) not found in device storage or assets.");
        }
        call.resolve(result);
    }

    /**
     * Retrieve all registered Whisper models metadata without passing binary data.
     */
    @PluginMethod
    public void getModels(PluginCall call) {
        WhisperModelManager modelMgr = WhisperModelManager.getInstance(getContext());
        JSObject result = new JSObject();
        result.put("models", modelMgr.getAllModelsMetadata());
        result.put("defaultModelId", modelMgr.getDefaultModelId());
        call.resolve(result);
    }

    /**
     * Get metadata for a specific model ID.
     */
    @PluginMethod
    public void getModelInfo(PluginCall call) {
        String modelId = call.getString("modelId");
        WhisperModelManager modelMgr = WhisperModelManager.getInstance(getContext());
        JSObject info = modelMgr.getModelMetadata(modelId);

        JSObject result = new JSObject();
        result.put("model", info);
        call.resolve(result);
    }

    /**
     * Check if a specific model ID is available and ready on the device.
     */
    @PluginMethod
    public void isModelAvailable(PluginCall call) {
        String modelId = call.getString("modelId");
        WhisperModelManager modelMgr = WhisperModelManager.getInstance(getContext());
        JSObject info = modelMgr.getModelMetadata(modelId);
        boolean available = (info != null && Boolean.TRUE.equals(info.getBool("isAvailable")));

        JSObject result = new JSObject();
        result.put("available", available);
        result.put("modelId", modelId != null ? modelId : modelMgr.getDefaultModelId());
        result.put("status", info != null ? info.getString("status") : "not_found");
        call.resolve(result);
    }

    /**
     * Explicitly free cached native Whisper model context to reclaim RAM.
     */
    @PluginMethod
    public void releaseModel(PluginCall call) {
        synchronized (mContextLock) {
            if (mCachedContextPtr != 0) {
                Log.i(TAG, "Releasing cached native Whisper context: " + mCachedContextPtr);
                WhisperNative.freeContext(mCachedContextPtr);
                mCachedContextPtr = 0;
                mCachedModelPath = null;
            }
        }
        JSObject ret = new JSObject();
        ret.put("released", true);
        call.resolve(ret);
    }

    /**
     * Cancel any ongoing native transcription via whisper.cpp abort_callback.
     */
    @PluginMethod
    public void cancel(PluginCall call) {
        mIsCancelled.set(true);
        long activeCtx = mActiveContextPtr.get();
        if (activeCtx != 0) {
            try {
                WhisperNative.cancelTranscription(activeCtx);
            } catch (Throwable t) {
                Log.w(TAG, "Failed to send cancel to native whisper context: " + t.getMessage());
            }
        }
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
        final String modelId = call.getString("modelId", null);

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

                // 2. Resolve & Validate Whisper GGML model file via Model Manager
                WhisperModelManager modelMgr = WhisperModelManager.getInstance(getContext());
                String resolvedModelPath;
                try {
                    resolvedModelPath = modelMgr.resolveAndEnsureModelPath(modelId, userModelPath);
                } catch (WhisperModelManager.ModelException me) {
                    Log.w(TAG, "Model resolution error: " + me.getMessage() + " [" + me.getCode() + "]");
                    call.reject(me.getMessage(), me.getCode());
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

                // 4. Initialize or reuse cached native Whisper context from GGML model file
                long ctx = 0;
                synchronized (mContextLock) {
                    if (mCachedContextPtr != 0 && resolvedModelPath.equals(mCachedModelPath)) {
                        ctx = mCachedContextPtr;
                    } else {
                        if (mCachedContextPtr != 0) {
                            WhisperNative.freeContext(mCachedContextPtr);
                            mCachedContextPtr = 0;
                            mCachedModelPath = null;
                        }
                        ctx = WhisperNative.initContext(resolvedModelPath);
                        if (ctx != 0) {
                            mCachedContextPtr = ctx;
                            mCachedModelPath = resolvedModelPath;
                        }
                    }
                }

                if (ctx == 0) {
                    Log.e(TAG, "Failed to initialize native whisper context for: " + resolvedModelPath);
                    call.reject("Failed to initialize native whisper context", WhisperModelManager.ERROR_MODEL_LOAD_FAILED);
                    return;
                }

                mActiveContextPtr.set(ctx);

                try {
                    // 5. Run inference with optimal thread count
                    int nThreads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
                    String langCode = (language != null && !language.isEmpty() && !language.equals("auto")) ? language : null;

                    int status = WhisperNative.fullTranscribe(ctx, samples, samples.length, langCode, nThreads, false);

                    if (mIsCancelled.get() || status != 0) {
                        if (mIsCancelled.get()) {
                            call.reject("Transcription was cancelled during native inference", "NATIVE_CANCELLED");
                            return;
                        }
                        Log.e(TAG, "Native whisper inference returned error code: " + status);
                        // Invalidate cached context on error
                        synchronized (mContextLock) {
                            if (mCachedContextPtr == ctx) {
                                WhisperNative.freeContext(mCachedContextPtr);
                                mCachedContextPtr = 0;
                                mCachedModelPath = null;
                            }
                        }
                        call.reject("Native whisper inference failed with code: " + status, "NATIVE_INFERENCE_FAILED");
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
                        float conf = WhisperNative.getSegmentConfidence(ctx, i);

                        double segStart = (t0 / 100.0) + baseOffsetSec;
                        double segEnd = (t1 / 100.0) + baseOffsetSec;

                        JSObject segObj = new JSObject();
                        segObj.put("start", segStart);
                        segObj.put("end", segEnd);
                        segObj.put("text", text != null ? text.trim() : "");
                        segObj.put("confidence", (double) conf);
                        segments.put(segObj);
                    }

                    JSObject response = new JSObject();
                    response.put("success", true);
                    response.put("segments", segments);
                    call.resolve(response);
                } finally {
                    mActiveContextPtr.set(0);
                }
            } catch (Throwable t) {
                Log.e(TAG, "Unexpected error during native transcription", t);
                call.reject("Native transcription encountered unexpected error: " + t.getMessage(), "NATIVE_INFERENCE_FAILED");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (mContextLock) {
            if (mCachedContextPtr != 0) {
                try {
                    WhisperNative.freeContext(mCachedContextPtr);
                } catch (Throwable ignored) {}
                mCachedContextPtr = 0;
                mCachedModelPath = null;
            }
        }
        mExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
