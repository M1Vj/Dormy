do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'dorm_application_status'
  ) then
    create type public.dorm_application_status as enum (
      'pending',
      'approved',
      'rejected',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.dorm_applications (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  email text not null,
  applicant_name text,
  applicant_avatar_url text,
  requested_role public.app_role not null default 'occupant',
  status public.dorm_application_status not null default 'pending',
  message text,
  granted_role public.app_role,
  reviewed_by uuid references public.profiles(user_id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email)),
  check (requested_role <> 'admin'),
  check (granted_role is null or granted_role <> 'admin')
);

create unique index if not exists dorm_applications_one_pending
  on public.dorm_applications (dorm_id, user_id)
  where status = 'pending';

create index if not exists dorm_applications_by_dorm_status
  on public.dorm_applications (dorm_id, status, created_at desc);

create table if not exists public.dorm_invites (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  email text not null,
  role public.app_role not null,
  created_by uuid references public.profiles(user_id),
  claimed_by uuid references public.profiles(user_id),
  claimed_at timestamptz,
  revoked_by uuid references public.profiles(user_id),
  revoked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email)),
  check (role <> 'admin')
);

create unique index if not exists dorm_invites_one_active
  on public.dorm_invites (dorm_id, email)
  where revoked_at is null and claimed_at is null;

create index if not exists dorm_invites_by_email
  on public.dorm_invites (email);

alter table public.dorm_applications enable row level security;
alter table public.dorm_invites enable row level security;

create policy dorms_select_authenticated on public.dorms
  for select
  to authenticated
  using (true);

create policy dorm_applications_select_own on public.dorm_applications
  for select
  using (user_id = auth.uid());

create policy dorm_applications_insert_own on public.dorm_applications
  for insert
  with check (user_id = auth.uid() and status = 'pending');

create policy dorm_applications_cancel_own on public.dorm_applications
  for update
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

create policy dorm_applications_select_staff on public.dorm_applications
  for select
  using (has_role(dorm_id, array['admin','adviser','student_assistant']::public.app_role[]));

create policy dorm_applications_update_staff on public.dorm_applications
  for update
  using (has_role(dorm_id, array['admin','adviser','student_assistant']::public.app_role[]))
  with check (has_role(dorm_id, array['admin','adviser','student_assistant']::public.app_role[]));

create policy dorm_invites_select_staff on public.dorm_invites
  for select
  using (has_role(dorm_id, array['admin','adviser']::public.app_role[]));

create policy dorm_invites_insert_staff on public.dorm_invites
  for insert
  with check (has_role(dorm_id, array['admin','adviser']::public.app_role[]));

create policy dorm_invites_update_staff on public.dorm_invites
  for update
  using (has_role(dorm_id, array['admin','adviser']::public.app_role[]))
  with check (has_role(dorm_id, array['admin','adviser']::public.app_role[]));
