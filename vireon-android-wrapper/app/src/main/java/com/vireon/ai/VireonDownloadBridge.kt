package com.vireon.ai

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

    private fun resolveTypeAndFileName(
        bytes: ByteArray,
        rawMimeType: String,
        rawFileName: String
    ): Pair<String, String> {
        var mime = rawMimeType.trim().lowercase()
        // Sanitize raw filename, preserving Arabic / Unicode characters, digits, spaces, dots, underscores
        var name = rawFileName.trim().replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1F]"), "_")
        if (name.isEmpty() || name == "_") {
            name = "vireon_export_${System.currentTimeMillis()}"
        }

        // Magic byte inspection for guaranteed format detection
        val magicExt = detectMagicBytesExtension(bytes)
        var ext = magicExt ?: getExtensionFromFileName(name) ?: getExtensionFromMime(mime)

        if (ext == null) {
            ext = if (mime.startsWith("video/")) ".mp4" else if (mime.startsWith("image/")) ".png" else ".bin"
        }

        // Correct MIME type based on extension if generic
        if (mime.isEmpty() || mime == "application/octet-stream" || mime == "binary/octet-stream" || mime == "*/*") {
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
                else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.removePrefix(".")) ?: "application/octet-stream"
            }
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
        val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.IS_PENDING, 1)

            val relativeFolder = when {
                mimeType.startsWith("video/") -> Environment.DIRECTORY_MOVIES + "/Vireon"
                mimeType.startsWith("image/") -> Environment.DIRECTORY_PICTURES + "/Vireon"
                mimeType.startsWith("audio/") -> Environment.DIRECTORY_MUSIC + "/Vireon"
                else -> Environment.DIRECTORY_DOWNLOADS + "/Vireon"
            }
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativeFolder)
        }

        val collectionUri: Uri = when {
            mimeType.startsWith("video/") -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            mimeType.startsWith("image/") -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            mimeType.startsWith("audio/") -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            else -> MediaStore.Downloads.EXTERNAL_CONTENT_URI
        }

        val uri = resolver.insert(collectionUri, contentValues) ?: return Pair(false, "")

        return try {
            resolver.openOutputStream(uri)?.use { outputStream ->
                outputStream.write(bytes)
                outputStream.flush()
            }
            contentValues.clear()
            contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)

            // Notify media scanner
            MediaScannerConnection.scanFile(
                context,
                arrayOf(uri.toString()),
                arrayOf(mimeType),
                null
            )

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
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: ""
        return host == "rhythm-vieron-studio.lovable.app" ||
                host.endsWith(".lovable.app") ||
                host == "vireon.ai" ||
                host.endsWith(".vireon.ai")
    }

    private fun showToastOnMain(msg: String) {
        CoroutineScope(Dispatchers.Main).launch {
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
        }
    }
}
