-- Dormy (Molave-ready, multi-dorm capable)
-- Run in Supabase SQL editor. This is an MVP schema.

-- 1) Types
create type public.user_role as enum (
  'admin',
  'adviser',
  'assistant_adviser',
  'student_assistant',
  'treasurer',
  'occupant'
);

-- 2) Core org structure
create table if not exists public.dorms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  university text,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  code text not null, -- e.g. 4a, 10b, SA
  level int,
  capacity int,
  created_at timestamptz not null default now(),
  unique(dorm_id, code)
);

-- 3) User profiles (mapped to auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dorm_id uuid references public.dorms(id) on delete set null,
  role public.user_role not null default 'occupant',
  full_name text,
  student_id text,
  created_at timestamptz not null default now()
);

-- 4) Occupants
create table if not exists public.occupants (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  profile_user_id uuid references public.profiles(user_id) on delete set null,
  full_name text not null,
  student_id text,
  room_id uuid references public.rooms(id) on delete set null,
  is_bigbrod boolean not null default false,
  is_active boolean not null default true,
  moved_in_at date,
  moved_out_at date,
  created_at timestamptz not null default now()
);

create index if not exists occupants_dorm_idx on public.occupants(dorm_id);
create index if not exists occupants_name_idx on public.occupants using gin (to_tsvector('simple', full_name));

-- 5) Fines
create table if not exists public.fines_catalog (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  code text,
  title text not null,
  description text,
  severity text not null default 'minor', -- minor|major|severe (severe handled by policy/process)
  amount_pesos numeric not null default 0,
  points_deduction numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(dorm_id, title)
);

create table if not exists public.fine_records (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  fine_id uuid references public.fines_catalog(id) on delete set null,
  occurred_at date not null default current_date,
  notes text,
  amount_override numeric,
  points_override numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fine_records_dorm_idx on public.fine_records(dorm_id);
create index if not exists fine_records_occ_idx on public.fine_records(occupant_id);

-- 6) Payments (end-of-sem clearance + running monitoring)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  source text not null default 'fines', -- fines|maintenance|event|other
  label text,
  amount_due numeric not null default 0,
  amount_paid numeric not null default 0,
  due_date date,
  paid_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 7) Events + competitions
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  photo_url text,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.event_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.event_teams(id) on delete cascade,
  points numeric not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(event_id, team_id)
);

create table if not exists public.event_ratings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  rater_user_id uuid not null references auth.users(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(event_id, rater_user_id)
);

-- 8) Evaluations (dynamic metrics + weighting)
create table if not exists public.evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  title text not null,
  semester text, -- e.g. 2025-2026 2nd Sem
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.evaluation_metrics (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  name text not null,
  description text,
  max_score numeric not null default 10,
  weight numeric not null default 1,
  created_at timestamptz not null default now(),
  unique(cycle_id, name)
);

create table if not exists public.evaluation_submissions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  rater_user_id uuid not null references auth.users(id) on delete cascade,
  ratee_occupant_id uuid not null references public.occupants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(cycle_id, rater_user_id, ratee_occupant_id)
);

create table if not exists public.evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.evaluation_submissions(id) on delete cascade,
  metric_id uuid not null references public.evaluation_metrics(id) on delete cascade,
  score numeric not null,
  created_at timestamptz not null default now(),
  unique(submission_id, metric_id)
);

-- RLS
alter table public.dorms enable row level security;
alter table public.rooms enable row level security;
alter table public.profiles enable row level security;
alter table public.occupants enable row level security;
alter table public.fines_catalog enable row level security;
alter table public.fine_records enable row level security;
alter table public.payments enable row level security;
alter table public.events enable row level security;
alter table public.event_teams enable row level security;
alter table public.event_scores enable row level security;
alter table public.event_ratings enable row level security;
alter table public.evaluation_cycles enable row level security;
alter table public.evaluation_metrics enable row level security;
alter table public.evaluation_submissions enable row level security;
alter table public.evaluation_scores enable row level security;

-- Helper: current user's dorm_id
create or replace function public.current_dorm_id()
returns uuid
language sql
stable
as $$
  select dorm_id from public.profiles where user_id = auth.uid();
$$;

-- Helper: current user's role
create or replace function public.current_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

-- Policies (MVP): users can read their dorm's data; writes limited by role

