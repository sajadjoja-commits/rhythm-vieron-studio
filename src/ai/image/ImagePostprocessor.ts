/**
 * ImagePostprocessor
 * Postprocesses neural network outputs: alpha matting, guided filter edge refinement,
 * morphological mask cleanup, soft alpha hair preservation, overlapping tile merging,
 * and high-performance canvas/blob encoding.
 */

import { ImageMemoryManager } from "./ImageMemoryManager";
import { ImageTile } from "./ImagePreprocessor";

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
   * Apply neural mask to source image with edge refinement and soft alpha blending
   */
  public applyMaskToImage(
    sourceImageData: ImageData,
    rawMaskData: Float32Array | Uint8Array | Uint8ClampedArray,
    maskWidth: number,
    maskHeight: number,
    options?: {
      edgeRefinement?: boolean;
      featherRadius?: number;
      threshold?: number;
      softAlpha?: boolean;
    }
  ): ImageData {
    const targetW = sourceImageData.width;
    const targetH = sourceImageData.height;
    const outData = new ImageData(
      new Uint8ClampedArray(sourceImageData.data),
      targetW,
      targetH
    );

    // 1. Resample raw neural mask to exact target dimensions
    const resampledMask = this.resampleMask(
      rawMaskData,
      maskWidth,
      maskHeight,
      targetW,
      targetH
    );

    // 2. Optional Guided Filter / Edge Refinement for hair & fine contours
    const refinedMask =
      options?.edgeRefinement !== false
        ? this.fastGuidedFilter(outData.data, resampledMask, targetW, targetH, 3, 0.01)
        : resampledMask;

    // 3. Optional Morphological cleanup & feathering
    const feather = options?.featherRadius ?? 1;
    const finalMask =
      feather > 0
        ? this.boxBlur1D(refinedMask, targetW, targetH, feather)
        : refinedMask;

    const threshold = options?.threshold ?? 0.05;
    const softAlpha = options?.softAlpha !== false;

    const totalPixels = targetW * targetH;
    for (let i = 0; i < totalPixels; i++) {
      const pxIndex = i * 4;
      const maskVal = finalMask[i];

      if (softAlpha) {
        // Continuous soft alpha blending
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

    return outData;
  }

  /**
   * Resample 2D mask (Float32 [0..1] or Uint8 [0..255]) to target resolution using bilinear interpolation
   */
  private resampleMask(
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

        // Bilinear interpolation
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
  private fastGuidedFilter(
    guideRgba: Uint8ClampedArray,
    inputMask: Float32Array,
    width: number,
    height: number,
    radius = 3,
    eps = 0.01
  ): Float32Array {
    const total = width * height;
    const guideGray = new Float32Array(total);

    // Convert guide RGB to grayscale normalized 0..1
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      guideGray[i] = (guideRgba[p] * 0.299 + guideRgba[p + 1] * 0.587 + guideRgba[p + 2] * 0.114) / 255.0;
    }

    // Mean of guide I and input p
    const meanI = this.boxBlur1D(guideGray, width, height, radius);
    const meanP = this.boxBlur1D(inputMask, width, height, radius);

    // Mean of I * p and I * I
    const Ip = new Float32Array(total);
    const II = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      Ip[i] = guideGray[i] * inputMask[i];
      II[i] = guideGray[i] * guideGray[i];
    }
    const meanIp = this.boxBlur1D(Ip, width, height, radius);
    const meanII = this.boxBlur1D(II, width, height, radius);

    // Covariance and variance
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
   * Fast Separable Box Blur
   */
  private boxBlur1D(
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
   * Merge processed tiles into unified full-resolution output canvas with seamless overlap blending
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
      // Calculate scaled tile bounds
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
