-- ============================================================================
-- Multi-rol: un usuario puede ser vendedor, control de acceso o AMBOS sin
-- necesidad de crearle otra cuenta. El admin asigna 1 o 2 roles.
-- Versión: 20260906000002 (aplica DESPUÉS de 20260906000001).
-- Migraciones históricas NO modificadas.
--
-- Modelo:
--  - profiles.roles app_role[] (reemplaza a profiles.rol): siempre 1-2
--    roles de trabajo ('seller' y/o 'access') o '{admin}'.
--  - is_admin() = 'admin' = ANY(roles). Nuevo has_role(r) para RPCs.
--  - Admin único POR COMITÉ (antes global: bloqueaba al 2.º comité).
--  - RPCs verifican intersección de roles (&&) en vez de rol singular.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columna roles + backfill desde rol
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists roles app_role[] not null default '{seller}';

update public.profiles
set roles = array[rol]
where roles = '{seller}' and rol is distinct from 'seller';

-- CHECK: 1-2 roles, sin duplicados, admin exclusivo (admin no se mezcla).
alter table public.profiles
  drop constraint if exists profiles_roles_check;
alter table public.profiles
  add constraint profiles_roles_check check (
    array_length(roles, 1) between 1 and 2
    and roles <@ array['admin', 'seller', 'access']::app_role[]
    and (
      roles = array['admin']::app_role[]
      or not ('admin' = any (roles))
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Helpers de rol
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and 'admin' = any (roles) and activo = true
  );
$$;

-- ¿El llamante activo tiene el rol r? (para RPCs con intersección).
create or replace function public.has_role(r app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and r = any (roles) and activo = true
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Trigger anti-escalamiento sobre roles[]
-- ----------------------------------------------------------------------------
create or replace function public.trg_block_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.roles is distinct from new.roles or old.activo is distinct from new.activo then
    if not public.is_admin() then
      raise exception 'No autorizado: solo admin puede cambiar roles/activo';
    end if;
    -- Un usuario no puede auto-otorgarse admin.
    if old.id = auth.uid()
      and not ('admin' = any (old.roles))
      and ('admin' = any (new.roles)) then
      raise exception 'No autorizado: un usuario no puede convertirse en admin';
    end if;
  end if;
  if new.id <> old.id then
    raise exception 'profiles.id es inmutable';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_no_escalation on public.profiles;
create trigger trg_profiles_no_escalation
  before update on public.profiles
  for each row execute function public.trg_block_role_escalation();

-- ----------------------------------------------------------------------------
-- 4. RLS de profiles sobre roles[]
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_insert_self_non_admin" on public.profiles;
create policy "profiles_insert_self_non_admin"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and not ('admin' = any (roles)));

-- select/update existentes no mencionan rol: siguen válidos (mismo comité).

-- ----------------------------------------------------------------------------
-- 5. Admin único POR COMITÉ (reemplaza al candado global)
-- ----------------------------------------------------------------------------
do $$ begin
  if (select count(*) from (select committee_id from public.profiles where 'admin' = any (roles) group by committee_id having count(*) > 1) t) > 0 then
    raise exception 'Integridad: hay un comité con más de un admin. Resolver manualmente antes de aplicar el candado por comité.';
  end if;
end $$;

drop index if exists public.profiles_single_admin_uq;
create unique index if not exists profiles_admin_per_committee_uq
  on public.profiles (committee_id)
  where 'admin' = any (roles);

-- ----------------------------------------------------------------------------
-- 6. RPCs con intersección de roles (mismo contrato, mismos retornos)
-- ----------------------------------------------------------------------------

-- 6a. create_ticket: admin o seller (incluye seller+access).
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
  v_roles app_role[];
  v_is_seller boolean;
  v_estado event_estado;
  v_phase_event uuid;
  v_phase_precio numeric(10, 2);
  v_phase_activa boolean;
  v_phase_inicio date;
  v_phase_fin date;
  v_next integer;
  v_ticket public.tickets;
begin
  select roles into v_roles from public.profiles
  where id = auth.uid() and activo = true;

  v_is_seller := v_roles is not null and (v_roles && array['admin', 'seller']::app_role[]);
  if not coalesce(v_is_seller, false) then
    raise exception 'NO_AUTORIZADO: solo vendedor/admin activo vende';
  end if;

  if not public.is_same_committee_event(p_event_id) then
    raise exception 'NO_AUTORIZADO: evento de otro comité';
  end if;

  select estado into v_estado from public.events where id = p_event_id;
  if v_estado is null then
    raise exception 'Evento no existe';
  end if;
  if v_estado <> 'publicado' and not ('admin' = any (v_roles)) then
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

-- 6b. create_courtesy_ticket: admin o seller.
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
  v_roles app_role[];
  v_is_admin boolean;
  v_estado event_estado;
  v_asignadas integer;
  v_usadas integer;
  v_next integer;
  v_ticket public.tickets;
begin
  select roles into v_roles from public.profiles
  where id = auth.uid() and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'seller']::app_role[]) then
    raise exception 'NO_AUTORIZADO: solo vendedor/admin activo genera cortesías';
  end if;
  v_is_admin := 'admin' = any (v_roles);

  if not public.is_same_committee_event(p_event_id) then
    raise exception 'NO_AUTORIZADO: evento de otro comité';
  end if;

  select estado into v_estado from public.events where id = p_event_id;
  if v_estado is null then
    raise exception 'Evento no existe';
  end if;
  if v_estado <> 'publicado' and not v_is_admin then
    raise exception 'Evento no disponible para venta (estado=%)', v_estado;
  end if;

  if p_nombre is null or char_length(trim(p_nombre)) = 0 then
    raise exception 'Comprador requerido';
  end if;

  if not v_is_admin then
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

