# Plan de travail vanTravel

Document de reprise pour une session Claude Code (ou humaine). Lire d'abord `CLAUDE.md`, puis `docs/ARCHITECTURE.md`, puis ce fichier. Mettre à jour la section « État » à chaque étape livrée.

## Les deux dépôts

| Dépôt | Chemin local | Rôle | Visibilité |
| --- | --- | --- | --- |
| `vanTravelApp` | `C:\Users\enowo\Documents\Projects\vanTravelApp` | Application Vite + React, GitHub Pages, ce plan | public |
| `vanTravel` | `C:\Users\enowo\Documents\Projects\vanTravel` | Archive : ancien stockage des données (`trips/`, phases 5 et 6), ancienne app Next.js. Source de la migration vers Supabase | privé |
| Projet Supabase | tableau de bord | Comptes, données de voyage, documents (phase 7) | compte par personne |

Une session travaille dans `vanTravelApp`, avec un `.env.local` (URL et clé publiable Supabase, voir `.env.example`). Rien de `vanTravel` ne doit être copié dans `vanTravelApp` (voir `.cursor/rules/donnees-perso-et-securite.mdc`).

Site publié : `https://elienowominski.github.io/vanTravelApp/`. Déploiement automatique à chaque push sur `main`.

Prompt de reprise à coller dans une nouvelle session :

> Lis `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md` et `docs/SUPABASE.md`. Reprends à la première étape non cochée de la phase en cours. Tant que la phase 7 n'est pas validée à deux téléphones, le travail se fait sur la branche `supabase` ; ensuite, commits directement sur `main` (personne seule sur le projet, le déploiement suit chaque push). Mets à jour l'état du plan et le journal en fin de travail.

## État

