import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
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

// Never register a PWA service worker on Lovable/embedded preview hosts.
// Those hosts do not guarantee /sw.js and a 404 here can break startup.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isPreviewHost =
    host.includes("lovable.app") ||
    host.includes("lovableproject.com") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    (typeof window !== "undefined" && window.self !== window.top);

  if (!isPreviewHost) {
    const registerSW = () => {
      try {
        navigator.serviceWorker.register("/sw.js", { scope: "/" })
          .then((reg) => console.log("Vireon service worker active:", reg.scope))
          .catch((err) => console.warn("Service Worker registration skipped:", err));
      } catch (err) {
        console.warn("Service Worker registration skipped:", err);
      }
    };

    if (document.readyState === "complete") registerSW();
    else window.addEventListener("load", registerSW, { once: true });
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
