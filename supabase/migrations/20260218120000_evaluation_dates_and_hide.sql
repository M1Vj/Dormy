-- Migration to add starts_at, ends_at, and hidden to evaluation_cycles
ALTER TABLE evaluation_cycles 
ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- Ensure evaluation_cycles are by default not hidden
UPDATE evaluation_cycles SET hidden = FALSE WHERE hidden IS NULL;
