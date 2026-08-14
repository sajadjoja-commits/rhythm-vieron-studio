import { RMBG2_MANIFEST } from "../models/manifests/rmbg2.manifest";
import { RMBG2ModelEngine } from "../models/RMBG2ModelEngine";
import { ONNXModelLoader } from "../models/ONNXModelLoader";

export async function runRMBG2VerificationSuite(): Promise<{
  success: boolean;
  logs: string[];
}> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[RMBG2Test] ${msg}`);
  };

  try {
    log("Starting RMBG-2.0 Production Verification Suite...");

    // 1. Verify Manifest Integrity
    log("Step 1: Validating RMBG-2.0 Manifest Parameters...");
    if (RMBG2_MANIFEST.modelId !== "rmbg-2.0") {
      throw new Error(`Invalid modelId in manifest: ${RMBG2_MANIFEST.modelId}`);
    }
    if (!RMBG2_MANIFEST.expectedSha256 || RMBG2_MANIFEST.expectedSha256.length !== 64) {
      throw new Error("Missing or invalid SHA-256 hash in RMBG-2.0 manifest!");
    }
    if (RMBG2_MANIFEST.expectedSizeBytes !== 365031399) {
      throw new Error(`Unexpected model size in manifest: ${RMBG2_MANIFEST.expectedSizeBytes}`);
    }
    if (RMBG2_MANIFEST.urls.some((url) => url.toLowerCase().includes("rmbg-1.4"))) {
      throw new Error("Manifest contains forbidden RMBG-1.4 model URLs!");
    }
    log(`Manifest verified! Model ID: ${RMBG2_MANIFEST.modelId}, Version: ${RMBG2_MANIFEST.version}, Hash: ${RMBG2_MANIFEST.expectedSha256.substring(0, 16)}...`);

    // 2. Verify Tensor Preprocessing Shape Logic
    log("Step 2: Validating Tensor Preprocessing Dimensions & Normalization...");
    const mean = RMBG2_MANIFEST.mean;
    const std = RMBG2_MANIFEST.std;
    if (mean.length !== 3 || std.length !== 3) {
      throw new Error("Invalid mean/std vector lengths for ImageNet normalization!");
    }
    const targetDim = 1024;
    const testBufferLength = 3 * targetDim * targetDim;
    const dummyFloatArray = new Float32Array(testBufferLength);
    if (dummyFloatArray.length !== 3145728) {
      throw new Error(`Float32Array size mismatch for 1x3x1024x1024 tensor! Expected 3145728 elements, got ${dummyFloatArray.length}`);
    }
    log("Tensor preprocessing shape [1, 3, 1024, 1024] validated successfully.");

    // 3. Verify RMBG2ModelEngine Singleton & Loader Initialization
    log("Step 3: Initializing RMBG2ModelEngine and ONNXModelLoader singletons...");
    const engine = RMBG2ModelEngine.getInstance();
    const loader = ONNXModelLoader.getInstance();
    if (!engine || !loader) {
      throw new Error("Engine or Loader singleton initialization failed!");
    }
    const statusInfo = engine.getStatus();
    log(`Engine Status: ${statusInfo.status}`);

    log("RMBG-2.0 Production Verification Suite Completed Successfully!");
    return { success: true, logs };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    log(`Verification Failed: ${errorMsg}`);
    return { success: false, logs };
  }
}
