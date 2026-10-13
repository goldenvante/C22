-- Título del boleto digital: el comité elige la familia tipográfica y el
-- tamaño del nombre del evento. El catálogo de fuentes válidas vive en la app
-- (src/constants/type.ts, TICKET_FONTS); aquí sólo se valida longitud y rango.

alter table public.committees
  add column if not exists titulo_fuente text not null default 'system',
  add column if not exists titulo_tamano integer not null default 36;

alter table public.committees
  drop constraint if exists committees_titulo_fuente_check;

alter table public.committees
  add constraint committees_titulo_fuente_check
  check (titulo_fuente is null or char_length(titulo_fuente) between 1 and 64);

alter table public.committees
  drop constraint if exists committees_titulo_tamano_check;

alter table public.committees
  add constraint committees_titulo_tamano_check check (titulo_tamano between 20 and 48);
