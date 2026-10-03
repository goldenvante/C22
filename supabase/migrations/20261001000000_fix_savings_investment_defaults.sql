CREATE OR REPLACE FUNCTION public.trg_savings_investment_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_committee uuid;
  v_nombre text;
begin
  if new.committee_id is null then
    new.committee_id := public.my_committee_id();
  end if;

  select id into v_committee
  from public.committees where id = new.committee_id;
  if v_committee is null then
    raise exception 'Comité no existe';
  end if;
  if auth.uid() is not null and v_committee is distinct from public.my_committee_id() then
    raise exception 'NO_AUTORIZADO: inversión de otro comité';
  end if;
  if new.registrado_por is null then
    new.registrado_por := auth.uid();
  end if;
  select nombre into v_nombre from public.profiles where id = new.registrado_por;
  new.registrado_nombre := coalesce(v_nombre, 'Administración');
  return new;
end
$function$;
