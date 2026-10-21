package com.vireon.ai

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import java.io.OutputStream

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var loading: ProgressBar
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var exportUri: Uri? = null
    private var exportStream: OutputStream? = null
    private var exportMime = "application/octet-stream"
    private var exportName = "download"
    private var pageReady = false
    private var offlinePanel: TextView? = null

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileChooserCallback
        fileChooserCallback = null
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val uris = when {
                data?.clipData != null -> (0 until data.clipData!!.itemCount).map { data.clipData!!.getItemAt(it).uri }.toTypedArray()
                data?.data != null -> arrayOf(data.data!!)
                else -> emptyArray()
            }
            callback?.onReceiveValue(uris)
        } else callback?.onReceiveValue(null)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.BLACK
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN

        root = FrameLayout(this)
        root.setBackgroundColor(Color.rgb(12, 12, 16))
        webView = WebView(this)
        webView.setBackgroundColor(Color.rgb(12, 12, 16))
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.setOnLongClickListener { true }
        webView.isHapticFeedbackEnabled = false
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            allowContentAccess = true
        }
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                loading.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                if (newProgress >= 100) pageReady = true
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.fileChooserCallback?.onReceiveValue(null)
                this@MainActivity.fileChooserCallback = filePathCallback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*", "audio/*"))
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                return try {
                    filePicker.launch(intent)
                    true
                } catch (_: ActivityNotFoundException) {
                    this@MainActivity.fileChooserCallback = null
                    filePathCallback?.onReceiveValue(null)
                    false
                }
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                offlinePanel?.let { root.removeView(it) }
                offlinePanel = null
                loading.visibility = View.VISIBLE
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val host = uri.host?.lowercase().orEmpty()
                val allowed = host == "rhythm-vieron-studio.lovable.app" ||
                    host == "accounts.google.com" ||
                    host == "google.com" || host.endsWith(".google.com") ||
                    host.endsWith(".supabase.co")
                if (uri.scheme == "https" && allowed) return false
                if (uri.scheme == "http" || uri.scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOfflineError()
            }
        }

        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        loading = ProgressBar(this).apply { isIndeterminate = true }
        val loadingParams = FrameLayout.LayoutParams(72, 72, android.view.Gravity.CENTER)
        root.addView(loading, loadingParams)
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else finish()
            }
        })
        if (savedInstanceState == null) webView.loadUrl(APP_URL) else webView.restoreState(savedInstanceState)
    }

    private fun showOfflineError() {
        runOnUiThread {
            val panel = TextView(this).apply {
                text = "ماكو اتصال بالإنترنت\nتحقق من الاتصال وحاول مرة ثانية"
                setTextColor(Color.WHITE)
                textSize = 17f
                gravity = android.view.Gravity.CENTER
                setPadding(32, 32, 32, 32)
                setOnClickListener { webView.reload() }
            }
            offlinePanel?.let { root.removeView(it) }
            offlinePanel = panel
            root.addView(panel, FrameLayout.LayoutParams(-1, -1))
            loading.visibility = View.GONE
        }
    }

    private fun saveResult(ok: Boolean, message: String) {
        val safe = message.replace("\\", "\\\\").replace("'", "\\'")
        runOnUiThread { webView.evaluateJavascript("window.__vireonNativeResult && window.__vireonNativeResult('$safe', $ok)", null) }
    }

    inner class AndroidBridge {
        @JavascriptInterface fun beginSaveFile(fileName: String, mimeType: String): Boolean {
            return try {
                exportName = fileName.substringAfterLast('/').substringAfterLast('\\').ifBlank { "download" }
                exportMime = mimeType.ifBlank { "application/octet-stream" }
                val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    when {
                        exportMime.startsWith("video/") -> MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        exportMime.startsWith("image/") -> MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        exportMime.startsWith("audio/") -> MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        else -> MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    }
                } else {
                    when {
                        exportMime.startsWith("video/") -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                        exportMime.startsWith("image/") -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        exportMime.startsWith("audio/") -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                        else -> MediaStore.Files.getContentUri("external")
                    }
                }
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, exportName)
                    put(MediaStore.MediaColumns.MIME_TYPE, exportMime)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val relative = when {
                            exportMime.startsWith("video/") -> Environment.DIRECTORY_MOVIES + "/Vireon"
                            exportMime.startsWith("image/") -> Environment.DIRECTORY_PICTURES + "/Vireon"
                            exportMime.startsWith("audio/") -> Environment.DIRECTORY_MUSIC + "/Vireon"
                            else -> Environment.DIRECTORY_DOWNLOADS + "/Vireon"
                        }
                        put(MediaStore.MediaColumns.RELATIVE_PATH, relative)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                }
                exportUri = contentResolver.insert(collection, values)
                exportStream = exportUri?.let { contentResolver.openOutputStream(it, "w") }
                exportUri != null && exportStream != null
            } catch (_: Exception) { false }
        }

        @JavascriptInterface fun appendSaveChunk(base64Chunk: String): Boolean {
            return try {
                val bytes = Base64.decode(base64Chunk, Base64.DEFAULT)
                exportStream?.write(bytes) ?: return false
                true
            } catch (_: Exception) { false }
        }

        @JavascriptInterface fun finishSaveFile(): Boolean {
            return try {
                exportStream?.flush()
                exportStream?.close()
                exportStream = null
                val uri = exportUri ?: return false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
                    contentResolver.update(uri, values, null, null)
                }
                exportUri = null
                saveResult(true, "saved")
                true
            } catch (_: Exception) {
                saveResult(false, "save_failed")
                false
            }
        }

        @JavascriptInterface fun cancelSaveFile() {
            try { exportStream?.close() } catch (_: Exception) {}
            exportStream = null
            exportUri?.let { try { contentResolver.delete(it, null, null) } catch (_: Exception) {} }
            exportUri = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        webView.removeJavascriptInterface("AndroidBridge")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val APP_URL = "https://rhythm-vieron-studio.lovable.app"
    }
}
