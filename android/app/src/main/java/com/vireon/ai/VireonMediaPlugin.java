package com.vireon.ai;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

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
        ),
        @Permission(
            alias = "camera",
            strings = {
                Manifest.permission.CAMERA
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

    @PluginMethod
    public void pickAudio(PluginCall call) {
        if (checkMediaPermissions()) {
            openAudioPicker(call);
        } else {
            requestPermissionForAlias(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "publicStorage", call, "permissionCallback");
        }
    }

    @PluginMethod
    public void pickMedia(PluginCall call) {
        if (checkMediaPermissions()) {
            openMediaPicker(call);
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
            } else if ("pickAudio".equals(method)) {
                openAudioPicker(call);
            } else if ("pickMedia".equals(method)) {
                openMediaPicker(call);
            }
        } else {
            call.reject("صلاحيات الوصول مرفوضة.");
        }
    }

    private boolean checkMediaPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPermissionState("media") == PermissionState.GRANTED;
        } else {
            return getPermissionState("publicStorage") == PermissionState.GRANTED;
        }
    }

    private void openMediaPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    private void openVideoPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    private void openImagePicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    private void openAudioPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        startActivityForResult(call, intent, "mediaPickCallback");
    }

    @ActivityCallback
    public void mediaPickCallback(PluginCall call, ActivityResult result) {
        if (call == null) return;
        
        Intent data = result.getData();
        if (data == null || (data.getData() == null && data.getClipData() == null)) {
            call.reject("CANCELLED");
            return;
        }

        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int i = 0; i < count; i++) {
                uris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        processPickedUris(call, uris);
    }

    private void processPickedUris(PluginCall call, List<Uri> uris) {
        try {
            List<JSObject> results = new ArrayList<>();
            File destDir = new File(getContext().getFilesDir(), "vireon_media");
            if (!destDir.exists() && !destDir.mkdirs()) {
                Log.e(TAG, "Failed to create directory");
            }

            for (Uri uri : uris) {
                String mimeType = getContext().getContentResolver().getType(uri);
                String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
                if (extension == null) extension = "bin";
                
                String fileName = "media_" + System.currentTimeMillis() + "_" + (int)(Math.random() * 1000) + "." + extension;
                File destFile = new File(destDir, fileName);

                try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(destFile)) {
                    if (in == null) continue;
                    byte[] buffer = new byte[16384];
                    int len;
                    while ((len = in.read(buffer)) > 0) {
                        out.write(buffer, 0, len);
                    }
                    out.flush();
                }

                JSObject mediaObj = new JSObject();
                mediaObj.put("path", destFile.getAbsolutePath());
                mediaObj.put("webPath", Uri.fromFile(destFile).toString());
                mediaObj.put("name", fileName);
                mediaObj.put("mimeType", mimeType);
                mediaObj.put("size", destFile.length());
                results.add(mediaObj);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("files", results);
            if (!results.isEmpty()) {
                JSObject first = results.get(0);
                ret.put("path", first.getString("path"));
                ret.put("webPath", first.getString("webPath"));
                ret.put("format", first.getString("mimeType"));
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("فشل الاستيراد: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveVideoToGallery(PluginCall call) {
        saveMedia(call, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/mp4", "Movies/VireonAI", "Vireon_Render_", ".mp4");
    }

    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        saveMedia(call, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/png", "Pictures/VireonAI", "Vireon_AI_", ".png");
    }

    @PluginMethod
    public void saveAudioToMusic(PluginCall call) {
        saveMedia(call, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio/wav", "Music/VireonAI", "Vireon_Audio_", ".wav");
    }

    private void saveMedia(PluginCall call, Uri collectionUri, String mimeType, String relativePath, String prefix, String extension) {
        String tempPath = call.getString("path");
        if (tempPath == null || tempPath.isEmpty()) {
            call.reject("المسار فارغ!");
            return;
        }

        if (tempPath.startsWith("file://")) tempPath = tempPath.substring(7);
        File tempFile = new File(tempPath);
        if (!tempFile.exists()) {
            call.reject("الملف غير موجود!");
            return;
        }

        try {
            ContentValues values = new ContentValues();
            String fileName = prefix + System.currentTimeMillis();
            values.put(MediaStore.MediaColumns.TITLE, fileName);
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName + extension);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }

            Uri uri = getContext().getContentResolver().insert(collectionUri, values);

            if (uri != null) {
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri);
                     FileInputStream in = new FileInputStream(tempFile)) {
                    if (out != null) {
                        byte[] buffer = new byte[16384];
                        int len;
                        while ((len = in.read(buffer)) > 0) out.write(buffer, 0, len);
                        out.flush();
                    }
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear();
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(uri, values, null, null);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "تم الحفظ بنجاح!");
                call.resolve(ret);
            } else {
                call.reject("فشل إنشاء مسار.");
            }
        } catch (Exception e) {
            call.reject("خطأ: " + e.getLocalizedMessage());
        }
    }
}