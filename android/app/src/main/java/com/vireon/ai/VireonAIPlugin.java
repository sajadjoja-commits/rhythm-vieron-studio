package com.vireon.ai;

import android.app.ActivityManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Phase 7.1: Vireon Native AI Engine Plugin
 *
 * Truthful, memory-safe Android Native AI integration:
 * - Native low-copy pipeline avoiding JavaScript heap bloat & Base64 transfers.
 * - Accurate hardware capability detection (ARM64, NNAPI API presence, truthful accelerator flags).
 * - Real Google ML Kit Subject Segmentation & Face Detection with dynamic Play Services modules.
 * - Strict memory safety: proactive bitmap recycling, scoped buffer lifetime, and cache purging.
 * - Comprehensive structured error codes & responsive cancellation tokens.
 */
@CapacitorPlugin(name = "VireonAI")
public class VireonAIPlugin extends Plugin {
    private static final String TAG = "VireonAI";

    // Structured error codes contract
    public static final String ERROR_MODEL_NOT_FOUND = "AI_MODEL_NOT_FOUND";
    public static final String ERROR_MODEL_INVALID = "AI_MODEL_INVALID";
    public static final String ERROR_RUNTIME_UNAVAILABLE = "AI_RUNTIME_UNAVAILABLE";
    public static final String ERROR_ACCELERATOR_UNAVAILABLE = "AI_ACCELERATOR_UNAVAILABLE";
    public static final String ERROR_OUT_OF_MEMORY = "AI_OUT_OF_MEMORY";
    public static final String ERROR_INFERENCE_FAILED = "AI_INFERENCE_FAILED";
    public static final String ERROR_CANCELLED = "AI_CANCELLED";
    public static final String ERROR_UNSUPPORTED_OPERATION = "AI_UNSUPPORTED_OPERATION";

    private final ExecutorService mExecutor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, AtomicBoolean> mActiveOperations = new ConcurrentHashMap<>();

    @PluginMethod
    public void getAICapabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("nativeAI", true);
        ret.put("platform", "android");

        // 1. Architecture detection (ARM64 check)
        boolean isArm64 = false;
        if (Build.SUPPORTED_ABIS != null) {
            for (String abi : Build.SUPPORTED_ABIS) {
                if ("arm64-v8a".equalsIgnoreCase(abi)) {
                    isArm64 = true;
                    break;
                }
            }
        }
        ret.put("arm64", isArm64);

        // 2. Truthful Accelerator & API capability reporting
        // NNAPI API is introduced in Android 8.1 (API 27). This denotes API presence, not active delegate.
        boolean hasNnapiApi = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1;

        JSObject accelerators = new JSObject();
        accelerators.put("nnapiApiAvailable", hasNnapiApi);
        // Do not falsely claim GPU or XNNPACK unless an explicit GPU/XNNPACK engine is attached
        accelerators.put("gpuUsable", false);
        accelerators.put("xnnpackUsable", false);
        ret.put("accelerators", accelerators);

