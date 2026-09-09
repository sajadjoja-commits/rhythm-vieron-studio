import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      injectRegister: null,
      includeAssets: ["favicon.ico", "favicon.png", "apple-touch-icon.png", "robots.txt", "vireon-logo.svg", "icon-*.png"],
      devOptions: {
        enabled: false,
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,svg,mp3,json,webmanifest,wasm}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/api/,
          /^\/src\//,
          /^\/@/,
          /\.(js|ts|tsx|jsx|json|css)$/i,
          /^https:\/\/huggingface\.co/,
          /^https:\/\/hf-mirror\.com/
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: /\.(?:mp3|wav|ogg)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      manifestFilename: "manifest.webmanifest",
      manifest: {
        id: "/",
        name: "Vireon AI Studio — Smart Video Editor",
        short_name: "Vireon AI",
        description: "محرر الفيديو الذكي بالذكاء الاصطناعي — قص تلقائي، كابشن ملون، موسيقى وتأثيرات سينمائية",
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        theme_color: "#090d16",
        background_color: "#090d16",
        display: "standalone",
        display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
        orientation: "any",
        prefer_related_applications: false,
        icons: [
          { src: "/icon-64.png", sizes: "64x64", type: "image/png", purpose: "any" },
          { src: "/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }
        ],
        screenshots: [
          {
            src: "/screenshot-mobile.jpg",
            sizes: "720x1280",
            type: "image/jpeg",
            form_factor: "narrow",
            label: "شاشة تطبيق Vireon AI على الهاتف"
          },
          {
            src: "/screenshot-desktop.jpg",
            sizes: "1280x720",
            type: "image/jpeg",
            form_factor: "wide",
            label: "واجهة الاستوديو الاحترافية على الحاسوب"
          }
        ],
        shortcuts: [
          {
            name: "مشروع جديد",
            short_name: "جديد",
            description: "إنشاء مشروع فيديو جديد بالذكاء الاصطناعي",
            url: "/",
            icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "القوالب الذكية",
            short_name: "قوالب",
            description: "تصفح واستخدام قوالب المونتاج المجهزة",
            url: "/?tab=templates",
            icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "محرر الصور",
            short_name: "صور",
            description: "أدوات تحسين وتعديل الصور بالذكاء الاصطناعي",
            url: "/?tab=photo",
            icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
          }
        ],
        share_target: {
          action: "/",
          method: "GET",
          params: {
            title: "title",
            text: "text",
            url: "url"
          }
        },
        categories: ["video", "productivity", "multimedia", "utilities"]
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
  },
}));
