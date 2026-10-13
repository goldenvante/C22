-- Candado antifraude de fases: sigue bloqueando UPDATE y DELETE de toda
-- fase mientras su evento exista (para todos los roles, admin incluido).
-- Sólo se permite el DELETE que ejecuta ON DELETE CASCADE, que PostgreSQL
-- dispara DESPUÉS de quitar la fila del evento: así un evento de prueba
-- puede limpiarse, pero una fase viva jamás se toca.
create or replace function public.trg_phase_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if exists (select 1 from public.events where id = old.event_id) then
      raise exception 'FASE_INMUTABLE: las fases no pueden eliminarse, ni siquiera por un administrador';
    end if;
    return old;
  end if;
  raise exception 'FASE_INMUTABLE: las fases no pueden modificarse una vez creadas, ni siquiera por un administrador';
  return null;
end $$;
