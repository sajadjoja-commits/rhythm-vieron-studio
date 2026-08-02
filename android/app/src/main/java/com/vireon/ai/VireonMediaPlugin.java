package com.vireon.ai;

import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "VireonMedia")
public class VireonMediaPlugin extends Plugin {

    @PluginMethod
    public void getGalleryAssets(PluginCall call) {
        String type = call.getString("type", "both");
        JSArray assets = new JSArray();

        Uri collection = MediaStore.Files.getContentUri("external");
        String[] projection = {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.DURATION,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_ADDED
        };

        String selection;
        if (type.equals("image")) {
            selection = MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE;
        } else if (type.equals("video")) {
            selection = MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
        } else {
            selection = MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE +
                        " OR " + MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
        }

        try (Cursor cursor = getContext().getContentResolver().query(
                collection, projection, selection, null, MediaStore.Files.FileColumns.DATE_ADDED + " DESC")) {

            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME);
                int typeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DURATION);
                int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE);

                while (cursor.moveToNext() && assets.length() < 1000) {
                    long id = cursor.getLong(idCol);
                    String name = cursor.getString(nameCol);
                    int mediaType = cursor.getInt(typeCol);
                    long duration = cursor.getLong(durationCol);
                    long size = cursor.getLong(sizeCol);

                    Uri contentUri = ContentUris.withAppendedId(
                        mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ? 
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, 
                        id
                    );

                    JSObject asset = new JSObject();
                    asset.put("identifier", String.valueOf(id));
                    asset.put("name", name);
                    asset.put("path", contentUri.toString());
                    asset.put("duration", duration / 1000); // to seconds
                    asset.put("size", size);
                    asset.put("mimeType", mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ? "video/mp4" : "image/jpeg");
                    assets.put(asset);
                }
            }
            JSObject ret = new JSObject();
            ret.put("assets", assets);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to query gallery: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getAudioAssets(PluginCall call) {
        JSArray assets = new JSArray();
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE
        };

        try (Cursor cursor = getContext().getContentResolver().query(
                collection, projection, null, null, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {

            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idCol);
                    String name = cursor.getString(nameCol);
                    String artist = cursor.getString(artistCol);
                    long duration = cursor.getLong(durationCol);
                    long size = cursor.getLong(sizeCol);

                    Uri contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);

                    JSObject asset = new JSObject();
                    asset.put("id", String.valueOf(id));
                    asset.put("name", name);
                    asset.put("artist", artist);
                    asset.put("duration", formatDuration(duration));
                    asset.put("url", contentUri.toString());
                    asset.put("size", size);
                    assets.put(asset);
                }
            }
            JSObject ret = new JSObject();
            ret.put("songs", assets);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to query audio: " + e.getMessage());
        }
    }

    private String formatDuration(long ms) {
        long sec = (ms / 1000) % 60;
        long min = (ms / (1000 * 60)) % 60;
        return String.format("%d:%02d", min, sec);
    }

    @PluginMethod
    public void saveVideoToGallery(PluginCall call) {
        // ... (existing implementation kept)
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
