create or replace function public.login_is_admin(p_usuario text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.usuario = lower(coalesce(trim(p_usuario), ''))
      and p.activo is true
      and 'admin' = any (p.roles)
  );
$$;

revoke all on function public.login_is_admin(text) from public, anon, authenticated;
grant execute on function public.login_is_admin(text) to anon;

create or replace function public.admin_email_is_admin(p_email text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(coalesce(trim(p_email), ''))
      and p.activo is true
      and 'admin' = any (p.roles)
  );
$$;

revoke all on function public.admin_email_is_admin(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_email_is_admin(text) to service_role;
