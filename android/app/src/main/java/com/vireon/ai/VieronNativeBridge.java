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
                obj.put("packaging", "NATIVE_ANDROID_SHELL");
                obj.put("nativeVersion", "1.0.3");
                obj.put("webVersion", "web-fallback");
                cachedBuildInfo = obj.toString();
            } catch (Exception ignored) {
                cachedBuildInfo = "{\"runtime\":\"APK_ASSET_LOADER\"}";
            }
        }
    }

    @JavascriptInterface
    public String getRuntimeInfo() {
        if (cachedBuildInfo != null) {
            return cachedBuildInfo;
        }
        return "{\"runtime\":\"APK_ASSET_LOADER\"}";
    }
}
