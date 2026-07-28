import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
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
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      injectRegister: false,
      devOptions: {
        enabled: true,
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,mp3,json,webmanifest,wasm}"],
        navigateFallbackDenylist: [
          /^\/api/,
          /^https:\/\/huggingface\.co/,
          /^https:\/\/hf-mirror\.com/
        ],
      },
      manifest: {
        name: "Vireon AI — Smart Video Editor",
        short_name: "Vireon AI",
        description: "محرر فيديو ذكي بالذكاء الاصطناعي يقص ويضيف الكابشن والموسيقى تلقائياً",
        lang: "ar",
        dir: "rtl",
        theme_color: "#3b82f6",
        background_color: "#0b1220",
        display: "standalone",
        display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          {
            name: "مشروع جديد",
            short_name: "جديد",
            description: "إنشاء مشروع فيديو جديد بالذكاء الاصطناعي",
            url: "/",
            icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
          }
        ],
        categories: ["video", "productivity", "entertainment"],
        screenshots: [
          { src: "/placeholder.svg", sizes: "1080x1920", type: "image/svg+xml", form_factor: "narrow", label: "Editor" }
        ]
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@radix-ui/react-tooltip", "@tanstack/react-query"],
  },
  worker: {
    format: "es",
  },
}));
