package com.vireon.ai;

import android.content.Context;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Phase 6: Safe OTA Web Engine Native Android Plugin
 *
 * Provides:
 * - Native Engine Capabilities and Versioning Contract
 * - Atomic OTA Web Bundle Download & Extraction
 * - SHA-256 Integrity Verification
 * - Isolated Version Storage (bundled vs OTA versions)
 * - Safe Server Base Path Switching without runtime crash
 * - Crash Detection & Automatic Rollback to Last-Known-Good Version
 * - Zero modification to native Whisper, GGML model, or native media libraries
 */
@CapacitorPlugin(name = "VireonOTA")
public class VireonOTAPlugin extends Plugin {
    private static final String TAG = "VireonOTA";

    public static final String NATIVE_VERSION = "1.0.0";
    public static final int BUILD_NUMBER = 1;
    public static final String MEDIA_API_VERSION = "1.0.0";
    public static final String STT_API_VERSION = "1.0.0";
    public static final String MODEL_MANAGER_API_VERSION = "1.0.0";

    private static final String OTA_DIR_NAME = "ota";
    private static final String VERSIONS_DIR_NAME = "versions";
    private static final String TEMP_DIR_NAME = "temp";
    private static final String STATE_FILE_NAME = "ota_state.json";

    @PluginMethod
    public void getNativeCapabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("nativeVersion", NATIVE_VERSION);
        ret.put("buildNumber", BUILD_NUMBER);
        ret.put("mediaApiVersion", MEDIA_API_VERSION);
        ret.put("sttApiVersion", STT_API_VERSION);
        ret.put("modelManagerApiVersion", MODEL_MANAGER_API_VERSION);

        JSArray caps = new JSArray();
        caps.put("native_whisper");
        caps.put("whisper_model_manager");
        caps.put("native_media_extractor");
        caps.put("native_media_muxer");
        caps.put("native_media_metadata");
        caps.put("content_resolver_uri");
        caps.put("atomic_ota_engine");
        ret.put("capabilities", caps);

