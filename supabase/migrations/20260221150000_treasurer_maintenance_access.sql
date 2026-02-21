-- Add a toggle for treasurer maintenance access to dorms table
ALTER TABLE public.dorms ADD COLUMN IF NOT EXISTS treasurer_maintenance_access boolean NOT NULL DEFAULT false;

-- Add a comment explaining the column
COMMENT ON COLUMN public.dorms.treasurer_maintenance_access IS 'If true, treasurers and officers can access maintenance expenses.';
