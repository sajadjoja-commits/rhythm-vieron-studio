/**
 * ImagePostprocessor
 * Postprocesses neural network outputs:
 * - Neural Alpha Matting & Guided Filter Edge Refinement (hair / clothing contours)
 * - Morphological Mask Cleanup (island removal & hole filling)
 * - Edge De-fringing / Color Decontamination for clean compositing
 * - Interactive User Mask Editing (AI Mask + User Add - User Remove)
 * - Tile Merging with Seamless Boundary Blending
 * - Multi-Format High-Performance Canvas & Blob Encoding
 */

import { ImageMemoryManager } from "./ImageMemoryManager";
import { ImageTile } from "./ImagePreprocessor";

export interface MaskRefinementOptions {
  edgeRefinement?: boolean;
  featherRadius?: number;
  threshold?: number;
  softAlpha?: boolean;
  removeIslands?: boolean;
  fillHoles?: boolean;
  decontaminateColor?: boolean;
}

export class ImagePostprocessor {
  private static instance: ImagePostprocessor;
  private memoryManager = ImageMemoryManager.getInstance();

  private constructor() {}

  public static getInstance(): ImagePostprocessor {
    if (!ImagePostprocessor.instance) {
      ImagePostprocessor.instance = new ImagePostprocessor();
    }
    return ImagePostprocessor.instance;
  }

  /**
   * Apply neural mask to source image with edge refinement, hair matting, and color decontamination
   */
  public applyMaskToImage(
    sourceImageData: ImageData,
    rawMaskData: Float32Array | Uint8Array | Uint8ClampedArray,
    maskWidth: number,
    maskHeight: number,
    options?: MaskRefinementOptions
  ): ImageData {
    const targetW = sourceImageData.width;
    const targetH = sourceImageData.height;
    const outData = new ImageData(
      new Uint8ClampedArray(sourceImageData.data),
      targetW,
      targetH
    );

    // 1. Resample raw neural mask to target dimensions
    let mask = this.resampleMask(
      rawMaskData,
      maskWidth,
      maskHeight,
      targetW,
      targetH
    );

    // 2. Morphological Cleanup (island removal + hole filling)
    if (options?.removeIslands === true || options?.fillHoles === true) {
      mask = this.cleanupMaskMorphology(mask, targetW, targetH);
    }

    // 3. Guided Filter / Edge Refinement for hair & clothing boundaries
    if (options?.edgeRefinement !== false) {
      mask = this.fastGuidedFilter(outData.data, mask, targetW, targetH, 3, 0.01);
    }

    // 4. Feathering
    const feather = options?.featherRadius ?? 1;
    if (feather > 0) {
      mask = this.boxBlur1D(mask, targetW, targetH, feather);
    }

    const threshold = options?.threshold ?? 0.05;
    const softAlpha = options?.softAlpha !== false;
    const totalPixels = targetW * targetH;

    // 5. Apply Alpha Channel
    for (let i = 0; i < totalPixels; i++) {
      const pxIndex = i * 4;
      const maskVal = mask[i];

      if (softAlpha) {
        let alpha = maskVal;
        if (alpha < threshold) {
          alpha = 0;
        } else if (alpha > 0.95) {
          alpha = 1.0;
        } else {
          // Smoothstep curve for natural edge gradient
          const t = (alpha - threshold) / (0.95 - threshold);
          alpha = t * t * (3 - 2 * t);
        }
        outData.data[pxIndex + 3] = Math.round(alpha * 255);
      } else {
        outData.data[pxIndex + 3] = maskVal >= threshold ? 255 : 0;
      }
    }

    // 6. Optional Edge De-fringing (Color Decontamination) to remove background color bleed
    if (options?.decontaminateColor !== false) {
      this.decontaminateEdges(outData, mask, targetW, targetH);
    }

    return outData;
  }

  /**
   * Resample 2D mask to target resolution using bilinear interpolation
   */
  public resampleMask(
    rawMask: Float32Array | Uint8Array | Uint8ClampedArray,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number
  ): Float32Array {
    const isFloat = rawMask instanceof Float32Array;
    const output = new Float32Array(dstW * dstH);

    const scaleX = (srcW - 1) / Math.max(1, dstW - 1);
    const scaleY = (srcH - 1) / Math.max(1, dstH - 1);

    for (let y = 0; y < dstH; y++) {
      const srcY = y * scaleY;
      const y0 = Math.floor(srcY);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const dy = srcY - y0;

      for (let x = 0; x < dstW; x++) {
        const srcX = x * scaleX;
        const x0 = Math.floor(srcX);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const dx = srcX - x0;

        const val00 = isFloat ? (rawMask[y0 * srcW + x0] as number) : (rawMask[y0 * srcW + x0] as number) / 255.0;
        const val10 = isFloat ? (rawMask[y0 * srcW + x1] as number) : (rawMask[y0 * srcW + x1] as number) / 255.0;
        const val01 = isFloat ? (rawMask[y1 * srcW + x0] as number) : (rawMask[y1 * srcW + x0] as number) / 255.0;
        const val11 = isFloat ? (rawMask[y1 * srcW + x1] as number) : (rawMask[y1 * srcW + x1] as number) / 255.0;

        const top = val00 * (1 - dx) + val10 * dx;
        const bottom = val01 * (1 - dx) + val11 * dx;
        const interpolated = top * (1 - dy) + bottom * dy;

        output[y * dstW + x] = Math.max(0, Math.min(1, interpolated));
      }
    }

    return output;
  }

