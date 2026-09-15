-- ============================================================================
-- Comité C22 · Migración vigencia de fases en create_ticket
-- Versión: 20260905000003 (aplica DESPUÉS de 20260905000002).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- tablas, cancel_ticket ni cupo. NO ejecutar todavía sin revisión.
--
-- Objetivo: create_ticket debe rechazar fases fuera de su ventana de
-- vigencia [fecha_inicio, fecha_fin] (inclusiva), evaluada con la fecha del
-- servidor (CURRENT_DATE), nunca la del dispositivo. El RPC puede invocarse
-- directo, así que la UI sola no basta.
--
-- Regla (NULL = sin límite, compatible con fases antiguas):
--   inicio NULL, fin NULL       -> vendible si activa
--   inicio NULL, fin definido   -> vendible hasta fin inclusive
--   inicio definido, fin NULL   -> vendible desde inicio inclusive
--   ambas definidas             -> vendible solo dentro del rango inclusivo
--
-- Garantía: el rechazo ocurre ANTES del upsert en folio_counters, por lo que
-- no se consume folio ni se crea ticket. Error identificable para la app:
-- mensaje con prefijo 'FASE_FUERA_DE_VIGENCIA'.
-- ============================================================================

create or replace function public.create_ticket(
  p_event_id uuid,
  p_phase_id uuid,
  p_nombre text,
  p_tel text default null,
  p_metodo_pago metodo_pago default 'EFECTIVO'
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol app_role;
  v_estado event_estado;
  v_phase_event uuid;
  v_phase_precio numeric(10, 2);
  v_phase_activa boolean;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_next integer;
  v_ticket public.tickets;
begin
  select rol into v_caller_rol from public.profiles
  where id = auth.uid() and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'seller') then
    raise exception 'NO_AUTORIZADO: solo vendedor/admin activo vende';
  end if;

  select estado into v_estado from public.events where id = p_event_id;
  if v_estado is null then
    raise exception 'Evento no existe';
  end if;
  -- Seller solo vende en eventos publicados; admin según reglas existentes.
  if v_estado <> 'publicado' and v_caller_rol = 'seller' then
    raise exception 'Evento no disponible para venta (estado=%)', v_estado;
  end if;

  -- Fase: debe existir, pertenecer al evento y estar activa. Precio desde aquí.
  select event_id, precio, activa, fecha_inicio, fecha_fin
    into v_phase_event, v_phase_precio, v_phase_activa, v_fecha_inicio, v_fecha_fin
  from public.event_phases where id = p_phase_id;

  if v_phase_event is null then
    raise exception 'Fase no existe';
  end if;
  if v_phase_event <> p_event_id then
    raise exception 'La fase no pertenece al evento';
  end if;
  if not v_phase_activa then
    raise exception 'Fase inactiva';
  end if;

  -- Vigencia con fecha del SERVIDOR (CURRENT_DATE), inclusiva en ambos extremos.
  -- NULL en un extremo = sin límite en ese lado (fases antiguas compatibles).
  -- Va ANTES del folio: si falla, no se consume folio ni se crea ticket.
  if v_fecha_inicio is not null and current_date < v_fecha_inicio then
    raise exception 'FASE_FUERA_DE_VIGENCIA: la fase inicia el %', v_fecha_inicio;
  end if;
  if v_fecha_fin is not null and current_date > v_fecha_fin then
    raise exception 'FASE_FUERA_DE_VIGENCIA: la fase terminó el %', v_fecha_fin;
  end if;

  if p_nombre is null or char_length(trim(p_nombre)) = 0 then
    raise exception 'Comprador requerido';
  end if;

  -- Folio atómico (misma transacción => el lock se libera al commit)
  insert into public.folio_counters (event_id, ultimo_folio)
  values (p_event_id, 1)
  on conflict (event_id) do update set ultimo_folio = folio_counters.ultimo_folio + 1
  returning ultimo_folio into v_next;

  update public.events set ultimo_folio = v_next where id = p_event_id;

  insert into public.tickets (
    event_id, phase_id, folio, precio_pagado, metodo_pago,
    comprador_nombre, comprador_telefono, seller_id
  )
  values (
    p_event_id, p_phase_id, v_next, v_phase_precio, coalesce(p_metodo_pago, 'EFECTIVO'),
    trim(p_nombre), nullif(trim(coalesce(p_tel, '')), ''), auth.uid()
  )
  returning * into v_ticket;

  return v_ticket;
end $$;

revoke all on function public.create_ticket(uuid, uuid, text, text, metodo_pago) from public, anon;
grant execute on function public.create_ticket(uuid, uuid, text, text, metodo_pago) to authenticated;

-- Verificación estática post-apply (no modifica datos): confirma que la
-- definición vigente contiene la validación de vigencia.
-- select pg_get_functiondef('public.create_ticket(uuid,uuid,text,text,metodo_pago)'::regprocedure)
--   like '%FASE_FUERA_DE_VIGENCIA%';
