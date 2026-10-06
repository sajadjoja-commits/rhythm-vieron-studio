package com.vireon.ai;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;

public class VieronWebViewShell {

    private static final String TAG = "VieronWebViewShell";

    public static void configureShell(Context context, WebView webView) {
        // Verify asset existence for diagnostics
        File indexHtml = new File(context.getFilesDir().getParentFile(), "app_assets/www/index.html"); // or check assets
        try {
            boolean assetExists = context.getAssets().list("www").length > 0;
            Log.i(TAG, "[VIERON-ASSET] assets/www exists=" + assetExists);
        } catch (Exception e) {
            Log.w(TAG, "[VIERON-ASSET] Failed to check assets/www: " + e.getMessage());
        }

        // Configure WebViewAssetLoader with /assets/ path handler mapping to Android assets root
        // This maps https://appassets.androidplatform.net/assets/www/index.html -> assets/www/index.html
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                Log.i("VIERON-ASSET", "URL=" + url);
                WebResourceResponse response = assetLoader.shouldInterceptRequest(request.getUrl());
                Log.i("VIERON-ASSET", "resolved=" + (response != null));
                return response;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                Log.i("VIERON-ASSET", "URL=" + url);
                WebResourceResponse response = assetLoader.shouldInterceptRequest(Uri.parse(url));
                Log.i("VIERON-ASSET", "resolved=" + (response != null));
                return response;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://appassets.androidplatform.net/")) {
                    return false;
                }
                return true;
            }
        });

        // Add JavaScript bridge interface
        webView.addJavascriptInterface(new VieronNativeBridge(context), "VieronNativeBridgeImpl");

        // Load canonical Native WebView Shell URL
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }
}
