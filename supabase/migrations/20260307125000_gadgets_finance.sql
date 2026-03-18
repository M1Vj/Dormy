-- Add new value to ledger_category ENUM
ALTER TYPE ledger_category ADD VALUE IF NOT EXISTS 'gadgets';
