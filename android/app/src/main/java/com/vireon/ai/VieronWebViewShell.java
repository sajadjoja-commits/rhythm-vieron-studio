package com.vireon.ai;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class VieronWebViewShell {

    public static void configureShell(Context context, WebView webView) {
        // Instantiate WebViewAssetLoader serving assets from assets/www/ under https://appassets.androidplatform.net/assets/www/
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/www/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
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
