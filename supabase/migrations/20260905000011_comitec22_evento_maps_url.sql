-- ============================================================================
-- Comité C22 · Migración URL de Maps en eventos
-- Versión: 20260905000011 (aplica DESPUÉS de 20260905000010).
-- Migraciones históricas NO modificadas. Sin cambios de RLS, políticas,
-- triggers, funciones/RPC, tablas (salvo columna), folios, QR ni auditoría.
-- NO ejecutar todavía sin revisión.
--
-- Objetivo: el evento guarda la URL de Google Maps / Apple Maps que el
-- admin pega (campo nuevo `mapas_url`, opcional). El nombre del lugar sigue
-- en `lugar` sin cambios. El boleto genera un QR pequeño con esa URL para
-- "Cómo llegar"; el QR principal del boleto (qr_token) queda intacto.
-- ============================================================================

alter table public.events
  add column if not exists mapas_url text
  check (mapas_url is null or (char_length(mapas_url) between 1 and 500));
