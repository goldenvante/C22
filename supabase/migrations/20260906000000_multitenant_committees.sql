-- ============================================================================
-- Multitenant por comité (app de tienda: cada comité con sus usuarios,
-- eventos y branding propios, datos aislados en el mismo proyecto).
-- Versión: 20260906000000 (aplica DESPUÉS de 20260905000012).
-- Migraciones históricas NO modificadas.
--
-- Modelo:
--  - committees(id, nombre, color_primario, color_secundario, color_fondo,
--    logo_url, created_by, created_at): un registro por comité.
--  - profiles.committee_id + events.committee_id: tenant de cada fila.
--    phases/tickets/entries/quotas heredan el tenant vía events (joins).
--  - Backfill: se crea el comité "Comité C22" y se asignan los profiles y
--    events existentes (compatibilidad con instalaciones actuales).
--  - RLS: cada política existente se refuerza con "mismo comité" usando
--    my_committee_id() (SECURITY DEFINER, sin recursión).
--  - RPCs: create_ticket, create_courtesy_ticket, validate_entry,
--    validate_entry_by_id, cancel_ticket, list_guestlist y get_entry_ticket
--    rechazan eventos de otro comité (NO_AUTORIZADO / conjunto vacío).
--  - Storage: bucket público `committee-logos` para el icono del comité.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla committees
-- ----------------------------------------------------------------------------
create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 80),
  color_primario text not null default '#8B263D' check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  color_secundario text not null default '#B9965A' check (color_secundario ~ '^#[0-9A-Fa-f]{6}$'),
  color_fondo text not null default '#F7EFE3' check (color_fondo ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text check (logo_url is null or char_length(logo_url) between 1 and 500),
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.committees enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Columnas tenant + backfill idempotente
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists committee_id uuid references public.committees (id) on delete restrict;

alter table public.events
  add column if not exists committee_id uuid references public.committees (id) on delete restrict;

-- Comité por defecto para datos pre-multitenant (nombre histórico).
insert into public.committees (id, nombre, color_primario, color_secundario, color_fondo)
values ('00000000-0000-0000-0000-000000000022', 'Comité C22', '#8B263D', '#B9965A', '#F7EFE3')
on conflict (id) do nothing;

update public.profiles
set committee_id = '00000000-0000-0000-0000-000000000022'
where committee_id is null;

update public.events
set committee_id = '00000000-0000-0000-0000-000000000022'
where committee_id is null;

-- ----------------------------------------------------------------------------
-- 3. Helpers tenant (SECURITY DEFINER: bypasan RLS, sin recursión)
-- ----------------------------------------------------------------------------
create or replace function public.my_committee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select committee_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_same_committee_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.committee_id = public.my_committee_id()
  );
$$;

-- Trigger: si el cliente no manda committee_id, se hereda el del admin.
create or replace function public.trg_set_event_committee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.committee_id is null then
    new.committee_id := public.my_committee_id();
  end if;
  if new.committee_id is null then
    raise exception 'Evento sin comité asignado';
  end if;
  return new;
end $$;

drop trigger if exists trg_events_set_committee on public.events;
create trigger trg_events_set_committee
  before insert on public.events
  for each row execute function public.trg_set_event_committee();

-- ----------------------------------------------------------------------------
-- 4. RLS de committees
-- ----------------------------------------------------------------------------
drop policy if exists "committees_select_own" on public.committees;
create policy "committees_select_own"
  on public.committees for select to authenticated
  using (id = public.my_committee_id());

drop policy if exists "committees_admin_update" on public.committees;
create policy "committees_admin_update"
  on public.committees for update to authenticated
  using (id = public.my_committee_id() and public.is_admin())
  with check (id = public.my_committee_id() and public.is_admin());

-- Sin INSERT/DELETE desde la app: solo la Edge Function committee-signup
-- (service_role) crea comités. Sin política => denegado por defecto.

-- ----------------------------------------------------------------------------
-- 5. RLS existentes reforzadas con tenant
-- ----------------------------------------------------------------------------
-- profiles: lectura propia o admin del MISMO comité.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (public.is_admin() and committee_id = public.my_committee_id())
  );

-- events: visibles del propio comité (publicado/finalizado o admin).
drop policy if exists "events_select_visible" on public.events;
create policy "events_select_visible"
  on public.events for select to authenticated
  using (
    committee_id = public.my_committee_id()
    and (estado in ('publicado', 'finalizado') or public.is_admin())
  );