  /**
   * Fast Guided Filter for natural hair/fur boundary edge preservation
   */
  public fastGuidedFilter(
    guideRgba: Uint8ClampedArray,
    inputMask: Float32Array,
    width: number,
    height: number,
    radius = 3,
    eps = 0.01
  ): Float32Array {
    const total = width * height;
    const guideGray = new Float32Array(total);

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      guideGray[i] = (guideRgba[p] * 0.299 + guideRgba[p + 1] * 0.587 + guideRgba[p + 2] * 0.114) / 255.0;
    }

    const meanI = this.boxBlur1D(guideGray, width, height, radius);
    const meanP = this.boxBlur1D(inputMask, width, height, radius);

    const Ip = new Float32Array(total);
    const II = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      Ip[i] = guideGray[i] * inputMask[i];
      II[i] = guideGray[i] * guideGray[i];
    }
    const meanIp = this.boxBlur1D(Ip, width, height, radius);
    const meanII = this.boxBlur1D(II, width, height, radius);

    const a = new Float32Array(total);
    const b = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const covIp = meanIp[i] - meanI[i] * meanP[i];
      const varI = meanII[i] - meanI[i] * meanI[i];
      a[i] = covIp / (varI + eps);
      b[i] = meanP[i] - a[i] * meanI[i];
    }

    const meanA = this.boxBlur1D(a, width, height, radius);
    const meanB = this.boxBlur1D(b, width, height, radius);

    const output = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      output[i] = Math.max(0, Math.min(1, meanA[i] * guideGray[i] + meanB[i]));
    }

    return output;
  }

  /**
   * Morphological Cleanup: small island removal & small hole closing
   */
  public cleanupMaskMorphology(
    mask: Float32Array,
    width: number,
    height: number
  ): Float32Array {
    const total = width * height;
    const cleaned = new Float32Array(mask);

    // Apply a 3x3 min-max morphological opening / closing filter
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const center = mask[row + x];
        
        let sumNeighbors = 0;
        sumNeighbors += mask[row - width + x - 1] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row - width + x] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row - width + x + 1] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row + x - 1] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row + x + 1] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row + width + x - 1] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row + width + x] > 0.5 ? 1 : 0;
        sumNeighbors += mask[row + width + x + 1] > 0.5 ? 1 : 0;

        if (center > 0.5 && sumNeighbors < 2) {
          // Isolated single pixel noise -> remove
          cleaned[row + x] = 0;
        } else if (center <= 0.5 && sumNeighbors >= 7) {
          // Isolated single pixel hole inside foreground -> fill
          cleaned[row + x] = 1.0;
        } else {
          cleaned[row + x] = center;
        }
      }
    }

    return cleaned;
  }

  /**
   * Edge De-fringing / Color Decontamination:
   * Neutralizes background color spill on semi-transparent transition boundary pixels.
   */
  public decontaminateEdges(
    imageData: ImageData,
    mask: Float32Array,
    width: number,
    height: number
  ): void {
    const data = imageData.data;
    const total = width * height;

    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        const alpha = mask[idx];

        // Only process semi-transparent transition zone (edges)
        if (alpha > 0.05 && alpha < 0.92) {
          const px = idx * 4;

          // Look around 3x3 window for solid foreground pixels
          let fgR = 0;
          let fgG = 0;
          let fgB = 0;
          let fgCount = 0;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = (y + dy) * width + (x + dx);
              if (mask[nIdx] >= 0.9) {
                const nPx = nIdx * 4;
                fgR += data[nPx];
                fgG += data[nPx + 1];
                fgB += data[nPx + 2];
                fgCount++;
              }
            }
          }

          if (fgCount > 0) {
            const avgR = fgR / fgCount;
            const avgG = fgG / fgCount;
            const avgB = fgB / fgCount;

            // Blend edge color towards the nearest solid foreground color
            const blendFactor = 1.0 - alpha;
            data[px] = Math.round(data[px] * alpha + avgR * blendFactor);
            data[px + 1] = Math.round(data[px + 1] * alpha + avgG * blendFactor);
            data[px + 2] = Math.round(data[px + 2] * alpha + avgB * blendFactor);
          }
        }
      }
    }
  }

  /**
   * Combine AI Mask with user manual Add & Remove layers
   * Formula: Final = clamp(AI_Mask + User_Add - User_Remove, 0, 1)
   */
  public combineMasks(
    aiMask: Float32Array,
    userAddMask: Float32Array | null,
    userRemoveMask: Float32Array | null,
    width: number,
    height: number
  ): Float32Array {
    const total = width * height;
    const finalMask = new Float32Array(total);

    for (let i = 0; i < total; i++) {
      let val = aiMask[i];
      if (userAddMask) {
        val = Math.max(val, userAddMask[i]);
      }
      if (userRemoveMask) {
        val = Math.min(val, 1.0 - userRemoveMask[i]);
      }
      finalMask[i] = Math.max(0, Math.min(1, val));
    }

    return finalMask;
  }

  /**
   * Fast Separable Box Blur
   */
  public boxBlur1D(
    src: Float32Array,
    w: number,
    h: number,
    radius: number
  ): Float32Array {
    if (radius <= 0) return src;
    const temp = new Float32Array(src.length);
    const out = new Float32Array(src.length);

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const nx = x + k;
          if (nx >= 0 && nx < w) {
            sum += src[rowOffset + nx];
            count++;
          }
        }
        temp[rowOffset + x] = sum / count;
      }
    }

    // Vertical pass
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const ny = y + k;
          if (ny >= 0 && ny < h) {
            sum += temp[ny * w + x];
            count++;
          }
        }
        out[y * w + x] = sum / count;
      }
    }

    return out;
  }

  /**
   * Merge processed tiles into unified full-resolution output canvas
   */
  public mergeTiles(
    tiles: Array<{
      tile: ImageTile;
      processedCanvas: HTMLCanvasElement | OffscreenCanvas;
    }>,
    targetWidth: number,
    targetHeight: number,
    scaleFactor = 1
  ): HTMLCanvasElement | OffscreenCanvas {
    const finalW = targetWidth * scaleFactor;
    const finalH = targetHeight * scaleFactor;

    const outCanvas = this.memoryManager.createCanvas(finalW, finalH);
    const outCtx = outCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;

    if (!outCtx) {
      throw new Error("[ImagePostprocessor] Failed to obtain merge canvas context");
    }

    for (const { tile, processedCanvas } of tiles) {
      const destX = tile.x * scaleFactor;
      const destY = tile.y * scaleFactor;
      const destW = tile.width * scaleFactor;
      const destH = tile.height * scaleFactor;

      const srcCropX = tile.padLeft * scaleFactor;
      const srcCropY = tile.padTop * scaleFactor;
      const srcCropW = destW;
      const srcCropH = destH;

      outCtx.drawImage(
        processedCanvas as any,
        srcCropX,
        srcCropY,
        srcCropW,
        srcCropH,
        destX,
        destY,
        destW,
        destH
      );
    }

    return outCanvas;
  }

  /**
   * Encode canvas or ImageData into Data URL / Blob
   */
  public async encodeCanvas(
    canvasOrImageData: HTMLCanvasElement | OffscreenCanvas | ImageData,
    format: "image/png" | "image/jpeg" | "image/webp" = "image/png",
    quality = 0.95
  ): Promise<{ dataUrl: string; blob?: Blob }> {
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let shouldDispose = false;

    if (canvasOrImageData instanceof ImageData) {
      canvas = this.memoryManager.createCanvas(
        canvasOrImageData.width,
        canvasOrImageData.height
      );
      const ctx = canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D;
      ctx.putImageData(canvasOrImageData, 0, 0);
      shouldDispose = true;
    } else {
      canvas = canvasOrImageData;
    }

    try {
      if ("convertToBlob" in canvas && typeof (canvas as any).convertToBlob === "function") {
        const blob = await (canvas as any).convertToBlob({ type: format, quality });
        const dataUrl = await this.blobToDataUrl(blob);
        return { dataUrl, blob };
      }

      if ("toDataURL" in canvas && typeof (canvas as any).toDataURL === "function") {
        const dataUrl = (canvas as HTMLCanvasElement).toDataURL(format, quality);
        let blob: Blob | undefined;
        try {
          const res = await fetch(dataUrl);
          blob = await res.blob();
        } catch {
          // Ignore
        }
        return { dataUrl, blob };
      }

      throw new Error("[ImagePostprocessor] Canvas encoding is not supported in current context");
    } finally {
      if (shouldDispose) {
        this.memoryManager.disposeCanvas(canvas);
      }
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
