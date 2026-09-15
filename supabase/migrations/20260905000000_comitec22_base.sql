-- ============================================================================
-- Comité C22 · Migración base
-- Fecha versión: 2026-09-05 (rev.2)
-- Alcance: esquema + RLS + RPCs transaccionales (folios y validación QR)
-- NO ejecutar todavía contra Supabase (pendiente de revisión).
--
-- Decisiones:
--  1. Folio consecutivo por evento vive en `folio_counters` (fuente de verdad).
--     `events.ultimo_folio` es espejo de lectura, se actualiza dentro de la
--     misma transacción del RPC. Así se evita doble fuente y carreras.
--  2. QR = solo `tickets.qr_token` (UUID). Sin PII en el QR.
--  3. `tickets` guarda `phase_id` + `precio_pagado` (snapshot) + `metodo_pago`.
--     El precio NUNCA llega desde la app: se lee de `event_phases` en el RPC.
--  4. `entries` es bitácora de TODOS los intentos (válidos y rechazados).
--     Un solo VALIDO por ticket vía índice único parcial; los fallidos
--     NO modifican el estado del boleto.
--  5. Toda escritura de tickets/entradas pasa por RPC SECURITY DEFINER.
--     No hay políticas INSERT/UPDATE directas para seller/access.
-- ============================================================================

-- Extensión para gen_random_uuid() (en Supabase suele estar disponible)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'seller', 'access');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type event_estado as enum ('borrador', 'publicado', 'finalizado', 'cancelado');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type ticket_estado as enum ('ACTIVO', 'UTILIZADO', 'CANCELADO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type entry_resultado as enum (
    'VALIDO',
    'YA_UTILIZADO',
    'CANCELADO',
    'NO_EXISTE',
    'EVENTO_INCORRECTO',
    'NO_AUTORIZADO'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type metodo_pago as enum ('EFECTIVO', 'TRANSFERENCIA', 'OTRO');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Tablas
-- ----------------------------------------------------------------------------

-- profiles: id = auth.users.id. El rol NUNCA lo asigna el propio usuario.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 120),
  rol app_role not null default 'seller',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 160),
  codigo text not null unique check (char_length(codigo) between 2 and 24),
  fecha date not null,
  hora time,
  lugar text,
  imagen_url text,
  estado event_estado not null default 'borrador',
  -- Espejo de lectura de folio_counters.ultimo_folio (ver RPC).
  ultimo_folio integer not null default 0 check (ultimo_folio >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.event_phases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  precio numeric(10, 2) not null check (precio >= 0),
  orden integer not null check (orden > 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, orden)
);
create index if not exists idx_phases_event on public.event_phases (event_id);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  -- Fase con la que se vendió. Debe pertenecer al mismo evento (ver trigger).
  phase_id uuid not null references public.event_phases (id) on delete restrict,
  folio integer not null check (folio > 0),
  -- Snapshot del precio pagado, copiado desde event_phases en create_ticket().
  -- Inmutable por trigger.
  precio_pagado numeric(10, 2) not null check (precio_pagado >= 0),
  metodo_pago metodo_pago not null default 'EFECTIVO',
  comprador_nombre text not null check (char_length(comprador_nombre) between 1 and 160),
  comprador_telefono text check (comprador_telefono is null or char_length(comprador_telefono) <= 32),
  -- Único contenido del QR. Sin datos personales.
  qr_token uuid not null unique default gen_random_uuid(),
  estado ticket_estado not null default 'ACTIVO',
  seller_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (event_id, folio)
);
create index if not exists idx_tickets_event on public.tickets (event_id);
create index if not exists idx_tickets_phase on public.tickets (phase_id);
create index if not exists idx_tickets_seller on public.tickets (seller_id);
create index if not exists idx_tickets_qr on public.tickets (qr_token);

-- entries: bitácora de TODOS los intentos de validación (válidos y rechazados).
--  - ticket_id NULL cuando el QR no existe (NO_EXISTE).
--  - event_id = evento donde se intentó validar (p_event_id).
--  - qr_token = token intentado (auditoría, incluso si no existe el ticket).
--  - Un solo VALIDO por ticket (índice parcial); fallidos ilimitados.
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  scanned_by uuid references public.profiles (id) on delete set null,
  scanned_at timestamptz not null default now(),
  resultado entry_resultado not null,
  qr_token uuid
);
-- Un boleto solo puede tener UNA entrada VALIDA. Los intentos rechazados
-- pueden repetirse (p. ej. varios YA_UTILIZADO) sin violar unicidad.
create unique index if not exists uniq_valid_entry_per_ticket
  on public.entries (ticket_id)
  where resultado = 'VALIDO' and ticket_id is not null;
create index if not exists idx_entries_ticket on public.entries (ticket_id);
create index if not exists idx_entries_event on public.entries (event_id);
create index if not exists idx_entries_scanned_by on public.entries (scanned_by);
create index if not exists idx_entries_resultado on public.entries (resultado);

