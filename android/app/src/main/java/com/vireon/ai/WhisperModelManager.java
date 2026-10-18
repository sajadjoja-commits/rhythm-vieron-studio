package com.vireon.ai;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Native AI Model Manager for Whisper on Android.
 * 
 * Manages model discovery, on-device storage, validation (GGML magic check),
 * safe streaming asset extraction, and metadata exposure to the JavaScript bridge.
 * 
 * Guarantees:
 * - NO binary model data passed through JS bridge/Capacitor.
 * - NO memory bloat (streaming 64KB buffer during extraction, no loading 75MB into Java heap).
 * - NO redundant extraction if valid model is already in app-private storage.
 * - Strict verification of GGML binary magic 0x67676d6c ("ggml").
 * - Structured error codes: NATIVE_MODEL_NOT_FOUND, NATIVE_MODEL_INVALID, NATIVE_MODEL_LOAD_FAILED.
 */
public class WhisperModelManager {
    private static final String TAG = "WhisperModelMgr";

    // Standard structured error codes
    public static final String ERROR_MODEL_NOT_FOUND = "NATIVE_MODEL_NOT_FOUND";
    public static final String ERROR_MODEL_INVALID = "NATIVE_MODEL_INVALID";
    public static final String ERROR_MODEL_LOAD_FAILED = "NATIVE_MODEL_LOAD_FAILED";

    // Expected GGML file header magic: 0x67676d6c (ASCII "ggml" in little-endian)
    public static final int GGML_FILE_MAGIC = 0x67676d6c;

    private static volatile WhisperModelManager sInstance;
    private final Context mContext;
    private final Map<String, ModelSpec> mCatalog = new LinkedHashMap<>();

    /**
     * Specification for a registered Whisper model.
     */
    public static class ModelSpec {
        public final String id;
        public final String name;
        public final String fileName;
        public final String language;
        public final String format;
        public final String version;
        public final long minBytes;
        public final boolean isDefault;

        public ModelSpec(
            String id,
            String name,
            String fileName,
            String language,
            String format,
            String version,
            long minBytes,
            boolean isDefault
        ) {
            this.id = id;
            this.name = name;
            this.fileName = fileName;
            this.language = language;
            this.format = format;
            this.version = version;
            this.minBytes = minBytes;
            this.isDefault = isDefault;
        }
    }

    public static class ModelException extends Exception {
        private final String mCode;

        public ModelException(String code, String message) {
            super(message);
            this.mCode = code;
        }

        public String getCode() {
            return mCode;
        }
    }

    public static WhisperModelManager getInstance(Context context) {
        if (sInstance == null) {
            synchronized (WhisperModelManager.class) {
                if (sInstance == null) {
                    sInstance = new WhisperModelManager(context.getApplicationContext());
                }
            }
        }
        return sInstance;
    }

    private WhisperModelManager(Context context) {
        this.mContext = context;
        initCatalog();
    }

    /**
     * Initialize catalog with supported model architectures.
     */
    private void initCatalog() {
        // 1. Current offline production model: multilingual Whisper Tiny (~75MB)
        registerModel(new ModelSpec(
            "whisper-tiny",
            "Whisper Tiny (Multilingual)",
            "ggml-tiny.bin",
            "multilingual",
            "ggml",
            "1.0",
            30 * 1024 * 1024L, // min ~30MB
            true
        ));

        // 2. Extensible future targets
        registerModel(new ModelSpec(
            "whisper-base",
            "Whisper Base (Multilingual)",
            "ggml-base.bin",
            "multilingual",
            "ggml",
            "1.0",
            100 * 1024 * 1024L,
            false
        ));

        registerModel(new ModelSpec(
            "whisper-small",
            "Whisper Small (Multilingual)",
            "ggml-small.bin",
            "multilingual",
            "ggml",
            "1.0",
            300 * 1024 * 1024L,
            false
        ));
    }

    public void registerModel(ModelSpec spec) {
        mCatalog.put(spec.id, spec);
    }

    public ModelSpec getModelSpec(String modelId) {
        if (modelId == null || modelId.trim().isEmpty() || modelId.equals("default")) {
            modelId = getDefaultModelId();
        }
        return mCatalog.get(modelId);
    }

    public String getDefaultModelId() {
        return "whisper-tiny";
    }

