create extension if not exists "pgcrypto";

create type app_role as enum (
  'admin',
  'student_assistant',
  'treasurer',
  'adviser',
  'assistant_adviser',
  'occupant',
  'event_officer'
);

create type occupant_status as enum ('active', 'left', 'removed');

create type fine_severity as enum ('minor', 'major', 'severe');

create type ledger_category as enum (
  'adviser_maintenance',
  'sa_fines',
  'treasurer_events'
);

create type entry_type as enum ('charge', 'payment', 'adjustment', 'refund');

create table public.dorms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dorm_memberships (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dorm_id, user_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  code text not null,
  level integer not null,
  capacity integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dorm_id, code)
);

create table public.occupants (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  user_id uuid references public.profiles(user_id) on delete set null,
  full_name text not null,
  student_id text,
  classification text,
  status occupant_status not null default 'active',
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index occupants_dorm_student_id_unique
  on public.occupants (dorm_id, student_id)
  where student_id is not null;

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index room_assignments_one_active_per_occupant
  on public.room_assignments (occupant_id)
  where end_date is null;

create table public.fine_rules (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  title text not null,
  severity fine_severity not null,
  default_pesos numeric(10, 2) not null default 0,
  default_points numeric(10, 2) not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fines (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  rule_id uuid references public.fine_rules(id) on delete set null,
  issued_at timestamptz not null default now(),
  pesos numeric(10, 2) not null default 0,
  points numeric(10, 2) not null default 0,
  note text,
  issued_by uuid references public.profiles(user_id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(user_id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_competition boolean not null default false,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table public.event_ratings (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, occupant_id),
  constraint event_ratings_rating_range check (rating between 1 and 5)
);

create table public.event_teams (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  team_id uuid not null references public.event_teams(id) on delete cascade,
  occupant_id uuid references public.occupants(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint event_team_members_identity_check check (
    occupant_id is not null or (display_name is not null and length(trim(display_name)) > 0)
  )
);

create table public.event_score_categories (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  max_points numeric(10, 2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_scores (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.event_teams(id) on delete cascade,
  category_id uuid references public.event_score_categories(id) on delete set null,
  points numeric(10, 2) not null default 0,
  recorded_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  ledger ledger_category not null,
  entry_type entry_type not null,
  occupant_id uuid references public.occupants(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  fine_id uuid references public.fines(id) on delete set null,
  posted_at timestamptz not null default now(),
  amount_pesos numeric(12, 2) not null,
  method text,
  note text,
  created_by uuid references public.profiles(user_id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(user_id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  school_year text not null,
  semester integer not null,
  label text,
  counts_for_retention boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluation_templates (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  name text not null,
  status text not null,
  rater_group_weights jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_templates_status_check check (status in ('draft', 'active', 'archived'))
);

create table public.evaluation_metrics (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  template_id uuid not null references public.evaluation_templates(id) on delete cascade,
  name text not null,
  description text,
  weight_pct numeric(5, 2) not null default 0,
  scale_min integer not null default 1,
  scale_max integer not null default 5,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluation_submissions (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  template_id uuid not null references public.evaluation_templates(id) on delete cascade,
  rater_occupant_id uuid not null references public.occupants(id) on delete cascade,
  ratee_occupant_id uuid not null references public.occupants(id) on delete cascade,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, rater_occupant_id, ratee_occupant_id)
);

create table public.evaluation_metric_scores (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  submission_id uuid not null references public.evaluation_submissions(id) on delete cascade,
  metric_id uuid not null references public.evaluation_metrics(id) on delete cascade,
  score numeric(5, 2) not null default 0
);

create table public.cleaning_areas (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cleaning_weeks (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  week_start date not null,
  rest_level integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cleaning_assignments (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  cleaning_week_id uuid not null references public.cleaning_weeks(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  area_id uuid not null references public.cleaning_areas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.cleaning_exceptions (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  actor_user_id uuid references public.profiles(user_id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dorms enable row level security;
alter table public.profiles enable row level security;
alter table public.dorm_memberships enable row level security;
alter table public.rooms enable row level security;
alter table public.occupants enable row level security;
alter table public.room_assignments enable row level security;
alter table public.fine_rules enable row level security;
alter table public.fines enable row level security;
alter table public.events enable row level security;
alter table public.event_photos enable row level security;
alter table public.event_ratings enable row level security;
alter table public.event_teams enable row level security;
alter table public.event_team_members enable row level security;
alter table public.event_score_categories enable row level security;
alter table public.event_scores enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.evaluation_cycles enable row level security;
alter table public.evaluation_templates enable row level security;
alter table public.evaluation_metrics enable row level security;
alter table public.evaluation_submissions enable row level security;
alter table public.evaluation_metric_scores enable row level security;
alter table public.cleaning_areas enable row level security;
alter table public.cleaning_weeks enable row level security;
alter table public.cleaning_assignments enable row level security;
alter table public.cleaning_exceptions enable row level security;
alter table public.audit_events enable row level security;
