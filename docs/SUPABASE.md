# Phase 7 : Supabase à la place du dépôt GitHub privé

Plan d'intégration, écrit le 8 octobre 2026, à lire après `CLAUDE.md`, `docs/ARCHITECTURE.md` et `docs/PLAN.md`. Il sert d'entrée à une nouvelle session de travail. Les faits sur Supabase (clés, pause, quotas) ont été vérifiés le 7 octobre 2026 sur les pages officielles ; les revérifier s'ils changent la décision.

## 0. État au 8 octobre 2026

Lots A à G livrés sur la branche `supabase` (voir `docs/PLAN.md`, phase 7, et le journal). Écarts au plan d'origine, avec la raison :

- clés primaires composées (`trip_id`, `id`) sur `travel_items` et `expenses` : `<date>:notes` existe dans tous les voyages, un identifiant d'entité n'est unique que dans son voyage ; d'où la migration `supabase/migrations/0002_functions_and_keys.sql` à exécuter sur le projet existant (elle ajoute aussi `upsert_expenses`, `upsert_deletions`, `create_trip`, le trigger des profils et les policies de suppression) ;
- pas de lecture incrémentale `since` : tout est relu à chaque passe et comparé localement (`newerRows`), plus simple et exact pour quelques centaines de lignes ;
- script de migration sans clé secrète : connexion e-mail et mot de passe du propriétaire, mêmes règles RLS que l'app ; ou, plus simple, « Mettre « nom » sur le compte » depuis le PC qui a tout en local ;
- `currentAuthor()` garde le prénom du profil local (c'est lui qui est demandé à l'écran) et prend le prénom du compte en repli, prérempli à la première connexion ;
- un code d'accès que le serveur détient en clair est redaté quand une phrase est posée, sinon le serveur (qui n'accepte qu'une ligne plus récente) garderait le clair.

Reste à faire par la personne : section « Mise en service (phase 7) » de `docs/PLAN.md`. Le schéma de référence est désormais `supabase/schema.sql` ; la section 3 ci-dessous est le schéma initial tel qu'exécuté le 8 octobre.

## 1. Pourquoi, et ce qui ne change pas

**Motif.** Les photos et PDF du voyage ne doivent pas être stockés chez GitHub, même dans un dépôt privé, et l'app doit pouvoir accueillir d'autres personnes avec des comptes (Google ou e-mail et mot de passe). La synchro actuelle par dépôt GitHub fonctionne (corrigée le 7 octobre), mais elle n'offre ni l'un ni l'autre.

**Ce qui reste tel quel.** L'application (Vite, React 19, TypeScript, Tailwind, shadcn, MapLibre, Zustand, Vitest, PWA), l'hébergement GitHub Pages, le store IndexedDB comme source de vérité locale, les règles de fusion de `src/lib/sync-model.ts` (dernière écriture gagne par entité, pierres tombales, notes horodatées), le chiffrement optionnel des codes d'accès (`src/lib/secure.ts`), la sauvegarde export et import, les cartes et le routage.

**Ce qui part.** `src/services/github-repo.ts`, la partie GitHub de `src/services/sync.ts` et de `src/store/sync-store.ts` (compte, dépôt, token), le plugin Vite `/__private/` et `src/services/trip-source.ts`, la variable `PRIVATE_DATA_DIR`, le dépôt de données `vanTravel` (archivé une fois les données migrées).

**Ce qui arrive.** Un client Supabase (`@supabase/supabase-js`), un écran « Compte » (connexion, voyage courant, état de la synchro), un adaptateur de synchro vers Postgres et Storage, un schéma SQL avec règles d'accès par ligne, un script de migration des données du dépôt privé, un cron de maintien en éveil.

**Hébergement.** GitHub Pages reste. Il n'y a aucun secret dans le front : la clé publiable de Supabase est faite pour le navigateur (« Safe to expose online: web page, mobile or desktop app, GitHub actions, CLIs, source code »), la protection vient des règles par ligne. Cloudflare Pages ne devient utile que si le dépôt passe en privé ou s'il faut masquer l'app derrière une connexion avant même l'écran de compte.

## 2. Architecture cible

