// Vision & Detection Engine for Vireon AI Studio (Face & Hand Analysis)
import { FilesetResolver, FaceDetector, HandLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

export interface VisionFrameAnalysis {
  faceCount: number;
  faceConfidence: number;
  hasHands: boolean;
  handCount: number;
  handPositions: { x: number; y: number }[];
}

export interface SegmentVisionScore {
  faceScore: number;         // 0..1 (face presence/prominence)
  handScore: number;         // 0..1 (hand presence)
  handVelocityScore: number; // 0..1 (hand movement speed/activity between frames)
}

let faceDetectorInstance: FaceDetector | null = null;
let handLandmarkerInstance: HandLandmarker | null = null;
let imageSegmenterInstance: ImageSegmenter | null = null;
let detectorInitPromise: Promise<void> | null = null;
let isDetectorAvailable = true;

/**
 * Initializes MediaPipe Face and Hand landmarker tasks with CDN files & 1200ms strict timeout
 */
async function initVisionTasks(): Promise<void> {
  if (detectorInitPromise) return detectorInitPromise;

  detectorInitPromise = (async () => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MediaPipe init timeout")), 1200)
      );

      const loadPromise = (async () => {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        // Initialize Face Detector with fallback
        try {
          faceDetectorInstance = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "GPU"
            },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.4
          });
        } catch {
          faceDetectorInstance = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
            },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.4
          });
        }

        // Initialize Hand Landmarker with fallback
        try {
          handLandmarkerInstance = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU"
            },
            runningMode: "IMAGE",
            numHands: 2,
            minHandDetectionConfidence: 0.4
          });
        } catch {
          handLandmarkerInstance = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
            },
            runningMode: "IMAGE",
            numHands: 2,
            minHandDetectionConfidence: 0.4
          });
        }

        // Initialize Image Segmenter
        try {
          imageSegmenterInstance = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
              delegate: "GPU"
            },
            runningMode: "IMAGE",
            outputCategoryMask: true,
            outputConfidenceMasks: false
          });
        } catch {
           imageSegmenterInstance = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite"
            },
            runningMode: "IMAGE",
            outputCategoryMask: true,
            outputConfidenceMasks: false
          });
        }
      })();

      await Promise.race([loadPromise, timeoutPromise]);
    } catch (err) {
      console.warn("MediaPipe Vision tasks unavailable or timed out, using fast canvas heuristics fallback:", err);
      isDetectorAvailable = false;
    }
  })();

  return detectorInitPromise;
}

/**
 * Analyzes a canvas frame for faces and hands with fast fallback
 */
export async function analyzeFrameVision(canvas: HTMLCanvasElement): Promise<VisionFrameAnalysis> {
  if (!isDetectorAvailable) {
    return fallbackCanvasVisionAnalysis(canvas);
  }

  try {
    await initVisionTasks();

    if (isDetectorAvailable && (faceDetectorInstance || handLandmarkerInstance)) {
      let faceCount = 0;
      let faceConfidence = 0;
      let hasHands = false;
      let handCount = 0;
      const handPositions: { x: number; y: number }[] = [];

      if (faceDetectorInstance) {
        const faceRes = faceDetectorInstance.detect(canvas);
        if (faceRes && faceRes.detections) {
          faceCount = faceRes.detections.length;
          if (faceCount > 0) {
            faceConfidence = faceRes.detections[0].categories[0]?.score || 0.7;
          }
        }
      }

      if (handLandmarkerInstance) {
        const handRes = handLandmarkerInstance.detect(canvas);
        if (handRes && handRes.landmarks) {
          handCount = handRes.landmarks.length;
          hasHands = handCount > 0;
          for (const landmarks of handRes.landmarks) {
            if (landmarks[0]) {
              handPositions.push({ x: landmarks[0].x, y: landmarks[0].y });
            }
          }
        }
      }

      return {
        faceCount,
        faceConfidence,
        hasHands,
        handCount,
        handPositions
      };
    }
  } catch (e) {
    console.warn("Error running MediaPipe vision detection on frame:", e);
  }

  return fallbackCanvasVisionAnalysis(canvas);
}

/**
 * Removes background from a canvas/image using MediaPipe
 */
export async function removeBackgroundLocal(canvas: HTMLCanvasElement): Promise<Blob | null> {
  try {
    await initVisionTasks();
    if (!imageSegmenterInstance) return null;

    const result = imageSegmenterInstance.segment(canvas);
    const mask = result.categoryMask;
    if (!mask) return null;

    const { width, height } = canvas;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const maskData = mask.getAsUint8Array();

    for (let i = 0; i < maskData.length; i++) {
        // In selfie segmenter, index 0 is background, index 1 is person
        if (maskData[i] === 0) {
            data[i * 4 + 3] = 0; // Set alpha to 0 for background
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return new Promise(res => canvas.toBlob(res, "image/png"));
  } catch (e) {
    console.error("Local background removal failed:", e);
    return null;
  }
}

/**
 * Fast pixel-based skin tone & feature blob heuristic fallback
 */
function fallbackCanvasVisionAnalysis(canvas: HTMLCanvasElement): VisionFrameAnalysis {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { faceCount: 0, faceConfidence: 0, hasHands: false, handCount: 0, handPositions: [] };
  }

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let skinPixels = 0;
  const totalPixels = width * height;
  let skinXSum = 0;
  let skinYSum = 0;

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 60 && g > 35 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
      skinPixels++;
      const pixelIdx = i / 4;
      skinXSum += (pixelIdx % width) / width;
      skinYSum += Math.floor(pixelIdx / width) / height;
    }
  }

  const skinRatio = skinPixels / (totalPixels / 4);

  const handPositions = skinRatio > 0.04
    ? [{ x: skinXSum / (skinPixels || 1), y: skinYSum / (skinPixels || 1) }]
    : [];

  return {
    faceCount: skinRatio > 0.18 ? 1 : 0,
    faceConfidence: Math.min(1, skinRatio * 3),
    hasHands: skinRatio > 0.05 && skinRatio <= 0.25,
    handCount: skinRatio > 0.05 ? 1 : 0,
    handPositions
  };
}

export function computeVisionSegmentScore(
  frames: VisionFrameAnalysis[]
): SegmentVisionScore {
  if (frames.length === 0) {
    return { faceScore: 0, handScore: 0, handVelocityScore: 0 };
  }

  let totalFaceConfidence = 0;
  let totalHands = 0;
  let handMovementDistance = 0;
  let prevHandPos: { x: number; y: number } | null = null;

  for (const f of frames) {
    if (f.faceCount > 0) {
      totalFaceConfidence += f.faceConfidence;
    }
    if (f.hasHands) {
      totalHands++;
    }

    if (f.handPositions.length > 0) {
      const currentPos = f.handPositions[0];
      if (prevHandPos) {
        const dx = currentPos.x - prevHandPos.x;
        const dy = currentPos.y - prevHandPos.y;
        handMovementDistance += Math.sqrt(dx * dx + dy * dy);
      }
      prevHandPos = currentPos;
    }
  }

  const faceScore = Math.min(1, totalFaceConfidence / frames.length);
  const handScore = Math.min(1, totalHands / frames.length);
  const avgMovementPerFrame = handMovementDistance / Math.max(1, frames.length - 1);
  const handVelocityScore = Math.min(1, avgMovementPerFrame * 8);

  return {
    faceScore,
    handScore,
    handVelocityScore
  };
}
