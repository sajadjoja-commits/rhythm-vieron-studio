package com.vireon.ai

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import android.webkit.WebView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class VireonDownloadBridge(
    private val context: Context,
    private val webViewProvider: () -> WebView?
) {

    @JavascriptInterface
    fun saveBlobData(base64Data: String, mimeType: String, fileName: String) {
        val currentUrl = webViewProvider()?.url ?: ""
        if (!isTrustedUrl(currentUrl)) {
            showToastOnMain("Export blocked: Untrusted domain")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val cleanedBase64 = if (base64Data.contains(",")) {
                    base64Data.substringAfter(",")
                } else {
                    base64Data
                }

                val fileBytes = Base64.decode(cleanedBase64, Base64.DEFAULT)
                if (fileBytes.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        showToastOnMain("فشل التصدير: بيانات الملف فارغة")
                    }
                    return@launch
                }

                val (resolvedMime, resolvedFileName) = resolveTypeAndFileName(fileBytes, mimeType, fileName)
                val isVideoOrImage = resolvedMime.startsWith("video/") || resolvedMime.startsWith("image/")
                val (success, _) = saveToFileSystem(fileBytes, resolvedMime, resolvedFileName)

                withContext(Dispatchers.Main) {
                    if (success) {
                        val locationMsg = if (isVideoOrImage) "في المعرض (Gallery)" else "في التنزيلات (Downloads)"
                        showToastOnMain("تم حفظ الملف بنجاح $locationMsg: $resolvedFileName")
                    } else {
                        showToastOnMain("فشل حفظ الملف على الجهاز")
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    showToastOnMain("خطأ أثناء التصدير: ${e.message}")
                }
            }
        }
    }

    @JavascriptInterface
    fun downloadUrl(url: String, mimeType: String, fileName: String) {
        val currentUrl = webViewProvider()?.url ?: ""
        if (!isTrustedUrl(currentUrl)) {
            showToastOnMain("Export blocked: Untrusted domain")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (url.startsWith("data:")) {
                    val base64Data = url.substringAfter(",")
                    saveBlobData(base64Data, mimeType, fileName)
                    return@launch
                }

                val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                val uri = Uri.parse(url)
                val safeFileName = fileName.ifEmpty { URLUtil.guessFileName(url, null, mimeType) }

                val request = DownloadManager.Request(uri).apply {
                    setMimeType(mimeType.ifEmpty { "video/mp4" })
                    setTitle(safeFileName)
                    setDescription("جارٍ تنزيل الملف...")
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_MOVIES,
                        "Vireon/$safeFileName"
                    )
                }
                downloadManager.enqueue(request)
                withContext(Dispatchers.Main) {
                    showToastOnMain("بدء تنزيل الملف: $safeFileName")
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    showToastOnMain("فشل بدء التنزيل: ${e.message}")
                }
            }
        }
    }

    private fun resolveTypeAndFileName(
        bytes: ByteArray,
        rawMimeType: String,
        rawFileName: String
    ): Pair<String, String> {
        var mime = rawMimeType.trim().lowercase()
        var name = rawFileName.trim().replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1F]"), "_")
        if (name.isEmpty() || name == "_") {
            name = "vireon_export_${System.currentTimeMillis()}"
        }

        // Magic byte inspection
        val magicExt = detectMagicBytesExtension(bytes)
        var ext = magicExt ?: getExtensionFromFileName(name) ?: getExtensionFromMime(mime)

        if (ext == null) {
            // Default to video/mp4 if unknown binary/export
            ext = if (mime.startsWith("image/")) ".png" else ".mp4"
        }

        // Ensure correct video/image MIME type matching extension
        mime = when (ext) {
            ".mp4" -> "video/mp4"
            ".webm" -> "video/webm"
            ".mkv" -> "video/x-matroska"
            ".mov" -> "video/quicktime"
            ".png" -> "image/png"
            ".jpg", ".jpeg" -> "image/jpeg"
            ".webp" -> "image/webp"
            ".gif" -> "image/gif"
            ".mp3" -> "audio/mpeg"
            ".wav" -> "audio/wav"
            ".pdf" -> "application/pdf"
            else -> if (mime.isEmpty() || mime == "application/octet-stream") "video/mp4" else mime
        }

        if (!name.lowercase().endsWith(ext)) {
            name += ext
        }

        return Pair(mime, name)
    }

    private fun detectMagicBytesExtension(bytes: ByteArray): String? {
        if (bytes.size >= 8) {
            // PNG: \x89PNG
            if (bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x4E.toByte() && bytes[3] == 0x47.toByte()) {
                return ".png"
            }
            // MP4: ...ftyp
            if (bytes.size >= 12 && bytes[4] == 'f'.code.toByte() && bytes[5] == 't'.code.toByte() && bytes[6] == 'y'.code.toByte() && bytes[7] == 'p'.code.toByte()) {
                return ".mp4"
            }
            // WEBM / MKV: 0x1A 0x45 0xDF 0xA3
            if (bytes[0] == 0x1A.toByte() && bytes[1] == 0x45.toByte() && bytes[2] == 0xDF.toByte() && bytes[3] == 0xA3.toByte()) {
                return ".webm"
            }
            // WEBP: RIFF....WEBP
            if (bytes.size >= 12 && bytes[0] == 'R'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte() && bytes[3] == 'F'.code.toByte() &&
                bytes[8] == 'W'.code.toByte() && bytes[9] == 'E'.code.toByte() && bytes[10] == 'B'.code.toByte() && bytes[11] == 'P'.code.toByte()) {
                return ".webp"
            }
        }
        if (bytes.size >= 3) {
            // JPEG: \xFF\xD8\xFF
            if (bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) {
                return ".jpg"
            }
            // GIF: GIF
            if (bytes[0] == 'G'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte()) {
                return ".gif"
            }
        }
        if (bytes.size >= 4) {
            // PDF: %PDF
            if (bytes[0] == '%'.code.toByte() && bytes[1] == 'P'.code.toByte() && bytes[2] == 'D'.code.toByte() && bytes[3] == 'F'.code.toByte()) {
                return ".pdf"
            }
        }
        return null
    }

    private fun getExtensionFromFileName(fileName: String): String? {
        val dotIndex = fileName.lastIndexOf('.')
        if (dotIndex > 0 && dotIndex < fileName.length - 1) {
            val ext = fileName.substring(dotIndex).lowercase()
            if (ext.length in 2..6) return ext
        }
        return null
    }

    private fun getExtensionFromMime(mimeType: String): String? {
        return when {
            mimeType.contains("mp4") -> ".mp4"
            mimeType.contains("webm") -> ".webm"
            mimeType.contains("png") -> ".png"
            mimeType.contains("jpg") || mimeType.contains("jpeg") -> ".jpg"
            mimeType.contains("webp") -> ".webp"
            mimeType.contains("gif") -> ".gif"
            mimeType.contains("mp3") -> ".mp3"
            mimeType.contains("wav") -> ".wav"
            mimeType.contains("pdf") -> ".pdf"
            else -> MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)?.let { ".$it" }
        }
    }

    private fun saveToFileSystem(bytes: ByteArray, mimeType: String, fileName: String): Pair<Boolean, String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStore(bytes, mimeType, fileName)
        } else {
            saveViaLegacyStorage(bytes, mimeType, fileName)
        }
    }

    private fun saveViaMediaStore(bytes: ByteArray, mimeType: String, fileName: String): Pair<Boolean, String> {
        val resolver = context.contentResolver
        val isVideo = mimeType.startsWith("video/")
        val isImage = mimeType.startsWith("image/")
        val isAudio = mimeType.startsWith("audio/")

        val relativeFolder = when {
            isVideo -> Environment.DIRECTORY_MOVIES + "/Vireon"
            isImage -> Environment.DIRECTORY_PICTURES + "/Vireon"
            isAudio -> Environment.DIRECTORY_MUSIC + "/Vireon"
            else -> Environment.DIRECTORY_DOWNLOADS + "/Vireon"
        }

        val collectionUri: Uri = when {
            isVideo -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            isImage -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            isAudio -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            else -> MediaStore.Downloads.EXTERNAL_CONTENT_URI
        }

        val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativeFolder)
        }

        val uri = resolver.insert(collectionUri, contentValues) ?: return Pair(false, "")

        return try {
            val outputStream = resolver.openOutputStream(uri)
                ?: throw java.io.IOException("Unable to open MediaStore output stream")
            outputStream.use {
                it.write(bytes)
                it.flush()
            }
            contentValues.clear()
            contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)

            // MediaStore indexes this row when IS_PENDING is cleared.
            // MediaScannerConnection expects filesystem paths, not content:// URIs.
            Pair(true, uri.toString())
        } catch (e: Exception) {
            e.printStackTrace()
            resolver.delete(uri, null, null)
            Pair(false, "")
        }
    }

    private fun saveViaLegacyStorage(bytes: ByteArray, mimeType: String, fileName: String): Pair<Boolean, String> {
        return try {
            val targetDirName = when {
                mimeType.startsWith("video/") -> Environment.DIRECTORY_MOVIES
                mimeType.startsWith("image/") -> Environment.DIRECTORY_PICTURES
                mimeType.startsWith("audio/") -> Environment.DIRECTORY_MUSIC
                else -> Environment.DIRECTORY_DOWNLOADS
            }
            val parentDir = Environment.getExternalStoragePublicDirectory(targetDirName)
            val vireonDir = File(parentDir, "Vireon")
            if (!vireonDir.exists()) vireonDir.mkdirs()

            val targetFile = File(vireonDir, fileName)
            FileOutputStream(targetFile).use { out ->
                out.write(bytes)
                out.flush()
            }
            MediaScannerConnection.scanFile(
                context,
                arrayOf(targetFile.absolutePath),
                arrayOf(mimeType),
                null
            )
            Pair(true, targetFile.absolutePath)
        } catch (e: Exception) {
            e.printStackTrace()
            Pair(false, "")
        }
    }

    private fun isTrustedUrl(url: String): Boolean {
        if (url.isEmpty()) return true
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: ""
        return host.isEmpty() ||
                host == "rhythm-vieron-studio.lovable.app" ||
                host.endsWith(".lovable.app") ||
                host == "vireon.ai" ||
                host.endsWith(".vireon.ai") ||
                host.contains("google") ||
                host.contains("supabase") ||
                host.contains("firebase")
    }

    private fun showToastOnMain(msg: String) {
        CoroutineScope(Dispatchers.Main).launch {
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
        }
    }
}