    /**
     * Primary app-private storage directory for offline Whisper models.
     */
    public File getStorageDir() {
        File dir = new File(mContext.getFilesDir(), "models/whisper");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    /**
     * Validate an existing GGML model file on disk:
     * 1. File exists and is regular file.
     * 2. Length > 0 and meets minimum threshold.
     * 3. First 4 bytes match GGML_FILE_MAGIC (0x67676d6c).
     */
    public boolean validateModelFile(File file, ModelSpec spec) {
        if (file == null || !file.exists() || !file.isFile()) {
            return false;
        }

        long minExpected = (spec != null) ? spec.minBytes : (1024 * 1024L);
        if (file.length() < minExpected) {
            Log.w(TAG, "Model file size too small: " + file.length() + " (min: " + minExpected + ")");
            return false;
        }

        // Verify GGML Magic Header
        try (FileInputStream fis = new FileInputStream(file);
             FileChannel channel = fis.getChannel()) {
            ByteBuffer buf = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN);
            int read = channel.read(buf);
            if (read < 4) {
                Log.w(TAG, "Unable to read 4 header bytes from model: " + file.getAbsolutePath());
                return false;
            }
            buf.flip();
            int magic = buf.getInt();
            if (magic != GGML_FILE_MAGIC) {
                Log.e(TAG, String.format("Bad GGML magic: 0x%08x (expected 0x%08x) in file: %s",
                    magic, GGML_FILE_MAGIC, file.getAbsolutePath()));
                return false;
            }
            return true;
        } catch (Throwable t) {
            Log.e(TAG, "Error validating model file: " + file.getAbsolutePath(), t);
            return false;
        }
    }

    /**
     * Check if a valid model file already exists on device storage.
     */
    public File findExistingModelFile(ModelSpec spec) {
        if (spec == null) return null;

        File[] candidateLocations = {
            new File(getStorageDir(), spec.fileName),
            new File(mContext.getFilesDir(), "models/" + spec.fileName),
            new File(mContext.getExternalFilesDir(null), "models/whisper/" + spec.fileName),
            new File(mContext.getExternalFilesDir(null), "models/" + spec.fileName),
            new File(mContext.getFilesDir(), spec.fileName),
            new File(mContext.getCacheDir(), spec.fileName)
        };

        for (File candidate : candidateLocations) {
            if (candidate != null && candidate.exists() && candidate.isFile()) {
                if (validateModelFile(candidate, spec)) {
                    return candidate;
                } else {
                    Log.w(TAG, "Found candidate model file but validation failed: " + candidate.getAbsolutePath());
                }
            }
        }
        return null;
    }

    /**
     * Check whether model asset is present in APK assets.
     */
    public String findAssetPath(ModelSpec spec) {
        if (spec == null) return null;

        AssetManager am = mContext.getAssets();
        String[] prefixes = {"models/whisper/", "models/", ""};

        for (String prefix : prefixes) {
            String fullPath = prefix + spec.fileName;
            try (InputStream is = am.open(fullPath)) {
                return fullPath;
            } catch (Exception ignored) {
                // Not in this prefix
            }
        }
        return null;
    }

    /**
     * Safely extract model file from APK assets into app-private storage.
     * Uses a temporary file and atomic rename to prevent corrupt partial writes.
     * Uses a 64KB buffer so the 75MB model does not bloat Java heap RAM.
     */
    public synchronized File extractModelFromAssets(ModelSpec spec) throws ModelException {
        if (spec == null) {
            throw new ModelException(ERROR_MODEL_NOT_FOUND, "Model specification is null");
        }

        String assetPath = findAssetPath(spec);
        if (assetPath == null) {
            throw new ModelException(ERROR_MODEL_NOT_FOUND,
                "Model asset not found in APK assets for: " + spec.fileName);
        }

        File targetFile = new File(getStorageDir(), spec.fileName);
        File tmpFile = new File(getStorageDir(), spec.fileName + ".tmp");

        Log.i(TAG, "Extracting model asset '" + assetPath + "' to: " + targetFile.getAbsolutePath());

        AssetManager am = mContext.getAssets();
        try (InputStream is = am.open(assetPath);
             OutputStream os = new FileOutputStream(tmpFile)) {

            byte[] buffer = new byte[65536]; // 64 KB streaming buffer
            int read;
            long totalCopied = 0;
            while ((read = is.read(buffer)) != -1) {
                os.write(buffer, 0, read);
                totalCopied += read;
            }
            os.flush();

            Log.i(TAG, "Asset copy complete (" + totalCopied + " bytes). Validating temporary file...");

            if (!validateModelFile(tmpFile, spec)) {
                tmpFile.delete();
                throw new ModelException(ERROR_MODEL_INVALID,
                    "Extracted model failed GGML validation (bad magic or truncated): " + spec.fileName);
            }

            if (targetFile.exists()) {
                targetFile.delete();
            }

            if (!tmpFile.renameTo(targetFile)) {
                // Fallback copy if rename fails
                try (InputStream fin = new FileInputStream(tmpFile);
                     OutputStream fout = new FileOutputStream(targetFile)) {
                    while ((read = fin.read(buffer)) != -1) {
                        fout.write(buffer, 0, read);
                    }
                    fout.flush();
                }
                tmpFile.delete();
            }

            Log.i(TAG, "Model successfully installed in app-private storage: " + targetFile.getAbsolutePath());
            return targetFile;
        } catch (ModelException me) {
            throw me;
        } catch (Throwable t) {
            if (tmpFile.exists()) {
                tmpFile.delete();
            }
            Log.e(TAG, "Failed to extract model from assets: " + t.getMessage(), t);
            throw new ModelException(ERROR_MODEL_LOAD_FAILED,
                "Failed to extract model asset: " + t.getMessage());
        }
    }

