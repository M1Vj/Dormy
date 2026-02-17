-- Fine reports: peer-reported violations pending SA review
-- Reporters are anonymous to other occupants (only SAs see who reported)

create table if not exists fine_reports (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references dorms(id) on delete cascade,
  semester_id uuid not null references semesters(id) on delete cascade,
  
  reporter_occupant_id uuid not null references occupants(id) on delete cascade,
  reported_occupant_id uuid not null references occupants(id) on delete cascade,
  rule_id uuid references fine_rules(id) on delete set null,
  
  details text not null,
  occurred_at timestamptz not null,
  proof_storage_path text, -- optional uploaded evidence
  
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_comment text,
  reviewed_at timestamptz,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for efficient querying
create index if not exists idx_fine_reports_dorm_semester on fine_reports(dorm_id, semester_id);
create index if not exists idx_fine_reports_reporter on fine_reports(reporter_occupant_id);
create index if not exists idx_fine_reports_reported on fine_reports(reported_occupant_id);
create index if not exists idx_fine_reports_status on fine_reports(status);

-- RLS policies
alter table fine_reports enable row level security;

-- SA and admins can see all reports for their dorm
create policy "Staff can view all fine reports"
  on fine_reports for select
  using (
    exists (
      select 1 from dorm_memberships dm
      where dm.dorm_id = fine_reports.dorm_id
        and dm.user_id = auth.uid()
        and dm.role in ('admin', 'student_assistant')
    )
  );

-- Occupants can see their own submitted reports
create policy "Reporter can view own reports"
  on fine_reports for select
  using (
    reporter_occupant_id in (
      select o.id from occupants o where o.user_id = auth.uid()
    )
  );

-- Occupants can insert reports
create policy "Occupants can submit fine reports"
  on fine_reports for insert
  with check (
    reporter_occupant_id in (
      select o.id from occupants o where o.user_id = auth.uid()
    )
  );

-- Only SA/admin can update (for review)
create policy "Staff can review fine reports"
  on fine_reports for update
  using (
    exists (
      select 1 from dorm_memberships dm
      where dm.dorm_id = fine_reports.dorm_id
        and dm.user_id = auth.uid()
        and dm.role in ('admin', 'student_assistant')
    )
  );
