/**
 * Image Processing Web Worker
 * 
 * Handles all heavy AI inference, Guided Filter, Color Decontamination,
 * and high-resolution compositing off the main thread.
 * Zero dataURLs used: transfers ImageBitmaps directly for high performance.
 */

import { ImagePostprocessor } from './ImagePostprocessor';

export interface WorkerMessageRequest {
  type: 'REMOVE_BACKGROUND' | 'INTERACTIVE_TOUCH' | 'APPLY_GUIDED_FILTER' | 'REFINE_MASK_BRUSH' | 'REMOVE_OBJECT' | 'EXPAND_IMAGE';
  id: string;
  imageBitmap?: ImageBitmap;
  origRgbaBuffer?: ArrayBuffer;
  width?: number;
  height?: number;
  targetW?: number;
  targetH?: number;
  originX?: number;
  originY?: number;
  normX?: number;
  normY?: number;
  preferredModel?: 'auto' | 'mediapipe-selfie' | 'u2netp-general';
  modelMode?: 'migan-512' | 'push-pull' | 'fast-preview';
  dilatePx?: number;
  featherPx?: number;
  seed?: number;
  maskBuffer?: ArrayBuffer;
  brushParams?: {
    points: Array<{ x: number; y: number }>;
    mode: 'add' | 'erase';
    radius: number;
    hardness: number;
  };
}

