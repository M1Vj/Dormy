-- Committees + committee membership + dorm/committee expenses

create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dorm_id, name)
);

create index if not exists committees_dorm_created_idx
  on public.committees (dorm_id, created_at desc);

create table if not exists public.committee_members (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (committee_id, user_id),
  constraint committee_members_role_check check (role in ('head', 'co-head', 'member'))
);

create index if not exists committee_members_committee_role_idx
  on public.committee_members (committee_id, role);

create index if not exists committee_members_user_idx
  on public.committee_members (user_id);

alter table public.committees enable row level security;
alter table public.committee_members enable row level security;

drop policy if exists committees_select_policy on public.committees;
drop policy if exists committees_insert_policy on public.committees;
drop policy if exists committees_update_policy on public.committees;
drop policy if exists committees_delete_policy on public.committees;

create policy committees_select_policy on public.committees
  for select
  using (is_dorm_member(dorm_id));

create policy committees_insert_policy on public.committees
  for insert
  with check (
    has_role(dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
  );

create policy committees_update_policy on public.committees
  for update
  using (
    has_role(dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
    or exists (
      select 1
      from public.committee_members cm
      where cm.committee_id = committees.id
        and cm.user_id = auth.uid()
        and cm.role in ('head','co-head')
    )
  )
  with check (
    has_role(dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
    or exists (
      select 1
      from public.committee_members cm
      where cm.committee_id = committees.id
        and cm.user_id = auth.uid()
        and cm.role in ('head','co-head')
    )
  );

create policy committees_delete_policy on public.committees
  for delete
  using (
    has_role(dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
  );

drop policy if exists committee_members_select_policy on public.committee_members;
drop policy if exists committee_members_insert_policy on public.committee_members;
drop policy if exists committee_members_update_policy on public.committee_members;
drop policy if exists committee_members_delete_policy on public.committee_members;

create policy committee_members_select_policy on public.committee_members
  for select
  using (
    exists (
      select 1
      from public.committees c
      where c.id = committee_members.committee_id
        and is_dorm_member(c.dorm_id)
    )
  );

create policy committee_members_insert_policy on public.committee_members
  for insert
  with check (
    exists (
      select 1
      from public.committees c
      join public.dorm_memberships dm
        on dm.dorm_id = c.dorm_id
       and dm.user_id = committee_members.user_id
      where c.id = committee_members.committee_id
    )
    and (
      exists (
        select 1
        from public.committees c
        where c.id = committee_members.committee_id
          and has_role(c.dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
      )
      or exists (
        select 1
        from public.committee_members cm
        where cm.committee_id = committee_members.committee_id
          and cm.user_id = auth.uid()
          and cm.role in ('head','co-head')
      )
    )
  );

create policy committee_members_update_policy on public.committee_members
  for update
  using (
    exists (
      select 1
      from public.committees c
      where c.id = committee_members.committee_id
        and (
          has_role(c.dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
          or exists (
            select 1
            from public.committee_members cm
            where cm.committee_id = committee_members.committee_id
              and cm.user_id = auth.uid()
              and cm.role in ('head','co-head')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.committees c
      where c.id = committee_members.committee_id
        and (
          has_role(c.dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
          or exists (
            select 1
            from public.committee_members cm
            where cm.committee_id = committee_members.committee_id
              and cm.user_id = auth.uid()
              and cm.role in ('head','co-head')
          )
        )
    )
  );

create policy committee_members_delete_policy on public.committee_members
  for delete
  using (
    exists (
      select 1
      from public.committees c
      where c.id = committee_members.committee_id
        and (
          has_role(c.dorm_id, array['admin','adviser','assistant_adviser','student_assistant']::app_role[])
          or exists (
            select 1
            from public.committee_members cm
            where cm.committee_id = committee_members.committee_id
              and cm.user_id = auth.uid()
              and cm.role in ('head','co-head')
          )
        )
    )
  );

alter table public.events
  add column if not exists committee_id uuid references public.committees(id) on delete set null;

create index if not exists events_committee_id_idx
  on public.events (committee_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  semester_id uuid not null,
  committee_id uuid references public.committees(id) on delete set null,
  submitted_by uuid not null references public.profiles(user_id),
  title text not null,
  description text,
  amount_pesos numeric(12, 2) not null,
  purchased_at date not null,
  receipt_storage_path text,
  status text not null default 'pending',
  approved_by uuid references public.profiles(user_id),
  approval_comment text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_status_check check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists expenses_dorm_semester_idx
  on public.expenses (dorm_id, semester_id, created_at desc);

create index if not exists expenses_committee_created_idx
  on public.expenses (committee_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_semester_dorm_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete cascade;
  end if;
end $$;

alter table public.expenses enable row level security;

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
      or has_role(
        dorm_id,
        array['admin','treasurer','officer','student_assistant','adviser','assistant_adviser']::app_role[]
      )
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
      has_role(dorm_id, array['admin','treasurer','officer']::app_role[])
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
  using (has_role(dorm_id, array['admin','treasurer']::app_role[]))
  with check (has_role(dorm_id, array['admin','treasurer']::app_role[]));

create policy expenses_delete_policy on public.expenses
  for delete
  using (has_role(dorm_id, array['admin','treasurer']::app_role[]));

drop policy if exists events_insert_committee_heads on public.events;
drop policy if exists events_update_committee_heads on public.events;
drop policy if exists events_delete_committee_heads on public.events;

create policy events_insert_committee_heads on public.events
  for insert
  with check (
    committee_id is not null
    and is_dorm_member(dorm_id)
    and exists (
      select 1
      from public.committees c
      join public.committee_members cm on cm.committee_id = c.id
      where c.id = events.committee_id
        and c.dorm_id = events.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head','co-head')
    )
  );

create policy events_update_committee_heads on public.events
  for update
  using (
    committee_id is not null
    and is_dorm_member(dorm_id)
    and exists (
      select 1
      from public.committees c
      join public.committee_members cm on cm.committee_id = c.id
      where c.id = events.committee_id
        and c.dorm_id = events.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head','co-head')
    )
  )
  with check (
    committee_id is not null
    and is_dorm_member(dorm_id)
    and exists (
      select 1
      from public.committees c
      join public.committee_members cm on cm.committee_id = c.id
      where c.id = events.committee_id
        and c.dorm_id = events.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head','co-head')
    )
  );

create policy events_delete_committee_heads on public.events
  for delete
  using (
    committee_id is not null
    and is_dorm_member(dorm_id)
    and exists (
      select 1
      from public.committees c
      join public.committee_members cm on cm.committee_id = c.id
      where c.id = events.committee_id
        and c.dorm_id = events.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head','co-head')
    )
  );

