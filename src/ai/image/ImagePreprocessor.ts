/**
 * ImagePreprocessor
 * Prepares image inputs for Local Neural AI: decoding, dimension normalization,
 * color space conversion, NCHW/NHWC tensor formatting, and overlapping tile generation.
 */

import { ImageCapabilityProfile } from "./types";
import { ImageMemoryManager } from "./ImageMemoryManager";

export interface PreparedImage {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  imageData: ImageData;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  scaleDownRatio: number;
}

export interface ImageTile {
  index: number;
  x: number; // Destination X in full image
  y: number; // Destination Y in full image
  width: number; // Width of tile
  height: number; // Height of tile
  paddedX: number; // Source X with padding
  paddedY: number; // Source Y with padding
  paddedWidth: number;
  paddedHeight: number;
  padLeft: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  imageData: ImageData;
}

export class ImagePreprocessor {
  private static instance: ImagePreprocessor;
  private memoryManager = ImageMemoryManager.getInstance();

  private constructor() {}

  public static getInstance(): ImagePreprocessor {
    if (!ImagePreprocessor.instance) {
      ImagePreprocessor.instance = new ImagePreprocessor();
    }
    return ImagePreprocessor.instance;
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0]?.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const bstr = atob(parts[1] || "");
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Load any image input (data URL, blob, file, URL) into an HTMLImageElement or ImageBitmap
   */
  public async loadImage(input: string | Blob | File | ImageBitmap | HTMLImageElement): Promise<HTMLImageElement | ImageBitmap> {
    if (typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap) {
      return input;
    }

    if (typeof HTMLImageElement !== "undefined" && input instanceof HTMLImageElement) {
      if (input.complete && input.naturalWidth > 0) return input;
      await new Promise<void>((resolve, reject) => {
        input.onload = () => resolve();
        input.onerror = (e) => reject(new Error(`Failed to load HTMLImageElement: ${e}`));
      });
      return input;
    }

    let src = "";
    let isCreatedUrl = false;

    if (typeof input === "string") {
      src = input;
    } else if (input instanceof Blob || input instanceof File) {
      src = this.memoryManager.createTrackedUrl(input);
      isCreatedUrl = true;
    } else {
      throw new Error("[ImagePreprocessor] Unsupported image input format");
    }

    try {
      if (typeof createImageBitmap === "function") {
        let blob: Blob;
        if (input instanceof Blob) {
          blob = input;
        } else if (src.startsWith("data:")) {
          blob = this.dataUrlToBlob(src);
        } else {
          const res = await fetch(src, { mode: "cors" });
          blob = await res.blob();
        }
        const bitmap = await createImageBitmap(blob);
        if (isCreatedUrl) this.memoryManager.revokeUrl(src);
        return this.memoryManager.trackBitmap(bitmap);
      }
    } catch (e) {
      // Fallback to Image element if available
    }

    if (typeof Image !== "undefined") {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (isCreatedUrl) this.memoryManager.revokeUrl(src);
          resolve(img);
        };
        img.onerror = (err) => {
          if (isCreatedUrl) this.memoryManager.revokeUrl(src);
          reject(new Error(`[ImagePreprocessor] Failed to load image from source: ${err}`));
        };
        img.src = src;
      });
    }

    throw new Error("[ImagePreprocessor] Neither createImageBitmap nor Image is available in this environment");
  }

  /**
   * Prepare and normalize image dimensions according to device hardware tier
   */
  public async prepareImage(
    input: string | Blob | File | ImageBitmap | HTMLImageElement,
    capability: ImageCapabilityProfile,
    customMaxDim?: number
  ): Promise<PreparedImage> {
    const rawImage = await this.loadImage(input);
    const originalWidth = "naturalWidth" in rawImage ? rawImage.naturalWidth : rawImage.width;
    const originalHeight = "naturalHeight" in rawImage ? rawImage.naturalHeight : rawImage.height;

    if (originalWidth <= 0 || originalHeight <= 0) {
      throw new Error("[ImagePreprocessor] Invalid image dimensions (0x0)");
    }

    const maxDim = customMaxDim || capability.maxDimension;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    let scaleDownRatio = 1.0;

    const maxCurrentDim = Math.max(originalWidth, originalHeight);
    if (maxCurrentDim > maxDim) {
      scaleDownRatio = maxDim / maxCurrentDim;
      targetWidth = Math.round(originalWidth * scaleDownRatio);
      targetHeight = Math.round(originalHeight * scaleDownRatio);
    }

    const canvas = this.memoryManager.createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;

    if (!ctx) {
      throw new Error("[ImagePreprocessor] Failed to obtain 2D canvas rendering context");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(rawImage as any, 0, 0, targetWidth, targetHeight);

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    return {
      canvas,
      ctx,
      imageData,
      width: targetWidth,
      height: targetHeight,
      originalWidth,
      originalHeight,
      scaleDownRatio,
    };
  }

  /**
   * Convert ImageData into Float32Array Tensor in NCHW format: [1, 3, H, W] with Mean/Std normalization
   */
  public imageDataToNCHWTensor(
    imageData: ImageData,
    targetWidth: number,
    targetHeight: number,
    mean: [number, number, number] = [0.485, 0.456, 0.406],
    std: [number, number, number] = [0.229, 0.224, 0.225]
  ): Float32Array {
    let srcData = imageData.data;
    let srcW = imageData.width;
    let srcH = imageData.height;

    // Resize if target dimensions differ
    if (srcW !== targetWidth || srcH !== targetHeight) {
      const resizeCanvas = this.memoryManager.createCanvas(targetWidth, targetHeight);
      const resizeCtx = resizeCanvas.getContext("2d", { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D;

      const tempCanvas = this.memoryManager.createCanvas(srcW, srcH);
      const tempCtx = tempCanvas.getContext("2d") as CanvasRenderingContext2D;
      tempCtx.putImageData(imageData, 0, 0);

      resizeCtx.drawImage(tempCanvas as any, 0, 0, targetWidth, targetHeight);
      srcData = resizeCtx.getImageData(0, 0, targetWidth, targetHeight).data;
      srcW = targetWidth;
      srcH = targetHeight;

      this.memoryManager.disposeCanvas(resizeCanvas);
      this.memoryManager.disposeCanvas(tempCanvas);
    }

    const totalPixels = targetWidth * targetHeight;
    const tensorData = new Float32Array(3 * totalPixels);

    const rOffset = 0;
    const gOffset = totalPixels;
    const bOffset = 2 * totalPixels;

    const [meanR, meanG, meanB] = mean;
    const [stdR, stdG, stdB] = std;

    for (let i = 0; i < totalPixels; i++) {
      const pxIndex = i * 4;
      const r = srcData[pxIndex] / 255.0;
      const g = srcData[pxIndex + 1] / 255.0;
      const b = srcData[pxIndex + 2] / 255.0;

      tensorData[rOffset + i] = (r - meanR) / stdR;
      tensorData[gOffset + i] = (g - meanG) / stdG;
      tensorData[bOffset + i] = (b - meanB) / stdB;
    }

    return tensorData;
  }

  /**
   * Split high-resolution image into padded overlapping tiles for tile-based AI inference
   */
  public generateTiles(
    sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
    tileSize = 256,
    padding = 16
  ): ImageTile[] {
    const fullW = sourceCanvas.width;
    const fullH = sourceCanvas.height;
    const tiles: ImageTile[] = [];

    let index = 0;
    for (let y = 0; y < fullH; y += tileSize) {
      for (let x = 0; x < fullW; x += tileSize) {
        const curW = Math.min(tileSize, fullW - x);
        const curH = Math.min(tileSize, fullH - y);

        const padLeft = Math.min(x, padding);
        const padTop = Math.min(y, padding);
        const padRight = Math.min(fullW - (x + curW), padding);
        const padBottom = Math.min(fullH - (y + curH), padding);

        const paddedX = x - padLeft;
        const paddedY = y - padTop;
        const paddedWidth = curW + padLeft + padRight;
        const paddedHeight = curH + padTop + padBottom;

        const tileCanvas = this.memoryManager.createCanvas(paddedWidth, paddedHeight);
        const tileCtx = tileCanvas.getContext("2d", { willReadFrequently: true }) as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D;

        tileCtx.drawImage(
          sourceCanvas as any,
          paddedX,
          paddedY,
          paddedWidth,
          paddedHeight,
          0,
          0,
          paddedWidth,
          paddedHeight
        );

        const tileImageData = tileCtx.getImageData(0, 0, paddedWidth, paddedHeight);

        tiles.push({
          index: index++,
          x,
          y,
          width: curW,
          height: curH,
          paddedX,
          paddedY,
          paddedWidth,
          paddedHeight,
          padLeft,
          padTop,
          padRight,
          padBottom,
          canvas: tileCanvas,
          imageData: tileImageData,
        });
      }
    }

    return tiles;
  }
}
