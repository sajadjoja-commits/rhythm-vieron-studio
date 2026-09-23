package com.vireon.ai;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Media Plugin for Vireon AI Studio on Android.
 * 
 * Phase 5 High-Performance Media Pipeline:
 * - Operates entirely with file paths, content:// URIs, and file descriptors.
 * - Eliminates Base64/ArrayBuffer bridges for heavy media.
 * - Direct on-device MediaMetadataRetriever extraction without loading video into RAM.
 * - Fast native streaming, remuxing, trimming, and gallery persistence.
 * - Asynchronous background execution with cancellation support.
 */
@CapacitorPlugin(
    name = "VireonMedia",
    permissions = {
        @Permission(
            alias = "publicStorage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        ),
        @Permission(
            alias = "media",
            strings = {
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
                "android.permission.READ_MEDIA_AUDIO"
            }
        ),
        @Permission(
            alias = "camera",
            strings = {
                Manifest.permission.CAMERA
            }
        )
    }
)
public class VireonMediaPlugin extends Plugin {
    private static final String TAG = "VireonMedia";
    private static final int BUFFER_SIZE = 32768; // 32KB streaming buffer (zero RAM bloat)

    private final ExecutorService mExecutor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, AtomicBoolean> mActiveOperations = new ConcurrentHashMap<>();

    // =========================================================================
    // 1. Pickers (Video, Image, Audio, Combined)
    // =========================================================================

    @PluginMethod
    public void pickVideo(PluginCall call) {
        if (checkMediaPermissions()) {
            openVideoPicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PluginMethod
    public void pickImage(PluginCall call) {
        if (checkMediaPermissions()) {
            openImagePicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PluginMethod
    public void pickAudio(PluginCall call) {
        if (checkMediaPermissions()) {
            openAudioPicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PluginMethod
    public void pickMedia(PluginCall call) {
        if (checkMediaPermissions()) {
            openMediaPicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (checkMediaPermissions()) {
            String method = call.getMethodName();
            if ("pickVideo".equals(method)) {
                openVideoPicker(call);
            } else if ("pickImage".equals(method)) {
                openImagePicker(call);
            } else if ("pickAudio".equals(method)) {
                openAudioPicker(call);
            } else if ("pickMedia".equals(method)) {
                openMediaPicker(call);
            }
        } else {
            call.reject("صلاحيات الوصول مرفوضة.", "PERMISSION_DENIED");
        }
    }

    private boolean checkMediaPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPermissionState("media") == PermissionState.GRANTED;
        } else {
            return getPermissionState("publicStorage") == PermissionState.GRANTED;
        }
    }

    private void openMediaPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    private void openVideoPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    private void openImagePicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    private void openAudioPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    @ActivityCallback
    public void mediaPickCallback(PluginCall call, ActivityResult result) {
        if (call == null) return;
        
        Intent data = result.getData();
        if (data == null || (data.getData() == null && data.getClipData() == null)) {
            call.reject("CANCELLED", "CANCELLED");
            return;
        }

        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int i = 0; i < count; i++) {
                uris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        mExecutor.execute(() -> processPickedUris(call, uris));
    }

    private void processPickedUris(PluginCall call, List<Uri> uris) {
        try {
            JSArray results = new JSArray();
            File destDir = new File(getContext().getFilesDir(), "vireon_media");
            if (!destDir.exists() && !destDir.mkdirs()) {
                Log.e(TAG, "Failed to create vireon_media directory");
            }

            for (Uri uri : uris) {
                String mimeType = getContext().getContentResolver().getType(uri);
                String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
                if (extension == null) extension = "bin";
                
                String fileName = "media_" + System.currentTimeMillis() + "_" + (int)(Math.random() * 1000) + "." + extension;
                File destFile = new File(destDir, fileName);

                try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(destFile)) {
                    if (in == null) continue;
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int len;
                    while ((len = in.read(buffer)) > 0) {
                        out.write(buffer, 0, len);
                    }
                    out.flush();
                }

                JSObject mediaObj = new JSObject();
                mediaObj.put("path", destFile.getAbsolutePath());
                mediaObj.put("webPath", Uri.fromFile(destFile).toString());
                mediaObj.put("name", fileName);
                mediaObj.put("mimeType", mimeType != null ? mimeType : "application/octet-stream");
                mediaObj.put("size", destFile.length());
                results.put(mediaObj);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("files", results);
            if (results.length() > 0) {
                JSObject first = results.getJSONObject(0);
                ret.put("path", first.getString("path"));
                ret.put("webPath", first.getString("webPath"));
                ret.put("format", first.getString("mimeType"));
                ret.put("size", first.getLong("size"));
            }
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "processPickedUris failed", e);
            call.reject("فشل الاستيراد: " + e.getMessage(), "IMPORT_FAILED");
        }
    }

    // =========================================================================
    // 2. Video & Media Metadata (Without Loading Video to RAM)
    // =========================================================================

    /**
     * Extracts full media metadata (dimensions, duration, rotation, bitrate, MIME)
     * natively via MediaMetadataRetriever without buffering video samples into RAM.
     */
    @PluginMethod
    public void getMediaMetadata(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("Media URI or path is required", "INVALID_ARGUMENT");
            return;
        }

        mExecutor.execute(() -> {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            ParcelFileDescriptor pfd = null;
            try {
                Context context = getContext();
                long fileSize = 0;

                if (uriStr.startsWith("content://")) {
                    Uri contentUri = Uri.parse(uriStr);
                    pfd = context.getContentResolver().openFileDescriptor(contentUri, "r");
                    if (pfd != null) {
                        retriever.setDataSource(pfd.getFileDescriptor());
                        fileSize = pfd.getStatSize();
                    } else {
                        retriever.setDataSource(context, contentUri);
                    }
                    if (fileSize <= 0) {
                        fileSize = queryContentSize(contentUri);
                    }
                } else {
                    String cleanPath = uriStr.startsWith("file://") ? uriStr.substring(7) : uriStr;
                    File f = new File(cleanPath);
                    if (!f.exists()) {
                        call.reject("Media file does not exist: " + cleanPath, "FILE_NOT_FOUND");
                        return;
                    }
                    retriever.setDataSource(f.getAbsolutePath());
                    fileSize = f.length();
                }

                String widthStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                String heightStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                String durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                String rotStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                String mime = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE);
                String bitrateStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE);
                String hasAudioStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO);

                int width = widthStr != null ? Integer.parseInt(widthStr) : 0;
                int height = heightStr != null ? Integer.parseInt(heightStr) : 0;
                double duration = durStr != null ? Double.parseDouble(durStr) / 1000.0 : 0.0;
                int rotation = rotStr != null ? Integer.parseInt(rotStr) : 0;
                long bitrate = bitrateStr != null ? Long.parseLong(bitrateStr) : 0;
                boolean hasAudio = "yes".equalsIgnoreCase(hasAudioStr);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("width", width);
                ret.put("height", height);
                ret.put("duration", duration);
                ret.put("rotation", rotation);
                ret.put("mimeType", mime != null ? mime : "video/mp4");
                ret.put("fileSize", fileSize);
                ret.put("bitrate", bitrate);
                ret.put("hasAudio", hasAudio);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "getMediaMetadata failed for: " + uriStr, e);
                call.reject("Failed to retrieve media metadata: " + e.getMessage(), "METADATA_FAILED");
            } finally {
                try {
                    retriever.release();
                } catch (Throwable ignored) {}
                if (pfd != null) {
                    try { pfd.close(); } catch (Throwable ignored) {}
                }
            }
        });
    }

    // =========================================================================
    // 3. Prepare Media Input & App Storage Resolution
    // =========================================================================

    /**
     * Resolves content://, file://, or raw paths into a guaranteed local file path in app storage.
     * Streams via buffer to prevent RAM spikes on large media.
     */
    @PluginMethod
    public void prepareMediaInput(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("URI is required", "INVALID_ARGUMENT");
            return;
        }

        mExecutor.execute(() -> {
            try {
                Context context = getContext();
                if (!uriStr.startsWith("content://")) {
                    String cleanPath = uriStr.startsWith("file://") ? uriStr.substring(7) : uriStr;
                    File directFile = new File(cleanPath);
                    if (directFile.exists() && directFile.isFile()) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("path", directFile.getAbsolutePath());
                        ret.put("webPath", Uri.fromFile(directFile).toString());
                        ret.put("name", directFile.getName());
                        ret.put("size", directFile.length());
                        ret.put("mimeType", resolveMimeType(cleanPath));
                        call.resolve(ret);
                        return;
                    }
                }

                // If content:// URI, stream copy into app private storage
                Uri contentUri = Uri.parse(uriStr);
                File destDir = new File(context.getFilesDir(), "vireon_media");
                if (!destDir.exists()) destDir.mkdirs();

                String mime = context.getContentResolver().getType(contentUri);
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
                if (ext == null) ext = "mp4";

                String fileName = "prepared_" + System.currentTimeMillis() + "." + ext;
                File destFile = new File(destDir, fileName);

                try (InputStream in = context.getContentResolver().openInputStream(contentUri);
                     OutputStream out = new FileOutputStream(destFile)) {
                    if (in == null) {
                        call.reject("Cannot open input stream for URI: " + uriStr, "STREAM_FAILED");
                        return;
                    }
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int len;
                    while ((len = in.read(buffer)) > 0) {
                        out.write(buffer, 0, len);
                    }
                    out.flush();
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", destFile.getAbsolutePath());
                ret.put("webPath", Uri.fromFile(destFile).toString());
                ret.put("name", fileName);
                ret.put("size", destFile.length());
                ret.put("mimeType", mime != null ? mime : "video/mp4");
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "prepareMediaInput error for: " + uriStr, e);
                call.reject("Failed to prepare media input: " + e.getMessage(), "PREPARATION_FAILED");
            }
        });
    }

    @PluginMethod
    public void getLocalMediaPath(PluginCall call) {
        prepareMediaInput(call);
    }

    @PluginMethod
    public void copyMediaToAppStorage(PluginCall call) {
        String uriStr = call.getString("uri");
        String destFileName = call.getString("destFileName");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("URI is required", "INVALID_ARGUMENT");
            return;
        }

        mExecutor.execute(() -> {
            try {
                Context context = getContext();
                File destDir = new File(context.getFilesDir(), "vireon_media");
                if (!destDir.exists()) destDir.mkdirs();

                String outName = destFileName != null && !destFileName.isEmpty() 
                        ? destFileName 
                        : "copy_" + System.currentTimeMillis() + ".mp4";
                File destFile = new File(destDir, outName);

                InputStream in = null;
                if (uriStr.startsWith("content://")) {
                    in = context.getContentResolver().openInputStream(Uri.parse(uriStr));
                } else {
                    String cleanPath = uriStr.startsWith("file://") ? uriStr.substring(7) : uriStr;
                    in = new FileInputStream(new File(cleanPath));
                }

                if (in == null) {
                    call.reject("Failed to open source stream", "SOURCE_NOT_FOUND");
                    return;
                }

                try (InputStream sourceIn = in;
                     OutputStream out = new FileOutputStream(destFile)) {
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int len;
                    while ((len = sourceIn.read(buffer)) > 0) {
                        out.write(buffer, 0, len);
                    }
                    out.flush();
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", destFile.getAbsolutePath());
                ret.put("webPath", Uri.fromFile(destFile).toString());
                ret.put("size", destFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "copyMediaToAppStorage failed", e);
                call.reject("Failed to copy media: " + e.getMessage(), "COPY_FAILED");
            }
        });
    }

    // =========================================================================
    // 4. Native Export & Trimming Pipeline (Zero Binary Across Bridge)
    // =========================================================================

    /**
     * Executes native export/trimming/remuxing on disk directly.
     * Takes input file/URI -> trims/remuxes or copies -> writes to output -> saves to MediaStore.
     * JavaScript NEVER handles or serializes the video payload.
     */
    @PluginMethod
    public void exportMediaNatively(PluginCall call) {
        String inputUri = call.getString("inputUri");
        String outputFileName = call.getString("outputFileName", "vireon_export_" + System.currentTimeMillis() + ".mp4");
        Double startTime = call.getDouble("startTime", 0.0);
        Double endTime = call.getDouble("endTime", null);
        boolean saveToGallery = call.getBoolean("saveToGallery", true);
        String operationId = call.getString("operationId", "op_" + System.currentTimeMillis());

        if (inputUri == null || inputUri.trim().isEmpty()) {
            call.reject("inputUri is required for native export", "INVALID_ARGUMENT");
            return;
        }

        AtomicBoolean cancelled = new AtomicBoolean(false);
        mActiveOperations.put(operationId, cancelled);

        mExecutor.execute(() -> {
            try {
                Context context = getContext();
                File destDir = new File(context.getCacheDir(), "vireon_exports");
                if (!destDir.exists()) destDir.mkdirs();

                File outputFile = new File(destDir, outputFileName);
                if (outputFile.exists()) outputFile.delete();

                // Check if trimming is needed
                boolean doTrim = (startTime != null && startTime > 0) || (endTime != null && endTime > 0);

                if (doTrim) {
                    performNativeRemuxTrim(inputUri, outputFile.getAbsolutePath(), startTime, endTime, cancelled);
                } else {
                    performNativeStreamCopy(inputUri, outputFile, cancelled);
                }

                if (cancelled.get()) {
                    if (outputFile.exists()) outputFile.delete();
                    call.reject("Native export was cancelled", "CANCELLED");
                    return;
                }

                String finalUri = Uri.fromFile(outputFile).toString();
                boolean saved = false;

                if (saveToGallery) {
                    saved = saveFileToMediaStore(outputFile, "video/mp4", "Movies/VireonAI", "Vireon_", ".mp4");
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", outputFile.getAbsolutePath());
                ret.put("uri", finalUri);
                ret.put("size", outputFile.length());
                ret.put("savedToGallery", saved);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "exportMediaNatively failed for: " + inputUri, e);
                call.reject("Native export failed: " + e.getMessage(), "EXPORT_FAILED");
            } finally {
                mActiveOperations.remove(operationId);
            }
        });
    }

    @PluginMethod
    public void cancelMediaOperation(PluginCall call) {
        String operationId = call.getString("operationId");
        if (operationId != null && mActiveOperations.containsKey(operationId)) {
            AtomicBoolean flag = mActiveOperations.get(operationId);
            if (flag != null) flag.set(true);
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void releaseMediaResource(PluginCall call) {
        String path = call.getString("path");
        boolean deleted = false;
        if (path != null && !path.isEmpty()) {
            if (path.startsWith("file://")) path = path.substring(7);
            File f = new File(path);
            if (f.exists() && f.isFile()) {
                // Ensure only internal app files/cache are deleted for safety
                String appDir = getContext().getFilesDir().getParent();
                if (appDir != null && f.getAbsolutePath().startsWith(appDir)) {
                    deleted = f.delete();
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", deleted);
        call.resolve(ret);
    }

    // =========================================================================
    // 5. Existing Gallery Saving (Optimized Streaming)
    // =========================================================================

    @PluginMethod
    public void saveVideoToGallery(PluginCall call) {
        saveMedia(call, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/mp4", "Movies/VireonAI", "Vireon_Render_", ".mp4");
    }

    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        saveMedia(call, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/png", "Pictures/VireonAI", "Vireon_AI_", ".png");
    }

    @PluginMethod
    public void saveAudioToMusic(PluginCall call) {
        saveMedia(call, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio/wav", "Music/VireonAI", "Vireon_Audio_", ".wav");
    }

    private void saveMedia(PluginCall call, Uri collectionUri, String mimeType, String relativePath, String prefix, String extension) {
        String tempPath = call.getString("path");
        if (tempPath == null || tempPath.isEmpty()) {
            call.reject("المسار فارغ!", "INVALID_PATH");
            return;
        }

        mExecutor.execute(() -> {
            String path = tempPath.startsWith("file://") ? tempPath.substring(7) : tempPath;
            File tempFile = new File(path);
            if (!tempFile.exists()) {
                call.reject("الملف غير موجود!", "FILE_NOT_FOUND");
                return;
            }

            try {
                boolean success = saveFileToMediaStore(tempFile, mimeType, relativePath, prefix, extension);
                if (success) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("message", "تم الحفظ بنجاح!");
                    call.resolve(ret);
                } else {
                    call.reject("فشل حفظ الملف في MediaStore.", "MEDIASTORE_FAILED");
                }
            } catch (Exception e) {
                Log.e(TAG, "saveMedia error", e);
                call.reject("خطأ: " + e.getLocalizedMessage(), "SAVE_FAILED");
            }
        });
    }

    private boolean saveFileToMediaStore(File tempFile, String mimeType, String relativePath, String prefix, String extension) {
        try {
            ContentValues values = new ContentValues();
            String fileName = prefix + System.currentTimeMillis();
            values.put(MediaStore.MediaColumns.TITLE, fileName);
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName + extension);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }

            Uri collectionUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            if (mimeType.startsWith("image/")) {
                collectionUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            } else if (mimeType.startsWith("audio/")) {
                collectionUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            }

            Uri uri = getContext().getContentResolver().insert(collectionUri, values);
            if (uri != null) {
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri);
                     FileInputStream in = new FileInputStream(tempFile)) {
                    if (out != null) {
                        byte[] buffer = new byte[BUFFER_SIZE];
                        int len;
                        while ((len = in.read(buffer)) > 0) {
                            out.write(buffer, 0, len);
                        }
                        out.flush();
                    }
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear();
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(uri, values, null, null);
                }
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "saveFileToMediaStore error", e);
        }
        return false;
    }

    // =========================================================================
    // 6. Native Remux & Streaming Helpers (No byte[] Buffering)
    // =========================================================================

    private void performNativeStreamCopy(String inputUri, File outputFile, AtomicBoolean cancelled) throws Exception {
        Context context = getContext();
        InputStream in;
        if (inputUri.startsWith("content://")) {
            in = context.getContentResolver().openInputStream(Uri.parse(inputUri));
        } else {
            String path = inputUri.startsWith("file://") ? inputUri.substring(7) : inputUri;
            in = new FileInputStream(new File(path));
        }

        if (in == null) throw new Exception("Unable to open input stream for: " + inputUri);

        try (InputStream sourceIn = in;
             OutputStream out = new FileOutputStream(outputFile)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int len;
            while ((len = sourceIn.read(buffer)) > 0) {
                if (cancelled.get()) return;
                out.write(buffer, 0, len);
            }
            out.flush();
        }
    }

    private void performNativeRemuxTrim(String inputUri, String outputPath, Double startTime, Double endTime, AtomicBoolean cancelled) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        MediaMuxer muxer = null;
        ParcelFileDescriptor pfd = null;
        try {
            Context context = getContext();
            if (inputUri.startsWith("content://")) {
                pfd = context.getContentResolver().openFileDescriptor(Uri.parse(inputUri), "r");
                if (pfd != null) {
                    extractor.setDataSource(pfd.getFileDescriptor());
                } else {
                    extractor.setDataSource(context, Uri.parse(inputUri), null);
                }
            } else {
                String cleanPath = inputUri.startsWith("file://") ? inputUri.substring(7) : inputUri;
                extractor.setDataSource(cleanPath);
            }

            muxer = new MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int trackCount = extractor.getTrackCount();
            Map<Integer, Integer> trackMap = new HashMap<>();

            for (int i = 0; i < trackCount; i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && (mime.startsWith("video/") || mime.startsWith("audio/"))) {
                    int muxerTrackIndex = muxer.addTrack(format);
                    trackMap.put(i, muxerTrackIndex);
                }
            }

            if (trackMap.isEmpty()) {
                // Fallback to simple stream copy if no compatible tracks
                performNativeStreamCopy(inputUri, new File(outputPath), cancelled);
                return;
            }

            muxer.start();

            long startUs = (startTime != null && startTime > 0) ? (long)(startTime * 1_000_000L) : 0L;
            long endUs = (endTime != null && endTime > 0) ? (long)(endTime * 1_000_000L) : Long.MAX_VALUE;

            ByteBuffer sampleBuffer = ByteBuffer.allocateDirect(1024 * 1024); // 1MB reusable direct native buffer
            MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();

            for (int trackIndex : trackMap.keySet()) {
                if (cancelled.get()) break;
                extractor.selectTrack(trackIndex);
                extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);

                int muxerTrack = trackMap.get(trackIndex);

                while (!cancelled.get()) {
                    sampleBuffer.clear();
                    int sampleSize = extractor.readSampleData(sampleBuffer, 0);
                    if (sampleSize < 0) break;

                    long sampleTime = extractor.getSampleTime();
                    if (sampleTime > endUs) break;

                    if (sampleTime >= startUs) {
                        bufferInfo.offset = 0;
                        bufferInfo.size = sampleSize;
                        bufferInfo.presentationTimeUs = Math.max(0, sampleTime - startUs);
                        bufferInfo.flags = extractor.getSampleFlags();
                        muxer.writeSampleData(muxerTrack, sampleBuffer, bufferInfo);
                    }

                    if (!extractor.advance()) break;
                }

                extractor.unselectTrack(trackIndex);
            }
        } catch (Exception e) {
            Log.w(TAG, "Remux trim failed, falling back to stream copy: " + e.getMessage());
            performNativeStreamCopy(inputUri, new File(outputPath), cancelled);
        } finally {
            try {
                if (muxer != null) {
                    muxer.stop();
                    muxer.release();
                }
            } catch (Throwable ignored) {}
            try {
                extractor.release();
            } catch (Throwable ignored) {}
            if (pfd != null) {
                try { pfd.close(); } catch (Throwable ignored) {}
            }
        }
    }

    private long queryContentSize(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex != -1 && !cursor.isNull(sizeIndex)) {
                    return cursor.getLong(sizeIndex);
                }
            }
        } catch (Exception ignored) {}
        return 0;
    }

    private String resolveMimeType(String path) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(path);
        if (ext != null) {
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            if (mime != null) return mime;
        }
        if (path.endsWith(".mp4")) return "video/mp4";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    @Override
    protected void handleOnDestroy() {
        mExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
