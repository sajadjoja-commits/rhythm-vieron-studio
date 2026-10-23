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

                function processExportUrl(href, fileName) {
                    if (!href) return false;
                    fileName = fileName || 'vireon_export';

                    if (href.startsWith('blob:')) {
                        fetch(href)
                            .then(function(r) { return r.blob(); })
                            .then(function(blob) {
                                var reader = new FileReader();
                                reader.onloadend = function() {
                                    var base64data = reader.result;
                                    if (window.VireonNative && window.VireonNative.saveBlobData) {
                                        window.VireonNative.saveBlobData(base64data, blob.type || 'video/mp4', fileName);
                                    }
                                };
                                reader.readAsDataURL(blob);
                            })
                            .catch(function(err) {
                                console.error('Vireon Blob export error:', err);
                            });
                        return true;
                    } else if (href.startsWith('data:')) {
                        var parts = href.split(',');
                        var mimeMatch = parts[0].match(/:(.*?);/);
                        var mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
                        if (window.VireonNative && window.VireonNative.saveBlobData) {
                            window.VireonNative.saveBlobData(parts[1], mimeType, fileName);
                        }
                        return true;
                    }
                    return false;
                }

                // Global Helper
                window.VireonNativeSaveBlob = function(blob, fileName) {
                    if (!blob) return;
                    var reader = new FileReader();
                    reader.onloadend = function() {
                        var base64data = reader.result;
                        if (window.VireonNative && window.VireonNative.saveBlobData) {
                            window.VireonNative.saveBlobData(base64data, blob.type || 'video/mp4', fileName || 'vireon_video.mp4');
                        }
                    };
                    reader.readAsDataURL(blob);
                };

                // Prototype Click Hook
                var origClick = HTMLAnchorElement.prototype.click;
                HTMLAnchorElement.prototype.click = function() {
                    var href = this.getAttribute('href') || this.href;
                    var fileName = this.getAttribute('download') || 'vireon_export';
                    var handled = processExportUrl(href, fileName);
                    if (!handled) {
                        return origClick.apply(this, arguments);
                    }
                };

                // DOM Click Event Listener
                document.addEventListener('click', function(e) {
                    var target = e.target;
                    while (target && target.tagName !== 'A') {
                        target = target.parentElement;
                    }
                    if (target) {
                        var href = target.getAttribute('href') || target.href;
                        var fileName = target.getAttribute('download') || 'vireon_export';
                        if (target.hasAttribute('download') || (href && (href.startsWith('blob:') || href.startsWith('data:')))) {
                            if (processExportUrl(href, fileName)) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }
                    }
                }, true);
            })();
        """.trimIndent()

        webView?.evaluateJavascript(js, null)
    }
}
