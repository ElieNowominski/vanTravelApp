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

- [x] Lot 0 : préversion locale et projet Supabase dédié (3 nov. 2026 : port 43218, `.env.next.local`, projet `vanTravelApp-v2`, `rls-check` 37/37)
- [x] Lot 1 : modèle v5 et voyage fictif de référence (3 nov. 2026 : 141 tests, parcours vérifié dans le navigateur)
- [x] Lot 2 : schéma Supabase (rôles, plafonds)
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
- [x] (3 nov. 2026) À faire par la personne : créer le projet Supabase `vanTravelApp-v2` (offre gratuite, deuxième et dernier projet actif possible), y exécuter `supabase/schema.sql`, puis les migrations `0002` et `0003`, désactiver la confirmation d'e-mail le temps des tests, créer deux comptes de test. Authentication > URL Configuration : Site URL et Redirect URLs `http://127.0.0.1:43218/` (+ `http://<ip-du-pc>:43218/` pour le téléphone).
- [x] Variables séparées sans échange de fichiers (3 nov. 2026) : sur la branche, `npm run dev` passe `--mode next`, donc Vite lit `.env.next.local` (ignoré par git) par-dessus `.env.local`, qui reste celui de la production pour les correctifs sur `main`. Valeurs vides : l'app tourne sans compte, jamais sur la production. `scripts/rls-check.mjs` ne lit plus que `.env.next.local` et affiche le projet visé.
- [x] (3 nov. 2026) Remplir `.env.next.local` avec l'URL et la clé publiable de `vanTravelApp-v2`. Contrôle anonyme : `beat()` en 204, huit tables exposées et vides, `create_trip` refusé par la RLS.
- [x] (3 nov. 2026) `scripts/rls-check.mjs` lancé sur `vanTravelApp-v2` : 37/37, migrations 0002 et 0003 comprises.
- Pas de `keepalive` pour `vanTravelApp-v2` : le workflow planifié ne tourne que depuis `main`, gelé. Après une semaine sans usage, le projet se met en pause ; le relancer depuis le tableau de bord Supabase avant une session de travail.

## Lot 1 : modèle v5 et voyage fictif de référence

- [x] Tronçon explicite : `mode`, `track` (`calcule`, `importe`, `aucun`), `manual` pour un tronçon sans tracé ; `legDurationSec` et `legDistanceKm` (`src/lib/legs.ts`) partout où l'on additionnait la durée « van ». `defaultMode` dans le voyage. La ligne d'un tronçon sans tracé s'affiche dans l'itinéraire et le roadbook (« Ferry · 3 h 15 · 140 km »).
- [x] `TravelProfile` à la place de `Vehicle`, préréglages van aménagé, camping-car, voiture, moto (`src/lib/profiles.ts`) ; `van-time.ts` devient `travel-time.ts`.
- [x] Fuseau et pays par point, hors ligne : `@photostructure/tz-lookup` 11.7.0 (29 Ko compressés) et `@rapideditor/country-coder` 5.6.1 (225 Ko), regroupés dans un module chargé à la demande (259 Ko, précaché). Zone du voyage, libellé (« Danemark, Norvège, Suède »), cadre de carte et date du jour en voyage dans `src/lib/zone.ts`. **Écart au cadrage (Q21)** : fuseau et pays ne sont pas stockés sur l'étape mais calculés à la lecture. Stockés, ils auraient modifié l'itinéraire de chaque voyage existant au premier chargement, donc une écriture à synchroniser depuis chaque appareil, et auraient été faux après le déplacement d'une étape ; la bibliothèque étant précachée, le calcul marche hors ligne.
- [x] `regionId` retiré de `TripConfig` (voyage v2), repères positionnés ; cartes cadrées sur le voyage (zoom minimal 2, plus de `maxBounds`) ; devise proposée = dernière saisie, l'euro sinon (anticipé du lot 7, la région ne la donnait plus) ; catalogue et calques DOC activés seulement si le voyage touche la Nouvelle-Zélande, calques masqués sinon.
- [x] Migrations : snapshot v4 -> v5 (`normalizeLegs`), voyage v1 -> v2 (`validateTripConfig`), sur le brouillon, la bibliothèque, les sauvegardes et la synchro ; testées sur des données v4 et v1 fictives (un voyage v1 de la Nouvelle-Zélande devient « van » avec des repères positionnés depuis le catalogue).
- [x] Voyage fictif de référence `fixtures/reference-scandinavie.json` (`scripts/make-reference-trip.mjs`, tracés OSRM) : Copenhague, Aarhus, ferry Hirtshals -> Kristiansand, Stavanger, Odda, Bergen, Flåm, Oslo, Karlstad, Stockholm ; 10 jours, 9 nuits, 2 223 km, trois pays, quatre devises (DKK, EUR, NOK, SEK), trois participants. Écart : départ de Copenhague pour avoir un ferry réaliste et un troisième pays. Testé (`reference-trip.test.ts`) et parcouru dans le navigateur (import, Planifier, Voyager, nouvelle dépense, roadbook, 375 px).
- Reste pour les lots suivants : l'écran de création ne propose encore que le catalogue néo-zélandais (lots 3 et 6) ; un tronçon train ou ferry ne se crée pas encore dans l'app et n'est pas dessiné sur la carte (lot 4).

