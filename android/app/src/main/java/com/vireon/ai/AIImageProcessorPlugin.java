package com.vireon.ai;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "AIImageProcessor")
public class AIImageProcessorPlugin extends Plugin {

    private static final String TAG = "AIImageProcessor";

    @PluginMethod
    public void removeBackground(PluginCall call) {
        long startTime = System.currentTimeMillis();

        String imagePath = call.getString("filePath");
        if (imagePath == null || imagePath.isEmpty()) {
            imagePath = call.getString("imageUri");
        }
        String base64Data = call.getString("imageBase64");

        boolean refineEdges = call.getBoolean("refineEdges", true);
        int edgeFeather = call.getInt("edgeFeather", 2);

        if ((imagePath == null || imagePath.isEmpty()) && (base64Data == null || base64Data.isEmpty())) {
            call.reject("يجب تقديم مسار الصورة (filePath / imageUri) أو base64.");
            return;
        }

        Bitmap originalBitmap = null;
        Bitmap processedBitmap = null;
        SubjectSegmenter segmenter = null;

        try {
            Context context = getContext();

            // 1. Load Original Bitmap safely
            originalBitmap = loadBitmap(context, imagePath, base64Data);
            if (originalBitmap == null) {
                call.reject("فشل تحميل الصورة المحددة أو الملف تالف.");
                return;
            }

            int originalWidth = originalBitmap.getWidth();
            int originalHeight = originalBitmap.getHeight();

            Log.d(TAG, "Starting Google ML Kit Subject Segmentation on Image [" + originalWidth + "x" + originalHeight + "]");

            // 2. Initialize Google ML Kit Subject Segmenter
            SubjectSegmenterOptions options = new SubjectSegmenterOptions.Builder()
                    .enableForegroundBitmap()
                    .enableForegroundConfidenceMask()
                    .build();

            segmenter = SubjectSegmentation.getClient(options);

            // 3. Prepare InputImage
            InputImage inputImage = InputImage.fromBitmap(originalBitmap, 0);

            // 4. Run Subject Segmentation Inference synchronously with timeout safety
            SubjectSegmentationResult result = Tasks.await(segmenter.process(inputImage), 45, TimeUnit.SECONDS);

            if (result == null) {
                call.reject("Google ML Kit Subject Segmentation لم يُرجع أي نتائج.");
                return;
            }

            FloatBuffer confidenceMaskBuffer = result.getForegroundConfidenceMask();
            Bitmap foregroundBitmap = result.getForegroundBitmap();

            // 5. Post-Processing: Create real RGBA PNG with true Alpha Channel & Edge Refinement
            if (confidenceMaskBuffer != null) {
                confidenceMaskBuffer.rewind();
                processedBitmap = createRefinedCutoutFromMask(originalBitmap, confidenceMaskBuffer, refineEdges, edgeFeather);
            } else if (foregroundBitmap != null) {
                processedBitmap = foregroundBitmap.copy(Bitmap.Config.ARGB_8888, true);
            } else {
                call.reject("لم يتم العثور على أي عنصر أو قناع تفريغ في الصورة.");
                return;
            }

            // 6. Output Verification (Anti-Mock, Alpha Channel & Transparency Validation)
            VerificationMetrics metrics = verifyAlphaOutput(processedBitmap);
            if (!metrics.isValid) {
                call.reject("فشل التحقق من صحة الصورة: لم يتم تفريغ أي خلفية أو القناع غير صالح (" + metrics.reason + ")");
                return;
            }

            // 7. Save output directly to Cache Directory as high-quality transparent PNG
            File cacheDir = context.getCacheDir();
            File outputFile = new File(cacheDir, "vireon_cutout_" + System.currentTimeMillis() + ".png");
            
            try (FileOutputStream fos = new FileOutputStream(outputFile)) {
                processedBitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
                fos.flush();
            }

            long totalTimeMs = System.currentTimeMillis() - startTime;
            Log.d(TAG, "Background removed successfully in " + totalTimeMs + "ms. Saved to: " + outputFile.getAbsolutePath());

            // 8. Return result to Capacitor
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("outputUri", Uri.fromFile(outputFile).toString());
            ret.put("filePath", outputFile.getAbsolutePath());
            ret.put("width", originalWidth);
            ret.put("height", originalHeight);
            ret.put("processingTime", totalTimeMs);
            ret.put("engine", "google-mlkit-subject-segmentation");

            JSObject metricsObj = new JSObject();
            metricsObj.put("transparentPixels", metrics.transparentPixels);
            metricsObj.put("foregroundPixels", metrics.foregroundPixels);
            metricsObj.put("hasAlphaChannel", metrics.hasAlpha);
            ret.put("metrics", metricsObj);

            call.resolve(ret);

        } catch (Exception e) {
            Log.error(TAG, "ML Kit Subject Segmentation Failed", e);
            JSObject errorObj = new JSObject();
            errorObj.put("code", "SEGMENTATION_ERROR");
            errorObj.put("message", e.getMessage() != null ? e.getMessage() : "Unknown segmentation failure");

            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", errorObj);
            call.reject(e.getMessage() != null ? e.getMessage() : "ML Kit Subject Segmentation Failed", e);
        } finally {
            // Clean up native Bitmaps and resources
            if (segmenter != null) {
                try {
                    segmenter.close();
                } catch (Exception ignored) {}
            }
            if (originalBitmap != null && !originalBitmap.isRecycled()) {
                originalBitmap.recycle();
            }
            if (processedBitmap != null && !processedBitmap.isRecycled()) {
                processedBitmap.recycle();
            }
            System.gc();
        }
    }

