package com.vireon.ai;

import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";
    private static final String PREF_NAME = "VireonAppPrefs";
    private static final String KEY_LAST_VERSION_CODE = "last_version_code";
    private static final int REQUEST_CODE_PICK_MEDIA = 2002;

    private static MainActivity instance;
    public static MainActivity getInstance() { return instance; }

    private WebView mainWebView;
    private String pendingPickerCallbackId = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        instance = this;

        checkVersionAndClearCacheIfNeeded();

        // Create native WebView directly without Capacitor BridgeActivity
        WebView webView = new WebView(this);
        this.mainWebView = webView;
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

        // WebChromeClient for HTML <input type="file"> fallback
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                Log.i("VIERON_PICKER", "onShowFileChooser triggered");
                startMediaPicker("any", true, "fileChooser_" + System.currentTimeMillis());
                return true;
            }
        });

        Log.i(TAG, "[Native Shell] Initializing WebView with WebViewAssetLoader...");

        // Configure Native Android Shell via WebViewAssetLoader & VieronNativeBridge
        VieronWebViewShell.configureShell(this, webView);
    }

    public void startMediaPicker(String type, boolean multiple, String callbackId) {
        this.pendingPickerCallbackId = callbackId;
        Log.i("VIERON_PICKER", "open type=" + type + " multiple=" + multiple + " callbackId=" + callbackId);

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

        if ("image".equals(type)) {
            intent.setType("image/*");
        } else if ("video".equals(type)) {
            intent.setType("video/*");
        } else if ("audio".equals(type)) {
            intent.setType("audio/*");
        } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*", "audio/*"});
        }

        try {
            startActivityForResult(Intent.createChooser(intent, "Select Media"), REQUEST_CODE_PICK_MEDIA);
        } catch (Exception e) {
            Log.e("VIERON_PICKER", "error starting intent: " + e.getMessage());
            resolvePickerResult(callbackId, "{ \"success\": false, \"error\": \"" + e.getMessage() + "\" }");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_PICK_MEDIA) {
            String cbId = pendingPickerCallbackId;
            pendingPickerCallbackId = null;

            if (resultCode == RESULT_CANCELED) {
                Log.i("VIERON_PICKER", "cancelled");
                resolvePickerResult(cbId, "{ \"success\": false, \"cancelled\": true }");
                return;
            }

            if (resultCode == RESULT_OK && data != null) {
                try {
                    JSONArray filesArray = new JSONArray();
                    android.content.ContentResolver resolver = getContentResolver();

                    if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        for (int i = 0; i < count; i++) {
                            Uri uri = data.getClipData().getItemAt(i).getUri();
                            JSONObject fileObj = queryUriInfo(resolver, uri);
                            filesArray.put(fileObj);
                        }
                    } else if (data.getData() != null) {
                        Uri uri = data.getData();
                        JSONObject fileObj = queryUriInfo(resolver, uri);
                        filesArray.put(fileObj);
                    }

                    JSONObject resultObj = new JSONObject();
                    resultObj.put("success", true);
                    resultObj.put("files", filesArray);

                    Log.i("VIERON_PICKER", "result count=" + filesArray.length());
                    resolvePickerResult(cbId, resultObj.toString());
                } catch (Exception e) {
                    Log.e("VIERON_PICKER", "error processing result: " + e.getMessage());
                    resolvePickerResult(cbId, "{ \"success\": false, \"error\": \"" + e.getMessage() + "\" }");
                }
            } else {
                Log.i("VIERON_PICKER", "cancelled or empty result");
                resolvePickerResult(cbId, "{ \"success\": false, \"cancelled\": true }");
            }
        }
    }

    private JSONObject queryUriInfo(android.content.ContentResolver resolver, Uri uri) {
        JSONObject obj = new JSONObject();
        try {
            try {
                resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {}

            String name = "file";
            long size = 0;
            String mimeType = resolver.getType(uri);

            Cursor cursor = resolver.query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (nameIndex != -1) name = cursor.getString(nameIndex);
                        if (sizeIndex != -1) size = cursor.getLong(sizeIndex);
                    }
                } finally {
                    cursor.close();
                }
            }

            if (mimeType == null) {
                mimeType = "application/octet-stream";
            }

            Log.i("VIERON_PICKER", "uri=" + uri.toString() + " mime=" + mimeType);

            obj.put("uri", uri.toString());
            obj.put("name", name);
            obj.put("mimeType", mimeType);
            obj.put("size", size);
        } catch (Exception e) {
            Log.w("VIERON_PICKER", "Error querying uri info: " + e.getMessage());
        }
        return obj;
    }

    private void resolvePickerResult(String callbackId, String jsonResult) {
        if (mainWebView != null && callbackId != null) {
            mainWebView.post(() -> {
                mainWebView.evaluateJavascript("window.VieronNative._resolvePicker('" + callbackId + "', " + jsonResult + ");", null);
            });
        }
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
