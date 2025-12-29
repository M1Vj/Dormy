-- Add metadata column
alter table "public"."ledger_entries" add column "metadata" jsonb default '{}'::jsonb;

-- Update RLS policies to be granular per ledger category
-- First, drop existing policies that might conflict or be too broad
drop policy if exists ledger_entries_insert_staff on public.ledger_entries;
drop policy if exists ledger_entries_update_staff on public.ledger_entries;
drop policy if exists ledger_entries_delete_staff on public.ledger_entries;
drop policy if exists ledger_entries_select_staff_or_self on public.ledger_entries;

-- Select Policy: Staff (including SA) + Self
create policy ledger_entries_select_policy on public.ledger_entries
  for select
  using (
    has_role(dorm_id, array['admin', 'treasurer', 'adviser', 'assistant_adviser', 'student_assistant']::app_role[])
    or is_occupant_self(occupant_id)
  );

-- Insert Policy: Granular permissions
create policy ledger_entries_insert_policy on public.ledger_entries
  for insert
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or (
       has_role(dorm_id, array['treasurer']::app_role[])
       and ledger = 'treasurer_events'
    )
    or (
       has_role(dorm_id, array['adviser', 'assistant_adviser']::app_role[])
       and ledger = 'adviser_maintenance'
    )
    or (
       has_role(dorm_id, array['student_assistant']::app_role[])
       and ledger = 'sa_fines'
    )
  );

-- Update Policy: Granular permissions
create policy ledger_entries_update_policy on public.ledger_entries
  for update
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or (
       has_role(dorm_id, array['treasurer']::app_role[])
       and ledger = 'treasurer_events'
    )
    or (
       has_role(dorm_id, array['adviser', 'assistant_adviser']::app_role[])
       and ledger = 'adviser_maintenance'
    )
    or (
       has_role(dorm_id, array['student_assistant']::app_role[])
       and ledger = 'sa_fines'
    )
  )
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or (
       has_role(dorm_id, array['treasurer']::app_role[])
       and ledger = 'treasurer_events'
    )
    or (
       has_role(dorm_id, array['adviser', 'assistant_adviser']::app_role[])
       and ledger = 'adviser_maintenance'
    )
    or (
       has_role(dorm_id, array['student_assistant']::app_role[])
       and ledger = 'sa_fines'
    )
  );

-- Delete Policy: Granular permissions
create policy ledger_entries_delete_policy on public.ledger_entries
  for delete
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or (
       has_role(dorm_id, array['treasurer']::app_role[])
       and ledger = 'treasurer_events'
    )
    or (
       has_role(dorm_id, array['adviser', 'assistant_adviser']::app_role[])
       and ledger = 'adviser_maintenance'
    )
    or (
       has_role(dorm_id, array['student_assistant']::app_role[])
       and ledger = 'sa_fines'
    )
  );
