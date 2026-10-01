import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { applyLangToDOM } from "./lib/i18n";
import { preloadSfx } from "./lib/soundFx";
import { initializePerformanceOptimizations, logPerformanceMetrics, enableGarbageCollectionHints } from "./lib/performanceOptimizations";
import buildInfo from "./build_info.json";

// Filter benign WebAssembly / TensorFlow Lite engine informational logs
if (typeof console !== "undefined") {
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;

  const isBenignTFLiteLog = (...args: unknown[]) => {
    const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a) || "")).join(" ");
    return (
      text.includes("Created TensorFlow Lite XNNPACK delegate") ||
      text.includes("TensorFlow Lite XNNPACK delegate") ||
      text.includes("XNNPACK delegate for CPU")
    );
  };

  console.log = (...args: unknown[]) => {
    if (isBenignTFLiteLog(...args)) return;
    origLog.apply(console, args);
  };

  console.info = (...args: unknown[]) => {
    if (isBenignTFLiteLog(...args)) return;
    origInfo.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    if (isBenignTFLiteLog(...args)) return;
    origWarn.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    if (isBenignTFLiteLog(...args)) return;
    origError.apply(console, args);
  };
}

try { applyLangToDOM(); } catch (e) { console.warn("Language init warning:", e); }

try {
  window.addEventListener("pointerdown", () => {
    try { preloadSfx(); } catch {}
  }, { once: true });
} catch {}

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
    const msg = String(event?.message || "");
    if (
      msg.includes("insertBefore") ||
      msg.includes("removeChild") ||
      msg.includes("not a child of this node") ||
      msg.includes("ServiceWorker") ||
      msg.includes("sw.js") ||
      msg.includes("Unexpected token '<'") ||
      msg.includes("Unexpected token <")
    ) {
      console.warn("[Vireon] Safely handled non-fatal error:", msg);
      event.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = String(event?.reason?.message || event?.reason || "");
    if (
      reason.includes("insertBefore") ||
      reason.includes("removeChild") ||
      reason.includes("Failed to fetch") ||
      reason.includes("NetworkError") ||
      reason.includes("ServiceWorker") ||
      reason.includes("sw.js") ||
      reason.includes("Failed to register") ||
      reason.includes("bad HTTP response code") ||
      reason.includes("404") ||
      reason.includes("Unexpected token '<'") ||
      reason.includes("Unexpected token <")
    ) {
      console.warn("[Vireon] Handled non-fatal promise rejection:", reason);
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }
  });
}

// Register PWA service worker in web browser environment (Production only, not in native app or iframe)
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const isIframe = typeof window !== "undefined" && window.self !== window.top;
  const isNative = Capacitor.isNativePlatform();

  // In native Android/iOS APK, disable Service Worker completely to prevent stale bundle caching!
  if (import.meta.env.DEV || isIframe || isNative) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});

    // In native app, also purge stale web asset caches from previous remote webviews
    if (isNative && typeof caches !== "undefined") {
      caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.includes("vireon") || key.includes("workbox") || key.includes("pwa")) {
            caches.delete(key).catch(() => {});
          }
        }
      }).catch(() => {});
    }
  } else {
    const registerSW = () => {
      try {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            console.log("[Vireon PWA] Service worker active:", reg.scope);
            
            reg.addEventListener("updatefound", () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener("statechange", () => {
                  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    console.log("[Vireon PWA] New update available");
                    window.dispatchEvent(new Event("vireon_pwa_update_available"));
                  }
                });
              }
            });

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
}

// Runtime Diagnostic & Security Origin Check (Requirements 16, 17, 20)
if (typeof window !== "undefined") {
  const isNative = Capacitor.isNativePlatform();
  const origin = window.location.origin;
  const href = window.location.href;

  if (isNative) {
    console.log(
      `[VIREON RUNTIME]\nsource=APK_BUNDLED\nwebBuild=${(buildInfo as any).web}\nfingerprint=${(buildInfo as any).fingerprint}\nota=DISABLED\nremoteUrl=NONE\nserverBasePath=NONE\norigin=${origin}\nhref=${href}`
    );

    if (
      origin.includes("lovable.app") ||
      origin.includes("lovable.dev") ||
      (origin.startsWith("http://") && !origin.includes("localhost"))
    ) {
      document.body.innerHTML = `
        <div style="background:#0a0a0c;color:#ef4444;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px;text-align:center;font-family:sans-serif;">
          <h2 style="font-size:18px;margin-bottom:12px;">CRITICAL PACKAGING VIOLATION</h2>
          <p style="font-size:14px;color:#94a3b8;margin-bottom:8px;">Running remote URL instead of bundled APK assets:</p>
          <code style="background:#1e1e24;padding:8px 12px;border-radius:6px;font-size:12px;color:#f87171;word-break:break-all;">${href}</code>
          <p style="font-size:12px;color:#64748b;margin-top:16px;">Rebuild with: npm run build:android</p>
        </div>
      `;
      throw new Error(`CRITICAL SECURITY FAILURE: Native APK attempted to load remote origin: ${origin}`);
    }
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