-- 6c. validate_entry: admin o access (incluye seller+access).
create or replace function public.validate_entry(p_qr_token uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles app_role[];
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_code entry_resultado;
  v_ok boolean := false;
  v_folio integer;
  v_ticket_id uuid;
  v_fase text;
begin
  select roles into v_roles from public.profiles
  where id = v_uid and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'access']::app_role[]) then
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

-- 6d. validate_entry_by_id: admin o access.
create or replace function public.validate_entry_by_id(p_ticket_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles app_role[];
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_code entry_resultado;
  v_ok boolean := false;
  v_folio integer;
  v_ticket_id uuid;
  v_qr uuid;
  v_fase text;
begin
  select roles into v_roles from public.profiles
  where id = v_uid and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'access']::app_role[]) then
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

-- 6e. list_guestlist: admin o access.
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
  v_roles app_role[];
begin
  select roles into v_roles from public.profiles
  where id = auth.uid() and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'access']::app_role[]) then
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

-- 6f. get_entry_ticket: admin o access.
create or replace function public.get_entry_ticket(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles app_role[];
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
  select roles into v_roles from public.profiles
  where id = v_uid and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'access']::app_role[]) then
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

  if not ('admin' = any (v_roles)) and v_entry.scanned_by is distinct from v_uid then
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
-- 7. Retiro de la columna rol (reemplazada por roles[])
-- Las políticas de Storage creadas para el bucket `eventos`
-- (eventos_admin_insert/update/delete) dependen de profiles.rol y bloquean
-- el DROP. Se eliminan antes y se recrean con is_admin() (que ya usa roles[]).
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "eventos_admin_insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "eventos_admin_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "eventos_admin_delete" ON storage.objects';
  END IF;
END $$;

alter table public.profiles drop column if exists rol;

DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'eventos_admin_insert'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "eventos_admin_insert"
          ON storage.objects FOR INSERT TO authenticated
          WITH CHECK (bucket_id = 'eventos' AND public.is_admin())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'eventos_admin_update'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "eventos_admin_update"
          ON storage.objects FOR UPDATE TO authenticated
          USING (bucket_id = 'eventos' AND public.is_admin())
          WITH CHECK (bucket_id = 'eventos' AND public.is_admin())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'eventos_admin_delete'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "eventos_admin_delete"
          ON storage.objects FOR DELETE TO authenticated
          USING (bucket_id = 'eventos' AND public.is_admin())
      $pol$;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 8. Grants
-- ----------------------------------------------------------------------------
grant execute on function public.has_role(app_role) to authenticated;
