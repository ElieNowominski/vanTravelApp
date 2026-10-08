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
