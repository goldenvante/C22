-- ============================================================================
-- Comité C22 · Migración cortesías sin fase
-- Versión: 20260905000010 (aplica DESPUÉS de 20260905000009).
-- Migraciones históricas NO modificadas. Sin cambios de RLS, políticas,
-- permisos, folios, QR, auditoría ni UI. NO ejecutar todavía sin revisión.
--
-- Objetivo: un boleto de cortesía NO pertenece a ninguna fase (es válido
-- hasta el día del evento por definición). Antes usaba la primera fase
-- activa como vehículo de FK; ahora phase_id es NULL en cortesías.
--
-- Regla a nivel de BD (CHECK, vale para todos los roles y vías):
--   - venta normal  (es_cortesia = false) → phase_id OBLIGATORIO.
--   - cortesía      (es_cortesia = true)  → phase_id debe ser NULL.
-- create_ticket no cambia (siempre envía fase). create_courtesy_ticket ya
-- no busca ni guarda fase. El trigger de inmutabilidad compara phase_id
-- con IS DISTINCT FROM para cubrir correctamente los NULL.
-- Las UI ya ocultan la fase cuando es null (boleto, scanner, historial).
-- ============================================================================

-- 1. phase_id pasa a anulable; la obligatoriedad la rige el CHECK por tipo.
alter table public.tickets
  alter column phase_id drop not null;

-- 1b. El trigger de coherencia fase-evento debe tolerar NULL (cortesías).
-- Sin esto, el backfill fallaría con 'Fase no existe'.
create or replace function public.trg_ticket_phase_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phase_event uuid;
begin
  -- Cortesías: sin fase, sin validación que hacer.
  if new.phase_id is null then
    return new;
  end if;
  select event_id into v_phase_event from public.event_phases where id = new.phase_id;
  if v_phase_event is null then
    raise exception 'Fase no existe';
  end if;
  if v_phase_event <> new.event_id then
    raise exception 'La fase % no pertenece al evento %', new.phase_id, new.event_id;
  end if;
  return new;
end $$;

-- Backfill: las cortesías de prueba creadas con fase vehículo quedan en NULL
-- para cumplir la regla (no hay ventas reales afectadas: son de prueba).
update public.tickets
set phase_id = null
where es_cortesia = true and phase_id is not null;

alter table public.tickets
  drop constraint if exists tickets_phase_por_tipo;
alter table public.tickets
  add constraint tickets_phase_por_tipo check (
    (es_cortesia = false and phase_id is not null)
    or (es_cortesia = true and phase_id is null)
  );

-- 2. Inmutabilidad: comparación nula-segura para phase_id.
create or replace function public.trg_ticket_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id
    or new.event_id <> old.event_id
    or new.phase_id is distinct from old.phase_id
    or new.folio <> old.folio
    or new.qr_token <> old.qr_token
    or new.precio_pagado <> old.precio_pagado
    or new.metodo_pago <> old.metodo_pago
    or new.es_cortesia <> old.es_cortesia
    or new.seller_id <> old.seller_id then
    raise exception 'Ticket inmutable: folio/evento/fase/precio/metodo/cortesia/qr/vendedor no cambian';
  end if;
  if old.estado <> new.estado then
    if not (old.estado = 'ACTIVO' and new.estado in ('UTILIZADO', 'CANCELADO')) then
      raise exception 'Transición de estado no permitida: % -> %', old.estado, new.estado;
    end if;
  end if;
  return new;
end $$;

-- 3. create_courtesy_ticket sin fase: ya no busca vehículo, inserta NULL.
create or replace function public.create_courtesy_ticket(
  p_event_id uuid,
  p_nombre text,
  p_tel text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol app_role;
  v_estado event_estado;
  v_asignadas integer;
  v_usadas integer;
  v_next integer;
  v_ticket public.tickets;
begin
  select rol into v_caller_rol from public.profiles
  where id = auth.uid() and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'seller') then
    raise exception 'NO_AUTORIZADO: solo vendedor/admin activo genera cortesías';
  end if;

  select estado into v_estado from public.events where id = p_event_id;
  if v_estado is null then
    raise exception 'Evento no existe';
  end if;
  if v_estado <> 'publicado' and v_caller_rol = 'seller' then
    raise exception 'Evento no disponible para venta (estado=%)', v_estado;
  end if;

  if p_nombre is null or char_length(trim(p_nombre)) = 0 then
    raise exception 'Comprador requerido';
  end if;

  -- Cupo atómico: lock de fila; sin fila o agotado => rechazo sin folio.
  if v_caller_rol = 'seller' then
    select asignadas, usadas into v_asignadas, v_usadas
    from public.courtesy_quotas
    where event_id = p_event_id and seller_id = auth.uid()
    for update;
    if v_asignadas is null or v_usadas >= v_asignadas then
      raise exception 'SIN_CORTESIAS: el vendedor no tiene cortesías disponibles para este evento';
    end if;
    update public.courtesy_quotas
    set usadas = usadas + 1
    where event_id = p_event_id and seller_id = auth.uid();
  end if;

  -- Folio atómico del consecutivo normal del evento (trazable, sin reuso).
  insert into public.folio_counters (event_id, ultimo_folio)
  values (p_event_id, 1)
  on conflict (event_id) do update set ultimo_folio = folio_counters.ultimo_folio + 1
  returning ultimo_folio into v_next;

  update public.events set ultimo_folio = v_next where id = p_event_id;

  insert into public.tickets (
    event_id, phase_id, folio, precio_pagado, metodo_pago, es_cortesia,
    comprador_nombre, comprador_telefono, seller_id
  )
  values (
    p_event_id, null, v_next, 0, 'OTRO', true,
    trim(p_nombre), nullif(trim(coalesce(p_tel, '')), ''), auth.uid()
  )
  returning * into v_ticket;

  return v_ticket;
end $$;

revoke all on function public.create_courtesy_ticket(uuid, text, text) from public, anon;
grant execute on function public.create_courtesy_ticket(uuid, text, text) to authenticated;
