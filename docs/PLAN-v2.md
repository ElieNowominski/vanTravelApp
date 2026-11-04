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
- [x] Lot 3 : géographie libre (3 nov. 2026 : recherche Photon, appui long, plus de région par défaut ; 173 tests, parcours vérifié dans le navigateur)
- [x] Lot 4 : routage par tronçon (3 nov. 2026 : mode par tronçon, saisie manuelle des trains et ferries ; 187 tests, parcours vérifié dans le navigateur)
- [x] Lot 5 : points d'intérêt OSM à la demande (3 nov. 2026 : calque de la carte, couloir au figeage, « Sur la route » dans Voyager ; 218 tests ; affichage vérifié dans le navigateur sur données réelles en cache, Overpass saturé pendant la session)
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

- [x] Recherche de lieux sur OSM par Photon (`src/lib/place-search.ts` pur et testé, `src/services/place-search.ts`, `usePlaceSearch`, `PlaceSearchField`). Politique vérifiée le 3 nov. 2026 : le serveur public accepte l'usage « dans une limite raisonnable », ralentit ou bannit l'usage intensif, sans chiffre publié ; réponse avec `Access-Control-Allow-Origin: *`, `lang=fr` accepté. D'où : recherche à partir de trois caractères, 450 ms après la dernière frappe, requête précédente annulée, une requête par seconde au plus, cache en mémoire (60 recherches), attribution « Recherche Photon · © contributeurs OpenStreetMap » sous les résultats. Résultats proches de l'étape en cours d'abord (`searchBias`, zoom 7). Plafond `geocode` : une unité par requête envoyée pour un compte connecté, rien sans compte ; un refus bloque la recherche et le dit, un compteur muet ne la bloque pas (garde-fou, ADR 0006). Le plafond de 500 par compte et par jour reste : Photon ne publie pas de limite à laquelle le confronter.
- [x] Ajout d'une étape par recherche (panneau Planifier : catalogue local puis OSM, doublons à moins de 2 km retirés) ou par appui long sur la carte (minuterie sur un doigt immobile pour iOS, `contextmenu` pour le clic droit et Android, `src/components/map-long-press.ts`). Le dialogue « Nouveau lieu » propose le nom du lieu OSM le plus proche (recherche inversée) et sa localisation.
- [x] Fin de la région unique : plus de région par défaut sans voyage (`catalogRegionIds(null)` vide) ; l'écran de démarrage choisit le départ par recherche (tous les catalogues publics hors ligne, puis OSM) au lieu de la liste des villes néo-zélandaises. `inSouthIsland`, inutilisé, retiré. La carte était déjà cadrée sur la zone du voyage (lot 1).
- [x] Calques réservés à la Nouvelle-Zélande : en plus des calques DOC (lot 1), les campings OSM générés au build sur son cadre (plus téléchargés ailleurs) et les interrupteurs « Villes » et « Spots » du catalogue, vides ailleurs.
- Interface provisoire : le champ de recherche reprend la place de l'ancien, sans maquette ; la recherche de lieux aura sa maquette au lot 6 avec l'accueil et la création.
- Reste : un repère (départ, arrivée) ne garde pas la localisation du lieu (`area`), donc l'étape de départ s'affiche sans sous-titre ; à traiter avec l'écran de création (lot 6). Le plafond n'a pas été vu en action avec un vrai compte dans le navigateur (identifiants de test absents du dépôt) : couvert par des tests du service avec compteur simulé, et `consume_quota` par `rls-check` (lot 2). Photon a répondu en 2 à 3,5 s pendant les essais.

## Lot 4 : routage par tronçon

