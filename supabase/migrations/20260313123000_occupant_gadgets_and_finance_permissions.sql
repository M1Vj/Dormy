create table if not exists public.occupant_gadgets (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  gadget_type text not null,
  gadget_label text not null,
  default_fee_pesos numeric(12, 2) not null default 50,
  override_fee_pesos numeric(12, 2),
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  created_by uuid references public.profiles(user_id),
  updated_by uuid references public.profiles(user_id),
  removed_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint occupant_gadgets_gadget_type_check check (length(trim(gadget_type)) > 0),
  constraint occupant_gadgets_gadget_label_check check (length(trim(gadget_label)) > 0),
  constraint occupant_gadgets_default_fee_check check (default_fee_pesos >= 0),
  constraint occupant_gadgets_override_fee_check check (override_fee_pesos is null or override_fee_pesos >= 0),
  constraint occupant_gadgets_removed_requires_inactive check (
    (is_active = true and removed_at is null and removed_by is null)
    or (is_active = false and removed_at is not null)
  )
);

create index if not exists occupant_gadgets_dorm_occupant_idx
  on public.occupant_gadgets (dorm_id, occupant_id, created_at desc);

create index if not exists occupant_gadgets_active_idx
  on public.occupant_gadgets (dorm_id, is_active, assigned_at desc);

alter table public.occupant_gadgets enable row level security;

drop policy if exists occupant_gadgets_select_policy on public.occupant_gadgets;
drop policy if exists occupant_gadgets_insert_policy on public.occupant_gadgets;
drop policy if exists occupant_gadgets_update_policy on public.occupant_gadgets;
drop policy if exists occupant_gadgets_delete_policy on public.occupant_gadgets;

create policy occupant_gadgets_select_policy on public.occupant_gadgets
  for select
  using (
    has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[])
    or is_occupant_self(occupant_id)
  );

create policy occupant_gadgets_insert_policy on public.occupant_gadgets
  for insert
  with check (
    has_role(dorm_id, array['admin', 'student_assistant']::app_role[])
  );

create policy occupant_gadgets_update_policy on public.occupant_gadgets
  for update
  using (
    has_role(dorm_id, array['admin', 'student_assistant']::app_role[])
  )
  with check (
    has_role(dorm_id, array['admin', 'student_assistant']::app_role[])
  );

create policy occupant_gadgets_delete_policy on public.occupant_gadgets
  for delete
  using (
    has_role(dorm_id, array['admin', 'student_assistant']::app_role[])
  );

drop policy if exists ledger_entries_insert_student_assistant_gadgets on public.ledger_entries;
drop policy if exists ledger_entries_update_student_assistant_gadgets on public.ledger_entries;
drop policy if exists ledger_entries_delete_student_assistant_gadgets on public.ledger_entries;

create policy ledger_entries_insert_student_assistant_gadgets on public.ledger_entries
  for insert
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      has_role(dorm_id, array['student_assistant']::app_role[])
      and ledger = 'gadgets'::ledger_category
    )
  );

create policy ledger_entries_update_student_assistant_gadgets on public.ledger_entries
  for update
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      has_role(dorm_id, array['student_assistant']::app_role[])
      and ledger = 'gadgets'::ledger_category
    )
  )
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      has_role(dorm_id, array['student_assistant']::app_role[])
      and ledger = 'gadgets'::ledger_category
    )
  );

create policy ledger_entries_delete_student_assistant_gadgets on public.ledger_entries
  for delete
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      has_role(dorm_id, array['student_assistant']::app_role[])
      and ledger = 'gadgets'::ledger_category
    )
  );

drop policy if exists expenses_select_policy on public.expenses;
drop policy if exists expenses_insert_policy on public.expenses;
drop policy if exists expenses_update_policy on public.expenses;
drop policy if exists expenses_delete_policy on public.expenses;

create policy expenses_select_policy on public.expenses
  for select
  using (
    is_dorm_member(dorm_id)
    and (
      status = 'approved'
      or submitted_by = auth.uid()
      or has_role(dorm_id, array['admin', 'treasurer', 'officer', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[])
      or (
        committee_id is not null
        and exists (
          select 1
          from public.committee_members cm
          where cm.committee_id = expenses.committee_id
            and cm.user_id = auth.uid()
            and cm.role in ('head','co-head')
        )
      )
    )
  );

create policy expenses_insert_policy on public.expenses
  for insert
  with check (
    is_dorm_member(dorm_id)
    and submitted_by = auth.uid()
    and (
      has_role(dorm_id, array['admin']::app_role[])
      or (
        category = 'maintenance_fee'
        and has_role(dorm_id, array['adviser', 'assistant_adviser', 'student_assistant']::app_role[])
      )
      or (
        category = 'contributions'
        and has_role(dorm_id, array['treasurer', 'officer', 'student_assistant']::app_role[])
      )
      or (
        committee_id is not null
        and exists (
          select 1
          from public.committees c
          join public.committee_members cm on cm.committee_id = c.id
          where c.id = expenses.committee_id
            and c.dorm_id = expenses.dorm_id
            and cm.user_id = auth.uid()
            and cm.role in ('head','co-head')
        )
      )
    )
  );

create policy expenses_update_policy on public.expenses
  for update
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      category = 'maintenance_fee'
      and has_role(dorm_id, array['adviser', 'assistant_adviser', 'student_assistant']::app_role[])
    )
    or (
      category = 'contributions'
      and has_role(dorm_id, array['treasurer']::app_role[])
    )
  )
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      category = 'maintenance_fee'
      and has_role(dorm_id, array['adviser', 'assistant_adviser', 'student_assistant']::app_role[])
    )
    or (
      category = 'contributions'
      and has_role(dorm_id, array['treasurer']::app_role[])
    )
  );

create policy expenses_delete_policy on public.expenses
  for delete
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or (
      category = 'maintenance_fee'
      and has_role(dorm_id, array['adviser', 'assistant_adviser', 'student_assistant']::app_role[])
    )
    or (
      category = 'contributions'
      and has_role(dorm_id, array['treasurer']::app_role[])
    )
  );
