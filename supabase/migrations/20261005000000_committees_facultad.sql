alter table public.committees
  add column if not exists facultad text
  check (facultad is null or char_length(facultad) between 1 and 160);
