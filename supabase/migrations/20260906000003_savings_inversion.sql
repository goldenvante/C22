-- ============================================================================
-- Meta: INVERSIÓN (solo suma, solo admin) + CIERRE DE EVENTO -> recaudado
-- Versión: 20260906000003 (aplica DESPUÉS de 20260906000002).
-- Migraciones históricas NO modificadas.
--
-- Modelo nuevo:
--  - savings_investments(committee_id, concepto, monto): bitácora INMUTABLE de
--    lo que sale de Meta hacia Inversión (renta de salón, etc.). Solo el admin
--    del comité inserta; NO hay política ni grant de UPDATE/DELETE => cumple
--    "la inversión no se modifica, solo se agrega". Auditoría quién/cuándo.
--      Meta disponible = recaudado − inversiones
--      Inversión        = suma de esta bitácora
--  - savings_incomes.event_id (único): el cierre de un evento genera UNA sola
--    vez un ingreso con el total pagado. El índice único es la idempotencia.
--
-- Monto del cierre: SUMA de precio_pagado de TODOS los boletos del evento,
-- escaneados o no, activos o cancelados: el pago ocurrió al vender y el sistema
-- no registra reembolsos. Las cortesías son $0 y por tanto no aportan.
--
-- Disparo: automático al pasar events.estado a 'finalizado' (unico, terminal)
-- + manual vía la RPC post_event_savings() para eventos ya finalizados antes
-- de esta migración. Ambos caminos comparten la misma idempotencia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. savings_incomes.event_id: qué evento generó este ingreso (único)
-- ----------------------------------------------------------------------------
alter table public.savings_incomes
  add column if not exists event_id uuid references public.events (id) on delete cascade;

create unique index if not exists uniq_savings_income_per_event
  on public.savings_incomes (event_id)
  where event_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Tabla de inversiones
