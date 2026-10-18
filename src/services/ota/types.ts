/**
 * Phase 6: Safe OTA Web Engine Types & Contracts
 */

export type OtaChannel = "staging" | "production";

export enum OtaState {
  IDLE = "IDLE",
  CHECKING = "CHECKING",
  AVAILABLE = "AVAILABLE",
  DOWNLOADING = "DOWNLOADING",
  VERIFYING = "VERIFYING",
  READY = "READY",
  ACTIVATING = "ACTIVATING",
  ACTIVE = "ACTIVE",
  FAILED = "FAILED",
  ROLLED_BACK = "ROLLED_BACK",
  INCOMPATIBLE = "INCOMPATIBLE",
}

/**
 * Standardized OTA Web Bundle Manifest
 */
export interface OtaManifest {
  channel: OtaChannel;
  version: string;
  build: number;
  bundleUrl: string;
  checksum: string; // SHA-256 hex string (lowercase)
  size: number; // Size in bytes
  minNativeVersion: string; // Minimum required native APK version (e.g. "1.0.0")
  maxNativeVersion?: string | null; // Optional maximum compatible native version
  createdAt: string; // ISO 8601 string
  releaseNotes?: string;
  signature?: string; // Optional cryptographic signature (e.g., RSA-SHA256)
}

/**
 * Hardware and Native Engine Capabilities Contract
 * Exposed by the APK Native Engine to prevent Web bundle incompatibility
 */
export interface NativeCapabilities {
  nativeVersion: string;
  buildNumber: number;
  mediaApiVersion: string;
  sttApiVersion: string;
  modelManagerApiVersion: string;
  capabilities: string[];
}

/**
 * Information regarding an installed or active OTA version
 */
export interface OtaVersionInfo {
  version: string;
  channel: OtaChannel;
  isCurrent: boolean;
  isBundled: boolean;
  installedAt: string;
  checksum: string;
  status: "ready" | "active" | "failed" | "rolled_back";
}

/**
 * Result of compatibility check
 */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
  currentNativeVersion: string;
  requiredMinNativeVersion: string;
  requiredMaxNativeVersion?: string | null;
}

/**
 * Result of checksum or signature verification
 */
export interface VerificationResult {
  valid: boolean;
  expectedChecksum: string;
  computedChecksum: string;
  signatureValid?: boolean;
  error?: string;
}

/**
 * State update event payload
 */
export interface OtaStateChangeEvent {
  state: OtaState;
  manifest?: OtaManifest | null;
  progress?: number;
  error?: string | null;
  activeVersion?: string;
}
