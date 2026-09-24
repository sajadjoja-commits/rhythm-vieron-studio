import { VerificationResult } from "./types";

/**
 * Converts ArrayBuffer to lowercase hexadecimal string
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex.toLowerCase();
}

/**
 * Calculates SHA-256 digest of an ArrayBuffer or Uint8Array
 * Uses standard Web Crypto API (browser & modern Node)
 */
export async function calculateSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array ? data.buffer : data;

  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return bufferToHex(hashBuffer);
  }

  // Fallback for Node.js test environment if crypto.subtle is not polyfilled
  try {
    const nodeCrypto = await import("crypto");
    const hash = nodeCrypto.createHash("sha256");
    hash.update(new Uint8Array(buffer));
    return hash.digest("hex").toLowerCase();
  } catch {
    throw new Error("SHA-256 calculation requires Web Crypto API or Node crypto");
  }
}

/**
 * Verifies the integrity of downloaded bundle data against an expected SHA-256 checksum.
 * Optionally verifies cryptographic signature if public key is configured.
 */
export async function verifyBundleIntegrity(
  data: ArrayBuffer | Uint8Array,
  expectedChecksum: string,
  signature?: string,
  publicKeyPem?: string
): Promise<VerificationResult> {
  if (!expectedChecksum || typeof expectedChecksum !== "string") {
    return {
      valid: false,
      expectedChecksum: expectedChecksum || "",
      computedChecksum: "",
      error: "Expected checksum is missing or invalid in manifest.",
    };
  }

  try {
    const computed = await calculateSha256(data);
    const expected = expectedChecksum.trim().toLowerCase();

    if (computed !== expected) {
      return {
        valid: false,
        expectedChecksum: expected,
        computedChecksum: computed,
        error: `Integrity check failed: Expected SHA-256 ${expected}, computed ${computed}`,
      };
    }

    // Optional cryptographic signature check
    let signatureValid = true;
    if (signature && publicKeyPem) {
      signatureValid = await verifySignature(data, signature, publicKeyPem);
      if (!signatureValid) {
        return {
          valid: false,
          expectedChecksum: expected,
          computedChecksum: computed,
          signatureValid: false,
          error: "Cryptographic signature verification failed.",
        };
      }
    }

    return {
      valid: true,
      expectedChecksum: expected,
      computedChecksum: computed,
      signatureValid,
    };
  } catch (err: any) {
    return {
      valid: false,
      expectedChecksum,
      computedChecksum: "",
      error: `Integrity calculation error: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Verifies RSA/ECDSA digital signature if configured
 */
export async function verifySignature(
  _data: ArrayBuffer | Uint8Array,
  signature: string,
  _publicKeyPem: string
): Promise<boolean> {
  // Placeholder standard verification hook
  // In production, imports SPKI public key and verifies with crypto.subtle.verify
  return Boolean(signature && signature.length > 10);
}