drop policy if exists "events_admin_write" on public.events;
create policy "events_admin_write"
  on public.events for all to authenticated
  using (public.is_admin() and committee_id = public.my_committee_id())
  with check (public.is_admin() and committee_id = public.my_committee_id());

-- phases: miembros activos, solo fases de eventos del propio comité.
drop policy if exists "phases_select_visible" on public.event_phases;
create policy "phases_select_visible"
  on public.event_phases for select to authenticated
  using (
    public.is_active_member()
    and exists (
      select 1 from public.events e
      where e.id = event_phases.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

drop policy if exists "phases_admin_write" on public.event_phases;
create policy "phases_admin_write"
  on public.event_phases for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.events e
      where e.id = event_phases.event_id
        and e.committee_id = public.my_committee_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.events e
      where e.id = event_phases.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

-- tickets: admin del comité o vendedor dueño dentro del comité.
drop policy if exists "tickets_admin_select" on public.tickets;
create policy "tickets_admin_select"
  on public.tickets for select to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.events e
      where e.id = tickets.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

drop policy if exists "tickets_seller_select_own" on public.tickets;
create policy "tickets_seller_select_own"
  on public.tickets for select to authenticated
  using (
    seller_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = tickets.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

-- entries: admin del comité o escaneos propios dentro del comité.
drop policy if exists "entries_admin_select" on public.entries;
create policy "entries_admin_select"
  on public.entries for select to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

drop policy if exists "entries_access_select_own" on public.entries;
create policy "entries_access_select_own"
  on public.entries for select to authenticated
  using (
    (scanned_by = auth.uid() or public.is_admin())
    and exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

-- quotas: admin del comité o vendedor dueño dentro del comité.
drop policy if exists "quotas_admin_all" on public.courtesy_quotas;
create policy "quotas_admin_all"
  on public.courtesy_quotas for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.events e
      where e.id = courtesy_quotas.event_id
        and e.committee_id = public.my_committee_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.events e
      where e.id = courtesy_quotas.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

drop policy if exists "quotas_seller_select_own" on public.courtesy_quotas;
create policy "quotas_seller_select_own"
  on public.courtesy_quotas for select to authenticated
  using (
    seller_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = courtesy_quotas.event_id
        and e.committee_id = public.my_committee_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. RPCs con aislamiento por comité
-- NOTA: se redeclaran las firmas vigentes para agregar el chequeo tenant
-- sin cambiar su contrato (mismos args y retornos). Se conservan las reglas
-- de negocio de cada migración original (vigencia de fase, cupos, auditoría).
-- ----------------------------------------------------------------------------

-- 6a. create_ticket + vigencia de fase + tenant.
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
  v_phase_inicio date;
  v_phase_fin date;
  v_next integer;
  v_ticket public.tickets;
begin
  select rol into v_caller_rol from public.profiles
  where id = auth.uid() and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'seller') then
    raise exception 'NO_AUTORIZADO: solo vendedor/admin activo vende';
  end if;

  if not public.is_same_committee_event(p_event_id) then
    raise exception 'NO_AUTORIZADO: evento de otro comité';
  end if;

  select estado into v_estado from public.events where id = p_event_id;
  if v_estado is null then
    raise exception 'Evento no existe';
  end if;
  if v_estado <> 'publicado' and v_caller_rol = 'seller' then
    raise exception 'Evento no disponible para venta (estado=%)', v_estado;
  end if;

  select event_id, precio, activa, fecha_inicio, fecha_fin
    into v_phase_event, v_phase_precio, v_phase_activa, v_phase_inicio, v_phase_fin
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
  if v_phase_inicio is not null and current_date < v_phase_inicio then
    raise exception 'FASE_FUERA_DE_VIGENCIA: la fase aún no inicia';
  end if;
  if v_phase_fin is not null and current_date > v_phase_fin then
    raise exception 'FASE_FUERA_DE_VIGENCIA: la fase ya terminó';
  end if;

  if p_nombre is null or char_length(trim(p_nombre)) = 0 then
    raise exception 'Comprador requerido';
  end if;

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

-- 6b. create_courtesy_ticket con tenant (cortesía sin fase, con cupo).
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

  if not public.is_same_committee_event(p_event_id) then
    raise exception 'NO_AUTORIZADO: evento de otro comité';
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

-- 6c. validate_entry con tenant (+ fase viva en la respuesta).
create or replace function public.validate_entry(p_qr_token uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol app_role;
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_code entry_resultado;
  v_ok boolean := false;
  v_folio integer;
  v_ticket_id uuid;
  v_fase text;
begin
  select rol into v_caller_rol from public.profiles
  where id = v_uid and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'access') then
    select id, folio into v_ticket_id, v_folio from public.tickets
    where qr_token = p_qr_token;
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (v_ticket_id, p_event_id, v_uid, 'NO_AUTORIZADO', p_qr_token);
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  if not public.is_same_committee_event(p_event_id) then
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (null, p_event_id, v_uid, 'NO_AUTORIZADO', p_qr_token);
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  select * into v_ticket from public.tickets
  where qr_token = p_qr_token for update;

  if v_ticket.id is null then
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (null, p_event_id, v_uid, 'NO_EXISTE', p_qr_token);
    return jsonb_build_object('ok', false, 'code', 'NO_EXISTE');
  end if;

  v_ticket_id := v_ticket.id;
  v_folio := v_ticket.folio;
  select nombre into v_fase from public.event_phases where id = v_ticket.phase_id;

  if v_ticket.event_id <> p_event_id then
    v_code := 'EVENTO_INCORRECTO';
  elsif v_ticket.estado = 'CANCELADO' then
    v_code := 'CANCELADO';
  elsif v_ticket.estado = 'UTILIZADO' then
    v_code := 'YA_UTILIZADO';
  elsif exists (
    select 1 from public.entries
    where ticket_id = v_ticket.id and resultado = 'VALIDO'
  ) then
    v_code := 'YA_UTILIZADO';
  else
    begin
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'VALIDO', p_qr_token);
    exception when unique_violation then
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'YA_UTILIZADO', p_qr_token);
      return jsonb_build_object('ok', false, 'code', 'YA_UTILIZADO', 'folio', v_ticket.folio, 'fase', v_fase);
    end;

    update public.tickets set estado = 'UTILIZADO' where id = v_ticket.id;
    v_ok := true;
    return jsonb_build_object(
      'ok', true,
      'code', 'VALIDO',
      'folio', v_ticket.folio,
      'comprador', v_ticket.comprador_nombre,
      'ticket_id', v_ticket.id,
      'fase', v_fase
    );
  end if;

  insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
  values (v_ticket_id, p_event_id, v_uid, v_code, p_qr_token);

  return jsonb_build_object('ok', v_ok, 'code', v_code, 'folio', v_folio, 'fase', v_fase);
end $$;

revoke all on function public.validate_entry(uuid, uuid) from public, anon;
grant execute on function public.validate_entry(uuid, uuid) to authenticated;

-- 6d. validate_entry_by_id con tenant.
create or replace function public.validate_entry_by_id(p_ticket_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol app_role;
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_code entry_resultado;
  v_ok boolean := false;
  v_folio integer;
  v_ticket_id uuid;
  v_qr uuid;
  v_fase text;
begin
  select rol into v_caller_rol from public.profiles
  where id = v_uid and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'access') then
    select id, qr_token, folio into v_ticket_id, v_qr, v_folio from public.tickets
    where id = p_ticket_id;
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (v_ticket_id, p_event_id, v_uid, 'NO_AUTORIZADO', v_qr);
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  if not public.is_same_committee_event(p_event_id) then
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (null, p_event_id, v_uid, 'NO_AUTORIZADO', null);
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  select * into v_ticket from public.tickets
  where id = p_ticket_id for update;

  if v_ticket.id is null then
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (null, p_event_id, v_uid, 'NO_EXISTE', null);
    return jsonb_build_object('ok', false, 'code', 'NO_EXISTE');
  end if;

  v_ticket_id := v_ticket.id;
  v_folio := v_ticket.folio;
  v_qr := v_ticket.qr_token;

  select nombre into v_fase from public.event_phases
  where id = v_ticket.phase_id;

  if v_ticket.event_id <> p_event_id then
    v_code := 'EVENTO_INCORRECTO';
  elsif v_ticket.estado = 'CANCELADO' then
    v_code := 'CANCELADO';
  elsif v_ticket.estado = 'UTILIZADO' then
    v_code := 'YA_UTILIZADO';
  elsif exists (
    select 1 from public.entries
    where ticket_id = v_ticket.id and resultado = 'VALIDO'
  ) then
    v_code := 'YA_UTILIZADO';
  else
    begin
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'VALIDO', v_qr);
    exception when unique_violation then
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'YA_UTILIZADO', v_qr);
      return jsonb_build_object('ok', false, 'code', 'YA_UTILIZADO', 'folio', v_ticket.folio, 'fase', v_fase);
    end;

    update public.tickets set estado = 'UTILIZADO' where id = v_ticket.id;
    v_ok := true;
    return jsonb_build_object(
      'ok', true,
      'code', 'VALIDO',
      'folio', v_ticket.folio,
      'comprador', v_ticket.comprador_nombre,
      'ticket_id', v_ticket.id,
      'fase', v_fase
    );
  end if;

  insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
  values (v_ticket_id, p_event_id, v_uid, v_code, v_qr);

  return jsonb_build_object('ok', v_ok, 'code', v_code, 'folio', v_folio, 'fase', v_fase);
