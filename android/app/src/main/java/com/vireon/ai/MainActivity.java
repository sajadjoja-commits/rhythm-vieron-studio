package com.vireon.ai;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;

import com.capacitorjs.plugins.app.AppPlugin;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.capacitorjs.plugins.haptics.HapticsPlugin;
import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final String PREF_NAME = "VireonAppPrefs";
    private static final String KEY_LAST_VERSION_CODE = "last_version_code";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        
        registerPlugin(AIImageProcessorPlugin.class);
        registerPlugin(VireonMediaPlugin.class);
        registerPlugin(BrowserPlugin.class);
        registerPlugin(AppPlugin.class);
        registerPlugin(com.capacitorjs.plugins.camera.CameraPlugin.class);
        registerPlugin(com.capacitorjs.plugins.filesystem.FilesystemPlugin.class);
        registerPlugin(HapticsPlugin.class);
        super.onCreate(savedInstanceState);

        checkVersionAndClearCacheIfNeeded();
        setupOtaStartup();

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Performance & WebGL / Video Playback Optimization
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setJavaScriptEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE); // Force immediate loading of new web code without stale cache
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            
            // Clear cache and storage completely to prevent stale versions
            webView.clearCache(true);
            webView.clearHistory();
            webView.clearFormData();
            
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            webView.setKeepScreenOn(true);
            Log.i("MainActivity", "[WebView] Initialized successfully with NO_CACHE and hardware acceleration");

            // Configure Native Android Shell via WebViewAssetLoader
            VieronWebViewShell.configureShell(this, webView);
        }
    }

    private void checkVersionAndClearCacheIfNeeded() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
            int lastVersionCode = prefs.getInt(KEY_LAST_VERSION_CODE, -1);
            int currentVersionCode = BuildConfig.VERSION_CODE;

            if (lastVersionCode != currentVersionCode) {
                Log.i("MainActivity", "[App Update] Version changed from " + lastVersionCode + " to " + currentVersionCode + ". Clearing WebView cache & local storage.");
                
                // Clear WebView cache & storage data
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().clearCache(true);
                }
                deleteApplicationData();

                // Save current version code
                prefs.edit().putInt(KEY_LAST_VERSION_CODE, currentVersionCode).apply();
            }
        } catch (Exception e) {
            Log.e("MainActivity", "[App Update] Error checking version / clearing cache: " + e.getMessage(), e);
        }
    }

    private void deleteApplicationData() {
        try {
            File cacheDir = getCacheDir();
            if (cacheDir != null && cacheDir.exists()) {
                deleteRecursively(cacheDir);
            }
            File otaDir = new File(getFilesDir(), "ota");
            if (otaDir.exists()) {
                deleteRecursively(otaDir);
            }
            Log.i("MainActivity", "[App Update] Cleared cache and OTA directories on version update.");
        } catch (Exception e) {
            Log.w("MainActivity", "[App Update] Failed to clear app data: " + e.getMessage());
        }
    }

    private void setupOtaStartup() {
        // IMPORTANT:
        // Debug builds must ALWAYS use the Web assets bundled inside the APK.
        // OTA must never override the local developer build.
        if (BuildConfig.DEBUG) {
            resetDebugOtaState();
            Log.i("MainActivity", "[OTA Startup] DEBUG build -> forcing bundled APK Web assets");
            getBridge().setServerAssetPath("public");
            return;
        }

        try {
            File otaDir = new File(getFilesDir(), "ota");
            File stateFile = new File(otaDir, "ota_state.json");

            if (!stateFile.exists()) {
                Log.i("MainActivity", "[OTA Startup] No OTA state -> loading bundled APK assets");
                getBridge().setServerAssetPath("public");
                return;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new FileReader(stateFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }

            JSONObject state = new JSONObject(sb.toString());
            boolean pendingVerification = state.optBoolean("pendingVerification", false);
            int consecutiveCrashes = state.optInt("consecutiveCrashes", 0);
            String current = state.optString("currentVersion", "bundled");

            if (!"bundled".equals(current) && !current.isEmpty() && consecutiveCrashes < 3 && !pendingVerification) {
                File versionsDir = new File(otaDir, "versions");
                File targetDir = new File(versionsDir, "web-" + current);
                File indexHtml = new File(targetDir, "index.html");
                File metaFile = new File(targetDir, "ota_meta.json");

                if (targetDir.exists() && indexHtml.exists() && metaFile.exists()) {
                    Log.i("MainActivity", "[OTA Startup] Loading verified OTA version: " + current);
                    getBridge().setServerBasePath(targetDir.getAbsolutePath());
                } else {
                    Log.w("MainActivity", "[OTA Startup] OTA target directory or index/meta missing -> falling back to bundled assets");
                    getBridge().setServerAssetPath("public");
                }
            } else {
                Log.i("MainActivity", "[OTA Startup] Using bundled APK assets (OTA inactive or crashed)");
                getBridge().setServerAssetPath("public");
            }
        } catch (Exception e) {
            Log.e("MainActivity", "[OTA Startup] Error checking OTA state: " + e.getMessage(), e);
            getBridge().setServerAssetPath("public");
        }
    }

    private void resetDebugOtaState() {
        if (!BuildConfig.DEBUG) {
            return;
        }
        try {
            File otaDir = new File(getFilesDir(), "ota");
            if (otaDir.exists()) {
                deleteRecursively(otaDir);
            }
            Log.i("MainActivity", "[OTA Startup] DEBUG -> removed old OTA state and versions");
        } catch (Exception e) {
            Log.w("MainActivity", "[OTA Startup] DEBUG OTA cleanup failed: " + e.getMessage());
        }
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        if (!file.delete()) {
            Log.w("MainActivity", "[OTA Cleanup] Could not delete: " + file.getAbsolutePath());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null) {
            setIntent(intent);
        }
    }
}
