-- Fix expenses table category check constraint to match ledger_category enum and application code
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('maintenance_fee', 'contributions'));

-- Migrate existing data if any (just in case)
UPDATE public.expenses
SET category = 'maintenance_fee'
WHERE category = 'maintenance';

UPDATE public.expenses
SET category = 'contributions'
WHERE category = 'contribution';
