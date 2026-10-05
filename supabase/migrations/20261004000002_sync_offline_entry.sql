-- FASE 6: sincronizacion de validaciones offline hacia Supabase.
--
-- Problema que no puede resolverse desde SQLite:
--   * idempotencia: solo Supabase puede decidir si una operacion ya fue aceptada;
--   * conflicto A/B: solo el servidor, con FOR UPDATE + uniq_valid_entry_per_ticket,
--     puede otorgar el VALIDO definitivo;
--   * autoridad final: el estado del ticket pudo cambiar despues del escaneo offline.
--
-- Cambios (todos no destructivos):
--   * entries + operation_id uuid      -> identidad idempotente de la operacion local
--   * entries + device_id text         -> que dispositivo produjo la entrada
--   * entries + local_scanned_at       -> evidencia del escaneo offline (scanned_at
--                                         sigue siendo now(), autoridad del servidor)
--   * indice unico parcial sobre operation_id
--   * una funcion nueva security definer
--
-- NO hace DROP/DELETE, NO altera tipos, NO toca RLS, triggers, Supabase Auth,
-- roles ni permisos existentes (solo grant/revoke de la funcion nueva).
-- entries.qr_token se inserta NULL: el QR crudo nunca vuelve a entrar en Supabase.

alter table public.entries add column if not exists operation_id uuid;
alter table public.entries add column if not exists device_id text;
alter table public.entries add column if not exists local_scanned_at timestamptz;

create unique index if not exists uniq_entry_operation
  on public.entries (operation_id)
  where operation_id is not null;

create or replace function public.sync_offline_entry(
  p_operation_id uuid,
  p_event_id uuid,
  p_ticket_id uuid,
  p_qr_hash text,
  p_local_resultado text,
  p_device_id text,
  p_local_scanned_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles text[];
  v_uid uuid := auth.uid();
  v_existing public.entries;
  v_ticket public.tickets;
  v_entry_id uuid;
  v_ticket_id uuid;
  v_code public.entry_resultado;
  v_ok boolean := false;
  v_conflict boolean := false;
  v_folio integer;
  v_fase text;
begin
  select roles::text[] into v_roles
  from public.profiles
  where id = v_uid and activo = true;

  if v_roles is null or not (v_roles && array['admin', 'access']) then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO', 'conflict', false, 'duplicate', false);
  end if;

  if p_operation_id is null or p_event_id is null then
    return jsonb_build_object('ok', false, 'error', 'OPERACION_INVALIDA', 'retryable', false);
  end if;

  if not public.is_same_committee_event(p_event_id) then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTORIZADO', 'conflict', false, 'duplicate', false);
  end if;

  select * into v_existing from public.entries where operation_id = p_operation_id;
  if found then
    if v_existing.ticket_id is not null then
      select t.folio into v_folio from public.tickets t where t.id = v_existing.ticket_id;
      select ph.nombre into v_fase
      from public.tickets t
      join public.event_phases ph on ph.id = t.phase_id
      where t.id = v_existing.ticket_id;
    end if;
    return jsonb_build_object(
      'ok', v_existing.resultado = 'VALIDO',
      'code', v_existing.resultado::text,
      'conflict', false,
      'duplicate', true,
      'entry_id', v_existing.id::text,
      'ticket_id', v_existing.ticket_id::text,
      'folio', v_folio,
      'fase', v_fase
    );
  end if;

  if p_ticket_id is not null then
    select * into v_ticket from public.tickets where id = p_ticket_id for update;
  end if;

  if p_ticket_id is null or v_ticket.id is null then
    v_ticket_id := null;
    v_code := 'NO_EXISTE';
  else
    v_ticket_id := v_ticket.id;
    v_folio := v_ticket.folio;
    select ph.nombre into v_fase
    from public.event_phases ph
    where ph.id = v_ticket.phase_id;

    if p_qr_hash is not null and encode(sha256(v_ticket.qr_token::text::bytea), 'hex') <> p_qr_hash then
      return jsonb_build_object('ok', false, 'error', 'OPERACION_INVALIDA', 'retryable', false);
    end if;

    if v_ticket.event_id <> p_event_id then
      v_code := 'EVENTO_INCORRECTO';
    elsif v_ticket.estado = 'CANCELADO' then
      v_code := 'CANCELADO';
    elsif v_ticket.estado = 'UTILIZADO' then
      v_code := 'YA_UTILIZADO';
    elsif exists (
      select 1 from public.entries e
      where e.ticket_id = v_ticket.id and e.resultado = 'VALIDO'
    ) then
      v_code := 'YA_UTILIZADO';
    else
      v_code := 'VALIDO';
    end if;
  end if;

  v_conflict := (v_code = 'YA_UTILIZADO' and p_local_resultado = 'VALIDO');

  begin
    insert into public.entries
      (ticket_id, event_id, scanned_by, resultado, qr_token, operation_id, device_id, local_scanned_at)
    values
      (v_ticket_id, p_event_id, v_uid, v_code, null, p_operation_id, p_device_id, p_local_scanned_at)
    returning id into v_entry_id;
  exception when unique_violation then
    select * into v_existing from public.entries where operation_id = p_operation_id;
    if found then
      v_folio := null;
      v_fase := null;
      if v_existing.ticket_id is not null then
        select t.folio into v_folio from public.tickets t where t.id = v_existing.ticket_id;
        select ph.nombre into v_fase
        from public.tickets t
        join public.event_phases ph on ph.id = t.phase_id
        where t.id = v_existing.ticket_id;
      end if;
      return jsonb_build_object(
        'ok', v_existing.resultado = 'VALIDO',
        'code', v_existing.resultado::text,
        'conflict', false,
        'duplicate', true,
        'entry_id', v_existing.id::text,
        'ticket_id', v_existing.ticket_id::text,
        'folio', v_folio,
        'fase', v_fase
      );
    end if;
    raise;
  end;

  if v_code = 'VALIDO' then
    update public.tickets set estado = 'UTILIZADO' where id = v_ticket_id;
    v_ok := true;
  end if;

  return jsonb_build_object(
    'ok', v_ok,
    'code', v_code::text,
    'conflict', v_conflict,
    'duplicate', false,
    'entry_id', v_entry_id::text,
    'ticket_id', v_ticket_id::text,
    'folio', v_folio,
    'fase', v_fase
  );
end;
$$;

revoke all on function public.sync_offline_entry(uuid, uuid, uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.sync_offline_entry(uuid, uuid, uuid, text, text, text, timestamptz) to authenticated;
