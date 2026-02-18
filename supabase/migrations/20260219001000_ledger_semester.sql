-- Add semester_id to ledger_entries
alter table public.ledger_entries
  add column if not exists semester_id uuid references public.dorm_semesters(id);

create index if not exists ledger_entries_semester_idx
  on public.ledger_entries (dorm_id, semester_id);

-- Update existing entries based on event/fine semester if possible
update public.ledger_entries le
set semester_id = e.semester_id
from public.events e
where le.event_id = e.id
  and le.semester_id is null;

update public.ledger_entries le
set semester_id = f.semester_id
from public.fines f
where le.fine_id = f.id
  and le.semester_id is null;

-- For entries without event/fine, fallback to active semester at posted_at
update public.ledger_entries le
set semester_id = s.id
from public.dorm_semesters s
where le.semester_id is null
  and le.dorm_id = s.dorm_id
  and le.posted_at >= s.starts_on
  and le.posted_at <= s.ends_on;
