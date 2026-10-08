-- Schéma complet pour un projet Supabase neuf (équivaut à 0001 + 0002). Sur le projet existant,
-- n'exécuter que supabase/migrations/0002_functions_and_keys.sql.
-- Référence : docs/SUPABASE.md. Toute modification ici s'accompagne d'une migration numérotée.

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

-- Membres : qui voit et modifie un voyage.
create table if not exists public.members (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
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

-- Appartenance : utilisée par toutes les policies.
create or replace function public.is_member(p_trip text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.trip_id = p_trip and m.user_id = auth.uid());
$$;

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
create policy "voyage : suppression par le propriétaire" on public.trips for delete using (owner_id = auth.uid());

create policy "membres : visibles entre membres" on public.members for select using (public.is_member(trip_id));
create policy "membres : le propriétaire s'ajoute" on public.members for insert
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "membres : retrait par le propriétaire" on public.members for delete
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));

create policy "itinéraire : membres" on public.itineraries for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy "entités : membres" on public.travel_items for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy "dépenses : membres" on public.expenses for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy "suppressions : membres" on public.deletions for all using (public.is_member(trip_id)) with check (public.is_member(trip_id));
-- heartbeat : aucune policy, seule la fonction beat() (security definer) y touche.

-- Storage : bucket privé "documents", chemin <trip_id>/<doc_id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit) values ('documents', 'documents', false, 2097152) on conflict do nothing;
create policy "documents : lecture par les membres" on storage.objects for select
  using (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
create policy "documents : écriture par les membres" on storage.objects for insert
  with check (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
create policy "documents : suppression par les membres" on storage.objects for delete
  using (bucket_id = 'documents' and public.is_member(split_part(name, '/', 1)));
