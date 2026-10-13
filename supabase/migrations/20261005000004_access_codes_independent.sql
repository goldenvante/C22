-- Los códigos de acceso NO dependen de que el comité exista: viven en su
-- propia tabla con una etiqueta libre para saber a quién se asignó.

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  etiqueta text not null check (length(btrim(etiqueta)) between 1 and 80),
  codigo_hash text not null,
  vence_en timestamptz,
  creado_en timestamptz not null default now()
);

-- Sin policies: nadie los lee ni escribe por REST, sólo vía RPC o SQL Editor.
alter table public.access_codes enable row level security;

create or replace function public.verificar_codigo_acceso(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_vence timestamptz;
  v_codigo text;
begin
  if p_codigo is null or length(btrim(p_codigo)) < 4 or length(p_codigo) > 64 then
    return 'invalido';
  end if;

  v_codigo := upper(btrim(p_codigo));

  for v_hash, v_vence in
    select a.codigo_hash, a.vence_en
      from public.access_codes a
     where a.codigo_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  loop
    if extensions.crypt(v_codigo, v_hash) = v_hash then
      if v_vence is not null and v_vence <= now() then
        return 'vencido';
      end if;
      return 'ok';
    end if;
  end loop;

  return 'invalido';
end;
$$;

revoke all on function public.verificar_codigo_acceso(text) from public, anon, authenticated;
grant execute on function public.verificar_codigo_acceso(text) to anon, authenticated;

create or replace function public.gate_abierto()
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.access_codes);
$$;

revoke all on function public.gate_abierto() from public, anon, authenticated;
grant execute on function public.gate_abierto() to anon, authenticated;

drop index if exists public.committees_codigo_acceso_hash_uq;
alter table public.committees drop column if exists codigo_acceso_hash;
alter table public.committees drop column if exists codigo_acceso_expira;
