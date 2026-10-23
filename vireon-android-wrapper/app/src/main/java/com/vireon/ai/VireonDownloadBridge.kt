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

                val safeFileName = sanitizeFileName(fileName, mimeType)
                val isVideoOrImage = mimeType.startsWith("video/") || mimeType.startsWith("image/")
                val (success, _) = saveToFileSystem(fileBytes, mimeType, safeFileName)

                withContext(Dispatchers.Main) {
                    if (success) {
                        val locationMsg = if (isVideoOrImage) "في المعرض (Gallery)" else "في التنزيلات"
                        showToastOnMain("تم حفظ الملف بنجاح $locationMsg: $safeFileName")
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
                mimeType.startsWith("video/") -> Environment.DIRECTORY_MOVIES + "/VireonAI"
                mimeType.startsWith("image/") -> Environment.DIRECTORY_PICTURES + "/VireonAI"
                mimeType.startsWith("audio/") -> Environment.DIRECTORY_MUSIC + "/VireonAI"
                else -> Environment.DIRECTORY_DOWNLOADS + "/VireonAI"
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
            val vireonDir = File(parentDir, "VireonAI")
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

    private fun sanitizeFileName(rawName: String, mimeType: String): String {
        var name = rawName.trim().replace(Regex("[^a-zA-Z0-9._-]"), "_")
        if (name.isEmpty()) {
            name = "vireon_export_${System.currentTimeMillis()}"
        }

        val ext = when {
            mimeType.contains("mp4") -> ".mp4"
            mimeType.contains("webm") -> ".webm"
            mimeType.contains("png") -> ".png"
            mimeType.contains("jpg") || mimeType.contains("jpeg") -> ".jpg"
            mimeType.contains("webp") -> ".webp"
            mimeType.contains("mp3") -> ".mp3"
            mimeType.contains("wav") -> ".wav"
            else -> ""
        }

        if (ext.isNotEmpty() && !name.lowercase().endsWith(ext)) {
            name += ext
        }
        return name
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
