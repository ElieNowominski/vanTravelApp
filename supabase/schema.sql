-- Schéma complet pour un projet Supabase neuf (équivaut à 0001 à 0004). Sur un projet existant,
-- n'exécuter que les migrations de supabase/migrations/ qui n'y sont pas encore passées.
-- Référence : docs/SUPABASE.md. Toute modification ici s'accompagne d'une migration numérotée.
-- Droits explicites (section en fin de fichier) : une nouvelle table ou fonction reçoit ses grant,
-- aucun droit n'est donné par défaut à anon ni à authenticated.

-- Profils : prénom affiché, créé à l'inscription par trigger.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- Voyages : le contenu de trip.json tel quel (validé côté client par validateTripConfig).
create table if not exists public.trips (
  id text primary key,
  owner_id uuid not null references auth.users (id),
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membres : qui voit le voyage (tous), qui le modifie (owner, editor). Un lecteur (viewer) n'écrit rien.
create table if not exists public.members (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' constraint members_role_check check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Itinéraire : un document par voyage (snapshot sans données de voyage, plus et moins), tranché par updated_at.
create table if not exists public.itineraries (
  trip_id text primary key references public.trips (id) on delete cascade,
  format int not null default 1,
  snapshot jsonb not null,
  marks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null,
  updated_by text not null
);

-- Entités de voyage : une ligne par réservation, document, coche, note d'étape, note ou météo de jour.
-- `scope` : identifiant d'étape ou date AAAA-MM-JJ ; un document de voyage (hors étape, schéma v4 du client)
-- porte le scope réservé 'trip'. Le payload d'un document d'étape porte `scope` ('nuit' ou 'activite'),
-- celui d'une dépense un `stopId` optionnel : aucune colonne à ajouter.
create table if not exists public.travel_items (
  id text not null,
  trip_id text not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('booking', 'document', 'checklist', 'stop_notes', 'day_notes', 'day_weather')),
  scope text not null,
  payload jsonb not null,
  updated_at timestamptz not null,
  updated_by text not null,
  primary key (trip_id, id)
);
create index if not exists travel_items_trip_updated on public.travel_items (trip_id, updated_at);

create table if not exists public.expenses (
  id text not null,
  trip_id text not null references public.trips (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null,
  updated_by text not null,
  primary key (trip_id, id)
);
create index if not exists expenses_trip_updated on public.expenses (trip_id, updated_at);

-- Pierres tombales : une suppression plus récente que l'entité l'efface partout.
create table if not exists public.deletions (
  trip_id text not null references public.trips (id) on delete cascade,
  entity_id text not null,
  deleted_at timestamptz not null,
  primary key (trip_id, entity_id)
);

-- Maintien en éveil : une ligne, mise à jour par le workflow keepalive.
create table if not exists public.heartbeat (id int primary key default 1, beat_at timestamptz not null default now());
insert into public.heartbeat (id) values (1) on conflict do nothing;

-- Plafonds des services à quota (modifiables dans Table Editor) et consommation par compte et par jour (UTC).
-- Ils protègent les services publics gratuits et le quota gratuit de Supabase ; ce n'est pas une barrière :
-- les services sont appelés depuis le navigateur. Une vraie barrière passerait par un relais (Edge Function).
create table if not exists public.usage_limits (
  service text primary key,
  daily_per_user int not null check (daily_per_user >= 0),
  -- Tous comptes confondus ; null : pas de plafond global.
  daily_total int check (daily_total >= 0),
  note text not null default ''
);
insert into public.usage_limits (service, daily_per_user, daily_total, note) values
  ('geocode', 500, 2000, 'Recherche de lieux (Photon, lot 3)'),
  ('poi', 200, 1000, 'Points d''intérêt (Overpass, lot 5)'),
  ('rls-check', 3, null, 'Service fictif de scripts/rls-check.mjs')
on conflict (service) do nothing;

create table if not exists public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  service text not null references public.usage_limits (service) on delete cascade,
  day date not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, service, day)
);
create index if not exists usage_service_day on public.usage (service, day);


-- Appartenance : utilisée par toutes les policies.
create or replace function public.is_member(p_trip text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.trip_id = p_trip and m.user_id = auth.uid());
$$;

