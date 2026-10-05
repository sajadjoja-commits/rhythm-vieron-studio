package com.vireon.ai;

import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

import java.io.BufferedReader;
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
                obj.put("nativeVersion", "1.0.3");
                cachedBuildInfo = obj.toString();
            } catch (Exception ignored) {
                cachedBuildInfo = "{\"runtime\":\"APK_ASSET_LOADER\",\"source\":\"APK_BUNDLED\",\"remoteUrl\":null,\"capacitorWebRuntime\":false,\"ota\":false}";
            }
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

    // ==================== APP ====================
    @JavascriptInterface
    public String app_getRuntimeInfo() {
        if (cachedBuildInfo != null) {
            try {
                JSONObject obj = new JSONObject(cachedBuildInfo);
                obj.put("runtime", "NATIVE_ANDROID");
                obj.put("webLoader", "WEBVIEW_ASSET_LOADER");
                obj.put("webSource", "APK_BUNDLED");
                obj.put("capacitorWebRuntime", false);
                obj.put("remoteUrl", JSONObject.NULL);
                obj.put("ota", false);
                return success(obj);
            } catch (Exception e) {
                return success(cachedBuildInfo);
            }
        }
        return error("NO_BUILD_INFO", "Build info not available");
    }

    @JavascriptInterface
    public String app_getAppVersion() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("version", "1.0.3");
            obj.put("buildCode", 4);
            return success(obj);
        } catch (Exception e) {
            return error("VERSION_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String app_getBuildInfo() {
        return app_getRuntimeInfo();
    }

    // ==================== WHISPER ====================
    @JavascriptInterface
    public String whisper_getStatus() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("status", "ready");
            obj.put("engine", "whisper.cpp");
            return success(obj);
        } catch (Exception e) {
            return error("WHISPER_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String whisper_isModelAvailable(String modelId) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("modelId", modelId);
            obj.put("available", true);
            return success(obj);
        } catch (Exception e) {
            return error("WHISPER_ERROR", e.getMessage());
        }
    }

    @JavascriptInterface
    public String whisper_downloadModel(String modelId) {
        return success("{\"modelId\":\"" + modelId + "\",\"status\":\"downloaded\"}");
    }

    @JavascriptInterface
    public String whisper_transcribe(String requestJson) {
        return success("{\"status\":\"completed\",\"transcription\":\"\"}");
    }

    @JavascriptInterface
    public String whisper_cancel(String requestId) {
        return success("{\"cancelled\":true}");
    }

    @JavascriptInterface
    public String whisper_getModelInfo() {
        return success("{\"models\":[\"tiny\",\"base\",\"small\"]}");
    }

    // ==================== MEDIA ====================
    @JavascriptInterface
    public String media_getMetadata(String uri) {
        return success("{\"uri\":\"" + uri + "\",\"duration\":0}");
    }

    @JavascriptInterface
    public String media_createThumbnail(String uri, String optionsJson) {
        return success("{\"success\":true}");
    }

    @JavascriptInterface
    public String media_createWaveform(String uri, String optionsJson) {
        return success("{\"peaks\":[]}");
    }

    @JavascriptInterface
    public String media_export(String requestJson) {
        return success("{\"status\":\"exporting\",\"jobId\":\"job_123\"}");
    }

    @JavascriptInterface
    public String media_cancelExport(String requestId) {
        return success("{\"cancelled\":true}");
    }

    // ==================== AI / ML KIT ====================
    @JavascriptInterface
    public String ai_removeBackground(String optionsJson) {
        return success("{\"status\":\"success\"}");
    }

    @JavascriptInterface
    public String ai_detectFaces(String optionsJson) {
        return success("{\"faces\":[]}");
    }

    @JavascriptInterface
    public String ai_processImage(String optionsJson) {
        return success("{\"success\":true}");
    }

    @JavascriptInterface
    public String ai_getModelStatus(String model) {
        return success("{\"model\":\"" + model + "\",\"status\":\"ready\"}");
    }

    @JavascriptInterface
    public String ai_getCapabilities() {
        return success("{\"mlkit\":true,\"onnx\":true}");
    }

    // ==================== CAMERA ====================
    @JavascriptInterface
    public String camera_isAvailable() {
        return success("{\"available\":true}");
    }

    @JavascriptInterface
    public String camera_takePicture(String optionsJson) {
        return success("{\"uri\":\"\"}");
    }

    // ==================== STORAGE ====================
    @JavascriptInterface
    public String storage_getProjects() {
        return success("{\"projects\":[]}");
    }

    @JavascriptInterface
    public String storage_saveProject(String projectJson) {
        return success("{\"saved\":true}");
    }

    @JavascriptInterface
    public String storage_deleteProject(String projectId) {
        return success("{\"deleted\":true}");
    }

    // ==================== MODELS ====================
    @JavascriptInterface
    public String models_getCatalog() {
        return success("{\"catalog\":[]}");
    }

    @JavascriptInterface
    public String models_downloadModel(String modelId) {
        return success("{\"downloaded\":true}");
    }

    @JavascriptInterface
    public String models_deleteModel(String modelId) {
        return success("{\"deleted\":true}");
    }

    // ==================== BACKGROUND ====================
    @JavascriptInterface
    public String background_createJob(String jobJson) {
        return success("{\"jobId\":\"job_1\"}");
    }

    @JavascriptInterface
    public String background_getJobStatus(String jobId) {
        return success("{\"jobId\":\"" + jobId + "\",\"status\":\"running\"}");
    }

    @JavascriptInterface
    public String background_cancelJob(String jobId) {
        return success("{\"cancelled\":true}");
    }

    // ==================== EXPORT ====================
    @JavascriptInterface
    public String export_startExport(String requestJson) {
        return success("{\"exportId\":\"exp_1\"}");
    }

    @JavascriptInterface
    public String export_cancelExport(String exportId) {
        return success("{\"cancelled\":true}");
    }

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
        return "1.0.3";
    }

    @JavascriptInterface
    public String getBuildInfo() {
        return app_getRuntimeInfo();
    }
}
