create table if not exists public.dorm_semesters (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  school_year text not null,
  semester text not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned',
  archived_at timestamptz,
  archived_by uuid references public.profiles(user_id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dorm_semesters_status_check check (status in ('planned', 'active', 'archived')),
  constraint dorm_semesters_date_range_check check (ends_on >= starts_on),
  unique (dorm_id, school_year, semester)
);

create unique index if not exists dorm_semesters_one_active_per_dorm
  on public.dorm_semesters (dorm_id)
  where status = 'active';

create unique index if not exists dorm_semesters_id_dorm_unique
  on public.dorm_semesters (id, dorm_id);

create index if not exists dorm_semesters_dorm_status_idx
  on public.dorm_semesters (dorm_id, status, starts_on desc);

create table if not exists public.dorm_semester_archives (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  semester_id uuid not null references public.dorm_semesters(id) on delete cascade,
  label text not null,
  archived_by uuid references public.profiles(user_id),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (semester_id)
);

create index if not exists dorm_semester_archives_dorm_created_idx
  on public.dorm_semester_archives (dorm_id, created_at desc);

alter table public.events
  add column if not exists semester_id uuid;

alter table public.fines
  add column if not exists semester_id uuid;

alter table public.cleaning_weeks
  add column if not exists semester_id uuid;

alter table public.cleaning_exceptions
  add column if not exists semester_id uuid;

alter table public.evaluation_cycles
  add column if not exists semester_id uuid;

create index if not exists events_dorm_semester_idx
  on public.events (dorm_id, semester_id, starts_at desc);

create index if not exists fines_dorm_semester_idx
  on public.fines (dorm_id, semester_id, issued_at desc);

create index if not exists cleaning_weeks_dorm_semester_idx
  on public.cleaning_weeks (dorm_id, semester_id, week_start desc);

create index if not exists cleaning_exceptions_dorm_semester_idx
  on public.cleaning_exceptions (dorm_id, semester_id, date desc);

create index if not exists evaluation_cycles_dorm_semester_idx
  on public.evaluation_cycles (dorm_id, semester_id, created_at desc);

drop index if exists public.cleaning_weeks_dorm_week_start_unique;
create unique index if not exists cleaning_weeks_dorm_semester_week_start_unique
  on public.cleaning_weeks (dorm_id, semester_id, week_start);

drop index if exists public.cleaning_exceptions_dorm_date_unique;
create unique index if not exists cleaning_exceptions_dorm_semester_date_unique
  on public.cleaning_exceptions (dorm_id, semester_id, date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_semester_dorm_fkey'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fines_semester_dorm_fkey'
      and conrelid = 'public.fines'::regclass
  ) then
    alter table public.fines
      add constraint fines_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cleaning_weeks_semester_dorm_fkey'
      and conrelid = 'public.cleaning_weeks'::regclass
  ) then
    alter table public.cleaning_weeks
      add constraint cleaning_weeks_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cleaning_exceptions_semester_dorm_fkey'
      and conrelid = 'public.cleaning_exceptions'::regclass
  ) then
    alter table public.cleaning_exceptions
      add constraint cleaning_exceptions_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'evaluation_cycles_semester_dorm_fkey'
      and conrelid = 'public.evaluation_cycles'::regclass
  ) then
    alter table public.evaluation_cycles
      add constraint evaluation_cycles_semester_dorm_fkey
      foreign key (semester_id, dorm_id)
      references public.dorm_semesters(id, dorm_id)
      on delete set null;
  end if;
end
$$;