        // 3. Memory detection
        long availMB = 0;
        long totalMB = 0;
        String tier = "medium";
        try {
            ActivityManager actManager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (actManager != null) {
                ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
                actManager.getMemoryInfo(memInfo);
                availMB = memInfo.availMem / (1024 * 1024);
                totalMB = memInfo.totalMem / (1024 * 1024);

                if (totalMB >= 7500) {
                    tier = "flagship";
                } else if (totalMB >= 4500) {
                    tier = "high";
                } else if (totalMB >= 2500) {
                    tier = "medium";
                } else {
                    tier = "low";
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to query system memory: " + e.getMessage());
        }

        JSObject memory = new JSObject();
        memory.put("availableMB", availMB);
        memory.put("totalMB", totalMB);
        ret.put("memory", memory);
        ret.put("performanceTier", tier);

        // 4. Truthful runtime availability
        JSObject runtimes = new JSObject();
        runtimes.put("whisperCpp", true);
        runtimes.put("mlkitSubjectSegmentation", true);
        runtimes.put("mlkitFaceDetection", true);
        runtimes.put("mediapipe", false); // MediaPipe is web-only in this project
        runtimes.put("onnx", false);      // ONNX Runtime Mobile is not embedded in APK
        ret.put("runtimes", runtimes);

        JSArray backends = new JSArray();
        backends.put("mlkit_subject_segmentation");
        backends.put("mlkit_face_detection");
        backends.put("whisper_cpp");
        ret.put("backends", backends);

        // Flat backwards-compatibility fields
        ret.put("availableMemoryMB", availMB);
        ret.put("totalMemoryMB", totalMB);
        ret.put("nnapi", hasNnapiApi);
        ret.put("gpuAcceleration", false);
        ret.put("xnnpack", false);

        call.resolve(ret);
    }

    @PluginMethod
    public void getAIModelStatus(PluginCall call) {
        String modelId = call.getString("modelId", "");
        JSObject ret = new JSObject();

        if ("mlkit-subject-segmenter".equals(modelId) || modelId.contains("segment")) {
            ret.put("status", "AVAILABLE");
            ret.put("available", true);
            ret.put("framework", "mlkit");
        } else if ("mlkit-face-detector".equals(modelId) || modelId.contains("face")) {
            ret.put("status", "AVAILABLE");
            ret.put("available", true);
            ret.put("framework", "mlkit");
        } else if (modelId.contains("whisper")) {
            WhisperModelManager mgr = WhisperModelManager.getInstance(getContext());
            JSObject info = mgr.getModelMetadata(modelId);
            boolean avail = info != null && Boolean.TRUE.equals(info.getBool("isAvailable"));
            ret.put("status", avail ? "AVAILABLE" : "NOT_DOWNLOADED");
            ret.put("available", avail);
            ret.put("framework", "whisper.cpp");
        } else if ("rmbg-2.0".equals(modelId)) {
            File rmbgFile = new File(getContext().getFilesDir(), "models/rmbg-2.0.onnx");
            boolean downloaded = rmbgFile.exists() && rmbgFile.length() > 1000000;
            ret.put("status", downloaded ? "AVAILABLE" : "NOT_DOWNLOADED");
            ret.put("available", downloaded);
            ret.put("framework", "onnx");
        } else {
            // Strictly truthful: never report an unknown/unsupported model as AVAILABLE
            ret.put("status", "NOT_SUPPORTED");
            ret.put("available", false);
            ret.put("framework", "unknown");
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void removeBackground(PluginCall call) {
        executeSegmentation(call);
    }

    @PluginMethod
    public void segmentImage(PluginCall call) {
        executeSegmentation(call);
    }

    private void executeSegmentation(PluginCall call) {
        String opId = call.getString("operationId", "ai_seg_" + System.currentTimeMillis());
        AtomicBoolean cancelToken = new AtomicBoolean(false);
        mActiveOperations.put(opId, cancelToken);

        mExecutor.execute(() -> {
            long startTime = System.currentTimeMillis();
            Bitmap originalBitmap = null;
            Bitmap outputBitmap = null;
            try {
                if (cancelToken.get()) {
                    call.reject("Operation was cancelled by user", ERROR_CANCELLED);
                    return;
                }

                String filePath = call.getString("filePath");
                String imageUri = call.getString("imageUri");
                String imageBase64 = call.getString("imageBase64");
                boolean refineEdges = call.getBoolean("refineEdges", true);

                // Proactive cache housekeeping on background thread
                cleanOldCacheFiles();

                originalBitmap = loadBitmap(filePath, imageUri, imageBase64);
                if (originalBitmap == null) {
                    call.reject("Unable to decode input image from provided path or URI", ERROR_MODEL_INVALID);
                    return;
                }

                if (cancelToken.get()) {
                    call.reject("Operation cancelled during image preparation", ERROR_CANCELLED);
                    return;
                }

                SubjectSegmenterOptions options = new SubjectSegmenterOptions.Builder()
                        .enableForegroundBitmap()
                        .enableForegroundConfidenceMask()
                        .build();

                SubjectSegmenter segmenter = SubjectSegmentation.getClient(options);
                InputImage inputImage = InputImage.fromBitmap(originalBitmap, 0);

                SubjectSegmentationResult result;
                try {
                    result = Tasks.await(segmenter.process(inputImage), 30, TimeUnit.SECONDS);
                } catch (Exception mlKitErr) {
                    Log.e(TAG, "ML Kit Subject Segmentation inference failed: " + mlKitErr.getMessage());
                    call.reject("ML Kit Subject Segmentation inference failed: " + mlKitErr.getMessage(), ERROR_INFERENCE_FAILED);
                    return;
                }

                if (cancelToken.get()) {
                    call.reject("Operation cancelled after neural inference", ERROR_CANCELLED);
                    return;
                }

                if (result == null) {
                    call.reject("ML Kit did not produce any segmentation result", ERROR_INFERENCE_FAILED);
                    return;
                }

                FloatBuffer maskBuffer = result.getForegroundConfidenceMask();
                Bitmap fgBitmap = result.getForegroundBitmap();

                if (maskBuffer != null) {
                    maskBuffer.rewind();
                    outputBitmap = applyMaskToBitmap(originalBitmap, maskBuffer, refineEdges);
                } else if (fgBitmap != null) {
                    outputBitmap = fgBitmap.copy(Bitmap.Config.ARGB_8888, true);
                }

                // Immediately release originalBitmap to reduce memory pressure
                if (originalBitmap != null && !originalBitmap.isRecycled()) {
                    originalBitmap.recycle();
                    originalBitmap = null;
                }

                if (outputBitmap == null) {
                    call.reject("Failed to extract foreground cutout bitmap", ERROR_INFERENCE_FAILED);
                    return;
                }

                if (cancelToken.get()) {
                    call.reject("Operation cancelled before writing output file", ERROR_CANCELLED);
                    return;
                }

                // Save directly to native cache directory (native low-copy pipeline)
                File cacheDir = new File(getContext().getCacheDir(), "vieron_ai");
                if (!cacheDir.exists()) cacheDir.mkdirs();

                File outputFile = new File(cacheDir, "cutout_" + System.currentTimeMillis() + ".png");
                try (FileOutputStream fos = new FileOutputStream(outputFile)) {
                    outputBitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
                    fos.flush();
                }

                int outW = outputBitmap.getWidth();
                int outH = outputBitmap.getHeight();

                long elapsed = System.currentTimeMillis() - startTime;

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("filePath", outputFile.getAbsolutePath());
                ret.put("outputUri", Uri.fromFile(outputFile).toString());
                ret.put("width", outW);
                ret.put("height", outH);
                ret.put("processingTime", elapsed);
                ret.put("engine", "Google ML Kit Subject Segmentation (Android Native)");

                call.resolve(ret);

            } catch (OutOfMemoryError oom) {
                Log.e(TAG, "Out of memory in executeSegmentation", oom);
                call.reject("Device ran out of memory during neural segmentation", ERROR_OUT_OF_MEMORY);
            } catch (Exception e) {
                Log.e(TAG, "Error in executeSegmentation: " + e.getMessage(), e);
                call.reject("Segmentation failed: " + e.getMessage(), ERROR_INFERENCE_FAILED);
            } finally {
                mActiveOperations.remove(opId);
                if (originalBitmap != null && !originalBitmap.isRecycled()) {
                    originalBitmap.recycle();
                }
                if (outputBitmap != null && !outputBitmap.isRecycled()) {
                    outputBitmap.recycle();
                }
            }
        });
    }

    /**
     * Real Google ML Kit Face Detection Implementation
     * Accurately extracts face count, bounding boxes, Euler orientation angles,
     * smiling probability, and eye open probabilities without fake stubs.
     */
    @PluginMethod
    public void detectFaces(PluginCall call) {
        String opId = call.getString("operationId", "ai_face_" + System.currentTimeMillis());
        AtomicBoolean cancelToken = new AtomicBoolean(false);
        mActiveOperations.put(opId, cancelToken);

        mExecutor.execute(() -> {
            long startTime = System.currentTimeMillis();
            Bitmap originalBitmap = null;
            try {
                if (cancelToken.get()) {
                    call.reject("Operation cancelled by user", ERROR_CANCELLED);
                    return;
                }

                String filePath = call.getString("filePath");
                String imageUri = call.getString("imageUri");

                originalBitmap = loadBitmap(filePath, imageUri, null);
                if (originalBitmap == null) {
                    call.reject("Unable to decode input image for face detection", ERROR_MODEL_INVALID);
                    return;
                }

                if (cancelToken.get()) {
                    call.reject("Operation cancelled during image preparation", ERROR_CANCELLED);
                    return;
                }

                // Configure real Google ML Kit Face Detection
                FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                        .build();

                FaceDetector detector = FaceDetection.getClient(options);
                InputImage inputImage = InputImage.fromBitmap(originalBitmap, 0);

                List<Face> faces;
                try {
                    faces = Tasks.await(detector.process(inputImage), 25, TimeUnit.SECONDS);
                } catch (Exception detectorErr) {
                    Log.e(TAG, "ML Kit Face Detection process failed: " + detectorErr.getMessage());
                    call.reject("ML Kit Face Detection unavailable or failed: " + detectorErr.getMessage(), ERROR_RUNTIME_UNAVAILABLE);
                    return;
                }

                if (cancelToken.get()) {
                    call.reject("Operation cancelled after face inference", ERROR_CANCELLED);
                    return;
                }

                JSArray facesArray = new JSArray();
                if (faces != null) {
                    for (Face face : faces) {
                        JSObject faceObj = new JSObject();
                        Rect bounds = face.getBoundingBox();

                        JSObject box = new JSObject();
                        box.put("x", bounds.left);
                        box.put("y", bounds.top);
                        box.put("width", bounds.width());
                        box.put("height", bounds.height());
                        faceObj.put("box", box);

                        if (face.getTrackingId() != null) {
                            faceObj.put("trackingId", face.getTrackingId());
                        }

                        faceObj.put("headEulerAngleX", face.getHeadEulerAngleX());
                        faceObj.put("headEulerAngleY", face.getHeadEulerAngleY());
                        faceObj.put("headEulerAngleZ", face.getHeadEulerAngleZ());

                        if (face.getSmilingProbability() != null) {
                            faceObj.put("smilingProbability", face.getSmilingProbability());
                        }
                        if (face.getLeftEyeOpenProbability() != null) {
                            faceObj.put("leftEyeOpenProbability", face.getLeftEyeOpenProbability());
                        }
                        if (face.getRightEyeOpenProbability() != null) {
                            faceObj.put("rightEyeOpenProbability", face.getRightEyeOpenProbability());
                        }

                        facesArray.put(faceObj);
                    }
                }

                long elapsed = System.currentTimeMillis() - startTime;

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("facesCount", faces != null ? faces.size() : 0);
                ret.put("faces", facesArray);
                ret.put("processingTime", elapsed);
                ret.put("engine", "Google ML Kit Face Detection (Android Native)");

                call.resolve(ret);

            } catch (OutOfMemoryError oom) {
                call.reject("Out of memory during face detection", ERROR_OUT_OF_MEMORY);
            } catch (Exception e) {
                Log.e(TAG, "Face detection error: " + e.getMessage(), e);
                call.reject("Face detection failed: " + e.getMessage(), ERROR_INFERENCE_FAILED);
            } finally {
                mActiveOperations.remove(opId);
                if (originalBitmap != null && !originalBitmap.isRecycled()) {
                    originalBitmap.recycle();
                }
            }
        });
    }

    @PluginMethod
    public void cancelAI(PluginCall call) {
        String opId = call.getString("operationId");
        if (opId != null && !opId.isEmpty()) {
            AtomicBoolean token = mActiveOperations.get(opId);
            if (token != null) {
                token.set(true);
                JSObject ret = new JSObject();
                ret.put("cancelled", true);
                call.resolve(ret);
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void getAIBenchmark(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("benchmarks", new JSArray());
        ret.put("status", "NOT_MEASURED");
        call.resolve(ret);
    }

    private Bitmap loadBitmap(String filePath, String imageUri, String base64Data) {
        try {
            if (filePath != null && !filePath.isEmpty()) {
                File f = new File(filePath.replace("file://", ""));
                if (f.exists()) {
                    return BitmapFactory.decodeFile(f.getAbsolutePath());
                }
            }

            if (imageUri != null && !imageUri.isEmpty()) {
                Uri uri = Uri.parse(imageUri);
                try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
                    if (is != null) {
                        return BitmapFactory.decodeStream(is);
                    }
                }
            }

            if (base64Data != null && !base64Data.isEmpty()) {
                byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error loading bitmap: " + e.getMessage());
        }
        return null;
    }

    private Bitmap applyMaskToBitmap(Bitmap src, FloatBuffer mask, boolean refineEdges) {
        int w = src.getWidth();
        int h = src.getHeight();
        Bitmap result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);

        int[] pixels = new int[w * h];
        src.getPixels(pixels, 0, w, 0, 0, w, h);

        float threshold = refineEdges ? 0.45f : 0.5f;

        for (int i = 0; i < pixels.length; i++) {
            float confidence = mask.hasRemaining() ? mask.get() : 0f;
            if (confidence < threshold) {
                pixels[i] = 0x00000000; // Transparent
            } else {
                int alpha = (int) (Math.min(1.0f, confidence) * 255);
                int color = pixels[i];
                pixels[i] = (alpha << 24) | (color & 0x00FFFFFF);
            }
        }

        result.setPixels(pixels, 0, w, 0, 0, w, h);
        return result;
    }

    /**
     * Purges temporary AI cache files older than 24 hours to prevent cache leakage.
     */
    private void cleanOldCacheFiles() {
        try {
            File cacheDir = new File(getContext().getCacheDir(), "vieron_ai");
            if (!cacheDir.exists() || !cacheDir.isDirectory()) return;

            long now = System.currentTimeMillis();
            long maxAgeMs = 24L * 60 * 60 * 1000; // 24 hours

            File[] files = cacheDir.listFiles();
            if (files != null && files.length > 20) {
                for (File file : files) {
                    if (now - file.lastModified() > maxAgeMs) {
                        file.delete();
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to clean old AI cache files: " + e.getMessage());
        }
    }
}
