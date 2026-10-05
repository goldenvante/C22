-- Paquete offline: descarga paginada de los boletos de un evento junto con la
-- huella SHA-256 de su QR, para que un dispositivo admin o access pueda validar
-- sin conexión. Añade UNA función nueva.
--
-- No crea tablas, no agrega columnas, no altera nada existente, no toca RLS,
-- triggers, Supabase Auth, roles ni permisos existentes. Cero DROP/DELETE/ALTER.
--
-- El qr_token crudo nunca sale de la base: solo viaja su hash.

create or replace function public.download_offline_package(
  p_event_id uuid,
  p_offset integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles text[];
  v_total integer;
  v_offset integer;
  v_limit integer;
  v_tickets jsonb;
begin
  select roles::text[] into v_roles
  from public.profiles
  where id = auth.uid() and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'access']) then
    return jsonb_build_object('total', 0, 'offset', 0, 'tickets', '[]'::jsonb, 'code', 'NO_AUTORIZADO');
  end if;

  if not public.is_same_committee_event(p_event_id) then
    return jsonb_build_object('total', 0, 'offset', 0, 'tickets', '[]'::jsonb, 'code', 'NO_AUTORIZADO');
  end if;

  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_limit := least(greatest(coalesce(p_limit, 1000), 1), 1000);

  select count(*) into v_total
  from public.tickets
  where event_id = p_event_id;

  if v_total > 20000 then
    return jsonb_build_object('total', v_total, 'offset', v_offset, 'tickets', '[]'::jsonb, 'code', 'PAQUETE_DEMASIADO_GRANDE');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id::text,
        'folio', t.folio,
        'comprador_nombre', t.comprador_nombre,
        'comprador_telefono', t.comprador_telefono,
        'estado', t.estado::text,
        'es_cortesia', t.es_cortesia,
        'phase_id', t.phase_id::text,
        'qr_hash', t.qr_hash
      )
    ),
    '[]'::jsonb
  )
  into v_tickets
  from (
    select
      id,
      folio,
      comprador_nombre,
      comprador_telefono,
      estado,
      es_cortesia,
      phase_id,
      encode(sha256(qr_token::text::bytea), 'hex') as qr_hash
    from public.tickets
    where event_id = p_event_id
    order by folio
    offset v_offset
    limit v_limit
  ) t;

  return jsonb_build_object('total', v_total, 'offset', v_offset, 'tickets', v_tickets);
end;
$$;

revoke all on function public.download_offline_package(uuid, integer, integer) from public, anon;
grant execute on function public.download_offline_package(uuid, integer, integer) to authenticated;