create or replace function public.ensure_active_semester(p_dorm_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semester_id uuid;
  v_year int;
  v_school_year text;
  v_start date;
  v_end date;
begin
  select id
  into v_semester_id
  from public.dorm_semesters
  where dorm_id = p_dorm_id
    and status = 'active'
  limit 1;

  if v_semester_id is not null then
    return v_semester_id;
  end if;

  v_year := extract(year from current_date)::int;

  if extract(month from current_date)::int >= 6 then
    v_school_year := format('%s-%s', v_year, v_year + 1);
    v_start := make_date(v_year, 6, 1);
    v_end := make_date(v_year + 1, 5, 31);
  else
    v_school_year := format('%s-%s', v_year - 1, v_year);
    v_start := make_date(v_year - 1, 6, 1);
    v_end := make_date(v_year, 5, 31);
  end if;

  begin
    insert into public.dorm_semesters (
      dorm_id,
      school_year,
      semester,
      label,
      starts_on,
      ends_on,
      status,
      metadata
    )
    values (
      p_dorm_id,
      v_school_year,
      '1st',
      format('%s 1st Semester', v_school_year),
      v_start,
      v_end,
      'active',
      jsonb_build_object('auto_created', true)
    )
    returning id into v_semester_id;
  exception
    when unique_violation then
      select id
      into v_semester_id
      from public.dorm_semesters
      where dorm_id = p_dorm_id
        and status = 'active'
      limit 1;
  end;

  return v_semester_id;
end;
$$;

grant execute on function public.ensure_active_semester(uuid) to anon, authenticated;

with seed as (
  select
    d.id as dorm_id,
    extract(year from current_date)::int as current_year,
    extract(month from current_date)::int as current_month
  from public.dorms d
), defaults as (
  select
    dorm_id,
    case
      when current_month >= 6 then format('%s-%s', current_year, current_year + 1)
      else format('%s-%s', current_year - 1, current_year)
    end as school_year,
    case
      when current_month >= 6 then make_date(current_year, 6, 1)
      else make_date(current_year - 1, 6, 1)
    end as starts_on,
    case
      when current_month >= 6 then make_date(current_year + 1, 5, 31)
      else make_date(current_year, 5, 31)
    end as ends_on
  from seed
)
insert into public.dorm_semesters (
  dorm_id,
  school_year,
  semester,
  label,
  starts_on,
  ends_on,
  status,
  metadata
)
select
  dorm_id,
  school_year,
  '1st',
  format('%s 1st Semester', school_year),
  starts_on,
  ends_on,
  'active',
  jsonb_build_object('auto_created', true)
from defaults
where not exists (
  select 1
  from public.dorm_semesters s
  where s.dorm_id = defaults.dorm_id
    and s.status = 'active'
)
on conflict (dorm_id, school_year, semester) do nothing;

update public.events e
set semester_id = s.id
from public.dorm_semesters s
where e.semester_id is null
  and e.dorm_id = s.dorm_id
  and s.status = 'active';

update public.fines f
set semester_id = s.id
from public.dorm_semesters s
where f.semester_id is null
  and f.dorm_id = s.dorm_id
  and s.status = 'active';

update public.cleaning_weeks cw
set semester_id = s.id
from public.dorm_semesters s
where cw.semester_id is null
  and cw.dorm_id = s.dorm_id
  and s.status = 'active';

update public.cleaning_exceptions ce
set semester_id = s.id
from public.dorm_semesters s
where ce.semester_id is null
  and ce.dorm_id = s.dorm_id
  and s.status = 'active';

update public.evaluation_cycles ec
set semester_id = s.id
from public.dorm_semesters s
where ec.semester_id is null
  and ec.dorm_id = s.dorm_id
  and s.status = 'active';

alter table public.dorm_semesters enable row level security;
alter table public.dorm_semester_archives enable row level security;

drop policy if exists dorm_semesters_select_member on public.dorm_semesters;
create policy dorm_semesters_select_member on public.dorm_semesters
  for select
  using (public.is_dorm_member(dorm_id));

drop policy if exists dorm_semesters_insert_manager on public.dorm_semesters;
create policy dorm_semesters_insert_manager on public.dorm_semesters
  for insert
  with check (public.has_role(dorm_id, array['admin', 'adviser']::public.app_role[]));

drop policy if exists dorm_semesters_update_manager on public.dorm_semesters;
create policy dorm_semesters_update_manager on public.dorm_semesters
  for update
  using (public.has_role(dorm_id, array['admin', 'adviser']::public.app_role[]))
  with check (public.has_role(dorm_id, array['admin', 'adviser']::public.app_role[]));

drop policy if exists dorm_semesters_delete_admin on public.dorm_semesters;
create policy dorm_semesters_delete_admin on public.dorm_semesters
  for delete
  using (public.has_role(dorm_id, array['admin']::public.app_role[]));

drop policy if exists dorm_semester_archives_select_member on public.dorm_semester_archives;
create policy dorm_semester_archives_select_member on public.dorm_semester_archives
  for select
  using (public.is_dorm_member(dorm_id));

drop policy if exists dorm_semester_archives_insert_manager on public.dorm_semester_archives;
create policy dorm_semester_archives_insert_manager on public.dorm_semester_archives
  for insert
  with check (public.has_role(dorm_id, array['admin', 'adviser']::public.app_role[]));

drop policy if exists dorm_semester_archives_update_admin on public.dorm_semester_archives;
create policy dorm_semester_archives_update_admin on public.dorm_semester_archives
  for update
  using (public.has_role(dorm_id, array['admin']::public.app_role[]))
  with check (public.has_role(dorm_id, array['admin']::public.app_role[]));

drop policy if exists dorm_semester_archives_delete_admin on public.dorm_semester_archives;
create policy dorm_semester_archives_delete_admin on public.dorm_semester_archives
  for delete
  using (public.has_role(dorm_id, array['admin']::public.app_role[]));
