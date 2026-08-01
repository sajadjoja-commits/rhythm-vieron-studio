import { Capacitor } from "@capacitor/core";

/**
 * Initializes the Capgo Capacitor Updater.
 * This notifies the plugin that the app has booted successfully,
 * preventing automatic rollbacks of OTA updates.
 */
export async function initCapgo() {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    console.log("[Capgo] Not running on a native platform. Skipping OTA updater initialization.");
    return;
  }

  try {
    // Dynamically import plugin on native platform only
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");

    // 1. Notify Capgo that the app booted successfully.
    await CapacitorUpdater.notifyAppReady();
    console.log("[Capgo] App ready notification sent successfully.");

    // 2. Fetch and log current bundle info
    const currentInfo = await CapacitorUpdater.current();
    console.log("[Capgo] Current OTA bundle info:", currentInfo);
  } catch (error) {
    console.error("[Capgo] Failed to initialize Capgo OTA updates:", error);
  }
}

