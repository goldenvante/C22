-- ============================================================================
-- Comité C22 · Migración de grants mínimos para la app
-- Versión: 20260905000004 (aplica DESPUÉS de 20260905000003).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- funciones/RPC, tablas, cupo ni políticas. NO ejecutar sin revisión.
--
-- Motivo: las migraciones otorgaron EXECUTE sobre las RPC pero nunca
-- privilegios a nivel de tabla a `authenticated`. En Postgres las políticas
-- RLS no otorgan acceso: sin GRANT, toda lectura directa fallaba con
-- 42501 "permission denied for table X". Esta migración otorga el mínimo
-- necesario y nada más.
--
-- Explícitamente NO otorgado (la seguridad sigue basada en RLS + RPC):
--   - INSERT/UPDATE/DELETE sobre public.tickets (solo vía RPC)
--   - INSERT/UPDATE/DELETE sobre public.entries (solo vía RPC)
--   - Ningún privilegio sobre public.folio_counters (solo vía RPC)
--   - Ningún privilegio a anon
--   - Sin GRANT ALL en ningún objeto
--
-- Idempotencia: GRANT es re-ejecutable sin error; aplicar con
-- `supabase db push` o pegando en el SQL Editor.
-- ============================================================================

-- Lecturas directas necesarias para la app (gobernadas por RLS vigente)
grant select on public.profiles to authenticated;
grant select on public.tickets to authenticated;
grant select on public.entries to authenticated;
grant select on public.events to authenticated;
grant select on public.event_phases to authenticated;

-- Escrituras directas permitidas actualmente por las políticas RLS:
-- profiles: UPDATE propio/admin (el trigger restringe rol/activo/usuario)
-- events/event_phases: ALL solo-admin vía políticas (el admin escribe directo)
grant update on public.profiles to authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert, update, delete on public.event_phases to authenticated;
