-- 1. Backfill ledgers
-- Update existing ledger entries to use the new categories
UPDATE public.ledger_entries
SET ledger = 'maintenance_fee'
WHERE ledger = 'adviser_maintenance';

UPDATE public.ledger_entries
SET ledger = 'contributions'
WHERE ledger = 'treasurer_events';

-- 2. Backfill expenses category
-- Default existing expenses to 'contribution'
UPDATE public.expenses
SET category = 'contribution'
WHERE category IS NULL;

-- Set category as NOT NULL
ALTER TABLE public.expenses
ALTER COLUMN category SET NOT NULL;
