# Journal de bord

Une entrée par session de travail, écrite en fin de session par l'assistant (règle 11 de `CLAUDE.md`). C'est la matière du retour d'expérience sur le « vibe dev » de cette application : ce qui a été demandé, ce qui a été livré, ce qui a cassé, ce que l'IA a mal fait, et les décisions prises avec leur raison. L'historique git donne le « quoi » ; ce journal garde le « pourquoi » et le « comment ».

Aucune donnée personnelle ici (ni réservation, ni code, ni adresse) : ce dépôt est public.

Gabarit d'une entrée :

```
## AAAA-MM-JJ : titre court

- **Intention** : ce que la personne voulait obtenir.
- **Demandes** : les prompts ou consignes, en substance.
- **Livré** : ce qui a été fait (commits, fichiers, fonctionnalités).
- **Cassé ou appris** : bugs rencontrés, erreurs de l'IA, fausses pistes, temps perdu.
- **Décisions** : choix d'architecture ou de produit, avec la raison et les alternatives écartées.
- **Chiffres** : commits, tests, durée approximative, tout ce qui aide à mesurer.
- **Avant, après** (étape majeure seulement) : l'état de l'app avant et la cible, et les questions ouvertes au lancement.
```

Les entrées antérieures au 7 octobre 2026 sont reconstituées après coup depuis l'historique git et `docs/PLAN.md` : elles sont plus courtes et ne contiennent pas les prompts.

## 2026-09-29 : de l'application Next.js v1 à la SPA statique (reconstitué)

- **Intention** : repartir d'une première version Next.js (dépôt `vanTravel`, commit initial à 16 h 38) vers une application sans serveur, déployable gratuitement, utilisable sur téléphone hors ligne.
- **Livré** : en une soirée, dans le nouveau dépôt public `vanTravelApp` : migration Vite + React 19, entité `TripConfig`, données publiques générées au build, PWA, workflow GitHub Pages (18 h 23) ; navigation mobile par onglets et plan de travail `docs/PLAN.md` (18 h 48) ; phase 3 « hors ligne solide » (19 h 06) ; phase 4 « mode Voyager » par PR (19 h 28, fusionnée 20 h 10) ; mise à jour de l'app sur invite au lieu du rechargement automatique (19 h 57) et son hotfix (20 h 17).
- **Cassé ou appris** : la mise à jour automatique du service worker rechargeait l'app sous les doigts de la personne : remplacée par une invite, avec un « pont » pour les installations déjà en place. Un circuit avec ses tracés dépasse le quota `localStorage` : passage à IndexedDB.
- **Décisions** : deux dépôts, un public pour le code et un privé pour les données, avec la règle « zéro donnée personnelle dans le public » ; commits directement sur `main` (décision du soir même, 20 h 20) parce qu'une seule personne travaille et que chaque push déploie ; pas de serveur ni de base de données.
- **Chiffres** : 8 commits dans `vanTravelApp`, 3 dans `vanTravel`, environ 4 heures.

## 2026-09-30 : iPhone, synchronisation, mode sombre (reconstitué)

- **Intention** : rendre l'app utilisable sur l'iPhone réel, puis partager un même voyage entre deux téléphones sans base de données.
- **Livré** : correctifs iPhone (défilement du `body`, onglets, clavier, scope du manifeste, export par la feuille de partage, roadbook, Plans) ; phase 5 : synchronisation via le dépôt privé et l'API Contents de GitHub, fusion par entité avec pierres tombales, chiffrement optionnel des codes d'accès ; phase 6 partielle : mode sombre.
- **Cassé ou appris** : aucun WebKit disponible en session, donc les correctifs iPhone ont été livrés « à confirmer sur l'iPhone ». La synchro a été livrée testée unitairement, mais jamais à deux téléphones : c'est là que les bugs du 7 octobre attendaient.
- **Décisions** : dépôt GitHub privé comme stockage partagé, écarté Gist (pas de binaire), base gratuite (pause, compte tiers) et fichiers au build (publics). Hors ligne sans journal d'écritures : l'état local porte les modifications, la passe repart au retour du réseau (écart au plan, moins de code).
- **Chiffres** : 3 commits, environ 3 heures.

## 2026-10-07 : la synchro à l'épreuve du réel, et la question du backend

- **Intention** : comprendre pourquoi l'app repartait « à zéro » au lancement alors que `trip.json` était rempli, faire du circuit `#FINAL` (importé d'une sauvegarde) le voyage de base, puis décider s'il faut quitter GitHub comme stockage.
- **Demandes** : « ça me réinitialise à 0 pourtant trip.json n'est pas vide » ; « pourquoi ça fait des commits à chaque synchro, pourquoi ça écrase tout » ; « il y a des conflits, gère-les et fais les push » ; « je veux #FINAL en voyage de base » ; « Synchroniser envoie au lieu de recevoir, ce fonctionnement n'est pas idéal, faut-il une DB et un backend ? » ; « mes documents sur GitHub, même privé, ça me pose problème : quelles alternatives ? ».
- **Livré** :
  - Diagnostic : trois bugs de la synchro livrée le 30 septembre, jamais testée à deux appareils. (1) Un circuit importé d'une sauvegarde portait un autre identifiant que `trip.json` : « Utiliser » le voyage remettait le brouillon à zéro, puis envoyait ce brouillon vide (le seul départ automatique) comme `itinerary.json`, repris ensuite par tous les appareils. (2) Le `plan` de `trip.json` n'était jamais posé quand la synchro était configurée. (3) Le planificateur s'abonnait au store avant la réhydratation d'IndexedDB : chaque ouverture de l'app datait l'itinéraire local de « maintenant », donc l'appareil gagnait toujours sur le dépôt (ping-pong téléphone et PC visible dans l'historique du dépôt privé, 15 h 15 à 16 h 07).
  - Correctifs (`420e0bf`, `4978885`) : circuit local gardé s'il couvre les mêmes dates ; un itinéraire réduit au départ automatique ne compte pas (`hasItinerary`) ; plan de `trip.json` posé si rien d'aucun côté ; garde `persist.hasHydrated()` ; dialogue qui annonce ce que la passe fera (`describeItinerarySync`, sha seul via `getFileMeta`) et boutons « Recevoir l'itinéraire du dépôt » et « Envoyer mon itinéraire » (`resolveItineraryDecision`). Tests : 91 puis 94.
  - Données : `itinerary.json` régénéré depuis la sauvegarde ; conflit git résolu en gardant la version complète ; `#FINAL` devenu le voyage de base (`trip.json` renommé, plan dérivé du circuit, hébergement de Kaikōura ajouté aux `stays`).
  - Analyse des alternatives au dépôt GitHub (Supabase, Firebase, Cloudflare, PocketBase, chiffrement côté client), chiffres vérifiés sur les pages officielles ; ce journal et la règle 11.
  - Allègement de `itinerary.json` : JSON compact et coordonnées à cinq décimales, 1,3 Mo au lieu de 5,6. Le fichier ne contenait aucune alternative de tracé : la piste « figer l'itinéraire pour l'alléger » était fausse, l'indentation seule expliquait le poids.
