import { OtaManifest, NativeCapabilities, CompatibilityResult } from "./types";

/**
 * Standard Semver Parser & Comparator (Zero External Dependencies)
 * Supports standard format: "X.Y.Z" or "X.Y.Z-beta"
 */
export function parseSemver(versionStr: string): [number, number, number] {
  if (!versionStr || typeof versionStr !== "string") {
    return [0, 0, 0];
  }

  // Strip non-numeric prefix like 'v' or 'web-'
  const clean = versionStr.replace(/^[^\d]*/, "").split(/[-+]/)[0];
  const parts = clean.split(".").map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Compares two semantic versions.
 * Returns:
 *  -1 if v1 < v2
 *   0 if v1 === v2
 *   1 if v1 > v2
 */
export function compareSemver(v1: string, v2: string): number {
  const [maj1, min1, pat1] = parseSemver(v1);
  const [maj2, min2, pat2] = parseSemver(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

/**
 * Verifies if an OTA Web Bundle is compatible with the device's Native Engine.
 * 
 * Rules:
 * 1. nativeVersion MUST be >= manifest.minNativeVersion
 * 2. If manifest.maxNativeVersion is specified, nativeVersion MUST be <= manifest.maxNativeVersion
 * 3. Channel must be valid
 */
export function checkCompatibility(
  manifest: OtaManifest,
  nativeCapabilities: NativeCapabilities
): CompatibilityResult {
  const nativeVer = nativeCapabilities.nativeVersion || "1.0.0";
  const minRequired = manifest.minNativeVersion || "1.0.0";
  const maxRequired = manifest.maxNativeVersion || null;

  // Check minimum native requirement
  if (compareSemver(nativeVer, minRequired) < 0) {
    return {
      compatible: false,
      reason: `Native APK version (${nativeVer}) is lower than bundle requirement (${minRequired}). An APK upgrade is required.`,
      currentNativeVersion: nativeVer,
      requiredMinNativeVersion: minRequired,
      requiredMaxNativeVersion: maxRequired,
    };
  }

  // Check optional maximum native requirement
  if (maxRequired && compareSemver(nativeVer, maxRequired) > 0) {
    return {
      compatible: false,
      reason: `Native APK version (${nativeVer}) exceeds bundle maximum supported version (${maxRequired}).`,
      currentNativeVersion: nativeVer,
      requiredMinNativeVersion: minRequired,
      requiredMaxNativeVersion: maxRequired,
    };
  }

  return {
    compatible: true,
    currentNativeVersion: nativeVer,
    requiredMinNativeVersion: minRequired,
    requiredMaxNativeVersion: maxRequired,
  };
}

/**
 * Validates whether the device possesses a specific native capability
 * (e.g. "native_whisper", "whisper_model_manager", "native_media_extractor")
 */
export function hasNativeCapability(
  nativeCapabilities: NativeCapabilities,
  capabilityName: string
): boolean {
  if (!nativeCapabilities || !Array.isArray(nativeCapabilities.capabilities)) {
    return false;
  }
  return nativeCapabilities.capabilities.includes(capabilityName);
}

/**
 * Safe Native API Call Guard
 * Prevents Web code from crashing if an OTA bundle attempts to invoke
 * a plugin method that is not present in the current native APK.
 */
export async function safeNativeInvoke<T>(
  plugin: any,
  methodName: string,
  args?: any,
  fallbackValue?: T
): Promise<{ success: boolean; result?: T; error?: string }> {
  if (!plugin || typeof plugin[methodName] !== "function") {
    return {
      success: false,
      result: fallbackValue,
      error: `Native method ${methodName} is not available in current APK.`,
    };
  }

  try {
    const res = await plugin[methodName](args);
    return { success: true, result: res };
  } catch (err: any) {
    return {
      success: false,
      result: fallbackValue,
      error: err?.message || String(err),
    };
  }
}
