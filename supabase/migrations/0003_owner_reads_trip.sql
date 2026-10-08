-- Migration 0003 : le propriétaire lit son voyage même sans ligne `members`.
--
-- Trouvé par scripts/rls-check.mjs le 8 oct. 2026 : `create_trip` insère le voyage puis la ligne
-- `members` du propriétaire ; la policy d'insertion de `members` relit `trips` pour vérifier le
-- propriétaire, mais la policy de lecture de `trips` n'autorisait que les membres, qui n'existent pas
-- encore à cet instant. La transaction était annulée : aucun voyage ne pouvait être créé.
-- Idempotente.

drop policy if exists "voyage : membres en lecture" on public.trips;
drop policy if exists "voyage : membres ou propriétaire en lecture" on public.trips;
create policy "voyage : membres ou propriétaire en lecture" on public.trips for select
  using (public.is_member(id) or owner_id = auth.uid());
