import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { applyLangToDOM } from "./lib/i18n";
import { preloadSfx } from "./lib/soundFx";
import { initCapgo } from "./services/capgo";
import { initializePerformanceOptimizations, logPerformanceMetrics, enableGarbageCollectionHints } from "./lib/performanceOptimizations";


try { applyLangToDOM(); } catch (e) { console.warn("Language init warning:", e); }

try {
  window.addEventListener("pointerdown", () => {
    try { preloadSfx(); } catch {}
  }, { once: true });
} catch {}

try { initCapgo(); } catch (e) { console.warn("Capgo init warning:", e); }

try {
  initializePerformanceOptimizations();
  enableGarbageCollectionHints();
} catch (e) {
  console.warn("Perf init warning:", e);
}

if (import.meta.env.DEV) {
  try {
    window.addEventListener("load", () => {
      setTimeout(() => { try { logPerformanceMetrics(); } catch {} }, 0);
    });
  } catch {}
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (
      event?.message?.includes("insertBefore") ||
      event?.message?.includes("removeChild") ||
      event?.message?.includes("not a child of this node")
    ) {
      console.warn("[Vireon] Prevented external DOM mutation crash:", event.message);
      event.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = String(event?.reason || "");
    if (
      reason.includes("insertBefore") ||
      reason.includes("removeChild") ||
      reason.includes("Failed to fetch") ||
      reason.includes("NetworkError")
    ) {
      console.warn("[Vireon] Handled non-fatal promise rejection:", reason);
      event.preventDefault();
    }
  });
}

// Register PWA service worker across environments with graceful error handling
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const registerSW = () => {
    try {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[Vireon PWA] Service worker active:", reg.scope);
          // Check for app updates every 60 seconds automatically
          setInterval(() => {
            try { reg.update(); } catch {}
          }, 60 * 1000);
        })
        .catch((err) => {
          console.warn("[Vireon PWA] Service worker registration notice:", err);
        });
    } catch (err) {
      console.warn("[Vireon PWA] Service worker skipped:", err);
    }
  };

  if (document.readyState === "complete") {
    registerSW();
  } else {
    window.addEventListener("load", registerSW, { once: true });
  }
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} else {
  console.error("Root element '#root' not found in DOM");
}