- [x] Phase 1 : hygiène (token révoqué, sauvegarde export et import, lint propre)
- [x] Phase 2 : Vite, entité `TripConfig`, données au build, PWA de base, GitHub Pages en ligne (29 sept. 2026)
- [x] Phase 3 : hors ligne solide (29 sept. 2026 : onglets Carte / Itinéraire avec geste retour, bandeau réseau, bouton d'installation, figeage de l'itinéraire, notice de jeux de données, service worker vérifié sous `/vanTravelApp/` ; test Playwright optionnel non fait)
- [x] Phase 4 : mode Voyager (29 sept. 2026, branche `phase-4-voyager` : schéma v2 migré et testé, écran « Aujourd'hui », fiches étape, dépenses, roadbook, popups React, `window.confirm` purgé). Fusionnée dans `main` (PR #1). **Reste à valider sur téléphone à 390 px et réseau coupé** ; jsPDF conservé jusque-là.
- [x] Correctifs iPhone (30 sept. 2026, voir « iPhone » ci-dessous) : à **confirmer sur l'iPhone** (Safari puis app installée) car aucun WebKit n'est disponible en session.
- [x] Phase 5 : synchronisation entre appareils (30 sept. 2026 : code livré et testé unitairement ; **reste à faire par la personne** : créer un token à portée fine par téléphone, ajouter la compagne comme collaboratrice du dépôt privé, valider à deux téléphones, voir « Mise en service » ci-dessous).
- [~] Phase 6 : socle multi-voyage, Google (30 sept. 2026 : mode sombre fait, sélecteur couvert par la synchro et la bibliothèque ; Google bloqué sans clé ; découpage de `trip-map.tsx` à faire)
- [~] Phase 7 : Supabase à la place du dépôt GitHub privé (comptes Google et e-mail, Postgres avec règles par ligne, Storage pour les documents). Plan, schéma et étapes : `docs/SUPABASE.md`. **8 oct. 2026 : lots A à G livrés sur la branche `supabase`** (client et session, adaptateur et moteur, voyages et membres, documents, script de migration, déploiement et veille, script de contrôle RLS ; lint, typecheck, 94 tests, build verts). Migrations 0002 et 0003 exécutées, `scripts/rls-check.mjs` : 37/37 le 8 oct. **Fusionné dans `main` le 8 oct. 2026** (décision de la personne : validation directement sur l'app déployée). **Reste** : créer les comptes, mettre `#FINAL` sur le compte, ajouter la compagne, valider à deux téléphones, Google (optionnel), archiver `vanTravel` ; voir « Mise en service (phase 7) ».

Fait savoir : les données sont stockées **par navigateur et par appareil** (IndexedDB), y compris les photos et PDF (base `vantravel-docs`, embarqués dans la sauvegarde v3). Le pont entre appareils est la synchro (compte Supabase) ; le fichier de sauvegarde reste le plan B.

## Conventions de travail

- Commits directement sur `main`, hotfix compris : une seule personne travaille sur le projet et chaque push déploie. Pas de branche ni de PR sauf demande explicite (les phases 3 et 4 ont été livrées par PR, avant cette décision du 29 sept. 2026 ; la phase 7 vit sur la branche `supabase` jusqu'à validation, `main` continuant de déployer la version GitHub).
- Tester la branche sans la déployer : `npm run dev` avec `.env.local`, deux profils Chrome = deux comptes ; depuis un téléphone sur le même Wi-Fi, `http://<ip-du-pc>:43217/` (connexion par e-mail ; pas de service worker en HTTP, le reste est identique). `workflow_dispatch` de `deploy.yml` depuis la branche remplacerait le site publié : à réserver au basculement.
- Avant de livrer : `npm run lint && npm run typecheck && npm test && npm run build`, puis test manuel à 390 px et réseau coupé pour tout ce qui touche au mode Voyager. Libérer le port 43217.
- Toute nouvelle forme de donnée stockée : bump de `schemaVersion`, migration dans `src/lib`, test Vitest.
- Logique dans `src/lib` (pure) et `src/services` (réseau) ; composants sans calcul.
- Pas de `window.confirm`, `alert`, `prompt` dans le nouveau code.

## Phase 3 : hors ligne solide (1 à 2 jours)

Objectif : l'app installée sur le téléphone se lance et affiche l'itinéraire sans réseau.

- [x] Bandeau d'état réseau (`network-banner.tsx` ; la synchro en attente s'y ajoutera en phase 5) et bouton d'installation PWA (`install-button.tsx`, `use-install-prompt.ts`, guide iOS ; contexte calculé dans `src/lib/pwa.ts`, testé).
- [x] Allègement du stockage : `src/lib/freeze.ts` (testé), `frozenAt` sur le snapshot et le brouillon, commandes « Figer l'itinéraire » et « Rouvrir » dans la bibliothèque avec le gain affiché, badge « Figé » dans le panneau.
- [x] Notice claire sur la carte quand un jeu de données manque (`dataset-notice.tsx`), fermable et non bloquante : l'itinéraire et les fiches n'en dépendent pas. Les calques ne portent plus d'erreur.
- [x] Service worker vérifié sur un build `BASE_PATH=/vanTravelApp/` : `navigateFallback` → `/vanTravelApp/index.html`, trois `.geojson` précachés (39 entrées, 4,4 Mo), mise à jour en mode `prompt` : la nouvelle version attend un toucher sur « Mettre à jour » (`update-banner.tsx`, `src/services/app-update.ts`), rien ne se recharge pendant une saisie ; revérification horaire. Pont de transition `public/sw-bridge.js` : si seules d'anciennes pages (mise à jour automatique) sont ouvertes, la nouvelle version prend la main tout de suite, sinon elle attend l'invite.
- [ ] Test Playwright minimal (optionnel, non fait) : chargement, ouverture d'un circuit de démo, mode hors ligne.

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

- [x] Bascule Planifier / Voyager dans l'en-tête (`mode-switch.tsx`) ; défaut calculé par `defaultMode` (`src/lib/voyager.ts`, testé) : Voyager pendant le voyage dans le fuseau de la région ou si l'itinéraire est figé ; choix explicite persisté (`uiMode`).
- [x] « Aujourd'hui » (`voyager/today-card.tsx`, `summarizeDay` testé) : jour courant, départ → nuit, prochaine étape, temps de route van, nuit du soir avec référence et code masqué (`secret-field.tsx`), Google Maps et Appeler (numéro en clair), météo et notes du jour.
- [x] Fiche étape (`voyager/stop-sheet.tsx`, panneau bas) : réservations (formulaire et cartes), documents (photo ou PDF ; JPEG recompressé vers ~300 Ko par `image-compress.ts`, contenu dans IndexedDB `vantravel-docs`), checklist, notes. Code d'accès masqué, révélé au toucher, re-masqué après 20 s.
- [x] Journal des dépenses (`voyager/expenses-panel.tsx`, `src/lib/expenses.ts` testé) : saisie rapide en devise de la région, total du jour et du voyage par devise, par payeur, par catégorie, qui doit combien à qui (parts égales). Profil local (prénom, couleur, prénom de l'autre) dans `profile-store.ts`.
- [x] Liste des jours en défilement horizontal (`voyager/day-strip.tsx`, cibles 56 × 60 px, jour courant marqué), safe areas haut et bas.
- [x] Roadbook imprimable (`roadbook/roadbook-page.tsx`, route `/roadbook`) : HTML sémantique, `@media print`, un jour par section avec `break-inside: avoid`, codes d'accès exclus par défaut. **Écart au plan** : au lieu d'une capture de tuiles par jour, un croquis SVG du tracé stocké (`src/lib/route-sketch.ts`, testé) : hors ligne, imprimable, sans tuile OSM. jsPDF reste jusqu'à validation du roadbook sur le téléphone.
- [x] `window.confirm` purgé (`ConfirmAction` : Plan, ouverture et suppression d'un circuit, figeage, suppressions Voyager) ; popups carte en React (`map-popup.tsx`, `react-popup.ts`, carte de comparaison incluse).

Critère : en voyage, sans réseau, on retrouve en trois touches la nuit du soir, son code et l'itinéraire vers elle.

### iPhone (Safari et web app installée), 30 sept. 2026

Retour terrain : « navigation bloquée » dans Safari sur iPhone, installation laborieuse (réussie via Safari). Sans WebKit en session, les causes ont été cherchées dans le code ; chaque correctif vise un comportement iOS documenté.

- [x] Écran de démarrage (`trip-setup-screen.tsx`) : le `body` ne défile pas, l'écran dépassait la fenêtre sur iPhone (barres Safari) et le bouton « Créer le voyage » était hors de portée. L'écran porte son propre défilement. `select` en 16 px (sinon zoom au focus).
- [x] Onglets Carte / Itinéraire (`trip-app.tsx`) : l'état affiché ne dépend plus de `popstate` (`history.back()` reste un confort pour le geste retour).
- [x] Clavier iOS : plus d'`autoFocus` dans le dialogue de profil (ouvert d'office au premier lancement en mode Voyager) ; `useKeyboardScrollReset` remet la page à zéro après la fermeture du clavier.
- [x] Scope du manifeste : basename du routeur `/vanTravelApp/` (barre finale) pour que « Retour » produise une URL dans le `scope`, sinon la web app installée peut ouvrir Safari ou afficher une barre de navigateur.
- [x] Sauvegarde : `exportJson` passe par la feuille de partage sur iOS (Fichiers, AirDrop vers l'autre téléphone) ; `<a download>` ailleurs. `chooseExportMethod` testé.
- [x] Roadbook : en web app iOS installée, `window.print()` est sans effet ; lien « Ouvrir dans Safari pour imprimer ». `printNeedsBrowser` testé.
- [x] Guidage : Plans proposé avant Google Maps sur iPhone (`directionsLinks` testé, `DirectionsButtons`), Google Maps partout.
- [x] Guide d'installation : préciser Safari (ni Chrome ni lien ouvert depuis Messages) et pourquoi installer (Safari seul purge le stockage après 7 jours sans visite). `navigator.storage.persist()` demandé au démarrage (Chromium).
- [ ] À vérifier sur l'iPhone : lancement depuis l'icône, Carte ↔ Itinéraire, fiche étape, export et import d'une sauvegarde, roadbook, réseau coupé. Si la navigation reste bloquée, noter l'écran exact et le geste.

## Phase 5 : synchronisation entre appareils (2 à 3 jours)

Objectif : deux téléphones, un même voyage, sans base de données.

- [x] `src/services/github-repo.ts` : client API Contents (GET avec `sha`, contenu brut au-delà de 1 Mo, PUT avec `sha`, `GitHubError.isConflict` sur 409 et 422, délai 20 s), testé avec `fetch` simulé. Token à portée fine stocké dans IndexedDB (`src/store/sync-store.ts`), jamais dans le code ni le bundle.
- [x] Écran « Compte et synchro » (`src/components/sync/sync-dialog.tsx`, bouton d'état `sync-status-button.tsx` dans les en-têtes Planifier et Voyager et sur l'écran de démarrage) : coller le token, tester l'accès et lister `trips/index.json`, choisir le voyage, synchroniser, automatique ou non, oublier le token. État : dernière synchro, en attente, erreur, dernier rapport.
- [x] Modèle de fusion dans `src/lib/sync-model.ts` (pas `merge.ts`) : dernière écriture gagne par entité, pierres tombales (`tombstones` sur le snapshot, schéma v3), notes et météo horodatées (`notesAt`, `weatherAt`), itinéraire en fichier entier tranché par date (`decideItinerary`), extraction et réinjection dans le snapshot. Tests Vitest.
- [x] Hors ligne : **écart au plan**, pas de journal d'écritures : l'état local (IndexedDB) porte les modifications, `pending` reste levé et la passe repart sur `online`, au premier plan et toutes les dix minutes (`startSyncScheduler`). Résultat identique pour deux personnes, moins de code. Fichiers : `itinerary.json`, `travel.json` (réservations, documents, checklist, notes), `expenses.json`, `docs/<id>.<ext>`.
- [x] Chiffrement optionnel des codes d'accès (`src/lib/secure.ts`, testé) : AES-GCM 256, PBKDF2 depuis la phrase saisie dans « Compte et synchro » ; `accessCodeSecure` dans le dépôt, « code chiffré » sur l'appareil sans phrase.
- [x] Côté dépôt privé : structure documentée dans `trips/README.md` (modifié localement dans `../vanTravel`, à commiter là-bas). **À faire par la personne** : ajouter la compagne comme collaboratrice, un token par téléphone.

- [x] Correctif (7 oct. 2026) : un circuit importé d'une sauvegarde portait un autre identifiant que `trip.json` ; « Utiliser » le voyage remettait le brouillon à zéro et envoyait ce brouillon vide (départ seul) comme `itinerary.json`, que tous les appareils reprenaient ensuite. Désormais : circuit local gardé si même calendrier, départ seul = pas d'itinéraire (`hasItinerary`, testé), et sans rien d'aucun côté le `plan` de `trip.json` est posé. `itinerary.json` du dépôt privé régénéré depuis la sauvegarde du 7 oct.
- [x] Correctif (7 oct. 2026, suite) : le planificateur s'abonnait au store avant la réhydratation, donc chaque ouverture de l'app comptait comme une modification de l'itinéraire et l'appareil gagnait toujours sur le dépôt (ping-pong entre téléphone et PC). Garde `persist.hasHydrated()`. Dialogue : annonce de ce que la passe fera de l'itinéraire, boutons « Recevoir l'itinéraire du dépôt » et « Envoyer mon itinéraire » (`resolveItineraryDecision`, `describeItinerarySync`, `getFileMeta`, testés).
- [x] Allègement (7 oct. 2026) : `itinerary.json` écrit en JSON compact et tracés arrondis à cinq décimales (`roundLegCoordinates`, testé) : 1,3 Mo au lieu de 5,6 pour 19 tronçons et 61 000 points. Le fichier n'avait aucune alternative : l'indentation seule multipliait sa taille par quatre.

Critère : une réservation saisie sur un téléphone apparaît sur l'autre après retour du réseau, sans écraser une modification faite entre-temps. **À valider sur les deux téléphones.**

### Mise en service (à faire par la personne)

1. Dépôt privé `vanTravel` : Settings → Collaborators → ajouter le compte GitHub de la compagne (elle accepte l'invitation).
2. Chaque personne, sur son téléphone : GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate. Resource owner : le compte qui possède `vanTravel` (pour la compagne : « Only select repositories » n'apparaît que si le dépôt lui est accessible ; sinon le propriétaire crée un token pour elle). Repository access : `vanTravel` seul. Permissions : Contents → Read and write. Expiration : après la fin du voyage.
3. Dans l'app (bouton nuage) : compte, dépôt, coller le token, « Tester et lister les voyages », « Utiliser » le voyage. Sur le PC où l'itinéraire a été planifié, la première passe envoie `itinerary.json` ; sur le téléphone vierge, elle le reçoit.
4. Optionnel : même phrase de chiffrement sur les deux téléphones.
5. Test croisé : une réservation sur un téléphone, réseau coupé sur l'autre, saisie d'une dépense, retour du réseau : les deux voient tout.

## Phase 7 : Supabase (8 oct. 2026, branche `supabase`)

Détail des lots et des décisions : `docs/SUPABASE.md`. Code livré : `src/services/supabase.ts`, `auth.ts`, `supabase-sync.ts`, `sync.ts` réécrit, `src/lib/sync-rows.ts` (testé), `src/store/account-store.ts`, `src/components/account/`, `supabase/schema.sql` et `migrations/0002`, `scripts/migrate-from-private-repo.mjs`, `scripts/rls-check.mjs`, `keepalive.yml`, variables dans `deploy.yml`. Retirés : `github-repo.ts`, `trip-source.ts`, `sync-store.ts`, `sync-dialog.tsx`, plugin Vite `/__private/`.

- [x] Lot A : client, session (Google, e-mail avec confirmation, mot de passe oublié), store de compte, dialogue « Compte et synchro ».
- [x] Lot B : adaptateur et moteur (lignes, upserts « si plus récent », verrou optimiste, chiffrement conservé). Écart au plan : pas de lecture incrémentale `since`, tout est relu à chaque passe (quelques centaines de lignes) et comparé localement, plus simple et exact.
- [x] Lot C : voyages (`create_trip`, « Mettre « nom » sur le compte »), membres (ajout par e-mail, retrait par le propriétaire), démarrage sans dépôt privé.
- [x] Lot D : documents dans le bucket (`<voyage>/<docId>.<ext>`), retrait à la suppression.
- [x] Lot E : `scripts/migrate-from-private-repo.mjs`. Écart au plan : connexion e-mail et mot de passe du propriétaire au lieu de la clé secrète (mêmes règles RLS que l'app, aucun secret à manipuler). Alternative sans script : « Mettre sur le compte » depuis le PC qui a tout en local.
- [x] Lot F : `deploy.yml` (variables), `keepalive.yml` (tous les deux jours), docs et règles réécrites.
- [x] Lot G : `scripts/rls-check.mjs` (deux comptes de test, tables, bucket, verrou optimiste, upsert si plus récent). **À lancer par la personne** après la migration 0002.

### Mise en service (phase 7, à faire par la personne)

1. ~~Supabase, SQL Editor : exécuter les migrations 0002 et 0003~~ (fait le 8 oct. ; `rls-check` 37/37). Confirmation d'e-mail désactivée pendant les tests (limite de 2 e-mails par heure du service intégré) : à réactiver quand les comptes existent.
2. Authentication > Providers > Google : activer, Client ID et Secret depuis Google Cloud (origines `https://elienowominski.github.io` et `http://127.0.0.1:43217`, URI de redirection = callback affiché par Supabase). URL Configuration : Site URL `https://elienowominski.github.io/vanTravelApp/`, Redirect URLs idem + `http://127.0.0.1:43217/` (+ `http://<ip-du-pc>:43217/` pour tester Google depuis le téléphone). Sans Google, l'e-mail suffit.
3. Deux comptes de test e-mail (ex. `rls-a@…`, `rls-b@…`, confirmés), puis `RLS_A_EMAIL=… RLS_A_PASSWORD=… RLS_B_EMAIL=… RLS_B_PASSWORD=… node scripts/rls-check.mjs`. Tout doit passer avant d'ouvrir à un tiers.
4. Sur le PC (branche `supabase`, `npm run dev`) : se connecter, « Mettre « #FINAL » sur le compte » (ou `node scripts/migrate-from-private-repo.mjs` avec `SUPABASE_EMAIL` et `SUPABASE_PASSWORD`), vérifier la liste des voyages et l'itinéraire.
5. Ajouter la compagne par e-mail (elle crée d'abord son compte dans l'app). Sur chaque téléphone : se connecter, « Utiliser » le voyage, « Recevoir l'itinéraire du compte ».
6. Test croisé une semaine : réservation sur l'un, visible sur l'autre ; réseau coupé puis rétabli ; photo ; dépense simultanée ; suppression qui ne ressuscite pas. Puis fusion dans `main`, déploiement, archivage de `vanTravel`.

## Phase 6 : socle multi-voyage et Google (quand le besoin vient)

- [~] Sélecteur de voyage : couvert côté dépôt privé par « Compte et synchro » (liste de `trips/index.json`, bouton « Utiliser ») et côté local par la bibliothèque. Reste : formulaire de création avec choix de région et de véhicule (une seule région aujourd'hui, `nz-south` ; nouvelle région = un fichier dans `src/data/regions/` et un catalogue dans `src/data/catalog/`, plus `buildCatalog` à paramétrer par région).
- [ ] Enrichissement Google Places (New) à la planification : clé restreinte par référent HTTP, résultats stockés dans le catalogue ou les hébergements, jamais appelés en voyage. **Bloqué** tant qu'il n'y a pas de projet Google Cloud et de clé (à créer par la personne).
- [ ] Découpage de `trip-map.tsx` (853 lignes) en modules par calque ; tests des reducers du store. Non fait : gros refactor à valider carte en main, à mener dans une session dédiée.
- [x] Mode sombre (30 sept. 2026) : préférence Auto / Clair / Sombre (`src/lib/theme.ts` testé, `use-theme.ts`, `theme-toggle.tsx`), dans le dialogue profil et l'en-tête Planifier ; classe `dark` sur `<html>`, `theme-color` suit, impression toujours en clair, popups MapLibre aux couleurs de l'app.

## Idées écartées ou différées, avec la raison

- Préchargement de tuiles OSM : interdit par la politique d'usage OSM. Alternative future : extrait PMTiles auto-hébergé, à évaluer (taille, requêtes Range sur Pages).
- Base de données gratuite : écartée le 29 sept. (compte tiers, pause après inactivité), reprise le 7 oct. avec Supabase quand les documents chez GitHub et l'ouverture à des tiers sont devenus des besoins ; la pause est traitée par `keepalive.yml`.
- Gist comme stockage : pas de binaire propre pour les documents.
