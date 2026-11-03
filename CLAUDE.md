# vanTravelApp

Application personnelle de roadtrip en van (deux utilisateurs, mobile et web), SPA Vite + React déployée sur GitHub Pages. Ce dépôt est **public**. Architecture et décisions : `docs/ARCHITECTURE.md`. Plan de travail et état d'avancement : `docs/PLAN.md` (à mettre à jour en fin de session). Journal de bord pour le retour d'expérience : `docs/JOURNAL.md` (une entrée par session, règle 11). Règles détaillées : `.cursor/rules/`.

**Branche `v2`** (ouverte le 2 nov. 2026) : app de voyage itinérant utilisable n'importe où, avec un mode de déplacement par tronçon. Plan : `docs/PLAN-v2.md` ; cadrage et avant-après : `docs/CADRAGE-v2.md` ; décisions : `docs/adr/` ; vocabulaire : `GLOSSARY.md`. Sur cette branche, les règles ci-dessous s'appliquent avec les écarts signalés « v2 ».

Backend : un projet **Supabase** (Auth Google ou e-mail, Postgres avec règles par ligne, Storage pour les documents), schéma dans `supabase/schema.sql`, plan et étapes dans `docs/SUPABASE.md`. L'ancien dépôt de données privé `../vanTravel` (dossier `trips/`) ne sert plus qu'à la migration (`scripts/migrate-from-private-repo.mjs`) et sera archivé. Site publié : https://elienowominski.github.io/vanTravelApp/

## Règles

