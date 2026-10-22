package com.vireon.ai

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var errorView: LinearLayout
    private lateinit var btnRetry: Button

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (filePathCallback == null) return@registerForActivityResult
            val intentData = result.data
            val results: Array<Uri>? = when {
                result.resultCode == RESULT_OK && intentData?.data != null -> arrayOf(intentData.data!!)
                result.resultCode == RESULT_OK && intentData?.clipData != null -> {
                    val count = intentData.clipData!!.itemCount
                    Array(count) { i -> intentData.clipData!!.getItemAt(i).uri }
                }
                else -> null
            }
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupWebView()
        setupBackNavigation()

        loadMainUrl()
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        progressBar = findViewById(R.id.progressBar)
        errorView = findViewById(R.id.errorView)
        btnRetry = findViewById(R.id.btnRetry)

        swipeRefreshLayout.setOnRefreshListener {
            if (NetworkUtils.isNetworkAvailable(this)) {
                hideError()
                webView.reload()
            } else {
                swipeRefreshLayout.isRefreshing = false
                showError("No internet connection")
            }
        }

        btnRetry.setOnClickListener {
            if (NetworkUtils.isNetworkAvailable(this)) {
                hideError()
                loadMainUrl()
            } else {
                showError("No internet connection")
            }
        }
    }

    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        // Enable Cookies & Session management
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = VireonWebViewClient(
            context = this,
            onPageStartedCallback = {
                progressBar.visibility = View.VISIBLE
            },
            onPageFinishedCallback = {
                progressBar.visibility = View.GONE
                swipeRefreshLayout.isRefreshing = false
            },
            onErrorCallback = { _ ->
                if (!NetworkUtils.isNetworkAvailable(this)) {
                    showError("No internet connection")
                }
            }
        )

        webView.webChromeClient = VireonWebChromeClient(
            onProgressChangedCallback = { progress ->
                progressBar.progress = progress
                if (progress >= 100) {
                    progressBar.visibility = View.GONE
                }
            },
            onFileChooserCallback = { callback, params ->
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }

                try {
                    fileChooserLauncher.launch(intent)
                } catch (e: Exception) {
                    filePathCallback?.onReceiveValue(null)
                    filePathCallback = null
                    return@VireonWebChromeClient false
                }
                true
            }
        )
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun loadMainUrl() {
        if (NetworkUtils.isNetworkAvailable(this)) {
            hideError()
            webView.loadUrl(MAIN_URL)
        } else {
            showError("No internet connection")
        }
    }

    private fun showError(message: String) {
        webView.visibility = View.GONE
        errorView.visibility = View.VISIBLE
        swipeRefreshLayout.isRefreshing = false
        progressBar.visibility = View.GONE
    }

    private fun hideError() {
        errorView.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }

    companion object {
        private const val MAIN_URL = "https://rhythm-vieron-studio.lovable.app"
    }
}
