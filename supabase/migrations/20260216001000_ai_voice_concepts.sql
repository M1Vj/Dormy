create table if not exists public.ai_event_concepts (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  raw_text text not null,
  structured jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_event_concepts_dorm_idx
  on public.ai_event_concepts (dorm_id, created_at desc);

create index if not exists ai_event_concepts_event_idx
  on public.ai_event_concepts (event_id);

alter table public.ai_event_concepts enable row level security;

create policy ai_event_concepts_select_member on public.ai_event_concepts
  for select
  using (is_dorm_member(dorm_id));

create policy ai_event_concepts_insert_staff on public.ai_event_concepts
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer', 'student_assistant', 'treasurer', 'adviser', 'assistant_adviser']::app_role[]));

create policy ai_event_concepts_update_staff on public.ai_event_concepts
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));
