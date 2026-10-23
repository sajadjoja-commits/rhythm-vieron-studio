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

        if (scheme != "http" && scheme != "https") {
            try {
                val intent = Intent(Intent.ACTION_VIEW, uri)
                context.startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            return true
        }

        if (allowedHosts.any { host == it || host.endsWith(".$it") }) {
            return false
        }

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
        val currentUrl = url ?: view?.url ?: ""
        if (isTrustedUrl(currentUrl)) {
            injectDownloadInterceptorScript(view)
        }
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        CookieManager.getInstance().flush()
        onPageFinishedCallback()

        val currentUrl = url ?: view?.url ?: ""
        if (isTrustedUrl(currentUrl)) {
            injectDownloadInterceptorScript(view)
        }
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

    private fun isTrustedUrl(url: String): Boolean {
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: ""
        return allowedHosts.any { host == it || host.endsWith(".$it") }
    }

    private fun injectDownloadInterceptorScript(webView: WebView?) {
        val js = """
            (function() {
                if (window.__vireonDownloadInjected) return;
                window.__vireonDownloadInjected = true;

                function handleExportBlob(blobUrl, fileName, mimeType) {
                    if (!blobUrl) return false;
                    fileName = fileName || ('vireon_export_' + Date.now());

                    if (blobUrl.startsWith('blob:')) {
                        fetch(blobUrl)
                            .then(function(res) { return res.blob(); })
                            .then(function(blob) {
                                var reader = new FileReader();
                                reader.onloadend = function() {
                                    var base64data = reader.result;
                                    var finalMime = mimeType || blob.type || '';
                                    if (window.VireonNative && window.VireonNative.saveBlobData) {
                                        window.VireonNative.saveBlobData(base64data, finalMime, fileName);
                                    }
                                };
                                reader.readAsDataURL(blob);
                            })
                            .catch(function(err) {
                                console.error('Vireon Blob fetch failed:', err);
                            });
                        return true;
                    } else if (blobUrl.startsWith('data:')) {
                        var parts = blobUrl.split(',');
                        var mimeMatch = parts[0].match(/:(.*?);/);
                        var finalMime = mimeType || (mimeMatch ? mimeMatch[1] : '');
                        if (window.VireonNative && window.VireonNative.saveBlobData) {
                            window.VireonNative.saveBlobData(parts[1], finalMime, fileName);
                        }
                        return true;
                    }
                    return false;
                }

                // Intercept HTMLAnchorElement.prototype.click
                var origClick = HTMLAnchorElement.prototype.click;
                HTMLAnchorElement.prototype.click = function() {
                    var href = this.getAttribute('href') || this.href;
                    var fileName = this.getAttribute('download') || this.download || 'vireon_export';
                    var mimeType = this.getAttribute('type') || '';
                    if (href && (href.startsWith('blob:') || href.startsWith('data:') || this.hasAttribute('download'))) {
                        if (handleExportBlob(href, fileName, mimeType)) {
                            return;
                        }
                    }
                    return origClick.apply(this, arguments);
                };

                // Intercept window.open for blob/data URLs
                var origOpen = window.open;
                window.open = function(url, target, features) {
                    if (url && (url.startsWith('blob:') || url.startsWith('data:'))) {
                        if (handleExportBlob(url, 'vireon_export', '')) {
                            return null;
                        }
                    }
                    return origOpen.apply(this, arguments);
                };

                // Fallback Event Listener on DOM
                document.addEventListener('click', function(e) {
                    var target = e.target;
                    while (target && target.tagName !== 'A') {
                        target = target.parentElement;
                    }
                    if (target) {
                        var href = target.getAttribute('href') || target.href;
                        var fileName = target.getAttribute('download') || target.download || 'vireon_export';
                        var mimeType = target.getAttribute('type') || '';
                        if (target.hasAttribute('download') || (href && (href.startsWith('blob:') || href.startsWith('data:')))) {
                            if (handleExportBlob(href, fileName, mimeType)) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }
                    }
                }, true);

                // Global helper function for direct JS calls from Web App
                window.VireonNativeSaveBlob = function(blob, fileName, mimeType) {
                    if (!blob) return;
                    var reader = new FileReader();
                    reader.onloadend = function() {
                        var base64data = reader.result;
                        if (window.VireonNative && window.VireonNative.saveBlobData) {
                            window.VireonNative.saveBlobData(base64data, mimeType || blob.type || '', fileName || 'vireon_export');
                        }
                    };
                    reader.readAsDataURL(blob);
                };
            })();
        """.trimIndent()

        webView?.evaluateJavascript(js, null)
    }
}
