-- ============================================================================
-- Comité C22 · Migración lista de puerta (door list) + entrada manual
-- Versión: 20260905000012 (aplica DESPUÉS de 20260905000011).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- tablas, políticas, permisos de tablas, folios ni auditoría.
-- Solo agrega 2 funciones nuevas. Revisar antes de aplicar.
--
-- Objetivo: lista de boletos por evento para el control de acceso
-- (quien perdió su QR se busca por nombre, se coteja INE y se registra
-- la entrada manualmente), sin darle SELECT directo sobre tickets al rol
-- access (RLS intacto) y SIN exponer qr_token en la lista.
--
-- Reglas:
--   list_guestlist:
--     1. Llamante admin o access activo; otro rol → conjunto vacío.
--     2. Devuelve folio, comprador, fase, estado y cortesía de TODOS los
--        boletos del evento (incluye UTILIZADO/CANCELADO para negar con
--        motivo en puerta). NUNCA qr_token, precio, método ni vendedor.
--   validate_entry_by_id:
--     1. Idéntica lógica, estados, candado de fila y auditoría que
--        validate_entry (20260905000005), pero busca por ticket_id en vez
--        de qr_token. La auditoría guarda el qr_token real del boleto
--        (conocido en servidor), no expuesto al cliente.
--     2. Códigos de respuesta idénticos: VALIDO, YA_UTILIZADO, CANCELADO,
--        EVENTO_INCORRECTO, NO_EXISTE, NO_AUTORIZADO.
-- La cancelación sigue siendo solo-admin (cancel_ticket); puerta no cancela.
-- ============================================================================

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

  -- Sin rol de acceso/admin: se registra NO_AUTORIZADO y se devuelve el código.
  -- No se toca ningún boleto en este camino. Sin fase ni info del ticket.
  if v_caller_rol is null or v_caller_rol not in ('admin', 'access') then
    select id, qr_token, folio into v_ticket_id, v_qr, v_folio from public.tickets
    where id = p_ticket_id;
    insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
    values (v_ticket_id, p_event_id, v_uid, 'NO_AUTORIZADO', v_qr);
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO');
  end if;

  -- Lock de fila: dos controles simultáneos no pueden validar el mismo boleto dos veces.
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

  -- Fase actual del boleto (valor vivo de event_phases.nombre; null en
  -- cortesías sin fase, igual que get_entry_ticket).
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
    -- Defensa en profundidad: si ya hay VALIDO pero el estado aún no se marcó,
    -- se reporta YA_UTILIZADO sin cambiar nada más.
    v_code := 'YA_UTILIZADO';
  else
    -- Camino VALIDO: intenta registrar la única entrada válida.
    begin
      insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
      values (v_ticket.id, p_event_id, v_uid, 'VALIDO', v_qr);
    exception when unique_violation then
      -- Otro control ganó la carrera: se registra el rebote como YA_UTILIZADO,
      -- sin modificar el boleto (ya está UTILIZADO por el ganador).
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

  -- Caminos rechazados: solo bitácora, SIN tocar tickets.estado.
  insert into public.entries (ticket_id, event_id, scanned_by, resultado, qr_token)
  values (v_ticket_id, p_event_id, v_uid, v_code, v_qr);

  return jsonb_build_object('ok', v_ok, 'code', v_code, 'folio', v_folio, 'fase', v_fase);
end $$;

revoke all on function public.validate_entry_by_id(uuid, uuid) from public, anon;
grant execute on function public.validate_entry_by_id(uuid, uuid) to authenticated;
