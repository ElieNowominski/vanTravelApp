# Architecture

Décisions prises le 29 septembre 2026. Ce document est la référence : quand le code et ce document divergent, on met l'un ou l'autre à jour dans la même PR.

## Contexte

Application personnelle pour deux personnes, utilisée sur téléphone et sur PC, pendant un roadtrip en van. L'itinéraire est figé : l'usage principal devient le suivi étape par étape (réservations, codes, documents, checklists, dépenses). Le socle de planification (carte, calques, tracés, comparaison) est conservé pour un prochain voyage.

Contraintes : aucun coût récurrent, fonctionnement hors ligne, données personnelles jamais exposées publiquement.

## Dépôts

| Dépôt | Visibilité | Contenu |
| --- | --- | --- |
| `vanTravelApp` (celui-ci) | public | Application Vite, catalogue générique, préréglages de région, workflow Pages |
| `vanTravel` | privé | `trips/index.json`, `trips/<id>/trip.json` (voyages), à venir réservations, documents, dépenses. Contient aussi l'ancienne version Next.js en archive |

## Décisions

| Sujet | Décision | Alternatives écartées |
| --- | --- | --- |
| Framework | Vite + React + TypeScript, SPA statique | Next.js en export statique (basePath, service worker moins direct, migration de toute façon nécessaire pour retirer les routes API) |
| Hébergement | GitHub Pages depuis le dépôt public, déploiement par GitHub Actions, `404.html` = SPA | Vercel, Netlify (comptes et quotas en plus, sans gain) |
| Données personnelles | Dépôt GitHub **privé**, lu et écrit depuis l'app via l'API Contents avec un token à portée fine par personne | Gist secret (pas de binaire propre pour les documents), fichiers injectés au build (publics au runtime), base de données gratuite (pause après inactivité, compte tiers) |
| Identité | Un compte GitHub par personne, collaboratrice sur le dépôt privé ; profil local (prénom, couleur) ; `updatedBy` sur chaque entité | Système de comptes maison (exige un serveur) |
| Stockage local | IndexedDB pour la bibliothèque **et** le brouillon zustand (`idb-storage.ts`) ; localStorage seulement en repli | localStorage seul (5 Mo, synchrone) |
| Synchronisation | Dernière écriture gagne par entité (`updatedAt`) avec pierres tombales, verrou optimiste via le `sha` de l'API GitHub (409 = relire, fusionner, réessayer), état local comme file d'attente : rien de spécial hors ligne, la passe repart au retour du réseau (`src/lib/sync-model.ts` pur et testé, `src/services/sync.ts`, `src/services/github-repo.ts`) | CRDT (surdimensionné pour deux personnes) ; journal d'opérations rejoué (plus de code pour le même résultat entre deux personnes) |
| Chiffrement | Optionnel, prévu en v2 : enveloppe `secure` chiffrée côté client (WebCrypto AES-GCM) pour les codes d'accès | Chiffrer tout dès la v1 |
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

