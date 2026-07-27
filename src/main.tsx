import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import "./index.css";
import { applyLangToDOM } from "./lib/i18n";
import { preloadSfx } from "./lib/soundFx";
import { initCapgo } from "./services/capgo";
import { initializePerformanceOptimizations, logPerformanceMetrics, enableGarbageCollectionHints } from "./lib/performanceOptimizations";
import { Capacitor } from "@capacitor/core";

// Set document direction/language before first paint.
applyLangToDOM();
// Preload UI sounds on first interaction (avoids autoplay restrictions).
window.addEventListener("pointerdown", () => preloadSfx(), { once: true });

// Initialize Capgo OTA Updater if on native app
initCapgo();

// Initialize performance optimizations
initializePerformanceOptimizations();
enableGarbageCollectionHints();

// Log performance metrics in development
if (import.meta.env.DEV) {
  window.addEventListener('load', () => {
    setTimeout(logPerformanceMetrics, 0);
  });
}

// PWA: guard against iframe/preview contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe || Capacitor.isNativePlatform()) {
  // Never register a SW inside the editor preview / iframes or on native mobile apps
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else if ("serviceWorker" in navigator) {
  // Register the offline service worker when in top-level app window
  const registerSW = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("Vireon AI Service Worker active:", reg.scope);
      })
      .catch((err) => {
        console.warn("Service Worker registration failed:", err);
      });
  };

  if (document.readyState === "complete") {
    registerSW();
  } else {
    window.addEventListener("load", registerSW);
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
