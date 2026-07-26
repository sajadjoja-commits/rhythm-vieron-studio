import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Triggers a light haptic feedback impact on native platforms.
 * Fails silently on Web.
 */
export async function triggerHapticTick(style: "light" | "medium" | "heavy" = "light") {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const impactStyle =
      style === "heavy"
        ? ImpactStyle.Heavy
        : style === "medium"
        ? ImpactStyle.Medium
        : ImpactStyle.Light;
    await Haptics.impact({ style: impactStyle });
  } catch (e) {
    // Fail silently on unsupported environments
  }
}

/**
 * Triggers a selection changed haptic tick on native platforms.
 */
export async function triggerHapticSelection() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
  } catch (e) {
    // Fail silently
  }
}

/**
 * Triggers notification haptics (success/warning/error) on native platforms.
 */
export async function triggerHapticNotification(type: "success" | "warning" | "error" = "success") {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const notifType =
      type === "error"
        ? NotificationType.Error
        : type === "warning"
        ? NotificationType.Warning
        : NotificationType.Success;
    await Haptics.notification({ type: notifType });
  } catch (e) {
    // Fail silently
  }
}
