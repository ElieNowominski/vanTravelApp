-- Migration 0005 (branche v2, lot 5 de docs/PLAN-v2.md) : à exécuter dans SQL Editor sur vanTravelApp-v2
-- seulement, après 0004. Jamais sur la production avant la fusion (ADR 0001). Idempotente.
--
-- Plafonds des points d'intérêt (Overpass) ramenés sous la politique d'usage du serveur public, vérifiée le
-- 3 nov. 2026 sur le wiki OSM : pour une app, environ 100 requêtes et 10 Mo par jour, tous utilisateurs
-- confondus. Les valeurs de départ de 0004 (200 par compte, 1 000 au total) la dépassaient.
-- Figer le voyage de référence (2 223 km) demande 32 requêtes ; la carte en demande une par zone nouvelle.

update public.usage_limits
set daily_per_user = 50,
    daily_total = 100,
    note = 'Points d''intérêt (Overpass, lot 5) : 100 requêtes par jour au total selon sa politique d''usage'
where service = 'poi';
