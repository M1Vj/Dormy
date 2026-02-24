-- Fix expenses table category check constraint to match ledger_category enum and application code
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

-- Migrate existing data BEFORE adding the new constraint
UPDATE public.expenses
SET category = 'maintenance_fee'
WHERE category = 'maintenance';

UPDATE public.expenses
SET category = 'contributions'
WHERE category = 'contribution';

-- Now add the constraint (all data should conform)
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('maintenance_fee', 'contributions'));
