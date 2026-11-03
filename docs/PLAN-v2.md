# Plan de travail v2

Branche `v2`, ouverte le 2 nov. 2026. Objectif : passer d'une app câblée pour un road trip en van en Nouvelle-Zélande à une app de voyage itinérant utilisable n'importe où, avec un mode de déplacement par tronçon. Cadrage complet (questions, réponses, avant et après) : `docs/CADRAGE-v2.md`. Décisions structurantes : `docs/adr/`. Vocabulaire : `GLOSSARY.md`. Le plan de la v1 reste `docs/PLAN.md`.

Prompt de reprise :

> Lis `CLAUDE.md`, `GLOSSARY.md`, `docs/PLAN-v2.md`, `docs/adr/` et `docs/ARCHITECTURE.md`. Travaille sur la branche `v2`, jamais sur `main`. Reprends au premier lot non coché. Mets à jour l'état de ce plan et le journal en fin de session.

## Règles propres à la branche

- `main` est gelé jusqu'au retour du voyage NZ : il ne reçoit que des correctifs de la v1. Rien de la branche n'y entre avant la fusion, aucune migration ne touche le projet Supabase de production (ADR 0001).
- `main` est fusionné dans `v2` après chaque correctif de la v1, pour que la branche ne dérive pas.
- Coût : 0 €. Toute fonctionnalité qui dépend d'un quota se bloque proprement au plafond ; le cœur de l'app (itinéraire, réservations, documents, dépenses) ne se bloque jamais (ADR 0006).
- Hors ligne pour tous les modes (règle 3 de `CLAUDE.md`).
- Maquettes validées sur un canevas avant le code des écrans nouveaux : accueil, création, recherche de lieux.
- Vérification : lint, typecheck, tests, build, puis parcours du voyage fictif de référence dans le navigateur à 390 px et à 1280 px.

## État

- [~] Lot 0 : préversion locale et projet Supabase dédié (2 nov. 2026 : hébergement tranché, port 43218 ; reste la part de la personne)
- [ ] Lot 1 : modèle v5 et voyage fictif de référence
- [ ] Lot 2 : schéma Supabase (rôles, plafonds)
- [ ] Lot 3 : géographie libre (recherche de lieux, fin de la région unique)
- [ ] Lot 4 : routage par tronçon
- [ ] Lot 5 : points d'intérêt OSM à la demande
- [ ] Lot 6 : accueil et création (maquettes puis code)
- [ ] Lot 7 : dépenses multi-devises et à plusieurs
- [ ] Lot 8 : validation et préparation de la fusion

## Lot 0 : préversion locale et projet Supabase dédié

**Décision du 2 nov. 2026 : développement local seulement** (option 2 ci-dessous). Pas de préversion en ligne avant la fusion. Le serveur de dev de la branche écoute sur **43218** : une origine distincte de 127.0.0.1:43217, où le PC garde les données locales de la v1, que la migration v5 ne doit pas réécrire. Tests hors ligne sur le PC (Chrome accepte le service worker sur `127.0.0.1`), pas sur l'iPhone : le téléphone joint le PC en HTTP (`http://<ip-du-pc>:43218/`), sans service worker. Les tests hors ligne sur l'iPhone se feront après la fusion.

