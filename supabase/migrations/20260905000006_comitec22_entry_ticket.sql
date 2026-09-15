-- ============================================================================
-- Comité C22 · Migración boleto asociado a una entry (historial access)
-- Versión: 20260905000006 (aplica DESPUÉS de 20260905000005).
-- Migraciones históricas NO modificadas. Sin cambios de esquema, RLS,
-- tablas, políticas, permisos de tablas, folios, qr_token ni auditoría.
-- NO ejecutar todavía sin revisión.
--
-- Objetivo: permitir al rol access ver el boleto de SUS propios escaneos
-- sin darle SELECT directo sobre tickets (RLS intacto). Todo se resuelve
-- dentro de esta función SECURITY DEFINER.
--
-- Reglas verificadas en servidor:
--   1. Llamante admin o access activo (mismo patrón que validate_entry).
--   2. La entry existe; si no, NO_EXISTE.
--   3. Si la entry no tiene ticket (p. ej. NO_EXISTE), SIN_BOLETO.
--   4. Un access solo ve entries donde scanned_by = auth.uid().
--      Un admin puede ver cualquiera (ya tiene SELECT total).
--   5. El ticket debe existir y corresponder a la entry.
--
-- Devuelve ÚNICAMENTE lo necesario para el boleto + contexto del acceso:
--   {ok:true, code:'OK', entry:{id, resultado, scanned_at},
--    ticket:{id, folio, comprador, estado, qr_token},
--    evento:{nombre, fecha, hora, lugar, imagen_url}, fase}
-- Sin precio, método de pago, seller ni IDs internos extra.
-- ============================================================================

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
      'qr_token', v_ticket.qr_token
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