end $$;

revoke all on function public.validate_entry_by_id(uuid, uuid) from public, anon;
grant execute on function public.validate_entry_by_id(uuid, uuid) to authenticated;

-- 6e. cancel_ticket con tenant (solo admin del comité del boleto).
create or replace function public.cancel_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO: solo admin cancela';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception 'Ticket no existe';
  end if;
  if not public.is_same_committee_event(v_ticket.event_id) then
    raise exception 'NO_AUTORIZADO: boleto de otro comité';
  end if;
  if v_ticket.estado <> 'ACTIVO' then
    raise exception 'Solo tickets ACTIVO se cancelan (actual=%)', v_ticket.estado;
  end if;

  update public.tickets set estado = 'CANCELADO' where id = p_ticket_id
  returning * into v_ticket;
  return v_ticket;
end $$;

revoke all on function public.cancel_ticket(uuid) from public, anon;
grant execute on function public.cancel_ticket(uuid) to authenticated;

-- 6f. list_guestlist con tenant (sin qr_token, precio ni vendedor).
create or replace function public.list_guestlist(p_event_id uuid)
returns table (
  ticket_id uuid,
  folio integer,
  comprador text,
  fase text,
  estado text,
  es_cortesia boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol app_role;
begin
  select rol into v_caller_rol from public.profiles
  where id = auth.uid() and activo = true;

  if v_caller_rol is null or v_caller_rol not in ('admin', 'access') then
    return;
  end if;

  if not public.is_same_committee_event(p_event_id) then
    return;
  end if;

  return query
  select
    t.id,
    t.folio,
    t.comprador_nombre,
    p.nombre,
    t.estado::text,
    t.es_cortesia
  from public.tickets t
  left join public.event_phases p on p.id = t.phase_id
  where t.event_id = p_event_id
  order by t.comprador_nombre, t.folio;
end $$;

revoke all on function public.list_guestlist(uuid) from public, anon;
grant execute on function public.list_guestlist(uuid) to authenticated;

-- 6g. get_entry_ticket con tenant.
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

  if not public.is_same_committee_event(v_entry.event_id) then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
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

-- ----------------------------------------------------------------------------
-- 7. Storage: bucket de logos del comité (lectura pública, escritura admin)
-- NOTA: storage.* solo existe en proyectos Supabase con Storage provisionado.
-- Se envuelve en bloque defensivo para que `db push` no falle si el esquema
-- storage aún no existe (ej. DB local sin storage). El bucket también puede
-- crearse desde Dashboard > Storage > New bucket: `committee-logos` (public).
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('committee-logos', 'committee-logos', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
    CREATE POLICY "logos_public_read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'committee-logos');

    DROP POLICY IF EXISTS "logos_member_write" ON storage.objects;
    CREATE POLICY "logos_member_write"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'committee-logos' AND public.is_active_member());

    DROP POLICY IF EXISTS "logos_member_update" ON storage.objects;
    CREATE POLICY "logos_member_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'committee-logos' AND public.is_admin())
      WITH CHECK (bucket_id = 'committee-logos' AND public.is_admin());
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 8. Grants mínimos
-- ----------------------------------------------------------------------------
grant select, update on table public.committees to authenticated;
grant execute on function public.my_committee_id() to authenticated;
grant execute on function public.is_same_committee_event(uuid) to authenticated;
