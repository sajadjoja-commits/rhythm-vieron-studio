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
        if (tempPath == null || tempPath.isEmpty()) {
            call.reject("المسار فارغ أو غير موجود!");
            return;
        }

        if (tempPath.startsWith("file://")) {
            tempPath = tempPath.substring(7);
        }

        File tempFile = new File(tempPath);
        if (!tempFile.exists()) {
            call.reject("الملف المؤقت غير موجود بالمسار المحدد: " + tempPath);
            return;
        }

        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Video.Media.TITLE, "Vireon_Render_" + System.currentTimeMillis());
            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            values.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/VireonAI");

            Uri collection = getContext().getContentResolver().insert(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values
            );

            if (collection != null) {
                OutputStream out = getContext().getContentResolver().openOutputStream(collection);
                FileInputStream in = new FileInputStream(tempFile);

                byte[] buffer = new byte[8192];
                int length;
                while ((length = in.read(buffer)) > 0) {
                    out.write(buffer, 0, length);
                }

                in.close();
                out.close();

                MediaScannerConnection.scanFile(
                    getContext(), 
                    new String[]{tempFile.getAbsolutePath()}, 
                    null, 
                    (path, uri) -> {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("message", "تم حفظ الفيديو بالاستوديو بنجاح!");
                        call.resolve(ret);
                    }
                );
            } else {
                call.reject("فشل إنشاء مسار في معرض الصور.");
            }

        } catch (Exception e) {
            call.reject("حدث خطأ أثناء الحفظ: " + e.getLocalizedMessage());
        }
    }
}