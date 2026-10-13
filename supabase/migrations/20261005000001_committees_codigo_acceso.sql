-- Gate de acceso: la app pide un código por comité ANTES del login.
-- El código nunca viaja al APK: sólo su hash (bcrypt) vive en la BD,
-- y él se crea/modifica ÚNICAMENTE desde SQL (nunca desde la app).

alter table public.committees
  add column if not exists codigo_acceso_hash text,
  add column if not exists codigo_acceso_expira timestamptz;

create unique index if not exists committees_codigo_acceso_hash_uq
  on public.committees (codigo_acceso_hash)
  where codigo_acceso_hash is not null;

-- Pre-login: se llama con el rol anon, por eso SECURITY DEFINER.
-- Devuelve: 'ok' | 'invalido' | 'vencido'.
create or replace function public.verificar_codigo_acceso(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id uuid;
  v_expira timestamptz;
begin
  if p_codigo is null or length(btrim(p_codigo)) < 4 or length(p_codigo) > 64 then
    return 'invalido';
  end if;

  for v_hash, v_id, v_expira in
    select c.codigo_acceso_hash, c.id, c.codigo_acceso_expira
      from public.committees c
     where c.codigo_acceso_hash is not null
       and c.codigo_acceso_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  loop
    if extensions.crypt(btrim(p_codigo), v_hash) = v_hash then
      if v_expira is not null and v_expira <= now() then
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
