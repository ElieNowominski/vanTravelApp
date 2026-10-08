import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

function normalizeBase(value: string): string {
  let base = value.trim() || "/";
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return base;
}

/** GitHub Pages sert 404.html pour les routes inconnues : on y met la SPA. */
function spaFallbackPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "vantravel-spa-404",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const index = path.resolve(outDir, "index.html");
      if (fs.existsSync(index)) fs.copyFileSync(index, path.resolve(outDir, "404.html"));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = normalizeBase(env.BASE_PATH ?? "/");

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      spaFallbackPlugin(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["favicon.ico", "logo.svg", "fonts/*.ttf"],
        manifest: {
          name: "vanTravel",
          short_name: "vanTravel",
          description: "Roadtrip en van : itinéraire, nuits, réservations, hors ligne.",
          lang: "fr",
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "portrait",
          background_color: "#faf8f3",
          theme_color: "#0f5a46",
          icons: [
            { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Pont de transition vers le mode « prompt » (voir public/sw-bridge.js).
          importScripts: ["sw-bridge.js"],
          globPatterns: ["**/*.{js,mjs,css,html,ico,png,svg,ttf,woff2,json,geojson}"],
          globIgnores: ["sw-bridge.js"],
          // Les jeux de données (campings) dépassent 2 Mo : on les veut hors ligne.
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          runtimeCaching: [
            {
              // Seules les tuiles déjà affichées : pas de préchargement (politique OSM).
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
              handler: "CacheFirst",
              options: {
                cacheName: "osm-tiles",
                expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 24 * 3600 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/router\.project-osrm\.org\//,
              handler: "NetworkOnly",
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { port: 43217, strictPort: true, host: true },
    preview: { port: 43217, strictPort: true },
    build: { chunkSizeWarningLimit: 1600 },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      setupFiles: ["src/test/setup.ts"],
    },
  };
});