- **Cassé ou appris** :
  - L'IA avait conçu une synchro cohérente sur le papier et testée unitairement, mais les trois bugs ne se voyaient qu'avec deux appareils réels et un circuit importé. Leçon : une fonctionnalité de synchronisation se valide à deux appareils avant d'être cochée.
  - Le premier correctif de l'IA était insuffisant : il laissait un brouillon vide « en attente d'envoi » gagner sur le dépôt ; durci dans la foulée après avoir vu trois nouveaux envois vides depuis le téléphone.
  - Les commits « Itinéraire (moi) » dans le dépôt privé sont normaux : l'API Contents de GitHub crée un commit par fichier écrit ; une passe sans changement n'écrit rien.
  - Le fichier `itinerary.json` pèse 5,6 Mo (tracés non figés, JSON indenté) : lecture gérée au-delà de 1 Mo, envoi depuis un téléphone non testé.
  - Outillage : Node 16 dans le PATH, Node 22 via mise ; `npm install` réécrit `package-lock.json` ; les sources sont en CRLF, ce qui a fait échouer les premiers patchs automatiques ; pas de Python sur le poste.
- **Décisions** :
  - Garder l'architecture pour corriger les bugs d'abord (une journée), plutôt que migrer sous la pression d'un incident.
  - Les documents (photos, PDF) partent aujourd'hui dans le dépôt privé, non chiffrés : la personne ne le souhaite pas, même en privé. Recommandation retenue pour la suite : Supabase (Auth Google ou mot de passe, Postgres avec règles par ligne, Storage), plan gratuit, GitHub Pages conservé ; `github-repo.ts`, `sync.ts` et le dialogue à remplacer, store IndexedDB et règles de fusion conservés. Alternatives écartées : Firebase (carte bancaire exigée pour Storage depuis février 2026, enfermement), Cloudflare Access + R2 (parfait à deux, impasse pour des comptes publics), PocketBase (serveur à entretenir, pré-1.0), chiffrement des documents sur GitHub (règle la technique, pas l'inconfort).
  - Risque Supabase identifié : pause après une semaine sans requêtes ; à traiter par un cron ou par le plan Pro le mois du voyage.
  - Stack cible retenue pour la suite : front inchangé, Supabase (Auth, Postgres avec règles par ligne, Storage), dépôt de données retiré ; hébergement GitHub Pages conservé pour février (la clé publique Supabase est faite pour le navigateur, aucun secret dans le front), Cloudflare Pages seulement si le dépôt passe en privé ou s'il faut masquer l'app.
- **Chiffres** : 2 commits dans `vanTravelApp`, 4 commits manuels et 9 commits de synchro dans `vanTravel`, 94 tests, environ 2 h 30 de session.

## 2026-10-08 : plan d'intégration Supabase

- **Intention** : disposer d'un plan complet, utilisable comme entrée d'une nouvelle session, pour remplacer le dépôt GitHub privé par Supabase sans toucher au front ni au mode hors ligne.
- **Demandes** : « génère-moi un plan avec les étapes à faire de mon côté via Supabase et les étapes dans le code » ; la veille : « Supabase + GitHub Pages marcherait, pour éviter Cloudflare ? », « si j'ai Supabase, je pourrais aussi tout mettre sur mon GitHub privé ? ».
- **Livré** : `docs/SUPABASE.md` : cible, règles d'or (hors ligne d'abord, une ligne par entité, itinéraire en un document, serveur qui tranche par `updated_at`, règles d'accès dans Postgres), schéma SQL complet avec RLS et policies Storage, huit étapes côté tableau de bord Supabase, Google Cloud et GitHub, sept lots de code estimés (A client et session, B adaptateur de synchro, C voyages et membres, D documents, E migration, F déploiement et nettoyage, G contrôle des règles d'accès), tableau des risques, prompt de reprise. Phase 7 ajoutée à `PLAN.md`.
- **Cassé ou appris** : rien de cassé. Clarifications utiles pour la suite : il n'y a pas de secret dans un front statique, la clé publiable Supabase est faite pour le navigateur et la sécurité repose sur les règles par ligne ; GitHub Pages depuis un dépôt privé exige un plan payant et le site reste public de toute façon ; Supabase n'héberge pas de frontend.
- **Décisions** : GitHub Pages conservé pour février (pas de réinstallation de la PWA, pas de service de plus), Cloudflare Pages reporté au passage éventuel en dépôt privé ; branche `supabase` le temps du chantier, écart explicite à la règle 10 ; dépôt de données `vanTravel` archivé après migration ; Pro à 25 $ envisagé pour le seul mois du voyage.
- **Chiffres** : 1 commit, environ 45 min.

## 2026-10-08 : Supabase, lots A à G sur la branche `supabase`

