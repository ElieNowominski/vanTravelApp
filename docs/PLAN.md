# Plan de travail vanTravel

Document de reprise pour une session Claude Code (ou humaine). Lire d'abord `CLAUDE.md`, puis `docs/ARCHITECTURE.md`, puis ce fichier. Mettre à jour la section « État » à chaque étape livrée.

## Les deux dépôts

| Dépôt | Chemin local | Rôle | Visibilité |
| --- | --- | --- | --- |
| `vanTravelApp` | `C:\Users\enowo\Documents\Projects\vanTravelApp` | Application Vite + React, GitHub Pages, ce plan | public |
| `vanTravel` | `C:\Users\enowo\Documents\Projects\vanTravel` | Données perso (`trips/`), ancienne app Next.js en archive | privé |

Une session travaille dans `vanTravelApp`. Elle lit et écrit `../vanTravel/trips/` pour les données de test ; en dev, Vite sert ce dossier sous `/__private/`. Rien de `vanTravel` ne doit être copié dans `vanTravelApp` (voir `.cursor/rules/donnees-perso-et-securite.mdc`).

Site publié : `https://elienowominski.github.io/vanTravelApp/`. Déploiement automatique à chaque push sur `main`.

Prompt de reprise à coller dans une nouvelle session :

> Lis `CLAUDE.md`, `docs/ARCHITECTURE.md` et `docs/PLAN.md`. Le dépôt privé est dans `../vanTravel`. Reprends à la première étape non cochée de la phase en cours, dans une branche, et mets à jour l'état du plan en fin de travail.

## État

- [x] Phase 1 : hygiène (token révoqué, sauvegarde export et import, lint propre)
- [x] Phase 2 : Vite, entité `TripConfig`, données au build, PWA de base, GitHub Pages en ligne (29 sept. 2026)
- [ ] Phase 3 : hors ligne solide (fait le 29 sept. : navigation mobile par onglets Carte / Itinéraire avec geste retour, défilement natif du panneau, revérification horaire des mises à jour du service worker)
- [ ] Phase 4 : mode Voyager
- [ ] Phase 5 : synchronisation entre appareils
- [ ] Phase 6 : socle multi-voyage, Google

Fait savoir : les données sont stockées **par navigateur et par appareil** (IndexedDB). Tant que la phase 5 n'est pas là, le seul pont entre appareils est le fichier de sauvegarde (bibliothèque, boutons Exporter et Importer).

## Conventions de travail

- Une branche par phase (`phase-3-offline`, `phase-4-voyager`…), PR vers `main`, le déploiement suit.
- Avant de livrer : `npm run lint && npm run typecheck && npm test && npm run build`, puis test manuel à 390 px et réseau coupé pour tout ce qui touche au mode Voyager. Libérer le port 43217.
- Toute nouvelle forme de donnée stockée : bump de `schemaVersion`, migration dans `src/lib`, test Vitest.
- Logique dans `src/lib` (pure) et `src/services` (réseau) ; composants sans calcul.
- Pas de `window.confirm`, `alert`, `prompt` dans le nouveau code.

## Phase 3 : hors ligne solide (1 à 2 jours)

Objectif : l'app installée sur le téléphone se lance et affiche l'itinéraire sans réseau.

- [ ] Bandeau d'état réseau (hors ligne, synchronisation en attente) et bouton d'installation PWA (`beforeinstallprompt`, guide iOS « Ajouter à l'écran d'accueil »).
- [ ] Allègement du stockage : quand l'itinéraire est figé, ne garder que la géométrie choisie par tronçon (`Leg.options` réduit à un élément) ; commande « Figer l'itinéraire » dans la bibliothèque.
- [ ] Écran d'erreur clair quand un jeu de données manque (`loadDataset`) au lieu d'un message dans les calques.
- [ ] Vérifier le service worker sur Pages : mise à jour silencieuse, `navigateFallback` sous `/vanTravelApp/`, précache des `.geojson`.
- [ ] Test Playwright minimal (optionnel) : chargement, ouverture d'un circuit de démo, mode hors ligne.

Critère : Lighthouse PWA installable ; en avion, l'itinéraire et les fiches s'ouvrent.

## Phase 4 : mode Voyager (3 à 5 jours)

Objectif : l'écran par défaut en voyage. Le mode Planifier reste accessible.

### Modèle (dans `src/lib/types.ts`, `schemaVersion` 2)

