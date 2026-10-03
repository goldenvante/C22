CREATE OR REPLACE FUNCTION public.create_ticket(p_event_id uuid, p_phase_id uuid, p_nombre text, p_tel text DEFAULT NULL::text, p_metodo_pago metodo_pago DEFAULT 'EFECTIVO'::metodo_pago)
 RETURNS tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;
