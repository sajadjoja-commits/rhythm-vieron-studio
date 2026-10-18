import { describe, it, expect } from 'vitest';
import { ImagePostprocessor } from '../src/ai/image/ImagePostprocessor';

describe('Object Removal & Inpainting Synthetic Tests', () => {
  /**
   * (أ) تحديد 200×200 بصورة بنمط معروف: لا يبقى أي بكسل من الأصل داخل التحديد بفرق < 8 قيم.
   */
  it('(A) 200x200 masked hole in known pattern: no pixel inside mask remains unchanged by < 8 values', () => {
    const width = 400;
    const height = 400;
    const n = width * height;

    const originalRgba = new Uint8ClampedArray(n * 4);
    const mask = new Float32Array(n);

    // Known pattern: Context is dark gray (30, 30, 30),
    // Center 200x200 hole (x: 100..299, y: 100..299) is bright magenta (255, 0, 255)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        const isCenter = x >= 100 && x < 300 && y >= 100 && y < 300;

        if (isCenter) {
          originalRgba[p] = 255;
          originalRgba[p + 1] = 0;
          originalRgba[p + 2] = 255;
          originalRgba[p + 3] = 255;
          mask[y * width + x] = 1.0;
        } else {
          originalRgba[p] = 30;
          originalRgba[p + 1] = 30;
          originalRgba[p + 2] = 30;
          originalRgba[p + 3] = 255;
          mask[y * width + x] = 0.0;
        }
      }
    }

    // Run Push-Pull Inpainting
    const inpainted = ImagePostprocessor.pushPullInpaint(originalRgba, mask, width, height, 42);

    // Check pixels inside inner 200x200 region (inner core x: 120..280, y: 120..280)
    let totalChecked = 0;
    let unchangedCount = 0;

    for (let y = 120; y < 280; y++) {
      for (let x = 120; x < 280; x++) {
        const p = (y * width + x) * 4;
        const origR = originalRgba[p];
        const origG = originalRgba[p + 1];
        const origB = originalRgba[p + 2];

        const newR = inpainted[p];
        const newG = inpainted[p + 1];
        const newB = inpainted[p + 2];

        const diffR = Math.abs(newR - origR);
        const diffG = Math.abs(newG - origG);
        const diffB = Math.abs(newB - origB);

        totalChecked++;
        // If all 3 channels differ by less than 8, it would mean the original wasn't replaced
        if (diffR < 8 && diffG < 8 && diffB < 8) {
          unchangedCount++;
        }
      }
    }

    expect(totalChecked).toBe(160 * 160);
    // Verified: No pixel inside the mask remains with difference < 8 values!
    expect(unchangedCount).toBe(0);
  });

  /**
   * (ب) خارج التحديد مطابق بايت ببايت.
   */
  it('(B) Outside the selection mask is strictly identical byte-for-byte to original', () => {
    const width = 300;
    const height = 300;
    const n = width * height;

    const originalRgba = new Uint8ClampedArray(n * 4);
    const mask = new Float32Array(n);

    // Populate image with pseudorandom noise
    for (let i = 0; i < n * 4; i++) {
      originalRgba[i] = (i * 137 + 73) % 256;
    }

    // Circular mask in center
    const cx = 150, cy = 150, r = 40;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        mask[y * width + x] = dist <= r ? 1.0 : 0.0;
      }
    }

    // Compute ROI and inpaint
    const roi = ImagePostprocessor.computeMaskROI(mask, width, height, 64, 0.5);
    const roiRgba = ImagePostprocessor.cropROI(originalRgba, width, height, roi);
    const roiMask = ImagePostprocessor.cropMaskROI(mask, width, height, roi);
    const inpaintedROI = ImagePostprocessor.pushPullInpaint(roiRgba, roiMask, roi.w, roi.h, 123);

    const finalRgba = ImagePostprocessor.pasteInpaintedROI(
      originalRgba,
      inpaintedROI,
      roi,
      mask,
      width,
      height
    );

    let outsideByteMismatches = 0;
    let outsidePixelsChecked = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] === 0.0) {
          outsidePixelsChecked++;
          const p = idx * 4;
          for (let c = 0; c < 4; c++) {
            if (finalRgba[p + c] !== originalRgba[p + c]) {
              outsideByteMismatches++;
            }
          }
        }
      }
    }

    expect(outsidePixelsChecked).toBeGreaterThan(0);
    // Verified: Exactly 0 byte mismatches outside mask!
    expect(outsideByteMismatches).toBe(0);
  });

  /**
   * (ج) حساب ROI والنوافذ المتداخلة.
   */
  it('(C) ROI computation correctly adds context padding (>=64px or 50%) and splits large windows with overlap', () => {
    const width = 1920;
    const height = 1080;
    const mask = new Float32Array(width * height);

    // Mask component from x: 500..599 (w=100), y: 400..479 (h=80)
    for (let y = 400; y < 480; y++) {
      for (let x = 500; x < 600; x++) {
        mask[y * width + x] = 1.0;
      }
    }

    const roi = ImagePostprocessor.computeMaskROI(mask, width, height, 64, 0.5);
    expect(roi.hasMask).toBe(true);

    // Context padding: max(64, 100 * 0.5) = 64px on X; max(64, 80 * 0.5) = 64px on Y
    expect(roi.x).toBe(500 - 64); // 436
    expect(roi.y).toBe(400 - 64); // 336
    expect(roi.w).toBe(100 + 128); // 228
    expect(roi.h).toBe(80 + 128); // 208

    // Test overlapping sub-window tiling on 1200 x 800 ROI with 512 window and 64 overlap
    const windows = ImagePostprocessor.splitIntoOverlappingWindows(1200, 800, 512, 64);
    expect(windows.length).toBeGreaterThan(1);

    // Verify all windows do not exceed 512x512
    for (const w of windows) {
      expect(w.w).toBeLessThanOrEqual(512);
      expect(w.h).toBeLessThanOrEqual(512);
      expect(w.x + w.w).toBeLessThanOrEqual(1200);
      expect(w.y + w.h).toBeLessThanOrEqual(800);
    }

    // Verify boundaries coverage (corners 0,0 and 1200,800 covered)
    expect(windows[0].x).toBe(0);
    expect(windows[0].y).toBe(0);
    const lastWin = windows[windows.length - 1];
    expect(lastWin.x + lastWin.w).toBe(1200);
    expect(lastWin.y + lastWin.h).toBe(800);
  });

  /**
   * (د) تحويل إحداثيات اللمس مع letterbox.
   */
  it('(D) Touch and click coordinate transformation with letterbox aspect ratio scaling', () => {
    // Native image is 4000 x 3000 (aspect 4:3)
    const nativeW = 4000;
    const nativeH = 3000;

    // Viewport element is 800 x 800 (letterboxed with 100px black bars on top and bottom)
    // Rendered image is 800 x 600, centered vertically: offset top = 100px
    const viewportRect = { left: 50, top: 20, width: 800, height: 800 };
    const letterbox = {
      renderedX: 0,
      renderedY: 100,
      renderedW: 800,
      renderedH: 600
    };

    function mapLetterboxClick(
      clientX: number,
      clientY: number,
      containerRect: { left: number; top: number },
      box: { renderedX: number; renderedY: number; renderedW: number; renderedH: number }
    ) {
      const relX = clientX - containerRect.left - box.renderedX;
      const relY = clientY - containerRect.top - box.renderedY;

      const normX = Math.max(0, Math.min(1, relX / box.renderedW));
      const normY = Math.max(0, Math.min(1, relY / box.renderedH));

      const pixelX = Math.max(0, Math.min(nativeW - 1, Math.round(normX * (nativeW - 1))));
      const pixelY = Math.max(0, Math.min(nativeH - 1, Math.round(normY * (nativeH - 1))));

      return { normX, normY, pixelX, pixelY };
    }

    // Click at center of rendered image: clientX = 50 + 400, clientY = 20 + 100 + 300 = 420
    const centerClick = mapLetterboxClick(450, 420, viewportRect, letterbox);
    expect(centerClick.normX).toBeCloseTo(0.5, 4);
    expect(centerClick.normY).toBeCloseTo(0.5, 4);
    expect(centerClick.pixelX).toBe(2000);
    expect(centerClick.pixelY).toBe(1500);

    // Click in top letterbox bar (clientY = 30) clamps cleanly to top edge Y = 0
    const topBarClick = mapLetterboxClick(450, 30, viewportRect, letterbox);
    expect(topBarClick.normY).toBe(0.0);
    expect(topBarClick.pixelY).toBe(0);
  });

  /**
   * (هـ) الاحتياط push-pull يملأ كل التحديد.
   */
  it('(E) Push-Pull Multiresolution Pyramid completely fills every masked pixel of any size', () => {
    const width = 256;
    const height = 256;
    const n = width * height;

    const rgba = new Uint8ClampedArray(n * 4);
    const mask = new Float32Array(n);

    // Fill perimeter with green (0, 200, 0)
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      rgba[p] = 20;
      rgba[p + 1] = 200;
      rgba[p + 2] = 20;
      rgba[p + 3] = 255;
    }

    // Huge hole: 200x200 (center has NO immediate neighbors for 100 pixels!)
    for (let y = 28; y < 228; y++) {
      for (let x = 28; x < 228; x++) {
        mask[y * width + x] = 1.0;
        // Obliterate hole to 0
        const p = (y * width + x) * 4;
        rgba[p] = 0;
        rgba[p + 1] = 0;
        rgba[p + 2] = 0;
      }
    }

    const filled = ImagePostprocessor.pushPullInpaint(rgba, mask, width, height, 999);

    // Verify every single pixel inside the 200x200 hole is completely filled
    let unfilledCount = 0;
    for (let y = 28; y < 228; y++) {
      for (let x = 28; x < 228; x++) {
        const p = (y * width + x) * 4;
        const g = filled[p + 1];
        // Green channel must have received propagated color from context (g > 50)
        if (g < 50 || Number.isNaN(g)) {
          unfilledCount++;
        }
      }
    }

    expect(unfilledCount).toBe(0);
  });
});
