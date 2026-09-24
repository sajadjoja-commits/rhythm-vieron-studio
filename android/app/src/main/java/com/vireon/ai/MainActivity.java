package com.vireon.ai;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;

public class MainActivity extends BridgeActivity {
    private static final String REMOTE_HOST = "rhythm-vieron-studio.lovable.app";
    private static final String OFFLINE_FALLBACK_URL = "https://localhost/";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        
        registerPlugin(AIImageProcessorPlugin.class);
        registerPlugin(VireonAIPlugin.class);
        registerPlugin(VireonMediaPlugin.class);
        registerPlugin(VireonSTTPlugin.class);
        registerPlugin(VireonOTAPlugin.class);
        registerPlugin(com.capacitorjs.plugins.browser.BrowserPlugin.class);
        registerPlugin(com.capacitorjs.plugins.app.AppPlugin.class);
        registerPlugin(com.capacitorjs.plugins.camera.CameraPlugin.class);
        registerPlugin(com.capacitorjs.plugins.filesystem.FilesystemPlugin.class);
        registerPlugin(com.capacitorjs.plugins.haptics.HapticsPlugin.class);
        super.onCreate(savedInstanceState);

        setupOtaStartup();

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Performance & WebGL / Video Playback Optimization
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setJavaScriptEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }
            webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
            webView.setKeepScreenOn(true);

            // If the published app cannot be reached, keep the editor usable
            // from the verified web build packaged in the APK.
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame() && request.getUrl().getHost() != null
                        && request.getUrl().getHost().equals(REMOTE_HOST)) {
                        view.loadUrl(OFFLINE_FALLBACK_URL);
                        return;
                    }
                    super.onReceivedError(view, request, error);
                }
            });
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    private void setupOtaStartup() {
        try {
            File otaDir = new File(getFilesDir(), "ota");
            File stateFile = new File(otaDir, "ota_state.json");
            if (!stateFile.exists()) return;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new FileReader(stateFile))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            JSONObject state = new JSONObject(sb.toString());

            boolean pendingVerification = state.optBoolean("pendingVerification", false);
            int consecutiveCrashes = state.optInt("consecutiveCrashes", 0);
            String current = state.optString("currentVersion", "bundled");
            String lastKnownGood = state.optString("lastKnownGoodVersion", "bundled");

            // Crash Watchdog: If previous launch crashed while pending verification
            if (pendingVerification) {
                consecutiveCrashes++;
                state.put("consecutiveCrashes", consecutiveCrashes);
                Log.w("MainActivity", "[OTA Watchdog] Crash on startup detected for version: " + current + " (Count: " + consecutiveCrashes + ")");

                if (consecutiveCrashes >= 1) {
                    // Trigger automatic rollback to last known good version
                    Log.w("MainActivity", "[OTA Watchdog] Automatic rollback triggered -> " + lastKnownGood);
                    current = lastKnownGood;
                    state.put("currentVersion", lastKnownGood);
                    state.put("status", "rolled_back_on_crash");
                    state.put("pendingVerification", false);
                    state.put("consecutiveCrashes", 0);
                }
                try (FileWriter writer = new FileWriter(stateFile)) {
                    writer.write(state.toString(2));
                }
            }

            // Determine directory to load
            if (!"bundled".equals(current) && !current.isEmpty()) {
                File versionsDir = new File(otaDir, "versions");
                File targetDir = new File(versionsDir, "web-" + current);
                File indexHtml = new File(targetDir, "index.html");

                if (targetDir.exists() && indexHtml.exists()) {
                    Log.i("MainActivity", "[OTA Startup] Loading active OTA Web bundle: " + targetDir.getAbsolutePath());
                    getBridge().setServerBasePath(targetDir.getAbsolutePath());
                } else {
                    Log.w("MainActivity", "[OTA Startup] Target OTA bundle missing index.html, falling back to APK bundled assets");
                    getBridge().setServerAssetPath("public");
                }
            } else {
                Log.i("MainActivity", "[OTA Startup] Loading APK bundled Web assets");
                getBridge().setServerAssetPath("public");
            }
        } catch (Exception e) {
            Log.e("MainActivity", "[OTA Startup] Error resolving startup bundle: " + e.getMessage(), e);
        }
    }
}
