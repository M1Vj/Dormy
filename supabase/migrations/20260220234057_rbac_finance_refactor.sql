-- 1. Migrate Roles (Data Only)
-- We will migrate all existing assistant_advisers to advisers.
-- Delete assistant_adviser roles where the user already has the adviser role
DELETE FROM public.dorm_memberships
WHERE role = 'assistant_adviser'::app_role
  AND EXISTS (
    SELECT 1 FROM public.dorm_memberships dm2
    WHERE dm2.dorm_id = dorm_memberships.dorm_id
      AND dm2.user_id = dorm_memberships.user_id
      AND dm2.role = 'adviser'::app_role
  );

-- Update the remaining assistant_adviser roles to adviser
UPDATE public.dorm_memberships
SET role = 'adviser'::app_role
WHERE role = 'assistant_adviser'::app_role;

-- 2. Migrate Ledger Categories
-- Add new values to ledger_category ENUM
ALTER TYPE ledger_category ADD VALUE IF NOT EXISTS 'maintenance_fee';
ALTER TYPE ledger_category ADD VALUE IF NOT EXISTS 'contributions';

-- 3. Modify Expenses Table
-- Add category column to public.expenses (constrained to maintenance or contribution)
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('maintenance', 'contribution'));

-- Update RLS policies for expenses to enforce the new RBAC structure
DROP POLICY IF EXISTS expenses_select_policy ON public.expenses;
DROP POLICY IF EXISTS expenses_insert_policy ON public.expenses;
DROP POLICY IF EXISTS expenses_update_policy ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_policy ON public.expenses;

CREATE POLICY expenses_select_policy ON public.expenses
  FOR SELECT
  USING (
    is_dorm_member(dorm_id)
    AND (
      status = 'approved'
      OR submitted_by = auth.uid()
      OR has_role(dorm_id, array['admin', 'adviser']::app_role[])
      OR (
         has_role(dorm_id, array['treasurer', 'officer']::app_role[]) AND (
           category = 'contribution' OR 
           (category = 'maintenance' AND COALESCE((SELECT attributes->>'treasurer_maintenance_access' FROM public.dorms WHERE id = expenses.dorm_id), 'false') = 'true')
         )
      )
      OR (
        committee_id is not null
        and exists (
          select 1
          from public.committee_members cm
          where cm.committee_id = expenses.committee_id
            and cm.user_id = auth.uid()
            and cm.role in ('head','co-head')
        )
      )
    )
  );

CREATE POLICY expenses_insert_policy ON public.expenses
  FOR INSERT
  WITH CHECK (
    is_dorm_member(dorm_id)
    AND submitted_by = auth.uid()
    AND (
      has_role(dorm_id, array['admin', 'adviser']::app_role[])
      OR (
         has_role(dorm_id, array['treasurer', 'officer']::app_role[]) AND (
           category = 'contribution' OR 
           (category = 'maintenance' AND COALESCE((SELECT attributes->>'treasurer_maintenance_access' FROM public.dorms WHERE id = dorm_id), 'false') = 'true')
         )
      )
      OR (
        committee_id is not null
        and exists (
          select 1
          from public.committees c
          join public.committee_members cm on cm.committee_id = c.id
          where c.id = expenses.committee_id
            and c.dorm_id = expenses.dorm_id
            and cm.user_id = auth.uid()
            and cm.role in ('head','co-head')
        )
      )
    )
  );

CREATE POLICY expenses_update_policy ON public.expenses
  FOR UPDATE
  USING (
    has_role(dorm_id, array['admin', 'adviser']::app_role[])
    OR (
       has_role(dorm_id, array['treasurer']::app_role[]) AND (
         category = 'contribution' OR 
         (category = 'maintenance' AND COALESCE((SELECT attributes->>'treasurer_maintenance_access' FROM public.dorms WHERE id = dorm_id), 'false') = 'true')
       )
    )
  )
  WITH CHECK (
    has_role(dorm_id, array['admin', 'adviser']::app_role[])
    OR (
       has_role(dorm_id, array['treasurer']::app_role[]) AND (
         category = 'contribution' OR 
         (category = 'maintenance' AND COALESCE((SELECT attributes->>'treasurer_maintenance_access' FROM public.dorms WHERE id = dorm_id), 'false') = 'true')
       )
    )
  );

CREATE POLICY expenses_delete_policy ON public.expenses
  FOR DELETE
  USING (
    has_role(dorm_id, array['admin', 'adviser']::app_role[])
    OR (
       has_role(dorm_id, array['treasurer']::app_role[]) AND (
         category = 'contribution' OR 
         (category = 'maintenance' AND COALESCE((SELECT attributes->>'treasurer_maintenance_access' FROM public.dorms WHERE id = dorm_id), 'false') = 'true')
       )
    )
  );