```
Téléphone / PC (PWA)                       Supabase (projet, région UE)
┌──────────────────────────┐               ┌──────────────────────────────┐
│ IndexedDB (brouillon,    │  supabase-js  │ Auth : Google, e-mail + mdp  │
│ bibliothèque, documents) │ <-----------> │ Postgres : trips, members,   │
│ sync-model.ts (fusion)   │   HTTPS       │   itineraries, travel_items, │
│ services/supabase-sync.ts│               │   expenses, deletions,       │
│ store/account-store.ts   │               │   heartbeat + RLS            │
└──────────────────────────┘               │ Storage : bucket documents   │
                                           └──────────────────────────────┘
GitHub Pages : site statique, clé publiable injectée au build (variables du dépôt).
GitHub Actions : build et déploiement ; cron de maintien en éveil tous les deux jours.
```

Règles d'or :

1. **Hors ligne d'abord, toujours.** L'app s'ouvre sans réseau avec la session en cache et les données IndexedDB. Aucune action du mode Voyager n'attend le serveur. La synchro reste une passe idempotente déclenchée comme aujourd'hui (modification, retour du réseau, premier plan, intervalle, ouverture).
2. **Une ligne par entité, l'itinéraire en un seul document.** Réservations, documents (métadonnées), coches, notes d'étape, notes et météo de jour, dépenses : une ligne chacune, avec `updated_at` et `updated_by` venant du client (comme aujourd'hui). L'itinéraire (jours, étapes, tronçons, pins, figeage, plus et moins) reste un JSON compact dans une ligne, tranché par `updated_at` comme aujourd'hui (`decideItinerary`, `hasItinerary`, `resolveItineraryDecision`).
3. **Le serveur tranche les conflits par entité.** Un `upsert` ne remplace une ligne que si l'`updated_at` reçu est plus récent (fonction SQL `upsert_if_newer`). Le client garde sa fusion locale pour appliquer ce qu'il reçoit.
4. **Les règles d'accès vivent dans Postgres.** Toute table et le bucket sont protégés par l'appartenance au voyage (`members`). Aucune donnée n'est lisible sans compte. Les règles sont testées par un script avec deux comptes avant d'ouvrir à des tiers.
5. **Pas de clé secrète dans le front ni dans le dépôt.** La clé secrète ne sert qu'au script de migration, lancé en local, lue dans une variable d'environnement.

## 3. Schéma SQL

À exécuter dans l'éditeur SQL du tableau de bord, en une fois, puis conservé dans `supabase/schema.sql` du dépôt (le dossier `supabase/` est nouveau ; pas de CLI Supabase requise pour ce plan).

```sql
-- Profils : prénom affiché, alimenté à l'inscription (metadata Google ou saisie).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- Voyages : le contenu de trip.json tel quel (validé côté client par validateTripConfig).
create table public.trips (
  id text primary key,                 -- ex. nz-south-2027
  owner_id uuid not null references auth.users (id),
  name text not null,
  config jsonb not null,               -- TripConfig
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membres : qui voit et modifie un voyage.
create table public.members (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Itinéraire : un document par voyage (snapshot sans données de voyage, + marks), tranché par updated_at.
create table public.itineraries (
  trip_id text primary key references public.trips (id) on delete cascade,
  format int not null default 1,
  snapshot jsonb not null,
  marks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null,
  updated_by text not null
);

-- Entités de voyage : une ligne par réservation, document, coche, note d'étape, note ou météo de jour.
create table public.travel_items (
  id text primary key,                 -- id de l'entité (ou "<stopId>:notes", "<date>:notes", "<date>:weather")
  trip_id text not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('booking', 'document', 'checklist', 'stop_notes', 'day_notes', 'day_weather')),
  scope text not null,                 -- stopId ou date AAAA-MM-JJ
  payload jsonb not null,              -- l'entité telle que dans types.ts (accessCode chiffré si phrase)
  updated_at timestamptz not null,
  updated_by text not null
);
create index on public.travel_items (trip_id, updated_at);

create table public.expenses (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  payload jsonb not null,              -- Expense
  updated_at timestamptz not null,
  updated_by text not null
);
create index on public.expenses (trip_id, updated_at);

-- Pierres tombales : une suppression plus récente que l'entité l'efface partout.
create table public.deletions (
  trip_id text not null references public.trips (id) on delete cascade,
  entity_id text not null,
  deleted_at timestamptz not null,
  primary key (trip_id, entity_id)
);

-- Maintien en éveil : une ligne, mise à jour par le cron.
create table public.heartbeat (id int primary key default 1, beat_at timestamptz not null default now());
insert into public.heartbeat (id) values (1);

-- Appartenance : utilisée par toutes les règles.
create or replace function public.is_member(p_trip text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.trip_id = p_trip and m.user_id = auth.uid());
$$;

-- Upsert « si plus récent » : le serveur tranche par entité.
create or replace function public.upsert_travel_items(items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.travel_items (id, trip_id, kind, scope, payload, updated_at, updated_by)
  select i->>'id', i->>'trip_id', i->>'kind', i->>'scope', i->'payload', (i->>'updated_at')::timestamptz, i->>'updated_by'
  from jsonb_array_elements(items) i
  on conflict (id) do update
    set payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by, kind = excluded.kind, scope = excluded.scope
    where public.travel_items.updated_at < excluded.updated_at;
end $$;
-- Même fonction pour expenses (upsert_expenses) et deletions (upsert_deletions, garde le deleted_at le plus récent).

-- Ajouter un membre par e-mail (le propriétaire seulement).
create or replace function public.add_member_by_email(p_trip text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not exists (select 1 from public.trips t where t.id = p_trip and t.owner_id = auth.uid()) then
    raise exception 'not owner';
  end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then raise exception 'unknown user'; end if;
  insert into public.members (trip_id, user_id) values (p_trip, v_user) on conflict do nothing;
end $$;

-- Maintien en éveil, appelable avec la clé publiable.
create or replace function public.beat() returns void
language sql security definer set search_path = public as $$
  update public.heartbeat set beat_at = now() where id = 1;
$$;
grant execute on function public.beat() to anon;

-- RLS sur tout.
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.members enable row level security;
alter table public.itineraries enable row level security;
alter table public.travel_items enable row level security;
alter table public.expenses enable row level security;
alter table public.deletions enable row level security;
alter table public.heartbeat enable row level security;

create policy "profil : soi-même" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "profils des co-membres en lecture" on public.profiles for select
  using (exists (select 1 from public.members a join public.members b on a.trip_id = b.trip_id where a.user_id = auth.uid() and b.user_id = profiles.id));

create policy "voyage : membres en lecture" on public.trips for select using (public.is_member(id));
create policy "voyage : création par son propriétaire" on public.trips for insert with check (owner_id = auth.uid());
create policy "voyage : modification par le propriétaire" on public.trips for update using (owner_id = auth.uid());

create policy "membres : visibles entre membres" on public.members for select using (public.is_member(trip_id));
create policy "membres : le propriétaire s'ajoute" on public.members for insert
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));

create policy "itinéraire : membres" on public.itineraries for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy "entités : membres" on public.travel_items for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy "dépenses : membres" on public.expenses for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy "suppressions : membres" on public.deletions for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
-- heartbeat : aucune policy, seule la fonction beat() (security definer) y touche.

-- Storage : bucket privé "documents", chemin <trip_id>/<doc_id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit) values ('documents', 'documents', false, 2097152);
create policy "documents : lecture par les membres" on storage.objects for select
  using (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
create policy "documents : écriture par les membres" on storage.objects for insert
  with check (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
create policy "documents : suppression par les membres" on storage.objects for delete
  using (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
```

Points d'attention : `members.insert` n'autorise que le propriétaire à s'ajouter lui-même, les autres passent par `add_member_by_email` ; la création d'un voyage doit insérer la ligne `members` du propriétaire dans la foulée (deux requêtes, ou une fonction `create_trip`). La session de travail qui implémente ajoutera `upsert_expenses` et `upsert_deletions` sur le modèle de `upsert_travel_items`.

## 4. Étapes à faire par la personne (tableau de bord Supabase, Google, GitHub)

Dans l'ordre. Noter ce que chaque étape produit, la session de code en aura besoin.

1. **Créer le projet Supabase** (plan gratuit, région UE, par exemple Paris ou Francfort), mot de passe de base conservé dans un gestionnaire de mots de passe. Produit : l'URL du projet (`https://<ref>.supabase.co`) et la **clé publiable** (Settings, API Keys). Ne jamais copier la clé secrète ailleurs que dans une variable d'environnement locale.
2. **Exécuter le schéma** (section 3) dans SQL Editor. Vérifier dans Table Editor que les huit tables existent et que RLS est actif sur chacune (cadenas).
3. **Authentification e-mail et mot de passe** : Authentication, Providers, Email : activé ; décider si la confirmation d'e-mail est exigée (recommandé : oui, sauf pendant les tests).
4. **Authentification Google** :
   - Google Cloud Console : créer un projet, écran de consentement OAuth (type externe, utilisateurs test : vos deux adresses tant que l'app n'est pas publiée), puis un identifiant OAuth « application Web ». Origines JavaScript autorisées : `https://elienowominski.github.io` et `http://127.0.0.1:43217`. URI de redirection autorisée : l'URL de callback affichée par Supabase dans Authentication, Providers, Google (de la forme `https://<ref>.supabase.co/auth/v1/callback`, à copier depuis le tableau de bord).
   - Supabase : Authentication, Providers, Google : activé, coller Client ID et Client Secret.
   - Supabase : Authentication, URL Configuration : Site URL `https://elienowominski.github.io/vanTravelApp/`, Redirect URLs : la même plus `http://127.0.0.1:43217/`.
5. **Bucket Storage** : créé par le schéma (`documents`, privé, 2 Mo par fichier). Vérifier dans Storage qu'il apparaît et que les trois policies sont listées.
6. **Variables de build GitHub** : dans le dépôt `vanTravelApp`, Settings, Secrets and variables, Actions, onglet Variables : `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` (variables, pas secrets : elles ne sont pas confidentielles, et les variables restent lisibles dans les logs, ce qui aide au diagnostic).
7. **Maintien en éveil** : rien à faire côté Supabase, le workflow `keepalive.yml` (section 5, lot F) appelle `beat()` avec la clé publiable. Option pour février : passer le projet en Pro (25 $) le mois du voyage, sans pause et sauvegardes sept jours, puis revenir au gratuit.
8. **Comptes** : chacune des deux personnes crée son compte (Google ou e-mail) depuis l'app une fois le lot B déployé. Le propriétaire ajoute l'autre par e-mail depuis l'écran Compte (lot C).

## 5. Étapes de code, par lots livrables

Travail sur une branche `supabase` (demande explicite d'écart à la règle 10 : `main` continue de déployer la version GitHub jusqu'à validation à deux téléphones). Chaque lot : lint, typecheck, tests, puis entrée de journal. Les estimations sont des journées de travail avec l'assistant.

### Lot A : client et session (0,5 j)

- `npm i @supabase/supabase-js`. `src/services/supabase.ts` : `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)` ; sans variables, l'app démarre en mode « local seulement » (bandeau), rien ne casse. `.env.example` documente les deux variables ; `.env.local` ignoré par git.
- `src/store/account-store.ts` : session (`onAuthStateChange`), profil (`display_name`), voyage courant (`tripId`), état de synchro (repris de `sync-store.ts` : `status`, `lastSyncAt`, `pending`, `itineraryChangedAt`, `lastReport`, et désormais `lastSeen` par table au lieu des `shas`). Persisté dans IndexedDB comme aujourd'hui. `currentAuthor()` lit `display_name`, puis le prénom local en repli.
- `src/components/account/account-dialog.tsx` remplace `sync-dialog.tsx` : connexion Google, connexion ou inscription e-mail, déconnexion, prénom affiché, liste des voyages où l'on est membre, bouton « Utiliser », état de synchro, boutons « Synchroniser », « Recevoir l'itinéraire », « Envoyer mon itinéraire » (logique conservée), phrase de chiffrement conservée.
- Critère : connexion Google et e-mail fonctionnent en dev et sur Pages ; l'app s'ouvre hors ligne avec la session en cache ; `npm test` vert.

### Lot B : adaptateur de synchro (1 j)

- `src/services/supabase-sync.ts` remplace les appels GitHub de `sync.ts`. Interface interne, pour garder `sync-model.ts` intact :
  - `fetchTrip(tripId)` : ligne `trips` (config validée par `validateTripConfig`).
  - `fetchItinerary(tripId)` / `putItinerary(tripId, doc, expectedUpdatedAt)` : `update ... eq('updated_at', expected)` pour le verrou optimiste (équivalent du `sha`), 0 ligne modifiée = conflit, on relit et on recommence (trois tentatives comme aujourd'hui).
  - `fetchTravel(tripId, since)` / `pushTravel(items)` via `upsert_travel_items` ; idem dépenses et suppressions. `since` = dernier `updated_at` vu, pour ne pas tout retélécharger à chaque passe.
  - La transformation entre `TravelDoc` / `ExpensesDoc` (format fichier actuel) et lignes se fait dans `src/lib/sync-rows.ts`, pur et testé : `travelDocToRows`, `rowsToTravelDoc`, `expensesToRows`, `rowsToExpenses`, `tombstonesToRows`.
- `sync.ts` garde `pass()` avec les mêmes étapes et les mêmes décisions d'itinéraire, le planificateur, `previewItinerarySync` (lecture de `updated_at` seul au lieu du `sha`).
- Chiffrement : `sealTravel` et `unlockTravel` conservés ; avec une phrase, `accessCode` part chiffré dans `payload`.
- Critère : deux navigateurs (profils Chrome distincts, deux comptes) voient les réservations et dépenses de l'autre après synchro ; une suppression ne ressuscite pas ; conflit d'itinéraire tranché comme avant ; tests de `sync-rows.ts`.

### Lot C : voyages et membres (0,5 j)

- Création d'un voyage depuis l'app (écran de démarrage existant) : insertion `trips` + `members` (fonction SQL `create_trip` ou deux requêtes). Import d'un `trip.json` existant par le même chemin.
- Écran Compte : « Ajouter une personne par e-mail » (`add_member_by_email`), liste des membres (via `profiles`).
- `useTripBoot` : sans voyage chargé et session présente, liste des voyages membres, chargement du premier (ou du `tripId` mémorisé) ; suppression de `loadDevTrip` et du plugin `/__private/`.
- Critère : la compagne, connectée sur son téléphone, voit le voyage après ajout par e-mail, sans manipulation de fichier.

### Lot D : documents (0,5 j)

- `syncDocuments` : `storage.from('documents').upload(`${tripId}/${docId}.${ext}`, blob, { upsert: false })` pour le local absent à distance (erreur « existe déjà » = l'autre appareil l'a envoyé, on note), `download` pour le distant absent en local. `TripDocument.path` garde ce chemin.
- Suppression : pierre tombale comme aujourd'hui, plus `storage.remove` au passage (non bloquant).
- Critère : une photo prise sur un téléphone s'ouvre sur l'autre ; une suppression la retire partout ; hors ligne, elle reste visible localement et part au retour du réseau.

### Lot E : migration des données (0,25 j)

- `scripts/migrate-from-private-repo.mjs` (lancé en local, lit `PRIVATE_DATA_DIR`, utilise la clé secrète lue dans `SUPABASE_SECRET_KEY`, jamais commitée) : pour chaque voyage de `trips/index.json` : `trips` (config = `trip.json`, owner = l'uuid du compte propriétaire passé en argument), `members` (owner), `itineraries` (= `itinerary.json`), `travel_items` et `expenses` (= `travel.json`, `expenses.json`, éclatés en lignes), `deletions` (= tombstones), documents du dossier `docs/` vers le bucket.
- Sur chaque appareil, après déploiement : se connecter, « Utiliser » le voyage, « Recevoir l'itinéraire du dépôt ». Les documents déjà dans IndexedDB restent et sont envoyés si absents à distance.
- Critère : les deux téléphones et le PC montrent le même circuit `#FINAL`, les mêmes réservations et dépenses.

### Lot F : déploiement, veille, nettoyage (0,25 j)

- `deploy.yml` : `env` du build avec `VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}` et la clé publiable.
- `.github/workflows/keepalive.yml` : `schedule: "17 6 */2 * *"` (tous les deux jours, hors début d'heure) + `workflow_dispatch`, un `curl -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/beat" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`. Rappel : GitHub désactive les workflows planifiés après 60 jours sans activité du dépôt.
- Suppression de `github-repo.ts` et son test, du plugin Vite, de `trip-source.ts`, de `PRIVATE_DATA_DIR`, des champs GitHub du store et du dialogue. `CLAUDE.md` : règle 1 réécrite (les données vivent dans Supabase ; rien de personnel dans le dépôt, qui est public), règle 2 réécrite (« pas de serveur à nous : Supabase est le backend, aucune clé secrète dans le front »), section « Synchro » mise à jour. `ARCHITECTURE.md` : section Synchronisation réécrite, décision Supabase datée avec les alternatives écartées (Firebase, Cloudflare, PocketBase, chiffrement sur GitHub). `PLAN.md` : phase 7 cochée. `README.md` : « Où sont les données » et « Lancer en local » (variables).
- Dépôt `vanTravel` : archivé sur GitHub (lecture seule) après validation ; le dossier `trips/` y reste comme sauvegarde historique.

### Lot G : contrôle des règles d'accès (0,25 j, avant d'ouvrir à des tiers)

- `scripts/rls-check.mjs` : avec deux comptes de test (e-mail et mot de passe, créés pour l'occasion), vérifie que le compte B ne lit ni ne modifie aucune ligne ni aucun fichier du voyage de A, table par table et bucket compris ; qu'un membre ajouté voit tout ; qu'un non-propriétaire ne peut pas ajouter de membre. Lancé en local contre le projet ; à relancer après tout changement de schéma.
- Critère : le script passe ; son résultat est noté dans le journal.

### Fusion dans `main`

Quand les lots A à F sont validés à deux téléphones pendant une semaine réelle (réservation saisie sur l'un, visible sur l'autre ; réseau coupé puis rétabli ; photo ; dépense simultanée) : fusion dans `main`, déploiement, réinstallation inutile (même origine GitHub Pages), archivage de `vanTravel`. Objectif : fin novembre 2026, pour garder décembre et janvier comme marge avant le départ du 7 février 2027.

## 6. Risques et parades

| Risque | Parade |
| --- | --- |
| Règle d'accès oubliée ou fausse : un compte voit un autre voyage | Lot G avant tout tiers ; RLS activé sur chaque table dès la création ; `is_member` partout |
| Projet gratuit mis en pause (une semaine sans requête) | Workflow `keepalive.yml` ; Pro le mois du voyage ; les deux courriels d'avertissement de Supabase arrivent au propriétaire |
| Workflow planifié désactivé par GitHub (60 jours sans activité du dépôt) | Le dépôt bouge souvent ; sinon `workflow_dispatch` manuel après un long silence |
| Clé secrète qui fuit | Elle ne sert qu'au script de migration, lue dans l'environnement ; `.env.local` ignoré ; contrôle « aucune donnée perso » étendu à « aucune clé secrète » |
| Session expirée hors ligne pendant le voyage | supabase-js rafraîchit le jeton à la reconnexion ; l'app ne bloque jamais sur l'état de session pour afficher les données locales |
| Quotas gratuits (500 Mo de base, 1 Go de fichiers, 5 Go de sortie) | Itinéraire compact (1,3 Mo), photos à 300 Ko, PDF à 2 Mo : marge large pour deux voyages ; surveiller dans Settings, Usage |
| Deux appareils modifient l'itinéraire en même temps | Même règle qu'aujourd'hui (dernière modification gagne, Recevoir et Envoyer pour forcer) ; verrou optimiste sur `updated_at` |
| Dépendance à Supabase | Postgres standard, export `pg_dump` possible ; schéma et script de migration versionnés dans le dépôt |

## 7. Prompt de reprise pour la nouvelle session

> Lis `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md` puis `docs/SUPABASE.md`. Nous passons la synchronisation du dépôt GitHub privé à Supabase selon ce plan. Crée la branche `supabase` (écart explicite à la règle 10, `main` continue de déployer la version actuelle). Commence par le lot A. Les étapes de la section 4 sont faites par moi ; je te donnerai l'URL du projet et la clé publiable, jamais la clé secrète. À chaque lot : lint, typecheck, tests, entrée dans `docs/JOURNAL.md`. Le dépôt privé est dans `../vanTravel` (sur ce poste : `C:\Users\IPPON\Documents\Perso\VanTravel\vanTravel`) et sert à la migration du lot E.
