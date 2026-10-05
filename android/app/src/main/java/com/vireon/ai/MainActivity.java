package com.vireon.ai;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;

import java.io.File;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";
    private static final String PREF_NAME = "VireonAppPrefs";
    private static final String KEY_LAST_VERSION_CODE = "last_version_code";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        checkVersionAndClearCacheIfNeeded();

        // Create native WebView directly without Capacitor BridgeActivity
        WebView webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Clear cache and history to prevent stale versions
        webView.clearCache(true);
        webView.clearHistory();
        webView.clearFormData();

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setKeepScreenOn(true);

        Log.i(TAG, "[Native Shell] Initializing WebView with WebViewAssetLoader...");

        // Configure Native Android Shell via WebViewAssetLoader & VieronNativeBridge
        VieronWebViewShell.configureShell(this, webView);
    }

    private void checkVersionAndClearCacheIfNeeded() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
            int lastVersionCode = prefs.getInt(KEY_LAST_VERSION_CODE, -1);
            int currentVersionCode = BuildConfig.VERSION_CODE;

            if (lastVersionCode != currentVersionCode) {
                Log.i(TAG, "[App Update] Version changed from " + lastVersionCode + " to " + currentVersionCode + ". Clearing cache.");
                File cacheDir = getCacheDir();
                if (cacheDir != null && cacheDir.exists()) {
                    deleteRecursively(cacheDir);
                }
                prefs.edit().putInt(KEY_LAST_VERSION_CODE, currentVersionCode).apply();
            }
        } catch (Exception e) {
            Log.e(TAG, "[App Update] Error checking version: " + e.getMessage(), e);
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
        file.delete();
    }
}