- **Intention** : exécuter le plan `docs/SUPABASE.md` d'un bloc, après que la personne a créé le projet, posé les variables du dépôt et lancé le schéma SQL.
- **Demandes** : « j'ai créé mon compte, mis des variables de repository avec l'url et la clé partageable, lancé le script SQL ; continue le plan et effectue les étapes » ; « le plan parle d'une branche supabase, comment tester si c'est sur une branche ? ».
- **Livré** : branche `supabase`, supabase-js 2.117.3. `src/services/supabase.ts` (client, `SyncError`, traduction des erreurs PostgREST, Auth et Storage), `auth.ts` (Google, e-mail avec confirmation, mot de passe oublié, identité recopiée pour le hors ligne, profil garanti), `supabase-sync.ts` (voyages, membres, itinéraire avec verrou optimiste, lignes paginées, RPC par paquets de 200, bucket), `sync.ts` réécrit sur `src/lib/sync-rows.ts` (pur, 8 tests), `src/store/account-store.ts` à la place de `sync-store.ts`, dialogue `src/components/account/account-dialog.tsx` (connexion, voyages, « Mettre sur le compte », membres, phrase), `supabase/schema.sql` et `migrations/0002`, `scripts/migrate-from-private-repo.mjs`, `scripts/rls-check.mjs` (une trentaine de contrôles), `keepalive.yml`, variables dans `deploy.yml`, docs et règles réécrites. Retirés : client GitHub et son test, `trip-source.ts`, plugin Vite `/__private/`, `PRIVATE_DATA_DIR`. Lint, typecheck, 94 tests, build : verts.
- **Cassé ou appris** :
  - Le schéma du plan avait `id text primary key` sur `travel_items` : faux dès deux voyages (`<date>:notes`). Vu en écrivant l'adaptateur, corrigé par la migration 0002 (clé composée), que la personne doit exécuter : c'est le prix d'un schéma lancé avant le code.
  - Postgres renvoie `.12+00:00` là où JavaScript écrit `.120Z` : les comparaisons de chaînes du modèle de fusion auraient été fausses à la milliseconde près. `toIso` partout, valeur brute conservée pour le verrou optimiste.
  - Le serveur ne remplace qu'une ligne strictement plus récente : poser une phrase de chiffrement après coup ne rechiffrait jamais les codes déjà en clair sur le serveur (même `updatedAt`). Redatage au scellement.
  - Fichiers en CRLF : deux séries de remplacements multi-lignes par script Node sont passées sans effet avant normalisation des fins de ligne (perte d'une demi-heure, deux relances de lint pour rien). `sed` ligne à ligne et l'outil d'édition ont fini le travail. Noté dans les pièges de `CLAUDE.md`.
  - L'assistant ne peut pas créer de compte sur Supabase ni se connecter à la place de la personne : la connexion, le `rls-check` et le test à deux appareils restent à faire par elle. Vérifié par l'assistant : `beat()` répond, l'anonyme ne lit rien, `upsert_travel_items` existe, e-mail activé avec confirmation, Google pas encore activé.
  - Lint React : `setState` synchrone dans un effet refusé ; la liste des membres est désormais clé par identifiant de voyage et dérivée, sans remise à zéro dans l'effet.
- **Décisions** : lecture complète à chaque passe plutôt que `since` ; migration sans clé secrète ; prénom local avant prénom du compte ; policies de suppression ajoutées (le propriétaire peut supprimer un voyage et retirer un membre, nécessaire au nettoyage du `rls-check` et à l'usage réel) ; test de la branche en dev et depuis le téléphone sur le Wi-Fi, jamais par `workflow_dispatch` qui remplacerait le site publié.
- **Chiffres** : 4 commits sur la branche, 16 fichiers de test, 94 tests, environ 2 h 30 de session.
  - Premier `rls-check` lancé par la personne (après la migration 0002) : tout KO dès « A crée le voyage ». `create_trip` insère `trips` puis `members`, dont la policy d'insertion relit `trips` ; la policy de lecture de `trips` n'autorisait que les membres, inexistants à cet instant. Faute présente dans le schéma du plan, invisible sans exécution réelle : migration 0003 (le propriétaire lit son voyage), script qui s'arrête net si la mise en place échoue au lieu d'enchaîner trente KO sans sens.
  - Création des comptes de test bloquée par « Trop d'essais » : limite de 2 e-mails par heure du service d'e-mail intégré de Supabase (confirmations comprises), pas une limite d'essais. Parade : confirmation d'e-mail désactivée le temps des tests.
  - Après la migration 0003 : `rls-check` 37/37. Décision de la personne : fusion dans `main` le jour même et validation directement sur l'app déployée, plutôt qu'une semaine sur la branche.

## 2026-10-19 : la fiche étape devient une page, dépenses et documents en vues globales

- **Intention** : rendre le mode Voyager lisible. Le panneau bas de la fiche d'étape (onglets Réservations / Documents / Checklist / Notes) était étriqué, sur téléphone comme sur PC ; les dépenses n'existaient que jour par jour ; aucune vue de tous les documents.
- **Demandes** : « proposer des maquettes avant de modifier » (ou trouver un outil pour en faire) ; puis deux retouches sur les maquettes : le code d'accès prend trop de place pour un usage rare, et distinguer les documents de la nuit (camping) de ceux des activités ; puis « implémente tel que maquetté, changements de données compris ».
- **Livré** : six maquettes sur un canevas de design (Jour, fiche étape, dépenses, nouvelle dépense, documents, fiche étape sur écran large), validées avant le code. Puis : routes `/etape/:id`, `/depenses`, `/depenses/nouvelle`, `/documents` ; `VoyagerFrame`, `VoyagerNav`, `useBack` ; pages `stop-page`, `expenses-page`, `new-expense-page`, `documents-page` ; `document-list` (liste gérable et vignettes) à la place de `documents-section` ; `stop-sheet` et `expenses-panel` supprimés ; `SecretField` en variante compacte. Schéma v4 (`scope`, `stopId`, `tripDocuments`), store, synchro (`tripDocuments` dans le document de fusion, scope réservé `trip` dans `travel_items`, envoi et réception des fichiers de voyage), helpers purs `stopCosts`, `groupExpenses`, `groupDocuments`, `orderedStops` avec tests. Docs mises à jour.
- **Cassé ou appris** :
  - Le canevas de design de l'application a suffi pour les maquettes : pas besoin d'un outil externe. Le design system Ippon proposé par défaut a été écarté (projet personnel, thème propre de l'app).
  - Écart aux maquettes, assumé : sur la fiche étape, les documents restent en lignes (vignette, légende éditable, suppression) plutôt qu'en vignettes, parce que les vignettes ne laissent aucune place à la légende ; les vignettes servent sur la page Documents, en lecture. Autre écart : la fiche étape garde le bouton « Appeler » dans la carte de réservation en plus de l'en-tête.
  - Pas de migration SQL malgré la règle « tout changement de schéma = migration » : les nouveaux champs vivent dans le `payload` jsonb et le scope `trip` est une valeur, pas une colonne. La règle visait la forme des tables ; noté dans `schema.sql` en commentaire.
  - Test dans le navigateur intégré sans compte Supabase : impossible de se connecter à la place de la personne. Parade : un fichier de sauvegarde fictif injecté dans l'entrée « Importer un fichier » par `DataTransfer` depuis la console, ce qui charge un voyage de démonstration sans réseau. Bonne recette pour les prochaines vérifications d'écran.
  - Le lanceur de prévisualisation prend le `node` du PATH (16) : Vite 8 plante sur `styleText`. Le lanceur doit préfixer le PATH par les shims mise (`.claude/launch.json` à la racine du dossier parent, hors dépôt). Le volet a annoncé le port 43218 alors que Vite écoutait bien sur 43217 : vérifier avec `netstat` avant de chercher ailleurs.
  - Captures d'écran du volet souvent en dépassement de délai : la vérification de la mise en page large s'est faite par mesure des boîtes dans la page (`getBoundingClientRect`) plutôt qu'à l'œil.
- **Décisions** : fiche étape en page plutôt qu'en panneau (demande explicite, et le retour système du téléphone marche naturellement) ; sections empilées plutôt qu'onglets (tout se voit en défilant, compteurs dans des pastilles d'ancre) ; dépense rattachée à une étape par un `stopId` optionnel, la nuit du jour proposée d'office ; documents de voyage dans une liste à part du snapshot plutôt qu'une pseudo-étape (plus propre dans la fusion et les sauvegardes) ; portée des documents posée à la migration (une étape de nuit donne `nuit`) pour ne rien avoir à ressaisir ; jour affiché gardé dans le store sans persistance pour revenir au même jour après une fiche.
- **Chiffres** : un fichier de test créé (`documents.test.ts`), quatre étendus (expenses, migrations, sync-model, sync-rows), 109 tests en 17 fichiers, environ 3 h de session (maquettes comprises), aucun commit à cette heure (la personne tranche).

## 2026-11-02 : lancement de la v2, cadrage par questions

- **Intention** : la v1 convient pour le voyage NZ à deux ; la personne veut, sur une branche, une version plus complète : voyage n'importe où (Bretagne, Norvège...), choix du mode (van, voiture, vélo, marche, Interrail) et fonctionnalités associées, sans casser l'app qui servira sur le terrain.
- **Demandes** : « si je veux intégrer une clé API Google c'est possible ? » ; « c'est quoi le contenu du backlog ? » ; « et si je veux donner la possibilité de créer un roadtrip n'importe où ? » ; « que m'apporte une clé Google, comment la limiter par user ? Si il faut quitter GitHub Pages pour la sécu, on réfléchira au backend » ; puis `/grill-me` : « challenge-moi sur le design de l'appli telle que j'aimerais qu'elle évolue » ; enfin « il faut alimenter le journal : étape majeure, pour un RETEX il faudra voir l'avant-après et les points d'interrogation du lancement ».
- **Livré** : analyse du code (région `nz-south` câblée dans `regions.ts`, `catalog.ts` et l'écran de démarrage, calques DOC propres à la NZ, une quarantaine d'usages de la région dans une quinzaine de fichiers) ; cinq tours de questions (27 questions, chacune avec une recommandation) ; branche `v2` ; `docs/CADRAGE-v2.md` (questions, réponses, effets, tableau avant-après) ; `docs/PLAN-v2.md` (lots 0 à 8, exclusions, points à vérifier) ; six ADR dans `docs/adr/` ; `GLOSSARY.md` ; `CLAUDE.md` adapté à la branche ; champ « Avant, après » ajouté au gabarit de ce journal.
- **Cassé ou appris** :
  - La question de départ (« une clé Google ? ») s'est dissoute en cours de séance : la clé ne se limite pas par utilisateur dans un front, les conditions de Google Places interdisent de garder les coordonnées plus de 30 jours (seul le `place_id` se conserve), et un lien Google Maps sans clé ne garantit pas d'ouvrir le même lieu que la fiche OSM. Résultat : aucune clé ni lien de fiche Google dans la v2. Ce n'est pas la réponse attendue, mais elle tient aux contraintes que la personne avait elle-même posées (gratuit, hors ligne).
  - La préversion sur `/vanTravelApp/next/`, recommandée par l'assistant et validée par la personne, ne tient pas : même origine que la v1 (IndexedDB et `localStorage` partagés, la migration v5 aurait réécrit les données de la v1 sur le téléphone), service worker de la v1 qui capte `/next/`, `deploy.yml` à modifier sur `main` gelé. Vu en lisant `vite.config.ts` et les noms de bases au moment d'écrire le lot 0, pas pendant la séance. Leçon : une recommandation d'infrastructure se vérifie dans le code avant d'être posée en question.
  - L'assistant avait annoncé « deux projets gratuits actifs » de mémoire ; vérifié ensuite sur la page de tarifs de Supabase. Les branches Supabase, proposées par la personne, sont payantes à l'heure.
  - Une reformulation de la personne (« si tu dis que tout est quasi dans OSM ») prêtait à l'assistant une affirmation qu'il n'avait pas faite : corrigée avant de trancher, parce qu'elle changeait la décision.
- **Décisions** (détail et raisons dans `docs/CADRAGE-v2.md` et `docs/adr/`) : proches invités d'abord, ouverture au public préparée mais pas faite ; 0 € avec blocage au plafond ; hors ligne pour tous les modes ; un seul modèle jours, étapes, tronçons, le mode porté par le tronçon ; priorité au road trip multi-pays, puis Interrail en saisie manuelle, puis trek ; pas de choix de pays, zone et fuseaux déduits des étapes ; OSM comme seule source de lieux ; dépenses en euros au taux BCE figé, réparties avec des poids ; projet Supabase dédié, `main` gelé jusqu'au retour, fusion après le voyage avec migration de la production. Préversion : développement local seul (port 43218), choisi par la personne contre une préversion sur un autre hébergeur.
- **Chiffres** : aucun commit à cette heure (la personne tranche) ; 27 questions en cinq tours ; v1 au lancement : 23 commits, 134 fichiers sous `src`, environ 15 300 lignes TypeScript, 109 tests en 17 fichiers.
- **Avant, après** : tableau complet dans `docs/CADRAGE-v2.md`. En une ligne : d'une app câblée pour un road trip en van en Nouvelle-Zélande, à deux, vers une app de voyage itinérant n'importe où, à plusieurs, avec un mode par tronçon. Questions ouvertes au lancement : pour qui (deux, des proches, le public) ; quel voyage sert de juge quand il n'y en a pas de réel ; Google, pour quoi faire ; comment travailler longtemps sur une branche sans casser l'app du voyage en cours.

## 2026-11-03 : v2, lot 0 (projet Supabase de préversion) et lot 1 (modèle v5)

- **Intention** : mettre en place l'environnement isolé de la v2, puis poser le modèle de données qui permet un voyage n'importe où, avec un mode par tronçon.
- **Demandes** : « qu'est-ce que je dois cocher pour la création du projet ? » (options Data API, exposition automatique, RLS automatique) ; « je n'ai pas compris ce que je dois faire » pour le `.env.local` ; les valeurs du projet `vanTravelApp-v2` ; les comptes de test ; « lance le lot 1 ».
- **Livré** :
  - Lot 0 : `npm run dev` en mode `next` sur la branche, qui lit `.env.next.local` par-dessus `.env.local` (plus d'échange de fichiers entre `main` et `v2`) ; `rls-check` ne lit plus que ce fichier et affiche le projet visé ; contrôle anonyme puis `rls-check` 37/37 sur `vanTravelApp-v2`.
  - Lot 1 : schéma stocké v5 (tronçon `mode`, `track`, `manual` ; durées `durationRawSec` et `durationSec`), voyage v2 (plus de `regionId` ni de `vehicle`, `defaultMode`, `profile`, repères positionnés), préréglages de profil, zone du voyage et date du jour par fuseau d'étape, module hors ligne des fuseaux et pays chargé à la demande, cartes cadrées sur le voyage, calques DOC réservés à la Nouvelle-Zélande, ligne des tronçons sans tracé dans l'itinéraire et le roadbook, voyage fictif de référence et son générateur. Fichiers nouveaux : `src/lib/profiles.ts`, `legs.ts`, `zone.ts`, `place-zone.ts`, `travel-time.ts` (ex `van-time.ts`), `src/hooks/use-zone-lookup.ts`, `use-trip-zone.ts`, `scripts/make-reference-trip.mjs`, `fixtures/reference-scandinavie.json`, cinq fichiers de test.
- **Cassé ou appris** :
  - Le premier `rls-check` s'est arrêté à la connexion du compte A : le compte n'existait pas avec ce mot de passe. Le message « Invalid login credentials » ne distingue pas compte absent et mauvais mot de passe ; un appel direct à `/auth/v1/token` pour chaque compte a isolé le fautif en une commande.
  - `schema.sql` ne donne aucun droit explicite sur les tables : il dépend de l'option « Automatically expose new tables » du projet, que Supabase recommande pourtant de décocher. Cochée pour reproduire la production ; droits explicites inscrits au lot 2.
  - Bogue trouvé seulement dans le navigateur : `useState(loaded)` avec `loaded` une fonction, que React appelle comme initialiseur (`placeZone()` sans coordonnées, écran blanc). Les tests unitaires ne couvraient pas le crochet. Corrigé par `useState(() => loaded)`. Le parcours a aussi montré deux régressions que les tests ne voyaient pas : la ligne du ferry absente de l'itinéraire (rendu conditionné à une option de route) et « Chargement des campings DOC… » affiché sans fin en Scandinavie (calques désactivés hors NZ, message resté).
  - La console du volet garde les erreurs d'avant un rechargement : vérifier l'état de la page avant de conclure qu'une erreur est toujours là.
  - `country-coder` pèse 225 Ko compressés pour 29 Ko côté fuseaux : acceptable parce que chargé à la demande et précaché, à surveiller si le paquet grossit.
- **Décisions** :
  - Fuseau et pays calculés à la lecture plutôt que stockés sur l'étape (écart à Q21) : stockés, ils auraient réécrit l'itinéraire de chaque voyage au premier chargement (une écriture à synchroniser par appareil, un terrain qui a déjà donné un ping-pong le 7 octobre) et seraient devenus faux au déplacement d'une étape.
  - Renommer `durationVanSec` en `durationSec` malgré une dizaine de fichiers touchés : un nom « van » sur une durée de voiture ou de moto aurait trompé chaque lecteur suivant.
  - « Aujourd'hui » = le premier jour du voyage dont la date est aujourd'hui dans son propre fuseau, pour un voyage qui traverse plusieurs fuseaux.
  - Devise proposée tirée de la dernière dépense dès le lot 1 (prévue au lot 7) : sans région, plus rien ne donnait la devise locale.
  - Voyage de référence parti de Copenhague plutôt que d'Oslo : un vrai ferry (Hirtshals, Kristiansand) et un troisième pays.
- **Chiffres** : 141 tests en 21 fichiers (109 au départ) ; module des fuseaux et pays 259 Ko compressés, à part du paquet principal ; voyage de référence 21 Ko, 12 tronçons, 2 223 km.

## 2026-11-03 : v2, lot 2 (rôles, plafonds d'usage, droits explicites)

- **Intention** : préparer le serveur à des voyages partagés avec des proches (qui modifie, qui consulte) et aux services publics à quota des lots suivants, sur le projet de préversion seulement.
- **Demandes** : « oui, lot 2 » ; « on migre quoi exactement ? » et « à quoi servent les plafonds d'usage sachant qu'il n'y a pas de clé ? » ; « migration terminée, et on peut garder les plafonds ».
- **Livré** : migration `0004_roles_quotas_grants.sql` et `schema.sql` à jour (rôle lecteur, `can_write`, `set_member_role`, `add_member_by_email` avec rôle, policies de lecture et d'écriture séparées, `usage_limits`, `usage`, `consume_quota`, droits révoqués puis accordés au cas par cas, plus de droits par défaut) ; `src/lib/roles.ts`, `src/lib/quota.ts` et leurs tests, `src/services/quota.ts` ; synchro en lecture seule pour un lecteur ; écran Compte (rôle à l'invitation, changement de rôle, « Quitter ce voyage ») ; `rls-check` étendu.
- **Cassé ou appris** :
  - L'assistant a lancé `npx prettier` sur huit fichiers alors que le projet n'utilise pas Prettier : formatage à 80 colonnes sur tout le fichier, annulé par `git checkout` des fichiers existants puis rejeu des scripts d'édition gardés dans le brouillon. Leçon : ne lancer que les outils du `package.json`.
  - L'entrée du journal du lot 1, commitée, était abîmée (une apostrophe inverse en tête de chaque ligne, des apostrophes inverses échappées) : un échappement raté par l'assistant lors de l'écriture. Réparée ici.
  - Le parcours dans le navigateur a trouvé deux défauts que `rls-check` et les tests ne voyaient pas : la liste « Voyages du compte » affichait le voyage une fois par membre (défaut de la v1, visible seulement maintenant que les rôles diffèrent, et cause des erreurs React « same key »), et un `select` aux libellés longs élargissait toute la boîte de dialogue à 375 px (un `select` prend la largeur de sa plus longue option, `min-w-0` n'y change rien).
  - La personne a questionné l'utilité des plafonds sans clé. Réponse de l'assistant : sans clé, rien à facturer ; Photon et Overpass ralentissent ou bloquent surtout par adresse IP, donc à quelques utilisateurs les plafonds ne protègent guère que d'un bogue, et un compteur appelé par le navigateur se contourne. Il proposait de les reporter ; la personne les garde.
- **Décisions** :
  - Un lecteur reçoit tout et n'envoie rien, refusé côté serveur et côté client ; ses modifications restent sur l'appareil sans verrouiller l'interface (reporté au lot 6, pour ne pas toucher tous les écrans maintenant).
  - Le propriétaire garde son rôle, sa ligne ne se retire pas ; chacun peut quitter un voyage qui n'est pas le sien.
  - Plafond par compte exact (écriture conditionnelle), plafond global lu avant l'écriture (dépassement possible de quelques unités en cas de demandes simultanées, accepté) ; un refus ne compte pas ; un service fictif `rls-check` (3 par jour) pour tester le plafond sans toucher aux vrais.
  - Valeurs de départ (500 et 2 000 pour la recherche de lieux, 200 et 1 000 pour les points d'intérêt) choisies par l'assistant, à confronter aux règles d'usage aux lots 3 et 5.
  - Droits explicites plutôt que l'option « Automatically expose new tables » : une table oubliée n'est plus exposée par défaut.
- **Chiffres** : `rls-check` 72/72 (37 avant) ; 152 tests en 23 fichiers (141 avant) ; une migration de 225 lignes.

## 2026-11-03 : v2, lot 3 (géographie libre)

- **Intention** : pouvoir poser une étape ou un départ n'importe où, sans catalogue ni région, et ne plus montrer hors de Nouvelle-Zélande ce qui ne sert qu'à elle.
- **Demandes** : « Go lot 3 de la v2 ».
- **Livré** : recherche de lieux sur OSM par Photon (`src/lib/place-search.ts` pur, `src/services/place-search.ts`, `usePlaceSearch`, `PlaceSearchField`), branchée dans le panneau Planifier (catalogue local puis OSM) et dans l'écran de démarrage à la place de la liste des villes néo-zélandaises ; appui long et clic droit sur la carte (`map-long-press.ts`) avec un nom proposé par recherche inversée ; plus de région par défaut sans voyage ; campings OSM générés pour la NZ et interrupteurs du catalogue masqués ailleurs ; deux fichiers de test (21 tests), dont le premier test d'un service réseau du dépôt (compteur et `fetch` simulés).
- **Cassé ou appris** :
  - La politique du serveur public de Photon tient en une phrase (« limite raisonnable », usage intensif ralenti ou banni), sans chiffre : impossible de confronter le plafond de 500 recherches par compte et par jour à une limite publiée. Vérifié aussi par une requête : CORS ouvert, `lang=fr` accepté, `extent` dans l'ordre ouest, nord, est, sud.
  - Premier essai de recherche inversée dans le navigateur : rien de proposé. Le point cliqué était en mer, Photon ne renvoie alors rien ; le dialogue garde son exemple, comportement voulu, mais l'assistant a d'abord cru à un défaut.
  - Le plugin `react-hooks` 7 refuse un `setState` synchrone dans un effet : le crochet de recherche range la réponse sous la clé de la recherche qui l'a demandée et dérive « en cours » de l'écart entre cette clé et la saisie. Les résultats précédents ne restent affichés que si l'on complète la même recherche, sinon la liste montrait des lieux d'une recherche sans rapport.
  - Les tests tournent sous Node : `window.setTimeout` dans un service le rendait intestable ; `setTimeout` suffit. `AbortSignal.any` écarté (absent des Safari d'iOS avant 17.4).
  - L'assistant a écrit un script jetable dans le dossier parent du dépôt au lieu du brouillon de session, puis l'a supprimé.
  - Les identifiants des comptes de test vivent dans des variables d'environnement, pas dans le dépôt : le plafond n'a pas été vu en action avec un vrai compte, seulement par les tests du service.
- **Décisions** :
  - Photon plutôt que Nominatim : le Nominatim public interdit l'autocomplétion pendant la frappe.
  - Le plafond ne s'applique qu'à un compte connecté et un compteur muet ne bloque pas la recherche : sans compte, rien à compter ; et le plafond est un garde-fou, la protection de fond reste l'attente de fin de frappe, le cache et l'écart d'une seconde.
  - Le champ de recherche remplace l'ancien sans maquette, à titre provisoire : la règle « maquette avant le code » vise les écrans nouveaux, et la recherche de lieux a sa maquette au lot 6.
  - Un lieu OSM garde un identifiant stable `osm:<type><id>` et `meta.source` ; aucun changement de schéma stocké.
  - Le départ ne garde pas la localisation du lieu (le repère n'a pas de champ `area`) : ajouter ce champ touche la forme du voyage, reporté à l'écran de création.
- **Chiffres** : 173 tests en 25 fichiers (152 avant) ; une requête Photon pour un mot de douze lettres tapé d'un trait ; réponses de Photon entre 2 et 3,5 s pendant les essais.

## 2026-11-03 : v2, lot 4 (routage par tronçon)

- **Intention** : qu'un tronçon ait vraiment son mode : la route calculée pour le van, la voiture ou la moto, un horaire saisi pour un train ou un ferry, et que le reste de l'app (carte, roadbook, Voyager, seuil de conduite) en tienne compte.
- **Demandes** : « Go Lot 4 v2 ».
- **Livré** : `routeLeg` dans `src/services/routing.ts` (OSRM cadencé à une requête par seconde, aucun appel pour les modes manuels) ; logique pure des tronçons dans `src/lib/legs.ts` (estimation par mode, lecture des heures et durées tapées, saisie appliquée, trait en ligne droite, résumé « Ferry · 8 h 00 → 11 h 15 · 3 h 15 · 140 km ») ; actions `setLegMode` et `updateLegManual` dans le store ; éditeur de tronçon dans Planifier ; pointillé sur la carte, le croquis du roadbook, le PDF et le comparateur ; horaire, compagnie, prix et notes dans le roadbook et la carte « Aujourd'hui » ; prix optionnel sur le tronçon manuel ; 14 tests de plus, dont le deuxième test de service réseau du dépôt.
- **Cassé ou appris** :
  - La signature d'itinéraire de la synchro ne regardait que l'identifiant, les étapes, l'option choisie et le nombre d'options d'un tronçon : un changement de mode ou d'horaire n'aurait pas daté l'itinéraire local, donc aurait perdu face au serveur. Repéré à la lecture du code avant d'écrire l'action, corrigé et testé.
  - Le badge « +4 h » additionnait ferry et conduite : la journée Aarhus, Hirtshals, ferry, Kristiansand du voyage de référence (2 h 36 de route) était marquée trop longue.
  - Premier jet : `routeLeg` renvoyait l'avertissement mêlé au tronçon, ce qui forçait des déstructurations avec une variable inutilisée que le lint refuse ; la fonction renvoie `{ leg, warning }`.
  - Au parcours à 375 px, la page débordait de 74 px : la barre d'outils du panneau Planifier, antérieure au lot. Elle n'apparaissait pas au premier contrôle parce que l'onglet Carte était affiché, le panneau masqué. Les boutons de l'éditeur faisaient 28 px de haut sur mobile, sous les 44 px de la règle 4 : corrigé avant la fin du parcours.
  - Le parcours modifie le brouillon local du port 43218 (voyage de référence) : la saisie de test du ferry a été remise à ses valeurs d'origine à la fin ; le tronçon Copenhague, Aarhus a été recalculé par OSRM (mêmes 304 km et 4 h 28).
  - Un heredoc Bash trop long a encore échoué (piège connu) : script écrit dans le brouillon de session puis lancé.
- **Décisions** :
  - Pas de nouvelle version de schéma pour `manual.price` : champ optionnel, lu par le normaliseur, et la v5 n'a pas quitté la branche.
  - Le prix d'un billet n'est pas une dépense : le compter deux fois (billet et dépense) serait pire que de ne pas l'additionner ; le lot 7 tranchera.
  - Une estimation s'affiche en indication dans le champ « Durée » (« ≈ 2 h 25 ») et non en valeur, pour que la personne saisisse l'horaire réel au lieu de valider l'estimation sans la lire. Un nombre seul se lit en heures (« 2 », « 1,5 »).
  - Entre deux modes routiers, la route reste la même (un profil par voyage) ; entre deux modes manuels, un horaire déjà saisi reste ; passer d'un mode à l'autre recalcule.
  - Vélo et marche sans tracé plutôt que par un serveur de routage vélo ou piéton : politique d'usage non vérifiée, et le trek est hors de la v2.
- **Chiffres** : 187 tests en 26 fichiers (173 avant) ; une requête OSRM par changement vers un mode routier, aucune pour train, ferry, vélo et marche.

## 2026-11-03 : v2, lot 5 (points d'intérêt OSM à la demande)

- **Intention** : voir campings, aires de camping-car, vidanges et points d'eau partout, plus seulement en Nouvelle-Zélande, et les retrouver hors ligne le long de la route une fois l'itinéraire figé.
- **Demandes** : « Go Lot5 v2 ».
- **Livré** : `src/lib/poi.ts` (catégories, requête Overpass, lecture, grille du cache, couloir, distances au tracé) ; `src/services/overpass.ts` (une requête à la fois, deux secondes d'écart, pause de 30 s après un 429, second serveur sur saturation, plafond `poi`) et `src/services/poi-cache.ts` (IndexedDB `vantravel-poi`) ; `src/store/poi-store.ts` ; calque « Points d'intérêt OSM » sur la carte avec son état ; mise en cache du couloir au figeage et son avancement dans le dialogue « Plan » ; « Sur la route » dans la carte du jour de Voyager ; migration `0005_poi_limits.sql` ; 31 tests de plus.
- **Cassé ou appris** :
  - La politique d'Overpass est plus serrée que les plafonds posés au lot 2 : environ 100 requêtes par jour pour toute une app, pas par compte. Les plafonds `poi` de la migration 0004 (200 par compte, 1 000 au total) la dépassaient ; baissés à 50 et 100.
  - Overpass était saturé presque toute la session (502 « at capacity », réponses en 30 à 60 s). Le second serveur public a mis 4 min 30 pour répondre 502. D'où un délai de 40 s par essai côté client, et aucune requête réussie depuis l'app : l'affichage a été vérifié en plaçant dans le cache une vraie réponse obtenue plus tôt sur Bergen.
  - `around` sur une polyligne, la forme prévue pour le couloir, a rendu 0 résultat deux fois là où un rectangle en rendait 24 sur la même zone. Plutôt que d'insister contre un serveur saturé, le couloir passe par des rectangles le long du tracé, filtrés à 3 km côté client.
  - L'outil de commande a refusé un essai avec un `User-Agent` de navigateur (contournement de contrôle anti-robot) : les essais ont repris avec l'identifiant de l'app, celui du script de données, ce que demande la politique.
  - Un premier essai sans `User-Agent` a reçu un 406 : le serveur refuse l'agent par défaut de curl.
  - Le volet du navigateur caché, la carte ne chargeait pas son style (page en arrière-plan) ; il a fallu l'afficher.
  - Dans les tests, une même `Response` simulée servie deux fois échoue à la seconde lecture du corps : un des tests passait pour de mauvaises raisons avant le passage à `mockImplementation`.
  - Un bord de case pile sur la longitude 10 a fait échouer un test de la grille écrit trop vite.
  - Un heredoc Bash long a encore échoué (piège connu) : script écrit dans le brouillon de session.
- **Décisions** :
  - Grille de cases de 0,2° plutôt qu'un cache par vue : deux vues qui se recouvrent ne redemandent que les cases manquantes, et le couloir remplit le même cache.
  - Zoom 11 minimum et 24 cases au plus par requête : un téléphone en voit 6 à 12 en Scandinavie, un grand écran dézoomé est invité à zoomer.
  - Pas d'annulation des requêtes de la carte : une requête partie va au bout et remplit le cache, les déplacements pendant qu'elle tourne se résument en une relance sur la dernière vue. Annuler aurait gaspillé une unité du plafond et le calcul du serveur.
  - Le couloir n'est pas synchronisé entre appareils : il pèse et se reconstruit en figeant.
  - Second serveur `private.coffee` seulement : les autres instances publiques sont payantes, régionales ou demandent une clé ; VK Maps n'a pas été retenu (données de position envoyées hors UE, à décider par la personne).
- **Chiffres** : 218 tests en 28 fichiers (187 avant) ; 32 requêtes pour figer le voyage de référence (206 cases dans le couloir, 294 couvertes) ; réponse Overpass sur Bergen (0,15° × 0,25°) : 24 points, 6,5 Ko ; environ 14 requêtes Overpass envoyées pendant la session, essais à la main compris.

## 2026-11-04 : v2, fond de carte vectoriel, lieux superposés et cache passif (lot 6, en avance)

- **Intention** : pouvoir cliquer sur les villes, villages et lieux partout, comme sur le catalogue de la Nouvelle-Zélande en v1, avec des lieux superposés (restos, campings, hébergements), sans faire exploser la data mobile en voyage.
- **Demandes** : « qu'est-ce qui est cliquable pour ajouter une étape ? » ; « aucun moyen de cliquer sur des noms de villes, comme en NZ ? » ; prototype ; « B ça me va, mais il faudrait superposer des trucs » ; « la data mobile est à regarder, peut-on figer en avance ? » ; « cache passif » ; « oui, maintenant ».
- **Livré** : prototype jetable sur `proto/fond-vectoriel` (trois fonds au choix par `?fond=`, puis calques superposés), conservé sans fusion ; dans `v2` : `src/lib/base-map.ts` (calques, noms cliquables, style en français, description d'un lieu, plus proche du doigt), `src/services/base-map.ts` (style avec repli raster), carte et panneau « Calques » repliable, sept calques superposés, cache passif dans `vite.config.ts` ; correctif du lot 5 (capture du PDF) ; décisions inscrites au plan. 12 tests de plus.
- **Cassé ou appris** :
  - Le fond raster ne peut pas rendre ses noms cliquables : ce sont des pixels. La question de la personne a mené au changement de fond, plus large que prévu au lot 6.
  - Les tuiles OpenMapTiles portent tous les lieux d'OSM, noms français compris, mais seulement à partir du zoom 14 : rien au zoom 13. Le calque Overpass du lot 5 reste utile pour la vue d'ensemble des campings.
  - La personne n'a pas vu le prototype : en fin de prototype, l'assistant avait remis le dossier sur `v2`, et le serveur qu'elle a lancé servait donc la version sans sélecteur. Il fallait le dire en rendant le prototype.
  - Le prototype attendait `isStyleLoaded()`, qui reste faux tant que des tuiles chargent : calques jamais ajoutés. Puis, volet caché, la carte ne dessinait rien et les requêtes rendaient zéro lieu : l'assistant a d'abord cherché une panne d'OpenFreeMap.
  - `featureFilter` du moteur de style de MapLibre 26 exige un `rootKey` ; le style raster de repli lit `window` : deux ajustements des tests.
  - La capture du PDF du lot 5 ne masquait pas le calque des points d'intérêt : vu en relisant `capture-map.ts` pendant le prototype.
  - Le premier jet du prototype prenait le premier nom trouvé à 14 px, pas le plus proche (Flåm visé, Håreina ouvert). Corrigé et testé.
- **Décisions** :
  - OpenFreeMap Liberty plutôt que Positron (choix de la personne) et plutôt qu'un jeu de villes embarqué (les villages manqueraient) ou Overpass (budget).
  - Calques lus dans les tuiles et non dans Overpass : aucune requête, aucun plafond, aucune dépendance à un serveur saturé.
  - Cache passif plutôt que préchargement : dans les règles d'OpenFreeMap sans leur accord, et le navigateur ne laisse pas fixer le `User-Agent` qu'ils demandent pour un téléchargement hors ligne.
  - L'index de la semaine n'est pas figé : sans savoir combien de temps OpenFreeMap garde les anciennes versions, la carte risquerait des trous.
  - Panneau « Calques » replié d'office sur téléphone : ouvert, il couvrait la carte.
- **Chiffres** : 230 tests en 30 fichiers (218 avant) ; tuiles du zoom 14 compressées, 170 à 210 Ko en ville, 4 à 25 Ko ailleurs ; à Bergen au zoom 15,5, 122 restos et cafés, 13 hébergements, 8 lieux « à voir » dans une vue ; pour le voyage de référence, 9 717 tuiles au zoom 14 sur un couloir de 3 km.
