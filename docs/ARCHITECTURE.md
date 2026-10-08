# Architecture

Décisions prises le 29 septembre 2026, backend Supabase décidé le 7 octobre et livré le 8 octobre 2026 (phase 7). Ce document est la référence : quand le code et ce document divergent, on met l'un ou l'autre à jour dans la même PR.

## Contexte

Application personnelle pour deux personnes, utilisée sur téléphone et sur PC, pendant un roadtrip en van. L'itinéraire est figé : l'usage principal devient le suivi étape par étape (réservations, codes, documents, checklists, dépenses). Le socle de planification (carte, calques, tracés, comparaison) est conservé pour un prochain voyage.

Contraintes : aucun coût récurrent (plan gratuit Supabase, Pro à 25 $ envisagé pour le seul mois du voyage), fonctionnement hors ligne, données personnelles jamais exposées publiquement, documents jamais stockés chez GitHub.

## Dépôts

| Dépôt | Visibilité | Contenu |
| --- | --- | --- |
| `vanTravelApp` (celui-ci) | public | Application Vite, catalogue générique, préréglages de région, workflow Pages |
| Projet Supabase | compte par personne | Auth (Google, e-mail), tables `trips`, `members`, `itineraries`, `travel_items`, `expenses`, `deletions`, `profiles`, `heartbeat`, bucket `documents` ; schéma `supabase/schema.sql`, migrations `supabase/migrations/` |
| `vanTravel` | privé, archive | Ancien stockage (`trips/`, phase 5) et ancienne version Next.js. Migré par `scripts/migrate-from-private-repo.mjs` |

## Décisions

| Sujet | Décision | Alternatives écartées |
| --- | --- | --- |
| Framework | Vite + React + TypeScript, SPA statique | Next.js en export statique (basePath, service worker moins direct, migration de toute façon nécessaire pour retirer les routes API) |
| Hébergement | GitHub Pages depuis le dépôt public, déploiement par GitHub Actions, `404.html` = SPA | Vercel, Netlify (comptes et quotas en plus, sans gain) |
| Données personnelles | **Supabase** (8 oct. 2026) : Postgres avec règles par ligne par voyage (`is_member`), Storage privé pour les documents, clé publiable dans le build (faite pour le navigateur), aucune clé secrète. Jusqu'au 7 oct. : dépôt GitHub privé via l'API Contents avec un token par personne | Firebase (carte bancaire exigée pour Storage, enfermement), Cloudflare Access + R2 (impasse pour des comptes tiers), PocketBase (serveur à entretenir), chiffrement des documents sur GitHub (règle la technique, pas l'inconfort), Gist secret, fichiers au build |
| Identité | Un compte Supabase par personne (Google ou e-mail), membre d'un voyage (`members`, ajout par e-mail par le propriétaire) ; profil local (prénom, couleur) qui signe `updatedBy`, prénom du compte en repli | Système de comptes maison (exige un serveur) ; un compte GitHub par personne (phase 5) |
| Stockage local | IndexedDB pour la bibliothèque **et** le brouillon zustand (`idb-storage.ts`) ; localStorage seulement en repli | localStorage seul (5 Mo, synchrone) |
| Synchronisation | Dernière écriture gagne par entité (`updatedAt`) avec pierres tombales, une ligne par entité et l'itinéraire en un document ; le serveur n'accepte qu'une ligne plus récente (`upsert_*` SQL) et l'itinéraire porte un verrou optimiste sur `updated_at` (0 ligne modifiée = relire, fusionner, réessayer) ; état local comme file d'attente : rien de spécial hors ligne, la passe repart au retour du réseau (`src/lib/sync-model.ts` et `src/lib/sync-rows.ts` purs et testés, `src/services/sync.ts`, `src/services/supabase-sync.ts`) | CRDT (surdimensionné pour deux personnes) ; journal d'opérations rejoué ; lecture incrémentale `since` (tout est relu à chaque passe : quelques centaines de lignes, et la comparaison locale reste exacte) |
| Chiffrement | Optionnel : enveloppe chiffrée côté client (WebCrypto AES-GCM, phrase partagée) pour les codes d'accès, dans `payload` ; un code que le serveur détient en clair est redaté pour que le serveur accepte l'enveloppe | Chiffrer tout dès la v1 ; s'en remettre au seul chiffrement au repos de Supabase |
| Hors ligne | vite-plugin-pwa : précache de l'app, des polices, du catalogue et des jeux de données ; runtime cache pour les tuiles déjà vues | Préchargement de tuiles OSM (interdit par la politique d'usage) |
| Carte hors ligne | Liens vers Google Maps et Apple Plans pour la navigation ; tracés stockés avec l'itinéraire donc visibles hors ligne | Tuiles vectorielles auto-hébergées (à réévaluer si besoin réel) |
| Données externes | DOC et OSM téléchargés par `scripts/fetch-datasets.mjs` (local et GitHub Action) et servis en statique | Appels Overpass et ArcGIS au runtime (CORS, latence, indisponibles hors ligne) |
| Routage | OSRM public depuis le navigateur, dans la limite de sa politique ; estimation en fallback ; aucune clé ORS dans le bundle | Routage serveur |
| Roadbook | Route `/roadbook` en HTML sémantique avec `@media print`, un jour par section, croquis SVG du tracé stocké (hors ligne, sans tuile) | jsPDF (conservé jusqu'à validation du roadbook sur le téléphone) ; capture de tuiles OSM par jour (politique d'usage, réseau) |
| Popups carte | Composants React montés par `createRoot` dans le conteneur MapLibre (`react-popup.ts`) | Chaînes HTML échappées à la main |
| Google | Places API (New) avec clé restreinte par référent HTTP, à la planification, résultats stockés dans les données | Appels Google au runtime en voyage |

