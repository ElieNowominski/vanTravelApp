# vanTravel

Application personnelle de roadtrip en van, pour deux personnes, sur téléphone et sur PC. Deux modes : **Planifier** (carte, catalogue de villes et de spots, campings DOC et OSM, tracés routiers, comparaison de circuits) et **Voyager** (écran « Aujourd'hui », nuit du soir avec référence et code, réservations, photos et PDF, checklists, notes, journal des dépenses, roadbook imprimable ; tout marche hors ligne). Voyager s'ouvre par défaut pendant le voyage ou une fois l'itinéraire figé ; la bascule est dans l'en-tête.

Site statique déployé sur GitHub Pages, installable comme PWA. Pas de serveur à nous : les données partagées vivent dans un projet Supabase (comptes Google ou e-mail, Postgres avec règles par ligne, Storage pour les photos et PDF).

## Où sont les données

| Où | Quoi |
| --- | --- |
| Ce dépôt (public) | Code, catalogue générique par région (`src/data/catalog/`), préréglages de région (`src/data/regions/`) |
| `public/data/generated/` (ignoré par git) | Campings DOC, aires OSM, freedom camping : produits par `npm run data`, régénérés par le workflow |
| Supabase (compte par personne) | Les voyages (`trips`, même format que `trip.json` ci-dessous), l'itinéraire, les réservations, coches, notes, dépenses, suppressions, et les photos et PDF (bucket `documents`). Schéma : `supabase/schema.sql`, règles d'accès par voyage (`members`) |
| Le navigateur | Circuit courant, bibliothèque de circuits, réservations, checklists, dépenses, contenu des documents, profil (IndexedDB, par appareil) |

Rien de personnel ni de clé secrète n'entre dans ce dépôt : voir `.cursor/rules/donnees-perso-et-securite.mdc`. L'ancien dépôt privé `vanTravel` (`trips/`) est une archive, migrable par `scripts/migrate-from-private-repo.mjs`.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # puis VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY du projet (clé publiable, jamais la secrète)
npm run data        # une fois : télécharge les jeux de données publics
npm run dev         # http://127.0.0.1:43217
```

Sans `.env.local`, l'app tourne en « local seulement » : pas de compte ni de synchro, tout le reste marche. Pour tester depuis un téléphone sur le même Wi-Fi : `http://<ip-du-pc>:43217/` (connexion par e-mail ; Google exige une origine déclarée dans Supabase).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de dev, port 43217 |
| `npm run build` | `tsc -b` puis build Vite dans `dist/` (avec `404.html` pour GitHub Pages) |
| `npm run preview` | Sert `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest (logique métier dans `src/lib`) |
| `npm run data [region] [--strict]` | Jeux de données publics vers `public/data/generated/` |
| `npm run icons` | Icônes PWA à partir de `public/logo.svg` |

## Format d'un voyage (`trips.config`, ou `trip.json` à importer)

```json
{
  "id": "nz-south-2028",
  "schemaVersion": 1,
  "name": "Boucle des lacs",
  "regionId": "nz-south",
  "start": { "placeId": "christchurch", "date": "2028-01-10", "notes": "Récupération du van" },
  "end": { "placeId": "christchurch", "date": "2028-01-20" },
  "arrival": { "placeId": "motel-aeroport", "date": "2028-01-09", "label": "Nuit avant le van" },
  "vehicle": { "name": "Van compact", "selfContained": true, "timeFactor": 1.3, "windingFactor": 1.15, "maxComfortableDriveHours": 4 },
  "stays": [{ "id": "motel-aeroport", "name": "Motel près de l’aéroport", "lng": 172.55, "lat": -43.49, "region": "Canterbury", "category": "lodge" }],
  "plan": { "days": [{ "date": "2028-01-10", "stops": [{ "placeId": "christchurch" }, { "placeId": "motel-aeroport", "overnight": true }] }] }
}
```

`stays` sont fusionnés au catalogue public de la région ; `plan` se recharge avec le bouton **Plan**.

## Sauvegarde et migration depuis l'ancienne version

La bibliothèque (icône dossier) exporte un JSON avec le circuit affiché, tous les circuits enregistrés (tracés compris) et le contenu des documents. L'import fusionne sans écraser ce qui est plus récent. C'est le plan B quand le compte n'est pas accessible ; le pont normal entre appareils est la synchro (bouton nuage : compte, voyage, membres). Le fichier produit par le snippet console de l'ancienne version (Next.js) est accepté tel quel : les circuits sans voyage en reçoivent un, dérivé de leurs dates et de leurs étapes.

## Déploiement

Le workflow `.github/workflows/deploy.yml` lint, teste, télécharge les données, construit avec `BASE_PATH=/<nom-du-dépôt>/` et les variables du dépôt `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` (*Settings > Secrets and variables > Actions > Variables*), puis publie sur GitHub Pages à chaque push sur `main`, plus un rafraîchissement hebdomadaire des données. Activer Pages une fois : *Settings > Pages > Source : GitHub Actions*. `keepalive.yml` appelle `beat()` tous les deux jours pour que le projet Supabase gratuit ne se mette pas en pause.

Côté Supabase : exécuter `supabase/schema.sql` (projet neuf) ou les migrations de `supabase/migrations/` (projet existant) dans SQL Editor, puis `node scripts/rls-check.mjs` avec deux comptes de test (variables d'environnement, voir l'en-tête du script).

## Données externes

| Donnée | Source | Quand |
| --- | --- | --- |
| Fond de carte | OpenStreetMap raster via MapLibre | Au runtime, tuiles vues mises en cache (pas de préchargement, politique OSM) |
| Routage | [OSRM public](https://github.com/Project-OSRM/osrm-backend/wiki/API-Usage-Policy) depuis le navigateur, estimation en fallback | Au runtime |
| Campings DOC, freedom camping | [ArcGIS Hub DOC](https://doc-deptconservation.opendata.arcgis.com/) | Au build |
| Holiday parks, aires, dump stations | OpenStreetMap via Overpass | Au build |

## Stack

Vite, React 19, TypeScript, Tailwind 4, shadcn/ui (Base UI), MapLibre GL, Zustand, React Router, vite-plugin-pwa (Workbox), Vitest, supabase-js.

Architecture et décisions : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
