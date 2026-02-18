create table if not exists public.dorm_announcements (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  semester_id uuid,
  title text not null,
  body text not null,
  visibility text not null default 'members',
  pinned boolean not null default false,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dorm_announcements_visibility_check check (visibility in ('members', 'staff'))
);

create index if not exists dorm_announcements_dorm_semester_idx
  on public.dorm_announcements (dorm_id, semester_id, pinned desc, starts_at desc, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dorm_announcements_semester_dorm_fkey'
      and conrelid = 'public.dorm_announcements'::regclass
  ) then
    alter table public.dorm_announcements
      add constraint dorm_announcements_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete set null;
  end if;
end $$;

alter table public.dorm_announcements enable row level security;

drop policy if exists dorm_announcements_select_policy on public.dorm_announcements;
drop policy if exists dorm_announcements_insert_policy on public.dorm_announcements;
drop policy if exists dorm_announcements_update_policy on public.dorm_announcements;
drop policy if exists dorm_announcements_delete_policy on public.dorm_announcements;

create policy dorm_announcements_select_policy on public.dorm_announcements
  for select
  using (
    is_dorm_member(dorm_id)
    and (
      (
        visibility = 'members'
        and starts_at <= now()
        and (expires_at is null or expires_at > now())
      )
      or has_role(
        dorm_id,
        array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
      )
    )
  );

create policy dorm_announcements_insert_policy on public.dorm_announcements
  for insert
  with check (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
  );

create policy dorm_announcements_update_policy on public.dorm_announcements
  for update
  using (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
  )
  with check (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
  );

create policy dorm_announcements_delete_policy on public.dorm_announcements
  for delete
  using (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
  );