Le contenu des documents (photos compressées à ~300 Ko, PDF jusqu'à 2 Mo) vit dans une base IndexedDB à part (`vantravel-docs`, `src/lib/document-store.ts`), jamais dans le brouillon JSON ; l'entité ne porte que les métadonnées et le chemin cible du dépôt privé (`trips/<id>/docs/<docId>.<ext>`) que la synchro (phase 5) remplira. La sauvegarde v3 embarque ces contenus en data URL.

Mode d'affichage : Voyager par défaut quand la date du jour dans le fuseau de la région tombe dans le voyage, ou dès que l'itinéraire est figé ; le choix explicite (`uiMode`) prend le dessus (`src/lib/voyager.ts`).

Schéma stocké **v3** (phase 5) : snapshot += `tombstones` (id -> date de suppression, posées par les actions de suppression du mode Voyager) ; étape += `notesAt` ; jour += `notesAt`, `weatherAt` ; réservation += `accessCodeSecure`.

## Synchronisation (phase 5)

Trois fichiers JSON par voyage dans le dépôt privé, à côté de `trip.json` écrit à la main :

| Fichier | Contenu | Règle de fusion |
| --- | --- | --- |
| `trips/<id>/itinerary.json` | jours, étapes (sans données de voyage), tronçons, pins, figeage, plus et moins, `updatedAt`, `updatedBy` | fichier entier : la modification structurelle la plus récente gagne (`decideItinerary`), les données de voyage locales des étapes connues sont conservées. Un snapshot réduit au départ automatique ne compte pas (`hasItinerary`), d'un côté comme de l'autre : un brouillon vide ne l'emporte jamais sur un dépôt qui a un itinéraire |
| `trips/<id>/travel.json` | par étape : réservations, documents (métadonnées), checklist, notes ; par date : notes, météo ; pierres tombales | par entité : `updatedAt` le plus récent gagne ; une pierre tombale plus récente que l'entité l'efface |
| `trips/<id>/expenses.json` | dépenses à plat (chacune porte sa date), pierres tombales | par entité, fichier à part car les deux personnes en saisissent en même temps |
| `trips/<id>/docs/<docId>.<ext>` | contenu des photos et PDF | présent ou absent : envoyé si manquant à distance, téléchargé si manquant en local |

Une passe (`syncNow`) : lecture des trois fichiers avec leur `sha`, fusion avec l'état local, application au store en une écriture (`applySync`), envoi de ce qui diffère avec le `sha` lu. Un 409 relance la passe entière (idempotente), trois tentatives. Les écritures de la synchro ne relèvent pas `pending`. Déclencheurs : modification du brouillon (4 s de délai), `online`, retour au premier plan, toutes les dix minutes, ouverture de l'app. Le planificateur ignore la réhydratation du brouillon (`persist.hasHydrated()`) : sans ce garde, chaque ouverture datait l'itinéraire local de « maintenant » et il gagnait toujours. Le dialogue annonce ce que la passe fera de l'itinéraire (`describeItinerarySync`, sha seul via `getFileMeta`) et propose « Recevoir l'itinéraire du dépôt » et « Envoyer mon itinéraire », qui forcent la décision (`resolveItineraryDecision`) ; réservations, notes et dépenses restent fusionnées par entité.

Réglages par appareil dans IndexedDB (`vantravel-sync-v1`) : compte, dépôt, branche, token à portée fine (un dépôt, Contents en écriture), voyage choisi dans `trips/index.json`, phrase de chiffrement. Le token ne part qu'en en-tête vers `api.github.com`.

Chiffrement optionnel des codes d'accès (`src/lib/secure.ts`) : AES-GCM 256, clé PBKDF2 (310 000 itérations, SHA-256) dérivée de la phrase, enveloppe `v1.<sel>.<iv>.<chiffré>`. Dans le dépôt, `accessCodeSecure` remplace `accessCode` ; un appareil sans la phrase garde l'enveloppe et affiche « code chiffré ». L'enveloppe existante est réutilisée tant que le code ne change pas, pour ne pas réécrire le fichier à chaque passe.

## Flux des données au démarrage

1. Réhydratation du brouillon (IndexedDB, `useTripBoot`), puis choix du mode (Planifier ou Voyager).
2. Sans voyage chargé, en dev : lecture de `/__private/trips/index.json` puis du premier `trip.json` (plugin Vite `privateDataPlugin`).
3. Toujours sans voyage : écran de démarrage (`TripSetupScreen`) : importer une sauvegarde, rouvrir un circuit de la bibliothèque, créer un voyage neuf.
4. Sans voyage mais synchro configurée (nouvel appareil) : `syncNow("démarrage")` lit `trip.json` puis l'itinéraire et les données de voyage du dépôt privé. Si ni le dépôt ni l'appareil n'ont d'itinéraire, le `plan` de `trip.json` est posé (routes recalculées) et envoyé à la passe suivante.
5. Un circuit local sous un autre identifiant que `trip.json` (sauvegarde importée, bibliothèque) est conservé par la synchro s'il couvre les mêmes dates : `decideItinerary` tranche ensuite. Seul un calendrier différent remet le brouillon à zéro.

## Phases

1. Hygiène : token révoqué, sauvegarde export et import, lint propre. **Fait.**
2. Statique : entité `Trip`, migration Vite, suppression des routes API, données générées au build, déploiement Pages, PWA de base. **Fait dans ce dépôt.**
3. Hors ligne : bandeau d'état réseau, invite d'installation, allègement du stockage (une seule géométrie par tronçon une fois l'itinéraire figé). **Fait.**
4. Mode Voyager : réservations, documents, checklists, dépenses, écran « Aujourd'hui », roadbook imprimable, refonte mobile, suppression de `window.confirm`. **Fait, à valider sur téléphone.**
5. Synchronisation : dépôt privé via API GitHub, token par personne, fusion, reprise au retour du réseau. **Fait, à valider à deux téléphones.**
6. Socle multi-voyage et enrichissement Google.
