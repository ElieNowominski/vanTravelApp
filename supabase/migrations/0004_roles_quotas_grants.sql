-- Migration 0004 (branche v2, lot 2 de docs/PLAN-v2.md) : à exécuter dans SQL Editor sur vanTravelApp-v2
-- seulement, après 0002 et 0003. Jamais sur la production avant la fusion (ADR 0001). Idempotente.
--
-- Ce qu'elle ajoute :
--   1. rôle « lecteur » à côté de propriétaire et éditeur : un lecteur lit tout le voyage et n'écrit rien ;
--      add_member_by_email prend un rôle, set_member_role le change, un membre peut se retirer ;
--   2. consommation par compte et par jour des services à quota (géocodage, points d'intérêt), plafonds
--      dans la table usage_limits (modifiable dans Table Editor), refus explicite par consume_quota ;
--   3. droits explicites : plus rien pour anon hors beat(), pour authenticated le strict nécessaire par
--      table et par fonction, et plus de droits par défaut sur les objets créés ensuite. L'option
--      « Automatically expose new tables » du projet n'a alors plus d'effet : toute nouvelle table ou
--      fonction devra recevoir ses grant dans sa migration.

-- 1. Rôles.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('owner', 'editor', 'viewer'));

-- Écriture : propriétaire et éditeurs. Utilisée par les policies d'écriture, comme is_member pour la lecture.
create or replace function public.can_write(p_trip text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m where m.trip_id = p_trip and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$$;

-- Ajouter un membre par e-mail (le propriétaire seulement), comme éditeur ou lecteur. Une personne déjà
-- membre prend le rôle demandé ; le propriétaire garde le sien.
drop function if exists public.add_member_by_email(text, text);
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

-- Lecture : tous les membres. Écriture : propriétaire et éditeurs.
drop policy if exists "itinéraire : membres" on public.itineraries;
drop policy if exists "itinéraire : lecture par les membres" on public.itineraries;
drop policy if exists "itinéraire : création par les éditeurs" on public.itineraries;
drop policy if exists "itinéraire : modification par les éditeurs" on public.itineraries;
drop policy if exists "itinéraire : suppression par les éditeurs" on public.itineraries;
create policy "itinéraire : lecture par les membres" on public.itineraries for select using (public.is_member(trip_id));
create policy "itinéraire : création par les éditeurs" on public.itineraries for insert with check (public.can_write(trip_id));
create policy "itinéraire : modification par les éditeurs" on public.itineraries for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "itinéraire : suppression par les éditeurs" on public.itineraries for delete using (public.can_write(trip_id));

drop policy if exists "entités : membres" on public.travel_items;
drop policy if exists "entités : lecture par les membres" on public.travel_items;
drop policy if exists "entités : création par les éditeurs" on public.travel_items;
drop policy if exists "entités : modification par les éditeurs" on public.travel_items;
drop policy if exists "entités : suppression par les éditeurs" on public.travel_items;
create policy "entités : lecture par les membres" on public.travel_items for select using (public.is_member(trip_id));
create policy "entités : création par les éditeurs" on public.travel_items for insert with check (public.can_write(trip_id));
create policy "entités : modification par les éditeurs" on public.travel_items for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "entités : suppression par les éditeurs" on public.travel_items for delete using (public.can_write(trip_id));

drop policy if exists "dépenses : membres" on public.expenses;
drop policy if exists "dépenses : lecture par les membres" on public.expenses;
drop policy if exists "dépenses : création par les éditeurs" on public.expenses;
drop policy if exists "dépenses : modification par les éditeurs" on public.expenses;
drop policy if exists "dépenses : suppression par les éditeurs" on public.expenses;
create policy "dépenses : lecture par les membres" on public.expenses for select using (public.is_member(trip_id));
create policy "dépenses : création par les éditeurs" on public.expenses for insert with check (public.can_write(trip_id));
create policy "dépenses : modification par les éditeurs" on public.expenses for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "dépenses : suppression par les éditeurs" on public.expenses for delete using (public.can_write(trip_id));

drop policy if exists "suppressions : membres" on public.deletions;
drop policy if exists "suppressions : lecture par les membres" on public.deletions;
drop policy if exists "suppressions : création par les éditeurs" on public.deletions;
drop policy if exists "suppressions : modification par les éditeurs" on public.deletions;
drop policy if exists "suppressions : suppression par les éditeurs" on public.deletions;
create policy "suppressions : lecture par les membres" on public.deletions for select using (public.is_member(trip_id));
create policy "suppressions : création par les éditeurs" on public.deletions for insert with check (public.can_write(trip_id));
create policy "suppressions : modification par les éditeurs" on public.deletions for update using (public.can_write(trip_id)) with check (public.can_write(trip_id));
create policy "suppressions : suppression par les éditeurs" on public.deletions for delete using (public.can_write(trip_id));

-- Membres : la ligne du propriétaire ne se retire pas (sinon un voyage sans propriétaire membre) ;
-- chacun peut se retirer lui-même d'un voyage qui n'est pas le sien.
drop policy if exists "membres : retrait par le propriétaire" on public.members;
drop policy if exists "membres : un membre se retire" on public.members;
create policy "membres : retrait par le propriétaire" on public.members for delete
  using (role <> 'owner' and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "membres : un membre se retire" on public.members for delete using (user_id = auth.uid() and role <> 'owner');

-- Storage : lecture par les membres, écriture et suppression par les éditeurs.
drop policy if exists "documents : écriture par les membres" on storage.objects;
drop policy if exists "documents : suppression par les membres" on storage.objects;
drop policy if exists "documents : écriture par les éditeurs" on storage.objects;
drop policy if exists "documents : suppression par les éditeurs" on storage.objects;
create policy "documents : écriture par les éditeurs" on storage.objects for insert
  with check (bucket_id = 'documents' and public.can_write(split_part(name, '/', 1)));
create policy "documents : suppression par les éditeurs" on storage.objects for delete
  using (bucket_id = 'documents' and public.can_write(split_part(name, '/', 1)));

-- 2. Consommation et plafonds. Les plafonds protègent les services publics gratuits (Photon, Overpass) et
-- le quota gratuit de Supabase ; le client demande une unité avant chaque appel. Ce n'est pas une barrière :
-- les services sont appelés depuis le navigateur, un client modifié peut ne pas demander. Une vraie barrière
-- passerait par un relais (Edge Function), à prévoir pour une ouverture au public.
create table if not exists public.usage_limits (
  service text primary key,
  daily_per_user int not null check (daily_per_user >= 0),
  -- Tous comptes confondus ; null : pas de plafond global.
  daily_total int check (daily_total >= 0),
  note text not null default ''
);
-- Valeurs de départ choisies large sous les règles d'usage publiques, à revoir aux lots 3 et 5.
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

alter table public.usage_limits enable row level security;
alter table public.usage enable row level security;
drop policy if exists "plafonds : lecture par les comptes" on public.usage_limits;
drop policy if exists "consommation : la sienne en lecture" on public.usage;
create policy "plafonds : lecture par les comptes" on public.usage_limits for select to authenticated using (true);
create policy "consommation : la sienne en lecture" on public.usage for select using (user_id = auth.uid());
-- Écriture dans usage : consume_quota seulement (security definer). Dans usage_limits : le tableau de bord.

-- 3. Droits explicites.
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
