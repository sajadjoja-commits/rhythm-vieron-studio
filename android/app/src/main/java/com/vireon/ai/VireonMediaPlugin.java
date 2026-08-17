package com.vireon.ai;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;

@CapacitorPlugin(
    name = "VireonMedia",
    permissions = {
        @Permission(
            alias = "publicStorage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        ),
        @Permission(
            alias = "media",
            strings = {
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
                "android.permission.READ_MEDIA_AUDIO"
            }
        )
    }
)
public class VireonMediaPlugin extends Plugin {
    private static final String TAG = "VireonMedia";

    @PluginMethod
    public void pickVideo(PluginCall call) {
        if (checkMediaPermissions()) {
            openVideoPicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PluginMethod
    public void pickImage(PluginCall call) {
        if (checkMediaPermissions()) {
            openImagePicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (checkMediaPermissions()) {
            String method = call.getMethodName();
            if ("pickVideo".equals(method)) {
                openVideoPicker(call);
            } else if ("pickImage".equals(method)) {
                openImagePicker(call);
            }
        } else {
            call.reject("يجب الموافقة على صلاحيات الوصول للملفات للمتابعة.");
        }
    }

    private boolean checkMediaPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPermissionState("media") == PermissionState.GRANTED;
        } else {
            return getPermissionState("publicStorage") == PermissionState.GRANTED;
        }
    }

    private void openVideoPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setDataAndType(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/*");
        startActivityForResult(call, intent, "videoPickCallback");
    }

    private void openImagePicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        startActivityForResult(call, intent, "imagePickCallback");
    }

    @PluginMethod
    public void videoPickCallback(PluginCall call, Intent data) {
        if (data == null || data.getData() == null) {
            call.reject("لم يتم اختيار أي فيديو.");
            return;
        }
        processPickedMedia(call, data.getData(), "video");
    }

    @PluginMethod
    public void imagePickCallback(PluginCall call, Intent data) {
        if (data == null || data.getData() == null) {
            call.reject("لم يتم اختيار أي صورة.");
            return;
        }
        processPickedMedia(call, data.getData(), "image");
    }

    private void processPickedMedia(PluginCall call, Uri uri, String type) {
        try {
            String extension = type.equals("video") ? "mp4" : "jpg";
            String fileName = type + "_" + System.currentTimeMillis() + "." + extension;
            
            File destDir = new File(getContext().getFilesDir(), "vireon_media");
            if (!destDir.exists() && !destDir.mkdirs()) {
                Log.e(TAG, "Failed to create directory: " + destDir.getAbsolutePath());
            }
            File destFile = new File(destDir, fileName);

            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(destFile)) {
                if (in == null) {
                    call.reject("فشل الوصول إلى الملف المختار.");
                    return;
                }
                byte[] buffer = new byte[16384];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    out.write(buffer, 0, len);
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", destFile.getAbsolutePath());
            ret.put("webPath", Uri.fromFile(destFile).toString());
            ret.put("format", type);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("فشل استيراد الملف: " + e.getMessage());
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