-- ----------------------------------------------------------------------------
create table if not exists public.savings_investments (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  concepto text not null check (char_length(concepto) between 1 and 80),
  monto numeric(12, 2) not null check (monto > 0 and monto <= 999999999.99),
  registrado_por uuid references public.profiles (id) on delete set null,
  -- Snapshot del nombre: profiles.nombre solo lo leen uno mismo o admin.
  registrado_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_investments_committee
  on public.savings_investments (committee_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Trigger: tenant + auditoría desde servidor (no se confía en el cliente)
-- ----------------------------------------------------------------------------
create or replace function public.trg_savings_investment_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_committee uuid;
  v_nombre text;
begin
  select committee_id into v_committee
  from public.committees where id = new.committee_id;
  if v_committee is null then
    raise exception 'Comité no existe';
  end if;
  -- Solo se exige tenant cuando hay sesión: SQL editor y service_role no
  -- tienen auth.uid() y ya están por fuera de RLS.
  if auth.uid() is not null and v_committee is distinct from public.my_committee_id() then
    raise exception 'NO_AUTORIZADO: inversión de otro comité';
  end if;
  if new.registrado_por is null then
    new.registrado_por := auth.uid();
  end if;
  select nombre into v_nombre from public.profiles where id = new.registrado_por;
  new.registrado_nombre := coalesce(v_nombre, 'Administración');
  return new;
end $$;

drop trigger if exists trg_savings_investments_defaults on public.savings_investments;
create trigger trg_savings_investments_defaults
  before insert on public.savings_investments
  for each row execute function public.trg_savings_investment_defaults();

-- ----------------------------------------------------------------------------
-- 4. RLS: lectura para miembros; alta SOLO admin. Sin UPDATE/DELETE.
-- ----------------------------------------------------------------------------
alter table public.savings_investments enable row level security;

drop policy if exists "savings_investments_select_own" on public.savings_investments;
create policy "savings_investments_select_own"
  on public.savings_investments for select to authenticated
  using (committee_id = public.my_committee_id());

drop policy if exists "savings_investments_admin_insert" on public.savings_investments;
create policy "savings_investments_admin_insert"
  on public.savings_investments for insert to authenticated
  with check (public.is_admin() and committee_id = public.my_committee_id());

-- Guarda de idempotencia: si en una re-ejecución sobreviviera una política de
-- UPDATE/DELETE, "la inversión no se modifica" dejaría de ser cierto.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'savings_investments'
      and cmd in ('update', 'delete')
  ) then
    raise warning 'savings_investments tiene políticas de UPDATE/DELETE: revisar';
  end if;
end $$;

grant select, insert on table public.savings_investments to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Cierre de evento -> ingreso en Meta (idempotente, admin o trigger)
-- ----------------------------------------------------------------------------
create or replace function public.post_event_savings(p_event_id uuid)
returns table (monto numeric, ya_existia boolean)
language plpgsql
set search_path = public
as $$
declare
  v_event_id uuid;
  v_committee uuid;
  v_nombre text;
  v_codigo text;
  v_goal uuid;
  v_total numeric;
  v_ganador numeric;
begin
  select e.id, e.committee_id, e.nombre, e.codigo
    into v_event_id, v_committee, v_nombre, v_codigo
  from public.events e
  where e.id = p_event_id;

  if v_event_id is null then
    raise exception 'Evento no encontrado';
  end if;
  -- Solo se exige tenant cuando hay sesión: SQL editor y service_role no
  -- tienen auth.uid() y ya están por fuera de RLS. Con sesión, exige comité.
  if auth.uid() is not null and v_committee is distinct from public.my_committee_id() then
    raise exception 'NO_AUTORIZADO: evento de otro comité';
  end if;

  -- Idempotencia: si ya se transfirió, solo devuelve el monto registrado.
  select i.monto into v_total
  from public.savings_incomes i
  where i.event_id = v_event_id;
  if found then
    monto := v_total;
    ya_existia := true;
    return next;
    return;
  end if;

  -- Total pagado del evento: todos los boletos, sin importar uso ni estado.
  v_total := coalesce(
    (select sum(t.precio_pagado) from public.tickets t where t.event_id = v_event_id),
    0
  )::numeric;

  if v_total is null or v_total <= 0 then
    monto := 0;
    ya_existia := false;
    return next;
    return;
  end if;

  -- Meta activa del comité; si no hay, se crea una para no perder el dinero.
  select g.id into v_goal
  from public.savings_goals g
  where g.committee_id = v_committee and g.activa = true
  order by g.created_at desc
  limit 1;

  if v_goal is null then
    insert into public.savings_goals (committee_id, nombre, meta, activa)
    values (v_committee, 'Meta del comité', 1, true)
    returning id into v_goal;
  end if;

  begin
    insert into public.savings_incomes (goal_id, concepto, monto, event_id)
    values (v_goal, 'Cierre — ' || v_nombre || ' (' || v_codigo || ')', v_total, v_event_id);
  exception when unique_violation then
    -- Otra llamada ganó la carrera (p. ej. doble toque): el índice único
    -- mandó. Devolvemos lo ya registrado en vez de duplicar dinero.
    select i.monto into v_ganador
    from public.savings_incomes i
    where i.event_id = v_event_id;
    if v_ganador is not null then
      v_total := v_ganador;
    end if;
    monto := v_total;
    ya_existia := true;
    return next;
    return;
  end;

  monto := v_total;
  ya_existia := false;
  return next;
end $$;

revoke execute on function public.post_event_savings(uuid) from public, anon;
grant execute on function public.post_event_savings(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Disparo automático: al ENTRAR a 'finalizado' (estado terminal, único)
--    La función de trigger necesita `returns trigger`, por eso este envoltorio.
-- ----------------------------------------------------------------------------
create or replace function public.trg_event_close_to_savings()
returns trigger language plpgsql set search_path = public as $$
begin
  perform * from public.post_event_savings(new.id);
  return new;
end $$;

drop trigger if exists trg_event_close_to_savings on public.events;
create trigger trg_event_close_to_savings
  after update of estado on public.events
  for each row
  when (new.estado = 'finalizado' and old.estado is distinct from 'finalizado')
  execute function public.trg_event_close_to_savings();