## Modèle

`TripConfig` (`src/lib/types.ts`) : identité du voyage, région, dates de début et fin, arrivée optionnelle, véhicule, hébergements privés, plan. Tout ce qui était en constantes (dates, Christchurch, bbox, van) en dérive. Le store (`src/store/trip-store.ts`) porte `config`; les jours sont générés à partir des dates ; le catalogue affiché est `buildCatalog(config)` = catalogue public de la région + `config.stays`.

Un `SavedTrip` embarque son `config`. Les circuits de l'ancienne version n'en ont pas : `configFromSnapshot` en dérive un (dates des jours, première étape comme départ, étapes « camp » comme hébergements).

Depuis la phase 4 (schéma stocké **v2**, `src/lib/migrations.ts`), par étape : `bookings[]`, `documents[]`, `checklist[]`, `notes` ; par jour : `notes`, `weather`, `expenses[]` ; par snapshot : `frozenAt` (itinéraire figé, une géométrie par tronçon). Chaque entité porte `id`, `updatedAt`, `updatedBy` (prénom du profil local, `src/store/profile-store.ts`). `migrateSnapshot` est idempotente et s'applique au brouillon zustand (`version: 2`), à la bibliothèque et aux sauvegardes.

Le contenu des documents (photos compressées à ~300 Ko, PDF jusqu'à 2 Mo) vit dans une base IndexedDB à part (`vantravel-docs`, `src/lib/document-store.ts`), jamais dans le brouillon JSON ; l'entité ne porte que les métadonnées, et le fichier vit dans le bucket `documents` sous `<voyage>/<docId>.<ext>` (`storageObjectPath`). La sauvegarde v3 embarque ces contenus en data URL.

Mode d'affichage : Voyager par défaut quand la date du jour dans le fuseau de la région tombe dans le voyage, ou dès que l'itinéraire est figé ; le choix explicite (`uiMode`) prend le dessus (`src/lib/voyager.ts`).

Schéma stocké **v3** (phase 5) : snapshot += `tombstones` (id -> date de suppression, posées par les actions de suppression du mode Voyager) ; étape += `notesAt` ; jour += `notesAt`, `weatherAt` ; réservation += `accessCodeSecure`.

## Synchronisation (phase 7, Supabase)

Par voyage, dans Postgres, sous les règles par ligne `is_member(trip_id)` :

| Table | Contenu | Règle de fusion |
| --- | --- | --- |
| `trips` | `config` = le `TripConfig` (même format que `trip.json`), `owner_id`, `name` | lu quand l'appareil n'a pas le voyage ; créé par `create_trip` (voyage + membre propriétaire en une transaction) |
| `itineraries` | un document par voyage : jours, étapes (sans données de voyage), tronçons arrondis à cinq décimales, pins, figeage, plus et moins, `updated_at`, `updated_by` | document entier : la modification structurelle la plus récente gagne (`decideItinerary`), les données de voyage locales des étapes connues sont conservées ; un snapshot réduit au départ automatique ne compte pas (`hasItinerary`). Verrou optimiste : `update … where updated_at = <valeur lue>`, 0 ligne = conflit, la passe entière est rejouée (trois tentatives) |
| `travel_items` | une ligne par réservation, document (métadonnées), coche, note d'étape (`<stopId>:notes`), note ou météo de jour (`<date>:notes`, `<date>:weather`) ; `payload` = l'entité, `kind`, `scope`, `updated_at`, `updated_by` ; clé (`trip_id`, `id`) | par entité : `updatedAt` le plus récent gagne, une pierre tombale plus récente l'efface. Le client n'envoie que les lignes absentes ou plus récentes que le serveur (`newerRows`), le serveur ne remplace que si `updated_at` est strictement plus récent (`upsert_travel_items`) |
| `expenses` | une ligne par dépense, table à part car les deux personnes en saisissent en même temps | idem (`upsert_expenses`) |
| `deletions` | pierres tombales (`entity_id`, `deleted_at`) | la plus récente gagne (`upsert_deletions`) |
| bucket `documents` | `<voyage>/<docId>.<ext>` | présent ou absent : envoyé si manquant à distance (`upsert: false`, « existe déjà » = l'autre appareil l'a envoyé), téléchargé si manquant en local, retiré quand l'entité est enterrée |

Une passe (`syncNow`) : lecture du voyage si besoin, puis de l'itinéraire, de toutes les lignes et des suppressions en parallèle ; fusion avec l'état local (`sync-model.ts` sur les documents reconstitués par `sync-rows.ts`) ; application au store en une écriture (`applySync`) ; envoi de l'itinéraire si la décision est « envoyer », des lignes plus récentes, des suppressions, puis des documents. Les écritures de la synchro ne relèvent pas `pending`. Déclencheurs : modification du brouillon (4 s de délai), `online`, retour au premier plan, toutes les dix minutes, ouverture de l'app. Le planificateur ignore la réhydratation du brouillon (`persist.hasHydrated()`). Le dialogue annonce ce que la passe fera de l'itinéraire (`describeItinerarySync`, `updated_at` seul via `fetchItineraryMeta`) et propose « Recevoir l'itinéraire du compte » et « Envoyer mon itinéraire » (`resolveItineraryDecision`).

Horodatages : chaque entité garde son `updatedAt` JavaScript dans `payload` ; la colonne `updated_at` (timestamptz) sert au serveur. Postgres renvoie `2026-10-08T12:00:00.12+00:00` là où JavaScript écrit `.120Z` : toute comparaison passe par `toIso`, et le verrou optimiste renvoie la valeur brute telle que lue (`seen.itinerary`).

Réglages et état par appareil dans IndexedDB (`vantravel-account-v1`, `src/store/account-store.ts`) : identité recopiée (id, e-mail, prénom) pour l'affichage hors ligne, voyage choisi, synchro automatique, phrase de chiffrement, `pending`, `itineraryChangedAt`, `seen` (`itinerary` -> `updated_at` brut, `doc:<id>` -> dans le bucket, `gone:<id>` -> retiré). La session elle-même (jetons) vit dans le stockage de supabase-js, rafraîchie à la reconnexion ; l'app n'attend jamais la session pour afficher les données locales.

Accès : `members` (propriétaire ou membre) conditionne toutes les tables et le bucket ; le propriétaire ajoute une personne par e-mail (`add_member_by_email`, security definer, lit `auth.users`) et peut la retirer ; `profiles` (prénom affiché) est créé par trigger à l'inscription et lisible entre co-membres ; `heartbeat` n'est touché que par `beat()` (anonyme autorisé) pour le maintien en éveil. `scripts/rls-check.mjs` rejoue ces règles avec deux comptes de test.

Chiffrement optionnel des codes d'accès (`src/lib/secure.ts`) : AES-GCM 256, clé PBKDF2 (310 000 itérations, SHA-256) dérivée de la phrase, enveloppe `v1.<sel>.<iv>.<chiffré>`. Dans `payload`, `accessCodeSecure` remplace `accessCode` ; un appareil sans la phrase garde l'enveloppe et affiche « code chiffré ». L'enveloppe existante est réutilisée tant que le code ne change pas ; un code que le serveur détient en clair est redaté de « maintenant » pour que le serveur, qui n'accepte qu'une ligne plus récente, remplace le clair par l'enveloppe.

## Flux des données au démarrage

1. Réhydratation du brouillon (IndexedDB, `useTripBoot`), puis choix du mode (Planifier ou Voyager).
2. En parallèle, `startAuthListener` relit la session supabase-js et recopie l'identité dans le store de compte (hors ligne, l'identité mémorisée reste).
3. Sans voyage chargé mais connecté : le voyage mémorisé, sinon le premier du compte (`listMemberTrips`), puis `syncNow("démarrage")` lit `trips.config`, l'itinéraire et les données de voyage. Si ni le compte ni l'appareil n'ont d'itinéraire, le `plan` du voyage est posé (routes recalculées) et envoyé à la passe suivante.
4. Toujours sans voyage : écran de démarrage (`TripSetupScreen`) : se connecter, importer une sauvegarde, rouvrir un circuit de la bibliothèque, créer un voyage neuf. Un voyage local se met sur le compte depuis le dialogue (« Mettre « nom » sur le compte », `create_trip`), puis la première passe envoie tout.
5. Un circuit local sous un autre identifiant que le voyage du compte (sauvegarde importée, bibliothèque) est conservé par la synchro s'il couvre les mêmes dates : `decideItinerary` tranche ensuite. Seul un calendrier différent remet le brouillon à zéro.

## Phases

1. Hygiène : token révoqué, sauvegarde export et import, lint propre. **Fait.**
2. Statique : entité `Trip`, migration Vite, suppression des routes API, données générées au build, déploiement Pages, PWA de base. **Fait dans ce dépôt.**
3. Hors ligne : bandeau d'état réseau, invite d'installation, allègement du stockage (une seule géométrie par tronçon une fois l'itinéraire figé). **Fait.**
4. Mode Voyager : réservations, documents, checklists, dépenses, écran « Aujourd'hui », roadbook imprimable, refonte mobile, suppression de `window.confirm`. **Fait, à valider sur téléphone.**
5. Synchronisation : dépôt privé via API GitHub, token par personne, fusion, reprise au retour du réseau. **Fait, remplacé par la phase 7.**
6. Socle multi-voyage et enrichissement Google.
7. Supabase : comptes, Postgres avec règles par ligne, Storage, migration, maintien en éveil. **Code livré le 8 oct. 2026 sur la branche `supabase`, à valider à deux téléphones avant fusion.**