Constat qui a mené à cette décision : la préversion sur `/vanTravelApp/next/` retenue au cadrage ne tient pas. Même origine que la v1, donc mêmes bases IndexedDB et même `localStorage` (`vantravel`, `vantravel-kv`, `vantravel-docs`, clés `vantravel-*`) : la migration v5 réécrirait les données de la v1 sur le téléphone. Le service worker de la v1 (portée `/vanTravelApp/`, `navigateFallback` sans liste d'exclusion) servirait la v1 à la place de `/next/`. Et GitHub Pages ne publie qu'un site par dépôt, ce qui obligerait à modifier `deploy.yml` sur `main`.

Options :

1. **Préversion sur une autre origine** (déploiement de branche gratuit chez Netlify, Vercel ou Cloudflare Pages, relié au dépôt) : origine distincte, donc stockage et service worker séparés, aucune modification de `main`. Demande un compte de plus. Recommandée.
2. **Développement local seul**, téléphone sur le Wi-Fi (`http://<ip-du-pc>:43217/`) : rien à créer, mais pas de service worker en HTTP, donc pas de test hors ligne sur l'iPhone.
3. **Sous-chemin avec cloisonnement** : préfixer tous les noms de stockage de la v2, exclure `/next/` du `navigateFallback` de la v1 et construire les deux versions dans `deploy.yml`. Touche `main` deux fois, contraire à l'ADR 0001.

Étapes :

- [x] Port de dev 43218 sur la branche (`package.json`, `vite.config.ts`, `README.md`, `CLAUDE.md`, règle `liberer-port-dev.mdc`).
- [ ] À faire par la personne : créer le projet Supabase `vantravel-next` (offre gratuite, deuxième et dernier projet actif possible), y exécuter `supabase/schema.sql`, puis les migrations `0002` et `0003`, désactiver la confirmation d'e-mail le temps des tests, créer deux comptes de test. Authentication > URL Configuration : Site URL et Redirect URLs `http://127.0.0.1:43218/` (+ `http://<ip-du-pc>:43218/` pour le téléphone).
- [x] Variables séparées sans échange de fichiers (3 nov. 2026) : sur la branche, `npm run dev` passe `--mode next`, donc Vite lit `.env.next.local` (ignoré par git) par-dessus `.env.local`, qui reste celui de la production pour les correctifs sur `main`. Valeurs vides : l'app tourne sans compte, jamais sur la production. `scripts/rls-check.mjs` ne lit plus que `.env.next.local` et affiche le projet visé.
- [ ] À faire par la personne : remplir `.env.next.local` avec l'URL et la clé publiable de `vantravel-next`.
- [ ] `scripts/rls-check.mjs` lancé sur `vantravel-next`.
- Pas de `keepalive` pour `vantravel-next` : le workflow planifié ne tourne que depuis `main`, gelé. Après une semaine sans usage, le projet se met en pause ; le relancer depuis le tableau de bord Supabase avant une session de travail.

## Lot 1 : modèle v5 et voyage fictif de référence

- [ ] Tronçon explicite entre deux étapes : mode (`van`, `voiture`, `moto`, `train`, `ferry`, `velo`, `marche`), tracé calculé, importé ou absent, durée et distance (ADR 0002). Mode par défaut au niveau du voyage.
- [ ] Profil de déplacement à la place de `Vehicle`, copié depuis des préréglages commités (van aménagé, camping-car, voiture, moto) puis ajustable dans le voyage.
- [ ] Étape : fuseau horaire et pays calculés depuis les coordonnées, hors ligne (bibliothèque embarquée, poids à mesurer avant de choisir) ; zone du voyage (emprise, pays) calculée depuis les étapes (ADR 0003).
- [ ] `regionId` retiré de `TripConfig` au profit de la zone calculée ; `RegionPreset` ne sert plus qu'à la migration.
- [ ] Migration v4 -> v5 dans `src/lib`, testée sur une sauvegarde fictive au format v4 : le voyage NZ devient « mode van, zone calculée », sans perte.
- [ ] Voyage fictif de référence commité (aucune donnée personnelle) : Oslo, Bergen, Stockholm sur 10 jours, en van, trois pays, trois devises, un ferry, trois participants. Sert aux tests Vitest et aux parcours dans le navigateur.

## Lot 2 : schéma Supabase

- [ ] Rôles par voyage : propriétaire, éditeur, lecteur (aujourd'hui : propriétaire et membres). Règles par ligne réécrites, `rls-check` étendu (un lecteur ne peut rien écrire).
- [ ] Table de consommation par compte et par jour, pour les services à quota (géocodage, points d'intérêt). Plafonds en configuration, refus explicite au plafond.
- [ ] Droits explicites (`grant` sur les tables pour `authenticated`, `revoke` pour `anon`) : `schema.sql` n'en pose aucun et dépend de l'option « Automatically expose new tables » du projet, cochée à la création de `vantravel-next` (3 nov. 2026) pour reproduire la production. Une fois les droits explicites en place, l'option peut être décochée.
- [ ] Migrations numérotées à partir de `0004`, `supabase/schema.sql` à jour. Exécutées sur `vantravel-next` seulement jusqu'à la fusion (ADR 0001).

## Lot 3 : géographie libre

- [ ] Service de recherche de lieux sur OSM (Photon de préférence : le Nominatim public interdit l'autocomplétion pendant la frappe). Politique d'usage à vérifier et à respecter (règle 8). Ajout d'une étape par recherche ou par appui long sur la carte (ADR 0004).
- [ ] Fin de la région unique : `src/lib/regions.ts`, `src/lib/catalog.ts` et l'écran de démarrage ne supposent plus `nz-south`. Carte cadrée sur la zone du voyage.
- [ ] Calques DOC et catalogue NZ réservés aux voyages dont la zone touche la Nouvelle-Zélande.

## Lot 4 : routage par tronçon

- [ ] Interface de routage dans `src/services` : calculer un tronçon pour un mode donné. OSRM (serveur public) pour van, voiture et moto, avec les facteurs du profil.
- [ ] Train et ferry : tronçon saisi à la main (horaire, durée, prix), sans tracé ou en ligne droite.
- [ ] Noté pour l'ouverture au public : le serveur de démonstration OSRM n'est pas fait pour un service en production ; passer à OpenRouteService ou GraphHopper via une Edge Function Supabase.

## Lot 5 : points d'intérêt OSM à la demande

- [ ] Requête Overpass sur la zone affichée, à partir d'un zoom suffisant : campings, aires de service, vidange, points d'eau. Politique d'usage d'Overpass à vérifier.
- [ ] Au figeage de l'itinéraire : requête le long du tracé (quelques kilomètres de part et d'autre), mise en cache dans IndexedDB pour le hors ligne.
- [ ] Compteur par compte et blocage au plafond (lot 2).

## Lot 6 : accueil et création

- [ ] Maquettes sur un canevas : accueil (voyages en cours, à venir, passés, sobre), création, recherche de lieux. Validation par la personne avant le code.
- [ ] Création : nom, dates, départ, arrivée (égale au départ par défaut), mode par défaut, préréglage de véhicule. Un seul écran à 390 px.
- [ ] Ouverture directe sur Voyager pendant un voyage ; « aujourd'hui » calculé dans le fuseau de l'étape en cours.

## Lot 7 : dépenses multi-devises et à plusieurs

- [ ] Devise proposée : la dernière utilisée dans le voyage, l'euro pour la première dépense (ADR 0005).
- [ ] Taux de change figé à la date de la dépense (taux de référence de la BCE ; source accessible depuis le navigateur à vérifier), stocké avec la dépense, modifiable. Sans réseau : dépense enregistrée sans taux, taux récupéré au retour du réseau.
- [ ] Totaux et « qui doit combien » en euros. Payeur, bénéficiaires cochés (tout le monde par défaut), poids ; remboursements minimisés.

## Lot 8 : validation et préparation de la fusion

- [ ] Parcours complet du voyage fictif en local (127.0.0.1:43218) : création, planification, figeage, Voyager sans réseau, dépenses à trois.
- [ ] Port de dev : revenir à 43217 ou garder 43218 après la fusion (les Redirect URLs de la production citent 43217).
- [ ] Après la fusion et le déploiement : test hors ligne sur l'iPhone, impossible avant (pas de préversion en ligne).
- [ ] Copie des données NZ migrée dans `vantravel-next`, comparée à l'original.
- [ ] Liste des opérations de fusion : migrations SQL sur la production, fusion dans `main`, vérification sur les deux téléphones, `CLAUDE.md` et `docs/PLAN.md` réconciliés.

## Hors de la v2

Toute nouvelle idée s'ajoute ici et n'en sort que par une décision explicite de la personne.

- Trek et cartes hors ligne (tuiles PMTiles auto-hébergées).
- Horaires de train et pass Interrail (le mode `train` existe, en saisie manuelle).
- Garage de véhicules par compte.
- Changement de fournisseur de routage (lot 4, noté pour l'ouverture).
- Clé API Google, fiches et liens de fiche Google (ADR 0004).
- Tout ce qui relève de l'ouverture au public : inscription libre, conditions d'utilisation, RGPD, suppression de compte en libre-service, nom de domaine, support.
- Lien de suivi public pour la famille.

## Points à vérifier en cours de route

Non vérifiés au cadrage : politique d'usage de Photon et d'Overpass, poids d'une bibliothèque de fuseaux embarquée, source des taux BCE utilisable depuis le navigateur (CORS), quotas gratuits des Edge Functions Supabase.
