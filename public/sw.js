// Vireon AI Studio - High-Performance Offline PWA Service Worker
const CACHE_NAME = "vireon-pwa-v4";
const RUNTIME_CACHE = "vireon-runtime-v4";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.png",
  "/icon-64.png",
  "/icon-128.png",
  "/icon-192.png",
  "/icon-384.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png"
];

// Install Event: Cache Core Static Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching core PWA shell");
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("[SW] Pre-cache partial failure:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean Old Caches & Claim Clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log("[SW] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Skip waiting message listener for instant updates
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch Event: Robust Strategy with Range & Media Bypass
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests, API proxies, range/media stream requests, and Vite dev server internal assets
  if (
    request.method !== "GET" ||
    request.headers.get("range") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/node_modules/") ||
    url.pathname.includes("@vite") ||
    url.pathname.includes("@fs") ||
    url.hostname.includes("supabase.co") ||
    url.search.includes("v=") ||
    url.search.includes("t=") ||
    url.search.includes("import")
  ) {
    return;
  }

  // Handle SPA Navigation requests
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", clonedResponse));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match("/index.html") || caches.match("/");
        })
    );
    return;
  }

  // Static Assets Strategy (Stale-While-Revalidate with Cache Fallback)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === "basic" || networkResponse.type === "cors") &&
            !request.headers.get("range")
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            }).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
