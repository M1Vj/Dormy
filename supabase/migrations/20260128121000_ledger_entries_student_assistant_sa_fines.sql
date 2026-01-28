-- Allow student assistants to read/insert ledger entries for SA fines only.
-- This fixes a mismatch where student_assistant can issue fines, but the ledger sync would fail.

begin;

-- Select: student assistants may view only sa_fines ledger entries.
create policy ledger_entries_select_student_assistant_sa_fines on public.ledger_entries
  for select
  using (
    ledger = 'sa_fines'::ledger_category
    and has_role(dorm_id, array['student_assistant']::app_role[])
  );

-- Insert: student assistants may insert only sa_fines ledger entries.
create policy ledger_entries_insert_student_assistant_sa_fines on public.ledger_entries
  for insert
  with check (
    ledger = 'sa_fines'::ledger_category
    and has_role(dorm_id, array['student_assistant']::app_role[])
  );

commit;
