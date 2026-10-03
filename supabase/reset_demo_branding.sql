-- ============================================================================
-- RESET VISUAL DEL COMITÉ DEMO
-- ============================================================================
-- ARCHIVO MANUAL. NO ES UNA MIGRACIÓN: supabase CLI solo aplica lo que hay
-- en supabase/migrations/, así que este archivo NUNCA se ejecuta solo.
--
-- Cómo usarlo: Supabase Dashboard > SQL Editor > New query > pegar > Run.
-- (El SQL Editor corre con service_role y sortea RLS.)
--
-- Qué hace: cambia SOLO los 3 colores del comité de prueba para que la app se
-- vea con la identidad neutra del producto (MONARQ), como si el comité no
-- hubiera configurado todavía una identidad propia.
--
-- Qué NO toca: ningún usuario, perfil, evento, fase, venta, boleto, cupo de
-- cortesía, ahorro, entrada/acceso ni permiso. El nombre del comité, el logo
-- y todos los IDs quedan intactos.
--
-- Valores = NEUTRAL_BRAND de src/branding/palette.ts (derivado de MONARQ):
--   color_primario   #A08F7A  (MONARQ.accent, taupe)
--   color_secundario #8C8A85  (MONARQ.textSecondary)
--   color_fondo      #141311  (MONARQ.background, carbón)
-- Mismos valores que el botón "Usar identidad MONARQ (neutra)" en
-- Configuración.
-- ============================================================================

-- 1) ANTES: cómo está hoy (si ya es neutro, no cambiará nada)
select id, nombre, color_primario, color_secundario, color_fondo, logo_url
from public.committees
where id = '00000000-0000-0000-0000-000000000022';

-- 2) RESET: solo colores. Idempotente.
update public.committees
set color_primario   = '#A08F7A',
    color_secundario = '#8C8A85',
    color_fondo      = '#141311'
where id = '00000000-0000-0000-0000-000000000022';

-- 3) DESPUÉS: debe decir #A08F7A / #8C8A85 / #141311
select id, nombre, color_primario, color_secundario, color_fondo, logo_url
from public.committees
where id = '00000000-0000-0000-0000-000000000022';
