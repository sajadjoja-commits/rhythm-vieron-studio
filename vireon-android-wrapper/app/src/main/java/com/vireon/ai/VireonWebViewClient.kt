package com.vireon.ai

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class VireonWebViewClient(
    private val context: Context,
    private val onPageStartedCallback: () -> Unit,
    private val onPageFinishedCallback: () -> Unit,
    private val onErrorCallback: (String) -> Unit
) : WebViewClient() {

    private val allowedHosts = listOf(
        "rhythm-vieron-studio.lovable.app",
        "lovable.app",
        "vireon.ai"
    )

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return false
        val host = uri.host?.lowercase() ?: ""
        val scheme = uri.scheme?.lowercase() ?: ""

        // Handle custom schemes or external applications (e.g., mailto, tel, whatsapp, intent)
        if (scheme != "http" && scheme != "https") {
            try {
                val intent = Intent(Intent.ACTION_VIEW, uri)
                context.startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            return true
        }

        // Keep internal website navigation inside WebView
        if (allowedHosts.any { host == it || host.endsWith(".$it") }) {
            return false
        }

        // Open external domains in external browser
        try {
            val intent = Intent(Intent.ACTION_VIEW, uri)
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return true
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        onPageStartedCallback()
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        CookieManager.getInstance().flush()
        onPageFinishedCallback()
    }

    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: WebResourceError?
    ) {
        super.onReceivedError(view, request, error)
        if (request?.isForMainFrame == true) {
            val description = error?.description?.toString() ?: "Unknown Network Error"
            onErrorCallback(description)
        }
    }
}