- [x] Interface de routage `routeLeg(from, to, mode, profile)` dans `src/services/routing.ts` : OSRM (serveur de démonstration) pour van, voiture et moto, durée ajustée par les facteurs du profil ; une requête par seconde au plus, désormais imposée dans le code (file d'attente) et plus seulement écrite dans la règle 8. Repli en ligne droite estimée sans réseau, comme avant. Testé avec `fetch` simulé (`routing.test.ts`).
- [x] Train, ferry, vélo, marche : tronçon sans tracé, aucune requête réseau. À la création ou au changement de mode, durée et distance estimées depuis le vol d'oiseau (vitesse et détour par mode, `estimateManualLeg`, marqué « estimé ») ; la personne saisit ensuite départ, arrivée, durée (ou rien : elle se déduit des deux heures, passage de minuit compris), distance, compagnie, prix et notes. Logique pure dans `src/lib/legs.ts` (`parseClock`, `parseDurationInput`, `applyManualInput`, `legSummary`, `legCoordinates`).
- [x] Écran : la ligne du tronçon dans Planifier ouvre un éditeur (`src/components/leg-editor.tsx`) avec le mode, les routes au choix ou le formulaire d'horaire. Carte, croquis du roadbook, PDF et comparateur relient les deux étapes d'un tronçon sans tracé par une ligne droite en pointillé. Roadbook et carte « Aujourd'hui » de Voyager affichent horaire, compagnie, prix et notes ; Voyager dit « en van et ferry ».
- [x] Le seuil de confort du profil (« +4 h ») ne compte plus que le temps au volant (`roadSec`) : un ferry de trois heures n'est pas de la conduite. La durée du jour affichée reste celle de tous les tronçons.
- [x] Schéma : `ManualLeg.price` (optionnel, `Money`), lu par `normalizeManualLeg` et testé, sans changement de version (la v5 n'est pas encore publiée). La signature d'itinéraire de la synchro inclut désormais mode, type de tracé et saisie manuelle : avant, changer un horaire ne relevait pas la modification d'itinéraire.
- [x] Défaut corrigé au parcours : à 375 px, la barre d'outils du panneau Planifier débordait de 74 px (antérieur au lot 4) ; elle passe à la ligne.
- Écarts : le prix d'un billet reste pour mémoire et n'entre pas dans les dépenses (le lot 7 décidera s'il en crée une) ; le vélo et la marche n'ont pas de tracé (serveurs de routage vélo et piéton non étudiés, le trek est hors de la v2) ; changer de mode recalcule le tronçon, mais retirer une étape reconstruit le tronçon dans le mode par défaut du voyage.
- Non vérifié : le PDF n'a pas été ouvert (export non déclenché dans le navigateur), seul le code du pointillé et de la ligne du ferry a changé ; le mode par défaut d'un voyage ne se choisit pas encore à la création (lot 6).
- [ ] Noté pour l'ouverture au public : le serveur de démonstration OSRM n'est pas fait pour un service en production ; passer à OpenRouteService ou GraphHopper via une Edge Function Supabase, derrière `routeLeg`.

## Lot 5 : points d'intérêt OSM à la demande

- [x] Politique d'usage d'Overpass vérifiée le 3 nov. 2026 (wiki OSM, page éditée le 2 nov.) : pour une app ou un usage régulier, moins de 100 requêtes et 10 Mo par jour, **tous utilisateurs confondus** ; pause de 30 s après un 429 ou un 406 ; identifier l'app par `User-Agent` ou `Referer` (le navigateur envoie `Origin` et `Referer`, il ne laisse pas fixer le `User-Agent`) ; cache et une requête à la fois. Réponse avec `Access-Control-Allow-Origin: *` ; le serveur se dit « destiné aux outils utilisés depuis un navigateur ». Il était saturé une bonne partie de la session (502 « at capacity »).
- [x] Logique pure dans `src/lib/poi.ts` : quatre catégories (camping `tourism=camp_site`, aire de camping-car `tourism=caravan_site`, vidange `amenity=sanitary_dump_station`, point d'eau `amenity=water_point` ou `drinking_water`), requête sur un rectangle, lecture de la réponse (étiquettes utiles seulement, identifiant `osm:<type><id>` comme la recherche de lieux), grille de cases de 0,2° pour le cache, couloir, distances au tracé.
- [x] Carte : calque « Points d'intérêt OSM », partout (Nouvelle-Zélande comprise), une couleur par catégorie, nom à partir du zoom 13, popup avec équipements et « Ajouter à l'itinéraire ». Chargé à partir du zoom 11, à chaque fin de déplacement (600 ms) : cases fraîches lues dans IndexedDB (`vantravel-poi`, un mois, 400 cases au plus), une seule requête sur le rectangle des cases manquantes, rien au-delà de 24 cases (grand écran dézoomé). L'état s'affiche sous l'interrupteur (zoomer, chargement, saturé, plafond, hors ligne avec le nombre de points en cache).
- [x] Figeage : mise en cache du couloir en arrière-plan (`src/store/poi-store.ts`), 3 km de part et d'autre des tracés routiers (ni ferry ni train). Les cases le long du tracé sont regroupées en rectangles de 4 cases de côté au plus : 32 requêtes pour le voyage de référence (2 223 km), moins si la carte a déjà vu la zone. Chaque rectangle fait est enregistré aussitôt : une coupure ou le plafond n'oblige pas à tout refaire, le dialogue « Plan » montre l'avancement et propose « Compléter le cache ». Voyager affiche « Sur la route » dans la carte du jour : deux points par catégorie, dans l'ordre de la route, avec « km 34 · à 1,2 km du tracé » et le guidage, hors ligne.
- [x] Plafond `poi` : une unité par requête envoyée pour un compte connecté (comme la recherche de lieux). Migration `0005_poi_limits.sql` : 50 par compte et 100 au total par jour au lieu de 200 et 1 000, qui dépassaient la politique d'Overpass. **À exécuter par la personne** dans SQL Editor sur `vanTravelApp-v2`.
- [x] Serveurs : `overpass-api.de`, puis `overpass.private.coffee` en repli sur une saturation (5xx, délai dépassé côté serveur), 40 s au plus par essai.
- Écarts : le couloir passe par des rectangles et non par `around` sur une polyligne, prévu au cadrage. Deux essais `around` ont rendu 0 résultat là où le rectangle en rendait 24 (Bergen) ; serveur saturé, cause non tranchée. Le rectangle est vérifié, remplit aussi le cache de la carte et se reprend par morceaux ; il coûte plus de requêtes (32 contre 10 par jour pour le voyage de référence). Les points d'intérêt ne sont pas synchronisés : chaque appareil met son couloir en cache en figeant, ou par « Compléter le cache ».
- Non vérifié : aucune requête Overpass réussie depuis l'app (saturé à chaque essai ; le repli `private.coffee` a mis 4 min 30 pour répondre 502 hors de l'app). Carte, popup et « Sur la route » vérifiés avec la vraie réponse de Bergen placée dans le cache ; le dialogue « Plan » d'un itinéraire figé n'a pas été ouvert (figer aurait retiré les alternatives du voyage de référence local) ; le plafond n'a pas été vu avec un vrai compte. Le calque « Holiday parks / OSM » de la Nouvelle-Zélande double en partie le nouveau calque là-bas.
- [ ] Noté pour l'ouverture au public : 100 requêtes par jour pour toute l'app ne tiennent pas au-delà de quelques comptes ; passer par un relais qui met en cache (Edge Function) ou une instance Overpass payante ou à soi.

## Lot 6 : accueil et création

- [ ] Maquettes sur un canevas : accueil (voyages en cours, à venir, passés, sobre), création, recherche de lieux. Validation par la personne avant le code.
- [ ] Création : nom, dates, départ, arrivée (égale au départ par défaut), mode par défaut, préréglage de véhicule. Un seul écran à 390 px.
- [ ] Ouverture directe sur Voyager pendant un voyage ; « aujourd'hui » calculé dans le fuseau de l'étape en cours.
- [ ] Fond de carte vectoriel OpenFreeMap Liberty, retenu par la personne le 4 nov. 2026 après le prototype de la branche `proto/fond-vectoriel` (commits `6b85126`, `febb47a`, constats dans leurs messages ; branche à ne pas fusionner). À reprendre proprement, avec tests :
  - noms de villes, villages, hameaux et lieux du fond cliquables partout, popup « Ajouter à l'itinéraire » ; le lieu le plus proche du doigt, pas le premier trouvé ; nom français (`name:fr`) puis nom local, au lieu du `name_en` du style ;
  - calques superposés lus dans les tuiles, sans requête ni plafond : campings, hébergements, restos et cafés, courses, carburant et recharge, à voir, toilettes et eau ; visibles à partir du zoom 14 seulement (les tuiles n'ont pas ces lieux en dessous), le calque Overpass du lot 5 garde la vue d'ensemble des campings dès le zoom 11 ;
  - popup sans la ligne technique du prototype (calque, `class`, `subclass`, `rank`) ;
  - panneau « Calques » repliable ou en pastilles : avec sept interrupteurs de plus, il couvre la carte à 390 px ;
  - repli sur les tuiles raster OSM si OpenFreeMap ne répond pas (aucune garantie de service) ; règle 8 de `CLAUDE.md` et attribution OpenMapTiles à mettre à jour.
- [ ] Data mobile en voyage : **cache passif**, choisi par la personne le 4 nov. 2026. Le service worker garde les tuiles déjà affichées (comme la règle `osm-tiles` de `vite.config.ts` pour le raster) : préparer le voyage sur le Wi-Fi en parcourant les étapes suffit à les avoir sans réseau. Aucun téléchargement en masse. Écartés pour l'instant : préchargement au figeage (au plus 3 000 tuiles chez OpenFreeMap, avec un `User-Agent` que le navigateur ne laisse pas fixer ; il faudrait leur accord écrit) et extrait de carte auto-hébergé (« Hors de la v2 »). Réglages, d'après les en-têtes relevés le 4 nov. 2026 :
  - tuiles `tiles.openfreemap.org/planet/<version>/…` : `CacheFirst` (servies avec un `max-age` de dix ans, chemin daté donc immuable), nombre d'entrées à fixer selon le poids moyen mesuré ;
  - index `/planet` (`max-age` d'une heure), style (un jour), sprites et polices : `NetworkFirst` avec un délai court, pour resservir hors ligne la version déjà en cache ;
  - revers : à chaque nouvelle version hebdomadaire d'OpenFreeMap, une vue en ligne retélécharge ses tuiles. Durée de conservation des anciennes versions inconnue : ne pas figer l'index sans la connaître ;
  - mesurer avant de fixer les plafonds : poids moyen d'une tuile au zoom 14 en ville et à la campagne, data d'une journée type de navigation.
  Repères chiffrés (voyage de référence, 4 nov. 2026) : couloir de 3 km, 1 021 tuiles au zoom 12, 3 152 au zoom 13, 9 717 au zoom 14 ; 5 km autour des 9 nuits, 621 tuiles au zoom 14 ; une tuile dense de Bergen au zoom 14, 268 Ko décompressée.
  Non vérifiés aussi : quota de stockage et éviction du Cache API sur iPhone (web app installée ou Safari).

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

Non vérifiés au cadrage : politique d'usage de Photon (vérifiée au lot 3) et d'Overpass (vérifiée au lot 5), poids d'une bibliothèque de fuseaux embarquée, source des taux BCE utilisable depuis le navigateur (CORS), quotas gratuits des Edge Functions Supabase.
