// Vireon AI Studio - Enhanced High-Performance PWA Service Worker
const CACHE_NAME = "vireon-pwa-cache-v5";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/ffmpeg/ffmpeg-core.js",
  "/ffmpeg/ffmpeg-core.wasm",
];

// Install Event - Pre-cache core app shell & offline engines
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Cache pre-fill warning:", err);
      });
    })
  );
});

// Activate Event - Clean up stale caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event - Smart Offline-First & Cache-First Strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests or external API calls (e.g. Supabase, AI APIs)
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("huggingface.co") ||
    url.hostname.includes("hf-mirror.com")
  ) {
    return;
  }

  // Strategy 1: Cache-First for local WASM / FFmpeg core / local audio assets
  if (url.pathname.startsWith("/ffmpeg/") || url.pathname.endsWith(".wasm") || url.pathname.startsWith("/audio/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        }).catch(() => caches.match(event.request));
      })
    );
    return;
  }

  // Strategy 2: Stale-While-Revalidate for JS/CSS/Fonts/Images
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === "basic" || url.hostname.includes("fonts"))
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback on network failure
        });

      return cachedResponse || fetchPromise.then((res) => res || caches.match("/index.html"));
    })
  );
});

// Handle SW messages (e.g. forced updates)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
