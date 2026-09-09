// Vision & Detection Engine for Vireon AI Studio (Face & Hand Analysis)
import { FilesetResolver, FaceDetector, HandLandmarker } from "@mediapipe/tasks-vision";

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

export type VisionEngineMode = "mediapipe" | "fallback" | "none";

let faceDetectorInstance: FaceDetector | null = null;
let handLandmarkerInstance: HandLandmarker | null = null;
let detectorInitPromise: Promise<void> | null = null;
let isDetectorAvailable = true;
let lastFailureTime = 0;
let lastSessionEngineUsed: VisionEngineMode = "none";
let sessionStats = {
  realMediaPipeFrames: 0,
  fallbackFrames: 0,
  facesDetected: 0,
  handsDetected: 0,
};

// Significantly increased timeout (10 seconds) to ensure reliable model initialization on mobile networks
const MEDIAPIPE_INIT_TIMEOUT_MS = 10000;

// Local bundled assets vs CDN fallback urls
const WASM_SOURCES = [
  typeof window !== "undefined" ? `${window.location.origin}/mediapipe/wasm` : "/mediapipe/wasm",
  "/mediapipe/wasm",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
];

const FACE_MODEL_SOURCES = [
  "/models/mediapipe/blaze_face_short_range.tflite",
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
];

const HAND_MODEL_SOURCES = [
  "/models/mediapipe/hand_landmarker.task",
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
];

/**
 * Loads the MediaPipe vision fileset trying local static assets first, then CDN fallback
 */
async function loadVisionFileset(): Promise<any> {
  let lastErr: any = null;
  for (const wasmPath of WASM_SOURCES) {
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      const isLocal = !wasmPath.includes("cdn");
      console.log(`[VisionAnalyzer] 🟢 MediaPipe WASM Fileset resolved from ${isLocal ? "LOCAL static assets" : "CDN fallback"} (${wasmPath})`);
      return vision;
    } catch (e) {
      lastErr = e;
      console.warn(`[VisionAnalyzer] WASM load attempt failed for ${wasmPath}, trying next...`, e);
    }
  }
  throw lastErr || new Error("Unable to resolve MediaPipe vision tasks fileset");
}

/**
 * Initializes FaceDetector trying local model assets and GPU/CPU delegates
 */
