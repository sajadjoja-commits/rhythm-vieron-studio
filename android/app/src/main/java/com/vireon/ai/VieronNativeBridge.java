package com.vireon.ai;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.util.Log;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;

public class VieronNativeBridge {
    private static final String TAG = "VieronNativeBridge";
    private final Context context;
    private String cachedBuildInfo = null;

    public VieronNativeBridge(Context context) {
        this.context = context;
        loadBuildInfo();
    }

    private void loadBuildInfo() {
        try {
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(context.getAssets().open("www/build_info.json"))
            );
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            cachedBuildInfo = sb.toString();
        } catch (Exception e) {
            Log.w(TAG, "Could not load build_info.json from assets/www: " + e.getMessage());
            try {
                JSONObject obj = new JSONObject();
                obj.put("runtime", "APK_ASSET_LOADER");
                obj.put("source", "APK_BUNDLED");
                obj.put("remoteUrl", JSONObject.NULL);
                obj.put("capacitorWebRuntime", false);
                obj.put("ota", false);
                obj.put("nativeVersion", getAppVersionString());
                cachedBuildInfo = obj.toString();
            } catch (Exception ignored) {
                cachedBuildInfo = "{\"runtime\":\"APK_ASSET_LOADER\",\"source\":\"APK_BUNDLED\",\"remoteUrl\":null,\"capacitorWebRuntime\":false,\"ota\":false}";
            }
        }
    }

    private String getAppVersionString() {
        try {
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return pInfo.versionName != null ? pInfo.versionName : "1.0.3";
        } catch (Exception e) {
            return "1.0.3";
        }
    }

    private int getAppVersionCode() {
        try {
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                return (int) pInfo.getLongVersionCode();
            } else {
                return pInfo.versionCode;
            }
        } catch (Exception e) {
            return 4;
        }
    }

    private String success(JSONObject data) {
        try {
            JSONObject res = new JSONObject();
            res.put("ok", true);
            res.put("data", data);
            return res.toString();
        } catch (Exception e) {
            return "{\"ok\":true,\"data\":{}}";
        }
    }

    private String success(String jsonString) {
        return "{\"ok\":true,\"data\":" + (jsonString != null ? jsonString : "{}") + "}";
    }

    private String notMigrated() {
        try {
            JSONObject err = new JSONObject();
            err.put("code", "NOT_MIGRATED");
            err.put("message", "Real native implementation not yet connected");
            JSONObject res = new JSONObject();
            res.put("ok", false);
            res.put("error", err);
            return res.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":{\"code\":\"NOT_MIGRATED\",\"message\":\"Real native implementation not yet connected\"}}";
        }
    }

    private String error(String code, String message) {
        try {
            JSONObject err = new JSONObject();
            err.put("code", code != null ? code : "UNKNOWN_ERROR");
            err.put("message", message != null ? message : "An unknown error occurred");
            JSONObject res = new JSONObject();
            res.put("ok", false);
            res.put("error", err);
            return res.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":{\"code\":\"UNKNOWN_ERROR\",\"message\":\"" + message + "\"}}";
        }
    }

    // ==================== APP (REAL) ====================
    @JavascriptInterface
    public String app_getRuntimeInfo() {
        try {
            JSONObject obj;
            if (cachedBuildInfo != null) {
                obj = new JSONObject(cachedBuildInfo);
            } else {
                obj = new JSONObject();
            }
            obj.put("runtime", "NATIVE_ANDROID");
            obj.put("webLoader", "WEBVIEW_ASSET_LOADER");
            obj.put("webSource", "APK_BUNDLED");
            obj.put("capacitorWebRuntime", false);
            obj.put("remoteUrl", JSONObject.NULL);
            obj.put("ota", false);
            obj.put("packageName", context.getPackageName());
            obj.put("versionName", getAppVersionString());
            obj.put("versionCode", getAppVersionCode());
            return success(obj);
        } catch (Exception e) {
            return error("RUNTIME_INFO_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String app_getAppVersion() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("version", getAppVersionString());
            obj.put("buildCode", getAppVersionCode());
            obj.put("packageName", context.getPackageName());
            return success(obj);
        } catch (Exception e) {
            return error("VERSION_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String app_getBuildInfo() {
        return app_getRuntimeInfo();
    }

    // ==================== WHISPER (NOT_MIGRATED - NO STUBS) ====================
    @JavascriptInterface
    public String whisper_getStatus() { return notMigrated(); }

    @JavascriptInterface
    public String whisper_isModelAvailable(String modelId) { return notMigrated(); }

    @JavascriptInterface
    public String whisper_downloadModel(String modelId) { return notMigrated(); }

    @JavascriptInterface
    public String whisper_transcribe(String requestJson) { return notMigrated(); }

    @JavascriptInterface
    public String whisper_cancel(String requestId) { return notMigrated(); }

    @JavascriptInterface
    public String whisper_getModelInfo() { return notMigrated(); }

    // ==================== MEDIA (REAL METADATA RETRIEVER / OTHERS NOT_MIGRATED) ====================
    @JavascriptInterface
    public String media_getMetadata(String uriString) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            if (uriString.startsWith("content://")) {
                retriever.setDataSource(context, Uri.parse(uriString));
            } else {
                retriever.setDataSource(uriString);
            }
            String durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            String widthStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
            String heightStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
            String rotationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);

            long duration = durationStr != null ? Long.parseLong(durationStr) : 0L;
            int width = widthStr != null ? Integer.parseInt(widthStr) : 0;
            int height = heightStr != null ? Integer.parseInt(heightStr) : 0;
            int rotation = rotationStr != null ? Integer.parseInt(rotationStr) : 0;

            JSONObject obj = new JSONObject();
            obj.put("uri", uriString);
            obj.put("duration", duration);
            obj.put("width", width);
            obj.put("height", height);
            obj.put("rotation", rotation);
            return success(obj);
        } catch (Exception e) {
            return error("MEDIA_METADATA_ERROR", e.getMessage());
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
    }

    @JavascriptInterface
    public String media_createThumbnail(String uri, String optionsJson) { return notMigrated(); }

    @JavascriptInterface
    public String media_createWaveform(String uri, String optionsJson) { return notMigrated(); }

    @JavascriptInterface
    public String media_export(String requestJson) { return notMigrated(); }

    @JavascriptInterface
    public String media_cancelExport(String requestId) { return notMigrated(); }

    // ==================== AI / ML KIT (NOT_MIGRATED) ====================
    @JavascriptInterface
    public String ai_removeBackground(String optionsJson) { return notMigrated(); }

    @JavascriptInterface
    public String ai_detectFaces(String optionsJson) { return notMigrated(); }

    @JavascriptInterface
    public String ai_processImage(String optionsJson) { return notMigrated(); }

    @JavascriptInterface
    public String ai_getModelStatus(String model) { return notMigrated(); }

    @JavascriptInterface
    public String ai_getCapabilities() { return notMigrated(); }

    // ==================== CAMERA (REAL AVAILABILITY / OTHERS NOT_MIGRATED) ====================
    @JavascriptInterface
    public String camera_isAvailable() {
        boolean hasCamera = context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
        try {
            JSONObject obj = new JSONObject();
            obj.put("available", hasCamera);
            return success(obj);
        } catch (Exception e) {
            return error("CAMERA_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String camera_takePicture(String optionsJson) { return notMigrated(); }

    // ==================== STORAGE (REAL FILE STORAGE) ====================
    @JavascriptInterface
    public String storage_getProjects() {
        try {
            File projectsDir = new File(context.getFilesDir(), "vieron_projects");
            JSONArray arr = new JSONArray();
            if (projectsDir.exists() && projectsDir.isDirectory()) {
                File[] files = projectsDir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        arr.put(f.getName());
                    }
                }
            }
            JSONObject obj = new JSONObject();
            obj.put("projects", arr);
            obj.put("count", arr.length());
            return success(obj);
        } catch (Exception e) {
            return error("STORAGE_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String storage_saveProject(String projectJson) {
        try {
            File projectsDir = new File(context.getFilesDir(), "vieron_projects");
            if (!projectsDir.exists()) projectsDir.mkdirs();
            JSONObject req = new JSONObject(projectJson);
            String projectId = req.optString("id", "proj_" + System.currentTimeMillis());
            File projFile = new File(projectsDir, projectId + ".json");
            FileOutputStream fos = new FileOutputStream(projFile);
            fos.write(projectJson.getBytes());
            fos.close();
            return success("{\"saved\":true,\"projectId\":\"" + projectId + "\"}");
        } catch (Exception e) {
            return error("STORAGE_SAVE_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String storage_deleteProject(String projectId) {
        try {
            File projectsDir = new File(context.getFilesDir(), "vieron_projects");
            File projFile = new File(projectsDir, projectId + ".json");
            boolean deleted = projFile.exists() && projFile.delete();
            JSONObject obj = new JSONObject();
            obj.put("deleted", deleted);
            obj.put("projectId", projectId);
            return success(obj);
        } catch (Exception e) {
            return error("STORAGE_DELETE_ERROR", e.getMessage());
        }
    }

    // ==================== MODELS (NOT_MIGRATED) ====================
    @JavascriptInterface
    public String models_getCatalog() { return notMigrated(); }

    @JavascriptInterface
    public String models_downloadModel(String modelId) { return notMigrated(); }

    @JavascriptInterface
    public String models_deleteModel(String modelId) { return notMigrated(); }

    // ==================== BACKGROUND (NOT_MIGRATED) ====================
    @JavascriptInterface
    public String background_createJob(String jobJson) { return notMigrated(); }

    @JavascriptInterface
    public String background_getJobStatus(String jobId) { return notMigrated(); }

    @JavascriptInterface
    public String background_cancelJob(String jobId) { return notMigrated(); }

    // ==================== EXPORT (NOT_MIGRATED) ====================
    @JavascriptInterface
    public String export_startExport(String requestJson) { return notMigrated(); }

    @JavascriptInterface
    public String export_cancelExport(String exportId) { return notMigrated(); }

    // Legacy support methods
    @JavascriptInterface
    public String getRuntimeInfo() {
        return app_getRuntimeInfo();
    }

    @JavascriptInterface
    public boolean isNativeFeatureSupported(String feature) {
        return true;
    }

    @JavascriptInterface
    public String getAppVersion() {
        return getAppVersionString();
    }

    @JavascriptInterface
    public String getBuildInfo() {
        return app_getRuntimeInfo();
    }
}