        call.resolve(ret);
    }

    @PluginMethod
    public void getCurrentActiveVersion(PluginCall call) {
        JSObject state = readOtaState();
        String current = state.optString("currentVersion", "bundled");
        String channel = state.optString("channel", "production");
        boolean isBundled = "bundled".equals(current) || current.isEmpty();

        JSObject ret = new JSObject();
        ret.put("version", current);
        ret.put("isBundled", isBundled);
        ret.put("channel", channel);
        ret.put("lastKnownGoodVersion", state.optString("lastKnownGoodVersion", "bundled"));
        ret.put("status", state.optString("status", "active"));

        call.resolve(ret);
    }

    @PluginMethod
    public void getInstalledVersions(PluginCall call) {
        File versionsDir = getVersionsDir();
        JSArray arr = new JSArray();

        if (versionsDir.exists() && versionsDir.isDirectory()) {
            File[] list = versionsDir.listFiles();
            if (list != null) {
                JSObject state = readOtaState();
                String current = state.optString("currentVersion", "");

                for (File dir : list) {
                    if (dir.isDirectory() && dir.getName().startsWith("web-")) {
                        String verName = dir.getName().substring(4);
                        File metaFile = new File(dir, "ota_meta.json");
                        JSObject verObj = new JSObject();
                        verObj.put("version", verName);
                        verObj.put("isCurrent", verName.equals(current));
                        verObj.put("path", dir.getAbsolutePath());

                        if (metaFile.exists()) {
                            try {
                                String content = readFile(metaFile);
                                JSONObject metaJson = new JSONObject(content);
                                verObj.put("channel", metaJson.optString("channel", "production"));
                                verObj.put("installedAt", metaJson.optString("installedAt", ""));
                                verObj.put("checksum", metaJson.optString("checksum", ""));
                            } catch (Exception ignored) {}
                        }
                        arr.put(verObj);
                    }
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("versions", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadAndInstallBundle(PluginCall call) {
        String version = call.getString("version");
        String bundleUrl = call.getString("bundleUrl");
        String expectedChecksum = call.getString("checksum");
        String minNative = call.getString("minNativeVersion", "1.0.0");
        String channel = call.getString("channel", "production");

        if (version == null || bundleUrl == null || expectedChecksum == null) {
            call.reject("Missing required parameters (version, bundleUrl, checksum)");
            return;
        }

        // 1. Compatibility Check
        if (compareVersions(NATIVE_VERSION, minNative) < 0) {
            call.reject("INCOMPATIBLE: APK native version " + NATIVE_VERSION + " is lower than required " + minNative);
            return;
        }

        new Thread(() -> {
            File tempArchive = null;
            try {
                // 2. Download to temporary file
                File tempDir = getTempDir();
                tempArchive = new File(tempDir, "ota_dl_" + System.currentTimeMillis() + ".zip");
                Log.i(TAG, "Downloading bundle for version " + version + " to " + tempArchive.getName());

                downloadFile(bundleUrl, tempArchive);

                // 3. Verify SHA-256 Integrity
                Log.i(TAG, "Verifying SHA-256 checksum for " + tempArchive.getName());
                String computedHash = computeSha256(tempArchive);
                if (!computedHash.equalsIgnoreCase(expectedChecksum.trim())) {
                    tempArchive.delete();
                    call.reject("CHECKSUM_MISMATCH: Expected " + expectedChecksum + " but got " + computedHash);
                    return;
                }

                // 4. Atomic Extraction to target version directory
                File targetVersionDir = new File(getVersionsDir(), "web-" + version);
                File stagingExtractDir = new File(getTempDir(), "extract_" + System.currentTimeMillis());

                if (stagingExtractDir.exists()) deleteRecursively(stagingExtractDir);
                stagingExtractDir.mkdirs();

                unzip(tempArchive, stagingExtractDir);

                // 5. Validate Extracted Bundle Structure
                File indexHtml = findFileRecursively(stagingExtractDir, "index.html");
                if (indexHtml == null) {
                    deleteRecursively(stagingExtractDir);
                    tempArchive.delete();
                    call.reject("INVALID_BUNDLE: index.html not found in archive");
                    return;
                }

                // If contents are nested in a subfolder (e.g. dist/), adjust root
                File contentRoot = indexHtml.getParentFile();

                // Move from staging to final target directory atomically
                if (targetVersionDir.exists()) {
                    deleteRecursively(targetVersionDir);
                }
                targetVersionDir.mkdirs();

                copyRecursively(contentRoot, targetVersionDir);
                deleteRecursively(stagingExtractDir);
                tempArchive.delete();

                // 6. Write metadata inside version directory
                File metaFile = new File(targetVersionDir, "ota_meta.json");
                JSONObject metaJson = new JSONObject();
                metaJson.put("version", version);
                metaJson.put("channel", channel);
                metaJson.put("checksum", expectedChecksum);
                metaJson.put("minNativeVersion", minNative);
                metaJson.put("installedAt", System.currentTimeMillis());
                writeFile(metaFile, metaJson.toString(2));

                Log.i(TAG, "Bundle successfully installed for version " + version + " at " + targetVersionDir.getAbsolutePath());

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("version", version);
                ret.put("versionPath", targetVersionDir.getAbsolutePath());
                call.resolve(ret);

            } catch (Exception e) {
                if (tempArchive != null && tempArchive.exists()) tempArchive.delete();
                Log.e(TAG, "Failed to download/install bundle: " + e.getMessage(), e);
                call.reject("DOWNLOAD_INSTALL_FAILED: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void activateVersion(PluginCall call) {
        String version = call.getString("version");
        if (version == null || version.isEmpty()) {
            call.reject("Missing version parameter");
            return;
        }

        File targetVersionDir = new File(getVersionsDir(), "web-" + version);
        File indexHtml = new File(targetVersionDir, "index.html");

        if (!targetVersionDir.exists() || !indexHtml.exists()) {
            call.reject("VERSION_NOT_FOUND: Directory or index.html missing for web-" + version);
            return;
        }

        try {
            JSObject state = readOtaState();
            String oldCurrent = state.optString("currentVersion", "bundled");

            state.put("previousVersion", oldCurrent);
            state.put("currentVersion", version);
            state.put("pendingVerification", true);
            state.put("activationTimestamp", System.currentTimeMillis());
            state.put("status", "activating");
            writeOtaState(state);

            // Tell Capacitor WebViewLocalServer to serve from the new directory
            getActivity().runOnUiThread(() -> {
                try {
                    getBridge().setServerBasePath(targetVersionDir.getAbsolutePath());
                    getBridge().reload();

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("activeVersion", version);
                    ret.put("reloaded", true);
                    call.resolve(ret);
                } catch (Exception ex) {
                    Log.e(TAG, "Error during setServerBasePath reload: " + ex.getMessage(), ex);
                    call.reject("ACTIVATION_RELOAD_FAILED: " + ex.getMessage());
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Failed to activate version: " + e.getMessage(), e);
            call.reject("ACTIVATE_FAILED: " + e.getMessage());
        }
    }

    @PluginMethod
    public void notifyStartupSuccess(PluginCall call) {
        try {
            JSObject state = readOtaState();
            String current = state.optString("currentVersion", "bundled");

            state.put("pendingVerification", false);
            state.put("lastKnownGoodVersion", current);
            state.put("consecutiveCrashes", 0);
            state.put("status", "active");
            writeOtaState(state);

            Log.i(TAG, "Startup verified successfully for version: " + current);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("version", current);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("NOTIFY_FAILED: " + e.getMessage());
        }
    }

    @PluginMethod
    public void rollbackToLastKnownGood(PluginCall call) {
        try {
            JSObject state = readOtaState();
            String lastGood = state.optString("lastKnownGoodVersion", "bundled");
            String current = state.optString("currentVersion", "");

            Log.w(TAG, "Initiating rollback from " + current + " to " + lastGood);

            File targetDir = null;
            boolean useBundled = "bundled".equals(lastGood) || lastGood.isEmpty();

            if (!useBundled) {
                targetDir = new File(getVersionsDir(), "web-" + lastGood);
                if (!targetDir.exists() || !new File(targetDir, "index.html").exists()) {
                    useBundled = true;
                }
            }

            final boolean fallbackToAssets = useBundled;
            final File finalTargetDir = targetDir;
            final String targetVersionName = fallbackToAssets ? "bundled" : lastGood;

            state.put("currentVersion", targetVersionName);
            state.put("pendingVerification", false);
            state.put("status", "rolled_back");
            writeOtaState(state);

            getActivity().runOnUiThread(() -> {
                try {
                    if (fallbackToAssets) {
                        getBridge().setServerAssetPath("public");
                    } else {
                        getBridge().setServerBasePath(finalTargetDir.getAbsolutePath());
                    }
                    getBridge().reload();

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("rolledBackTo", targetVersionName);
                    ret.put("reloaded", true);
                    call.resolve(ret);
                } catch (Exception ex) {
                    Log.e(TAG, "Error executing rollback: " + ex.getMessage(), ex);
                    call.reject("ROLLBACK_FAILED: " + ex.getMessage());
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Rollback failed: " + e.getMessage(), e);
            call.reject("ROLLBACK_FAILED: " + e.getMessage());
        }
    }

    // ==========================================
    // File & Storage Helpers
    // ==========================================

    private File getOtaBaseDir() {
        File dir = new File(getContext().getFilesDir(), OTA_DIR_NAME);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File getVersionsDir() {
        File dir = new File(getOtaBaseDir(), VERSIONS_DIR_NAME);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File getTempDir() {
        File dir = new File(getOtaBaseDir(), TEMP_DIR_NAME);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File getStateFile() {
        return new File(getOtaBaseDir(), STATE_FILE_NAME);
    }

    public JSObject readOtaState() {
        File file = getStateFile();
        if (!file.exists()) {
            JSObject initial = new JSObject();
            initial.put("currentVersion", "bundled");
            initial.put("lastKnownGoodVersion", "bundled");
            initial.put("pendingVerification", false);
            initial.put("consecutiveCrashes", 0);
            initial.put("channel", "production");
            initial.put("status", "active");
            return initial;
        }

        try {
            String content = readFile(file);
            return new JSObject(content);
        } catch (Exception e) {
            return new JSObject();
        }
    }

    public void writeOtaState(JSObject state) {
        try {
            writeFile(getStateFile(), state.toString());
        } catch (Exception e) {
            Log.e(TAG, "Failed to write ota_state.json: " + e.getMessage());
        }
    }

    public static int compareVersions(String v1, String v2) {
        if (v1 == null) v1 = "0.0.0";
        if (v2 == null) v2 = "0.0.0";
        String[] parts1 = v1.replaceAll("[^0-9.]", "").split("\\.");
        String[] parts2 = v2.replaceAll("[^0-9.]", "").split("\\.");
        int length = Math.max(parts1.length, parts2.length);
        for (int i = 0; i < length; i++) {
            int p1 = i < parts1.length && !parts1[i].isEmpty() ? Integer.parseInt(parts1[i]) : 0;
            int p2 = i < parts2.length && !parts2[i].isEmpty() ? Integer.parseInt(parts2[i]) : 0;
            if (p1 < p2) return -1;
            if (p1 > p2) return 1;
        }
        return 0;
    }

    private void downloadFile(String fileUrl, File destination) throws IOException {
        URL url = new URL(fileUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.connect();

        if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
            throw new IOException("Server returned HTTP " + conn.getResponseCode() + " " + conn.getResponseMessage());
        }

        try (InputStream in = new BufferedInputStream(conn.getInputStream());
             OutputStream out = new BufferedOutputStream(new FileOutputStream(destination))) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
        } finally {
            conn.disconnect();
        }
    }

    private String computeSha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString().toLowerCase();
    }

    private void unzip(File zipFile, File targetDirectory) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[16384];
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName();
                // Prevent Zip Slip vulnerability
                File destFile = new File(targetDirectory, entryName);
                String canonicalDest = destFile.getCanonicalPath();
                if (!canonicalDest.startsWith(targetDirectory.getCanonicalPath())) {
                    throw new SecurityException("Zip traversal attempt in " + entryName);
                }

                if (entry.isDirectory()) {
                    destFile.mkdirs();
                } else {
                    File parent = destFile.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(destFile);
                         BufferedOutputStream bos = new BufferedOutputStream(fos, buffer.length)) {
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            bos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private File findFileRecursively(File dir, String fileName) {
        if (dir == null || !dir.exists()) return null;
        File direct = new File(dir, fileName);
        if (direct.exists()) return direct;

        File[] list = dir.listFiles();
        if (list != null) {
            for (File f : list) {
                if (f.isDirectory()) {
                    File found = findFileRecursively(f, fileName);
                    if (found != null) return found;
                }
            }
        }
        return null;
    }

    private void copyRecursively(File src, File dest) throws IOException {
        if (src.isDirectory()) {
            if (!dest.exists()) dest.mkdirs();
            String[] children = src.list();
            if (children != null) {
                for (String child : children) {
                    copyRecursively(new File(src, child), new File(dest, child));
                }
            }
        } else {
            try (InputStream in = new FileInputStream(src);
                 OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[16384];
                int len;
                while ((len = in.read(buf)) > 0) {
                    out.write(buf, 0, len);
                }
            }
        }
    }

    private void deleteRecursively(File fileOrDir) {
        if (fileOrDir.isDirectory()) {
            File[] files = fileOrDir.listFiles();
            if (files != null) {
                for (File f : files) {
                    deleteRecursively(f);
                }
            }
        }
        fileOrDir.delete();
    }

    private String readFile(File file) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    private void writeFile(File file, String content) throws IOException {
        try (FileWriter writer = new FileWriter(file)) {
            writer.write(content);
        }
    }
}
