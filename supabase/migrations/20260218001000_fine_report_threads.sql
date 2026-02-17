create table if not exists public.fine_report_comments (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  semester_id uuid not null,
  constraint fine_report_comments_semester_dorm_fkey
    foreign key (semester_id, dorm_id)
    references public.dorm_semesters(id, dorm_id)
    on delete cascade,
  report_id uuid not null references public.fine_reports(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists fine_report_comments_report_created_idx
  on public.fine_report_comments (report_id, created_at asc);

alter table public.fine_report_comments enable row level security;

drop policy if exists fine_report_comments_select_staff on public.fine_report_comments;
create policy fine_report_comments_select_staff on public.fine_report_comments
  for select
  using (
    exists (
      select 1
      from public.dorm_memberships dm
      where dm.dorm_id = fine_report_comments.dorm_id
        and dm.user_id = auth.uid()
        and dm.role in ('admin', 'student_assistant')
    )
  );

drop policy if exists fine_report_comments_select_reporter on public.fine_report_comments;
create policy fine_report_comments_select_reporter on public.fine_report_comments
  for select
  using (
    exists (
      select 1
      from public.fine_reports fr
      join public.occupants o on o.id = fr.reporter_occupant_id
      where fr.id = fine_report_comments.report_id
        and fr.dorm_id = fine_report_comments.dorm_id
        and fr.semester_id = fine_report_comments.semester_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists fine_report_comments_insert_staff on public.fine_report_comments;
create policy fine_report_comments_insert_staff on public.fine_report_comments
  for insert
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.fine_reports fr
      where fr.id = fine_report_comments.report_id
        and fr.dorm_id = fine_report_comments.dorm_id
        and fr.semester_id = fine_report_comments.semester_id
    )
    and exists (
      select 1
      from public.dorm_memberships dm
      where dm.dorm_id = fine_report_comments.dorm_id
        and dm.user_id = auth.uid()
        and dm.role in ('admin', 'student_assistant')
    )
  );

drop policy if exists fine_report_comments_insert_reporter on public.fine_report_comments;
create policy fine_report_comments_insert_reporter on public.fine_report_comments
  for insert
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.fine_reports fr
      join public.occupants o on o.id = fr.reporter_occupant_id
      where fr.id = fine_report_comments.report_id
        and fr.dorm_id = fine_report_comments.dorm_id
        and fr.semester_id = fine_report_comments.semester_id
        and o.user_id = auth.uid()
    )
  );

alter table public.fine_reports
  add column if not exists fine_id uuid references public.fines(id) on delete set null;

create index if not exists fine_reports_fine_id_idx
  on public.fine_reports (fine_id);

alter table public.fines
  add column if not exists occurred_at timestamptz;

alter table public.fines
  add column if not exists proof_storage_path text;

