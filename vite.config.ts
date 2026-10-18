import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Return true 404 for missing models/wasm/data files instead of SPA HTML fallback
 */
function missingStaticAssets404Plugin(): Plugin {
  return {
    name: "missing-static-assets-404",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || "";
        const pathname = rawUrl.split("?")[0];

        // Never intercept Vite internal routes, module imports, source files, or node_modules
        if (
          rawUrl.includes("?import") ||
          pathname.startsWith("/src/") ||
          pathname.startsWith("/node_modules/") ||
          pathname.startsWith("/@")
        ) {
          return next();
        }

        if (
          pathname.startsWith("/models/") ||
          pathname.startsWith("/wasm/") ||
          pathname.startsWith("/mediapipe/") ||
          /\.(wasm|onnx|bin|safetensors|pt|tflite|task)$/i.test(pathname)
        ) {
          const cleanPath = pathname.replace(/^\/+/, "");
          const publicFile = path.resolve(__dirname, "public", cleanPath);
          const rootFile = path.resolve(__dirname, cleanPath);
          if (!fs.existsSync(publicFile) && !fs.existsSync(rootFile)) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Static asset not found", path: pathname }));
            return;
          }
        }
        next();
      });
    },
  };
}

/**
 * Ensure ORT WASM files are present in public/wasm/ort and public/wasm/ort-1.27
 */
function ensureOrtWasmAssetsPlugin(): Plugin {
  return {
    name: "ensure-ort-wasm-assets",
    buildStart() {
      try {
        // 1. @xenova/transformers WASM files -> public/wasm/ort
        const targetDir = path.resolve(__dirname, "public/wasm/ort");
        const srcDir = path.resolve(__dirname, "node_modules/@xenova/transformers/dist");
        if (fs.existsSync(srcDir)) {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const wasmFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith(".wasm"));
          for (const file of wasmFiles) {
            const dest = path.join(targetDir, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(srcDir, file), dest);
            }
          }
        }

        // 2. onnxruntime-web 1.27 assets -> public/wasm/ort-1.27
        const ort127TargetDir = path.resolve(__dirname, "public/wasm/ort-1.27");
        const ort127SrcDir = path.resolve(__dirname, "node_modules/onnxruntime-web/dist");
        if (fs.existsSync(ort127SrcDir)) {
          if (!fs.existsSync(ort127TargetDir)) {
            fs.mkdirSync(ort127TargetDir, { recursive: true });
          }
          const ortFiles = fs.readdirSync(ort127SrcDir).filter((f) =>
            f.startsWith("ort-wasm-simd-threaded") && (f.endsWith(".wasm") || f.endsWith(".mjs"))
          );
          for (const file of ortFiles) {
            const dest = path.join(ort127TargetDir, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(ort127SrcDir, file), dest);
            }
          }
        }
      } catch (err) {
        console.warn("[ensureOrtWasmAssetsPlugin] Warning:", err);
      }
    },
  };
}

function ensureMediaPipeAssetsPlugin(): Plugin {
  return {
    name: "ensure-mediapipe-assets",
    buildStart() {
      const source = path.resolve(__dirname, "node_modules/@mediapipe/tasks-vision/wasm");
      if (!fs.existsSync(source)) return;
      const target = path.resolve(__dirname, "public/wasm/mediapipe");
      fs.mkdirSync(target, { recursive: true });
      for (const file of fs.readdirSync(source)) {
        if (/\.(js|wasm)$/.test(file)) {
          fs.copyFileSync(path.join(source, file), path.join(target, file));
        }
      }
    },
  };
}

/**
 * Ensure build_info.json and fingerprint.txt are preserved in dist after build
 */
function writeDistMetadataPlugin(): Plugin {
  return {
    name: "write-dist-metadata",
    closeBundle() {
      try {
        const buildInfoPath = path.resolve(__dirname, "src/build_info.json");
        const distBuildInfoPath = path.resolve(__dirname, "dist/build_info.json");
        const distFingerprintPath = path.resolve(__dirname, "dist/fingerprint.txt");
        if (fs.existsSync(buildInfoPath)) {
          const content = fs.readFileSync(buildInfoPath, "utf8");
          fs.writeFileSync(distBuildInfoPath, content);
          const parsed = JSON.parse(content);
          if (parsed && parsed.fingerprint) {
            fs.writeFileSync(distFingerprintPath, parsed.fingerprint);
          }
        }
      } catch (e) {
        // ignore
      }
    },
  };
}

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
    ensureOrtWasmAssetsPlugin(),
    ensureMediaPipeAssetsPlugin(),
    missingStaticAssets404Plugin(),
    writeDistMetadataPlugin(),
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
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/api/,
          /^\/models\//,
          /^\/wasm\//,
          /^\/src\//,
          /^\/@/,
          /\.(js|ts|tsx|jsx|json|css|wasm|onnx|bin|safetensors|pt)$/i,
          /^https:\/\/huggingface\.co/,
          /^https:\/\/hf-mirror\.com/
        ],
        runtimeCaching: [
          {
            urlPattern: /\.(?:wasm)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-cache",
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(?:tflite|task)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tflite-cache",
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^\/models\/.*|\/models\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "models-cache",
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^\/audio\/.*|\.(?:mp3|wav|ogg)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cache",
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true
            }
          },
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("/node_modules/")) {
            if (
              normalized.includes("/node_modules/react/") ||
              normalized.includes("/node_modules/react-dom/") ||
              normalized.includes("/node_modules/react-router/") ||
              normalized.includes("/node_modules/react-router-dom/")
            ) {
              return "react";
            }
            if (normalized.includes("/node_modules/@supabase/")) {
              return "supabase";
            }
            if (normalized.includes("/node_modules/@radix-ui/")) {
              return "radix";
            }
            if (
              normalized.includes("/node_modules/framer-motion/") ||
              normalized.includes("/node_modules/gsap/")
            ) {
              return "animation";
            }
          }
        },
      },
    },
  },
}));
