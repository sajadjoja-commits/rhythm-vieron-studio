package com.vireon.ai;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.InputStream;
import java.net.URLConnection;

public class VieronWebViewShell {

    private static final String TAG = "VieronWebViewShell";

    public static void configureShell(Context context, WebView webView) {
        // Custom PathHandler for https://appassets.androidplatform.net/
        // Maps root and SPA routes to assets/www/index.html and static assets to assets/www/...
        WebViewAssetLoader.PathHandler wwwPathHandler = new WebViewAssetLoader.PathHandler() {
            @Override
            public WebResourceResponse handle(String path) {
                try {
                    String assetPath = path;
                    if (assetPath.startsWith("/")) {
                        assetPath = assetPath.substring(1);
                    }
                    if (assetPath.isEmpty() || assetPath.equals("index.html")) {
                        assetPath = "index.html";
                    }

                    String targetAsset = "www/" + assetPath;
                    InputStream is = null;
                    try {
                        is = context.getAssets().open(targetAsset);
                    } catch (Exception e) {
                        // SPA fallback: if static resource not found (e.g. /editor, /projects), serve index.html
                        if (!assetPath.contains(".") || assetPath.endsWith(".html") || !isStaticAsset(assetPath)) {
                            try {
                                targetAsset = "www/index.html";
                                is = context.getAssets().open(targetAsset);
                            } catch (Exception ignored) {}
                        }
                    }

                    if (is != null) {
                        String mimeType = getMimeType(targetAsset);
                        return new WebResourceResponse(mimeType, "UTF-8", is);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "[VIERON-ASSET] Error handling path: " + path, e);
                }
                return null;
            }
        };

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", wwwPathHandler)
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

        // Load exact root URL without leading slashes
        Log.i(TAG, "[VIREON WEB START] url=https://appassets.androidplatform.net/");
        webView.loadUrl("https://appassets.androidplatform.net/");
    }

    private static boolean isStaticAsset(String path) {
        String lower = path.toLowerCase();
        return lower.endsWith(".js") || lower.endsWith(".css") || lower.endsWith(".png") ||
               lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".svg") ||
               lower.endsWith(".wasm") || lower.endsWith(".ico") || lower.endsWith(".json") ||
               lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".mp4") ||
               lower.endsWith(".woff") || lower.endsWith(".woff2") || lower.endsWith(".ttf");
    }

    private static String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".wasm")) return "application/wasm";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        return URLConnection.guessContentTypeFromName(path);
    }
}