    /**
     * Loads Bitmap from file path, content URI, or Base64 string
     */
    private Bitmap loadBitmap(Context context, String pathOrUri, String base64) throws Exception {
        if (base64 != null && !base64.isEmpty()) {
            String clean = base64.contains(",") ? base64.split(",")[1] : base64;
            byte[] decoded = Base64.decode(clean, Base64.DEFAULT);
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            opts.inMutable = true;
            return BitmapFactory.decodeByteArray(decoded, 0, decoded.length, opts);
        }

        if (pathOrUri != null) {
            if (pathOrUri.startsWith("file://")) {
                pathOrUri = pathOrUri.substring(7);
            }
            File f = new File(pathOrUri);
            if (f.exists()) {
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
                opts.inMutable = true;
                return BitmapFactory.decodeFile(f.getAbsolutePath(), opts);
            }

            Uri uri = Uri.parse(pathOrUri);
            try (InputStream is = context.getContentResolver().openInputStream(uri)) {
                if (is != null) {
                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    opts.inMutable = true;
                    return BitmapFactory.decodeStream(is, null, opts);
                }
            }
        }

        return null;
    }

    /**
     * Creates a high-fidelity cutout PNG applying confidence mask, edge feathering, smoothing & anti-aliasing
     */
    private Bitmap createRefinedCutoutFromMask(Bitmap source, FloatBuffer maskBuffer, boolean refineEdges, int feather) {
        int width = source.getWidth();
        int height = source.getHeight();

        int[] pixels = new int[width * height];
        source.getPixels(pixels, 0, width, 0, 0, width, height);

        float[] rawMask = new float[width * height];
        maskBuffer.get(rawMask);

        float[] refinedMask = rawMask;

        // Post-Processing: Edge Smoothing & Feathering on Mask
        if (refineEdges && feather > 0) {
            refinedMask = applyBoxBlurMask(rawMask, width, height, feather);
        }

        // Apply Alpha Channel to Original Pixels
        for (int i = 0; i < pixels.length; i++) {
            float confidence = refinedMask[i];
            
            // Non-linear sigmoid sharpening for hair and edge preservation
            float alphaFactor;
            if (confidence < 0.25f) {
                alphaFactor = 0f; // clean background
            } else if (confidence > 0.85f) {
                alphaFactor = 1f; // solid foreground
            } else {
                // Smooth transition in boundary region
                alphaFactor = (confidence - 0.25f) / 0.60f;
            }

            int alpha = Math.min(255, Math.max(0, Math.round(alphaFactor * 255)));

            int color = pixels[i];
            int r = Color.red(color);
            int g = Color.green(color);
            int b = Color.blue(color);

            pixels[i] = Color.argb(alpha, r, g, b);
        }

        Bitmap result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        result.setPixels(pixels, 0, width, 0, 0, width, height);
        return result;
    }

    /**
     * Fast 1D Box Blur pass on mask to soften boundaries and eliminate jagged aliasing
     */
    private float[] applyBoxBlurMask(float[] mask, int width, int height, int radius) {
        float[] temp = new float[mask.length];
        float[] out = new float[mask.length];

        // Horizontal Pass
        for (int y = 0; y < height; y++) {
            int rowStart = y * width;
            for (int x = 0; x < width; x++) {
                float sum = 0;
                int count = 0;
                for (int dx = -radius; dx <= radius; dx++) {
                    int nx = x + dx;
                    if (nx >= 0 && nx < width) {
                        sum += mask[rowStart + nx];
                        count++;
                    }
                }
                temp[rowStart + x] = sum / count;
            }
        }

        // Vertical Pass
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                float sum = 0;
                int count = 0;
                for (int dy = -radius; dy <= radius; dy++) {
                    int ny = y + dy;
                    if (ny >= 0 && ny < height) {
                        sum += temp[ny * width + x];
                        count++;
                    }
                }
                out[y * width + x] = sum / count;
            }
        }

        return out;
    }

    /**
     * Strict Verification of Alpha Channel
     */
    private static class VerificationMetrics {
        boolean isValid;
        boolean hasAlpha;
        int transparentPixels;
        int foregroundPixels;
        String reason = "";
    }

    private VerificationMetrics verifyAlphaOutput(Bitmap bitmap) {
        VerificationMetrics m = new VerificationMetrics();
        if (bitmap == null) {
            m.isValid = false;
            m.reason = "Bitmap is null";
            return m;
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int total = width * height;

        int[] sample = new int[Math.min(total, 50000)];
        int step = Math.max(1, total / sample.length);

        int sampleIndex = 0;
        int transparent = 0;
        int foreground = 0;

        for (int i = 0; i < total && sampleIndex < sample.length; i += step) {
            int x = i % width;
            int y = i / width;
            int pixel = bitmap.getPixel(x, y);
            int alpha = Color.alpha(pixel);

            if (alpha < 30) {
                transparent++;
            } else if (alpha > 200) {
                foreground++;
            }
            sampleIndex++;
        }

        m.transparentPixels = (int) (((double) transparent / sampleIndex) * total);
        m.foregroundPixels = (int) (((double) foreground / sampleIndex) * total);
        m.hasAlpha = transparent > 0;

        if (transparent == 0) {
            m.isValid = false;
            m.reason = "No transparent pixels detected (solid image)";
        } else if (foreground == 0) {
            m.isValid = false;
            m.reason = "No foreground pixels detected (completely empty image)";
        } else {
            m.isValid = true;
        }

        return m;
    }
}
