-- Arranque: mientras NINGÚN comité tenga código guardado, la app no exige
-- gate (así se crea el primer comité desde /setup). En cuanto existe al
-- menos un código, el gate se enciende y se exige para todo.
create or replace function public.gate_abierto()
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.committees where codigo_acceso_hash is not null
  );
$$;

revoke all on function public.gate_abierto() from public, anon, authenticated;
grant execute on function public.gate_abierto() to anon, authenticated;
