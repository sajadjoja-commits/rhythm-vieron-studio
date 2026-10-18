package com.vireon.ai;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    protected void load() {
        if (BuildConfig.DEBUG) {
            // 1. Clean SharedPreferences to permanently prevent any old serverBasePath from being restored
            try {
                SharedPreferences prefs = getSharedPreferences("CapWebViewSettings", Activity.MODE_PRIVATE);
                if (prefs != null) {
                    prefs.edit().clear().commit();
                    Log.i(TAG, "[PACKAGING] DEBUG -> Pre-Bridge wipe of CapWebViewSettings committed");
                }
            } catch (Exception e) {
                Log.w(TAG, "[PACKAGING] CapWebViewSettings wipe notice: " + e.getMessage());
            }

            // 2. Pre-configure Bridge.Builder with explicit APK bundled asset path BEFORE Bridge is instantiated
            // This guarantees the first URL loaded by Bridge is https://localhost/ from assets/public/
            bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, "public"));
            Log.i(TAG, "[PACKAGING] DEBUG -> Injected ServerPath(ASSET_PATH, 'public') into bridgeBuilder before load");
        } else {
            // Production: resolve any verified OTA path
            ServerPath otaPath = resolveOtaServerPath();
            if (otaPath != null) {
                bridgeBuilder.setServerPath(otaPath);
            }
        }

        // 3. Delegate to BridgeActivity to create Bridge and initialize WebView with our predetermined ServerPath
        super.load();

        if (BuildConfig.DEBUG) {
            // Post-load proof of bundled runtime
            Log.i("VIREON_RUNTIME", "[VIREON RUNTIME]\nsource=APK_BUNDLED\nserverAssetPath=public\nota=DISABLED\nremoteUrl=NONE\nserverBasePath=" + (getBridge() != null ? getBridge().getServerBasePath() : "NONE"));
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);

        registerPlugin(AIImageProcessorPlugin.class);
        registerPlugin(VireonAIPlugin.class);
        registerPlugin(VireonMediaPlugin.class);
        registerPlugin(VireonSTTPlugin.class);
        registerPlugin(VireonOTAPlugin.class);
        registerPlugin(VireonBackgroundJobPlugin.class);
        registerPlugin(com.capacitorjs.plugins.browser.BrowserPlugin.class);
        registerPlugin(com.capacitorjs.plugins.app.AppPlugin.class);
        registerPlugin(com.capacitorjs.plugins.camera.CameraPlugin.class);
        registerPlugin(com.capacitorjs.plugins.filesystem.FilesystemPlugin.class);
        registerPlugin(com.capacitorjs.plugins.haptics.HapticsPlugin.class);

        // Calls this.load() internally which executes our load() override above
        super.onCreate(savedInstanceState);

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
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    private ServerPath resolveOtaServerPath() {
        try {
            File otaDir = new File(getFilesDir(), "ota");
            File stateFile = new File(otaDir, "ota_state.json");
            if (!stateFile.exists()) return null;

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

            if (pendingVerification) {
                consecutiveCrashes++;
                state.put("consecutiveCrashes", consecutiveCrashes);
                if (consecutiveCrashes >= 1) {
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

            if (!"bundled".equals(current) && !current.isEmpty()) {
                File versionsDir = new File(otaDir, "versions");
                File targetDir = new File(versionsDir, "web-" + current);
                File indexHtml = new File(targetDir, "index.html");

                if (targetDir.exists() && indexHtml.exists()) {
                    Log.i(TAG, "[OTA Startup] Loading verified OTA Web bundle: " + targetDir.getAbsolutePath());
                    return new ServerPath(ServerPath.PathType.BASE_PATH, targetDir.getAbsolutePath());
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "[OTA Startup] Error resolving startup bundle: " + e.getMessage(), e);
        }
        return null;
    }
}