-- Écriture : propriétaire et éditeurs. Utilisée par les policies d'écriture, comme is_member pour la lecture.
create or replace function public.can_write(p_trip text) returns boolean
language sql stable security definer set search_path = public as $
  select exists (
    select 1 from public.members m where m.trip_id = p_trip and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$;

-- Upserts « si plus récent » : le serveur tranche par entité. security invoker : les policies s'appliquent.
create or replace function public.upsert_travel_items(items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.travel_items (id, trip_id, kind, scope, payload, updated_at, updated_by)
  select i->>'id', i->>'trip_id', i->>'kind', i->>'scope', i->'payload', (i->>'updated_at')::timestamptz, coalesce(i->>'updated_by', '')
  from jsonb_array_elements(items) i
  on conflict (trip_id, id) do update
    set payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by,
        kind = excluded.kind, scope = excluded.scope
    where public.travel_items.updated_at < excluded.updated_at;
end $$;

create or replace function public.upsert_expenses(items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.expenses (id, trip_id, payload, updated_at, updated_by)
  select i->>'id', i->>'trip_id', i->'payload', (i->>'updated_at')::timestamptz, coalesce(i->>'updated_by', '')
  from jsonb_array_elements(items) i
  on conflict (trip_id, id) do update
    set payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    where public.expenses.updated_at < excluded.updated_at;
end $$;

create or replace function public.upsert_deletions(items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.deletions (trip_id, entity_id, deleted_at)
  select i->>'trip_id', i->>'entity_id', (i->>'deleted_at')::timestamptz
  from jsonb_array_elements(items) i
  on conflict (trip_id, entity_id) do update
    set deleted_at = excluded.deleted_at
    where public.deletions.deleted_at < excluded.deleted_at;
end $$;

-- Créer un voyage : la ligne trips et la ligne members du propriétaire, ou rien.
create or replace function public.create_trip(p_config jsonb) returns text
language plpgsql security invoker set search_path = public as $$
declare
  v_id text := p_config->>'id';
  v_name text := coalesce(nullif(p_config->>'name', ''), p_config->>'id');
begin
  if v_id is null or v_id = '' then
    raise exception 'config.id manquant';
  end if;
  insert into public.trips (id, owner_id, name, config) values (v_id, auth.uid(), v_name, p_config);
  insert into public.members (trip_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- Ajouter un membre par e-mail (le propriétaire seulement), comme éditeur ou lecteur. Une personne déjà
-- membre prend le rôle demandé ; le propriétaire garde le sien.
create or replace function public.add_member_by_email(p_trip text, p_email text, p_role text default 'editor') returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not exists (select 1 from public.trips t where t.id = p_trip and t.owner_id = auth.uid()) then
    raise exception 'not owner';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then raise exception 'unknown user'; end if;
  insert into public.members (trip_id, user_id, role) values (p_trip, v_user, p_role)
  on conflict (trip_id, user_id) do update set role = excluded.role where public.members.role <> 'owner';
end $$;

-- Changer le rôle d'un membre (le propriétaire seulement, jamais le sien, jamais vers « owner »).
create or replace function public.set_member_role(p_trip text, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.trips t where t.id = p_trip and t.owner_id = auth.uid()) then
    raise exception 'not owner';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  update public.members set role = p_role where trip_id = p_trip and user_id = p_user and role <> 'owner';
  if not found then raise exception 'unknown member'; end if;
end $$;

-- Demande p_units unités du service pour la journée (UTC). Renvoie
--   { allowed: true, used, limit, remaining }  ou  { allowed: false, scope: 'user' | 'total', used, limit, resetAt }.
-- Le compteur ne bouge que si la demande passe. Le plafond global se lit avant l'écriture : deux demandes
-- simultanées peuvent le dépasser de quelques unités, le plafond par compte est exact.
create or replace function public.consume_quota(p_service text, p_units int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_reset timestamptz := ((now() at time zone 'utc')::date + 1)::timestamp at time zone 'utc';
  v_limit public.usage_limits;
  v_used int;
  v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_units is null or p_units < 1 then raise exception 'invalid units'; end if;
  select * into v_limit from public.usage_limits where service = p_service;
  if not found then raise exception 'unknown service'; end if;

  if v_limit.daily_total is not null then
    select coalesce(sum(u.count), 0) into v_used from public.usage u where u.service = p_service and u.day = v_day;
    if v_used + p_units > v_limit.daily_total then
      return jsonb_build_object('allowed', false, 'scope', 'total', 'used', v_used, 'limit', v_limit.daily_total, 'resetAt', v_reset);
    end if;
  end if;

  select coalesce((select u.count from public.usage u where u.user_id = v_user and u.service = p_service and u.day = v_day), 0) into v_used;
  if v_used + p_units > v_limit.daily_per_user then
    return jsonb_build_object('allowed', false, 'scope', 'user', 'used', v_used, 'limit', v_limit.daily_per_user, 'resetAt', v_reset);
  end if;

  insert into public.usage (user_id, service, day, count) values (v_user, p_service, v_day, p_units)
  on conflict (user_id, service, day) do update set count = public.usage.count + excluded.count
    where public.usage.count + excluded.count <= v_limit.daily_per_user
  returning count into v_count;
  if v_count is null then
    -- Une demande simultanée a pris les dernières unités entre la lecture et l'écriture.
    return jsonb_build_object('allowed', false, 'scope', 'user', 'used', v_used, 'limit', v_limit.daily_per_user, 'resetAt', v_reset);
  end if;
  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit.daily_per_user, 'remaining', v_limit.daily_per_user - v_count);
end $$;

-- Profil à l'inscription.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Maintien en éveil, appelable avec la clé publiable.
create or replace function public.beat() returns void
language sql security definer set search_path = public as $$
  update public.heartbeat set beat_at = now() where id = 1;
$$;

-- RLS sur tout.
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.members enable row level security;
alter table public.itineraries enable row level security;
alter table public.travel_items enable row level security;
alter table public.expenses enable row level security;
alter table public.deletions enable row level security;
alter table public.heartbeat enable row level security;
alter table public.usage_limits enable row level security;
alter table public.usage enable row level security;

create policy "profil : soi-même" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "profils des co-membres en lecture" on public.profiles for select
  using (exists (select 1 from public.members a join public.members b on a.trip_id = b.trip_id where a.user_id = auth.uid() and b.user_id = profiles.id));

-- Le propriétaire lit son voyage même sans ligne members : sinon create_trip (qui insère trips puis
-- members, dont la policy relit trips) échoue en boucle (migration 0003).
create policy "voyage : membres ou propriétaire en lecture" on public.trips for select
  using (public.is_member(id) or owner_id = auth.uid());
create policy "voyage : création par son propriétaire" on public.trips for insert with check (owner_id = auth.uid());
create policy "voyage : modification par le propriétaire" on public.trips for update using (owner_id = auth.uid());
create policy "voyage : suppression par le propriétaire" on public.trips for delete using (owner_id = auth.uid());

create policy "membres : visibles entre membres" on public.members for select using (public.is_member(trip_id));
create policy "membres : le propriétaire s'ajoute" on public.members for insert
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
-- La ligne du propriétaire ne se retire pas ; chacun peut se retirer d'un voyage qui n'est pas le sien.
create policy "membres : retrait par le propriétaire" on public.members for delete
  using (role <> 'owner' and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "membres : un membre se retire" on public.members for delete using (user_id = auth.uid() and role <> 'owner');
-- Pas de policy d'update sur members : le rôle change par set_member_role.

-- Lecture par tous les membres, écriture par le propriétaire et les éditeurs.
create policy "itinéraire : lecture par les membres" on public.itineraries for select using (public.is_member(trip_id));
create policy "itinéraire : création par les éditeurs" on public.itineraries for insert with check (public.can_write(trip_id));
create policy "itinéraire : modification par les éditeurs" on public.itineraries for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "itinéraire : suppression par les éditeurs" on public.itineraries for delete using (public.can_write(trip_id));
create policy "entités : lecture par les membres" on public.travel_items for select using (public.is_member(trip_id));
create policy "entités : création par les éditeurs" on public.travel_items for insert with check (public.can_write(trip_id));
create policy "entités : modification par les éditeurs" on public.travel_items for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "entités : suppression par les éditeurs" on public.travel_items for delete using (public.can_write(trip_id));
create policy "dépenses : lecture par les membres" on public.expenses for select using (public.is_member(trip_id));
create policy "dépenses : création par les éditeurs" on public.expenses for insert with check (public.can_write(trip_id));
create policy "dépenses : modification par les éditeurs" on public.expenses for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "dépenses : suppression par les éditeurs" on public.expenses for delete using (public.can_write(trip_id));
create policy "suppressions : lecture par les membres" on public.deletions for select using (public.is_member(trip_id));
create policy "suppressions : création par les éditeurs" on public.deletions for insert with check (public.can_write(trip_id));
create policy "suppressions : modification par les éditeurs" on public.deletions for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "suppressions : suppression par les éditeurs" on public.deletions for delete using (public.can_write(trip_id));
-- heartbeat : aucune policy, seule la fonction beat() (security definer) y touche.
create policy "plafonds : lecture par les comptes" on public.usage_limits for select to authenticated using (true);
create policy "consommation : la sienne en lecture" on public.usage for select using (user_id = auth.uid());
-- Écriture dans usage : consume_quota seulement. Dans usage_limits : le tableau de bord.

-- Storage : bucket privé "documents", chemin <trip_id>/<doc_id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit) values ('documents', 'documents', false, 2097152) on conflict do nothing;
create policy "documents : lecture par les membres" on storage.objects for select
  using (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
create policy "documents : écriture par les éditeurs" on storage.objects for insert
  with check (bucket_id = 'documents' and public.can_write(split_part(name, '/', 1)));
create policy "documents : suppression par les éditeurs" on storage.objects for delete
  using (bucket_id = 'documents' and public.can_write(split_part(name, '/', 1)));

-- Droits explicites.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
-- members : pas d'update direct, le rôle change par set_member_role.
grant select, insert, delete on public.members to authenticated;
grant select, insert, update, delete on public.itineraries, public.travel_items, public.expenses, public.deletions to authenticated;
grant select on public.usage_limits, public.usage to authenticated;
-- heartbeat : aucun droit, seule beat() y touche.

-- is_member et can_write servent aux policies, évaluées avec les droits de la personne connectée.
grant execute on function
  public.is_member(text),
  public.can_write(text),
  public.upsert_travel_items(jsonb),
  public.upsert_expenses(jsonb),
  public.upsert_deletions(jsonb),
  public.create_trip(jsonb),
  public.add_member_by_email(text, text, text),
  public.set_member_role(text, uuid, text),
  public.consume_quota(text, int)
to authenticated;
grant execute on function public.beat() to anon, authenticated;
-- Le trigger d'inscription : PostgreSQL ne revérifie pas le droit au déclenchement, accordé quand même
-- au rôle qui écrit dans auth.users, par prudence.
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Objets créés ensuite par postgres (SQL Editor) : aucun droit implicite.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
