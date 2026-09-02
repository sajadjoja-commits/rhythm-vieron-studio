package com.vireon.ai;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AIImageProcessorPlugin.class);
        registerPlugin(VireonMediaPlugin.class);
        registerPlugin(com.capacitorjs.plugins.browser.BrowserPlugin.class);
        registerPlugin(com.capacitorjs.plugins.app.AppPlugin.class);
        registerPlugin(com.capacitorjs.plugins.camera.CameraPlugin.class);
        registerPlugin(com.capacitorjs.plugins.filesystem.FilesystemPlugin.class);
        registerPlugin(com.capacitorjs.plugins.haptics.HapticsPlugin.class);
        registerPlugin(ee.forgr.capacitor_updater.CapacitorUpdaterPlugin.class);

        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Performance & WebGL / Video Playback Optimization
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
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
}
