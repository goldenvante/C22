-- ============================================================================
-- Comité C22 · Migración login por usuario + contraseña
-- Versión: 20260905000001 (aplica DESPUÉS de 20260905000000_comitec22_base.sql)
-- La migración base NO se modifica. NO ejecutar todavía contra Supabase.
--
-- Objetivo: el usuario inicia sesión con `usuario` + `contraseña`, sin escribir
-- ningún email. Supabase Auth sigue siendo el ÚNICO responsable de contraseñas:
-- en profiles y en nuestras tablas JAMÁS se almacena ninguna contraseña.
--
-- Patrón elegido: email interno sintético y determinista
--     <usuario-normalizado>@c22.internal
-- La app construye ese email en el cliente y llama a signInWithPassword().
-- Así NO se necesita ninguna lectura pre-auth de profiles ni ningún RPC
-- público que resuelva usuario->email (ese RPC filtraría emails y permitiría
-- enumerar usuarios). Ver análisis en la respuesta de diseño.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columna usuario (nullable primero: permite backfill si ya hay filas)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists usuario text;

-- ----------------------------------------------------------------------------
-- 2. Normalización consistente: trim + minúsculas en INSERT/UPDATE.
--    Evita duplicados por 'Vendedor1' vs 'vendedor1' vs ' vendedor1 '.
-- ----------------------------------------------------------------------------
create or replace function public.trg_normalize_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario is not null then
    new.usuario := lower(trim(new.usuario));
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_normalize_usuario on public.profiles;
create trigger trg_profiles_normalize_usuario
  before insert or update of usuario on public.profiles
  for each row execute function public.trg_normalize_usuario();

-- ----------------------------------------------------------------------------
-- 3. Formato apto para login: letras minúsculas, números, punto, guion y
--    guion bajo. Sin espacios. Longitud 3-32. (El trigger ya aplicó lower/trim
--    antes de evaluar el CHECK, al ser BEFORE.)
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_usuario_formato;
alter table public.profiles
  add constraint profiles_usuario_formato
  check (usuario is null or usuario ~ '^[a-z0-9._-]{3,32}$');

-- ----------------------------------------------------------------------------
-- 4. Unicidad insensible a mayúsculas/minúsculas.
--    Índice parcial (WHERE NOT NULL) para no bloquear la fase de backfill.
-- ----------------------------------------------------------------------------
create unique index if not exists profiles_usuario_lower_uq
  on public.profiles (lower(usuario))
  where usuario is not null;

-- ----------------------------------------------------------------------------
-- 5. Backfill obligatorio antes del NOT NULL.
--    Si profiles ya tiene filas (p. ej. el Admin Principal) sin usuario, este
--    bloque aborta con un mensaje claro. Asignar manualmente ANTES de aplicar,
--    por ejemplo:
--      update public.profiles set usuario = 'admin' where id = '<uuid-admin>';
--    Nunca inventar usuarios dentro de la migración automática.
-- ----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from public.profiles where usuario is null) then
    raise exception 'Backfill pendiente: existen profiles sin usuario. Asignar usuario manualmente antes de aplicar NOT NULL.';
  end if;
end $$;

alter table public.profiles alter column usuario set not null;

comment on column public.profiles.usuario is
  'Login del usuario (normalizado lower+trim). Email interno sintético: <usuario>@c22.internal. Supabase Auth valida la contraseña; aquí nunca se guardan contraseñas.';

-- ----------------------------------------------------------------------------
-- 6. Endurecer el guard anti-escalamiento: solo admin puede cambiar `usuario`.
--    Se reemplaza la función vía CREATE OR REPLACE (la base no se toca; el
--    trigger trg_profiles_no_escalation existente sigue apuntando a ella).
--    Conserva íntegra la lógica base de rol/activo/id.
-- ----------------------------------------------------------------------------
create or replace function public.trg_block_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.rol is distinct from new.rol or old.activo is distinct from new.activo then
    if not public.is_admin() then
      raise exception 'No autorizado: solo admin puede cambiar rol/activo';
    end if;
    -- Doble candado: aunque la política de INSERT filtre, el trigger también bloquea
    -- que alguien se auto-asigne admin mediante UPDATE.
    if old.id = auth.uid() and new.rol = 'admin' and old.rol <> 'admin' then
      raise exception 'No autorizado: un usuario no puede convertirse en admin';
    end if;
  end if;
  -- El nombre de login solo lo cambia el admin (evita suplantación / secuestro
  -- de identidad de login entre vendedores y personal de acceso).
  if old.usuario is distinct from new.usuario and not public.is_admin() then
    raise exception 'No autorizado: solo admin puede cambiar el usuario de login';
  end if;
  -- id y created_at inmutables
  if new.id <> old.id then
    raise exception 'profiles.id es inmutable';
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 7. RLS: eliminar el auto-registro de profiles.
--    Se borra 'profiles_insert_self_non_admin' (creada en la base): ningún
--    usuario autenticado puede insertar su propio profile desde la app.
--    Los profiles de vendedores/acceso se crearán solo vía flujo administrativo
--    server-side (Edge Function con service_role, que bypasa RLS: no necesita
--    política INSERT). Se mantienen SELECT propio/admin y UPDATE propio/admin
--    (con el trigger anti-escalamiento de la sección 6).
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_insert_self_non_admin" on public.profiles;
