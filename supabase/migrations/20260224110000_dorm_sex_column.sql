-- Add sex column to dorms table (male, female, or coed)
ALTER TABLE public.dorms
  ADD COLUMN IF NOT EXISTS sex TEXT NOT NULL DEFAULT 'coed'
  CHECK (sex IN ('male', 'female', 'coed'));
