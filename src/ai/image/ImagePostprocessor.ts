/**
 * ImagePostprocessor: High-resolution mask refinement, Guided Filter, and Color Decontamination.
 * 
 * Complies with requirement 4:
 * - Upscales mask to original resolution (up to 4096px longest edge).
 * - Runs Guided Filter using the original image as guide to recover sharp edges.
 * - Applies color decontamination to remove background color bleeding along edges.
 * - Forbids keeping 256x256 simple bilinear masks.
 */

export interface GuidedFilterOptions {
  radius?: number; // Filter box radius (default 8)
  eps?: number;    // Regularization parameter (default 1e-4)
}

export class ImagePostprocessor {
  /**
   * Fast 1D horizontal moving-sum box filter
   */
  private static boxFilterH(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
    const invCount = 1 / (2 * r + 1);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      let sum = 0;

      // Initialize window with border replication
      for (let x = -r; x <= r; x++) {
        const clampedX = Math.max(0, Math.min(width - 1, x));
        sum += src[rowOffset + clampedX];
      }

      for (let x = 0; x < width; x++) {
        dst[rowOffset + x] = sum * invCount;
        const leftX = Math.max(0, x - r);
        const rightX = Math.min(width - 1, x + r + 1);
        sum += src[rowOffset + rightX] - src[rowOffset + leftX];
      }
    }
  }

  /**
   * Fast 1D vertical moving-sum box filter
   */
  private static boxFilterV(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
    const invCount = 1 / (2 * r + 1);
    for (let x = 0; x < width; x++) {
      let sum = 0;

      // Initialize window with border replication
      for (let y = -r; y <= r; y++) {
        const clampedY = Math.max(0, Math.min(height - 1, y));
        sum += src[clampedY * width + x];
      }

      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum * invCount;
        const topY = Math.max(0, y - r);
        const bottomY = Math.min(height - 1, y + r + 1);
        sum += src[bottomY * width + x] - src[topY * width + x];
      }
    }
  }

  /**
   * Separable 2D Box Filter: O(N) independent of radius
   */
  public static boxFilter(src: Float32Array, width: number, height: number, radius: number): Float32Array {
    const temp = new Float32Array(width * height);
    const result = new Float32Array(width * height);
    ImagePostprocessor.boxFilterH(src, temp, width, height, radius);
    ImagePostprocessor.boxFilterV(temp, result, width, height, radius);
    return result;
  }

  /**
   * Guided Filter: Uses high-resolution original image as guide to transfer sharp details to mask.
   * 
   * @param guideLuma Normalized luminance (0.0 to 1.0) of original high-res image [width * height]
   * @param coarseMask Coarse mask scaled to [width * height], values 0.0 to 1.0
   * @param width Width of the high-res target image
   * @param height Height of the high-res target image
   * @param options Guided filter options (radius and eps)
   */
  public static guidedFilter(
    guideLuma: Float32Array,
    coarseMask: Float32Array,
    width: number,
    height: number,
    options?: GuidedFilterOptions
  ): Float32Array {
    const r = Math.max(2, options?.radius ?? 8);
    const eps = Math.max(1e-6, options?.eps ?? 1e-4);
    const n = width * height;

    // 1. Mean of I (guide) and p (coarse mask)
    const meanI = ImagePostprocessor.boxFilter(guideLuma, width, height, r);
    const meanP = ImagePostprocessor.boxFilter(coarseMask, width, height, r);

    // 2. Correlation of I*I and I*p
    const II = new Float32Array(n);
    const Ip = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      II[i] = guideLuma[i] * guideLuma[i];
      Ip[i] = guideLuma[i] * coarseMask[i];
    }
    const corrI = ImagePostprocessor.boxFilter(II, width, height, r);
    const corrIp = ImagePostprocessor.boxFilter(Ip, width, height, r);

    // 3. Variance and Covariance
    // a = cov / (var + eps)
    // b = meanP - a * meanI
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const varI = Math.max(0, corrI[i] - meanI[i] * meanI[i]);
      const covIp = corrIp[i] - meanI[i] * meanP[i];
      const aVal = covIp / (varI + eps);
      a[i] = aVal;
      b[i] = meanP[i] - aVal * meanI[i];
    }

    // 4. Mean of a and b
    const meanA = ImagePostprocessor.boxFilter(a, width, height, r);
    const meanB = ImagePostprocessor.boxFilter(b, width, height, r);

    // 5. Final output q = meanA * guideLuma + meanB (clamped to [0, 1])
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const val = meanA[i] * guideLuma[i] + meanB[i];
      q[i] = val < 0 ? 0 : val > 1 ? 1 : val;
    }

    return q;
  }

  /**
   * Bilinear upscale of a low-res mask (e.g. 256x256) to target dimensions (e.g. 4000x3000)
   */
  public static upscaleMaskBilinear(
    lowResMask: Float32Array,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number
  ): Float32Array {
    const output = new Float32Array(dstW * dstH);
    const scaleX = (srcW - 1) / Math.max(1, dstW - 1);
    const scaleY = (srcH - 1) / Math.max(1, dstH - 1);

    for (let y = 0; y < dstH; y++) {
      const srcY = y * scaleY;
      const y0 = Math.floor(srcY);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const dy = srcY - y0;
      const rowOffsetDst = y * dstW;
      const rowOffsetSrc0 = y0 * srcW;
      const rowOffsetSrc1 = y1 * srcW;

      for (let x = 0; x < dstW; x++) {
        const srcX = x * scaleX;
        const x0 = Math.floor(srcX);
        const x1 = Math.min(srcW - 1, x0 + 1);
        const dx = srcX - x0;

        const p00 = lowResMask[rowOffsetSrc0 + x0];
        const p10 = lowResMask[rowOffsetSrc0 + x1];
        const p01 = lowResMask[rowOffsetSrc1 + x0];
        const p11 = lowResMask[rowOffsetSrc1 + x1];

        const top = p00 + (p10 - p00) * dx;
        const bottom = p01 + (p11 - p01) * dx;
        output[rowOffsetDst + x] = top + (bottom - top) * dy;
      }
    }

    return output;
  }

  /**
   * Color Decontamination:
   * Eliminates edge background bleed (color fringing on hair/edges) by projecting
   * true foreground colors into translucent transition pixels.
   * 
   * @param rgba Original RGBA Uint8ClampedArray of image
   * @param mask Float32Array alpha mask [0..1]
   * @param width Image width
   * @param height Image height
   */
  public static decontaminate(
    rgba: Uint8ClampedArray,
    mask: Float32Array,
    width: number,
    height: number
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(rgba);
    const n = width * height;

    // Detect transition / edge pixels where alpha is between 0.05 and 0.95
    // For these pixels, search a small neighborhood (3x3 or 5x5) for high-confidence foreground pixels (alpha >= 0.95)
    // and blend their RGB color to cancel out background color bleeding.
    const searchR = 3;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x;
        const alpha = mask[idx];

        // Only decontaminate transition edge pixels
        if (alpha > 0.05 && alpha < 0.95) {
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let weightSum = 0;

          const yMin = Math.max(0, y - searchR);
          const yMax = Math.min(height - 1, y + searchR);
          const xMin = Math.max(0, x - searchR);
          const xMax = Math.min(width - 1, x + searchR);

          for (let ny = yMin; ny <= yMax; ny++) {
            const nRow = ny * width;
            for (let nx = xMin; nx <= xMax; nx++) {
              const nIdx = nRow + nx;
              const nAlpha = mask[nIdx];
              if (nAlpha >= 0.90) {
                const distSq = (nx - x) * (nx - x) + (ny - y) * (ny - y);
                const w = 1 / (1 + distSq);
                const p = nIdx * 4;
                sumR += rgba[p] * w;
                sumG += rgba[p + 1] * w;
                sumB += rgba[p + 2] * w;
                weightSum += w;
              }
            }
          }

          const pIdx = idx * 4;
          if (weightSum > 0) {
            // Found nearby pure foreground color
            const fgR = sumR / weightSum;
            const fgG = sumG / weightSum;
            const fgB = sumB / weightSum;

            // Blend observed color towards foreground color based on softness
            const factor = 1 - alpha; // more weight to correction when alpha is lower
            result[pIdx] = Math.round(rgba[pIdx] * alpha + fgR * factor);
            result[pIdx + 1] = Math.round(rgba[pIdx + 1] * alpha + fgG * factor);
            result[pIdx + 2] = Math.round(rgba[pIdx + 2] * alpha + fgB * factor);
          }
          // Set alpha channel directly in RGBA array
          result[pIdx + 3] = Math.round(alpha * 255);
        } else if (alpha <= 0.05) {
          result[idx * 4 + 3] = 0;
        } else {
          result[idx * 4 + 3] = 255;
        }
      }
    }

    return result;
  }

  /**
   * Extract luminance buffer from RGBA for the guided filter
   */
  public static extractLuminance(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
    const n = width * height;
    const luma = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      // Standard Rec. 709 luminance weights
      luma[i] = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255.0;
    }
    return luma;
  }

  /**
   * Morphological Mask Dilation (separable 1D max filter O(N))
   * Expands the mask outwards by radiusPx pixels (0 to 16px)
   */
  public static dilateMask(mask: Float32Array, width: number, height: number, radiusPx: number): Float32Array {
    if (radiusPx <= 0) return new Float32Array(mask);

    const r = Math.min(32, Math.round(radiusPx));
    const temp = new Float32Array(width * height);
    const result = new Float32Array(width * height);

    // Horizontal dilation
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let maxVal = 0;
        const xMin = Math.max(0, x - r);
        const xMax = Math.min(width - 1, x + r);
        for (let ix = xMin; ix <= xMax; ix++) {
          const v = mask[row + ix];
          if (v > maxVal) maxVal = v;
          if (maxVal >= 1.0) break;
        }
        temp[row + x] = maxVal;
      }
    }

    // Vertical dilation
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let maxVal = 0;
        const yMin = Math.max(0, y - r);
        const yMax = Math.min(height - 1, y + r);
        for (let iy = yMin; iy <= yMax; iy++) {
          const v = temp[iy * width + x];
          if (v > maxVal) maxVal = v;
          if (maxVal >= 1.0) break;
        }
        result[y * width + x] = maxVal;
      }
    }

    return result;
  }

  /**
   * Mask Feathering (soft edge transition)
   */
  public static featherMask(mask: Float32Array, width: number, height: number, radiusPx = 2): Float32Array {
    if (radiusPx <= 0) return new Float32Array(mask);
    return ImagePostprocessor.boxFilter(mask, width, height, radiusPx);
  }

  /**
   * Compute Bounding Box ROI of masked connected components + context padding
   * Context padding: >= 64px or 50% of the mask dimension on each side
   */
  public static computeMaskROI(
    mask: Float32Array,
    width: number,
    height: number,
    minPadding = 64,
    relativePadding = 0.5
  ): { x: number; y: number; w: number; h: number; hasMask: boolean } {
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (mask[row + x] > 0.05) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1) {
      return { x: 0, y: 0, w: 0, h: 0, hasMask: false };
    }

    const maskW = maxX - minX + 1;
    const maskH = maxY - minY + 1;

    const padX = Math.max(minPadding, Math.round(maskW * relativePadding));
    const padY = Math.max(minPadding, Math.round(maskH * relativePadding));

    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    const w = Math.min(width - x, maxX + padX - x + 1);
    const h = Math.min(height - y, maxY + padY - y + 1);

    return { x, y, w, h, hasMask: true };
  }

  /**
   * Crop an ROI sub-rectangle from full-resolution RGBA image
   */
  public static cropROI(
    rgba: Uint8ClampedArray,
    fullW: number,
    fullH: number,
    roi: { x: number; y: number; w: number; h: number }
  ): Uint8ClampedArray {
    const cropped = new Uint8ClampedArray(roi.w * roi.h * 4);
    for (let y = 0; y < roi.h; y++) {
      const srcRow = (roi.y + y) * fullW * 4;
      const dstRow = y * roi.w * 4;
      const srcStart = srcRow + roi.x * 4;
      cropped.set(rgba.subarray(srcStart, srcStart + roi.w * 4), dstRow);
    }
    return cropped;
  }

  /**
   * Crop an ROI sub-rectangle from full-resolution Float32Array mask
   */
  public static cropMaskROI(
    mask: Float32Array,
    fullW: number,
    fullH: number,
    roi: { x: number; y: number; w: number; h: number }
  ): Float32Array {
    const cropped = new Float32Array(roi.w * roi.h);
    for (let y = 0; y < roi.h; y++) {
      const srcRow = (roi.y + y) * fullW;
      const dstRow = y * roi.w;
      const srcStart = srcRow + roi.x;
      cropped.set(mask.subarray(srcStart, srcStart + roi.w), dstRow);
    }
    return cropped;
  }

  /**
   * Split large ROI into overlapping sub-windows (e.g. 512x512 with 64px overlap)
   */
  public static splitIntoOverlappingWindows(
    roiW: number,
    roiH: number,
    windowSize = 512,
    overlap = 64
  ): Array<{ x: number; y: number; w: number; h: number }> {
    if (roiW <= windowSize && roiH <= windowSize) {
      return [{ x: 0, y: 0, w: roiW, h: roiH }];
    }

    const step = windowSize - overlap;
    const windows: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (let y = 0; y < roiH; y += step) {
      const winH = Math.min(windowSize, roiH - y);
      const startY = winH < windowSize && y > 0 ? Math.max(0, roiH - windowSize) : y;

      for (let x = 0; x < roiW; x += step) {
        const winW = Math.min(windowSize, roiW - x);
        const startX = winW < windowSize && x > 0 ? Math.max(0, roiW - windowSize) : x;

        windows.push({
          x: startX,
          y: startY,
          w: Math.min(windowSize, roiW - startX),
          h: Math.min(windowSize, roiH - startY)
        });

        if (startX + windowSize >= roiW) break;
      }
      if (startY + windowSize >= roiH) break;
    }

    return windows;
  }

  /**
   * Paste inpainted ROI back onto original image with BYTE-FOR-BYTE identity
   * for every pixel outside the mask (alpha === 0).
   */
  public static pasteInpaintedROI(
    originalRgba: Uint8ClampedArray,
    inpaintedROI: Uint8ClampedArray,
    roi: { x: number; y: number; w: number; h: number },
    fullMask: Float32Array,
    width: number,
    height: number
  ): Uint8ClampedArray {
    // Clone original buffer (Strict Memory budget: max 2 full-res image copies)
    const result = new Uint8ClampedArray(originalRgba);

    for (let ry = 0; ry < roi.h; ry++) {
      const gy = roi.y + ry;
      if (gy >= height) continue;
      const gRow = gy * width;
      const rRow = ry * roi.w;

      for (let rx = 0; rx < roi.w; rx++) {
        const gx = roi.x + rx;
        if (gx >= width) continue;

        const maskIdx = gRow + gx;
        const alpha = fullMask[maskIdx];

        // CRITICAL CONSTRAINT: Byte-exact equality for alpha == 0
        if (alpha > 0) {
          const gP = maskIdx * 4;
          const rP = (rRow + rx) * 4;

          if (alpha >= 0.999) {
            result[gP] = inpaintedROI[rP];
            result[gP + 1] = inpaintedROI[rP + 1];
            result[gP + 2] = inpaintedROI[rP + 2];
            result[gP + 3] = originalRgba[gP + 3];
          } else {
            // Smooth feather blend on mask boundaries
            const invAlpha = 1.0 - alpha;
            result[gP] = Math.round(originalRgba[gP] * invAlpha + inpaintedROI[rP] * alpha);
            result[gP + 1] = Math.round(originalRgba[gP + 1] * invAlpha + inpaintedROI[rP + 1] * alpha);
            result[gP + 2] = Math.round(originalRgba[gP + 2] * invAlpha + inpaintedROI[rP + 2] * alpha);
            result[gP + 3] = originalRgba[gP + 3];
          }
        }
      }
    }

    return result;
  }

  /**
   * True Push-Pull Multiresolution Pyramid Inpainting (Fallback without download)
   * 
   * Replaces faulty local averaging:
   * 1. Pull phase: Builds Gaussian image & confidence pyramid (down to 1x1)
   *    so holes of ANY arbitrary size are guaranteed to be filled from broad context.
   * 2. Push phase: Propagates filled values from coarse levels back into missing pixels.
   * 3. Noise/Grain matching: Analyzes surrounding texture variance and synthesizes
   *    matching camera sensor grain for natural appearance.
   */
  public static pushPullInpaint(
    rgba: Uint8ClampedArray,
    mask: Float32Array,
    width: number,
    height: number,
    seed = 42
  ): Uint8ClampedArray {
    const output = new Uint8ClampedArray(rgba);
    const n = width * height;

    // Build pyramid structures
    interface PyramidLevel {
      w: number;
      h: number;
      r: Float32Array;
      g: Float32Array;
      b: Float32Array;
      weight: Float32Array;
    }

    const pyramid: PyramidLevel[] = [];

    // Level 0: Original data with confidence = 0 for masked pixels, 1 for context
    const l0R = new Float32Array(n);
    const l0G = new Float32Array(n);
    const l0B = new Float32Array(n);
    const l0W = new Float32Array(n);

    // Measure local boundary grain variance in surrounding context
    let contextVarR = 0;
    let contextVarG = 0;
    let contextVarB = 0;
    let contextSamples = 0;

    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const m = mask[i];
      const isHole = m > 0.05;

      l0R[i] = rgba[p];
      l0G[i] = rgba[p + 1];
      l0B[i] = rgba[p + 2];
      l0W[i] = isHole ? 0.0 : 1.0;
    }

    // Estimate boundary texture standard deviation
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        if (l0W[idx] > 0.5) {
          // Check if adjacent to mask hole
          if (
            l0W[idx - 1] < 0.5 ||
            l0W[idx + 1] < 0.5 ||
            l0W[idx - width] < 0.5 ||
            l0W[idx + width] < 0.5
          ) {
            const dr = l0R[idx] - l0R[idx - 1];
            const dg = l0G[idx] - l0G[idx - 1];
            const db = l0B[idx] - l0B[idx - 1];
            contextVarR += dr * dr;
            contextVarG += dg * dg;
            contextVarB += db * db;
            contextSamples++;
          }
        }
      }
    }

    const grainStdR = contextSamples > 0 ? Math.min(18, Math.sqrt(contextVarR / contextSamples) * 0.7) : 3;
    const grainStdG = contextSamples > 0 ? Math.min(18, Math.sqrt(contextVarG / contextSamples) * 0.7) : 3;
    const grainStdB = contextSamples > 0 ? Math.min(18, Math.sqrt(contextVarB / contextSamples) * 0.7) : 3;

    pyramid.push({ w: width, h: height, r: l0R, g: l0G, b: l0B, weight: l0W });

    // === PULL PHASE (Fine to Coarse) ===
    let curLevel = pyramid[0];
    while (curLevel.w > 1 || curLevel.h > 1) {
      const nextW = Math.max(1, Math.floor(curLevel.w / 2));
      const nextH = Math.max(1, Math.floor(curLevel.h / 2));
      const nextN = nextW * nextH;

      const nextR = new Float32Array(nextN);
      const nextG = new Float32Array(nextN);
      const nextB = new Float32Array(nextN);
      const nextWgt = new Float32Array(nextN);

      for (let ny = 0; ny < nextH; ny++) {
        const sy0 = ny * 2;
        const sy1 = Math.min(curLevel.h - 1, sy0 + 1);

        for (let nx = 0; nx < nextW; nx++) {
          const sx0 = nx * 2;
          const sx1 = Math.min(curLevel.w - 1, sx0 + 1);

          let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
          const childCoords = [
            sy0 * curLevel.w + sx0,
            sy0 * curLevel.w + sx1,
            sy1 * curLevel.w + sx0,
            sy1 * curLevel.w + sx1
          ];

          for (const cIdx of childCoords) {
            const w = curLevel.weight[cIdx];
            if (w > 0) {
              sumR += curLevel.r[cIdx] * w;
              sumG += curLevel.g[cIdx] * w;
              sumB += curLevel.b[cIdx] * w;
              sumW += w;
            }
          }

          const outIdx = ny * nextW + nx;
          if (sumW > 0) {
            nextR[outIdx] = sumR / sumW;
            nextG[outIdx] = sumG / sumW;
            nextB[outIdx] = sumB / sumW;
            nextWgt[outIdx] = Math.min(1.0, sumW / 4.0);
          } else {
            nextR[outIdx] = 0;
            nextG[outIdx] = 0;
            nextB[outIdx] = 0;
            nextWgt[outIdx] = 0;
          }
        }
      }

      curLevel = { w: nextW, h: nextH, r: nextR, g: nextG, b: nextB, weight: nextWgt };
      pyramid.push(curLevel);
    }

    // === PUSH PHASE (Coarse to Fine) ===
    // If top of pyramid still has 0 weight (unlikely unless whole image is masked), fill with neutral gray
    const top = pyramid[pyramid.length - 1];
    if (top.weight[0] === 0) {
      top.r[0] = 128;
      top.g[0] = 128;
      top.b[0] = 128;
      top.weight[0] = 1.0;
    }

    for (let l = pyramid.length - 1; l > 0; l--) {
      const parent = pyramid[l];
      const child = pyramid[l - 1];

      for (let cy = 0; cy < child.h; cy++) {
        const py = Math.min(parent.h - 1, Math.floor(cy / 2));
        const cRow = cy * child.w;
        const pRow = py * parent.w;

        for (let cx = 0; cx < child.w; cx++) {
          const px = Math.min(parent.w - 1, Math.floor(cx / 2));
          const cIdx = cRow + cx;
          const pIdx = pRow + px;

          const childW = child.weight[cIdx];
          if (childW < 1.0) {
            // Push color from parent level
            const parentR = parent.r[pIdx];
            const parentG = parent.g[pIdx];
            const parentB = parent.b[pIdx];

            child.r[cIdx] = child.r[cIdx] * childW + parentR * (1.0 - childW);
            child.g[cIdx] = child.g[cIdx] * childW + parentG * (1.0 - childW);
            child.b[cIdx] = child.b[cIdx] * childW + parentB * (1.0 - childW);
            child.weight[cIdx] = 1.0; // Marked filled
          }
        }
      }
    }

    // Fast PRNG for reproducible grain synthesis
    const lcg = (x: number, y: number, s: number) => {
      let h = (x * 374761393 + y * 668265263 + s * 1442695040888963407) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) & 0xffff) / 65535.0 - 0.5; // [-0.5, 0.5]
    };

    // Populate output buffer with filled colors and matched grain
    const filledR = pyramid[0].r;
    const filledG = pyramid[0].g;
    const filledB = pyramid[0].b;

    for (let i = 0; i < n; i++) {
      const m = mask[i];
      if (m > 0.001) {
        const p = i * 4;
        const x = i % width;
        const y = Math.floor(i / width);

        // Add subtle sensor grain matching surrounding variance
        const noise = lcg(x, y, seed);
        const rVal = Math.max(0, Math.min(255, Math.round(filledR[i] + noise * grainStdR * 2.0)));
        const gVal = Math.max(0, Math.min(255, Math.round(filledG[i] + noise * grainStdG * 2.0)));
        const bVal = Math.max(0, Math.min(255, Math.round(filledB[i] + noise * grainStdB * 2.0)));

        output[p] = rVal;
        output[p + 1] = gVal;
        output[p + 2] = bVal;
      }
    }

    return output;
  }

  /**
   * Calculate outpainting expansion steps.
   * Per requirement (3): Each step expands by at most 25% of the longest dimension per side.
   * Large expansions (>50%) trigger a quality warning.
   */
  public static calculateExpansionSteps(
    origW: number,
    origH: number,
    targetW: number,
    targetH: number,
    targetOriginX: number,
    targetOriginY: number
  ): {
    numSteps: number;
    shouldWarn: boolean;
    totalExpansionFraction: number;
    steps: Array<{
      stepIndex: number;
      curW: number;
      curH: number;
      originX: number;
      originY: number;
      padLeft: number;
      padTop: number;
      padRight: number;
      padBottom: number;
    }>;
  } {
    const padLeft = Math.max(0, targetOriginX);
    const padTop = Math.max(0, targetOriginY);
    const padRight = Math.max(0, targetW - (targetOriginX + origW));
    const padBottom = Math.max(0, targetH - (targetOriginY + origH));

    const longestOrig = Math.max(origW, origH);
    const maxHorizontalPad = padLeft + padRight;
    const maxVerticalPad = padTop + padBottom;
    const maxTotalExpansion = Math.max(maxHorizontalPad, maxVerticalPad);

    const totalExpansionFraction = maxTotalExpansion / Math.max(1, longestOrig);
    const shouldWarn = totalExpansionFraction > 0.5;

    // Max expansion per step is 25% of longest dimension
    const maxStepPx = Math.max(16, Math.floor(0.25 * longestOrig));
    const maxSingleSide = Math.max(padLeft, padTop, padRight, padBottom);
    const numSteps = Math.max(1, Math.ceil(maxSingleSide / maxStepPx));

    const steps = [];
    let prevL = 0, prevT = 0, prevR = 0, prevB = 0;

    for (let s = 1; s <= numSteps; s++) {
      const frac = s / numSteps;
      const curL = Math.round(padLeft * frac);
      const curT = Math.round(padTop * frac);
      const curR = Math.round(padRight * frac);
      const curB = Math.round(padBottom * frac);

      const curW = origW + curL + curR;
      const curH = origH + curT + curB;

      steps.push({
        stepIndex: s - 1,
        curW,
        curH,
        originX: curL,
        originY: curT,
        padLeft: curL - prevL,
        padTop: curT - prevT,
        padRight: curR - prevR,
        padBottom: curB - prevB
      });

      prevL = curL;
      prevT = curT;
      prevR = curR;
      prevB = curB;
    }

    return {
      numSteps,
      shouldWarn,
      totalExpansionFraction,
      steps
    };
  }

  /**
   * Mirror coordinate reflection helper
   */
  public static mirrorCoordinate(coord: number, max: number): number {
    if (max <= 1) return 0;
    let c = coord;
    while (c < 0 || c >= max) {
      if (c < 0) {
        c = -c;
      } else if (c >= max) {
        c = 2 * (max - 1) - c;
      }
    }
    return Math.max(0, Math.min(max - 1, c));
  }

  /**
   * Initial Instant Non-Intelligent Outpaint Fill:
   * Edge Mirroring + Gradual Blur increasing with distance from original image edge.
   * Requirement 4(b): Instant preview & fast fallback without model download.
   */
  public static createMirrorBlurExpandedCanvas(
    origRgba: Uint8ClampedArray,
    origW: number,
    origH: number,
    targetW: number,
    targetH: number,
    originX: number,
    originY: number
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(targetW * targetH * 4);

    // 1. First pass: Edge Mirror Reflection across boundaries
    for (let ty = 0; ty < targetH; ty++) {
      const tRow = ty * targetW;
      const isInsideY = ty >= originY && ty < originY + origH;

      for (let tx = 0; tx < targetW; tx++) {
        const isInsideX = tx >= originX && tx < originX + origW;
        const targetIdx = (tRow + tx) * 4;

        if (isInsideX && isInsideY) {
          // Inside original rectangle: STRICT BYTE-FOR-BYTE COPY
          const origX = tx - originX;
          const origY = ty - originY;
          const origIdx = (origY * origW + origX) * 4;
          result[targetIdx] = origRgba[origIdx];
          result[targetIdx + 1] = origRgba[origIdx + 1];
          result[targetIdx + 2] = origRgba[origIdx + 2];
          result[targetIdx + 3] = origRgba[origIdx + 3];
        } else {
          // Outside: Mirror reflection from nearest boundary
          const relX = tx - originX;
          const relY = ty - originY;
          const mx = ImagePostprocessor.mirrorCoordinate(relX, origW);
          const my = ImagePostprocessor.mirrorCoordinate(relY, origH);
          const origIdx = (my * origW + mx) * 4;

          result[targetIdx] = origRgba[origIdx];
          result[targetIdx + 1] = origRgba[origIdx + 1];
          result[targetIdx + 2] = origRgba[origIdx + 2];
          result[targetIdx + 3] = 255;
        }
      }
    }

    // 2. Second pass: Gradual blurring increasing with distance from the original border
    // Create temporary copy for reading
    const temp = new Uint8ClampedArray(result);

    for (let ty = 0; ty < targetH; ty++) {
      const isInsideY = ty >= originY && ty < originY + origH;
      const tRow = ty * targetW;

      for (let tx = 0; tx < targetW; tx++) {
        const isInsideX = tx >= originX && tx < originX + origW;

        // Skip original image pixels to strictly preserve byte identity
        if (isInsideX && isInsideY) continue;

        // Calculate distance from nearest original edge
        let dx = 0;
        if (tx < originX) dx = originX - tx;
        else if (tx >= originX + origW) dx = tx - (originX + origW - 1);

        let dy = 0;
        if (ty < originY) dy = originY - ty;
        else if (ty >= originY + origH) dy = ty - (originY + origH - 1);

        const dist = Math.hypot(dx, dy);
        // Blur radius scales with distance from 2px up to 32px
        const blurRadius = Math.min(32, Math.max(2, Math.floor(dist * 0.18)));

        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const bMinY = Math.max(0, ty - blurRadius);
        const bMaxY = Math.min(targetH - 1, ty + blurRadius);
        const bMinX = Math.max(0, tx - blurRadius);
        const bMaxX = Math.min(targetW - 1, tx + blurRadius);

        // Subsample kernel for speed O(1) sampling
        const step = Math.max(1, Math.floor(blurRadius / 3));
        for (let sy = bMinY; sy <= bMaxY; sy += step) {
          const sRow = sy * targetW;
          for (let sx = bMinX; sx <= bMaxX; sx += step) {
            const sIdx = (sRow + sx) * 4;
            sumR += temp[sIdx];
            sumG += temp[sIdx + 1];
            sumB += temp[sIdx + 2];
            count++;
          }
        }

        const targetIdx = (tRow + tx) * 4;
        result[targetIdx] = Math.round(sumR / count);
        result[targetIdx + 1] = Math.round(sumG / count);
        result[targetIdx + 2] = Math.round(sumB / count);
        result[targetIdx + 3] = 255;
      }
    }

    return result;
  }

  /**
   * Create Outpaint Mask:
   * Requirement 4(c): Mask = new expanded area + 16px overlap into the original image.
   * Inside the inner core (>16px inside original): mask is 0.0.
   */
  public static createOutpaintMask(
    targetW: number,
    targetH: number,
    originX: number,
    originY: number,
    origW: number,
    origH: number,
    overlapPx = 16
  ): Float32Array {
    const mask = new Float32Array(targetW * targetH);

    const innerMinX = originX + overlapPx;
    const innerMaxX = originX + origW - overlapPx;
    const innerMinY = originY + overlapPx;
    const innerMaxY = originY + origH - overlapPx;

    for (let y = 0; y < targetH; y++) {
      const row = y * targetW;
      for (let x = 0; x < targetW; x++) {
        // Outside the original bounds: 100% masked
        const isOutsideOriginal = x < originX || x >= originX + origW || y < originY || y >= originY + origH;
        if (isOutsideOriginal) {
          mask[row + x] = 1.0;
        } else {
          // Inside original bounds: check overlap zone
          const isInsideCore = x >= innerMinX && x < innerMaxX && y >= innerMinY && y < innerMaxY;
          if (isInsideCore) {
            mask[row + x] = 0.0;
          } else {
            // Overlap transition zone: calculate distance into overlap
            const distFromEdge = Math.min(
              x - originX,
              originX + origW - 1 - x,
              y - originY,
              originY + origH - 1 - y
            );
            // Linear ramp from 1.0 at outer edge to 0.0 at 16px inside
            mask[row + x] = Math.max(0, Math.min(1.0, 1.0 - distFromEdge / overlapPx));
          }
        }
      }
    }

    return mask;
  }

  /**
   * Composite Outpainted Step:
   * Pastes generated region with feathered gradient (8-16px) into overlap zone.
   * Central core of original image is STRICTLY PRESERVED BYTE-FOR-BYTE.
   */
  public static compositeOutpaintStep(
    baseExpandedRgba: Uint8ClampedArray,
    inpaintedRgba: Uint8ClampedArray,
    origRgba: Uint8ClampedArray,
    targetW: number,
    targetH: number,
    originX: number,
    origW: number,
    origH: number,
    originY: number,
    outpaintMask: Float32Array
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(baseExpandedRgba);

    for (let y = 0; y < targetH; y++) {
      const row = y * targetW;
      const isYInsideOrig = y >= originY && y < originY + origH;

      for (let x = 0; x < targetW; x++) {
        const isXInsideOrig = x >= originX && x < originX + origW;
        const idx = row + x;
        const p = idx * 4;
        const m = outpaintMask[idx];

        if (isXInsideOrig && isYInsideOrig) {
          const origX = x - originX;
          const origY = y - originY;
          const origP = (origY * origW + origX) * 4;

          if (m <= 0.001) {
            // Inner Core: STRICT BYTE-FOR-BYTE ORIGINAL IDENTITY
            result[p] = origRgba[origP];
            result[p + 1] = origRgba[origP + 1];
            result[p + 2] = origRgba[origP + 2];
            result[p + 3] = origRgba[origP + 3];
          } else {
            // Overlap feather blend (8-16px)
            const alpha = m;
            const invAlpha = 1.0 - alpha;
            result[p] = Math.round(origRgba[origP] * invAlpha + inpaintedRgba[p] * alpha);
            result[p + 1] = Math.round(origRgba[origP + 1] * invAlpha + inpaintedRgba[p + 1] * alpha);
            result[p + 2] = Math.round(origRgba[origP + 2] * invAlpha + inpaintedRgba[p + 2] * alpha);
            result[p + 3] = origRgba[origP + 3];
          }
        } else {
          // Expanded new region
          result[p] = inpaintedRgba[p];
          result[p + 1] = inpaintedRgba[p + 1];
          result[p + 2] = inpaintedRgba[p + 2];
          result[p + 3] = 255;
        }
      }
    }

    return result;
  }
}