```ts
type Booking = { id; provider; reference?; accessCode?; address?; phone?; url?; checkIn?; checkOut?; price?: { amount; currency }; notes?; updatedAt; updatedBy };
type Document = { id; kind: "image" | "pdf"; caption?; path; /* chemin dans le dépôt privé */ size; updatedAt; updatedBy };
type ChecklistItem = { id; text; done; updatedAt; updatedBy };
type Expense = { id; date; amount; currency; category; paidBy; note?; updatedAt; updatedBy };
Stop += { bookings: Booking[]; documents: Document[]; checklist: ChecklistItem[]; notes?: string };
TripDay += { notes?: string; expenses: Expense[] };
```

Migration : les circuits existants reçoivent des tableaux vides. Profil local (`prénom`, `couleur`) dans `src/lib/profile.ts`, stocké dans IndexedDB, renseigne `updatedBy`.

### Écrans

- [ ] Bascule Planifier / Voyager dans l'en-tête ; Voyager par défaut quand la date du jour (fuseau de la région) est dans l'intervalle du voyage ou que l'itinéraire est figé.
- [ ] « Aujourd'hui » : jour courant, prochaine étape, temps de route, nuit du soir avec référence et code, boutons « Ouvrir dans Google Maps » (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) et « Appeler » (numéro affiché en clair), météo notée à la main.
- [ ] Fiche étape : réservations (formulaire), documents (photo ou PDF, compressés côté client à ~300 Ko max), checklist, notes. Champs sensibles masqués par défaut (code d'accès révélé au toucher).
- [ ] Journal des dépenses : saisie rapide, total par jour et total voyage, qui a payé, répartition entre les deux profils.
- [ ] Liste des jours en défilement horizontal, cible tactile 44 px, safe areas.
- [ ] Roadbook imprimable : route `/roadbook` en HTML sémantique, `@media print`, un jour par section, `break-inside: avoid`, image de carte par jour capturée à la demande ; retirer jsPDF quand le roadbook couvre le besoin.
- [ ] Purger `window.confirm` (panneau itinéraire, bibliothèque) au profit d'une confirmation intégrée ; popups carte en composants React.

Critère : en voyage, sans réseau, on retrouve en trois touches la nuit du soir, son code et l'itinéraire vers elle.

## Phase 5 : synchronisation entre appareils (2 à 3 jours)

Objectif : deux téléphones, un même voyage, sans base de données.

- [ ] `src/services/github-repo.ts` : client API Contents (GET avec `sha`, PUT avec `sha` pour le verrou optimiste, gestion 409 par relecture et fusion). Token à portée fine (un dépôt, permission contenu) saisi une fois, stocké dans IndexedDB, jamais dans le code ni dans le bundle.
- [ ] Écran « Compte et synchro » : coller le token, tester, choisir le voyage dans `trips/index.json`, afficher l'état (dernière synchro, en attente, conflit).
- [ ] Modèle de fusion dans `src/lib/merge.ts` : dernière écriture gagne par entité (`updatedAt`), suppression tombstone, test Vitest exhaustif.
- [ ] File d'écritures hors ligne (IndexedDB), rejouée au retour du réseau (`online`, `visibilitychange`), un fichier par entité volumineuse (`bookings.json`, `expenses.json`, `docs/<id>`), pour limiter les conflits.
- [ ] Chiffrement optionnel des codes d'accès : enveloppe `secure` AES-GCM, clé dérivée d'une phrase partagée (PBKDF2, WebCrypto), activable dans « Compte et synchro ».
- [ ] Côté dépôt privé : ajouter la compagne comme collaboratrice, structure `trips/<id>/{trip.json,bookings.json,expenses.json,checklists.json,docs/}` documentée dans `trips/README.md`.

Critère : une réservation saisie sur un téléphone apparaît sur l'autre après retour du réseau, sans écraser une modification faite entre-temps.

## Phase 6 : socle multi-voyage et Google (quand le besoin vient)

- [ ] Sélecteur de voyage (plusieurs `trip.json`), création d'un voyage avec région, véhicule et point de départ ; nouvelle région = un fichier dans `src/data/regions/` et un catalogue dans `src/data/catalog/`.
- [ ] Enrichissement Google Places (New) à la planification : clé restreinte par référent HTTP, résultats stockés dans le catalogue ou les hébergements, jamais appelés en voyage.
- [ ] Découpage de `trip-map.tsx` (853 lignes) en modules par calque ; tests des reducers du store.
- [ ] Mode sombre (tokens déjà présents dans `index.css`).

## Idées écartées ou différées, avec la raison

- Préchargement de tuiles OSM : interdit par la politique d'usage OSM. Alternative future : extrait PMTiles auto-hébergé, à évaluer (taille, requêtes Range sur Pages).
- Base de données gratuite (Supabase, Firebase) : compte tiers, pause après inactivité, données perso hors de contrôle.
- Gist comme stockage : pas de binaire propre pour les documents.
