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
            String fileName = "Vireon_Render_" + System.currentTimeMillis();
            values.put(MediaStore.Video.Media.TITLE, fileName);
            values.put(MediaStore.Video.Media.DISPLAY_NAME, fileName + ".mp4");
            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            values.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/VireonAI");

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            }

            Uri collection = getContext().getContentResolver().insert(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values
            );

            if (collection != null) {
                try (OutputStream out = getContext().getContentResolver().openOutputStream(collection);
                     FileInputStream in = new FileInputStream(tempFile)) {
                    if (out != null) {
                        byte[] buffer = new byte[16384];
                        int length;
                        while ((length = in.read(buffer)) > 0) {
                            out.write(buffer, 0, length);
                        }
                        out.flush();

                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                            values.clear();
                            values.put(MediaStore.Video.Media.IS_PENDING, 0);
                            getContext().getContentResolver().update(collection, values, null, null);
                        } else {
                            try {
                                MediaScannerConnection.scanFile(
                                    getContext(), 
                                    new String[]{tempFile.getAbsolutePath()}, 
                                    new String[]{"video/mp4"}, 
                                    null
                                );
                            } catch (Exception ignored) {}
                        }

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("uri", collection.toString());
                        ret.put("message", "تم حفظ الفيديو بالاستوديو بنجاح!");
                        call.resolve(ret);
                    } else {
                        call.reject("فشل فتح مجرى الكتابة في معرض الصور.");
                    }
                }
            } else {
                call.reject("فشل إنشاء مسار في معرض الصور.");
            }

        } catch (Exception e) {
            call.reject("حدث خطأ أثناء الحفظ: " + e.getLocalizedMessage());
        }
    }
}