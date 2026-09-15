-- ============================================================================
-- Comité C22 · Migración grants de courtesy_quotas
-- Versión: 20260905000009 (aplica DESPUÉS de 20260905000008).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- tablas, políticas, funciones/RPC ni datos. NO ejecutar sin revisión.
--
-- Motivo: la migración 08 creó la tabla y sus políticas RLS, pero en
-- Postgres las políticas no otorgan acceso: sin GRANT, todo acceso directo
-- falla con 42501 "permission denied for table courtesy_quotas".
--
-- Mínimo necesario (mismo patrón que la migración 04):
--   - SELECT para lecturas (admin todo, seller lo suyo, según RLS vigente).
--   - INSERT/UPDATE/DELETE para que el admin gestione cupos directo
--     (RLS lo restringe a admin; el seller no tiene políticas de escritura,
--     así que sus escrituras siguen denegadas).
-- Explícitamente NO otorgado: nada a anon, ningún GRANT ALL.
-- Las escrituras de `usadas` del seller siguen siendo solo vía RPC.
-- ============================================================================

grant select on public.courtesy_quotas to authenticated;
grant insert, update, delete on public.courtesy_quotas to authenticated;
