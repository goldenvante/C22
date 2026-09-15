-- ============================================================================
-- Comité C22 · Migración boletos de cortesía
-- Versión: 20260905000008 (aplica DESPUÉS de 20260905000007).
-- Migraciones históricas NO modificadas. Sin cambios a RLS existentes,
-- folios, QR, create_ticket, validate_entry (salvo campo extra abajo),
-- ventas ni auditoría. NO ejecutar todavía sin revisión.
--
-- Modelo:
--  - tickets.es_cortesia (boolean, default false): marca el boleto gratis.
--    precio_pagado queda en 0 y NO se muestra fase en el boleto (solo UI).
--    Incluido en el trigger de inmutabilidad: tampoco se puede alterar.
--  - courtesy_quotas(event_id, seller_id, asignadas, usadas): cupo por
--    vendedor y evento, sin límite superior para asignar. `usadas` solo la
--    mueve create_courtesy_ticket bajo lock de fila: imposible excederse
--    aunque dos ventas sean simultáneas.
--  - Las cortesías consumen folio del consecutivo normal del evento
--    (trazabilidad + aparecen en reportes; se distinguen por es_cortesia).
--  - create_courtesy_ticket(): solo seller/admin activo; evento publicado
--    para seller; usa como vehículo la primera fase activa por orden
--    (la fase NO se muestra en el boleto); respeta el cupo del seller
--    (el admin no consume cupo).
--  - get_entry_ticket(): suma 'es_cortesia' al objeto ticket para el
--    detalle de historial (único cambio a esa función).
-- ============================================================================

-- 1. Flag de cortesía (transaccional y seguro: ADD COLUMN simple).
alter table public.tickets
  add column if not exists es_cortesia boolean not null default false;

-- 2. Inmutabilidad extendida al flag (reemplazo íntegro de la función;
--    el trigger trg_tickets_immutable existente sigue apuntando a ella).
create or replace function public.trg_ticket_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id
    or new.event_id <> old.event_id
    or new.phase_id <> old.phase_id
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

-- 3. Cupos de cortesía por vendedor y evento.
create table if not exists public.courtesy_quotas (
  event_id uuid not null references public.events (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  asignadas integer not null check (asignadas >= 0),
  usadas integer not null default 0 check (usadas >= 0),
  created_at timestamptz not null default now(),
  primary key (event_id, seller_id),
  constraint quotas_usadas_lte_asignadas check (usadas <= asignadas)
);
create index if not exists idx_quotas_seller on public.courtesy_quotas (seller_id);

alter table public.courtesy_quotas enable row level security;

drop policy if exists "quotas_admin_all" on public.courtesy_quotas;
create policy "quotas_admin_all"
  on public.courtesy_quotas for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "quotas_seller_select_own" on public.courtesy_quotas;
create policy "quotas_seller_select_own"
  on public.courtesy_quotas for select to authenticated
  using (seller_id = auth.uid());

-- Sin INSERT/UPDATE/DELETE directos para seller: usadas solo vía RPC.

-- 4. RPC de creación de cortesías (único mecanismo; sin folio en JS).
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
  v_phase_id uuid;
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

  -- Vehículo de FK: primera fase activa por orden (no se muestra en boleto).
  select id into v_phase_id from public.event_phases
  where event_id = p_event_id and activa
  order by orden limit 1;
  if v_phase_id is null then
    raise exception 'Sin fase disponible para cortesías en este evento';
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
    p_event_id, v_phase_id, v_next, 0, 'OTRO', true,
    trim(p_nombre), nullif(trim(coalesce(p_tel, '')), ''), auth.uid()
  )
  returning * into v_ticket;

  return v_ticket;
end $$;

revoke all on function public.create_courtesy_ticket(uuid, text, text) from public, anon;
grant execute on function public.create_courtesy_ticket(uuid, text, text) to authenticated;

-- 5. get_entry_ticket: suma es_cortesia al objeto ticket (único cambio).
create or replace function public.get_entry_ticket(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol app_role;
  v_uid uuid := auth.uid();
  v_entry public.entries;
  v_ticket public.tickets;
  v_evento_nombre text;
  v_evento_fecha date;
  v_evento_hora time;
  v_evento_lugar text;
  v_evento_imagen text;
  v_fase text;
begin
  select rol into v_caller_rol from public.profiles
  where id = v_uid and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'access') then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  select * into v_entry from public.entries
  where id = p_entry_id;

  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_EXISTE');
  end if;

  if v_entry.ticket_id is null then
    return jsonb_build_object(
      'ok', false, 'code', 'SIN_BOLETO',
      'entry', jsonb_build_object(
        'id', v_entry.id,
        'resultado', v_entry.resultado,
        'scanned_at', v_entry.scanned_at
      )
    );
  end if;

  -- Propiedad: access solo sus escaneos; admin cualquiera.
  if v_caller_rol = 'access' and v_entry.scanned_by is distinct from v_uid then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  select * into v_ticket from public.tickets
  where id = v_entry.ticket_id;

  if v_ticket.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_EXISTE');
  end if;

  select nombre, fecha, hora, lugar, imagen_url
    into v_evento_nombre, v_evento_fecha, v_evento_hora, v_evento_lugar, v_evento_imagen
  from public.events
  where id = v_ticket.event_id;

  select nombre into v_fase from public.event_phases
  where id = v_ticket.phase_id;

  return jsonb_build_object(
    'ok', true, 'code', 'OK',
    'entry', jsonb_build_object(
      'id', v_entry.id,
      'resultado', v_entry.resultado,
      'scanned_at', v_entry.scanned_at
    ),
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'folio', v_ticket.folio,
      'comprador', v_ticket.comprador_nombre,
      'estado', v_ticket.estado,
      'qr_token', v_ticket.qr_token,
      'es_cortesia', v_ticket.es_cortesia
    ),
    'evento', jsonb_build_object(
      'nombre', v_evento_nombre,
      'fecha', v_evento_fecha,
      'hora', v_evento_hora,
      'lugar', v_evento_lugar,
      'imagen_url', v_evento_imagen
    ),
    'fase', v_fase
  );
end $$;

revoke all on function public.get_entry_ticket(uuid) from public, anon;
grant execute on function public.get_entry_ticket(uuid) to authenticated;
