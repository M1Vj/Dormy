alter table public.ledger_entries
add column metadata jsonb not null default '{}'::jsonb;