    /**
     * Resolve and ensure local file path for inference:
     * 1. Validates explicit path if given.
     * 2. Checks app-private storage (no re-extraction if valid file exists).
     * 3. Extracts from assets only if needed.
     * 4. Throws structured ModelException on failure.
     */
    public synchronized String resolveAndEnsureModelPath(String modelId, String explicitPath) throws ModelException {
        // 1. Explicit path handling
        if (explicitPath != null && !explicitPath.trim().isEmpty()) {
            File explicitFile = new File(explicitPath.trim());
            if (!explicitFile.exists() || !explicitFile.isFile()) {
                throw new ModelException(ERROR_MODEL_NOT_FOUND,
                    "Explicit model path does not exist: " + explicitPath);
            }
            if (!validateModelFile(explicitFile, null)) {
                throw new ModelException(ERROR_MODEL_INVALID,
                    "Explicit model file failed GGML validation: " + explicitPath);
            }
            return explicitFile.getAbsolutePath();
        }

        // 2. Resolve catalog specification
        ModelSpec spec = getModelSpec(modelId);
        if (spec == null) {
            throw new ModelException(ERROR_MODEL_NOT_FOUND,
                "Unknown Whisper model ID: " + modelId);
        }

        // 3. Check existing file on disk in app-private storage
        File existing = findExistingModelFile(spec);
        if (existing != null) {
            return existing.getAbsolutePath();
        }

        // 4. Try extracting from APK assets
        File extracted = extractModelFromAssets(spec);
        if (extracted != null && extracted.exists()) {
            return extracted.getAbsolutePath();
        }

        throw new ModelException(ERROR_MODEL_NOT_FOUND,
            "Whisper model '" + spec.id + "' (" + spec.fileName + ") was not found on device storage or assets.");
    }

    /**
     * Generate metadata for React without sending any binary model bytes.
     */
    public JSObject getModelMetadata(String modelId) {
        ModelSpec spec = getModelSpec(modelId);
        if (spec == null) return null;
        return buildModelMetadataObject(spec);
    }

    public JSArray getAllModelsMetadata() {
        JSArray array = new JSArray();
        for (ModelSpec spec : mCatalog.values()) {
            array.put(buildModelMetadataObject(spec));
        }
        return array;
    }

    private JSObject buildModelMetadataObject(ModelSpec spec) {
        JSObject obj = new JSObject();
        obj.put("id", spec.id);
        obj.put("name", spec.name);
        obj.put("fileName", spec.fileName);
        obj.put("format", spec.format);
        obj.put("language", spec.language);
        obj.put("version", spec.version);
        obj.put("isDefault", spec.isDefault);

        File existing = findExistingModelFile(spec);
        if (existing != null) {
            obj.put("isAvailable", true);
            obj.put("status", "ready");
            obj.put("size", existing.length());
            obj.put("storagePath", existing.getAbsolutePath());
        } else {
            String assetPath = findAssetPath(spec);
            if (assetPath != null) {
                obj.put("isAvailable", true);
                obj.put("status", "in_assets");
                long assetSize = 0;
                try (AssetFileDescriptor afd = mContext.getAssets().openFd(assetPath)) {
                    assetSize = afd.getLength();
                } catch (Exception ignored) {}
                obj.put("size", assetSize > 0 ? assetSize : spec.minBytes);
                obj.put("storagePath", "");
            } else {
                obj.put("isAvailable", false);
                obj.put("status", "not_found");
                obj.put("size", 0);
                obj.put("storagePath", "");
            }
        }

        return obj;
    }
}