async function createFaceDetector(vision: any): Promise<FaceDetector> {
  const delegates: ("GPU" | "CPU")[] = ["GPU", "CPU"];
  let lastErr: any = null;

  for (const modelPath of FACE_MODEL_SOURCES) {
    for (const delegate of delegates) {
      try {
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate,
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.4,
        });
        const isLocal = modelPath.startsWith("/");
        console.log(`[VisionAnalyzer] 🟢 FaceDetector ready (Source: ${isLocal ? "LOCAL asset" : "CDN"}, Delegate: ${delegate})`);
        return detector;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error("Failed to initialize FaceDetector");
}

/**
 * Initializes HandLandmarker trying local model assets and GPU/CPU delegates
 */
async function createHandLandmarker(vision: any): Promise<HandLandmarker> {
  const delegates: ("GPU" | "CPU")[] = ["GPU", "CPU"];
  let lastErr: any = null;

  for (const modelPath of HAND_MODEL_SOURCES) {
    for (const delegate of delegates) {
      try {
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate,
          },
          runningMode: "IMAGE",
          numHands: 2,
          minHandDetectionConfidence: 0.4,
        });
        const isLocal = modelPath.startsWith("/");
        console.log(`[VisionAnalyzer] 🟢 HandLandmarker ready (Source: ${isLocal ? "LOCAL asset" : "CDN"}, Delegate: ${delegate})`);
        return landmarker;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error("Failed to initialize HandLandmarker");
}

/**
 * Resets detector state and allows retry on next montage or beat-cut session
 */
export function resetVisionDetector(): void {
  isDetectorAvailable = true;
  detectorInitPromise = null;
  lastFailureTime = 0;
  lastSessionEngineUsed = "none";
  sessionStats = {
    realMediaPipeFrames: 0,
    fallbackFrames: 0,
    facesDetected: 0,
    handsDetected: 0,
  };
  console.log("[VisionAnalyzer] Reset vision detector status for new analysis session");
}

/**
 * Returns diagnostic status and current session telemetry
 */
export function getVisionAnalysisStatus(): {
  isDetectorAvailable: boolean;
  isInitialized: boolean;
  lastEngineUsed: VisionEngineMode;
  sessionStats: typeof sessionStats;
} {
  return {
    isDetectorAvailable,
    isInitialized: !!(faceDetectorInstance || handLandmarkerInstance),
    lastEngineUsed: lastSessionEngineUsed,
    sessionStats: { ...sessionStats },
  };
}

/**
 * Initializes MediaPipe Face and Hand landmarker tasks with bundled local files & generous timeout
 */
async function initVisionTasks(): Promise<void> {
  if (faceDetectorInstance || handLandmarkerInstance) return;
  if (detectorInitPromise) return detectorInitPromise;

  detectorInitPromise = (async () => {
    try {
      console.log(`[VisionAnalyzer] Initializing MediaPipe AI Vision (timeout: ${MEDIAPIPE_INIT_TIMEOUT_MS}ms, local-first)...`);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MediaPipe init timeout after ${MEDIAPIPE_INIT_TIMEOUT_MS}ms`)), MEDIAPIPE_INIT_TIMEOUT_MS)
      );

      const loadPromise = (async () => {
        const vision = await loadVisionFileset();

        // Concurrently initialize Face Detector and Hand Landmarker
        const [faceRes, handRes] = await Promise.allSettled([
          createFaceDetector(vision),
          createHandLandmarker(vision),
        ]);

        if (faceRes.status === "fulfilled") {
          faceDetectorInstance = faceRes.value;
        } else {
          console.warn("[VisionAnalyzer] FaceDetector init non-fatal warning:", faceRes.reason);
        }

        if (handRes.status === "fulfilled") {
          handLandmarkerInstance = handRes.value;
        } else {
          console.warn("[VisionAnalyzer] HandLandmarker init non-fatal warning:", handRes.reason);
        }

        if (!faceDetectorInstance && !handLandmarkerInstance) {
          throw new Error("Both FaceDetector and HandLandmarker failed to initialize");
        }

        isDetectorAvailable = true;
        console.log("[VisionAnalyzer] 🚀 MediaPipe AI Vision Engine fully initialized and active!");
      })();

      await Promise.race([loadPromise, timeoutPromise]);
    } catch (err) {
      console.warn("[VisionAnalyzer] ⚠️ MediaPipe Vision unavailable or timed out, will allow retry on next session:", err);
      isDetectorAvailable = false;
      lastFailureTime = Date.now();
      detectorInitPromise = null; // Clear so subsequent session can retry!
    }
  })();

  return detectorInitPromise;
}

/**
 * Analyzes a canvas frame for faces and hands with fast fallback
 */
export async function analyzeFrameVision(canvas: HTMLCanvasElement): Promise<VisionFrameAnalysis> {
  // If previously failed, allow retry if > 4 seconds passed (e.g. user started another beat-cut session)
  if (!isDetectorAvailable) {
    const elapsedSinceFailure = Date.now() - lastFailureTime;
    if (elapsedSinceFailure > 4000) {
      isDetectorAvailable = true;
      detectorInitPromise = null;
    } else {
      lastSessionEngineUsed = "fallback";
      sessionStats.fallbackFrames++;
      return fallbackCanvasVisionAnalysis(canvas);
    }
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
            sessionStats.facesDetected += faceCount;
          }
        }
      }

      if (handLandmarkerInstance) {
        const handRes = handLandmarkerInstance.detect(canvas);
        if (handRes && handRes.landmarks) {
          handCount = handRes.landmarks.length;
          hasHands = handCount > 0;
          sessionStats.handsDetected += handCount;
          for (const landmarks of handRes.landmarks) {
            if (landmarks[0]) {
              handPositions.push({ x: landmarks[0].x, y: landmarks[0].y });
            }
          }
        }
      }

      lastSessionEngineUsed = "mediapipe";
      sessionStats.realMediaPipeFrames++;

      console.log(`[VisionAnalyzer] 🟢 Real MediaPipe detection active: faces=${faceCount} (conf=${faceConfidence.toFixed(2)}), hands=${handCount}`);

      return {
        faceCount,
        faceConfidence,
        hasHands,
        handCount,
        handPositions
      };
    }
  } catch (e) {
    console.warn("[VisionAnalyzer] Error during MediaPipe frame detection:", e);
  }

  lastSessionEngineUsed = "fallback";
  sessionStats.fallbackFrames++;
  console.warn("[VisionAnalyzer] 🟡 Fallback canvas heuristic used (skin-tone pixel counter)");
  return fallbackCanvasVisionAnalysis(canvas);
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

/**
 * Explicitly releases MediaPipe models and WebGL contexts to prevent Android out-of-memory crashes
 */
export function disposeVisionModels(): void {
  try {
    if (faceDetectorInstance) {
      (faceDetectorInstance as any).close?.();
      faceDetectorInstance = null;
    }
  } catch (e) {
    console.debug("Error closing face detector:", e);
  }

  try {
    if (handLandmarkerInstance) {
      (handLandmarkerInstance as any).close?.();
      handLandmarkerInstance = null;
    }
  } catch (e) {
    console.debug("Error closing hand landmarker:", e);
  }

  detectorInitPromise = null;
  isDetectorAvailable = true;
  lastFailureTime = 0;
}

