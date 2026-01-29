do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ledger_entries'
      and column_name = 'metadata'
  ) then
    alter table public.ledger_entries
      add column metadata jsonb not null default '{}'::jsonb;
  end if;
end $$;
