import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("vireon_beforeinstallprompt"));
  });
}

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
  const isIPadOS = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // If running inside Capacitor / Native App (Android/iOS), consider it fully installed
  if (Capacitor.isNativePlatform()) return true;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes("android-app://") ||
    navigator.userAgent.includes("Capacitor") ||
    navigator.userAgent.includes("wv") ||
    navigator.userAgent.includes("AndroidInterface")
  );
}

export function useInstallPrompt() {
  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const [canInstall, setCanInstall] = useState(() => !isNative && Boolean(deferredPrompt));
  const [installed, setInstalled] = useState(() => isNative || isStandalone());
  const isIOS = detectIOS();

  useEffect(() => {
    if (isNative) {
      setInstalled(true);
      setCanInstall(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const customHandler = () => {
      setCanInstall(true);
    };
    window.addEventListener("vireon_beforeinstallprompt", customHandler);

    const installedHandler = () => {
      setInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener("appinstalled", installedHandler);

    if (isStandalone()) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("vireon_beforeinstallprompt", customHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [isNative]);

  const install = useCallback(async () => {
    if (isNative) return false;
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setCanInstall(false);
        setInstalled(true);
        deferredPrompt = null;
        return true;
      }
    } catch (err) {
      console.warn("PWA install prompt error:", err);
    }
    deferredPrompt = null;
    return false;
  }, [isNative]);

  // showInstallEntry is true if not native (allows re-opening or installing)
  const showInstallEntry = !isNative;

  return { canInstall, install, isIOS, installed, showInstallEntry, isNative };
}



