/**
 * Image AI Web Worker
 * Offloads heavy tensor calculations, tile processing, and image encoding from main thread.
 */

import { ImageWorkerRequest, ImageWorkerResponse, ImageAIProgressEvent } from "../types";
import { ImageInferenceEngine } from "../ImageInferenceEngine";

self.onmessage = async (e: MessageEvent<ImageWorkerRequest>) => {
  const req = e.data;
  if (!req || !req.id) return;

  const engine = ImageInferenceEngine.getInstance();

  const handleProgress = (prog: ImageAIProgressEvent) => {
    const response: ImageWorkerResponse = {
      id: req.id,
      type: "progress",
      progress: prog,
    };
    self.postMessage(response);
  };

  try {
    let result;
    const opts = {
      ...req.options,
      onProgress: handleProgress,
    };

    switch (req.taskType) {
      case "remove-background":
        result = await engine.removeBackground(req.imageDataUrl, opts);
        break;
      case "face-enhance":
        result = await engine.enhanceFace(req.imageDataUrl, opts);
        break;
      case "enhance":
        result = await engine.enhanceImage(req.imageDataUrl, opts);
        break;
      case "object-remove":
        result = await engine.removeObject(req.imageDataUrl, req.maskDataUrl || "", opts);
        break;
      default:
        throw new Error(`Unsupported task type: ${req.taskType}`);
    }

    const response: ImageWorkerResponse = {
      id: req.id,
      type: "result",
      result,
    };
    self.postMessage(response);
  } catch (err: any) {
    const response: ImageWorkerResponse = {
      id: req.id,
      type: "error",
      error: err?.message || String(err),
    };
    self.postMessage(response);
  }
};
