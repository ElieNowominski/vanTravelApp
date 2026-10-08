-- Migration 0002 : à exécuter dans SQL Editor sur un projet où `0001` (le schéma de docs/SUPABASE.md,
-- section 3) a déjà été lancé. Idempotente : relançable sans dégât.
--
-- Ce qu'elle ajoute par rapport au schéma initial :
--   1. clés primaires composées (trip_id, id) sur travel_items et expenses : un identifiant d'entité
--      n'est unique que dans son voyage (« <date>:notes » existe dans tous les voyages) ;
--   2. upsert_travel_items réécrite sur la nouvelle clé, upsert_expenses et upsert_deletions ;
--   3. create_trip : voyage + membre propriétaire en une transaction ;
--   4. profil créé automatiquement à l'inscription (trigger sur auth.users), profils existants rattrapés ;
--   5. policies manquantes : suppression d'un voyage et retrait d'un membre par le propriétaire.

-- 1. Clés primaires composées.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'travel_items_pkey' and conrelid = 'public.travel_items'::regclass and array_length(conkey, 1) = 1
  ) then
    alter table public.travel_items drop constraint travel_items_pkey;
    alter table public.travel_items add primary key (trip_id, id);
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'expenses_pkey' and conrelid = 'public.expenses'::regclass and array_length(conkey, 1) = 1
  ) then
    alter table public.expenses drop constraint expenses_pkey;
    alter table public.expenses add primary key (trip_id, id);
  end if;
end $$;

-- 2. Upserts « si plus récent » : le serveur tranche par entité. security invoker : les policies s'appliquent.
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

-- 3. Créer un voyage : la ligne trips et la ligne members du propriétaire, ou rien.
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

-- 4. Profil à l'inscription (prénom Google, ou partie locale de l'e-mail), et rattrapage des comptes existants.
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

insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1), '')
from auth.users u
on conflict (id) do nothing;

-- 5. Policies manquantes.
drop policy if exists "voyage : suppression par le propriétaire" on public.trips;
create policy "voyage : suppression par le propriétaire" on public.trips for delete using (owner_id = auth.uid());

drop policy if exists "membres : retrait par le propriétaire" on public.members;
create policy "membres : retrait par le propriétaire" on public.members for delete
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
