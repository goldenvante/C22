-- ============================================================================
-- Comité C22 · Migración fases inmutables (antifraude)
-- Versión: 20260905000007 (aplica DESPUÉS de 20260905000006).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- tablas, políticas, permisos, funciones/RPC ni datos.
-- NO ejecutar todavía sin revisión.
--
-- Objetivo: una fase creada NO puede editarse (nombre, precio, vigencia,
-- orden, activa) ni eliminarse, por NADIE, ni siquiera un admin. Así se
-- impide que el propio administrador altere precios o cancele fases con
-- ventas en curso para desviar dinero.
--
-- El trigger se dispara para todos los roles (incluido service_role y
-- ediciones desde el Dashboard): la inmutabilidad es a nivel de BD, no de UI.
-- La creación sigue permitida (INSERT vía RLS de admin). Si una fase nace
-- con un error, se crea una fase nueva corregida; la anterior queda como
-- registro histórico. Para relajar esta regla haría falta otra migración.
-- ============================================================================

create or replace function public.trg_phase_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'FASE_INMUTABLE: las fases no pueden eliminarse, ni siquiera por un administrador';
  end if;
  raise exception 'FASE_INMUTABLE: las fases no pueden modificarse una vez creadas, ni siquiera por un administrador';
  return null;
end $$;

drop trigger if exists trg_phases_no_update on public.event_phases;
create trigger trg_phases_no_update
  before update on public.event_phases
  for each row execute function public.trg_phase_immutable();

drop trigger if exists trg_phases_no_delete on public.event_phases;
create trigger trg_phases_no_delete
  before delete on public.event_phases
  for each row execute function public.trg_phase_immutable();

comment on trigger trg_phases_no_update on public.event_phases is
  'Candado antifraude: UPDATE bloqueado para todos los roles.';
comment on trigger trg_phases_no_delete on public.event_phases is
  'Candado antifraude: DELETE bloqueado para todos los roles.';
