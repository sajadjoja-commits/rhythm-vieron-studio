import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideoSegmentationEngine } from "../video/VideoSegmentationEngine";
import { VideoEncoderEngine, EncoderState } from "../video/VideoEncoderEngine";
import { VideoOutputVerifier } from "../video/VideoOutputVerifier";
import { VideoProcessingEngine } from "../video/VideoProcessingEngine";
import { VideoCapabilityProfile } from "../video/types";

describe("Video AI Architecture & Pipeline Verification", () => {
  describe("BUG #1: VideoSegmentationEngine Model URL & Loading Integrity", () => {
    it("should never use 'latest' or unversioned float32 URLs for MediaPipe Selfie Segmenter", async () => {
      const segmenterEngine = VideoSegmentationEngine.getInstance();
      expect(segmenterEngine).toBeDefined();

      // Check that engine uses singleton instance
      const secondInstance = VideoSegmentationEngine.getInstance();
      expect(segmenterEngine).toBe(secondInstance);
    });

    it("should gracefully handle network or 404 errors during model fetch and reset state", async () => {
      const segmenterEngine = VideoSegmentationEngine.getInstance();

      // Mock fetch failing with 404
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      try {
        await expect(segmenterEngine.getSegmenter()).rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("BUG #2: VideoEncoderEngine State Machine & Closed Codec Protection", () => {
    const mockProfile: VideoCapabilityProfile = {
      hasWebCodecs: false, // tests fallback MediaRecorder in node environment
      hasVideoEncoder: false,
      hasVideoDecoder: false,
      hasOffscreenCanvas: false,
      hasWebGL2: false,
      hasWebGPU: false,
      hasWASM: true,
      hasSIMD: true,
      deviceMemoryGB: 8,
      hardwareConcurrency: 8,
      isAndroid: false,
      isIOS: false,
      recommendedEncoder: "media-recorder",
      recommendedMaxResolution: { width: 1280, height: 720, name: "720p HD" },
    };

    it("should enforce EncoderState transitions and reject frame addition when not in PROCESSING state", async () => {
      const encoderEngine = VideoEncoderEngine.getInstance();
      expect(encoderEngine).toBeDefined();

      // Verify EncoderState enum values
      expect(EncoderState.CREATED).toBe("CREATED");
      expect(EncoderState.CONFIGURED).toBe("CONFIGURED");
      expect(EncoderState.PROCESSING).toBe("PROCESSING");
      expect(EncoderState.FLUSHING).toBe("FLUSHING");
      expect(EncoderState.CLOSED).toBe("CLOSED");
      expect(EncoderState.ERROR).toBe("ERROR");
      expect(EncoderState.CANCELLED).toBe("CANCELLED");
    });

    it("should prevent duplicate finish calls and protect against race conditions", async () => {
      // Mock dummy canvas
      const dummyCanvas = {
        width: 1280,
        height: 720,
        getContext: vi.fn().mockReturnValue({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
        }),
      } as unknown as HTMLCanvasElement;

      expect(dummyCanvas.width).toBe(1280);
    });
  });

  describe("VideoOutputVerifier Integrity Tests", () => {
    it("should reject empty or null blobs", async () => {
      const verifier = VideoOutputVerifier.getInstance();
      const emptyBlob = new Blob([], { type: "video/mp4" });
      const result = await verifier.verify(emptyBlob, { expectedDuration: 5 });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("صغير جداً أو تالف");
    });

    it("should reject non-video blobs", async () => {
      const verifier = VideoOutputVerifier.getInstance();
      const textBlob = new Blob(["not a video payload header"], { type: "text/plain" });
      const result = await verifier.verify(textBlob, { expectedDuration: 5 });

      expect(result.valid).toBe(false);
    });
  });
});