## Lot 2 : schéma Supabase

- [x] Rôles par voyage : propriétaire, éditeur, lecteur. Policies d'écriture sur `can_write` (propriétaire et éditeurs), de lecture sur `is_member` ; `add_member_by_email` prend un rôle, `set_member_role` le change ; la ligne du propriétaire ne se retire pas, un membre peut quitter le voyage. Client : rôle lu à chaque passe, un lecteur reçoit et n'envoie rien ; écran Compte avec le rôle à l'invitation, « Rendre lecteur » ou « Rendre éditeur », « Quitter ce voyage ».
- [x] Consommation par compte et par jour (`usage`), plafonds en configuration (`usage_limits` : par compte, global optionnel ; départ à 500 et 2 000 pour la recherche de lieux, 200 et 1 000 pour les points d'intérêt, choisis par l'assistant, à confronter aux règles d'usage aux lots 3 et 5), `consume_quota` qui refuse sans compter. Client prêt (`src/lib/quota.ts`, `src/services/quota.ts`), branché aux lots 3 et 5. Garde-fou, pas barrière : les services sont appelés depuis le navigateur.
- [x] Droits explicites : tout révoqué pour `anon` et `authenticated` puis accordé au cas par cas, plus de droits par défaut pour les objets créés ensuite (`alter default privileges`). L'option « Automatically expose new tables » n'a plus d'effet et peut être décochée.
- [x] Migration `0004_roles_quotas_grants.sql`, `supabase/schema.sql` à jour (son en-tête citait encore « 0001 + 0002 »). `rls-check` : 72/72 sur `vanTravelApp-v2` le 3 nov. 2026 (37 avant : lecteur, changement de rôle, droits explicites, plafonds). Parcours dans le navigateur avec les deux comptes de test sur le voyage de référence : invitation comme lecteur, « Rendre éditeur » puis « Rendre lecteur », passe du lecteur sans aucune requête d'envoi (« lecture seule : modifications gardées sur cet appareil »), « Envoyer mon itinéraire » masqué pour un lecteur, 375 px sans débordement.
- [x] Défaut de la v1 trouvé au parcours : « Voyages du compte » listait un voyage une fois par membre (la lecture de `members` montre les co-membres) ; `listMemberTrips` filtre désormais sur la ligne de la personne. Présent aussi sur `main`.
- Reste : un lecteur peut encore modifier l'app localement (l'interface ne se verrouille pas, ses modifications restent sur l'appareil) ; à traiter avec l'accueil (lot 6). L'aperçu « ce que la passe ferait » ne tient pas compte du rôle.

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
- [ ] Copie des données NZ migrée dans `vanTravelApp-v2`, comparée à l'original.
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