-- Profiles: users can read/update own profile; admin can read dorm profiles
create policy "profiles_read_own" on public.profiles for select
  using (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles for update
  using (user_id = auth.uid());

-- Dorms: read only if member
create policy "dorms_read_member" on public.dorms for select
  using (id = public.current_dorm_id());

-- Rooms: read member; admin/SA can write
create policy "rooms_read" on public.rooms for select
  using (dorm_id = public.current_dorm_id());
create policy "rooms_write" on public.rooms for all
  using (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'))
  with check (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'));

-- Occupants: read member; admin/SA can write
create policy "occupants_read" on public.occupants for select
  using (dorm_id = public.current_dorm_id());
create policy "occupants_write" on public.occupants for all
  using (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'))
  with check (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'));

-- Fines catalog: read member; admin/SA write
create policy "fines_catalog_read" on public.fines_catalog for select
  using (dorm_id = public.current_dorm_id());
create policy "fines_catalog_write" on public.fines_catalog for all
  using (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'))
  with check (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'));

-- Fine records: read member; SA write
create policy "fine_records_read" on public.fine_records for select
  using (dorm_id = public.current_dorm_id());
create policy "fine_records_write" on public.fine_records for all
  using (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'))
  with check (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'));

-- Payments: read member; treasurer/admin write
create policy "payments_read" on public.payments for select
  using (dorm_id = public.current_dorm_id());
create policy "payments_write" on public.payments for all
  using (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','treasurer'))
  with check (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','treasurer'));

-- Events: read member; officers not modeled yet → admin/SA can write
create policy "events_read" on public.events for select
  using (dorm_id = public.current_dorm_id());
create policy "events_write" on public.events for all
  using (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'))
  with check (dorm_id = public.current_dorm_id() and public.current_role() in ('admin','student_assistant'));

create policy "event_teams_read" on public.event_teams for select
  using (exists(select 1 from public.events e where e.id = event_id and e.dorm_id = public.current_dorm_id()));
create policy "event_teams_write" on public.event_teams for all
  using (public.current_role() in ('admin','student_assistant'))
  with check (true);

create policy "event_scores_read" on public.event_scores for select
  using (exists(select 1 from public.events e where e.id = event_id and e.dorm_id = public.current_dorm_id()));
create policy "event_scores_write" on public.event_scores for all
  using (public.current_role() in ('admin','student_assistant'))
  with check (true);

create policy "event_ratings_read" on public.event_ratings for select
  using (exists(select 1 from public.events e where e.id = event_id and e.dorm_id = public.current_dorm_id()));
create policy "event_ratings_write" on public.event_ratings for insert
  with check (rater_user_id = auth.uid());

-- Evaluations: read member; admin can manage cycles/metrics; anyone can submit but not self-rate (enforced in app)
create policy "eval_cycles_read" on public.evaluation_cycles for select
  using (dorm_id = public.current_dorm_id());
create policy "eval_cycles_write" on public.evaluation_cycles for all
  using (dorm_id = public.current_dorm_id() and public.current_role() = 'admin')
  with check (dorm_id = public.current_dorm_id() and public.current_role() = 'admin');

create policy "eval_metrics_read" on public.evaluation_metrics for select
  using (exists(select 1 from public.evaluation_cycles c where c.id = cycle_id and c.dorm_id = public.current_dorm_id()));
create policy "eval_metrics_write" on public.evaluation_metrics for all
  using (public.current_role() = 'admin')
  with check (true);

create policy "eval_submissions_read" on public.evaluation_submissions for select
  using (exists(select 1 from public.evaluation_cycles c where c.id = cycle_id and c.dorm_id = public.current_dorm_id()));
create policy "eval_submissions_write" on public.evaluation_submissions for insert
  with check (rater_user_id = auth.uid());

create policy "eval_scores_read" on public.evaluation_scores for select
  using (exists(
    select 1 from public.evaluation_submissions s
    join public.evaluation_cycles c on c.id = s.cycle_id
    where s.id = submission_id and c.dorm_id = public.current_dorm_id()
  ));
create policy "eval_scores_write" on public.evaluation_scores for insert
  with check (true);

-- Seed suggestion (manual):
-- insert into public.dorms(name, university) values ('Molave Men\'s Hall', 'VSU') returning id;
-- then set your profile dorm_id + role='admin' in public.profiles.
