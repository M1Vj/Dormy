alter table public.expenses
  add column if not exists expense_group_title text,
  add column if not exists contribution_reference_title text,
  add column if not exists vendor_name text,
  add column if not exists official_receipt_no text,
  add column if not exists quantity numeric(12, 2),
  add column if not exists unit_cost_pesos numeric(12, 2),
  add column if not exists payment_method text,
  add column if not exists purchased_by text,
  add column if not exists transparency_notes text;

update public.expenses
set expense_group_title = coalesce(expense_group_title, title)
where expense_group_title is null;

create index if not exists expenses_contribution_group_idx
  on public.expenses (dorm_id, semester_id, category, expense_group_title, purchased_at desc);
