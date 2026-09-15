-- ============================================================================
-- Comité C22 · Migración fase en validate_entry
-- Versión: 20260905000005 (aplica DESPUÉS de 20260905000004).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- tablas, políticas, permisos, folios, qr_token ni auditoría.
-- NO ejecutar todavía sin revisión.
--
-- Único enriquecimiento: la respuesta incluye `fase` con el valor actual de
-- event_phases.nombre, resuelto dentro de la función SECURITY DEFINER
-- (access sigue sin SELECT directo sobre tickets; RLS intacto).
-- La lógica de validación, estados, concurrencia, auditoría y transiciones
-- queda byte-idéntica a la versión anterior.
--
-- Respuestas:
--   VALIDO            {ok:true,  code, folio, comprador, ticket_id, fase}
--   YA_UTILIZADO      {ok:false, code, folio, fase}
--   CANCELADO         {ok:false, code, folio, fase}
--   EVENTO_INCORRECTO {ok:false, code, folio, fase}
--   NO_EXISTE         {ok:false, code}            (sin cambios)
--   NO_AUTORIZADO     {ok:false, code}            (sin cambios, sin info extra)
-- ============================================================================

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

  -- Sin rol de acceso/admin: se registra NO_AUTORIZADO y se devuelve el código.
  -- No se toca ningún boleto en este camino. Sin fase ni info del ticket.
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

  -- Fase actual del boleto (valor vivo de event_phases.nombre, no snapshot).
  -- phase_id es NOT NULL con ON DELETE RESTRICT: siempre resuelve.
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
  values (v_ticket_id, p_event_id, v_uid, v_code, p_qr_token);

  return jsonb_build_object('ok', v_ok, 'code', v_code, 'folio', v_folio, 'fase', v_fase);
end $$;

revoke all on function public.validate_entry(uuid, uuid) from public, anon;
grant execute on function public.validate_entry(uuid, uuid) to authenticated;
