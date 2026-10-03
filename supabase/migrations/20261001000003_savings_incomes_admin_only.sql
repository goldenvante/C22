drop policy if exists "savings_incomes_member_insert" on public.savings_incomes;

create policy "savings_incomes_admin_insert"
  on public.savings_incomes for insert to authenticated
  with check (
    public.is_admin()
    and exists (
      select 1 from public.savings_goals g
      where g.id = savings_incomes.goal_id
        and g.committee_id = public.my_committee_id()
    )
  );
