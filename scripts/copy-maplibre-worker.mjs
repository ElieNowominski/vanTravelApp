#!/usr/bin/env node
/**
 * MapLibre 6 charge son worker via une URL calculée à partir de son propre module,
 * que ni le serveur de dev ni le bundler ne peuvent suivre. On copie donc le worker
 * (et le module partagé qu'il importe) dans public/maplibre/ et l'app appelle
 * maplibregl.setWorkerUrl() dessus. Dossier ignoré par git, regénéré à l'installation.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist");
const out = path.join(root, "public", "maplibre");

fs.mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  fs.copyFileSync(path.join(dist, file), path.join(out, file));
}
const version = require("maplibre-gl/package.json").version;
fs.writeFileSync(path.join(out, "VERSION"), `${version}\n`);
console.log(`maplibre-gl ${version} : worker copié dans public/maplibre/`);
