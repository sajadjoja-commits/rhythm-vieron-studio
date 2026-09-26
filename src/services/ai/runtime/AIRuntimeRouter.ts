/**
 * Phase 10.1: Local-First AI Runtime Router
 * 
 * Strict Priority:
 * 1. Native Local (Android ARM64 / ML Kit / whisper.cpp)
 * 2. Local ONNX / WebGPU (Browser / Device Acceleration)
 * 3. Local WASM / Web Worker
 * 4. Web Fallback
 * 5. Cloud (ONLY when explicitly requested by user)
 * 
 * ZERO Silent Cloud Fallbacks: If offline/local execution is unavailable,
 * fails with structured error instead of secretly routing data to cloud APIs.
 */

import { Capacitor } from "@capacitor/core";
import { aiCapabilityRegistry } from "./AICapabilityRegistry";
import { AIError } from "../types";

export type ExecutionTier = "native_local" | "local_onnx" | "local_wasm" | "web_fallback" | "cloud_explicit";

export interface RouteResolution {
  tier: ExecutionTier;
  runtimeId: string;
  isLocalOnly: boolean;
  requiresCloudAuth: boolean;
}

export class AIRuntimeRouter {
  private static instance: AIRuntimeRouter;

  private constructor() {}

  public static getInstance(): AIRuntimeRouter {
    if (!AIRuntimeRouter.instance) {
      AIRuntimeRouter.instance = new AIRuntimeRouter();
    }
    return AIRuntimeRouter.instance;
  }

  /**
   * Resolves execution route with strict local-first priority
   */
  public async resolveRoute(
    featureId: string,
    options?: { userRequestedCloud?: boolean }
  ): Promise<RouteResolution> {
    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
    const registry = await aiCapabilityRegistry.getRegistry();

    // 1. Native Local Android
    if (isAndroid) {
      if (featureId === "stt" && registry.whisper_native?.available) {
        return {
          tier: "native_local",
          runtimeId: "whisper.cpp",
          isLocalOnly: true,
          requiresCloudAuth: false,
        };
      }
      if (featureId === "face_detection" && registry.face_detection_native?.available) {
        return {
          tier: "native_local",
          runtimeId: "Google ML Kit",
          isLocalOnly: true,
          requiresCloudAuth: false,
        };
      }
      if (featureId === "segmentation" && registry.subject_segmentation_native?.available) {
        return {
          tier: "native_local",
          runtimeId: "Google ML Kit",
          isLocalOnly: true,
          requiresCloudAuth: false,
        };
      }
    }

    // 2. Local In-Browser WASM / Web Worker
    if (featureId === "stt" && registry.whisper_web?.available) {
      return {
        tier: "local_wasm",
        runtimeId: "Transformers.js / Whisper WASM Worker",
        isLocalOnly: true,
        requiresCloudAuth: false,
      };
    }

    // 3. Classical Algorithmic Filter
    if (featureId === "upscale") {
      return {
        tier: "local_wasm",
        runtimeId: "Classical Sub-Pixel Laplacian Filter (Non-Neural)",
        isLocalOnly: true,
        requiresCloudAuth: false,
      };
    }

    // 4. Cloud ONLY if explicitly user-requested
    if (options?.userRequestedCloud) {
      return {
        tier: "cloud_explicit",
        runtimeId: "Explicit Cloud API",
        isLocalOnly: false,
        requiresCloudAuth: true,
      };
    }

    // 5. Hard Block: No silent cloud fallback
    throw new AIError(
      "AI_RUNTIME_UNAVAILABLE",
      `No local on-device AI runtime is available for "${featureId}". Silent cloud execution is forbidden by Vieron Studio local-first architecture.`
    );
  }
}

export const aiRuntimeRouter = AIRuntimeRouter.getInstance();
