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
        "vireon.ai",
        "google.com",
        "accounts.google.com",
        "apis.google.com",
        "oauth2.googleapis.com",
        "gstatic.com",
        "ssl.gstatic.com",
        "supabase.co",
        "firebaseapp.com",
        "github.com",
        "appleid.apple.com"
    )

    private fun isAllowedHost(host: String): Boolean {
        if (host.isEmpty()) return false
        return allowedHosts.any { host == it || host.endsWith(".$it") } ||
                host.contains("google") ||
                host.contains("supabase") ||
                host.contains("firebase")
    }

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

        if (isAllowedHost(host)) {
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
        return isAllowedHost(host)
    }

    private fun injectDownloadInterceptorScript(webView: WebView?) {
        val js = """
            (function() {
                if (window.__vireonDownloadInjected) return;
                window.__vireonDownloadInjected = true;

                window.__vireonBlobMap = window.__vireonBlobMap || {};
                // Save only when the user explicitly requests a download/export.
                // Do not deduplicate by size/time: two legitimate exports can be identical.
                function processBlobSave(blob, fileName, mimeType) {
                    if (!blob) return false;
                    var now = Date.now();
                    var finalName = fileName || ('vireon_export_' + now);
                    var finalMime = mimeType || blob.type || '';

                    var reader = new FileReader();
                    reader.onloadend = function() {
                        var base64data = reader.result;
                        if (window.VireonNative && window.VireonNative.saveBlobData) {
                            window.VireonNative.saveBlobData(base64data, finalMime, finalName);
                        }
                    };
                    reader.readAsDataURL(blob);
                    return true;
                }

                // 1. Intercept URL.createObjectURL to capture all generated Blobs
                if (window.URL && window.URL.createObjectURL) {
                    var origCreateObjectURL = window.URL.createObjectURL;
                    window.URL.createObjectURL = function(blob) {
                        var url = origCreateObjectURL.apply(this, arguments);
                        if (blob && (blob instanceof Blob || blob instanceof File)) {
                            // Mapping only. Temporary preview/thumbnail Blobs must never be
                            // written to storage unless an explicit download action requests it.
                            window.__vireonBlobMap[url] = blob;
                        }
                        return url;
                    };
                }

                // 2. Intercept URL.revokeObjectURL to delay revocation
                if (window.URL && window.URL.revokeObjectURL) {
                    var origRevokeObjectURL = window.URL.revokeObjectURL;
                    window.URL.revokeObjectURL = function(url) {
                        setTimeout(function() {
                            if (window.__vireonBlobMap && window.__vireonBlobMap[url]) {
                                delete window.__vireonBlobMap[url];
                            }
                            try {
                                origRevokeObjectURL.call(window.URL, url);
                            } catch(e) {}
                        }, 60000);
                    };
                }

                // Helper to save URL (supports blob:, data:, http:, https:)
                function processUrlSave(url, fileName, mimeType) {
                    if (!url) return false;
                    var finalName = fileName || ('vireon_export_' + Date.now());

                    if (window.__vireonBlobMap && window.__vireonBlobMap[url]) {
                        return processBlobSave(window.__vireonBlobMap[url], finalName, mimeType);
                    }

                    if (url.startsWith('data:')) {
                        var parts = url.split(',');
                        var mimeMatch = parts[0].match(/:(.*?);/);
                        var finalMime = mimeType || (mimeMatch ? mimeMatch[1] : '');
                        if (window.VireonNative && window.VireonNative.saveBlobData) {
                            window.VireonNative.saveBlobData(parts[1], finalMime, finalName);
                        }
                        return true;
                    }

                    if (url.startsWith('blob:') || url.startsWith('http:') || url.startsWith('https:')) {
                        fetch(url)
                            .then(function(res) { return res.blob(); })
                            .then(function(blob) {
                                processBlobSave(blob, finalName, mimeType);
                            })
                            .catch(function(err) {
                                console.error('Vireon fetch URL failed, fallback to native:', err);
                                if (window.VireonNative && window.VireonNative.downloadUrl) {
                                    window.VireonNative.downloadUrl(url, mimeType || '', finalName);
                                }
                            });
                        return true;
                    }
                    return false;
                }

                // 3. Intercept HTMLAnchorElement.prototype.click
                if (window.HTMLAnchorElement && window.HTMLAnchorElement.prototype) {
                    var origClick = window.HTMLAnchorElement.prototype.click;
                    window.HTMLAnchorElement.prototype.click = function() {
                        var href = this.getAttribute('href') || this.href;
                        var fileName = this.getAttribute('download') || this.download || 'vireon_export';
                        var mimeType = this.getAttribute('type') || '';

                        if (href && (href.startsWith('blob:') || href.startsWith('data:') || href.startsWith('http:') || href.startsWith('https:') || this.hasAttribute('download'))) {
                            if (processUrlSave(href, fileName, mimeType)) {
                                return;
                            }
                        }
                        return origClick.apply(this, arguments);
                    };
                }

                // 4. Intercept window.open
                var origOpen = window.open;
                window.open = function(url, target, features) {
                    if (url && (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:'))) {
                        if (processUrlSave(url, 'vireon_export', '')) {
                            return null;
                        }
                    }
                    return origOpen.apply(this, arguments);
                };

                // 5. Intercept navigator.share
                if (navigator.share) {
                    var origShare = navigator.share;
                    navigator.share = function(data) {
                        if (data && data.files && data.files.length > 0) {
                            for (var i = 0; i < data.files.length; i++) {
                                var f = data.files[i];
                                processBlobSave(f, f.name || 'vireon_export', f.type);
                            }
                            return Promise.resolve();
                        }
                        if (data && data.url) {
                            processUrlSave(data.url, data.title || 'vireon_export', '');
                            return Promise.resolve();
                        }
                        return origShare.apply(this, arguments);
                    };
                }

                // 6. DOM Click Listener as fallback
                document.addEventListener('click', function(e) {
                    var target = e.target;
                    while (target && target.tagName !== 'A' && target.tagName !== 'BUTTON') {
                        target = target.parentElement;
                    }
                    if (target) {
                        var text = (target.innerText || target.textContent || '').toLowerCase();
                        var isExportBtn = text.indexOf('export') !== -1 || text.indexOf('download') !== -1 || text.indexOf('تنزيل') !== -1 || text.indexOf('تصدير') !== -1;

                        if (target.tagName === 'A') {
                            var href = target.getAttribute('href') || target.href;
                            var fileName = target.getAttribute('download') || target.download || 'vireon_export';
                            var mimeType = target.getAttribute('type') || '';
                            if (target.hasAttribute('download') || isExportBtn || (href && (href.startsWith('blob:') || href.startsWith('data:')))) {
                                if (processUrlSave(href, fileName, mimeType)) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                            }
                        }
                    }
                }, true);

                // Global helper method
                window.VireonNativeSaveBlob = function(blob, fileName, mimeType) {
                    processBlobSave(blob, fileName, mimeType);
                };
            })();
        """.trimIndent()

        webView?.evaluateJavascript(js, null)
    }
}
