-- ============================================================================
-- Comité C22 · Migración candado de admin único
-- Versión: 20260905000002 (aplica DESPUÉS de 20260905000001).
-- Las migraciones 20260905000000 y 20260905000001 NO se modifican.
-- NO ejecutar todavía contra Supabase (pendiente de revisión).
--
-- Objetivo: garantizar a nivel de base de datos que exista como máximo UN
-- profile con rol='admin'. Permite múltiples 'seller'/'access'.
--
-- Finalidad: cerrar la condición de carrera del bootstrap — dos solicitudes
-- simultáneas podrían pasar ambas el chequeo adminExists() de la Edge
-- Function; con este índice parcial, la segunda inserción falla con
-- unique_violation (código 23505) aunque el chequeo previo haya pasado.
-- La Edge Function ya maneja 23505 como 409 USUARIO_TAKEN; conviene mapearlo
-- a ADMIN_EXISTS en una revisión futura del código (sin cambios aquí).
--
-- Si ya existieran múltiples admins, esta migración FALLA con un mensaje
-- claro y no modifica ningún dato existente: hay que resolverlo manualmente
-- antes de aplicarla (auditar y desactivar/cambiar los sobrantes vía
-- service_role), nunca de forma automática.
-- ============================================================================

-- Guarda previa: abortar con mensaje claro si ya hay más de un admin.
-- No toca datos; solo informa antes de que el índice falle.
do $$ begin
  if (select count(*) from public.profiles where rol = 'admin') > 1 then
    raise exception 'Integridad: existe más de un profile con rol=admin. Resolver manualmente antes de aplicar el candado de admin único.';
  end if;
end $$;

-- Un solo admin: índice único parcial sobre rol='admin'.
-- seller/access ilimitados (no entran en el índice).
create unique index if not exists profiles_single_admin_uq
  on public.profiles (rol)
  where rol = 'admin';

comment on index public.profiles_single_admin_uq is
  'Candado de admin único: como máximo un profile con rol=admin (anti-carrera del bootstrap).';
