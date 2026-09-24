-- ============================================================================
-- Ahorro del comité: meta con nombre y monto objetivo + ingresos extra
-- (bazares, etc.) con barra de progreso.
-- Versión: 20260906000001 (aplica DESPUÉS de 20260906000000).
-- Migraciones históricas NO modificadas.
--
-- Modelo:
--  - savings_goals(committee_id, nombre, meta, activa): UNA meta activa por
--    comité (índice parcial). Solo admin del comité la crea/edita.
--  - savings_incomes(goal_id, concepto, monto, registrado_por,
--    registrado_nombre): bitácora inmutable de ingresos. Cualquier miembro
--    activo del comité puede agregar (auditoría con quién y cuándo).
--    committee_id y registrado_nombre se rellenan por trigger (snapshot,
--    no se confía en el cliente). Sin UPDATE/DELETE desde la app.
--  - Progreso (recaudado/restante/%) se calcula en cliente sumando ingresos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tablas
-- ----------------------------------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 80),
  meta numeric(12, 2) not null check (meta > 0),
  activa boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Una sola meta activa por comité (historial: al crear otra se desactiva la anterior).
create unique index if not exists uniq_active_goal_per_committee
  on public.savings_goals (committee_id)
  where activa = true;

create index if not exists idx_savings_goals_committee
  on public.savings_goals (committee_id);

create table if not exists public.savings_incomes (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  committee_id uuid references public.committees (id) on delete cascade,
  concepto text not null check (char_length(concepto) between 1 and 80),
  monto numeric(12, 2) not null check (monto > 0 and monto <= 999999999.99),
  registrado_por uuid references public.profiles (id) on delete set null,
  -- Snapshot del nombre (profiles.nombre solo lo leen uno mismo o admin;
  -- así TODOS los miembros ven quién registró cada ingreso).
  registrado_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_incomes_goal
  on public.savings_incomes (goal_id, created_at desc);
create index if not exists idx_savings_incomes_committee
  on public.savings_incomes (committee_id);

-- ----------------------------------------------------------------------------
-- 2. Trigger: tenant + auditoría desde servidor (no se confía en el cliente)
-- ----------------------------------------------------------------------------
create or replace function public.trg_savings_income_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_committee uuid;
  v_nombre text;
begin
  select committee_id into v_committee
  from public.savings_goals where id = new.goal_id;
  if v_committee is null then
    raise exception 'Meta de ahorro no existe';
  end if;
  if v_committee <> public.my_committee_id() then
    raise exception 'NO_AUTORIZADO: meta de otro comité';
  end if;
  new.committee_id := v_committee;
  if new.registrado_por is null then
    new.registrado_por := auth.uid();
  end if;
  select nombre into v_nombre from public.profiles where id = new.registrado_por;
  new.registrado_nombre := coalesce(v_nombre, 'Miembro del comité');
  return new;
end $$;

drop trigger if exists trg_savings_incomes_defaults on public.savings_incomes;
create trigger trg_savings_incomes_defaults
  before insert on public.savings_incomes
  for each row execute function public.trg_savings_income_defaults();

-- Al activar una meta, se desactivan las demás del comité (una activa).
create or replace function public.trg_savings_single_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activa = true then
    update public.savings_goals
    set activa = false
    where committee_id = new.committee_id and id <> new.id and activa = true;
  end if;
  return new;
end $$;

drop trigger if exists trg_savings_goals_single_active on public.savings_goals;
create trigger trg_savings_goals_single_active
  after insert or update of activa on public.savings_goals
  for each row execute function public.trg_savings_single_active();

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
alter table public.savings_goals enable row level security;
alter table public.savings_incomes enable row level security;

-- Metas: lectura para miembros del comité; escritura solo admin del comité.
drop policy if exists "savings_goals_select_own" on public.savings_goals;
create policy "savings_goals_select_own"
  on public.savings_goals for select to authenticated
  using (committee_id = public.my_committee_id());

drop policy if exists "savings_goals_admin_write" on public.savings_goals;
create policy "savings_goals_admin_write"
  on public.savings_goals for all to authenticated
  using (public.is_admin() and committee_id = public.my_committee_id())
  with check (public.is_admin() and committee_id = public.my_committee_id());

-- Ingresos: lectura para miembros; alta para cualquier miembro activo del
-- comité (el trigger valida que la meta sea del mismo comité).
-- Sin UPDATE/DELETE: bitácora inmutable.
drop policy if exists "savings_incomes_select_own" on public.savings_incomes;
create policy "savings_incomes_select_own"
  on public.savings_incomes for select to authenticated
  using (committee_id = public.my_committee_id());

drop policy if exists "savings_incomes_member_insert" on public.savings_incomes;
create policy "savings_incomes_member_insert"
  on public.savings_incomes for insert to authenticated
  with check (
    public.is_active_member()
    and exists (
      select 1 from public.savings_goals g
      where g.id = savings_incomes.goal_id
        and g.committee_id = public.my_committee_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Grants mínimos
-- ----------------------------------------------------------------------------
grant select, insert, update on table public.savings_goals to authenticated;
grant select, insert on table public.savings_incomes to authenticated;
