package com.vireon.ai;

import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "VireonMedia")
public class VireonMediaPlugin extends Plugin {

    @PluginMethod
    public void saveVideoToGallery(PluginCall call) {
        String tempPath = call.getString("path");
        if (tempPath == null || tempPath.trim().isEmpty()) {
            call.reject("المسار فارغ أو غير موجود!");
            return;
        }
        if (tempPath.startsWith("file://")) tempPath = tempPath.substring(7);

        File tempFile = new File(tempPath);
        if (!tempFile.isFile() || !tempFile.canRead()) {
            call.reject("الملف المؤقت غير موجود أو غير قابل للقراءة: " + tempPath);
            return;
        }

        Uri insertedUri = null;
        try {
            ContentValues values = new ContentValues();
            String fileName = "Vireon_Render_" + System.currentTimeMillis();
            values.put(MediaStore.Video.Media.TITLE, fileName);
            values.put(MediaStore.Video.Media.DISPLAY_NAME, fileName + ".mp4");
            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                values.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/VireonAI");
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            }

            insertedUri = getContext().getContentResolver().insert(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values
            );
            if (insertedUri == null) {
                call.reject("فشل إنشاء ملف الفيديو في معرض الجهاز.");
                return;
            }

            try (OutputStream out = getContext().getContentResolver().openOutputStream(insertedUri);
                 FileInputStream in = new FileInputStream(tempFile)) {
                if (out == null) throw new IllegalStateException("تعذر فتح مجرى الكتابة للفيديو.");
                byte[] buffer = new byte[64 * 1024];
                int length;
                while ((length = in.read(buffer)) != -1) {
                    if (length > 0) out.write(buffer, 0, length);
                }
                out.flush();
            }

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Video.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(insertedUri, ready, null, null);
            } else {
                MediaScannerConnection.scanFile(getContext(), new String[]{tempFile.getAbsolutePath()}, new String[]{"video/mp4"}, null);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("uri", insertedUri.toString());
            ret.put("message", "تم حفظ الفيديو بالاستوديو بنجاح!");
            call.resolve(ret);
        } catch (Exception e) {
            if (insertedUri != null) {
                try { getContext().getContentResolver().delete(insertedUri, null, null); } catch (Exception ignored) {}
            }
            String message = e.getLocalizedMessage();
            call.reject("حدث خطأ أثناء الحفظ: " + (message == null ? "خطأ غير معروف" : message));
        }
    }
}
