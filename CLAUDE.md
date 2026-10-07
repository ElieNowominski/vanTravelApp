# vanTravelApp

Application personnelle de roadtrip en van (deux utilisateurs, mobile et web), SPA Vite + React déployée sur GitHub Pages. Ce dépôt est **public**. Architecture et décisions : `docs/ARCHITECTURE.md`. Plan de travail et état d'avancement : `docs/PLAN.md` (à mettre à jour en fin de session). Journal de bord pour le retour d'expérience : `docs/JOURNAL.md` (une entrée par session, règle 11). Règles détaillées : `.cursor/rules/`.

Dépôt jumeau **privé** : `../vanTravel` (`C:/Users/enowo/Documents/Projects/vanTravel`), dossier `trips/` = données de voyage, servi en dev sous `/__private/`. Site publié : https://elienowominski.github.io/vanTravelApp/

## Règles

1. **Zéro donnée personnelle en clair ici** : voyages, réservations, codes, adresses de nuit, dates précises, dépenses et documents vivent dans le dépôt privé `vanTravel` (dossier `trips/`), servi en dev sous `/__private/`. Seuls le catalogue générique et les préréglages de région sont commités.
2. **Pas de serveur** : aucune route API, aucun secret au runtime. Tout appel externe part du navigateur, avec un comportement défini hors ligne.
3. **Hors ligne d'abord** : toute fonctionnalité du mode Voyager marche sans réseau une fois les données synchronisées. IndexedDB est la source de vérité locale.
4. **Mobile d'abord** : vérifier à 390 px de large, cibles tactiles de 44 px minimum, respecter les safe areas, jamais `window.confirm`, `alert` ou `prompt` (confirmation intégrée à l'interface).
5. **Rien de câblé pour un voyage donné** : dates, lieux, bbox, véhicule viennent de `TripConfig` (`src/lib/types.ts`), région de `src/data/regions/`.
6. **Schéma stocké versionné** : tout changement de forme des données s'accompagne d'une migration et d'un test.
7. **Logique métier dans `src/lib`, pure et testée avec Vitest** ; les composants n'hébergent pas de calcul. Les services réseau vivent dans `src/services`.
8. **Sources externes** : respecter les politiques d'usage (attribution OSM et OSRM, pas de préchargement de tuiles OSM, une requête par seconde vers OSRM).
9. **Port de dev 43217** : le libérer après tout test (voir `.cursor/rules/liberer-port-dev.mdc`).
10. **Git : commits directement sur `main`**, hotfix compris. Une seule personne travaille ici et chaque push déploie sur Pages. Pas de branche ni de PR sauf demande explicite. Avant chaque commit : lint, typecheck, tests, et le contrôle « aucune donnée perso » de `.cursor/rules/donnees-perso-et-securite.mdc`.
11. **Journal en fin de session** : ajouter une entrée dans `docs/JOURNAL.md` selon son gabarit (intention, demandes en substance, livré, cassé ou appris dont les erreurs de l'assistant, décisions avec leur raison, chiffres). Elle sert au retour d'expérience sur la construction de l'app : écrire ce que git ne dit pas, sans donnée personnelle.

## Synchro (phase 5)

Modèle pur dans `src/lib/sync-model.ts` (fusion, extraction, réinjection, décision itinéraire), moteur dans `src/services/sync.ts`, client GitHub dans `src/services/github-repo.ts`, réglages et token dans `src/store/sync-store.ts` (IndexedDB). Toute suppression d'entité Voyager passe par une pierre tombale (`tombstones`), toute note ou météo par un horodatage (`notesAt`, `weatherAt`) : sans ça, la fusion ressuscite ou écrase. Les écritures venues de la synchro passent par `applySync` et ne relèvent pas `pending`. Détails : `docs/ARCHITECTURE.md`, section Synchronisation.

## Commandes

```bash
npm run dev         # http://127.0.0.1:43217 (dépôt privé servi depuis PRIVATE_DATA_DIR, défaut ../vanTravel)
npm run data        # jeux de données publics -> public/data/generated/
npm run lint && npm run typecheck && npm test
npm run build       # dist/ (BASE_PATH=/vanTravelApp/ sur Pages)
```

## Pièges connus

- **Worker MapLibre** : MapLibre 6 ne retrouve pas son worker via le bundler. `scripts/copy-maplibre-worker.mjs` (lancé par `prepare`, `predev`, `prebuild`) le copie dans `public/maplibre/` (ignoré par git) et les cartes appellent `setWorkerUrl`. Sans lui, aucune source GeoJSON ne s'affiche.
- **Brouillon dans IndexedDB** (`src/lib/idb-storage.ts`) : un circuit avec ses tracés dépasse le quota localStorage (environ 5 à 10 Mo par origine), et l'ancienne app Next partage l'origine 127.0.0.1:43217.
- `typescript` reste en 6.x : typescript-eslint ne supporte pas TypeScript 7.
- `.npmrc` force `legacy-peer-deps` à cause d'un peer optionnel de `@vitejs/plugin-react`.
- Les dates du voyage sont des dates calendaires : toujours formatées en UTC (`src/lib/format.ts`), jamais avec le fuseau de la machine.
- **iPhone (Safari et web app installée)** : le `body` ne défile pas, donc chaque écran plus haut que la fenêtre porte son propre `overflow-y-auto` (sinon le bas est inatteignable) ; champs et `select` en 16 px minimum (`text-base`) sous peine de zoom au focus ; pas d'`autoFocus` dans un dialogue ; `useKeyboardScrollReset` remet la page à zéro après le clavier ; basename du routeur avec barre finale pour rester dans le `scope` du manifeste ; export par la feuille de partage (`exportJson`) car `<a download>` est peu fiable ; `window.print()` sans effet en mode installé (lien vers Safari) ; Plans proposé avant Google Maps (`directionsLinks`). Détection dans `src/lib/pwa.ts`, testée.
