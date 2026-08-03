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
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.util.Base64;

@CapacitorPlugin(name = "VireonMedia")
public class VireonMediaPlugin extends Plugin {

    @PluginMethod
    public void getVideoThumbnail(PluginCall call) {
        String videoPath = call.getString("path");
        int timeMs = call.getInt("timeMs", 1000);
        int width = call.getInt("width", 200);

        if (videoPath == null || videoPath.isEmpty()) {
            call.reject("Path is missing");
            return;
        }

        if (videoPath.startsWith("file://")) {
            videoPath = videoPath.substring(7);
        }

        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(videoPath);
            // MediaMetadataRetriever takes time in microseconds
            Bitmap bitmap = retriever.getFrameAtTime(timeMs * 1000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            
            if (bitmap != null) {
                // Resize for efficiency if needed
                if (width > 0 && width < bitmap.getWidth()) {
                    int height = (int) (bitmap.getHeight() * ((float) width / bitmap.getWidth()));
                    bitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
                }

                ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 80, byteArrayOutputStream);
                byte[] byteArray = byteArrayOutputStream.toByteArray();
                String encoded = Base64.encodeToString(byteArray, Base64.NO_WRAP);

                JSObject ret = new JSObject();
                ret.put("value", "data:image/jpeg;base64," + encoded);
                call.resolve(ret);
            } else {
                call.reject("Could not capture frame");
            }
        } catch (Exception e) {
            call.reject("Error capturing thumbnail: " + e.getMessage());
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
    }

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
                try (OutputStream out = getContext().getContentResolver().openOutputStream(collection);
                     FileInputStream in = new FileInputStream(tempFile)) {
                    if (out != null) {
                        byte[] buffer = new byte[8192];
                        int length;
                        while ((length = in.read(buffer)) > 0) {
                            out.write(buffer, 0, length);
                        }
                        out.flush();

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