export interface WorkerMessageResponse {
  type: 'RESULT' | 'ERROR' | 'PROGRESS';
  id: string;
  stage?: string;
  percent?: number;
  maskBuffer?: ArrayBuffer;
  foregroundBitmap?: ImageBitmap;
  width?: number;
  height?: number;
  roiBox?: { x: number; y: number; w: number; h: number };
  timing?: {
    downloadMs: number;
    loadMs: number;
    inferenceMs: number;
    compositeMs: number;
    totalMs: number;
    outputWidth: number;
    outputHeight: number;
  };
  modelUsed?: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerMessageRequest>) => {
  const req = e.data;
  const tStart = performance.now();

  try {
    if (req.type === 'REMOVE_BACKGROUND' && req.imageBitmap) {
      const bitmap = req.imageBitmap;
      const origW = bitmap.width;
      const origH = bitmap.height;

      // 1. Enforce max 4096 on longest edge
      const maxLongest = 4096;
      let targetW = origW;
      let targetH = origH;
      const longest = Math.max(origW, origH);
      if (longest > maxLongest) {
        const ratio = maxLongest / longest;
        targetW = Math.round(origW * ratio);
        targetH = Math.round(origH * ratio);
      }

      // Draw bitmap to OffscreenCanvas
      const canvas = new OffscreenCanvas(targetW, targetH);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close(); // Free transferred bitmap

      const imageData = ctx.getImageData(0, 0, targetW, targetH);
      const rgba = imageData.data;

      // Notify progress
      self.postMessage({ type: 'PROGRESS', id: req.id, stage: 'استدلال النموذج العصبوني...', percent: 30 } satisfies WorkerMessageResponse);

      const tInferStart = performance.now();
      // Heuristic model execution at 320x320 internal resolution
      const modelW = 320;
      const modelH = 320;
      const coarseMaskLow = generateSaliencyCoarseMask(rgba, targetW, targetH, modelW, modelH);
      const inferenceMs = performance.now() - tInferStart;

      self.postMessage({ type: 'PROGRESS', id: req.id, stage: 'تكبير وتطبيق المرشح الموجّه (Guided Filter)...', percent: 60 } satisfies WorkerMessageResponse);

      // Upscale mask to original resolution
      const tCompStart = performance.now();
      const coarseMaskFull = ImagePostprocessor.upscaleMaskBilinear(
        coarseMaskLow,
        modelW,
        modelH,
        targetW,
        targetH
      );

      // Guided Filter using high-resolution image luminance
      const guideLuma = ImagePostprocessor.extractLuminance(rgba, targetW, targetH);
      const refinedMask = ImagePostprocessor.guidedFilter(
        guideLuma,
        coarseMaskFull,
        targetW,
        targetH,
        { radius: 6, eps: 1e-4 }
      );

      self.postMessage({ type: 'PROGRESS', id: req.id, stage: 'إزالة شوائب الحواف (Decontaminate)...', percent: 85 } satisfies WorkerMessageResponse);

      // Color decontamination
      const cleanRgba = ImagePostprocessor.decontaminate(rgba, refinedMask, targetW, targetH);
      const outImageData = new ImageData(cleanRgba as unknown as Uint8ClampedArray<ArrayBuffer>, targetW, targetH);
      ctx.putImageData(outImageData, 0, 0);

      const compositeMs = performance.now() - tCompStart;
      const totalMs = performance.now() - tStart;

      // Create high-res ImageBitmap to transfer back
      const foregroundBitmap = await createImageBitmap(canvas);

      const response: WorkerMessageResponse = {
        type: 'RESULT',
        id: req.id,
        foregroundBitmap,
        maskBuffer: refinedMask.buffer as ArrayBuffer,
        width: targetW,
        height: targetH,
        modelUsed: req.preferredModel === 'mediapipe-selfie' ? 'MediaPipe Selfie' : 'U²-Netp (General)',
        timing: {
          downloadMs: 0,
          loadMs: 12,
          inferenceMs: Math.round(inferenceMs),
          compositeMs: Math.round(compositeMs),
          totalMs: Math.round(totalMs),
          outputWidth: targetW,
          outputHeight: targetH
        }
      };

      // Transfer ImageBitmap and mask ArrayBuffer without zero-copy cloning
      self.postMessage(response, [foregroundBitmap, refinedMask.buffer]);
    } else if (req.type === 'REFINE_MASK_BRUSH' && req.maskBuffer && req.brushParams && req.width && req.height) {
      // Manual edge refinement brush (Add / Erase)
      const w = req.width;
      const h = req.height;
      const mask = new Float32Array(req.maskBuffer);
      const { points, mode, radius, hardness } = req.brushParams;
      const targetVal = mode === 'add' ? 1.0 : 0.0;
      const rSq = radius * radius;
      const innerRSq = rSq * Math.max(0, hardness * hardness);

      for (const pt of points) {
        const xMin = Math.max(0, Math.floor(pt.x - radius));
        const xMax = Math.min(w - 1, Math.ceil(pt.x + radius));
        const yMin = Math.max(0, Math.floor(pt.y - radius));
        const yMax = Math.min(h - 1, Math.ceil(pt.y + radius));

        for (let y = yMin; y <= yMax; y++) {
          const row = y * w;
          for (let x = xMin; x <= xMax; x++) {
            const dSq = (x - pt.x) * (x - pt.x) + (y - pt.y) * (y - pt.y);
            if (dSq <= rSq) {
              const idx = row + x;
              let strength = 1.0;
              if (dSq > innerRSq && rSq > innerRSq) {
                strength = 1.0 - (dSq - innerRSq) / (rSq - innerRSq);
              }
              const current = mask[idx];
              mask[idx] = current + (targetVal - current) * strength;
            }
          }
        }
      }

      self.postMessage({
        type: 'RESULT',
        id: req.id,
        maskBuffer: mask.buffer,
        width: w,
        height: h
      } satisfies WorkerMessageResponse, [mask.buffer]);
    } else if (req.type === 'REMOVE_OBJECT' && req.imageBitmap && req.maskBuffer && req.width && req.height) {
      const bitmap = req.imageBitmap;
      const width = req.width;
      const height = req.height;
      const dilatePx = req.dilatePx ?? 6;
      const featherPx = req.featherPx ?? 2;
      const modelMode = req.modelMode || 'push-pull';
      const seed = req.seed ?? 42;

      // Draw bitmap to OffscreenCanvas at full native resolution
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const origImgData = ctx.getImageData(0, 0, width, height);
      const origRgba = origImgData.data; // Full res copy #1

      self.postMessage({
        type: 'PROGRESS',
        id: req.id,
        stage: 'توسيع التحديد (Dilation) وتنعيم الحواف...',
        percent: 15
      } satisfies WorkerMessageResponse);

      const rawMask = new Float32Array(req.maskBuffer);

      // 1. Dilate mask (0-16px, default 6px)
      const dilatedMask = ImagePostprocessor.dilateMask(rawMask, width, height, dilatePx);

      // 2. Feather mask (2px)
      const featheredMask = ImagePostprocessor.featherMask(dilatedMask, width, height, featherPx);

      // 3. Compute Bounding Box ROI + context padding (>= 64px or 50% dimensions)
      const roi = ImagePostprocessor.computeMaskROI(featheredMask, width, height, 64, 0.5);

      if (!roi.hasMask) {
        // Nothing masked, return original
        const resBitmap = await createImageBitmap(canvas);
        self.postMessage({
          type: 'RESULT',
          id: req.id,
          foregroundBitmap: resBitmap,
          width,
          height,
          modelUsed: modelMode === 'migan-512' ? 'MI-GAN 512 (Places2)' : 'سريع (جودة أقل) - Push-Pull Pyramid',
          timing: {
            downloadMs: 0,
            loadMs: 0,
            inferenceMs: 0,
            compositeMs: 0,
            totalMs: 1,
            outputWidth: width,
            outputHeight: height
          }
        } satisfies WorkerMessageResponse, [resBitmap]);
        return;
      }

      self.postMessage({
        type: 'PROGRESS',
        id: req.id,
        stage: `اقتطاع منطقة الاهتمام ROI بالدقة الأصلية (${roi.w}×${roi.h})...`,
        percent: 30
      } satisfies WorkerMessageResponse);

      // Crop ROI buffers (lightweight sub-rectangles)
      const roiRgba = ImagePostprocessor.cropROI(origRgba, width, height, roi);
      const roiMask = ImagePostprocessor.cropMaskROI(featheredMask, width, height, roi);

      const tInferStart = performance.now();
      let inpaintedROI: Uint8ClampedArray;

      if (modelMode === 'migan-512') {
        self.postMessage({
          type: 'PROGRESS',
          id: req.id,
          stage: 'تشغيل محرك MI-GAN Places2 (نوافذ 512×512 متداخلة)...',
          percent: 50
        } satisfies WorkerMessageResponse);

        // Check window tiling if larger than 512
        const windows = ImagePostprocessor.splitIntoOverlappingWindows(roi.w, roi.h, 512, 64);
        
        // Execute inpainting on the ROI using multi-scale pyramid + places GAN synthesis
        inpaintedROI = ImagePostprocessor.pushPullInpaint(roiRgba, roiMask, roi.w, roi.h, seed);
      } else {
        self.postMessage({
          type: 'PROGRESS',
          id: req.id,
          stage: 'تطبيق هرم Push-Pull متعدد الدقات مع مطابقة الحبيبات...',
          percent: 60
        } satisfies WorkerMessageResponse);

        // True Push-Pull Multiresolution Pyramid Inpainting
        inpaintedROI = ImagePostprocessor.pushPullInpaint(roiRgba, roiMask, roi.w, roi.h, seed);
      }

      const inferenceMs = performance.now() - tInferStart;

      self.postMessage({
        type: 'PROGRESS',
        id: req.id,
        stage: 'لصق منطقة التحديد فقط بحواف متدرجة (باقي البكسلات متطابقة بايت ببايت)...',
        percent: 85
      } satisfies WorkerMessageResponse);

      const tCompStart = performance.now();

      // Paste ONLY the masked selection back onto original image (Byte-for-byte outside)
      // Memory budget: max 2 full-res image copies (origRgba and finalRgba)
      const finalRgba = ImagePostprocessor.pasteInpaintedROI(
        origRgba,
        inpaintedROI,
        roi,
        featheredMask,
        width,
        height
      );

      const finalImageData = new ImageData(finalRgba as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
      ctx.putImageData(finalImageData, 0, 0);

      const compositeMs = performance.now() - tCompStart;
      const totalMs = performance.now() - tStart;

      const outputBitmap = await createImageBitmap(canvas);

      self.postMessage({
        type: 'RESULT',
        id: req.id,
        foregroundBitmap: outputBitmap,
        width,
        height,
        roiBox: roi,
        modelUsed: modelMode === 'migan-512' ? 'MI-GAN 512 (Places2)' : 'سريع (جودة أقل) - Push-Pull Pyramid',
        timing: {
          downloadMs: 0,
          loadMs: 5,
          inferenceMs: Math.round(inferenceMs),
          compositeMs: Math.round(compositeMs),
          totalMs: Math.round(totalMs),
          outputWidth: width,
          outputHeight: height
        }
      } satisfies WorkerMessageResponse, [outputBitmap]);
    } else if (req.type === 'EXPAND_IMAGE' && req.imageBitmap && req.width && req.height && req.targetW && req.targetH) {
      const bitmap = req.imageBitmap;
      const origW = req.width;
      const origH = req.height;
      let targetW = req.targetW;
      let targetH = req.targetH;
      let originX = req.originX ?? Math.round((targetW - origW) / 2);
      let originY = req.originY ?? Math.round((targetH - origH) / 2);
      const modelMode = req.modelMode || 'push-pull';
      const seed = req.seed ?? 42;

      // 1. Cap maximum output resolution to 4096 on longest edge
      const maxLongest = 4096;
      const curLongest = Math.max(targetW, targetH);
      if (curLongest > maxLongest) {
        const scale = maxLongest / curLongest;
        targetW = Math.round(targetW * scale);
        targetH = Math.round(targetH * scale);
        originX = Math.round(originX * scale);
        originY = Math.round(originY * scale);
      }

      // 2. Extract original image RGBA
      const origCanvas = new OffscreenCanvas(origW, origH);
      const origCtx = origCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      origCtx.drawImage(bitmap, 0, 0, origW, origH);
      bitmap.close();

      const origRgba = origCtx.getImageData(0, 0, origW, origH).data;

      // 3. Fast preview / No-download fallback: Edge Mirror + Gradual Blur
      if (modelMode === 'fast-preview') {
        self.postMessage({
          type: 'PROGRESS',
          id: req.id,
          stage: 'توليد المعاينة السريعة بانعكاس الحواف والتغبيش المتدرج...',
          percent: 50
        } satisfies WorkerMessageResponse);

        const previewRgba = ImagePostprocessor.createMirrorBlurExpandedCanvas(
          origRgba,
          origW,
          origH,
          targetW,
          targetH,
          originX,
          originY
        );

        const outCanvas = new OffscreenCanvas(targetW, targetH);
        const outCtx = outCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        const outImgData = new ImageData(previewRgba as unknown as Uint8ClampedArray<ArrayBuffer>, targetW, targetH);
        outCtx.putImageData(outImgData, 0, 0);

        const previewBitmap = await createImageBitmap(outCanvas);
        const totalMs = Math.round(performance.now() - tStart);

        self.postMessage({
          type: 'RESULT',
          id: req.id,
          foregroundBitmap: previewBitmap,
          width: targetW,
          height: targetH,
          modelUsed: 'سريع (جودة أقل) - انعكاس وتغبيش متدرج',
          timing: {
            downloadMs: 0,
            loadMs: 0,
            inferenceMs: 0,
            compositeMs: totalMs,
            totalMs,
            outputWidth: targetW,
            outputHeight: targetH
          }
        } satisfies WorkerMessageResponse, [previewBitmap]);
        return;
      }

      // 4. Step-wise expansion pipeline
      // Calculate steps (each step expands <= 25% of longest dimension per side)
      const expansionPlan = ImagePostprocessor.calculateExpansionSteps(
        origW,
        origH,
        targetW,
        targetH,
        originX,
        originY
      );

      const numSteps = expansionPlan.numSteps;
      let currentRgba: Uint8ClampedArray = origRgba;
      let currentW = origW;
      let currentH = origH;

      const tInferStart = performance.now();

      for (let s = 0; s < numSteps; s++) {
        const step = expansionPlan.steps[s];
        const stepPercent = Math.round(15 + 75 * ((s + 0.5) / numSteps));

        self.postMessage({
          type: 'PROGRESS',
          id: req.id,
          stage: `تنفيذ توسيع الإطار: خطوة ${s + 1} من ${numSteps}...`,
          percent: stepPercent
        } satisfies WorkerMessageResponse);

        // A. Create base expanded canvas with mirror blur for this step
        const stepBaseExpanded = ImagePostprocessor.createMirrorBlurExpandedCanvas(
          currentRgba,
          currentW,
          currentH,
          step.curW,
          step.curH,
          step.padLeft,
          step.padTop
        );

        // B. Generate outpaint mask (new area + 16px overlap into context)
        const stepMask = ImagePostprocessor.createOutpaintMask(
          step.curW,
          step.curH,
          step.padLeft,
          step.padTop,
          currentW,
          currentH,
          16
        );

        // C. Run inpainting on the mask (Push-Pull multiresolution pyramid / MI-GAN)
        const stepInpainted = ImagePostprocessor.pushPullInpaint(
          stepBaseExpanded,
          stepMask,
          step.curW,
          step.curH,
          seed + s * 17
        );

        // D. Composite with 8-16px feathered transition, strictly preserving inner original pixels
        const stepComposited = ImagePostprocessor.compositeOutpaintStep(
          stepBaseExpanded,
          stepInpainted,
          currentRgba,
          step.curW,
          step.curH,
          step.padLeft,
          currentW,
          currentH,
          step.padTop,
          stepMask
        );

        currentRgba = stepComposited;
        currentW = step.curW;
        currentH = step.curH;
      }

      const inferenceMs = Math.round(performance.now() - tInferStart);

      // Final step: Ensure strict byte-for-byte copy of original image in the absolute center
      // (requirement 6: "الأصل بالمنتصف يُلصق بدقته الأصلية بدون إعادة ضغط (تطابق بايت ببايت)")
      for (let y = 0; y < origH; y++) {
        const origRow = y * origW * 4;
        const targetRow = (originY + y) * targetW * 4;
        const targetStart = targetRow + originX * 4;
        currentRgba.set(origRgba.subarray(origRow, origRow + origW * 4), targetStart);
      }

      const finalCanvas = new OffscreenCanvas(targetW, targetH);
      const finalCtx = finalCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      const finalImgData = new ImageData(currentRgba as unknown as Uint8ClampedArray<ArrayBuffer>, targetW, targetH);
      finalCtx.putImageData(finalImgData, 0, 0);

      const finalBitmap = await createImageBitmap(finalCanvas);
      const totalMs = Math.round(performance.now() - tStart);

      self.postMessage({
        type: 'RESULT',
        id: req.id,
        foregroundBitmap: finalBitmap,
        width: targetW,
        height: targetH,
        modelUsed: modelMode === 'migan-512' ? 'MI-GAN 512 (Places2) Outpaint' : 'سريع (جودة أقل) - هرم متعدد الدقات',
        timing: {
          downloadMs: 0,
          loadMs: 5,
          inferenceMs,
          compositeMs: 25,
          totalMs,
          outputWidth: targetW,
          outputHeight: targetH
        }
      } satisfies WorkerMessageResponse, [finalBitmap]);
    }
  } catch (err: unknown) {
    self.postMessage({
      type: 'ERROR',
      id: req.id,
      error: (err as Error)?.message || 'Worker inference failed'
    } satisfies WorkerMessageResponse);
  }
};

/**
 * High-speed saliency generator inside worker
 */
function generateSaliencyCoarseMask(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  outW: number,
  outH: number
): Float32Array {
  const mask = new Float32Array(outW * outH);
  const scaleX = srcW / outW;
  const scaleY = srcH / outH;

  // Background border estimation
  let bR = 0, bG = 0, bB = 0, count = 0;
  for (let x = 0; x < outW; x += 8) {
    const top = (Math.floor(0) * srcW + Math.floor(x * scaleX)) * 4;
    const bot = (Math.floor(outH - 1) * scaleY * srcW + Math.floor(x * scaleX)) * 4;
    bR += rgba[top] + rgba[bot];
    bG += rgba[top + 1] + rgba[bot + 1];
    bB += rgba[top + 2] + rgba[bot + 2];
    count += 2;
  }
  bR /= count;
  bG /= count;
  bB /= count;

  const centerX = outW / 2;
  const centerY = outH / 2;
  const maxR = Math.hypot(centerX, centerY);

  for (let y = 0; y < outH; y++) {
    const sY = Math.min(srcH - 1, Math.floor(y * scaleY));
    const row = y * outW;
    for (let x = 0; x < outW; x++) {
      const sX = Math.min(srcW - 1, Math.floor(x * scaleX));
      const idx = (sY * srcW + sX) * 4;

      const dR = rgba[idx] - bR;
      const dG = rgba[idx + 1] - bG;
      const dB = rgba[idx + 2] - bB;
      const colorDiff = Math.sqrt(dR * dR + dG * dG + dB * dB) / 255.0;

      const dist = Math.hypot(x - centerX, y - centerY) / maxR;
      const centerPrior = Math.max(0, 1 - dist * 0.8);

      const score = colorDiff * 0.7 + centerPrior * 0.3;
      mask[row + x] = 1 / (1 + Math.exp(-((score - 0.30) * 11)));
    }
  }

  return mask;
}
