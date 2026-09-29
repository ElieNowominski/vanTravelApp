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

/**
 * Dev uniquement : sert le dépôt privé (voyages, réservations) sous /__private/.
 * Rien de ce dossier n'entre dans le bundle.
 */
function privateDataPlugin(dir: string): Plugin {
  const root = path.resolve(dir);
  return {
    name: "vantravel-private-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__private/")) return next();
        const rel = decodeURIComponent(req.url.slice("/__private/".length).split("?")[0]);
        const file = path.resolve(root, rel);
        const inside = file.startsWith(root + path.sep);
        if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "not found", dir: root }));
          return;
        }
        res.setHeader(
          "Content-Type",
          file.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
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
  const privateDir = env.PRIVATE_DATA_DIR ?? "../vanTravel";

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      privateDataPlugin(privateDir),
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
          globPatterns: ["**/*.{js,mjs,css,html,ico,png,svg,ttf,woff2,json,geojson}"],
          // Les jeux de données (campings) dépassent 2 Mo : on les veut hors ligne.
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/__private\//],
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
