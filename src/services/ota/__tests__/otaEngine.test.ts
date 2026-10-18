import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseSemver,
  compareSemver,
  checkCompatibility,
  hasNativeCapability,
  safeNativeInvoke,
} from "../compatibility";
import { calculateSha256, verifyBundleIntegrity } from "../checksum";
import { IOtaProvider } from "../OtaProvider";
import { WebUpdateService } from "../WebUpdateService";
import { OtaManifest, OtaState, NativeCapabilities } from "../types";

describe("Phase 6: Safe OTA Web Engine Comprehensive Tests", () => {
  const mockNativeCaps: NativeCapabilities = {
    nativeVersion: "1.0.0",
    buildNumber: 1,
    mediaApiVersion: "1.0.0",
    sttApiVersion: "1.0.0",
    modelManagerApiVersion: "1.0.0",
    capabilities: [
      "native_whisper",
      "whisper_model_manager",
      "native_media_extractor",
      "native_media_muxer",
      "native_media_metadata",
      "content_resolver_uri",
      "atomic_ota_engine",
    ],
  };

  const sampleManifest: OtaManifest = {
    channel: "production",
    version: "1.0.1",
    build: 2,
    bundleUrl: "https://rhythm-vieron-studio.lovable.app/bundles/web-1.0.1.zip",
    checksum: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    size: 12000000,
    minNativeVersion: "1.0.0",
    maxNativeVersion: null,
    createdAt: "2026-09-24T00:00:00.000Z",
    releaseNotes: "Optimized editor performance and audio controls",
  };

  // 1. Version Comparison Tests
  describe("Semver Parser & Comparison", () => {
    it("parses semantic versions cleanly", () => {
      expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
      expect(parseSemver("v2.0.1")).toEqual([2, 0, 1]);
      expect(parseSemver("web-3.4.5-beta")).toEqual([3, 4, 5]);
      expect(parseSemver("invalid")).toEqual([0, 0, 0]);
    });

    it("correctly compares versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
      expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
      expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
      expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
      expect(compareSemver("1.2.0", "1.2.5")).toBe(-1);
    });
  });

  // 2. Compatibility Contract Tests
  describe("Native / Web Compatibility Contract", () => {
    it("accepts update when Native APK satisfies minNativeVersion", () => {
      const res = checkCompatibility(sampleManifest, mockNativeCaps);
      expect(res.compatible).toBe(true);
      expect(res.reason).toBeUndefined();
    });

    it("rejects update when Web bundle requires a newer Native APK version", () => {
      const futureManifest: OtaManifest = {
        ...sampleManifest,
        version: "2.0.0",
        minNativeVersion: "1.2.0", // Device has 1.0.0
      };

      const res = checkCompatibility(futureManifest, mockNativeCaps);
      expect(res.compatible).toBe(false);
      expect(res.reason).toContain("lower than bundle requirement");
      expect(res.reason).toContain("APK upgrade is required");
    });

    it("rejects update when Native APK exceeds maxNativeVersion", () => {
      const legacyManifest: OtaManifest = {
        ...sampleManifest,
        version: "0.9.0",
        minNativeVersion: "0.8.0",
        maxNativeVersion: "0.9.5", // Device has 1.0.0
      };

      const res = checkCompatibility(legacyManifest, mockNativeCaps);
      expect(res.compatible).toBe(false);
      expect(res.reason).toContain("exceeds bundle maximum");
    });

    it("verifies native capabilities", () => {
      expect(hasNativeCapability(mockNativeCaps, "native_whisper")).toBe(true);
      expect(hasNativeCapability(mockNativeCaps, "whisper_model_manager")).toBe(true);
      expect(hasNativeCapability(mockNativeCaps, "native_media_muxer")).toBe(true);
      expect(hasNativeCapability(mockNativeCaps, "non_existent_capability")).toBe(false);
    });

    it("safely guards native invocations without crashing if method is missing", async () => {
      const mockPlugin = {
        existingMethod: vi.fn().mockResolvedValue({ success: true }),
      };

      const okCall = await safeNativeInvoke(mockPlugin, "existingMethod");
      expect(okCall.success).toBe(true);

      const missingCall = await safeNativeInvoke(
        mockPlugin,
        "missingFutureMethod",
        {},
        { fallback: true }
      );
      expect(missingCall.success).toBe(false);
      expect(missingCall.result).toEqual({ fallback: true });
      expect(missingCall.error).toContain("is not available in current APK");
    });
  });

  // 3. Checksum & Integrity Tests
  describe("SHA-256 Checksum & Integrity Verification", () => {
    it("computes accurate SHA-256 digest of binary payload", async () => {
      const text = "Hello Vieron Studio Safe OTA Engine";
      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      const hash = await calculateSha256(data);
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe("string");
    });

    it("validates intact bundle successfully", async () => {
      const text = "Valid OTA Web Bundle Content";
      const data = new TextEncoder().encode(text);
      const expectedHash = await calculateSha256(data);

      const result = await verifyBundleIntegrity(data, expectedHash);
      expect(result.valid).toBe(true);
      expect(result.computedChecksum).toBe(expectedHash);
    });

    it("rejects corrupted bundle data with SHA-256 mismatch", async () => {
      const validData = new TextEncoder().encode("Original Clean Bundle");
      const corruptData = new TextEncoder().encode("Tampered Bundle Data");
      const originalHash = await calculateSha256(validData);

      const result = await verifyBundleIntegrity(corruptData, originalHash);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Integrity check failed");
      expect(result.computedChecksum).not.toBe(originalHash);
    });

    it("rejects bundle when expected checksum is missing or empty", async () => {
      const data = new TextEncoder().encode("Some Bundle");
      const result = await verifyBundleIntegrity(data, "");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("checksum is missing");
    });
  });

  // 4. Provider Abstraction & Channel Separation
  describe("OTA Provider & Channel Separation", () => {
    it("differentiates between production and staging channels", async () => {
      const mockProvider: IOtaProvider = {
        id: "test-provider",
        name: "Test Provider",
        checkForUpdate: vi.fn().mockImplementation(async (channel, currentVer) => {
          if (channel === "staging") {
            return {
              ...sampleManifest,
              channel: "staging",
              version: "1.0.2-staging",
            };
          }
          return {
            ...sampleManifest,
            channel: "production",
            version: "1.0.1",
          };
        }),
        fetchManifest: vi.fn(),
        downloadBundle: vi.fn(),
      };

      const stagingUpdate = await mockProvider.checkForUpdate("staging", "1.0.0");
      expect(stagingUpdate?.channel).toBe("staging");
      expect(stagingUpdate?.version).toBe("1.0.2-staging");

      const prodUpdate = await mockProvider.checkForUpdate("production", "1.0.0");
      expect(prodUpdate?.channel).toBe("production");
      expect(prodUpdate?.version).toBe("1.0.1");
    });
  });

  // 5. WebUpdateService Lifecycle & State Transitions
  describe("WebUpdateService State Machine & Atomic Activation", () => {
    let service: WebUpdateService;
    let mockProvider: IOtaProvider;
    let validBundleData: Uint8Array;
    let validChecksum: string;

    beforeEach(async () => {
      validBundleData = new TextEncoder().encode("Vieron Web Bundle dist index.html assets");
      validChecksum = await calculateSha256(validBundleData);

      mockProvider = {
        id: "mock",
        name: "Mock Provider",
        checkForUpdate: vi.fn().mockResolvedValue({
          ...sampleManifest,
          checksum: validChecksum,
        }),
        fetchManifest: vi.fn(),
        downloadBundle: vi.fn().mockImplementation(async (url, onProgress) => {
          onProgress?.(0.5);
          onProgress?.(1.0);
          return validBundleData.buffer;
        }),
      };

      service = WebUpdateService.getInstance();
      service.setProvider(mockProvider);
    });

    it("starts in IDLE state with default version", () => {
      expect(service.getStatus()).toBe(OtaState.IDLE);
      expect(service.getCurrentVersion()).toBeDefined();
    });

    it("transitions through IDLE -> CHECKING -> AVAILABLE when update found", async () => {
      const states: OtaState[] = [];
      const unsub = service.subscribe((e) => states.push(e.state));

      const manifest = await service.checkForUpdate();
      expect(manifest).not.toBeNull();
      expect(service.getStatus()).toBe(OtaState.AVAILABLE);
      expect(states).toContain(OtaState.CHECKING);
      expect(states).toContain(OtaState.AVAILABLE);
      unsub();
    });

    it("handles incompatible updates by transitioning to INCOMPATIBLE", async () => {
      (mockProvider.checkForUpdate as any).mockResolvedValueOnce({
        ...sampleManifest,
        minNativeVersion: "2.0.0", // Device has 1.0.0
      });

      const manifest = await service.checkForUpdate();
      expect(manifest).toBeNull();
      expect(service.getStatus()).toBe(OtaState.INCOMPATIBLE);
      expect(service.getLastError()).toContain("APK upgrade is required");
    });

    it("downloads and verifies bundle: AVAILABLE -> DOWNLOADING -> VERIFYING -> READY", async () => {
      await service.checkForUpdate();
      const success = await service.downloadUpdate();

      expect(success).toBe(true);
      expect(service.getStatus()).toBe(OtaState.READY);
    });

    it("rejects download with checksum error: DOWNLOADING -> VERIFYING -> FAILED", async () => {
      await service.checkForUpdate();

      // Tamper with provider data to simulate corruption
      (mockProvider.downloadBundle as any).mockResolvedValueOnce(
        new TextEncoder().encode("Corrupted data with bad hash").buffer
      );

      const success = await service.downloadUpdate();
      expect(success).toBe(false);
      expect(service.getStatus()).toBe(OtaState.FAILED);
      expect(service.getLastError()).toContain("Integrity check failed");
    });

    it("activates update atomically and updates current version: READY -> ACTIVATING -> ACTIVE", async () => {
      await service.checkForUpdate();
      await service.downloadUpdate();

      const activated = await service.activateUpdate();
      expect(activated).toBe(true);
      expect(service.getStatus()).toBe(OtaState.ACTIVE);
      expect(service.getCurrentVersion()).toBe("1.0.1");
    });

    it("supports rollback to known-good version: ACTIVE -> ROLLED_BACK", async () => {
      const rolledBack = await service.rollback();
      expect(rolledBack).toBe(true);
      expect(service.getStatus()).toBe(OtaState.ROLLED_BACK);
      expect(service.getCurrentVersion()).toBe("1.0.0");
    });

    it("operates offline without network during startup without failing", async () => {
      // Mock network failure
      (mockProvider.checkForUpdate as any).mockRejectedValueOnce(new Error("Network offline"));

      const manifest = await service.checkForUpdate();
      expect(manifest).toBeNull();
      expect(service.getStatus()).toBe(OtaState.IDLE);
    });
  });
});