-- Contador transaccional por evento (fuente de verdad del folio).
create table if not exists public.folio_counters (
  event_id uuid primary key references public.events (id) on delete cascade,
  ultimo_folio integer not null default 0 check (ultimo_folio >= 0)
);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_phases enable row level security;
alter table public.tickets enable row level security;
alter table public.entries enable row level security;
alter table public.folio_counters enable row level security;

-- Helper: ¿es admin activo? SECURITY DEFINER para evitar recursión RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin' and activo = true
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and activo = true
  );
$$;

-- ---- profiles ----
-- Limpieza idempotente de políticas (permite re-ejecutar la migración en dev)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_self_non_admin" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_no_delete" on public.profiles;

-- Lectura: uno mismo o admin. Sin política para anon => sin acceso anónimo.
create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Alta: un usuario solo puede crearse a sí mismo y NUNCA como admin.
-- El primer admin debe crearse por service_role / SQL directo, no desde la app.
create policy "profiles_insert_self_non_admin"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and rol in ('seller', 'access'));

-- Update: uno mismo o admin. El trigger bloquea escalamiento de rol/activo.
create policy "profiles_update_self_or_admin"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Sin DELETE desde la app: se desactiva (activo=false) en lugar de borrar.

-- ---- events ----
drop policy if exists "events_select_visible" on public.events;
drop policy if exists "events_admin_write" on public.events;

create policy "events_select_visible"
  on public.events for select to authenticated
  using (estado in ('publicado', 'finalizado') or public.is_admin());

create policy "events_admin_write"
  on public.events for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- event_phases ----
drop policy if exists "phases_select_visible" on public.event_phases;
drop policy if exists "phases_admin_write" on public.event_phases;

create policy "phases_select_visible"
  on public.event_phases for select to authenticated
  using (public.is_active_member());

create policy "phases_admin_write"
  on public.event_phases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- tickets ----
-- Lectura: admin todo, vendedor solo lo suyo. Sin INSERT/UPDATE/DELETE directos
-- para NADIE (ni admin): las modificaciones son solo vía RPC
-- (create_ticket genera, cancel_ticket cancela, validate_entry marca UTILIZADO).
drop policy if exists "tickets_admin_all" on public.tickets;
drop policy if exists "tickets_admin_select" on public.tickets;
drop policy if exists "tickets_seller_select_own" on public.tickets;

create policy "tickets_admin_select"
  on public.tickets for select to authenticated
  using (public.is_admin());

create policy "tickets_seller_select_own"
  on public.tickets for select to authenticated
  using (seller_id = auth.uid());

-- ---- entries ----
-- Lectura para reportes: admin todo, access sus propios escaneos.
-- Sin INSERT/UPDATE/DELETE directos: solo RPC validate_entry (SECURITY DEFINER),
-- que registra tanto VALIDOS como rechazados para auditoría.
drop policy if exists "entries_admin_select" on public.entries;
drop policy if exists "entries_access_select_own" on public.entries;

create policy "entries_admin_select"
  on public.entries for select to authenticated
  using (public.is_admin());

create policy "entries_access_select_own"
  on public.entries for select to authenticated
  using (scanned_by = auth.uid() or public.is_admin());

-- Sin INSERT/UPDATE/DELETE directos: solo RPC validate_entry (SECURITY DEFINER).

-- ---- folio_counters ----
-- Sin acceso directo desde la app. Solo RPC + admin vía service_role.
-- No se crean políticas para authenticated => denegado por defecto.

-- ----------------------------------------------------------------------------
-- 4. Triggers de seguridad
-- ----------------------------------------------------------------------------