1. **Zéro donnée personnelle en clair ici** : voyages, réservations, codes, adresses de nuit, dates précises, dépenses et documents vivent dans Supabase, sous le compte de la personne, protégés par les règles par ligne. Seuls le catalogue générique et les préréglages de région sont commités. Aucune clé secrète nulle part dans le dépôt : seule la clé publiable (faite pour le navigateur) entre dans le build, via les variables du dépôt GitHub et `.env.local` (ignoré).
2. **Pas de serveur à nous** : Supabase est le backend (Auth, Postgres, Storage), aucune route API ni secret côté front. Tout appel part du navigateur sous la session de la personne, avec un comportement défini hors ligne.
3. **Hors ligne d'abord** : toute fonctionnalité du mode Voyager marche sans réseau une fois les données synchronisées. IndexedDB est la source de vérité locale.
4. **Mobile d'abord** : vérifier à 390 px de large, cibles tactiles de 44 px minimum, respecter les safe areas, jamais `window.confirm`, `alert` ou `prompt` (confirmation intégrée à l'interface).
5. **Rien de câblé pour un voyage donné** : dates, lieux, bbox, véhicule viennent de `TripConfig` (`src/lib/types.ts`), région de `src/data/regions/`. v2 : plus de région imposée, la zone, les pays et le fuseau de chaque étape se déduisent des étapes (ADR 0003) ; les lieux viennent d'OSM, sans clé Google (ADR 0004).
6. **Schéma stocké versionné** : tout changement de forme des données s'accompagne d'une migration et d'un test.
7. **Logique métier dans `src/lib`, pure et testée avec Vitest** ; les composants n'hébergent pas de calcul. Les services réseau vivent dans `src/services`.
8. **Sources externes** : respecter les politiques d'usage (attribution OSM et OSRM, pas de préchargement de tuiles OSM, une requête par seconde vers OSRM).
9. **Port de dev 43217** : le libérer après tout test (voir `.cursor/rules/liberer-port-dev.mdc`). v2 : port 43218, pour que la branche ait sa propre origine locale et ne migre pas les données de la v1 restées sur 127.0.0.1:43217.
10. **Git : commits directement sur `main`**, hotfix compris. Une seule personne travaille ici et chaque push déploie sur Pages. Pas de branche ni de PR sauf demande explicite (la phase 7 a vécu sur la branche `supabase` du 8 oct. 2026 jusqu'à sa fusion le jour même). Avant chaque commit : lint, typecheck, tests, et le contrôle « aucune donnée perso » de `.cursor/rules/donnees-perso-et-securite.mdc`. v2 : tout se commite sur la branche `v2`, jamais sur `main`, gelé jusqu'au retour du voyage NZ (correctifs de la v1 seulement, puis fusion de `main` dans `v2`) ; la branche utilise le projet Supabase `vantravel-next`, aucune migration ne touche la production avant la fusion (ADR 0001).
11. **Journal en fin de session** : ajouter une entrée dans `docs/JOURNAL.md` selon son gabarit (intention, demandes en substance, livré, cassé ou appris dont les erreurs de l'assistant, décisions avec leur raison, chiffres). Elle sert au retour d'expérience sur la construction de l'app : écrire ce que git ne dit pas, sans donnée personnelle. Pour une étape majeure (nouvelle version, changement d'architecture), ajouter le champ « Avant, après » et garder la trace des questions ouvertes au lancement, comme `docs/CADRAGE-v2.md` : c'est la matière d'une présentation de retour d'expérience.

## Synchro (phase 7, Supabase)

Modèle pur dans `src/lib/sync-model.ts` (fusion, extraction, réinjection, décision itinéraire) et `src/lib/sync-rows.ts` (documents de fusion <-> lignes des tables, envoi du seul plus récent, horodatages Postgres ramenés au format JavaScript par `toIso`), moteur dans `src/services/sync.ts`, adaptateur Supabase dans `src/services/supabase-sync.ts` (PostgREST, RPC `upsert_*`, Storage), client dans `src/services/supabase.ts`, session dans `src/services/auth.ts`, réglages et état dans `src/store/account-store.ts` (IndexedDB). Toute suppression d'entité Voyager passe par une pierre tombale (`tombstones`, table `deletions`), toute note ou météo par un horodatage (`notesAt`, `weatherAt`) : sans ça, la fusion ressuscite ou écrase. Le serveur n'accepte qu'une ligne plus récente (`upsert_*` en SQL) ; l'itinéraire porte un verrou optimiste sur `updated_at`. Les écritures venues de la synchro passent par `applySync` et ne relèvent pas `pending`. Tout changement de schéma = une migration numérotée dans `supabase/migrations/` + `supabase/schema.sql` à jour + `scripts/rls-check.mjs` relancé. Détails : `docs/ARCHITECTURE.md`, section Synchronisation.

## Commandes

```bash
npm run dev         # http://127.0.0.1:43218 (v2 : mode next, variables Supabase de vantravel-next lues dans .env.next.local par-dessus .env.local)
npm run data        # jeux de données publics -> public/data/generated/
npm run lint && npm run typecheck && npm test
npm run build       # dist/ (BASE_PATH=/vanTravelApp/ sur Pages)
```

## Pièges connus

- **Worker MapLibre** : MapLibre 6 ne retrouve pas son worker via le bundler. `scripts/copy-maplibre-worker.mjs` (lancé par `prepare`, `predev`, `prebuild`) le copie dans `public/maplibre/` (ignoré par git) et les cartes appellent `setWorkerUrl`. Sans lui, aucune source GeoJSON ne s'affiche.
- **Brouillon dans IndexedDB** (`src/lib/idb-storage.ts`) : un circuit avec ses tracés dépasse le quota localStorage (environ 5 à 10 Mo par origine), et l'ancienne app Next partage l'origine 127.0.0.1:43217.
- `typescript` reste en 6.x : typescript-eslint ne supporte pas TypeScript 7.
- `.npmrc` force `legacy-peer-deps` à cause d'un peer optionnel de `@vitejs/plugin-react`.
- **Horodatages Postgres** : `timestamptz` ressort en `2026-10-08T12:00:00.12+00:00` là où JavaScript écrit `.120Z` ; toute comparaison de chaînes passe par `toIso` (`src/lib/sync-rows.ts`), et le verrou optimiste renvoie la valeur brute telle que lue.
- Les sources sont en CRLF (`core.autocrlf`) : les remplacements multi-lignes par script doivent normaliser les fins de ligne.
- Les dates du voyage sont des dates calendaires : toujours formatées en UTC (`src/lib/format.ts`), jamais avec le fuseau de la machine.
- **iPhone (Safari et web app installée)** : le `body` ne défile pas, donc chaque écran plus haut que la fenêtre porte son propre `overflow-y-auto` (sinon le bas est inatteignable) ; champs et `select` en 16 px minimum (`text-base`) sous peine de zoom au focus ; pas d'`autoFocus` dans un dialogue ; `useKeyboardScrollReset` remet la page à zéro après le clavier ; basename du routeur avec barre finale pour rester dans le `scope` du manifeste ; export par la feuille de partage (`exportJson`) car `<a download>` est peu fiable ; `window.print()` sans effet en mode installé (lien vers Safari) ; Plans proposé avant Google Maps (`directionsLinks`). Détection dans `src/lib/pwa.ts`, testée.
