package com.vireon.ai

import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

class VireonWebChromeClient(
    private val onProgressChangedCallback: (Int) -> Unit,
    private val onFileChooserCallback: (ValueCallback<Array<Uri>>?, WebChromeClient.FileChooserParams?) -> Boolean
) : WebChromeClient() {

    override fun onProgressChanged(view: WebView?, newProgress: Int) {
        super.onProgressChanged(view, newProgress)
        onProgressChangedCallback(newProgress)
    }

    override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
    ): Boolean {
        return onFileChooserCallback(filePathCallback, fileChooserParams)
    }

    override fun onPermissionRequest(request: PermissionRequest?) {
        // Automatically grant permissions requested by the Web App (e.g. Camera / Microphone)
        request?.grant(request.resources)
    }
}