-- 4a. Al crear evento, inicializar su contador
create or replace function public.trg_init_folio_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.folio_counters (event_id, ultimo_folio)
  values (new.id, 0) on conflict (event_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_events_init_counter on public.events;
create trigger trg_events_init_counter
  after insert on public.events
  for each row execute function public.trg_init_folio_counter();

-- 4b. Bloquear escalamiento de rol/activo por usuarios no admin
create or replace function public.trg_block_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.rol is distinct from new.rol or old.activo is distinct from new.activo then
    if not public.is_admin() then
      raise exception 'No autorizado: solo admin puede cambiar rol/activo';
    end if;
    -- Doble candado: aunque la política de INSERT filtre, el trigger también bloquea
    -- que alguien se auto-asigne admin mediante UPDATE.
    if old.id = auth.uid() and new.rol = 'admin' and old.rol <> 'admin' then
      raise exception 'No autorizado: un usuario no puede convertirse en admin';
    end if;
  end if;
  -- id y created_at inmutables
  if new.id <> old.id then
    raise exception 'profiles.id es inmutable';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_no_escalation on public.profiles;
create trigger trg_profiles_no_escalation
  before update on public.profiles
  for each row execute function public.trg_block_role_escalation();

-- 4c. tickets.phase_id debe pertenecer al mismo evento (la FK sola no lo garantiza).
create or replace function public.trg_ticket_phase_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phase_event uuid;
begin
  select event_id into v_phase_event from public.event_phases where id = new.phase_id;
  if v_phase_event is null then
    raise exception 'Fase no existe';
  end if;
  if v_phase_event <> new.event_id then
    raise exception 'La fase % no pertenece al evento %', new.phase_id, new.event_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_tickets_phase_event on public.tickets;
create trigger trg_tickets_phase_event
  before insert or update of phase_id, event_id on public.tickets
  for each row execute function public.trg_ticket_phase_event();

-- 4d. Inmutabilidad de tickets: folio, evento, fase, precio, método, qr y
--     vendedor no cambian. Solo se permite ACTIVO -> UTILIZADO (RPC de acceso)
--     o ACTIVO -> CANCELADO (RPC de admin).
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
    or new.seller_id <> old.seller_id then
    raise exception 'Ticket inmutable: folio/evento/fase/precio/metodo/qr/vendedor no cambian';
  end if;
  if old.estado <> new.estado then
    if not (old.estado = 'ACTIVO' and new.estado in ('UTILIZADO', 'CANCELADO')) then
      raise exception 'Transición de estado no permitida: % -> %', old.estado, new.estado;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_tickets_immutable on public.tickets;
create trigger trg_tickets_immutable
  before update on public.tickets
  for each row execute function public.trg_ticket_immutable();

-- ----------------------------------------------------------------------------
-- 5. RPCs transaccionales
-- ----------------------------------------------------------------------------

-- 5a. Crear boleto (vendedor/admin). El precio se lee de la fase, NO de la app.
--     Es el ÚNICO mecanismo que genera folios (upsert atómico en
--     folio_counters, sin duplicados aunque dos vendedores vendan a la vez).
--     Firma: event_id + phase_id + comprador + teléfono opcional + método de pago.
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
  select event_id, precio, activa
    into v_phase_event, v_phase_precio, v_phase_activa
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

-- 5b. Validar entrada y registrar TODOS los intentos (válidos y rechazados).
--     - Fallidos: solo INSERT en entries, SIN tocar tickets.estado.
--     - VALIDO: INSERT en entries + UPDATE tickets a UTILIZADO (misma txn).
--     - Doble entrada: lock FOR UPDATE + índice parcial uniq_valid_entry_per_ticket.
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
begin
  select rol into v_caller_rol from public.profiles
  where id = v_uid and activo = true;

  -- Sin rol de acceso/admin: se registra NO_AUTORIZADO y se devuelve el código.
  -- No se toca ningún boleto en este camino.
  if v_caller_rol is null or v_caller_rol not in ('admin', 'access') then
    select id, folio into v_ticket_id, v_folio from public.tickets
    where qr_token = p_qr_token;
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (v_ticket_id, p_event_id, v_uid, 'NO_AUTORIZADO', p_qr_token);
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  -- Lock de fila: dos escáneres simultáneos no pueden validar el mismo QR dos veces.
  select * into v_ticket from public.tickets
  where qr_token = p_qr_token for update;

  if v_ticket.id is null then
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (null, p_event_id, v_uid, 'NO_EXISTE', p_qr_token);
    return jsonb_build_object('ok', false, 'code', 'NO_EXISTE');
  end if;

  v_ticket_id := v_ticket.id;
  v_folio := v_ticket.folio;

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
    -- Defensa en profundidad: si ya hay VALIDO pero el estado aún no se marcó,
    -- se reporta YA_UTILIZADO sin cambiar nada más (el reconciliador/cancel
    -- no aplica aquí; el estado se corrige en el camino VALIDO).
    v_code := 'YA_UTILIZADO';
  else
    -- Camino VALIDO: intenta registrar la única entrada válida.
    begin
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'VALIDO', p_qr_token);
    exception when unique_violation then
      -- Otro escáner ganó la carrera: se registra el rebote como YA_UTILIZADO,
      -- sin modificar el boleto (ya está UTILIZADO por el ganador).
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'YA_UTILIZADO', p_qr_token);
      return jsonb_build_object('ok', false, 'code', 'YA_UTILIZADO', 'folio', v_ticket.folio);
    end;

    update public.tickets set estado = 'UTILIZADO' where id = v_ticket.id;
    v_ok := true;
    return jsonb_build_object(
      'ok', true,
      'code', 'VALIDO',
      'folio', v_ticket.folio,
      'comprador', v_ticket.comprador_nombre,
      'ticket_id', v_ticket.id
    );
  end if;

  -- Caminos rechazados: solo bitácora, SIN tocar tickets.estado.
  insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
  values (v_ticket_id, p_event_id, v_uid, v_code, p_qr_token);

  return jsonb_build_object('ok', v_ok, 'code', v_code, 'folio', v_folio);
end $$;

revoke all on function public.validate_entry(uuid, uuid) from public, anon;
grant execute on function public.validate_entry(uuid, uuid) to authenticated;

-- 5c. Cancelar boleto (solo admin). No borra folio, no permite reuso.
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
  if v_ticket.estado <> 'ACTIVO' then
    raise exception 'Solo tickets ACTIVO se cancelan (actual=%)', v_ticket.estado;
  end if;

  update public.tickets set estado = 'CANCELADO' where id = p_ticket_id
  returning * into v_ticket;
  return v_ticket;
end $$;

revoke all on function public.cancel_ticket(uuid) from public, anon;
grant execute on function public.cancel_ticket(uuid) to authenticated;
